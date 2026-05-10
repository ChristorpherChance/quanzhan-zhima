# 全栈智码 v2.0 · Fix-Pack #2（接力修复指令 for Claude Code）

> 本文档是在 [全栈智码 v2.0 · Code Review & Fix-Pack（喂给 Claude Code 的修复指令）](https://www.notion.so/v2-0-Code-Review-Fix-Pack-Claude-Code-a2d32ed0e7e8414990ed660fc9069059?pvs=21) 之后的**接力修复包**。前一轮 Claude Code 已完成 F0–F12 + H1–H6 的大部分内容（仓库 master HEAD `d366d86`），但实跑后仍有 6 类阻塞性体验问题，本文按 I0–I7 任务卡形式给出可直接执行的修复指令。
**使用方式**：把本页整体粘贴给 Claude Code，按 §10 的顺序执行；§9 的术语改名是全局贯穿项，每张卡都要遵守。
> 

---

## 0. 实跑反馈现状判定

基于对 master `d366d86` 的逐文件复核（gates.ts / dev-agent.ts / design-agent.ts / sandbox/run/route.ts / artifacts/.../confirm/route.ts / exports/[type]/route.ts），定位到下列 **7 个根因**：

<table header-row="true"><tr><td>用户反馈</td><td>根因（带文件证据）</td><td>任务卡</td><td>级别</td></tr>

<tr><td>① PRD 锁定失败 "关卡条件未满足"</td><td>`gates.ts:32` G1 要求 `prd.locked===true`，但 UI "锁定 PRD" 直接调 `/gates/G1/lock`，**从未调用 `/artifacts/prd/confirm`**（只有 confirm 才会把 `locked` 写成 true）</td><td>**I1**</td><td>P0</td></tr>

<tr><td>① 其他阶段同类问题</td><td>G2 同样要求 5 个 design- *子产物 `locked=true`；G4 要求 review-report 存在；UI 全部缺少 "先 confirm 再 lock" 的合并按钮</td><td>I1**</td><td>P0</td></tr>

<tr><td>① 关卡 → 阶段</td><td>UI 文案 / API 错误码 / Notion 文档 "关卡" 字样需统一改 "阶段"</td><td>**I0**（贯穿）</td><td>P1</td></tr>

<tr><td>① 需求阶段缺上传文档入口</td><td>`requirement` 页只有对话框，没有 file input / drop zone；后端无 `/api/projects/[id]/requirement/upload`</td><td>**I7**</td><td>P1</td></tr>

<tr><td>② 对话框滚动不跟随</td><td>`AgentChat.tsx` 的 `messagesEndRef` 大概率没在 `text_delta` 流式更新时重新 scrollIntoView，且没区分"用户主动上滑/自动跟随"</td><td>**I2**</td><td>P0</td></tr>

<tr><td>③ 设计一键生成无序、超时、卡死</td><td>`design-agent.ts:84-89` `generate()` 只读 PRD，**从不读已生成的 summary/detail/api**；当前 "一键生成" 大概率 Promise.all 并发或共用一个 240s budget；db/ui 排在最后被截</td><td>**I3**</td><td>P0</td></tr>

<tr><td>③ 设计右侧栏耗时不保留</td><td>PhaseTracker 在每个子产物 phase 切换时重置 elapsed 计时器，没把上一个子产物的耗时写进 `Job.meta` 累计展示</td><td>**I3**</td><td>P1</td></tr>

<tr><td>④ 开发预览看不到效果</td><td>`sandbox/run/route.ts:54` 跑 `npm run dev`，工作区用的是 `_skeleton/server.js`——而 `_skeleton/server.js` 是返回硬编码 HTML 的占位服务，**根本不读取 dev-agent 生成的真实代码**；同时 dev-agent 把 `code` artifact 的 `storagePath` 写成 `workspaceDir`（目录而非文件）</td><td>**I4**</td><td>P0</td></tr>

<tr><td>④ 开发阶段锁定无效</td><td>`gates.ts:55` G3 要求 `Job.type="sandbox-run" status="succeeded"`；但 `sandbox/run/route.ts` **从头到尾没有 `prisma.job.create({type:"sandbox-run"})`**——这条 Job 永远不存在，G3 永远失败</td><td>**I4**</td><td>**P0 硬 bug**</td></tr>

<tr><td>⑤ 审查阶段预检</td><td>`review-agent.ts` 输出 `review-report` artifact 的 `meta.hasP0` 字段必须真实写入；review 自检命令在生成项目里依然可能 "工具未安装"；G4 lock 也需要先 confirm review-report</td><td>**I5**</td><td>P1</td></tr>

<tr><td>⑥ docx/pdf 导出失败</td><td>`exports/[type]/route.ts` 全部走 `pandocConvert`，未装 pandoc 即报 "pandoc 未安装或失败"；缺纯 Node 实现兜底</td><td>**I6**</td><td>P0</td></tr></table>

### 0.1 优先级

- **P0（阻塞演示）**：I1 阶段锁定 / I4 开发预览+G3 / I6 docx+pdf / I3 设计串行 / I2 滚动跟随
- **P1**：I0 改名、I5 审查预检、I7 需求上传

---

## I0 · 全局改名「关卡 → 阶段」（贯穿全 PR）

**目标**：用户层完全消除 "关卡" 字样，统一为 "阶段"；代码内部标识 `gate / G0..G6` 保持不变（避免大规模重命名风险）。

**改动**：

1) 用户文案统一替换：

