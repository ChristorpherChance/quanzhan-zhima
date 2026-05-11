# 全栈智码 v2.0 · Fix-Pack #4（接力修复指令 K0–K10 for Claude Code）

<aside>
📌

本文是在 [全栈智码 v2.0 · Fix-Pack #3（接力修复指令 J0–J9 for Claude Code）](https://www.notion.so/v2-0-Fix-Pack-3-J0-J9-for-Claude-Code-84295582ed7a46de97b421c9f3506f24?pvs=21) 之后的**第四轮接力修复包**。Claude Code 已完成 J0–J9 大部分工作（仓库 `ChristorpherChance/quanzhan-zhima` master HEAD），但实跑 + 逐文件 raw 复核暴露 **1 个致命未修 + 9 类阻塞性体验问题**。本文按 K0–K10 任务卡形式给出可直接执行的指令。

**使用方式**：把本页整体粘贴给 Claude Code，按 §11 顺序执行；§10 红线必须遵守；每张卡一个 PR。

</aside>

---

## 0. 实跑反馈 → 根因定位（基于 master HEAD 逐文件 raw 复核）

### 0.1 J0–J9 落地审计

| 任务卡 | 状态 | 证据 / 缺口 |
| --- | --- | --- |
| J1 设计图渲染 | ✅ 大部分到位 | mermaid 11.14、react-markdown、UiPrototypeViewer 都已就位 |
| **J2 UI 方法论** | ⚠️ 半截 | `selfCheckUi` 已写但**没有被 generate() 调用**，永远不触发自补完 |
| J3 Dev 上下文+预算 | ✅ | `buildDevSystemPrompt` 注入 PRD + 5 设计产物 |
| J4 真编译真运行 | 🟡 | install + build 自检已加，但 sandbox 框架自适应未独立验证 |
| J5 Review 闭环 | ✅ | eslint platform fallback、audit 兜底、`fixReview` 优先级 bug 修了 |
| **J6 Agent 注册表** | 🟡 缺 Memory/Skill | 只建了 `AgentConfig` 一张表；原方案的 `AgentMemory` / `AgentSkill` 三表合一被砍成纯参数表 |
| **J7 Agent 设置面板** | ❌ 只读 | `/settings/agents` 只渲染卡片，没有 prompt 编辑、滑杆调温、dry-run、memory/skill 管理 |
| **J8.2 END_MARKER_RE** | ❌ **致命未修** | `design-agent.ts` 仍是 `const END_MARKER_RE = / /`（一个空格的正则），任何含空格的文本都"命中 END 标记" → 自动续写**永远不触发** → UI 截断不可恢复（用户问题 5 的根因之一） |
| J8.7 CodeBrowser 沙箱直链 | 未核对 | — |

### 0.2 用户实跑暴露的 9 个新问题 → 根因（带文件证据）

| # | 用户反馈 | 根因 | 任务卡 |
| --- | --- | --- | --- |
| 1 | 需求文档缺少可以编辑的地方 | `app/projects/[id]/requirement/page.tsx` 只有"一键生成 / 需求澄清 / 完成需求阶段"三按钮，PRD 用 `<ArtifactViewer>` 只读渲染。后端 `requirement-agent.edit()` 已实现，前端没接 | **K2** |
| 2 | 设置页展示不全 + Agent 设置入口找不到 | `/settings` 页底部确有"管理 Agent 设置"链接，但全局 header 没有"设置"入口；`/settings/agents` 是只读卡片墙，无编辑能力 | **K1** |
| 3 | 会话没起作用，对话框需重做 | `ChatDock` 只是 `AgentTabs` 的外壳；`AgentTabs` 不持久化、各 agent 各自一份本地消息、不绑定 Pi session 事件流；用户消息 ↔ agent 行为完全脱钩 | **K3** |
| 4a | 开发阶段提示"阶段条件未满足" | `gates.ts G2` 要求 5 个设计子产物**全部 locked**。但 `design-agent` 从来不 lock artifact（只 upsert version+1）；PRD 也不 auto-lock。所以 G2 永远满足不了 | **K9** |
| 4b | 开发阶段代码质量差 | `buildDevSystemPrompt` 只 7 条红线，没有命名/错误处理/校验/安全/性能/注释/测试/Git commit 规范 | **K8** |
| 5 | UI 截断、空白错位 | 三因叠加：(a) `END_MARKER_RE = / /` 续写永不触发；(b) `selfCheckUi` 没在 generate 中被调用；(c) `UiPrototypeViewer` 用 `srcDoc={整个 HTML}` 喂 iframe，含多 `<!-- PAGE -->` 时全塞进一个 iframe 必然错位 | **K7** |
| 6 | "好的，作为设计 Agent..."这类话出现在文档里 | 设计/需求 system prompt 没明确禁 meta-talk；流式输出后没有 post-process 清洗 | **K7** |
| 7 | `deepseek: 400 Invalid max_tokens value, range [1, 393216]` | `openai-compat.ts` 直接 `req.maxTokens ?? 4096` 透传 deepseek。当 AgentConfig 被改大或写入非法值（NaN / 负数 / >393216）就 400。**没有 per-provider 钳制** | **K4** |
| 8 | 接入本地 ollama 千问 | `config/models.ts` 没有 ollama provider；runtime-config 不识别本地 baseURL；前端 settings 没有"添加本地模型"入口 | **K5** |
| 9 | 每个 agent 都集成 Pi | 仅 `dev-agent`  • `review-agent.fixReview` 走 Pi；`requirement-agent` / `design-agent` 仍用裸 `chat`/`stream` | **K6** |

### 0.3 优先级

- **P0（演示阻塞）**：K1 设置入口 / K2 PRD 编辑 / K4 max_tokens 钳制 / K7 设计三件套修复 / K9 自动锁定
- **P1（决定平台调性）**：K3 ChatDock 重构 / K6 全 Agent Pi 化 / K8 Dev Playbook
- **P2（扩展性）**：K5 Ollama 本地模型 / K10 收尾验收

---

## K0 · 全局约定（贯穿所有 PR）

1. 所有新增 React 组件放 `src/components/workbench/` 或 `src/components/settings/`；server only 代码放 `src/lib/`；agent 行为放 `src/agents/`。
2. 每个 PR commit 前缀 `fix(K<n>): ...` 或 `feat(K<n>): ...`，每张卡一个 PR。
3. PR 合并前必须跑 `pnpm typecheck && pnpm build && pnpm smoke:llm && pnpm smoke:pi` 全过；P0 卡同时跑 `pnpm smoke:e2e`。
4. 任何 prompt 修改**只动数据文件**（K6 之后改 `AgentConfig` 表 / `seed-agents.ts` 或 DB），**不动 agent 业务逻辑代码**中的硬编码 prompt。
5. 不要降级 SDK；Pi 0.73 行为如不符预期，停下来加 `BLOCKED:` 前缀提交，不擅自换 API。
6. 所有 LLM 调用必须经过 `gateway.chat / gateway.stream`，禁止直接 `new OpenAI()`。
7. 凡是涉及对外 API 错误码、文案、字段名变更的 PR，必须同步更新 `README.md` 与 `pnpm smoke:e2e`。

---

## K1 · 设置入口可达 + Agent 编辑面板（P0 ⭐）

**目标**：把 Agent 注册表从「列表浏览」升级到「Notion-native 级编辑面板」，并把入口暴露在全局可达位置。

### K1.1 全局 Header 加「设置」入口

改 `src/app/layout.tsx`（或对应顶部 nav 组件）：

```tsx
// 顶部右上角追加
<Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
  <Settings className="h-4 w-4 inline mr-1" /> 设置
</Link>
```

所有项目工作台页（StageNav 顶栏）右侧也加同样的入口。

### K1.2 `/settings` 页改成左侧菜单 + 右侧分栏

左菜单 5 项：`LLM 提供商` / `Agent 配置` / `HITL 模式` / `沙箱 & 工具` / `数据导出`。每项是子路由 `/settings/llm` `/settings/agents` 等。

现有 `src/app/settings/page.tsx` 三块（LLM / HITL / Pi 状态）拆到对应子页；首页给一个引导卡片 + 健康状态。所有子页统一 `Container` + 顶部面包屑，避免一屏塞不下。

### K1.3 `/settings/agents/[key]` Agent 编辑详情页（核心）

新建 `src/app/settings/agents/[key]/page.tsx` + `src/app/api/settings/agents/[key]/route.ts`。

**五个 Tab**：

1. **基础参数**：`label / description / modelId / provider / temperature / maxTokens / timeoutMs / enabled`，全部带表单校验（zod）。`modelId` 与 `provider` 是联动 `<Select>`，从 `/api/settings/llm-providers` 读可用列表。
2. **System Prompt**：`@monaco-editor/react`（已在 deps 中），高度 480px，markdown 模式，左侧实时字数 + token 估算（用 `tiktoken` 简易估算：`Math.ceil(text.length / 2.5)`）。顶部「重置为默认」按钮回退到 `DEFAULTS[key].systemPrompt`。
3. **Memory 库**：表格 `kind / title / content / weight / updatedAt`，行内编辑 + 拖拽排序权重。新增/删除走 `POST/DELETE /api/agents/[key]/memory`。
4. **Skill 库**：手风琴卡片 `name / instruction / examplesJson`，JSON 编辑器。
5. **Dry-run**：右上「试运行」按钮 → 弹窗输入 mock 变量 → 调 `POST /api/agents/[key]/dry-run` → 显示渲染后的最终 system prompt + 估算 token + LLM 实际响应（task: clarify, 不写盘）。

### K1.4 数据模型补全（J6 砍掉的两张表）

改 `prisma/schema.prisma`，**追加**两张表（不要动 `AgentConfig`）：

```
model AgentConfig {
  // ... 已有字段保留 ...
  systemPrompt String?  // 新增：可选覆盖默认 system prompt
}

model AgentMemory {
  id        String   @id @default(cuid())
  agentKey  String
  projectId String?  // null 表示全局记忆
  kind      String   // fact | preference | skill_note | error_lesson
  title     String
  content   String
  weight    Float    @default(1.0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([agentKey, projectId])
}

model AgentSkill {
  id           String   @id @default(cuid())
  agentKey     String
  name         String
  instruction  String
  examplesJson String   @default("[]")
  isEnabled    Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([agentKey])
}
```

执行 `pnpm prisma migrate dev -n add-agent-memory-skill && pnpm prisma generate`。

### K1.5 `loadAgentConfig` 整合 Memory + Skill 注入

改 `src/agents/registry.ts`，**保持向后兼容**：

```tsx
export async function buildSystemPrompt(
  key: string,
  projectId: string,
  baseSystem: string,
): Promise<string> {
  const { prisma } = await import("@/lib/db/prisma")
  const [cfg, mems, skills] = await Promise.all([
    prisma.agentConfig.findUnique({ where: { key } }).catch(() => null),
    prisma.agentMemory.findMany({
      where: { agentKey: key, OR: [{ projectId }, { projectId: null }] },
      orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
      take: 20,
    }).catch(() => []),
    prisma.agentSkill.findMany({ where: { agentKey: key, isEnabled: true } }).catch(() => []),
  ])
  const sysOverride = cfg?.systemPrompt?.trim() || baseSystem
  const memBlock = mems.length
    ? `\n\n# 记忆库（按权重）\n${mems.map(m => `- [${m.kind}] ${m.title}: ${m.content}`).join("\n")}`
    : ""
  const skillBlock = skills.length
    ? `\n\n# 技能库\n${skills.map(s => `## ${s.name}\n${s.instruction}\n示例:\n${s.examplesJson}`).join("\n\n")}`
    : ""
  return sysOverride + memBlock + skillBlock
}
```

所有 agent（requirement / design / dev / review）的 system prompt 构造点统一改成 `await buildSystemPrompt(key, projectId, BASE_PROMPT)`。

### K1.6 经验回写（自动登记）

在 4 个 agent 完成时追加：

```tsx
import { prisma } from "@/lib/db/prisma"
await prisma.agentMemory.create({
  data: {
    agentKey: "design.detail",
    projectId: ctx.projectId,
    kind: "skill_note",
    title: `从 PRD v${prdVersion} 抽取的字段`,
    content: extractedFieldsList.slice(0, 1000),
    weight: 0.8,
  },
}).catch(() => {})
```

出错路径 `kind="error_lesson"`，下次构造 prompt 时优先权重更高。

**验收**：

- 顶部 nav 任意页面都能 1 click 到 `/settings`；
- 在 `/settings/agents/design` 编辑 systemPrompt 并保存 → 立即生效（下一次设计生成读到新版）；
- 添加一条 memory `用户偏好深色主题` → design.ui 下次产出原型默认深色；
- 试运行显示完整 prompt 与估算 token。

---

## K2 · PRD 可编辑（P0 ⭐）

**目标**：在 `/projects/[id]/requirement` 页面把 PRD 从「只读 Markdown 渲染」升级为「双栏：Markdown 编辑 + 实时预览 + AI 辅助编辑」。

### K2.1 改 `app/projects/[id]/requirement/page.tsx` 中部布局

替换现有 `<ArtifactViewer source={prd} />` 部分：

```tsx
import { PrdEditor } from "@/components/workbench/PrdEditor"
// ...
<PrdEditor
  projectId={pid}
  initialContent={prd ?? ""}
  locked={prdLocked}
  onSaved={() => reloadPrd()}
  onAiEdit={(instruction, section) => handleAiEdit(instruction, section)}
