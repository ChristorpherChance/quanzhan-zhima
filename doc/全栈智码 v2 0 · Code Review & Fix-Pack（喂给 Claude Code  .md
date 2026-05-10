# 全栈智码 v2.0 · Code Review & Fix-Pack（喂给 Claude Code 的修复指令）

> 本文档基于对 GitHub 仓库 `ChristorpherChance/quanzhan-zhima`（master 分支首次提交）的逐文件 Review，对照 PRD v2.0 实施文档集（00–12）逐项标注差距、bug 与优化点，并以 Claude Code 可直接执行的任务卡形式给出修复方案。
**使用方式**：把本页整体粘贴给 Claude Code，让它按 §3 的任务卡顺序执行；§5/§6 是它在 Pi/依赖问题上必须遵守的红线。
> 

---

## 0. 总览：现状判定与优先级矩阵

### 0.1 一句话判定

现仓代码可以"跑起来"，但**只完成了 v2.0 框架的 ~55%**，关键缺失集中在三块：

1. **Pi 嵌入与 SSOT 文档体系不全**（无 `CLAUDE.md`、无 `docs/pi-sdk-cheatsheet.md`、无 `.claude/commands/`）；
2. **传输层与前端壳体没按 v2.0 §04/§05 实现**（缺 WebSocket、缺三栏 ChatDock/NavSidebar）；
3. **3/4 的 Agent 未走 AgentSession，Review 修复闭环是假实现**（与 v2.0 §07 不符）。

另外存在 1 个**会导致主链路必跑崩**的硬 bug：DeepSeek 模型 ID `deepseek-v4-pro` 在 SDK 中无定义，且 `registry.ts` 没把它作为 customProvider 注册——仅当 `getPiRegistry()` 命中 SDK 内置 deepseek provider 列表时才不会立刻 throw，但 `resolvePiModelByKey('deepseek')` 实际可能返回 `undefined`，导致 dev/review 在第一次 Pi 调用时 500。

### 0.2 优先级矩阵

