# Pi SDK 0.73 反幻觉小抄

## AgentSession API

```ts
const session = await createAgentSession({ ... })

// 核心方法
session.prompt(message: string)        // 发送提示
session.followUp(message: string)      // 追加消息（保持上下文）
session.steer(message: string)         // 引导（注入系统级约束）
session.abort()                        // 中止当前执行
session.compact()                      // 压缩上下文
session.setModel(model)                // 切换模型
session.setThinkingLevel(level)        // 设置思考级别: 'off' | 'low' | 'high'
session.navigateTree(nodeId: string)   // 会话树导航
session.dispose()                      // ⚠️ 必须显式调用释放资源
session.subscribe(callback)            // 订阅事件
```

## SessionManager
```ts
const sm = SessionManager.create(workspaceDir, sessionDir)
// ❌ 不要使用 new SessionManager(...)
sm.getTree()             // 返回会话树
sm.getLeafId()           // 当前叶节点 id
sm.branch(parentId)      // 分叉新分支
```

## defineTool + TypeBox

```ts
import { Type } from "@mariozechner/pi-ai"  // ⚠️ 不要从 @sinclair/typebox 直接导入

const MyParams = Type.Object({
  path: Type.String({ description: "File path" }),
  content: Type.String({ description: "Content to write" }),
})
```

## 自定义 Provider 注册（OpenAI-compatible）

```ts
modelRegistry.registerProvider("my-provider", {
  name: "my-provider",
  baseUrl: "https://api.example.com/v1",
  api: "openai-completions",  // DeepSeek 等用这个
  models: [{
    id: "model-id",
    name: "Display Name",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 64_000,
    maxTokens: 8192,
  }],
})
```

## 事件名清单（Pi 0.73 实际 emit）

| Pi 事件 | 前端事件名 | 说明 |
|---------|-----------|------|
| `agent_end` | `done` | agent 完成 |
| `message_update` → `delta.text_delta` | `text_delta` | token 级文本 |
| `message_update` → `delta.thinking_delta` | `thinking_delta` | token 级思考 |
| `tool_execution_start` | `tool_start` | 工具开始 |
| `tool_execution_update` | `tool_update` | 工具进度 |
| `tool_execution_end` | `tool_end` | 工具结束 |

## ResourceLoader 规则

```ts
new DefaultResourceLoader({
  noExtensions: true,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
  // 不要传任何 extension/skill 目录
})
```