/>
```

### K2.2 新建 `src/components/workbench/PrdEditor.tsx`

要点：

- 双栏布局：左 Monaco Editor（markdown 模式，自动保存防抖 1.5s）+ 右实时预览（`<MarkdownView>`，已存在）；
- 顶部工具栏：`保存 / AI 辅助编辑 / 还原 / 锁定 PRD（locked=true）`；
- "AI 辅助编辑"按钮 → 弹窗 textarea 输入指令（如"补充非功能需求"，可选 section 下拉），提交后调 `POST /api/projects/[id]/requirement/edit`，流式回显增量到右侧预览，完成后给「应用此版本 / 继续编辑」二选一；
- locked=true 时编辑器只读，按钮变灰，Banner 显示 "PRD 已锁定，请先解锁"。

### K2.3 后端 `POST /api/projects/[id]/requirement/save`

新建路由 — 接收 `{ content: string }` → 写到 `paths.prd(projectId)` → upsert artifact `prd` version+1（不改 locked 状态）。前端编辑后自动调此路由。

### K2.4 PRD「锁定」按钮

在 PrdEditor 顶栏加 `<Button onClick={onLock}>锁定 PRD</Button>`，调 `POST /api/projects/[id]/artifacts/prd/lock` —— 后端做的事：

```tsx
await prisma.artifact.update({ where: { id }, data: { locked: true, lockedAt: new Date() } })
```

锁定后才允许走 `/stages/G1/complete`。这一步配合 K9 一起把全平台的"锁定"语义打通。

**验收**：

- 用户可在编辑器内直接改 PRD 文字 → 1.5s 后自动落盘；
- 点 AI 辅助编辑输入"把所有 AC 改成 Given/When/Then 形式" → 整个 PRD 流式重写；
- 点「锁定 PRD」→ 编辑器变灰 → 完成需求阶段按钮可点。

---

## K3 · ChatDock & 对话双向重构（P1 ⭐）

**目标**：把 ChatDock 从「按钮触发的流式回显面板」升级为「双向、多轮、跨 agent、可回看的工作台对话」。

### K3.1 数据模型：把 Conversation 用起来

`prisma/schema.prisma` 已有 `Conversation` 表（`projectId / agentType / messagesJson`），但当前完全没用。补全：

```
model ChatMessage {
  id             String   @id @default(cuid())
  conversationId String
  role           String   // user | assistant | system | tool
  content        String
  meta           String?  // tool_call info / job_id
  createdAt      DateTime @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@index([conversationId, createdAt])
}
```

并给 `Conversation` 加 `messages ChatMessage[]` 反向关系。`messagesJson` 字段保留兼容旧数据，新数据全部走 `ChatMessage`。

### K3.2 后端统一 SSE 通道 `GET /api/projects/[id]/chat/stream?agentType=xxx`

- 多个 agent 共用一个 SSE 长连接，事件类型：`{ type: "user_msg" | "assistant_delta" | "assistant_done" | "tool_start" | "tool_end" | "error", agentType, payload }`；
- `POST /api/projects/[id]/chat/send` 接收 `{ agentType, content }`，写入 ChatMessage(role=user)，根据 agentType 派发：
    - `requirement` → 调 `requirement-agent.clarify/draft/edit` 之一（按上下文判断）；
    - `design` → 调 `design-agent.generate/edit`；
    - `dev` → 调 `dev-agent.runDev`（instruction 字段）；
    - `review` → 调 `review-agent.runReview/fixReview`；
- 流式过程中每个 delta 也写入 ChatMessage(role=assistant) 的 buffer，`assistant_done` 时落盘。

### K3.3 前端 `ChatDock.tsx` 重构

- 顶部 Tab：`需求 / 设计 / 开发 / 审查 / 全局`；切 Tab 切 conversationId；
- 中部消息列表：仿照 ChatGPT/Claude 样式 — 用户气泡右、agent 气泡左、tool 调用折叠成"⚙️ 调用 workspace_write 写入 src/app/page.tsx"；
- 底部输入框：单行 Enter 发送 / Shift+Enter 换行 / `/` 快捷指令面板（`/clarify` `/draft` `/lock` `/regenerate-design summary`）；
- 左侧 12px 的"折叠"竖条改成抽屉手柄 ≥ 32px 宽，touch-friendly；
- 状态条：底部固定一行 `🟢 设计 agent 思考中... | tokens 1.2k/8k | 已用 0.0023 美元`。

### K3.4 跨 agent 引用

`@需求` `@设计.api` `@代码` 这类 mention 在输入框中可触发选择器，发送时把对应 artifact 内容前置注入到 user 消息（或仅注入 path 引用），让 agent 之间可以互相引用。

### K3.5 历史回看 + 持久化

刷新页面后从 `GET /api/projects/[id]/chat/history?agentType=xxx&limit=50` 拉历史；任何会话从未中断（即使刷新、关掉浏览器）。

**验收**：

- 在「设计」Tab 输入"把 design.api 的 /users 接口改成 /accounts"→ 真的调起 design-agent.edit 重写 [api.md](http://api.md)，且 design-api artifact 版本号 +1；
- 刷新页面后会话内容仍在；
- Cmd+J 折叠/展开正常；输入框 `/` 触发指令面板。

---

## K4 · LLM Gateway 健壮性 + max_tokens 钳制（P0 ⭐）

**目标**：彻底消除 `400 Invalid max_tokens` 这类参数级 4xx 错误，并补全 per-provider 兼容矩阵。

### K4.1 在 `src/config/models.ts` 给每个 provider 加 `maxTokensRange`

```tsx
export interface LlmProviderCfg {
  // ... 已有字段 ...
  maxTokensRange?: { min: number; max: number; default: number }
}