| 级别 | 类型 | 数量 | 必修原因 |
| --- | --- | --- | --- |
| **P0**（阻塞演示） | 模型 ID/Registry、Review 修复假实现、Sandbox lint 必崩、Skeleton 工作区缺失、Sessions 路由对 dev 主链未生效 | 5 | 不修无法跑通完整链路 |
| **P1**（v2.0 一致性） | WebSocket 缺失、三栏壳体缺失、4-AgentSession 体系、[CLAUDE.md/Cheatsheet、PiSession+Message](http://CLAUDE.md/Cheatsheet、PiSession+Message) 表、6 关卡只到 G3 | 6 | 与 PRD v2.0 主旨直接冲突 |
| **P2**（健壮性） | 5min 硬截断、jobEvents 内存泄漏、SSE 2s polling、HTML 模板字符串、端口 3000/3002、`pnpm-workspace.yaml` 残留、JSON 解析脆弱 | 7 | 影响稳定性与体验，但不阻塞 |
| **P3**（打磨） | 测试缺失、Pandoc 检测、日志写 `Job.logs` 全量、彩蛋链路验证、changelog 自动写入 | 5 | 收尾级 |

---

## 1. 文档 ↔ 代码差距清单（Gap Matrix）

以下逐条对应 v2.0 实施文档集 00–12 中的强制要求。`✅` = 已实现；`⚠️` = 部分实现；`❌` = 未实现/错误实现。

### 1.1 与《01 [CLAUDE.md](http://CLAUDE.md) & 项目规范》的差距

| v2.0 强制项 | 现状 | 文件证据 | 修复点编号 |
| --- | --- | --- | --- |
| 根目录 `CLAUDE.md`（项目宪法 SSOT） | ❌ 不存在 | repo tree 无 | F1 |
| 根目录 `AGENTS.md`（同 [CLAUDE.md](http://CLAUDE.md) 软链/副本） | ❌ 不存在 | repo tree 无 | F1 |
| `docs/pi-sdk-cheatsheet.md`（Pi 0.73 反幻觉小抄） | ❌ 不存在；整个 `docs/` 目录都没有 | repo tree 无 `docs/` | F1 |
| `.claude/commands/*.md`（slash commands） | ❌ 不存在 | repo tree 无 `.claude/` | F1 |
| README 列出 5 个一句话需求种子 | ⚠️ README 提到，但 `seeds/` 与 `scripts/seed-cache.ts` 实际只缓存 3 个（光伏、用电、彩蛋） | `scripts/seed-cache.ts` | F11 |

### 1.2 与《02 架构总览》《03 数据模型》的差距

| v2.0 强制项 | 现状 | 文件证据 | 修复点编号 |
| --- | --- | --- | --- |
| Prisma `PiSession` 表（projectId, agentType, leafId, createdAt） | ❌ 整张表缺失 | `prisma/schema.prisma` 仅 5 张表 | F2 |
| Prisma `Message` 表（sessionId, role, blocks JSON, ts） | ❌ 缺失；现仅 `Conversation.messagesJson` 大字段 | 同上 | F2 |
| `Project.confidence` 自动评估字段 | ❌ 缺失（仅 `Gate.confidence`） | 同上 | F2 |
| 6 个 HITL 关卡（G0/G1/G2/G3/G4/G5/G6 任一规范化命名） | ⚠️ 只到 G1/G2/G3 | `src/lib/hitl/gates.ts:5` `GateType = G1\ | G2\ |
| Artifact 版本化路径 `{type}.v{n}.md` | ✅ `paths.artifactVersioned` 已实现 | `src/config/paths.ts:15-16` | — |

### 1.3 与《04 API 网关 / WS》的差距

| v2.0 强制项 | 现状 | 文件证据 | 修复点编号 |
| --- | --- | --- | --- |
| `/api/ws`（chat / tool_call / thinking 推流） | ❌ 完全缺失，包未引入 | `package.json` 无 `ws` `@types/ws` | F3 |
| 事件类型规范：`thinking_delta` / `tool_start` / `tool_update` / `tool_end` / `text_delta` / `result` / `end` | ⚠️ 已部分对齐 SSE，但同时存在旧事件名 `tool-call`（中划线） | `src/components/workbench/agent-chat.tsx` 第 ~165–195 行同时分发 `tool_start` 与 `tool-call` | F3 / F4 |
| 5 分钟以上长任务支持 | ❌ SSE 路由 `300_000ms` 强切 | `src/app/api/jobs/[id]/stream/route.ts:42` | F8 |
| Job 完成后 EventTarget 30s GC | ⚠️ 已实现，但 `jobEvents`（buffer）永不清理 | `src/agents/orchestrator.ts:21,67-70` | F8 |

### 1.4 与《05 前端三栏 + ChatDock》的差距

| v2.0 强制项 | 现状 | 文件证据 | 修复点编号 |
| --- | --- | --- | --- |
| 左 NavSidebar（200px，5 路由：项目/制品/会话/沙箱/导出） | ❌ `src/app/layout.tsx` 仅顶部 nav；项目链接硬编码 `/projects/p1` | `layout.tsx` | F4 |
| 中央 Workbench（可切阶段） | ⚠️ `three-pane.tsx` 是简化版，无 stage-aware tab | `src/components/workbench/three-pane.tsx` | F4 |
| 右 ChatDock（420px 抽屉，⌘+J 切换） | ❌ 当前 `agent-chat.tsx` 直接当 right 注入，无独立 Dock 组件 | 同上 | F4 |
| Agent Tabs（需求/设计/开发/审查 4 标签 + 持久会话） | ❌ 无 tab 组件，会话只有「分支选择器」 | `agent-chat.tsx:38-40` | F4 / F5 |
| Session Sidebar 操作（Fork / Compact / Steer / Abort / Navigate） | ⚠️ 后端 4 个路由齐了，前端只暴露了 fork/compact/navigate | `agent-chat.tsx:60-86` | F4 / F5 |

### 1.5 与《06 Pi 集成》《07 4-Agent 矩阵》的差距 ⭐ 最关键

| v2.0 强制项 | 现状 | 文件证据 | 修复点编号 |
| --- | --- | --- | --- |
| 4 个 Agent 各持有 1 个 `AgentSession`，共享 `projectId` | ❌ 仅 dev 路径走 `runPiSession`/`piSessionPool`，req/design/review 用 `chat()`/`stream()` 裸调 LLM | `requirement-agent.ts:74-93`、`design-agent.ts`、`review-agent.ts:fixReview` | F5 |
| `defineTool`  • TypeBox schema | ✅ `tools.ts` 已用 `Type.Object`，3 个 customTool 正确 | `src/lib/pi/tools.ts:10-21` | — |
| DeepSeek 通过 `registerCustomModel`/自定义 provider 注册 | ❌ `registry.ts` 仅给 kimi/xiaomi 注册自定义；DeepSeek 直接走 SDK 内置 provider，但 model id `deepseek-v4-pro` 不在内置列表 → `find()` 返回 undefined → 第一次调用即崩 | `src/lib/pi/registry.ts:78-100`、`src/config/models.ts:14` | **F0**（最高优先级） |
| Pi events 透传到 SSE：thinking / tool_use / message_delta / done | ⚠️ dev-agent 监听 Pi 事件并 emit 到 orchestrator，但 thinking 事件名不一致（`thinking_delta` vs Pi 0.73 实际为 `thinking_block_delta`） | `src/agents/dev-agent.ts` | F5 |
| `session.fork / compact / steer / abort` 在 UI 入口齐全 | ⚠️ 缺 abort（前端无按钮、后端无 route） | repo tree 无 `sessions/abort/route.ts` | F5 |
| Review Agent 闭环：审查 → 生成缺陷 → 调 dev session 修复 → 重审 | ❌ `review-agent.ts:fixReview` 仅返回文本，**不写文件不重审** | `src/agents/review-agent.ts` 末尾 | F6 |
| Review 在生成的工作区跑 `pnpm lint --max-warnings=0` / `pnpm audit` | ❌ 用户生成的工作区是单 `server.js` 模板，无 ESLint/无 lockfile，**必崩** | `src/agents/review-agent.ts:43-52` | F6 |

### 1.6 与《08 HITL & 导出》《09 沙箱》《11 任务卡》《12 环境》的差距

| v2.0 强制项 | 现状 | 修复点编号 |
| --- | --- | --- |
| Auto-evaluate 自动通关（基于 confidence ≥ threshold） | ⚠️ `gates/auto-evaluate/route.ts` 存在但未与 G0/G4/G5/G6 联动 | F2 / F7 |
| 导出 Pandoc 缺失时优雅降级 | ✅ try/catch 已写 | — |
| 沙箱端口池范围可配置 | ✅ `SANDBOX_PORT_RANGE` from `@/config/ports` | — |
| 沙箱 env 脱敏 | ✅ `child-process.ts:8-15` 已删 5 个 API key | — |
| `_skeleton` workspace 模板（v2.0 §09 §3） | ❌ 完全缺失，回退到 8 行 `MINIMAL_SERVER_JS`（HTML 串字符串还把 `*{margin:0...}` 写在 `<style>` 外，CSS 不会生效） | F9 |
| `.env.example` 端口与 `next dev` 一致 | ❌ `NEXT_PUBLIC_APP_URL=http://localhost:3002` 但 `next dev` 默认 3000 | F10 |
| 根 `pnpm-workspace.yaml` 在非 monorepo 出现 | ❌ 残留，会让某些 Vercel/CI 把它识别为 workspace | F10 |
| 测试：`vitest.config.ts` / `playwright.config.ts` / 用例 | ❌ 一个都没有；devDeps 引了但配置缺失 | F12 |

---

## 2. Bug 清单（按文件精准定位）

以下是"代码已跑通但仍存在"的 bug，每条都附带 **症状 / 根因 / 期望行为**，Claude Code 应直接套修复。

### B1 · DeepSeek 模型 ID 不存在导致 Pi 首次调用崩溃 【P0】

- **文件**：`src/config/models.ts:14`、`src/lib/pi/registry.ts:78-100`
- **症状**：调用 `/api/projects/:id/dev/run` 时，`piSessionPool.getOrCreate` → `resolvePiModelByKey('deepseek')` 返回 `undefined`，第 70 行 `throw new Error('Model not found: provider=deepseek')`。
- **根因**：`models.ts` 把 deepseek model 写成 `"deepseek-v4-pro"`（v2.0 占位 ID），但 Pi SDK 内置 deepseek provider 仅识别 `deepseek-chat` / `deepseek-reasoner`；同时 `registry.ts` 的 `customOnly` 数组只含 `kimi/xiaomi`，没把 deepseek 当 customProvider 注册。
- **修法**：见 §3 F0。

### B2 · `review-agent.fixReview` 是假实现 【P0】

- **文件**：`src/agents/review-agent.ts`（`fixReview` 函数）
- **症状**：UI 上点"自动修复"返回 200，但 workspace 文件无任何改动，重审仍然失败。
- **根因**：函数体只 `chat()` 一把然后 `return { text: result.text.slice(0,200) }`，没有调用任何写文件 tool，也没复用 `piSessionPool`。
- **修法**：见 §3 F6 —— 改用 `piSessionPool.followUp(projectId, '<修复指令含具体缺陷>')`，让 dev session 用 `workspace_write` 真正改文件，并触发自动重审。

### B3 · Review 跑 `pnpm lint`/`pnpm audit` 在生成的工作区必失败 【P0】

- **文件**：`src/agents/review-agent.ts:43-52`
- **症状**：审查报告所有静态检查项全为 `failed`，污染缺陷列表。
- **根因**：生成的 workspace 是 `MINIMAL_SERVER_JS`，无 `eslint.config.js` / 无 `pnpm-lock.yaml` / 无 `package.json scripts.lint`。
- **修法**：见 §3 F6/F9 —— 工作区先用真正的 `_skeleton` 初始化（含最小 ESLint/TS 配置），且 review 改为 `tsc --noEmit` + `eslint .` 直调，并在 catch 内把 "工具未配置" 标为 `skipped` 而非 `failed`。

### B4 · `sessions/abort` 路由缺失 【P0】

- **文件**：repo tree 无 `src/app/api/projects/[id]/sessions/abort/route.ts`
- **症状**：长时间 Pi 任务无法取消，前端中止只断 SSE，Pi 会话仍在跑直到模型超时。
- **修法**：见 §3 F5 —— 新增 abort route，调用 `active.session.abort()`（Pi 0.73 提供）+ `piSessionPool.dispose(projectId)`。

### B5 · `MINIMAL_SERVER_JS` HTML 模板字符串渲染错乱 【P1】

- **文件**：`src/app/api/projects/[id]/dev/sandbox/run/route.ts:35-39`
- **症状**：浏览器打开沙箱端口，CSS 不生效，看到 `*{margin:0;padding:0;...}` 文本直接显示。
- **根因**：模板字符串被压缩成单行后，`<style>` 标签的开闭符号在 `\\` 转义中丢失。
- **修法**：见 §3 F9 —— 改用读取 `_skeleton/index.html` 文件，而不是巨型模板字符串。

### B6 · `jobEvents` Map 永不释放 【P1】

- **文件**：`src/agents/orchestrator.ts:21,67-70`
- **症状**：长时间运行后内存稳步上涨；每 Job 缓存 1000 条事件保留终身。
- **修法**：见 §3 F8 —— `endJob` 时同时 `jobEvents.delete(jobId)`，与 `jobEventTargets` 同步 30s GC。

### B7 · SSE 5 分钟硬截断 【P1】

- **文件**：`src/app/api/jobs/[id]/stream/route.ts:42`
- **症状**：dev-agent 长任务（runPiSession 240s + 多轮工具调用）经常被卡掉。
- **修法**：见 §3 F8 —— 改为基于「Job 终态 (`succeeded`/`failed`)」判断，去掉硬时限；并补 `keep-alive` 注释行（每 15s 写 `:\n\n`）。

### B8 · Stream 路由 2s 轮询 DB 多余 【P1】

- **文件**：`src/app/api/jobs/[id]/stream/route.ts`
- **症状**：每个 SSE 连接每 2s 跑一次 Prisma 查询 + 比较，重复事件可能被双发。
- **修法**：去除轮询，统一用 `jobEventTargets.get(jobId)?.addEventListener` + 兜底首次 push 历史 buffer。

### B9 · 端口配置不一致 【P2】

- **文件**：`.env.example:NEXT_PUBLIC_APP_URL=http://localhost:3002`，但 `package.json` `dev` 脚本是 `next dev`（默认 3000）。
- **修法**：见 §3 F10 —— 二选一，建议 `next dev -p 3002`。

### B10 · `pnpm-workspace.yaml` 误存 【P2】

- **修法**：删除文件；保留 `pnpm-lock.yaml`。

### B11 · `requirement-agent.clarify` JSON 解析脆弱 【P2】

- **文件**：`src/agents/requirement-agent.ts:74-93`
- **症状**：模型偶尔返回 "`json\n{...}\n`" 包装或前置说明，正则提取失败，UI 拿到 0 条问题。
- **修法**：见 §3 F5（顺手修） —— 改用 `JSON.parse` + 多次回退（去围栏、首个 `{...}` 段），同时把 prompt 改为 `tools.json_object` 强模式（DeepSeek 支持 `response_format: { type: 'json_object' }`）。

### B12 · `review.execIn` 上的 `.catch` 是死代码 【P3】

- **文件**：`src/agents/review-agent.ts:43,46,49,52`
- **症状**：永不进 catch（`execIn` 内部已用 try/catch 返回 `{stdout, stderr, code}`）。无害，但增加阅读负担。
- **修法**：删掉 `.catch(...)`。

### B13 · `setIcon` / 头像 API key 仍可能从 `process.env` 进入子进程 【P3】

- **文件**：`src/lib/sandbox/child-process.ts:8-15`
- **现状**：已 delete 5 个，但 `OPENAI_BASE_URL`/`KIMI_BASE_URL` 等 baseURL 类信息未脱敏。
- **修法**：见 §3 F9 —— 改成白名单（仅保留 `PATH/HOME/PORT/NODE_OPTIONS`）。

### B14 · `requirement-agent.draft` 写 PRD 时未保存 `Conversation` 历史 【P3】

- **现状**：仅最终 `Artifact` 持久化；前端切回需求 tab 看不到澄清问答历史。
- **修法**：v2.0 §03 要求每个 Agent 的会话历史持久化，见 F2 加 Message 表后顺手补。

---

## 3. 修复任务卡（按顺序喂给 Claude Code）

> 执行规则：
> 

> - **每张卡片为一个 PR / 一次提交，提交前必须本地通过 `pnpm typecheck && pnpm build`。**
> 

> - 涉及 schema 变更的卡片，**必须** `pnpm prisma migrate dev --name <短名>` 并提交新的迁移文件。
> 

> - 任何修改 LLM 行为的卡片，**必须** 跑 `pnpm tsx scripts/smoke-pi.ts` 与 `pnpm tsx scripts/smoke-llm.ts`，截图日志贴回 PR。
> 

> - 不允许引入新的全局 `process.env` 读取，所有敏感配置走 `getRuntimeConfig()`。
> 

### F0 · 修复 DeepSeek Provider 注册（P0，最先做） ⭐

**目标**：让 `piSessionPool.getOrCreate({provider:'deepseek'})` 不再返回 `undefined`。

**改动**：

1. `src/config/models.ts`：把 `deepseek.model` 从 `"deepseek-v4-pro"` 改为 `"deepseek-chat"`（reasoner 走另一条 alias，见下）。
2. `src/lib/pi/registry.ts`：把 deepseek 加入 `customOnly` 列表，按 `kimi/xiaomi` 同款 `registerProvider` 流程注册：
    
    ```tsx
    const customOnly: LlmProviderKey[] = ["deepseek", "kimi", "xiaomi"]
    ```
    
    并在 `models` 数组里同时注册 `deepseek-chat` 与 `deepseek-reasoner`（reasoning:true，contextWindow:64_000，maxTokens:8192）。
    
3. 新增 alias 解析：`PROVIDER_LLM_KEY` 支持 `deepseek-reasoner` 直跳模型 ID。
4. 更新 `.env.example`：`PI_DEFAULT_MODEL=deepseek-chat`。
5. `scripts/smoke-pi.ts` 增加一条 "读取 README 头 5 行" 的最小 prompt 验证。

**验收**：`pnpm tsx scripts/smoke-pi.ts` 输出至少 1 条 `tool_use` + `text_delta` + `done`。

### F1 · 补齐 SSOT 文档体系（P1）

**目标**：v2.0 §01/§06/§12 要求的根目录"反幻觉小抄"全部到位。

**新建**：

- `CLAUDE.md`（根） —— 内容直接抄 v2.0 §01，需含「目录约定 / 命名规范 / 严禁事项 / 必须运行的脚本 / 提交前 checklist」5 节。
- `AGENTS.md` —— 一行 `See ./CLAUDE.md`（兼容 Cursor/Continue/Cline）。
- `docs/pi-sdk-cheatsheet.md` —— 必含：①`AgentSession` API 列表（prompt/followUp/steer/abort/compact/setModel/setThinkingLevel）；②`defineTool` + TypeBox 最小例；③`registerProvider` openai-completions 模板；④事件名清单（`thinking_block_delta`/`text_delta`/`tool_use_block_start`/...）。
- `.claude/commands/` 下：
    - `prd-draft.md`、`design-suite.md`、`dev-feature.md`、`review-fix-loop.md`、`gate-check.md`，每个文件 ≤ 30 行，明确 "Do / Don't / 调用哪些 API / 失败时如何报告"。
- `docs/ARCHITECTURE.md` —— 一图（Mermaid）+ 一段 200 字总览，链接到 v2.0 §02。

**验收**：`ls CLAUDE.md AGENTS.md docs/pi-sdk-cheatsheet.md .claude/commands/` 全部存在。

### F2 · Prisma Schema 补全（P1）

**新增模型**（追加在 `schema.prisma`）：

```
model PiSession {
  id         String   @id @default(cuid())
  projectId  String
  agentType  String   // requirement | design | dev | review
  leafId     String?  // SessionManager.getLeafId()
  modelId    String
  thinking   String   @default("off")
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  messages   Message[]
  @@unique([projectId, agentType])
  @@index([projectId])
}

model Message {
  id         String   @id @default(cuid())
  sessionId  String
  role       String   // user | assistant | system | tool
  blocks     String   // JSON: thinking/text/tool_use/tool_result blocks
  ts         DateTime @default(now())
  session    PiSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  @@index([sessionId, ts])
}
```

**修改 `Gate.type` 取值**：`G0|G1|G2|G3|G4|G5|G6`；同步修改 `src/lib/hitl/gates.ts` `GateType` 联合类型，并把现有 G1/G2/G3 检查迁到对应阶段（G0=立项、G4=沙箱可跑、G5=审查通过、G6=导出可下载）。

**新增字段**：`Project.confidence Float? @default(0)`。

**迁移**：`pnpm prisma migrate dev --name pi_session_message_gates`。

### F3 · 引入 WebSocket，统一 chat/tool/thinking 通道（P1）

**依赖**：`pnpm add ws @types/ws@4`（生产 + 类型）。

**实现**：

- 新建 `src/server/ws.ts` —— 在 Next.js custom server 上挂 WebSocketServer；按 `path=/api/ws?projectId=...&agentType=...` 路由。
- 新建 `next.config.mjs` 钩子或独立 `server.ts`（参考 `examples/with-ws-server` 模式）；如果不引入 custom server，则**保留 SSE 但把事件名收敛到唯一一套**（删除 `tool-call` 旧事件，仅保留 `tool_start/tool_update/tool_end`）——v2.0 允许 SSE 兜底但要求事件名一致。
- 客户端：`src/components/workbench/use-agent-stream.ts`（新建），自动判定 `WebSocket` 可用→走 WS，不可用→回退现有 `useSSE`。

**验收**：`agent-chat.tsx` 不再有 `tool-call`（中划线）分支；浏览器 devtools 看到 `ws://.../api/ws` 帧或 `EventStream` 二选一。

### F4 · 三栏壳体：NavSidebar + Workbench + ChatDock（P1）

**目标**：完全替换 `src/app/layout.tsx` 现有顶部 nav。

**新建组件**：

- `src/components/shell/NavSidebar.tsx` —— 200px 固定，5 项：`Projects / Artifacts / Sessions / Sandbox / Exports`，`⌘+\` 折叠。
- `src/components/workbench/ChatDock.tsx` —— 420px 抽屉，`⌘+J` 切换，内嵌 `AgentTabs`。
- `src/components/workbench/AgentTabs.tsx` —— 4 个 tab（需求/设计/开发/审查），每个 tab 独立 `AgentChat` 实例，state 通过 `useReducer` + `useImperativeHandle` 暴露。
- `src/components/workbench/SessionSidebar.tsx` —— 移走 `agent-chat.tsx` 中第 38–110 行的会话树选择器。

**改动**：

- `src/app/layout.tsx`：用 `<NavSidebar/><main>{children}</main><ChatDock/>` 三块。
- 删除现有顶部 nav 中硬编码 `/projects/p1` 链接（B 级 bug）。

**验收**：键盘 `⌘+\` `⌘+J` 工作；4 个 Agent tab 各自独立滚动条与 streaming 状态。

### F5 · 4 Agent × AgentSession 矩阵（P1） ⭐

**目标**：所有 Agent 必须走 `piSessionPool`，禁止 `req/design/review` 内部直接 `chat()`/`stream()`。

**重构**：

- `src/agents/requirement-agent.ts`：
    - `clarify()` `draft()` `edit()` 全部改为 `piSessionPool.getOrCreate({projectId, workspaceDir, systemPromptOverride: REQUIREMENT_SYSTEM})` + `prompt()/followUp()`。
    - `clarify` 模型用 `response_format: { type: 'json_object' }`（DeepSeek 兼容）一次性出 JSON，去掉脆弱正则。
- `src/agents/design-agent.ts`：
    - 拆 `generate(subtype)` 为 5 个具名子流程（`design-summary` / `design-detail` / `design-api` / `design-db` / `design-ui`），每个子流程显式列出输出文件名与 schema。
    - `subtype` 走 `piSessionPool` 同一 session（同一 projectId+agentType=design），使用 `followUp` 累计上下文。
- `src/agents/review-agent.ts`：保留对工作区跑 `tsc/eslint` 的子流程；`fixReview` 见 F6。
- `src/agents/dev-agent.ts`：模型 ID 改为 `deepseek-chat`；删除 `"deepseek-v4-pro"`。

**新增路由**：`src/app/api/projects/[id]/sessions/abort/route.ts` —— 调用 `piSessionPool.get(id)?.session.abort()` 与 `dispose(id)`。

**前端**：`SessionSidebar.tsx` 加 `Abort` 按钮 + `Steer` 输入框（已有后端）。

**验收**：`/api/projects/:id/sessions/tree` 返回 4 个 sessionId；UI 4 tab 切换不丢历史；abort 立即停流。

### F6 · Review 修复闭环（P0） ⭐

**目标**：`fixReview` 真正改文件并自动重审。

**实现**：

```tsx
// src/agents/review-agent.ts
export async function fixReview(ctx: AgentCtx, defects: Defect[]) {
  const ws = paths.workspace(ctx.projectId)
  // 1) 让 dev session 修复（用真实 workspace_write tool）
  const instr = buildFixInstruction(defects) // 包含 P0/P1 缺陷的精确 file:line
  await piSessionPool.followUp(ctx.projectId, instr) // 走 dev agentType
  // 2) 重新跑静态检查
  const tsc = await execIn(ws, "pnpm exec tsc --noEmit")
  const eslint = await execIn(ws, "pnpm exec eslint .")
  // 3) 写新版审查报告
  return await writeReviewReport(ctx.projectId, { tsc, eslint, defects })
}
```

**修 lint/audit 必崩**：

- 把 `pnpm lint` 改为 `pnpm exec eslint . --max-warnings=0`，工具不存在时通过 `execIn` 的 `code !== 0 && stderr.includes('not found')` 判定 → 标 `skipped` 而非 `failed`。
- 删除 `pnpm audit`（用户工作区无 lockfile），改为可选项，仅当存在 `pnpm-lock.yaml` 才跑。
- 删除所有 `.catch(...)` 死代码。

**验收**：构造一个含 1 处 TS 错误的种子，跑 `review/run` → `review/fix` → 工作区文件已改且重审 P0=0。

### F7 · 6 关卡 Auto-Evaluate 联动（P2）

**目标**：`/api/projects/:id/gates/auto-evaluate` 对所有 G0–G6 生效。

**实现**：

- `src/agents/confidence.ts`：补 G0/G4/G5/G6 的判定函数（G0：oneLiner ≥ 8 字 + 用户确认；G4：沙箱起身 ≥ 1 次；G5：reviewReport.hasP0=false；G6：exports 至少 1 个 zip 已生成）。
- `gates.ts`：新增 `autoEvaluate(projectId, gate)` 调 `confidence.compute(gate)`，若 ≥ `Project.hitlThreshold` 自动 `lockGate`。
- 前端 `Settings` 增加 `hitlMode = manual | auto | semi-auto` 切换。

### F8 · 流式传输与内存修正（P1/P2）

- `orchestrator.ts`：`endJob()` 内增加 `jobEvents.delete(jobId)`（与现有 `jobEventTargets` 30s GC 对齐）；事件 buffer 上限 `1000` → 改为 `500` 并加 `dropped` 计数返回给客户端。
- `stream/route.ts`：移除 5 分钟硬切；移除 2s DB 轮询；改为：
    1. 读取 `jobEvents.get(jobId)` 历史 buffer 一次性 flush；
    2. 监听 `jobEventTargets.get(jobId)` 的 `event` 事件转 SSE；
    3. 每 15s 写 `:\n\n` keep-alive；
    4. 收到 `end`/`error` 后 `controller.close()`。
- 新增**断线续传**：客户端带 `?lastEventId=N`，服务端跳过已发事件。

### F9 · `_skeleton` 工作区模板 + 沙箱稳健（P0/P1）

**新建**：`storage/projects/_skeleton/` 实文件目录（提交进 git，含）：

- `package.json`（`dev`: `node server.js`，`lint`: `eslint .`）
- `eslint.config.js`（flat config，最小规则）
- `tsconfig.json`
- `server.js`（Node http，从 `index.html` 读 HTML）
- `index.html`（含独立 `<style>` 块）
- `README.md`

**改 `dev/sandbox/run/route.ts`**：删除 `MINIMAL_SERVER_JS` 巨型模板，统一走 `copyDirSync(_skeleton, workspaceDir)`。

**`child-process.ts`**：env 改白名单：

```tsx
function sanitizedEnv(port: number) {
  const allow = ['PATH','HOME','TMPDIR','NODE_OPTIONS','LANG']
  const e: Record<string,string> = { PORT: String(port) }
  for (const k of allow) if (process.env[k]) e[k] = process.env[k]!
  return e as unknown as NodeJS.ProcessEnv
}
```

### F10 · 配置卫生（P2）

- 删除 `pnpm-workspace.yaml`。
- `.env.example` 端口对齐：`NEXT_PUBLIC_APP_URL=http://localhost:3000`，或 `package.json` `dev` 改 `next dev -p 3002`，二选一并改 README。
- `package.json` 新增 `"engines": { "node": ">=20.10", "pnpm": ">=9" }` 与 `"packageManager": "pnpm@9.x.x"`。
- 把 `@sinclair/typebox` 显式列入 `dependencies`（当前依赖 `pi-ai` 间接拉入，改成显式更稳）。

### F11 · 种子 + 彩蛋链路（P2）

- `scripts/seed-cache.ts`：补全 5 个一句话需求种子（光伏、用电、彩蛋三只小猪 + README 提到的另两只），每条 cache PRD/Design/Code 三态结果。
- `src/app/api/egg/route.ts`：补 v2.0 §10 的 5 步动画事件（`stage1..stage5`）。
- `seeds/*/README.md`：每个种子加一段 30 秒演示脚本。

### F12 · 测试基线（P3）

- 新增 `vitest.config.ts`，单测覆盖：`requirement-agent.parseClarify`、`gates.checkConditions`、`port-pool.acquire/release`、`tools.guardPath`。
- 新增 `playwright.config.ts` + `e2e/full-loop.spec.ts`：`需求 → 设计 → 开发 → 沙箱 → 审查 → 导出` 全链 1 条用例（headless，60s 内）。
- `package.json` scripts 增加：`test:unit`、`test:e2e`、`typecheck`。
- GitHub Actions 模板 `.github/workflows/ci.yml`：node20 + pnpm9 + `typecheck` + `test:unit`。

---

## 4. 验收清单（Claude Code 完成所有任务卡后逐项打勾）

```
[ ] CLAUDE.md / AGENTS.md / docs/pi-sdk-cheatsheet.md / .claude/commands/* 全部存在
[ ] pnpm typecheck 0 错
[ ] pnpm build 0 错
[ ] pnpm tsx scripts/verify-env.ts 通过（DEEPSEEK_API_KEY 可读）
[ ] pnpm tsx scripts/smoke-pi.ts 输出 thinking/text/tool/done 完整事件
[ ] pnpm prisma migrate status 干净，存在 PiSession + Message 表
[ ] /api/projects/:id/sessions/tree 在 4 Agent tab 切换后返回 ≥ 4 个 session
[ ] /api/projects/:id/sessions/abort 调用后 SSE 立即收到 end
[ ] 用 "做一个简易待办清单" 跑完整链路：req → design(5 子产物) → dev → sandbox(可访问) → review(0 P0) → export(zip+docx)
[ ] 沙箱页面 CSS 正确渲染（不出现裸 *{margin:0...} 文本）
[ ] 5 分钟内不被 SSE 强切；jobEvents 在 Job 完成 30s 后释放
[ ] HITL Gates G0–G6 在 auto 模式可自动通关
[ ] 一句话种子 5 个 README 演示脚本能跑
[ ] vitest + playwright 全绿
[ ] CI workflow 通过
```

---

## 5. Pi 0.73 用法红线（写给 Claude Code，必须遵守）

这是**反幻觉**段，Claude Code 修改 Pi 相关代码时**禁止偏离**：

1. **`AgentSession` 创建必须走 `createAgentSession`**（来自 `@mariozechner/pi-coding-agent`），参数顺序与 `session-manager.ts` 现有写法一致；不要自己 `new AgentSession()`，0.73 版没有这个构造器。
2. **`SessionManager.create(workspaceDir, sessionDir)`** 是工厂方法，不要写 `new SessionManager(...)`。
3. **事件名以 Pi 0.73 实际 emit 为准**：`thinking_block_delta` / `text_delta` / `tool_use_block_start` / `tool_use_block_delta` / `tool_use_block_stop` / `message_stop`。前端转译到统一对外名时，映射表写在 `src/lib/pi/event-map.ts`（新建），不要散落各处。
4. **`defineTool` 参数 schema 用 `@mariozechner/pi-ai` 导出的 `Type`**（TypeBox），不要直接 `import {Type} from '@sinclair/typebox'`——版本不一致会被 SDK 校验拒绝（现 `tools.ts` 已正确）。
5. **自定义 Provider** 用 `modelRegistry.registerProvider(name, { api: 'openai-completions' \| 'anthropic' \| 'openai', ... })`，DeepSeek 用 `'openai-completions'`（`/v1/chat/completions` 路径）。
6. **`prompt() / followUp() / steer() / abort() / compact() / setModel() / setThinkingLevel('off'\|'low'\|'high')`** 是 0.73 全部公开 API；不要调用 `chat()` `complete()` 这些不存在的方法。
7. **`session.dispose()`** 必须显式调用，否则 SDK 不释放底层 controller。`PiSessionPool.dispose` 已经做对了，新代码沿用。
8. **`ResourceLoader`** 必须传 `noExtensions/noSkills/noPromptTemplates/noThemes/noContextFiles: true`（除非你确定要走 Pi 自带 skill 体系）。
9. **session 持久化目录** 用 `path.join(workspaceDir, '.pi-session')`，不要换；前端 `Sessions` 页面默认从这个路径读取 tree。

---

## 6. 附录：必须新增/删除的文件清单

**新增**（共 ~22 个）：

```
CLAUDE.md
AGENTS.md
docs/pi-sdk-cheatsheet.md
docs/ARCHITECTURE.md
.claude/commands/prd-draft.md
.claude/commands/design-suite.md
.claude/commands/dev-feature.md
.claude/commands/review-fix-loop.md
.claude/commands/gate-check.md
src/components/shell/NavSidebar.tsx
src/components/workbench/ChatDock.tsx
src/components/workbench/AgentTabs.tsx
src/components/workbench/SessionSidebar.tsx
src/components/workbench/use-agent-stream.ts
src/lib/pi/event-map.ts
src/server/ws.ts (或 server.ts)
src/app/api/projects/[id]/sessions/abort/route.ts
storage/projects/_skeleton/{package.json,eslint.config.js,tsconfig.json,server.js,index.html,README.md}
vitest.config.ts
playwright.config.ts
e2e/full-loop.spec.ts
.github/workflows/ci.yml
prisma/migrations/<new>/migration.sql
```

**删除**：

```
pnpm-workspace.yaml
src/app/api/projects/[id]/dev/sandbox/run/route.ts 中 MINIMAL_SERVER_JS 常量及 ensureSkeletonWorkspace 动态分支
src/agents/review-agent.ts 中 4 处 .catch 死代码
src/components/workbench/agent-chat.tsx 中重复 `tool-call`(中划线) 事件分支
```

**改写**（局部）：

- `src/config/models.ts:14` —— `deepseek-v4-pro` → `deepseek-chat`
- `src/lib/pi/registry.ts:78` —— `customOnly` 加入 `"deepseek"`
- `src/agents/dev-agent.ts:30` —— 同上
- `prisma/schema.prisma` —— 加 `PiSession` `Message`，扩 `GateType`
- `.env.example` —— 端口对齐 + `PI_DEFAULT_MODEL=deepseek-chat`
- `package.json` —— 加 `ws @types/ws @sinclair/typebox engines packageManager`，`scripts` 加 `typecheck/test:unit/test:e2e/dev`(带 `-p 3002` 视选择)

---

## 7. 给 Claude Code 的执行口令

> 你现在是该仓库的资深维护者。请按上方 §3 的 F0 → F12 顺序，每张卡片一个独立提交（commit message 格式 `fix(F<n>): <短描述>` 或 `feat(F<n>): ...`），每提交前本地跑 `pnpm typecheck && pnpm build`，全过再下一张。F0 / F6 / F9 是阻塞演示的 P0，请优先完成并立刻冒烟一次完整链路（§4 第 9 项）。任何 §5 的 Pi API 红线不得违反；遇到 SDK 行为与文档不一致，停下来在 commit 中加 `BLOCKED:` 前缀并写明现象，**不要**自作主张换 API。完成全部 F 卡后，按 §4 验收清单逐项截图/日志贴进最终 PR 描述。
> 

---

## 8. 用户体验补丁卡（H 段，基于实跑反馈追加）

以下 6 张卡片来自实际跑通后用户反馈的痛点，**全部为 P0/P1**，建议在 F0/F4/F5/F6/F9 完成后立刻插队执行。命名沿用 §3 风格，`H` 表示 "Human-experience hardening"。

### H1 · UI 原型升级到"成品级"（design-ui 子产物重构） 【P0】

**问题**：当前 `design-ui` 只产出 Markdown 线框描述，沙箱里跑出来的 UI 几乎没交互、单页空白。

**目标**：design-ui 直接产出 **可立即在沙箱跑的多页交互式 HTML 原型**，做到「打开就能点、能填、能切换、能回流」。

**改动**：

1) **新增产物形态**：`design-ui` 不再只写一份 `design-ui.md`，而是同时落地一个完整目录到 `storage/projects/{id}/design/ui-prototype/`：

```
index.html              ← 入口（含路由/导航）
pages/
  dashboard.html
  list.html
  detail.html
  settings.html
  empty-error.html      ← 空态/加载态/错误态汇总演示页
components/
  nav.html, modal.html, toast.html, drawer.html
assets/
  app.js                ← 路由 + 状态机 + mock 数据
  style.css             ← 设计 token（颜色/间距/字号）
README.md               ← 页面索引 + 交互清单
```

2) **技术栈强约束**（写进 `src/agents/prompts/design.ts` 的 `DESIGN_UI_SYSTEM`）：

