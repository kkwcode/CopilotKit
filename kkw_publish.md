
发布CopilotKit/packages下的包， 使用 1.9.1版本，注意下面几点：
1. 不更改package.json中包名，使用npm alias的方式将相关包发到@tencent/copilotkit-xxx中
2. 注意这种问题
"@copilotkit/shared@workspace:*" is in the dependencies but no package named "@copilotkit/shared" is present in the workspace 
3. 如果要更改package.json依赖，使用npm:@tencent/copilotkit-xxx这种形式