export const LLM_CONFIG: Record<LlmProviderKey, LlmProviderCfg> = {
  deepseek: { /* ... */ maxTokens: 8192,
    maxTokensRange: { min: 1, max: 8192, default: 4096 } },
  opus:    { /* ... */ maxTokensRange: { min: 1, max: 8192, default: 4096 } },
  kimi:    { /* ... */ maxTokensRange: { min: 1, max: 32768, default: 4096 } },
  xiaomi:  { /* ... */ maxTokensRange: { min: 1, max: 8192, default: 4096 } },
  gpt:     { /* ... */ maxTokensRange: { min: 1, max: 16384, default: 4096 } },
  // K5 新增：
  ollama:  { /* ... */ maxTokensRange: { min: 1, max: 32768, default: 4096 } },
}
```

### K4.2 在 `openai-compat.ts` 与 `anthropic.ts` 钳制

```tsx
function clampMaxTokens(req: LlmRequest, cfg: LlmProviderCfg): number {
  const range = cfg.maxTokensRange ?? { min: 1, max: 4096, default: 4096 }
  const raw = req.maxTokens ?? range.default
  if (!Number.isFinite(raw) || raw <= 0) return range.default
  return Math.min(Math.max(Math.floor(raw), range.min), range.max)
}

// chat() 与 stream() 内：
const maxTokens = clampMaxTokens(req, cfg)
```

注意 `chat()` 与 `stream()` 当前签名是 `(req, opts)`，opts 是 `{ baseURL, model, envKey }`。把 cfg 透传进来：改 gateway `callChat / callStream` 把 `cfg` 一并传到 provider 函数。

### K4.3 AgentConfig 写入校验

`POST /api/settings/agents/[key]` 路由内：保存前用 zod 校验：

```tsx
const Schema = z.object({
  modelId: z.string().min(1),
  provider: z.string().min(1),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(1).max(393216),
  timeoutMs: z.number().int().min(10_000).max(60 * 60_000),
})
```

非法值直接 400 + 友好错误。

### K4.4 LLM 错误分类与展示

`gateway.ts` 抛出的 `AppError("E_GATE_CLOSED", "所有 LLM 提供商均不可用: ...")` 需要分类：

- 4xx 参数错误 → 错误码 `E_LLM_BAD_REQUEST`，前端展示「请求参数非法（max_tokens 等），请到设置页检查」；
- 401/403 → `E_LLM_AUTH`，提示「API Key 无效，请到设置 → LLM 提供商更新」；
- 429/5xx → `E_LLM_RATE_LIMIT` / `E_LLM_UPSTREAM`；
- 网络 → `E_LLM_NETWORK`。

前端 toast 用 `description` 字段展示分类描述，便于用户自助排查。

**验收**：

- 故意把 dev AgentConfig.maxTokens 改成 `999999` → API 校验直接 400；
- 把 deepseek API Key 删掉 → `E_LLM_AUTH` 友好提示；
- 复跑用户提到的审查报错 → 不再出现 400 max_tokens（因被钳制到 4096）。

---

## K5 · 接入 Ollama 本地模型（千问 / Llama / DeepSeek 蒸馏版）（P2）

**目标**：让用户在断网或 API Key 失效时仍可跑全流程；Ollama OpenAI-compatible 端点已成熟。

### K5.1 `src/config/models.ts` 增 ollama 配置位

```tsx
export type LlmProviderKey = "deepseek" | "opus" | "kimi" | "xiaomi" | "gpt" | "ollama"