- 必须用 **Tailwind CDN（v3）+ Alpine.js（CDN）+ lucide-icons（CDN）**，零构建即可运行；
- 禁止使用 React/Vue 编译产物；
- 必须含 **mock 数据**（`assets/mock.json`）驱动列表/详情，让点击 → 跳转 → 数据变化形成完整闭环；
- 必须实现至少 **8 类交互**：导航跳转、表单校验、模态框、抽屉、Toast、表格排序/筛选、Tab 切换、骨架屏/加载态。

3) **新增 Pi 自定义 tool**（`src/lib/pi/tools.ts` 加 `ui_template_pack`）：把上面的目录骨架与 Tailwind/Alpine boilerplate 作为 "参考模板" 注入，让模型基于模板填充而非从零写——直接消除 "页面太空" 的根因。

4) **沙箱挂载方式**：`dev/sandbox/run` 启动时优先把 `design/ui-prototype/` 静态映射到 `/preview/*`（用 `_skeleton/server.js` 的静态目录中间件），让用户**进入开发前就能看到原型**。

5) **prompt 关键段**（追加到 `DESIGN_UI_SYSTEM`，硬约束）：

```
- 每个页面必须 ≥ 60 个 DOM 节点，至少 1 个表单、1 个列表、1 个状态切换；
- 必须实现真实的客户端路由（hash 或 history），导航点击不刷新整页；
- 必须包含一个 "theme toggle"（亮/暗）和一个 "语言切换"（中/英 mock）；
- 禁止占位文字 "Lorem ipsum"，所有文案围绕 PRD 中的功能 F1..Fn；
- 输出 ≥ 5 个页面，并在 README.md 列出每个页面的交互点（≥ 3 个 / 页）。
```