- `src/lib/errors.ts` 或 `gates.ts:84` `AppError("E_GATE_CLOSED", "关卡条件未满足", ...)` → `"阶段条件未满足"`
- `StageBar.tsx`、`AgentChat.tsx`、`Settings.tsx` 中所有出现 `关卡` 的字符串改 `阶段`
- tooltip / hover reasons 中 `"未锁定：design-xxx"` → `"未完成：design-xxx"`
- 主按钮文案：`Lock G3` → `完成开发阶段`，`Reopen G3` → `重新打开阶段`

2) 错误码内部保持 `E_GATE_CLOSED`（兼容已部署日志），但 `message` 与 `reasons` 全部走 "阶段" 文案。

3) 新增 `src/lib/i18n/stage-labels.ts` 集中管理，避免硬编码：

```tsx
export const STAGE_LABEL: Record<GateType, string> = {
  G0: "立项", G1: "需求", G2: "设计", G3: "开发",
  G4: "审查", G5: "导出", G6: "交付",
}
export const stageActionLabel = (g: GateType) => `完成${STAGE_LABEL[g]}阶段`
```

4) Notion 文档与 `CLAUDE.md` / `.claude/commands/gate-check.md` 中面向用户的句子改 "阶段"，但函数名 `lockGate / checkConditions / GateType` 保留。

**验收**：UI 全局 grep `关卡` 命中 0；功能完全不受影响。

---

## I1 · 阶段锁定主流程修复（P0 ⭐）

**目标**：用户在每个阶段点 "完成 X 阶段" 按钮 → **一键完成 "confirm artifact + lockGate"**，不再要求用户先点 "确认 PRD" 再点 "锁定 PRD"。

### I1.1 后端：合并锁阶段为单一 endpoint

**新建** `src/app/api/projects/[id]/stages/[gate]/complete/route.ts`：

```tsx
export const runtime = "nodejs"
import { withErrorBoundary, AppError } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"
import { lockGate, type GateType } from "@/lib/hitl/gates"

// 把每个 gate 需要 confirm 的 artifact type 列清楚
const ARTIFACTS_PER_GATE: Record<GateType, string[]> = {
  G0: [],
  G1: ["prd"],
  G2: ["design-summary", "design-detail", "design-api", "design-db", "design-ui"],
  G3: ["code"],
  G4: ["review-report"],
  G5: [],
  G6: [],
}

export const POST = withErrorBoundary(async (req, { params }) => {
  const gate = params.gate as GateType
  const types = ARTIFACTS_PER_GATE[gate] ?? []

  // 1) 把每个相关 artifact 最新版自动 confirm（locked=true）
  for (const t of types) {
    const latest = await prisma.artifact.findFirst({
      where: { projectId: params.id, type: t },
      orderBy: { version: "desc" },
    })
    if (!latest) throw new AppError("E_GATE_CLOSED", `阶段条件未满足`, { reasons: [`缺少产物：${t}`] })
    if (!latest.locked) {
      // 直接把现有最新版 locked 改 true（不再生成新版本，避免存储膨胀）
      await prisma.artifact.update({ where: { id: latest.id }, data: { locked: true } })
    }
  }

  // 2) 调 lockGate（会再做一次 checkConditions 兜底）
  const r = await lockGate(params.id, gate)
  return r
})
```

### I1.2 修 `gates.ts` 让 G3 不再依赖 sandbox-run job 的存在性

配合 I4，把 G3 的 `sandbox-run` 检查改为 "`code` artifact 存在 + workspace 实际存在 `index.html`/`server.js`"，避免与 sandbox 启动强耦合：