ollama: {
  provider: "openai-compatible",
  model: "qwen2.5:14b",                       // 默认值，UI 可改
  baseURL: "http://localhost:11434/v1",
  envKey: "OLLAMA_API_KEY",                    // ollama 不强制 key，传任意字符串
  enabled: false,
  maxTokens: 32768,
  maxTokensRange: { min: 1, max: 32768, default: 4096 },
  notes: "本地优先 / 千问 / 完全免费",
},
```

`FALLBACK_ORDER` 末尾追加 `"ollama"`，作为最终兜底。

### K5.2 `.env.example` 与 README 增加说明

```
# 本地 Ollama（可选）
OLLAMA_BASE_URL="http://localhost:11434/v1"
OLLAMA_API_KEY="ollama"   # 任意非空字符串
OLLAMA_DEFAULT_MODEL="qwen2.5:14b"
```

`runtime-config.ts` 让 ollama 的 baseURL 与 model 也可被 `paths.settings` 覆盖。

### K5.3 设置页支持「测试 Ollama 连接」+ 模型列表拉取

新建 `GET /api/settings/llm/ollama/models`：

```tsx
const r = await fetch(`${baseURL}/models`, { headers: { Authorization: `Bearer ${key}` } })
return { models: (await r.json()).data?.map((m: any) => m.id) ?? [] }
```

前端在 ollama 的 model 字段渲染 `<Select>`，选项来自 `/api/settings/llm/ollama/models`。

### K5.4 Pi SDK 接入 ollama

改 `src/lib/pi/registry.ts`，给 Pi 的 `modelRegistry` 注册 ollama provider（pi-coding-agent 0.73 支持自定义 OpenAI-compatible provider）。`PROVIDER_PI_NAME` / `PROVIDER_LLM_KEY` 加映射 `ollama: "ollama"`。

**验收**：

- 本地起 ollama + `ollama pull qwen2.5:14b` → 设置页 Ollama 卡选模型 → 测试连接 ✓；
- 把 deepseek 关掉 + 启用 ollama → 跑需求澄清能正常出问题；
- Pi dev session 也能用 ollama 跑（速度慢但能跑通）。

---

## K6 · 全部 Agent 集成 Pi（P1 ⭐）

**目标**：让需求、设计、开发、审查 4 个 agent 都通过 Pi `createAgentSession` 跑，从而：(a) 统一工具集（workspace_write/read/exec、[web.search](http://web.search)）；(b) 自动多轮、自适应思考；(c) 共享一套 session 持久化。

### K6.1 设计选型

`requirement-agent` / `design-agent` 之前用 `gateway.stream` 是因为它们生成的是文档而不是代码。Pi 也能写文档：用 `workspace_write` 工具直接写 markdown 文件，自然支持多轮迭代。

但需求澄清的输出是 JSON 数组（问题列表），不需要 Pi。**折中方案**：

- `requirement.clarify` → 仍用 `gateway.chat`（一次性 JSON 输出，无需工具）；
- `requirement.draft` / `requirement.edit` → 切到 Pi（写 [PRD.md](http://PRD.md) 用 workspace_write，可多轮调整）；
- `design.generate` / `design.edit` → 全部切到 Pi（写 5 份 design 文件用 workspace_write，前置产物用 workspace_read 读取）；
- `dev` → 已是 Pi；
- `review.runReview` → 仍用 LLM 总结（chat），但 `review.fixReview` 已是 Pi。

### K6.2 改 `design-agent.ts` 切 Pi

```tsx
import { runPiSession } from "@/lib/pi/session"
import { paths } from "@/config/paths"
import { buildSystemPrompt } from "@/agents/registry"