**验收**：跑「做一个简易待办清单」种子 → 进入 `/preview/index.html` → 至少能：①新增/编辑/删除 todo、②勾选完成切换状态、③筛选 All/Active/Done、④亮/暗主题切换、⑤刷新后数据保留（localStorage mock）。

### H2 · 设计文档防截断（流式续写 + 长文分段） 【P0】

**问题**：`design-detail` / `design-api` 经常输出到一半被截断，文件不完整。

**根因**：

- `LLM_CONFIG` 未显式设 `maxTokens`，DeepSeek 默认 4096 token；
- 现 `design-agent.ts` 用一次性 `chat()` 生成完整文件，超限即被截；
- 没有 "未结束 → 自动续写" 的兜底；
- 没有按章节分批写入。

**改动**：

1) `src/config/models.ts`：deepseek 增加 `maxTokens: 8192`、`reasoner` 子项 `maxTokens: 8192`；同步在 `registry.ts` 注册时透传。

2) `src/agents/design-agent.ts` 全面改为**流式 + 分段**：每个子产物（summary/detail/api/db/ui）：

- 用 `piSessionPool.followUp` 让 Agent 用 `workspace_write` 主动**追加**写入目标文件（而不是把全文塞回 stdout）；
- 在 system prompt 中要求 "每写完一节 → 立刻调 `workspace_write` 追加 → 然后写下一节"；这样单次 token 限制只影响当前段落，不影响整篇文档。

