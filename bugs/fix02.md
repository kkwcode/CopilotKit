服务端 (Runtime):

// 第 58 行: 推送单个 chunk
await pushArgumentsChunk(e.args);  // e.args 是 string

// Repeater 内部会将每次推送的 string 作为数组的一个元素
// 最终形成 string[] 通过 GraphQL 订阅发送给客户端


// conversion.ts 第 240-248 行
function getPartialArguments(args: string[]) {
  try {
    if (!args.length) return {};
    
    // 将所有 string 拼接后解析为 JSON
    return JSON.parse(untruncateJson(args.join("")));
  } catch (e) {
    return {};
  }
}


AI 生成 → OpenAI Adapter → EventStream
                              ↓
                    RuntimeEvent { args: "{\"na" }
                              ↓
                    RuntimeEvent { args: "me\": \"" }
                              ↓
                    RuntimeEvent { args: "John\"}" }
                              ↓
              copilot.resolver.ts (订阅 EventStream)
                              ↓
          pushArgumentsChunk(e.args) ← 每次推送一个 chunk
                              ↓
                    Repeater 转换为数组
                              ↓
            GraphQL 订阅: arguments: ["{\\"na", "me\\": \\"", "John\\"}"]
                              ↓
                        客户端接收
                              ↓
          args.join("") → "{\"name\": \"John\"}"
                              ↓
          JSON.parse() → { name: "John" }