export async function generate(ctx: AgentRunCtx, subtype: string): Promise<string> {
  const workspaceDir = paths.designWorkspace(ctx.projectId)  // 新建：设计专用 workspace（独立于代码）
  await fs.mkdir(workspaceDir, { recursive: true })
  // 把 PRD + 前置子产物 cp 到 workspaceDir，方便 Pi workspace_read
  await prepareDesignWorkspace(ctx.projectId, workspaceDir, subtype)

  const baseSystem = DESIGN_SYSTEM(subtype)
  const systemPrompt = await buildSystemPrompt(`design.${subtype}`, ctx.projectId, baseSystem)
  const userPrompt = `请基于 workspace 中的 prd.md 与已有设计文件，写出 ${subtype}.${subtype === "ui" ? "html" : "md"}。完成后输出末尾 <!-- END_${subtype.toUpperCase()} -->。`

  const r = await runPiSession({
    projectId: ctx.projectId,
    workspaceDir,
    prompt: userPrompt,
    systemPromptOverride: systemPrompt,
    timeoutMs: 15 * 60_000,
    onEvent: (e) => { /* 转发到 ctx.send 同 dev-agent */ },
  })
  if (!r.ok) throw new Error(`design.${subtype} Pi 失败: ${r.error}`)

  const outputPath = paths.design(ctx.projectId) + `/${subtype}.${subtype === "ui" ? "html" : "md"}`
  await fs.copyFile(`${workspaceDir}/${subtype}.${subtype === "ui" ? "html" : "md"}`, outputPath)
  const content = await fs.readFile(outputPath, "utf-8")

  // K7 自检 + post-process（见下）
  const cleaned = stripMetaTalk(content)
  if (cleaned !== content) await fs.writeFile(outputPath, cleaned, "utf-8")
  if (subtype === "ui") {
    const { score, missing } = await selfCheckUi(cleaned)
    if (score < 70) {
      ctx.send("log", { line: `UI 自检 ${score}/100，自动补完，缺：${missing.join(", ")}` })
      await piSessionPool.followUp(ctx.projectId, `UI 原型评分 ${score}/100，缺：${missing.join(", ")}。请补完。`)
    }
  }
  await upsertArtifact(ctx.projectId, `design-${subtype}`, cleaned, outputPath, { subtype, score: subtype === "ui" ? (await selfCheckUi(cleaned)).score : null })
  return cleaned
}
```

### K6.3 改 `requirement-agent.draft / edit` 切 Pi（同上模式）

workspace 用 `paths.requirementWorkspace(projectId)`，Pi 写 `prd.md`，完成后 cp 到 `paths.prd(projectId)`。

### K6.4 4 个 agent 共用一个 Pi session 池

`piSessionPool`（`src/lib/pi/session-manager.ts`）目前已存在但只服务 dev。扩展：按 `(projectId, agentType)` 维度持有 session，agentType 切换时 dispose 上一会话；K3 的 ChatDock 跨 agent 多轮也走这个池。

**验收**：

- 跑设计阶段时，`runs/[projectId]/design-workspace/` 目录下能看到 Pi 通过 workspace_write 写出的 5 个文件；
- 在 Settings/agents 给 `design.ui` 加一条 memory「使用 shadcn-ui Drawer 组件」→ 下次设计原型确实出现 Drawer；
- requirement.draft 走 Pi 后 PRD 字数与质量不下降。

---

## K7 · 设计三件套修复：END marker / selfCheck / Viewer 错位 / 元话清洗（P0 ⭐）

**根因复盘**：用户问题 5（截断）、6（垃圾开场白）核心都在设计阶段。

### K7.1 修 `END_MARKER_RE`（J8.2 死灰复燃）

`src/agents/design-agent.ts` 第 ~67 行：

```tsx
// 错误：const END_MARKER_RE = / /
const END_MARKER_RE = /<!--\s*END_(?:SUMMARY|DETAIL|API|DB|UI)\s*-->/i
```

并把 `selfCheckUi` 内部的 `["页面分隔注释", / /]` 同步改成 `["页面分隔注释", /<!--\s*PAGE:\s*\w+\s*-->/]`、`["END 标记", /<!--\s*END_UI\s*-->/]`（清单从 9 项升回 10 项）。

`UiPrototypeViewer.tsx` 中 `parsePages` 的 `regex = / /g` 也是同一个 bug，改为：

```tsx
const regex = /<!--\s*PAGE:\s*([\w\-\u4e00-\u9fa5]+)\s*-->/g
```

### K7.2 接通 selfCheckUi → 自动续写闭环

现状：`selfCheckUi` 函数定义了但 `generate()` 中**没调用**。修法（K6.2 已含示意，单独追加）：

```tsx
if (subtype === "ui") {
  let { score, missing } = await selfCheckUi(content)
  let attempts = 0
  while (score < 70 && attempts < 1) {
    attempts++
    content = await streamOnce(ctx, subtype, systemPrompt,
      `当前 UI 原型评分 ${score}/100，缺失：${missing.join(", ")}。请在已有 HTML 基础上补完，输出完整 HTML，末尾保留 <!-- END_UI -->`,
      content)
    ;({ score, missing } = await selfCheckUi(content))
  }
}
```

### K7.3 UiPrototypeViewer 多页面隔离

现状：`<iframe srcDoc={整个 HTML}>` 把 6 页 HTML 全塞一个 iframe → 错位。

改为：解析 `<!-- PAGE: name -->` ... `<!-- /PAGE -->` 切片后，每页**独立** srcDoc，左侧导航点击切换。同时给 iframe 加 `sandbox="allow-scripts allow-same-origin"`、`style= width: "100%", height: "100%", border: 0` 。还要包一层 `<head>` 注入：若用户 HTML 缺 `<!doctype html>` 自动补；样式重置 `body{margin:0;font-family:system-ui}`。

### K7.4 元话清洗（垃圾开场白）

新建 `src/agents/utils/strip-meta.ts`：

```tsx
const META_PATTERNS = [
  /^好的[，,].*$/m,
  /^作为(设计|需求|开发|审查)\s*Agent.*$/m,
  /^我将(严格|按照|根据).*$/m,
  /^以下是.*的(设计|文档|方案)[:：].*$/m,
  /^明白了[，,].*$/m,
  /^没问题[，,].*$/m,
]
export function stripMetaTalk(content: string): string {
  let lines = content.split("\n")
  // 只清前 5 行 + 文件中部偶发的元话
  while (lines.length > 0 && META_PATTERNS.some(p => p.test(lines[0]?.trim() ?? ""))) {
    lines.shift()
  }
  // 清空白前缀
  while (lines.length > 0 && lines[0].trim() === "") lines.shift()
  return lines.join("\n")
}
```

所有 `requirement-agent.draft/edit`、`design-agent.generate/edit` 写盘前调一次 `stripMetaTalk`。

### K7.5 加固系统提示词的「禁元话」红线

在所有内容生成 agent 的 system prompt 头部追加固定块：

```
# 输出红线（最高优先级）
- 严禁输出元会话语句，例如：「好的」「作为 xxx Agent」「我将根据」「以下是」「明白了」开头的句子。
- 直接输出文档内容本体（从 # 标题或正文第一句话开始）。
- 末尾必须有约定的 END 标记（`<!-- END_xxx -->`），缺则视为未完成。
- 输出语言：默认中文，专有名词与代码保留英文。
```

并把这一段抽到 `src/agents/prompts/_red-lines.ts` 公共导出，4 个 agent 都引用。

**验收**：

- 跑「待办清单」种子设计 5 个子产物 → 全部含正确 `<!-- END_xxx -->`，无截断 Banner；
- design-ui.html ≥ 6 页面、≥ 480 个 DOM 节点、selfCheckUi ≥ 80 分；
- UiPrototypeViewer 切页面正常显示，无空白错位；
- 任何 design / requirement 文档开头都不再有"好的，作为 xxx"这类话。

---

## K8 · Dev Agent 内置编码 Playbook（P1 ⭐）

**目标**：把"写好代码"的一整套规则、模式、最佳实践内置到 dev-agent system prompt，让产出代码不再是一次性玩具。

### K8.1 新建 `src/agents/prompts/dev-playbook.md`

这是会被 `buildDevSystemPrompt` 内嵌的「全栈编码 Playbook」，分 12 节，每节硬性约束：

1. **项目结构**：Next.js 14 App Router 标准布局；按功能（feature-first）而非按类型分文件夹。
2. **命名规范**：组件 PascalCase；hook `useXxx`；工具函数 camelCase；常量 SCREAMING_SNAKE_CASE；文件名与默认导出同名；禁止 `index.ts` 单一巨文件。
3. **类型安全**：`tsconfig.json` strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes；禁止 `any`，必要时用 `unknown` + 类型守卫；所有外部输入用 zod schema 解析。
4. **错误处理**：API route 用统一 `withErrorHandler` 包装；业务错误用自定义 `AppError(code, message)`；UI 用 ErrorBoundary 兜底；fetch 失败显示带「重试」按钮的 toast，不要白屏。
5. **数据校验**：所有 POST/PUT body 必经 zod；URL 参数同样校验；DB 写入前 enum 字段必须 union 类型。
6. **数据库**：Prisma schema 必须有 `@@index` 覆盖所有查询路径；使用 `select` 选取必要字段；外键级联用 `onDelete: Cascade` 或 `Restrict`，禁用默认 NoAction；事务用 `prisma.$transaction`。
7. **API 设计**：REST 资源化路径，PATCH 用于部分更新，PUT 用于全量替换；返回统一 `{ data, error: null } | { data: null, error: { code, message } }`；分页用 `?page=&pageSize=`，最大 pageSize=100。
8. **UI 组件**：原子组件用 shadcn/ui；表单用 react-hook-form + zod resolver；列表 ≥ 50 项必须虚拟化（`@tanstack/react-virtual`）；图片用 `next/image`；暗色主题 `next-themes`；空/错/加载三态必须显式渲染。
9. **可访问性**：所有交互元素 `aria-*` 完整；键盘可达（Tab/Esc/Enter）；对比度 ≥ 4.5:1；表单 `<label>` 关联控件。
10. **安全**：用户输入默认不可信，HTML 渲染用 `rehype-sanitize`；SQL 永远走 ORM；密码用 bcrypt(cost=10)；`.env` 字段不可前端暴露，前端配置必须 `NEXT_PUBLIC_` 前缀显式声明；CSP header；rate-limit。
11. **性能**：服务端组件优先；客户端组件按需 split；`useMemo/useCallback` 仅在 profile 证明有收益时使用；列表 key 用稳定 id；图片懒加载；首屏 critical CSS。
12. **测试**：vitest 单元 + Playwright e2e；每条 P0 AC 至少 1 个测试；component test 用 `@testing-library/react`；Mock 服务用 MSW；CI 失败必须阻塞合并。

每节末尾都要有 ≥ 1 个反例（"⛔ 错误写法 ... ✅ 正确写法 ..."）。

### K8.2 改 `src/agents/prompts/dev.ts`

`buildDevSystemPrompt` 中拼接 Playbook：

```tsx
import { readFileSync } from "node:fs"
import path from "node:path"
const PLAYBOOK = readFileSync(path.join(process.cwd(), "src/agents/prompts/dev-playbook.md"), "utf-8")