```tsx
} else if (gate === "G3") {
  const code = await prisma.artifact.findFirst({
    where: { projectId, type: "code" }, orderBy: { version: "desc" },
  })
  if (!code) reasons.push("未生成代码产物")
  else if (!code.locked) reasons.push("代码未确认")  // 走 stages/G3/complete 自动 confirm
  // 文件级兜底
  const ws = paths.workspace(projectId)
  const hasEntry = await fs.access(`${ws}/index.html`).then(() => true).catch(() => false) ||
                   await fs.access(`${ws}/server.js`).then(() => true).catch(() => false) ||
                   await fs.access(`${ws}/package.json`).then(() => true).catch(() => false)
  if (!hasEntry) reasons.push("工作区缺少入口文件")
}
```

### I1.3 前端：StageBar 主按钮直调 complete

- `src/components/workbench/StageBar.tsx` 主按钮 `onClick` 改为 `POST /api/projects/{id}/stages/{currentGate}/complete`；
- 失败时把 `reasons[]` 渲染成 toast 列表（每条一行 + 点击跳转到对应阶段 tab）；
- 成功后切换 `Project.currentStage` 并自动跳到下一阶段 tab；
- 旧的 "锁定 PRD / 确认 PRD" 单独按钮**全部删除**，仅保留 StageBar 这一个主入口。

### I1.4 兜底：每个阶段 "重新生成" 按钮回退 locked

- 当用户重新生成 PRD/design-x/code 时，自动把对应 artifact 的 `locked=false` 重置（在 requirement-agent / design-agent / dev-agent 写新 artifact 时做）；
- 这避免出现 "已锁定但内容已过时" 的状态漂移。

**验收**：

- 跑"做一个简易待办清单"种子 → 需求阶段生成 PRD → 点 "完成需求阶段" → 1 次成功；
- design 5 子产物全部生成 → 点 "完成设计阶段" → 1 次成功；
- dev 生成代码 → 点 "完成开发阶段" → 1 次成功（不再依赖 sandbox 是否跑过）。

---

## I2 · 对话框自动滚动跟随（P0）

**问题**：流式 `text_delta` 不断追加内容，但滚动条卡在上面。

**根因**：`AgentChat.tsx` 通常只在 `messages.length` 变化时 scroll，但流式增量是在**最后一条消息内部 mutate**，length 不变 → useEffect 不触发。

**改动**（写到 `src/components/workbench/AgentChat.tsx`）：

```tsx
import { useEffect, useRef, useState } from "react"

const scrollRef = useRef<HTMLDivElement>(null)
const [stickToBottom, setStickToBottom] = useState(true)

// 1) 监听用户主动滚动；偏离底部 ≥ 80px 视为脱离跟随
useEffect(() => {
  const el = scrollRef.current; if (!el) return
  const onScroll = () => {
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    setStickToBottom(dist < 80)
  }
  el.addEventListener("scroll", onScroll, { passive: true })
  return () => el.removeEventListener("scroll", onScroll)
}, [])

// 2) 流式更新：把 messages 与最后一条的 text 长度都列入依赖
const lastTextLen = messages.at(-1)?.text?.length ?? 0
useEffect(() => {
  if (!stickToBottom) return
  const el = scrollRef.current; if (!el) return
  // 用 rAF 合并多次 delta，避免抖动
  const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  return () => cancelAnimationFrame(id)
}, [messages.length, lastTextLen, stickToBottom])

// 3) UI：脱离跟随时浮一个 "↓ 回到底部" 小按钮
```

**额外细节**：

- streaming 结束（`end` 事件）后 force scroll 一次；
- abort/error 后保持当前位置；
- ChatDock 顶部 PhaseTracker 不参与滚动容器。

**验收**：连续灌入 1000 个 `text_delta`，滚动条始终贴底；用户上滑后右下角出现 "↓ 回到底部"；点击或新消息块产生时回到底部。

---

## I3 · 设计阶段串行生成 + 上下文累积 + 耗时保留（P0 ⭐）

### I3.1 串行 + 读取已生成产物作为上下文

**根因**：`design-agent.ts:84-89` `generate()` 只读 PRD：

```tsx
const prdPath = paths.prd(ctx.projectId)
prdContent = await fs.readFile(prdPath, "utf-8")
// ❌ 没读已生成的 summary/detail/api/db
```

**改动**：在 `generate()` 顶部按固定顺序加载所有已存在的前置子产物：

