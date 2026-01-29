import {
  GenerateCopilotResponseMutation,
  MessageInput,
  MessageStatusCode,
} from "../graphql/@generated/graphql";
import {
  ActionExecutionMessage,
  AgentStateMessage,
  Message,
  ResultMessage,
  TextMessage,
  ImageMessage,
} from "./types";

import untruncateJson from "untruncate-json";
import { parseJson } from "@copilotkit/shared";

// 用于追踪每个消息已处理的chunks数量，避免重复拼接
const processedChunksCount = new Map<string, number>();
// 用于累积每个消息的arguments字符串
const argsAccumulator = new Map<string, string>();
// 用于缓存已创建的消息对象，避免重复创建
const messageObjectCache = new Map<string, Message>();

export function filterAgentStateMessages(messages: Message[]): Message[] {
  return messages.filter((message) => !message.isAgentStateMessage());
}

export function convertMessagesToGqlInput(messages: Message[]): MessageInput[] {
  return messages.map((message) => {
    if (message.isTextMessage()) {
      return {
        id: message.id,
        createdAt: message.createdAt,
        textMessage: {
          content: message.content,
          role: message.role as any,
          parentMessageId: message.parentMessageId,
        },
      };
    } else if (message.isActionExecutionMessage()) {
      return {
        id: message.id,
        createdAt: message.createdAt,
        actionExecutionMessage: {
          name: message.name,
          arguments: JSON.stringify(message.arguments),
          parentMessageId: message.parentMessageId,
        },
      };
    } else if (message.isResultMessage()) {
      return {
        id: message.id,
        createdAt: message.createdAt,
        resultMessage: {
          result: message.result,
          actionExecutionId: message.actionExecutionId,
          actionName: message.actionName,
        },
      };
    } else if (message.isAgentStateMessage()) {
      return {
        id: message.id,
        createdAt: message.createdAt,
        agentStateMessage: {
          threadId: message.threadId,
          role: message.role,
          agentName: message.agentName,
          nodeName: message.nodeName,
          runId: message.runId,
          active: message.active,
          running: message.running,
          state: JSON.stringify(message.state),
        },
      };
    } else if (message.isImageMessage()) {
      return {
        id: message.id,
        createdAt: message.createdAt,
        imageMessage: {
          format: message.format,
          bytes: message.bytes,
          role: message.role as any,
          parentMessageId: message.parentMessageId,
        },
      };
    } else {
      throw new Error("Unknown message type");
    }
  });
}

export function filterAdjacentAgentStateMessages(
  messages: GenerateCopilotResponseMutation["generateCopilotResponse"]["messages"],
): GenerateCopilotResponseMutation["generateCopilotResponse"]["messages"] {
  const filteredMessages: GenerateCopilotResponseMutation["generateCopilotResponse"]["messages"] =
    [];

  messages.forEach((message, i) => {
    // keep all other message types
    if (message.__typename !== "AgentStateMessageOutput") {
      filteredMessages.push(message);
    } else {
      const prevAgentStateMessageIndex = filteredMessages.findIndex(
        // TODO: also check runId
        (m) => m.__typename === "AgentStateMessageOutput" && m.agentName === message.agentName,
      );
      if (prevAgentStateMessageIndex === -1) {
        filteredMessages.push(message);
      } else {
        filteredMessages[prevAgentStateMessageIndex] = message;
      }
    }
  });

  return filteredMessages;
}

export function convertGqlOutputToMessages(
  messages: GenerateCopilotResponseMutation["generateCopilotResponse"]["messages"],
): Message[] {
  return messages.map((message) => {
    const msgId = message.id;
    
    // 尝试从缓存获取已存在的消息对象
    const cachedMessage = messageObjectCache.get(msgId);
    
    if (message.__typename === "TextMessageOutput") {
      if (cachedMessage && cachedMessage.isTextMessage()) {
        // 复用对象，只更新内容
        cachedMessage.content = message.content.join("");
        cachedMessage.status = message.status || { code: MessageStatusCode.Pending };
        return cachedMessage;
      }
      
      const newMessage = new TextMessage({
        id: message.id,
        role: message.role,
        content: message.content.join(""),
        parentMessageId: message.parentMessageId,
        createdAt: new Date(),
        status: message.status || { code: MessageStatusCode.Pending },
      });
      messageObjectCache.set(msgId, newMessage);
      return newMessage;
    } else if (message.__typename === "ActionExecutionMessageOutput") {
      if (cachedMessage && cachedMessage.isActionExecutionMessage()) {
        // 复用对象，只更新 arguments（使用优化的增量解析）
        cachedMessage.arguments = getPartialArgumentsOptimized(message.arguments, message.id);
        cachedMessage.status = message.status || { code: MessageStatusCode.Pending };
        return cachedMessage;
      }
      
      const newMessage = new ActionExecutionMessage({
        id: message.id,
        name: message.name,
        arguments: getPartialArgumentsOptimized(message.arguments, message.id),
        parentMessageId: message.parentMessageId,
        createdAt: new Date(),
        status: message.status || { code: MessageStatusCode.Pending },
      });
      messageObjectCache.set(msgId, newMessage);
      return newMessage;
    } else if (message.__typename === "ResultMessageOutput") {
      // ResultMessage 通常不会流式更新，但也缓存以保持一致性
      if (cachedMessage && cachedMessage.isResultMessage()) {
        return cachedMessage;
      }
      
      const newMessage = new ResultMessage({
        id: message.id,
        result: message.result,
        actionExecutionId: message.actionExecutionId,
        actionName: message.actionName,
        createdAt: new Date(),
        status: message.status || { code: MessageStatusCode.Pending },
      });
      messageObjectCache.set(msgId, newMessage);
      return newMessage;
    } else if (message.__typename === "AgentStateMessageOutput") {
      // AgentStateMessage 可能会更新
      if (cachedMessage && cachedMessage.isAgentStateMessage()) {
        Object.assign(cachedMessage, {
          threadId: message.threadId,
          role: message.role,
          agentName: message.agentName,
          nodeName: message.nodeName,
          runId: message.runId,
          active: message.active,
          running: message.running,
          state: parseJson(message.state, {}),
        });
        return cachedMessage;
      }
      
      const newMessage = new AgentStateMessage({
        id: message.id,
        threadId: message.threadId,
        role: message.role,
        agentName: message.agentName,
        nodeName: message.nodeName,
        runId: message.runId,
        active: message.active,
        running: message.running,
        state: parseJson(message.state, {}),
        createdAt: new Date(),
      });
      messageObjectCache.set(msgId, newMessage);
      return newMessage;
    } else if (message.__typename === "ImageMessageOutput") {
      // ImageMessage 通常不会流式更新
      if (cachedMessage && cachedMessage.isImageMessage()) {
        return cachedMessage;
      }
      
      const newMessage = new ImageMessage({
        id: message.id,
        format: message.format,
        bytes: message.bytes,
        role: message.role,
        parentMessageId: message.parentMessageId,
        createdAt: new Date(),
        status: message.status || { code: MessageStatusCode.Pending },
      });
      messageObjectCache.set(msgId, newMessage);
      return newMessage;
    }

    throw new Error("Unknown message type");
  });
}