3) **结束标记 + 自动续写**：每个子产物的 prompt 末尾要求 Agent 在文件结尾输出 `<!-- END:design-{subtype} -->` 标记；服务端写入后扫描该标记，未出现则自动 `followUp("请从上次中断处继续，不要重复已写内容，直到输出 END 标记")`，最多续写 3 次。

4) **章节级骨架**（写进 prompt）：design-detail 必须含 8 节固定大纲（系统架构/模块划分/数据流/关键算法/异常处理/性能/安全/部署），每节写完立刻 `workspace_write` 追加。

5) **前端进度反馈**：把 `workspace_write` 这个 tool_use 事件透传到 ChatDock，让用户看到 "正在写入第 3/8 节: 数据流"（见 H3）。

6) `src/app/api/projects/[id]/design/generate/route.ts` 增加 `?stream=true` 支持，response body 是 SSE，前端订阅。

**验收**：1000 行级 [design-detail.md](http://design-detail.md) 生成完整，结尾必含 `<!-- END:design-detail -->`；8 节标题全部存在；任何子产物的 token 截断率 = 0（连续跑 5 次种子）。

### H3 · 全局进度面板（PhaseTracker + 心跳 + token 计数） 【P1】

**问题**：AI 生成时用户只看到 "…" 或一片空白，不知道在做什么、还要多久。

**目标**：ChatDock 顶部固定一条 **PhaseTracker**，实时显示当前阶段、已用时、当前在跑的 tool、token 计数。

**改动**：

1) **后端事件协议扩充**（写进 `src/lib/pi/event-map.ts`，F3 新建文件中）：