```tsx
const SUBTYPE_ORDER = ["summary", "detail", "api", "db", "ui"] as const

async function loadPriorContext(projectId: string, currentSubtype: string): Promise<string> {
  const idx = SUBTYPE_ORDER.indexOf(currentSubtype as typeof SUBTYPE_ORDER[number])
  const parts: string[] = []
  for (let i = 0; i < idx; i++) {
    const t = SUBTYPE_ORDER[i]
    const p = join(paths.design(projectId), `${t}.${t === "ui" ? "html" : "md"}`)
    try {
      const c = await fs.readFile(p, "utf-8")
      parts.push(`## 已生成的 design-${t}（必须严格继承）\n\n${c.slice(0, 8000)}`)
    } catch { /* 该前置产物尚未生成 */ }
  }
  return parts.join("\n\n---\n\n")
}

// streamOnce 调用前的 user message：
const priorCtx = await loadPriorContext(ctx.projectId, subtype)
const userMessage = `# PRD\n\n${prdContent}\n\n${priorCtx ? priorCtx + "\n\n" : ""}# 任务\n请生成 design-${subtype}，必须基于上方 PRD 与已生成内容，禁止与之前的字段/接口/数据流冲突。`
```

### I3.2 新建串行 "一键生成全部" 路由（替代任何并发版本）

**新建** `src/app/api/projects/[id]/design/generate-all/route.ts`：

```tsx
export const runtime = "nodejs"
export const maxDuration = 1800   // 30min
import { withErrorBoundary } from "@/lib/errors"
import { startJob } from "@/agents/orchestrator"
import { generate } from "@/agents/design-agent"

const ORDER = ["summary", "detail", "api", "db", "ui"]

export const POST = withErrorBoundary(async (req, { params }) => {
  // 一个总 Job，内部串行 5 个子任务；每子任务独立 budget
  const job = await startJob({
    projectId: params.id,
    type: "design-all",
    run: async (ctx) => {
      const subResults: Record<string, { ms: number; ok: boolean }> = {}
      for (const sub of ORDER) {
        const t0 = Date.now()
        ctx.send("progress", { phase: `design-${sub}`, message: `开始生成 ${sub}` })
        ctx.setPhase("thinking", `生成 design-${sub}`)
        try {
          await withTimeout(generate(ctx, sub), 8 * 60_000)  // 单子产物 8min 上限
          subResults[sub] = { ms: Date.now() - t0, ok: true }
        } catch (e) {
          ctx.send("error", { code: "E_SUBTYPE_FAILED", subtype: sub, message: String((e as Error).message) })
          subResults[sub] = { ms: Date.now() - t0, ok: false }
          // 失败不阻塞后续；但要把已失败子产物 mark 给前端
        }
        ctx.send("progress", { phase: `design-${sub}-done`, elapsedMs: subResults[sub].ms, allTimings: subResults })
      }
      ctx.send("result", { subResults })
    },
  })
  return { jobId: job.id }
})

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rj) => setTimeout(() => rj(new Error(`subtype timeout ${ms}ms`)), ms)),
  ])
}
```

关键点：

- 整体走**单个 Job**但内部 `for await` 串行，确保上一份产物落盘后下一份 `loadPriorContext` 才能读到；
- **每子产物独立 8 分钟 budget**（不再共用 240s）；
- 中间任一失败不阻塞后续（写 error 事件，UI 红角标，最后允许用户单独重试）；
- `maxDuration=1800`（30 分钟），打破前一版的硬上限。

### I3.3 前端：耗时保留

- `src/components/workbench/DesignProgressPanel.tsx`（如不存在则新建）：
    - 维护 `subTimings: Record<subtype, ms>`，从 `progress` 事件的 `allTimings` 字段读取并累计；
    - 即使切换 phase，已完成子产物的耗时**永久显示绿勾 + 耗时**；只有正在跑的子产物显示动态计时器；
    - 失败的子产物显示红色感叹号 + "重新生成此子产物" 按钮。
- 子任务事件订阅：UI 只看 SSE 流，不需要前端拆 5 次请求。

### I3.4 design-agent.ts 收紧防卡死

- `streamOnce` 内部包装 `AbortController`，单次 LLM 调用 ≥ 4 分钟无任何 delta → abort 并抛错；
- `MAX_CONTINUATIONS=3` 改为 `2`，避免 ui/db 在续写循环里耗尽 budget；
- 续写指令模板加 "如已完整请直接输出 END 标记，不要重复"。

**验收**：

- 一键生成 5 个子产物全部成功且按 summary→detail→api→db→ui 顺序；
- design-detail 的内容明显引用 design-summary 的字段名（grep 校验 ≥ 3 个共词）；
- 全程 ≤ 25 分钟，db/ui 不再卡死；
- 右栏 5 段进度，已完成段绿勾且固定显示耗时（如 `summary 1m42s ✓`）。

---

## I4 · 开发阶段：真实预览 + 锁定可用（P0 ⭐ 含 1 个硬 bug）

### I4.1 硬 bug：sandbox/run 不写 Job → G3 永远过不了

**文件**：`src/app/api/projects/[id]/dev/sandbox/run/route.ts`

**修法**：

```tsx
import { prisma } from "@/lib/db/prisma"
// ...
export const POST = withErrorBoundary(async (_req, { params }) => {
  // 早返：复用已运行的
  const existing = getRunning(params.id)
  if (existing) {
    await prisma.job.upsert({
      where: { id: `sb-${params.id}` },
      create: { id: `sb-${params.id}`, projectId: params.id, type: "sandbox-run", status: "succeeded" },
      update: { status: "succeeded" },
    })
    return { url: existing.url, port: existing.port, sandboxId: params.id }
  }

  const workspaceDir = paths.workspace(params.id)
  ensureSkeletonWorkspace(workspaceDir)
  mountPreviewPrototype(params.id, workspaceDir)

  // 创建 Job 占位
  const job = await prisma.job.create({
    data: { projectId: params.id, type: "sandbox-run", status: "running" },
  })
  try {
    const h = await startSandbox({ projectId: params.id, workspaceDir, command: "npm run dev" })
    await prisma.job.update({ where: { id: job.id }, data: { status: "succeeded" } })
    return { url: h.url, port: h.port, sandboxId: params.id, jobId: job.id }
  } catch (e: unknown) {
    await prisma.job.update({ where: { id: job.id }, data: { status: "failed", logs: String((e as Error)?.message) } })
    return { url: null, error: String((e as Error)?.message) }
  }
})
```

### I4.2 真预览：让 `_skeleton/server.js` 真正服务生成的代码

**根因**：当前 `_skeleton/server.js` 是返回硬编码 HTML 的占位服务（`dev-agent.ts:91-99` 那个 MINIMAL_SERVER_JS 也是同样问题）。即使 dev-agent 写了 `index.html` 等真实文件，浏览器仍只看到 "🚀 应用已启动" 占位页。

**改动**：替换 `storage/projects/_skeleton/server.js` 为**真实静态 + SPA fallback**服务：

```jsx
// storage/projects/_skeleton/server.js
const http = require("http")
const fs = require("fs")
const path = require("path")
const PORT = process.env.PORT || 3000
const ROOT = __dirname

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg", ".jpeg": "image/jpeg",
  ".ico":  "image/x-icon",
  ".woff2":"font/woff2",
}