return `# 角色
你是开发 Agent... (原内容)

# 编码 Playbook（强制遵守，违反任何一条都视为代码不达标）

${PLAYBOOK}

# 上下文：PRD ...
# 上下文：设计产物 ...`
```

### K8.3 自检：在写完 [COVERAGE.md](http://COVERAGE.md) 之后，让 dev agent 自评

追加 user prompt 末尾：

```
# 自评
所有文件写完后，输出 SELF_REVIEW.md，对照 dev-playbook 12 节逐节自评 Pass/Fail，Fail 的列出 3 条修复建议。
```

`dev-agent.ts` 在自检阶段读 SELF_[REVIEW.md](http://REVIEW.md) 写入 artifact meta，用于审查时参考。

### K8.4 Eslint 规则强化

生成的工程必须包含 `eslint.config.mjs` 启用：`@typescript-eslint/no-explicit-any`、`@typescript-eslint/no-unused-vars`、`react-hooks/rules-of-hooks`、`react-hooks/exhaustive-deps`、`@typescript-eslint/consistent-type-imports`、`import/order`。max-warnings=0。

**验收**：

- 跑「待办清单」种子 → 生成的工程中 `eslint . --max-warnings=0` 全过；
- workspace 含 `SELF_REVIEW.md` 且 Pass ≥ 10/12；
- 故意删一段 zod 校验 → review-agent 能稳定标 P0。

---

## K9 · 自动锁定 + 阶段流转修复（P0 ⭐）

**根因**：`gates.ts G2` 要 5 个 `design-*` artifact `locked=true`，但当前 design-agent 只写不锁，G2 永远跳不过。

### K9.1 PRD 与 design 子产物：生成成功后**默认 unlock**，提供「确认锁定」按钮

继续保持「需手动确认」语义，但前端必须有清晰入口：

- 需求页：K2 已给出「锁定 PRD」按钮；
- 设计页：每个 Tab 顶栏加「确认 design-summary 」蓝色按钮，调 `POST /api/projects/[id]/artifacts/design-summary/lock`。Tab 标题旁显示 🔒 已锁 / 📝 待确认 状态。
- 设计页右上角加「一键确认全部 5 项」按钮，自动锁定全部已生成且通过自检的子产物（UI 自检 score ≥ 70 才允许锁）。

### K9.2 后端通用 lock/unlock API

新建 `src/app/api/projects/[id]/artifacts/[type]/lock/route.ts`：

```tsx
export async function POST(req: Request, { params }: { params: { id: string; type: string } }) {
  const a = await prisma.artifact.findFirst({
    where: { projectId: params.id, type: params.type },
    orderBy: { version: "desc" },
  })
  if (!a) return NextResponse.json({ error: { code: "E_NOT_FOUND", message: "产物不存在" } }, { status: 404 })
  await prisma.artifact.update({ where: { id: a.id }, data: { locked: true, lockedAt: new Date() } })
  return NextResponse.json({ data: { locked: true } })
}
```

对应 `unlock/route.ts` 反之。重新生成时 `reopenFromGate` 已自动反锁后续 Gate；这里补充 `unlockArtifactsFromStage` 同步反锁产物本身。

### K9.3 G2 错误信息更友好

当前 `lockGate` 抛 `阶段条件未满足` + `reasons[]`，但前端 toast 只展示 message。改 toast：

```tsx
toast({
  title: "阶段条件未满足",
  description: error.reasons?.map((r: string) => `• ${r}`).join("\n") ?? error.message,
  variant: "destructive",
  action: <Button onClick={navigateToBlocker}>跳转修复</Button>,
})
```

`navigateToBlocker` 解析 reasons 第一条，定位到对应 artifact 的 Tab 让用户去锁。

### K9.4 hybrid 模式自动锁定阈值

`gates.ts autoEvaluate` 已存在；扩展：在每个 artifact 生成成功后，若 project.hitlMode=`auto` 或 `hybrid` 且置信度（UI selfCheckUi score / 其他主观指标）≥ threshold，自动 `locked=true`。

### K9.5 前端 StageNav 显示完整 reasons

StageNav 当前只显示 G0–G6 圆点。改成 hover 圆点显示 `checkConditions` 返回的 `reasons` 列表，让用户一眼看出"为什么这个 Gate 锁不了"。

**验收**：

- 跑完设计 5 个子产物 → 一键确认全部 → G2 即可 lock → 进入开发阶段不再报"阶段条件未满足"；
- 故意只锁 4 个 → 点完成阶段 → toast 显示「未完成：design-ui」+ 跳转按钮；
- hitlMode=auto 时整条流水线无人值守跑通。

---

## K10 · 收尾验收 + smoke:e2e 完整化（P2）

### K10.1 完善 `scripts/smoke-e2e.ts` 14 步

```
1. 创建项目「待办_smoke」
2. 上传一份需求 .md（测试 K2 上传通道）
3. 调 /requirement/clarify → 等问题列表（K6 后仍为 chat）
4. 调 /requirement/answer → 等 PRD（Pi 模式）
5. 调 /artifacts/prd/lock
6. 调 /stages/G1/complete
7. 调 /design/generate-all → 轮询 SSE 至 5 子产物完成
8. 校验：summary→detail→api→db→ui 顺序、含 END_xxx 标记、UI selfCheck ≥ 70
9. 调 /design/lock-all → 锁 5 个子产物
10. 调 /stages/G2/complete
11. 调 /dev/run → 等 builtOk=true
12. 调 /sandbox/start → 探活 200
13. 调 /stages/G3/complete
14. 调 /review/run → hasP0=false
```

任一失败用 `process.exitCode=1`。整条耗时 ≤ 35 分钟。

### K10.2 GitHub Actions（可选）

`.github/workflows/smoke.yml`：PR 合并前跑 `pnpm typecheck && pnpm build && pnpm smoke:llm && pnpm smoke:pi && pnpm smoke:e2e`，缓存 pnpm store + Pi tmp。

### K10.3 README 更新「故障排查」章节

按用户高频问题列：

- max_tokens 400 → K4
- 阶段条件未满足 → K9
- UI 截断 → K7
- ollama 接入 → K5
- Agent 设置入口 → K1

**验收**：本地 `pnpm smoke:e2e` 全过；GitHub PR 自动跑通。

---

## 10. 红线（沿用 #1 §5 / #2 §9 / #3 §10，新增四条）

- **不要降级 SDK**：Pi 0.73 行为如不符预期，停下来在 commit 中加 `BLOCKED:` 前缀写明，不擅自换 API。
- **不要绕过 Agent 注册表**：K1 之后所有 prompt 必须可被 DB 覆盖，硬编码版本只作为 fallback。
- **不要跳过构建自检**：K9 中代码 artifact 锁定的前提是 `meta.builtOk=true`，不允许 stub。
- **不要去掉 END marker**：K7.1 修复后，任何 prompt 改动都必须保留 `<!-- END_xxx -->` 协议。
- **不要直接 `new OpenAI()`**：所有 LLM 调用经 gateway，K4 钳制必经。
- **不要把元话留进文档**：K7.4 stripMetaTalk 必经。
- **不要在 ChatDock 里起本地状态存对话**：K3 之后必须落 ChatMessage 表。
- **不要把 ollama 视为「只是另一个云模型」**：K5 中 Pi 注册 + 本地探活逻辑独立路径。
- **任何 LLM/agent 行为修改前后**必须跑 `pnpm smoke:pi` + `pnpm smoke:llm`；面向用户的修改必须跑 `pnpm smoke:e2e`。

---

## 11. 给 Claude Code 的执行口令（接力第四轮）

<aside>
🎯

你已完成 J0–J9 大部分（仓库 master HEAD）。现在按以下顺序执行 K0–K10，每张卡一个 PR；commit 前缀 `fix(K<n>): ...` 或 `feat(K<n>): ...`。

**执行顺序**：K0 → K4 → K7 → K9 → K1 → K2 → K8 → K6 → K3 → K5 → K10

**顺序理由**：

K0 是约定 → K4 先把 LLM 4xx 错误堵死（不堵后面跑不下去）→ K7 修 END_MARKER_RE 死灰复燃 + 设计三件套（不修则演示一定崩）→ K9 修阶段流转（不修则进不到开发）→ K1+K2 把设置/PRD 编辑入口补齐（不补则用户用不了）→ K8 内置 Playbook 提质 → K6 全 Agent Pi 化 → K3 ChatDock 重构（依赖 K6 的 session 池）→ K5 ollama 锦上添花 → K10 收尾验收。

**验收节奏**：每完成 K4+K7+K9 后立刻跑「待办清单」端到端：需求编辑 → 锁定 → 设计 5 子产物（图渲染 + 无截断 + 无元话）→ 锁定 5 项 → 开发（builtOk=true、SELF_REVIEW Pass ≥ 10）→ 沙箱（iframe 看到能交互的 todo）→ 审查（无 skip、AC 覆盖率 ≥ 80%）→ 导出。**视频或截图必须贴 PR 描述**。

**§10 红线不得违反**。遇到与文档/SDK 行为不符立即停下用 `BLOCKED:` 前缀提交，不要自作主张。

</aside>

---

## 12. 一句话总结

Fix-Pack #3 让平台「能跑通」，**Fix-Pack #4 让平台「可被使用、可被信任、可被运营」**：编辑入口可达、设置可调、对话可用、错误可解、本地模型可用、所有 Agent 都长在 Pi 上。完成后即可进入大赛 Demo 录制阶段。

---

## 附录 A · master HEAD 关键文件 raw 复核摘要（仅记差异点）

| 文件 | 状态 | 问题 |
| --- | --- | --- |
| src/agents/dev-agent.ts | ✅ | buildDevSystemPrompt + Pi cwd + builtOk + reopenFromGate("G3") 都在 |
| src/agents/design-agent.ts | ❌ | **END_MARKER_RE = / / 是空格**；selfCheckUi 未被调用；DESIGN_ORDER 已正确 |
| src/agents/review-agent.ts | ✅ | eslint platform fallback / audit 兜底 / fixReview 优先级 bug 已修 |
| src/agents/requirement-agent.ts | 🟡 | edit() 已实现，前端没接；用裸 stream 不走 Pi |
| src/agents/registry.ts | 🟡 | 只有 AgentConfig；无 Memory/Skill；无 buildSystemPrompt 注入 |
| src/lib/llm/openai-compat.ts | ❌ | maxTokens 不钳制、无 per-provider 范围 |
| src/lib/llm/gateway.ts | 🟡 | 错误未分类，全部塞 E_GATE_CLOSED |
| src/config/models.ts | 🟡 | 无 ollama；无 maxTokensRange |
| src/lib/hitl/gates.ts | ✅ | G3 builtOk 已校验；reopenFromGate 已实现 |
| src/components/workbench/UiPrototypeViewer.tsx | ❌ | parsePages regex 是空格；srcDoc 全量塞错位 |
| src/components/workbench/ChatDock.tsx | 🟡 | 仅外壳；不持久化、不接 Pi 事件 |
| src/app/settings/page.tsx | 🟡 | 有 Agent 设置链接但全局 nav 无入口 |
| src/app/settings/agents/page.tsx | ❌ | 只读卡片墙 |
| src/app/projects/[id]/requirement/page.tsx | ❌ | PRD 只读，无编辑入口 |
| prisma/schema.prisma | 🟡 | 有 AgentConfig，缺 AgentMemory / AgentSkill / ChatMessage |
| package.json | ✅ | mermaid / react-markdown / monaco-editor / pi-coding-agent 0.73 / smoke:e2e 都在 |