```tsx
type AgentPhase =
  | "queued"       // 已入队
  | "thinking"     // 正在思考
  | "tool_running" // 调工具中
  | "writing"      // 写文件中
  | "reviewing"    // 自检中
  | "done"
  | "error"
  | "aborted"
```

`orchestrator.ts` 在每个阶段切换时 emit `phase` 事件 `{ phase, label, percent?, tokenIn, tokenOut, elapsedMs }`。

2) **新增组件** `src/components/workbench/PhaseTracker.tsx`：

- 横向 5 段步进条（thinking → tool → writing → reviewing → done）；
- 当前段闪烁 + 子标签（如 "调用 workspace_write: [design-detail.md](http://design-detail.md)"）；
- 右侧实时 token in/out + 已用时；
- 双击当前段展开**实时心跳日志**（最近 10 条 tool_use 摘要）。

3) **心跳补丁**：`stream/route.ts` 每 10s 写一条 `{event:'heartbeat', elapsedMs}`，让前端在 0 输出场景也能保活计时器。

4) **token 计数**：dev-agent 监听 Pi 的 `usage` 事件累计；其他 agent 在 `chat()`/`stream()` 完成时上报。

5) **进度持久化**：phase 写入 `Job.meta.phase` 字段（schema 加 `Job.meta String?`），刷新页面也能看到当前阶段。