function safeJoin(root, rel) {
  const full = path.normalize(path.join(root, rel))
  if (!full.startsWith(root)) return null
  return full
}

function tryServe(filePath, res) {
  if (!filePath || !fs.existsSync(filePath)) return false
  const stat = fs.statSync(filePath)
  if (stat.isDirectory()) return false
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-store" })
  fs.createReadStream(filePath).pipe(res); return true
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  let p = decodeURIComponent(url.pathname)

  // 1) /preview/* → ui-prototype（H1 设计原型）
  if (p.startsWith("/preview/")) {
    const target = safeJoin(path.join(ROOT, "preview"), p.replace("/preview/", ""))
    if (tryServe(target, res)) return
    if (tryServe(safeJoin(path.join(ROOT, "preview"), "index.html"), res)) return
  }

  // 2) 直接命中 workspace 文件
  if (p === "/") p = "/index.html"
  const direct = safeJoin(ROOT, p)
  if (tryServe(direct, res)) return

  // 3) SPA fallback：根 index.html
  if (tryServe(safeJoin(ROOT, "index.html"), res)) return

  // 4) 404 友好页
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" })
  res.end(`<h1>404</h1><p>${p} 未找到。请确认 dev-agent 已生成 index.html，或访问 <a href="/preview/">/preview/</a>。</p>`)
})
server.listen(PORT, () => console.log(`✓ Sandbox http://localhost:${PORT}  root=${ROOT}`))
```

同时**删除** `dev-agent.ts:91-99` 的 `MINIMAL_SERVER_JS` 常量，fallback 仅 `copyDir(_skeleton, workspaceDir)`，不再写硬编码 HTML。

### I4.3 dev 完成后自动重启 sandbox 让新文件生效

- `runDev` 末尾在写 artifact 之后调用：

```tsx
import { stopSandbox } from "@/lib/sandbox"
// ...
await stopSandbox(ctx.projectId).catch(() => {})
ctx.send("log", { line: "已停止旧沙箱，请点击预览自动重启" })
```

- 前端 `CodeBrowser.tsx` 右侧 iframe：当 SSE 收到 `result`（dev 完成）后，自动 POST `/api/projects/[id]/dev/sandbox/run` 重启 + 刷 iframe。

### I4.4 dev-agent 写出来的 code artifact 的 storagePath 改为合理值

当前 `dev-agent.ts:78-87` 把 `storagePath: workspaceDir` 写成目录路径，导出走 `code/zip` 时还能用，但 G3 文件级兜底（I1.2）需要文件存在性。沿用即可，但加 meta：

```tsx
await prisma.artifact.create({ data: { ..., meta: J.stringify({ entry: "index.html", filesCount }) }})
```

### I4.5 前端代码结构合理性检查

- 在 CodeBrowser 顶部加 "代码体检" 按钮 → POST `/api/projects/[id]/dev/lint`：
    - 仅当 workspace 有 `eslint.config.js` 时跑 `pnpm exec eslint . --max-warnings=0`；
    - 否则做轻量启发式：检查 `index.html` 是否合法、`<script>` 引用文件是否存在、`server.js` 端口是否读 env、是否有 dead require；
    - 输出右侧 "健康分" 0–100 + 修复建议列表（点击直接 followUp 给 dev session）。

**验收**：

- 跑待办清单种子 → dev 跑完 → 自动重启 sandbox → iframe 显示真实带交互的页面（能 add todo）；
- StageBar "完成开发阶段" 按钮变绿可点 → 1 次成功；
- `Job` 表存在一条 `type="sandbox-run" status="succeeded"` 记录。

---

## I5 · 审查阶段预防性修复（P1）

虽然用户暂未跑到，但代码层面已可定位 4 个隐患：

### I5.1 `review-report` artifact 的 `meta.hasP0` 必须真实写入

- `review-agent.ts` 在生成报告时，扫描 defects 中是否含 `priority === "P0"`，写：

```tsx
await upsertArtifact(projectId, "review-report", reportMd, reportPath, {
  hasP0: defects.some(d => d.priority === "P0"),
  defectCount: defects.length,
})
```

- gates.ts:65 已经读 `meta.hasP0`，只要写入就生效。

### I5.2 自检命令避免在没 lockfile 的 workspace 跑 `pnpm audit`

```tsx
const hasLock = await fs.access(`${ws}/pnpm-lock.yaml`).then(()=>true).catch(()=>false)
const hasEslint = await fs.access(`${ws}/eslint.config.js`).then(()=>true).catch(()=>false)
const tsc = await execIn(ws, "npx -y typescript@5 tsc --noEmit").catch(() => ({ code: 127 }))
const eslint = hasEslint ? await execIn(ws, "pnpm exec eslint .") : { code: 0, stdout: "skipped" }
const audit = hasLock ? await execIn(ws, "pnpm audit --json") : { code: 0, stdout: "skipped" }
```

- `code === 127` / `"not found"` 一律映射为 `skipped`，不计入缺陷数。

### I5.3 修复闭环：fixReview 必须等修复 + 重审完成才返回

- 沿用 Fix-Pack #1 F6 思路，但确保 `piSessionPool.followUp` 后**再次跑 tsc/eslint** 并把新报告 upsert（versions++）；
- 如果第二次仍有 P0，写 `meta.hasP0=true` 并暴露给 StageBar，禁止前进 G4。

### I5.4 审查阶段 "完成审查阶段" 按钮

- StageBar G4 按钮调 `/stages/G4/complete`：自动 confirm 最新 `review-report` + lockGate G4；
- 若 `meta.hasP0=true`，按钮 disabled + tooltip "还有 P0 缺陷未修复"。

**验收**：故意写一段含 TS 错误的 dev 输出 → review run 标 P0 → fixReview 触发 dev 修复 → 再次 review P0=0 → "完成审查阶段" 可点。

---

## I6 · docx / pdf 真实导出（P0，去 pandoc 化）

**目标**：彻底拿掉 pandoc 依赖，改用纯 Node 库；导出无需任何系统级安装。

### I6.1 依赖

`pnpm add marked html-to-docx puppeteer`

备选轻量方案（避免 puppeteer ~280MB）：`pdf-lib` + 自渲染。但综合稳定性首选 puppeteer 的 "打印为 PDF"。

### I6.2 新建 `src/lib/export/native.ts`

```tsx
import { marked } from "marked"
import htmlToDocx from "html-to-docx"
import fs from "node:fs/promises"