export function loadMessagesFromJsonRepresentation(json: any[]): Message[] {
  const result: Message[] = [];
  for (const item of json) {
    if ("content" in item) {
      result.push(
        new TextMessage({
          id: item.id,
          role: item.role,
          content: item.content,
          parentMessageId: item.parentMessageId,
          createdAt: item.createdAt || new Date(),
          status: item.status || { code: MessageStatusCode.Success },
        }),
      );
    } else if ("arguments" in item) {
      result.push(
        new ActionExecutionMessage({
          id: item.id,
          name: item.name,
          arguments: item.arguments,
          parentMessageId: item.parentMessageId,
          createdAt: item.createdAt || new Date(),
          status: item.status || { code: MessageStatusCode.Success },
        }),
      );
    } else if ("result" in item) {
      result.push(
        new ResultMessage({
          id: item.id,
          result: item.result,
          actionExecutionId: item.actionExecutionId,
          actionName: item.actionName,
          createdAt: item.createdAt || new Date(),
          status: item.status || { code: MessageStatusCode.Success },
        }),
      );
    } else if ("state" in item) {
      result.push(
        new AgentStateMessage({
          id: item.id,
          threadId: item.threadId,
          role: item.role,
          agentName: item.agentName,
          nodeName: item.nodeName,
          runId: item.runId,
          active: item.active,
          running: item.running,
          state: item.state,
          createdAt: item.createdAt || new Date(),
        }),
      );
    } else if ("format" in item && "bytes" in item) {
      result.push(
        new ImageMessage({
          id: item.id,
          format: item.format,
          bytes: item.bytes,
          role: item.role,
          parentMessageId: item.parentMessageId,
          createdAt: item.createdAt || new Date(),
          status: item.status || { code: MessageStatusCode.Success },
        }),
      );
    }
  }
  return result;
}

/**
 * 优化版本：增量处理arguments，避免每次重复拼接所有chunks
 * 
 * @param args - GraphQL @stream 返回的累积字符串数组
 * @param messageId - 消息ID，用于追踪处理进度
 * @returns 解析后的arguments对象
 */
function getPartialArgumentsOptimized(args: string[], messageId: string) {
  try {
    if (!args.length) return {};
    
    // 获取已处理的chunks数量
    const prevCount = processedChunksCount.get(messageId) || 0;
    
    // 只处理新增的chunks
    const newChunks = args.slice(prevCount);
    
    if (newChunks.length === 0) {
      // 没有新数据，返回已缓存的结果
      const cached = argsAccumulator.get(messageId);
      if (cached) {
        try {
          return JSON.parse(untruncateJson(cached));
        } catch (e) {
          return {};
        }
      }
      return {};
    }
    
    // 更新已处理的chunks数量
    processedChunksCount.set(messageId, args.length);
    
    // 只拼接新增的chunks（而不是重新拼接所有历史chunks）
    const incrementalString = newChunks.join("");
    
    // 累积到总字符串
    const accumulated = (argsAccumulator.get(messageId) || "") + incrementalString;
    argsAccumulator.set(messageId, accumulated);
    
    // 尝试解析JSON
    return JSON.parse(untruncateJson(accumulated));
  } catch (e) {
    return {};
  }
}

/**
 * 清理已完成消息的缓存，避免内存泄漏
 */
export function cleanupMessageCache(messageId: string) {
  processedChunksCount.delete(messageId);
  argsAccumulator.delete(messageId);
  messageObjectCache.delete(messageId);
}

/**
 * 原始版本：保留用于兼容性
 * @deprecated 使用 getPartialArgumentsOptimized 替代
 */
function getPartialArguments(args: string[]) {
  try {
    if (!args.length) return {};

    return JSON.parse(untruncateJson(args.join("")));
  } catch (e) {
    return {};
  }
}