**验收**：跑 design-detail 全程能看到步进条 5 段顺序点亮；心跳从不断超过 12s；abort 后立刻显示 `aborted` 红色态。

### H4 · 显式 Stop 按钮 + Abort 主入口（P0）

**问题**：当前没法真正终止运行；F5 的 abort 路由是后端的，前端入口缺失。

**目标**：所有正在 streaming 的 Agent 顶部都有红色 **Stop** 按钮，1 次点击 ≤ 1s 完成中止。

**改动**：

1) **前端**：`src/components/workbench/AgentChat.tsx` 在 streaming 状态下，把 PhaseTracker 右上角的占位按钮替换为 `<StopButton/>`：

- 单击 → 立刻 dispatch `setStreaming:false` + `addSystem:"⏹ 已请求终止…"`；
- 同时 `fetch('/api/projects/:id/sessions/abort', {method:'POST'})` 与 `/api/jobs/:jobId/cancel`（新增，见下）；
- 1.5s 内未收到 `aborted` 事件则提示 "终止超时，强制断流" 并 close EventSource。

2) **新增路由** `src/app/api/jobs/[id]/cancel/route.ts`：

- 设 `Job.status = 'cancelled'`；
- 调 `piSessionPool.get(projectId)?.session.abort()`；
- 通过 `jobEventTargets.get(jobId)?.dispatchEvent(...)` 立即 push `aborted` + `end`。

3) **快捷键**：`Esc` 在 ChatDock 聚焦时等价 Stop（写在 ChatDock 上）。

4) **中止后清理**：`runDev` 等 agent 函数顶部 `try/finally` 中无论成功失败都把当前 Job 状态写回，避免 `running` 死锁。

5) **前端可视**：被中止的 Agent 消息块加红色左边框 + "已中止" 角标；下方出现"重试"按钮一键 followUp 同样指令。

**验收**：在 dev-agent 跑到一半点 Stop，≤ 1.5s 内 ChatDock 显示 "已中止"，Pi 进程不再产生新 tool_use 事件，sandbox 子进程保留（不要误杀）。

### H5 · 阶段锁定 + 流转 UI（StageBar + Lock 主入口） 【P0】