export async function mdToDocx(mdPath: string, outPath: string) {
  const md = await fs.readFile(mdPath, "utf-8")
  const html = await marked.parse(md)
  const wrapped = `<!doctype html><meta charset="utf-8"><style>body{font-family:'Microsoft Yahei',sans-serif;line-height:1.6;font-size:11pt}h1{font-size:20pt}h2{font-size:16pt}h3{font-size:13pt}code,pre{font-family:Consolas,monospace;background:#f4f4f4}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style><body>${html}</body>`
  const buf = await htmlToDocx(wrapped, undefined, { table: { row: { cantSplit: true }}, footer: true, pageNumber: true })
  await fs.writeFile(outPath, buf as Buffer)
}

export async function mdToPdf(mdPath: string, outPath: string) {
  // 延迟 import，避免冷启动加载 puppeteer
  const { default: puppeteer } = await import("puppeteer")
  const md = await fs.readFile(mdPath, "utf-8")
  const html = await marked.parse(md)
  const wrapped = `<!doctype html><meta charset="utf-8"><style>body{font-family:'Microsoft Yahei',sans-serif;line-height:1.6;font-size:11pt;padding:24mm}@page{size:A4;margin:0}h1{font-size:22pt}h2{font-size:17pt}h3{font-size:13pt}code,pre{font-family:Consolas;background:#f4f4f4;padding:2px 4px;border-radius:3px}pre{padding:8px;overflow-x:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px}</style><body>${html}</body>`
  const browser = await puppeteer.launch({ args: ["--no-sandbox","--disable-dev-shm-usage"] })
  try {
    const page = await browser.newPage()
    await page.setContent(wrapped, { waitUntil: "networkidle0" })
    await page.pdf({ path: outPath, format: "A4", printBackground: true, margin: { top:"20mm", bottom:"20mm", left:"20mm", right:"20mm" } })
  } finally { await browser.close() }
}
```

### I6.3 `exports/[type]/route.ts` 改造

替换所有 `pandocConvert(...)` 调用为：

```tsx
import { mdToDocx, mdToPdf } from "@/lib/export/native"
// ...
if (fmt === "docx") await mdToDocx(srcMd, outPath)
else if (fmt === "pdf") await mdToPdf(srcMd, outPath)
```

保留旧 pandoc 模块作为 "高级模式" 兜底（环境变量 `EXPORT_USE_PANDOC=1` 时启用），但默认走 native。

### I6.4 大文件 / 中文字体

- puppeteer 的 PDF 默认字体在 Linux 服务器可能缺中文 → Dockerfile / docs/[EXPORT.md](http://EXPORT.md) 注明：服务器侧需 `apt-get install -y fonts-noto-cjk`；MacOS/Windows 自带中文字体可直接跑。
- 把这条说明写进 `docs/EXPORT.md`（新建）。

### I6.5 前端「导出包」一键面板

- `src/app/projects/[id]/export/page.tsx`：4 张卡（PRD / 设计 / 代码 / 审查），每张含 md/docx/pdf/zip 格式勾选，点 "开始打包" → 进度条 → 下载链接表；
- 失败项保留原 `error` 字段，但带 "重试该格式" 按钮。

**验收**：在没装 pandoc 的全新机器上，PRD docx + PRD pdf + design 全包 docx + review xlsx + code zip 全部成功；中文不乱码。

---

## I7 · 需求阶段：上传文档作为补充上下文（P1）

### I7.1 后端

**新建** `src/app/api/projects/[id]/requirement/upload/route.ts`：

- 接受 multipart/form-data，支持 `.md / .txt / .docx / .pdf`，单文件 ≤ 10MB；
- 落地到 `storage/projects/{id}/uploads/{uuid}.{ext}`；
- 解析为纯文本：
    - md/txt：直接读
    - docx：`mammoth.extractRawText`
    - pdf：`pdf-parse`
- 写一条 `Artifact(type="requirement-upload", storagePath=...)` 索引；解析后的纯文本另存 `.txt` 同名文件，避免重复解析；
- 返回 `{ uploadId, parsedTextPreview, charCount }`。

依赖：`pnpm add mammoth pdf-parse`

### I7.2 requirement-agent 读取上传内容作为 system 上下文

```tsx
// requirement-agent.ts.draft / clarify 顶部
const uploads = await prisma.artifact.findMany({
  where: { projectId, type: "requirement-upload" }, orderBy: { createdAt: "desc" }, take: 5,
})
const extra = (await Promise.all(uploads.map(async u => {
  const txt = await fs.readFile(u.storagePath + ".txt", "utf-8")
  return `## 用户上传：${path.basename(u.storagePath)}\n\n${txt.slice(0, 8000)}`
}))).join("\n\n")
// 拼到 user message 顶部
```

### I7.3 前端

- `src/components/workbench/RequirementUploader.tsx`：drop zone + 文件列表 + 解析进度 + 删除按钮；
- 嵌入 `requirement` 阶段顶部，紧贴对话框；
- 上传后自动在对话框 system 区显示 "已附加上下文：合同 v3.docx (2.4 万字符)"，但不污染用户消息历史。

**验收**：上传一份现实业务文档（如运营手册.docx）→ 在对话里说 "基于上传文档生成 PRD" → 生成的 PRD 明显引用文档内的术语/字段。

---

## 8. 验收清单（接力修复包整体跑完后逐项打勾）

```
[ ] 全 UI grep "关卡" 命中 0；功能不变
[ ] 跑 "做一个简易待办清单" 种子，5 个阶段按钮顺序点击全部一次成功
[ ] /api/projects/{id}/stages/G1/complete 返回 200，无需先调 confirm
[ ] PRD/design-x/code/review-report 重新生成时 locked 自动重置
[ ] 对话流式时滚动条贴底；用户上滑后出现 "↓ 回到底部"
[ ] 设计一键生成：summary→detail→api→db→ui 顺序日志可见，每子产物独立耗时显示
[ ] design-detail.md 出现 design-summary 中 ≥ 3 个共词（grep 验证）
[ ] 设计右栏完成项绿勾 + 耗时永久显示，不会因切 phase 重置
[ ] dev 完成后 sandbox 自动重启，iframe 渲染真实生成代码（含交互）
[ ] Job 表存在 type=sandbox-run status=succeeded 记录
[ ] StageBar 完成开发阶段按钮一次点击成功
[ ] review 自检在无 lockfile workspace 不报 failed，仅 skipped
[ ] review-report.meta.hasP0 真实写入；P0=true 时 G4 按钮 disabled
[ ] 无 pandoc 环境下 docx/pdf 全部导出成功，中文不乱码
[ ] 需求阶段拖拽上传 docx/pdf，PRD 生成时引用上传内容
```

---

## 9. Pi 0.73 红线（保持 Fix-Pack #1 §5 全部规则）

- 不要重新引入 pandoc / 不写 sandbox-run job / 不绕过 stages/complete 路由；
- 修改 LLM 行为前后跑 `pnpm tsx scripts/smoke-pi.ts`；
- design-agent 的 `loadPriorContext` 不允许塞超过 32K 字符（对每段 truncate 到 8K）；
- puppeteer 的进程必须 finally 关，避免 port leak。

---

## 10. 给 Claude Code 的执行口令（接力版）

> 你已经完成了上一轮 F0–F12 + H1–H6（仓库 master `d366d86`）。**现在按 I0 → I1 → I4 → I3 → I6 → I2 → I5 → I7 顺序执行**，每张卡一个 PR，commit message `fix(I<n>): <短描述>` 或 `feat(I<n>): ...`。每提交前本地跑 `pnpm typecheck && pnpm build`，全过再下一张。
> 

> 
> 

> **顺序理由**：I0 改名贯穿；I1 修阶段锁是所有 demo 的入口；I4 修开发预览/G3 硬 bug 解锁演示链路；I3 修设计串行让 5 子产物都能出来；I6 修导出关闭最后交付环节；I2 体验细节；I5 是预防性；I7 锦上添花。
> 

> 
> 

> P0 卡（I1/I3/I4/I6）做完后**立即用 "做一个简易待办清单" 种子做端到端冒烟**：需求阶段输入一句话 → 生成 PRD → "完成需求阶段" → 设计一键生成全部 → "完成设计阶段" → 开发 → 沙箱看到真实可点的 todo 页面 → "完成开发阶段" → 审查 → 导出 docx+pdf+zip。视频或截图贴 PR 描述。
> 

> 
> 

> 任何 §9 红线不得违反；遇到 SDK 行为与文档不一致，停下来在 commit 中加 `BLOCKED:` 前缀写明现象，**不要**自作主张换 API。
> 

---

*完成 I0–I7 = 平台从 "能跑通框架" 升级到 "用户能点完整 demo"，可以直接进入大赛 Demo 录制阶段。*