**问题**：dev 阶段已经生成代码，但**没有按钮把当前阶段锁定，更没有让项目流转到 review/export**；6 关卡逻辑只在后端，UI 没暴露。

**目标**：Workbench 底部固定一条 **StageBar**，显示当前阶段 + 下一步可锁的关卡 + Lock/Reopen 按钮。

**改动**：

1) **新增组件** `src/components/workbench/StageBar.tsx`（高度 56px，固定在 Workbench 底部）：

- 左：6 段彩色进度条（G0..G6），当前段高亮，已锁段绿勾；
- 中：当前阶段任务摘要（"代码已生成 12 个文件，待锁定 G3 → 进入审查"）；
- 右：主按钮 `Lock G{n}` / `Reopen G{n}` / `Auto-evaluate`；
- 关卡条件未达标时按钮 disabled，hover 显示原因（来自 `gates.checkConditions` 的 reasons 数组）。

2) **新增/补全条件**（联动 F2 的 G0..G6 扩张）：

- **G3（开发→审查）**：`workspace/` 下存在 `package.json` + 至少 1 个 `*.js/ts/html`，且最近一次 `dev/sandbox/run` 起身成功；
- **G4（审查→导出）**：`reviewReport.hasP0 = false`；
- **G5（导出→交付）**：至少有一个 `exports/` 文件已生成。
- 把这些写进 `src/lib/hitl/gates.ts` 的 `checkConditions(...)`。

3) **新增 "代码已生成" 检测**：`src/lib/dev/workspace-status.ts` 输出 `{fileCount, hasPackageJson, lastSandboxOk, totalLOC}`，被 G3 检查使用，也被 StageBar 顶部 chip 显示。

4) **路由收敛**：`/api/projects/[id]/gates/[gate]/lock` 已存在，前端 StageBar 直调；锁定成功 → `Project.currentStage` 自动推进 → 中央 Workbench 自动切到下一阶段 tab。

5) **"快速 Demo 模式"**：Settings 里加一个 "一键过 G0..G6" 按钮（hitlMode=auto + threshold=0.6），现场录屏可用。

**验收**：dev 完成后 StageBar 主按钮变绿可点击 → 1 次点击 → 自动进入 review tab；UI 不需要刷新；后端 `Project.currentStage` 字段从 `dev` 变 `review`。

### H6 · 代码浏览器（Code Browser + Monaco） 【P1】

**问题**：dev 阶段生成的代码，用户无处查看（只能等到 export zip）。

**目标**：Workbench 中央 "开发" 阶段加一个 **三列代码浏览器**：左文件树 / 中编辑器 / 右沙箱预览。

**改动**：

1) **新增 API**：

- `GET /api/projects/[id]/files`：递归列出 `workspace/` 下文件（用现成的 `tools.ts:walk`），返回 `{path, size, mtime, isDirectory}` 数组；
- `GET /api/projects/[id]/files/[...path]`：读取单文件内容（限制 ≤ 1MB，> 1MB 返回 metadata + 截断提示）；guardPath 必须复用 `tools.ts:guardPath`。

2) **新增组件** `src/components/workbench/CodeBrowser.tsx`：

- 左：树形文件视图（用 react-aria 或简化自实现），按目录折叠；点击文件 → fetch 内容；
- 中：Monaco editor（`@monaco-editor/react`，新增依赖）只读模式，按扩展名自动选语法；
- 右：iframe 嵌入 `sandbox.url`（已有），与编辑器并排；编辑器顶部按钮 "在沙箱中打开此文件路径" 跳转 iframe。

3) **路由集成**：`src/app/projects/[id]/dev/page.tsx`（如不存在则新建）默认渲染 `<CodeBrowser/>`；中央 Workbench 阶段切换时 dev 段挂载本组件。

4) **diff 视图**（可选 P2）：CodeBrowser 顶部加 "Show diff vs last review" 切换，调用 git 或自己用 `simple-git`（已在 deps）对比 workspace 与上一个 commit。

5) **下载/复制单文件**：编辑器顶部 "Copy / Download" 按钮一键导出。

6) **依赖**：`pnpm add @monaco-editor/react monaco-editor`。

**验收**：dev 跑完 → 切到代码浏览器 → 看到完整文件树 → 点击 `index.html` → Monaco 显示带语法高亮 → 右侧沙箱同时渲染对应页面；`>1MB` 文件显示截断提示且不卡 UI。

---

## 9. 验收清单补丁（追加到 §4）

```
[ ] design/ui-prototype/ 至少含 5 个 .html，README 列出每页 ≥ 3 个交互点
[ ] 待办清单种子在沙箱可完成新增/编辑/删除/筛选/主题切换 5 个流程
[ ] design-detail.md 文件结尾含 <!-- END:design-detail -->，8 节齐全，无截断
[ ] ChatDock 顶部 PhaseTracker 5 段步进条可见，心跳 ≤ 12s
[ ] streaming 时显式 Stop 按钮可见；点击后 ≤ 1.5s 收到 aborted
[ ] StageBar 锁定按钮在 G0..G6 各阶段条件达成时可点击；不达标时 hover 显示原因
[ ] dev 完成后能在 Code Browser 左侧文件树看到全部 workspace 文件，Monaco 高亮显示
[ ] Stop 后 sandbox 子进程不被误杀（仍可访问 /preview）
[ ] hitl=auto + threshold=0.6 时，跑种子可全自动 G0→G6
```

---

## 10. 优先级矩阵更新（覆盖 §0.2）

| 级别 | 新增条目 |
| --- | --- |
| **P0**（阻塞演示） | H1 UI 原型成品级、H2 设计防截断、H4 Stop 按钮、H5 StageBar 阶段锁 |
| **P1**（v2.0 一致性 + 体验） | H3 PhaseTracker、H6 Code Browser |

H 段总计 6 张卡，预估工作量：H1 1 天 / H2 0.5 天 / H3 0.5 天 / H4 0.5 天 / H5 0.5 天 / H6 1 天 = **约 4 个工作日**。

---

## 11. 给 Claude Code 的执行口令（更新版）

> 建议执行顺序：**F0 → F2 → F9 → H2 → H1 → F5 → F6 → H4 → H5 → H3 → H6 → F3 → F4 → F7 → F8 → F1 → F10 → F11 → F12**。
> 

> 
> 

> 这条顺序的理由：先把 Pi 注册（F0）+ Schema（F2）+ skeleton（F9）打底；然后 H2 防截断让 H1 的多文件 UI 原型不会被切成残废；H1 出成果后立刻验证 H4/H5 的中止与流转；H3/H6 是用户感知层；剩下 F 段按原顺序补完。
> 

> 
> 

> 每张 H 卡片同样适用 §3 顶部的执行规则（一卡一 PR、提交前 typecheck+build、不偏离 §5 Pi 红线）。H1/H2 必须用真实种子"做一个简易待办清单"做端到端验证并把视频/截图贴回 PR。
> 

---

*以上修复完成 = 平台与 v2.0 PRD 一致性 ≥ 95%，可直接进入大赛 Demo 录制阶段。*