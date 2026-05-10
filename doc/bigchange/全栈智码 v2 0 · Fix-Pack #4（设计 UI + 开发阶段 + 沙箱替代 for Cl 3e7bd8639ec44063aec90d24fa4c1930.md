# 全栈智码 v2.0 · Fix-Pack #4（设计 UI + 开发阶段 + 沙箱替代 for Claude Code）

<aside>
🎯

**目标**：修复三类阻塞问题——① 设计 UI 原型截断/不达标；② 开发 workspace 出现重复 [PRD.md](http://PRD.md) / PRIOR_[CONTEXT.md](http://CONTEXT.md)；③ 「完成开发阶段」G3 锁定失败 + 沙箱启动失败。

**风格**：沿用 Fix-Pack #1/#2/#3 的 J 任务卡格式，每张卡 = 一个原子提交，含路径 / 代码骨架 / 验收命令。

**前置**：先 `git pull` 同步主干，确认 §当前页 v2.0 文档集为基线。

</aside>

## 0. 根因诊断（必读）

基于 master 分支当前代码做的实际定位：

### 0.1 设计 UI 原型截断（`src/agents/design-agent.ts` + `src/agents/prompts/design.ts`）

1. **`UI_PROMPT` 体量爆炸**：一次性要求 ≥6 页 × ≥80 DOM 节点 + 7 大模块 + 设计令牌 + ≥12 交互；单轮稳定 30k+ tokens，触发 DeepSeek `max_tokens` 截断（4–8k）。
2. **续写策略弱**：`MAX_CONTINUATIONS = 2`、续写 prompt 用「上次结尾 500 字」做 anchor，模型经常重写而不是接续；且续写时 `streamOnce` 把完整 system prompt 重新发了一遍，每次又触发新的 30k+ 任务。
3. **`ui_template_pack` 工具未接入设计阶段**：现成的 8 套 shadcn 风格模板（在 `src/lib/pi/ui-templates.ts`）只对 Pi dev 阶段开放，设计 Agent 看不到。
4. **没有自愈循环接 `selfCheckUi`**：函数已写但没人调用；缺项不会自动补。

### 0.2 开发阶段重复 `PRD.md` / `PRIOR_CONTEXT.md`（`src/agents/prompts/dev.ts` + `src/lib/pi/tools.ts`）

1. `buildDevSystemPrompt` 把 PRD（≤16k）+ 5 份设计产物（≤12k 各）共约 76k 字符全塞 system prompt；模型本能地用 `workspace_write` 把上下文「保存」一份到磁盘。
2. 多次 dev 重跑 / Pi 续写时，每次都会再写一遍，于是出现 `PRD.md`、`PRD-1.md`、`PRIOR_CONTEXT.md`、`PRIOR_CONTEXT-2.md` 等。
3. `workspace_write` 只做了 path-escape 防护，**没有 denylist 阻止上下文镜像文件**。

### 0.3 G3 锁定失败（`src/lib/hitl/gates.ts`）

`checkConditions("G3")` 现在要求三件事：

- `code.locked === true`：但前端「完成开发阶段」按钮**直接调 `lockGate(G3)`，没先锁 `code` artifact**，所以 reasons 第一条就是「代码未确认」。
- `meta.builtOk !== false`：`pnpm install` / `pnpm exec next build` 任何一步报错都会把 builtOk 写成 false，G3 立刻被 hard-block；普通环境（无 pnpm-lock、内存不足、缺系统依赖）失败率极高。
- 工作区入口文件存在：通常 OK。

### 0.4 沙箱启动失败（`src/lib/sandbox/child-process.ts` + `src/lib/sandbox/index.ts`）

1. `spawn(opts.command, [], { shell: isWindows })` —— **非 Windows 不开 shell**，但命令是 `pnpm exec next start -p $PORT` 这种复合形式，无 shell 解析直接 ENOENT。
2. `$PORT` 不被展开，next 监听默认 3000，端口池分配的端口连不上，`waitPort` 必超时。
3. `waitPort(port, 30_000)` 30 秒对 Next.js 冷启动远远不够（通常 90–300 s）。
4. 启动路径**只跑 `start`，跳过 `install`**：`node_modules` 不存在直接报错。
5. `sanitizedEnv` 把所有 LLM Key 全部剥离，运行时调 LLM 的应用直接 500。

**结论**：G3 不依赖沙箱（gates.ts 里没有 sandbox 检查），沙箱可以降级为可选；用「代码浏览器 + StackBlitz 嵌入 + 下载 zip」做默认查阅/修改路径。

---

## J0 · 设计 UI 原型「分页生成 + 自愈补完」改造（最重要）

**目标**：把 UI 单 prompt 30k+ tokens 拆成 1+6+N 轮小任务，每轮控制在 6k tokens 内，配合 ui_template_pack 接入 + selfCheckUi 自愈循环。

### J0.1 拆 prompt：把 `UI_PROMPT` 拆成 7 个子 prompt

文件：`src/agents/prompts/design.ts`

新增 5 个常量（保留原 `UI_PROMPT` 作为「整体规格」放到 system 里参考，但**不再要求一轮输出全部**）：

```tsx
// shell：design tokens + nav + 路由占位 + mock 数据 + theme/i18n 切换
export const UI_SHELL_PROMPT = `# 角色
你是 UI 原型 Agent。本轮**只生成 HTML 骨架**，不要生成任何具体页面内容。

# 必须输出（一份完整的 HTML，长度 ≤ 5000 字符）
1. <!DOCTYPE html> + <head>（Tailwind CDN v3 + Alpine.js + Lucide Icons）
2. <style> 中定义 :root 设计令牌（11 阶色板 / 7 字号 / 8 间距 / 4 圆角 / 4 阴影 / 3 动效）
3. <body x-data="app()"> 全局 store：currentPage / theme / locale / mockData(>=12 条)
4. 顶部 Header（产品名 + 主导航 + cmd+k 入口 + 主题切换 + 语言切换 + 用户菜单）
5. <main id="page-root"></main> —— 6 个空占位 div，id 分别为 page-dashboard / page-list / page-detail / page-create-edit / page-settings / page-empty-error，初始 hidden
6. 命令面板 Modal（cmd+k）骨架
7. <script> Alpine init + hashchange 路由 + i18n 切换 + theme 切换

# 末尾必须输出：<!-- END:ui-shell -->`

export const UI_PAGE_PROMPT = (page: string) => `# 角色
你是 UI 原型 Agent。本轮**只生成 \`${page}\` 一个页面**的 HTML 片段。

# 输入
- 上一轮已生成的 shell（含设计令牌、nav、mock 数据），你**复用**其中的 CSS 变量、组件 class、mock 数据 key。
- 必须读取的 PRD（已注入 user message）。

# 模板基线
你必须先以 ui_template_pack(${page}) 的返回为骨架，再围绕 PRD 的 AC 替换占位文案与字段名。

# 输出格式（严格）
<!-- PAGE:${page} -->
<div id="page-${page}" x-show="currentPage==='${page}'" class="...">
  ...完整页面内容（≥80 个 DOM 节点）...
</div>
<!-- /PAGE:${page} -->
<!-- END:ui-${page} -->

# 必须实现的交互（按页面挑相关项）
- 表单校验（内联错误） / 模态框 / 抽屉 / Toast / 表格排序筛选 / Tab / 骨架屏 / 分页 / 批量操作 / 空错态
- 所有交互元素带 aria-* + 键盘可达
- 禁止 Lorem ipsum；文案必须围绕 PRD AC

# 长度上限
单页 ≤ 6000 字符。如确需更多，先输出主要结构 + <!-- END:ui-${page} -->，留待自愈轮补全。`
```

并把原 `UI_PROMPT` 改造为「整体规格说明」，仅作为 system 参考，不再要求一次产出。

### J0.2 改 `design-agent.ts`：UI 走 7 + N 轮多阶段

替换 `subtype === 'ui'` 分支为新流程：

```tsx
import { UI_SHELL_PROMPT, UI_PAGE_PROMPT } from './prompts/design'
import { UI_TEMPLATES } from '@/lib/pi/ui-templates'

const UI_PAGES = ['dashboard','list','detail','create-edit','settings','empty-error'] as const

async function generateUi(ctx: AgentRunCtx): Promise<string> {
  const prdContent = await fs.readFile(paths.prd(ctx.projectId), 'utf-8')

  // 1. shell
  ctx.send('progress', { phase: 'design-ui-shell', message: '生成 UI 骨架...' })
  let shell = await streamOnceWithContinuation(ctx, 'ui-shell', UI_SHELL_PROMPT, prdContent, /<!--\s*END:ui-shell\s*-->/)

  // 2. 6 页面：每页注入对应 ui_template_pack 模板作为「上下文工具」
  const pageBlocks: string[] = []
  for (const p of UI_PAGES) {
    ctx.send('progress', { phase: `design-ui-${p}`, message: `生成页面: ${p}` })
    const tmpl = UI_TEMPLATES[p] ?? UI_TEMPLATES.list ?? ''
    const userMsg = `PRD:\n${prdContent.slice(0, 8000)}\n\n上一轮已生成 shell（设计令牌 + 全局 store + 路由）：\n${shell.slice(0, 4000)}\n...(截断)\n\nui_template_pack(${p}) 模板：\n${tmpl}\n\n请生成 ${p} 页面，遵循上述规则。`
    const block = await streamOnceWithContinuation(
      ctx, `ui-${p}`, UI_PAGE_PROMPT(p), userMsg,
      new RegExp(`<!--\\s*END:ui-${p}\\s*-->`),
    )
    pageBlocks.push(block)
  }

  // 3. 拼装：把 page blocks 注入 shell 的 <main id="page-root"> 内
  let assembled = shell.replace('<main id="page-root"></main>', `<main id="page-root">\n${pageBlocks.join('\n\n')}\n</main>`)

  // 4. 自检 + 补全（最多 2 轮）
  for (let round = 0; round < 2; round++) {
    const { score, missing } = await selfCheckUi(assembled)
    if (score >= 70) break
    ctx.send('progress', { phase: 'design-ui-patch', message: `自检 ${score}/100，补全：${missing.join(', ')}` })
    const patchPrompt = `你是 UI 修补 Agent。下方 HTML 缺以下要素，请仅返回 <patch insertAfter="CSS_SELECTOR">代码</patch> 形式的补丁列表，多条用换行分隔，禁止重写整页。\n缺项：${missing.join('，')}\n\nHTML（仅取相关 200 行）：\n${assembled.slice(0, 12000)}`
    const patches = await streamOnceText(ctx, 'design-ui-patch', patchPrompt)
    assembled = applyPatches(assembled, patches) // 解析 <patch insertAfter="...">...</patch> 并 insertAfter 选择器命中处
  }
  return assembled
}
```

关键工具函数：

- `streamOnceWithContinuation(ctx, label, system, user, endRe, maxTries=5)`：把当前 `streamOnce` 的续写逻辑提到通用函数；**续写改为「assistant 角色追加上轮 buffer + 用户说『继续』」的方式**，避免重写。
- `applyPatches(html, raw)`：用 cheerio 或简易正则按 `insertAfter` 选择器插入。
- `selfCheckUi(html)`：保留现有阈值 70；新增检测项目「6 个页面 ID 是否齐全」「END:ui-* 标记齐全」。

### J0.3 通用「assistant 续写」改造

替换 `streamOnce` 续写策略为：

```tsx
async function streamOnceWithContinuation(
  ctx: AgentRunCtx, label: string, system: string, firstUser: string, endRe: RegExp, maxTries = 5,
): Promise<string> {
  let buf = ''
  let messages: Array<{ role: 'system'|'user'|'assistant', content: string }> = [
    { role: 'system', content: system },
    { role: 'user', content: firstUser },
  ]
  for (let i = 0; i < maxTries; i++) {
    const piece = await streamWithMessages(ctx, label, messages)
    buf += piece
    if (endRe.test(buf)) break
    // 续写：assistant 角色追加上轮，user 只说「继续」
    messages = [
      { role: 'system', content: system },
      { role: 'user', content: firstUser },
      { role: 'assistant', content: buf },
      { role: 'user', content: '继续输出剩余内容，禁止重复已输出部分；完成后输出 END 标记。' },
    ]
    ctx.send('progress', { phase: `${label}-continue`, message: `续写 ${i+1}/${maxTries}` })
  }
  return buf
}
```

### J0.4 验收

```bash
pnpm exec tsx scripts/smoke-design-ui.ts demo-prd.md
# 期望：终端打印 7+N 轮进度，最终输出文件 design/ui.html
# 自检：grep -c '<!-- PAGE:' design/ui.html  # 必须 = 6
#       grep -c '<!-- END:ui-' design/ui.html # 必须 ≥ 7
# 浏览器打开：6 个页面可路由切换、主题/语言切换、≥12 类交互可见
```

---

## J1 · 开发 workspace 「上下文文件」denylist + 提示词瘦身

**目标**：彻底消除 workspace 里的 [PRD.md](http://PRD.md) / PRIOR_[CONTEXT.md](http://CONTEXT.md) 镜像文件，且把 system prompt 从 76k 字符瘦到 < 6k。

### J1.1 改 `buildDevSystemPrompt`：不再内嵌 PRD/设计原文

文件：`src/agents/prompts/dev.ts`

```tsx
export async function buildDevSystemPrompt(projectId: string): Promise<string> {
  // 不再读 PRD/设计原文，仅产出指令；模型按需调 read_artifact
  return `# 角色
你是开发 Agent。任务：在 workspace 中产出可 \`pnpm install && pnpm exec next build\` 的 Next.js 14 + TS + Tailwind 应用，覆盖 PRD 全部 AC。

# 必读上下文（**仅通过 read_artifact 工具按需读取，不要写入 workspace**）
- read_artifact { type: "prd" } —— 全部 AC 的来源
- read_artifact { type: "design-summary" } —— 总体方案
- read_artifact { type: "design-detail" } —— 每条 AC 的详细方案
- read_artifact { type: "design-api" } —— API 接口与 JSON 示例
- read_artifact { type: "design-db" } —— ER 图与 DDL
- read_artifact { type: "design-ui" } —— 视觉与交互参考

# 红线（违反任意一条会被工具层拒绝）
- **禁止 workspace_write 写入：PRD.md / PRIOR_CONTEXT.md / CONTEXT.md / DESIGN-*.md / *.context.md**（denylist 已在工具层硬拒绝）。需要查看上下文请重新调 read_artifact。
- 禁止 mock 实现；缺 env 直接抛错。
- 工作区只能用：Next.js 14 App Router + TS + Tailwind + shadcn/ui + better-sqlite3 + zod。

# 输出节奏
1. 先 read_artifact 4–6 次拿齐 PRD + 设计；只做摘要保存在 think 里，不要 workspace_write。
2. 写 PLAN.md 列文件清单与建立顺序（PLAN.md 允许）。
3. 按顺序 workspace_write 写文件；写完一组就 workspace_exec 跑 pnpm install / build 自检。
4. 失败立即修，连续 2 次失败在 PLAN.md 标 BLOCKED。
5. 最后写 COVERAGE.md 列每条 AC 对应的代码位置。`
}
```

### J1.2 工具层 denylist：`workspace_write` 硬拒绝

文件：`src/lib/pi/tools.ts`

```tsx
const WORKSPACE_WRITE_DENY = [
  /^prd\.md$/i, /^prd-?\d*\.md$/i,
  /^prior[_-]?context\.md$/i, /^prior[_-]?context-?\d*\.md$/i,
  /^context\.md$/i, /^design-(summary|detail|api|db|ui)(-\d+)?\.(md|html)$/i,
  /\.context\.md$/i,
]

// 在 workspace_write 的 execute 里：
const rel = path.relative(workspaceDir, resolved).replace(/\\/g, '/')
if (WORKSPACE_WRITE_DENY.some((re) => re.test(rel) || re.test(path.basename(rel)))) {
  return toolErr(`workspace_write 拒绝：${rel} 属于上下文镜像文件，请用 read_artifact 重新拉取，禁止落盘。`)
}
```

### J1.3 dev-agent 启动前清理工作区上下文残留

文件：`src/agents/dev-agent.ts`，在 `runPiSession` 之前加：

```tsx
async function purgeContextMirrors(workspaceDir: string) {
  const entries = await fs.readdir(workspaceDir).catch(() => [])
  for (const f of entries) {
    if (WORKSPACE_WRITE_DENY.some((re) => re.test(f))) {
      await fs.rm(path.join(workspaceDir, f), { force: true }).catch(() => {})
    }
  }
}
// runDev 开头：
await purgeContextMirrors(workspaceDir)
```

### J1.4 验收

```bash
rm -rf storage/projects/$ID/workspace
pnpm exec tsx scripts/smoke-dev.ts $ID
ls storage/projects/$ID/workspace | grep -Ei 'prd|prior_context|context\.md|design-' && echo FAIL || echo PASS
# 期望 PASS
```

---

## J2 · G3 锁定改造：原子「锁代码 + 锁 G3」+ builtOk 软化

### J2.1 新增「确认开发完成」原子接口

文件：`src/app/api/projects/[id]/dev/confirm/route.ts`（新建）

```tsx
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { lockGate, checkConditions } from '@/lib/hitl/gates'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const projectId = params.id
  // 1. 锁最新 code artifact
  const code = await prisma.artifact.findFirst({ where: { projectId, type: 'code' }, orderBy: { version: 'desc' } })
  if (!code) return NextResponse.json({ ok: false, error: '尚未生成代码' }, { status: 400 })
  if (!code.locked) await prisma.artifact.update({ where: { id: code.id }, data: { locked: true } })

  // 2. 检查 G3，逐条返回 reasons
  const { ok, reasons } = await checkConditions(projectId, 'G3')
  if (!ok) return NextResponse.json({ ok: false, reasons }, { status: 400 })

  // 3. 锁 G3
  const r = await lockGate(projectId, 'G3').catch((e: any) => ({ error: e?.message ?? String(e) }))
  if ('error' in r) return NextResponse.json({ ok: false, reasons: [r.error] }, { status: 400 })
  return NextResponse.json({ ok: true, nextStage: r.nextStage })
}
```

前端「完成开发阶段」按钮改调 `/api/projects/:id/dev/confirm`，把 reasons 在 toast 里逐条展示。

### J2.2 G3 软化 builtOk 检查

文件：`src/lib/hitl/gates.ts` G3 分支改为：

```tsx
if (code?.meta) {
  try {
    const meta = JSON.parse(code.meta as string)
    // 软化：build 失败仅作为 warning（写入 reasons 但不阻断）
    // 必须 hard-block 的条件：完全没尝试构建（builtOk 字段缺失）
    if (meta.builtOk === undefined) reasons.push('未执行构建自检')
    // builtOk === false：仅记录 warning，不进入 reasons
  } catch { /* 忽略 */ }
}
```

但同时把 `builtOk=false` 通过新字段 `meta.warnings: string[]` 透传给前端，G3 卡片上展示「⚠️ 构建未通过，但允许提交」。

### J2.3 写「构建日志可读」

file: `src/agents/dev-agent.ts`，把 `install` / `build` 的 `out`（含 stderr）写到 `${workspaceDir}/build.log`，并在 artifact `meta.buildLogPath` 上记录路径，方便前端调 `/api/projects/:id/dev/buildlog` 读取。

### J2.4 验收

```bash
# 模拟 build 失败：把 next.config.mjs 改坏
curl -X POST http://localhost:3000/api/projects/$ID/dev/confirm
# 期望：返回 ok=true，nextStage=review；warnings 中含「构建未通过」
```

---

## J3 · 沙箱替代：默认走「代码浏览器 + StackBlitz 嵌入 + 下载 zip」

沙箱保留为可选；G3 不依赖沙箱；默认查阅/修改路径换成更轻量的方式。

### J3.1 新增「代码浏览器」组件

路径：`src/components/workbench/CodeBrowser.tsx`

- 左侧文件树（递归读 `paths.workspace(projectId)`，跳过 `node_modules / .git / .next / dist / .turbo`）。
- 右侧 Monaco 编辑器（`@monaco-editor/react`，按扩展名自动语言）。
- 顶部三按钮：💾 保存（PUT `/api/projects/:id/dev/file`）、🤖 让 AI 改这段（把光标选区 + 文件路径发给 dev-agent 的 patch 模式）、⬇️ 下载 zip。

后端文件 API：

- `GET /api/projects/:id/dev/tree` → 文件树 JSON
- `GET /api/projects/:id/dev/file?path=...` → 文件内容
- `PUT /api/projects/:id/dev/file` body { path, content } → 保存（沿用 `guardPath`）
- `GET /api/projects/:id/dev/zip` → 直接调用现有 `git-zip` 导出器

### J3.2 StackBlitz 嵌入（可选，需联网）

路径：`src/components/workbench/StackBlitzEmbed.tsx`

- 按下「在 StackBlitz 中预览」时，扫描 workspace 文件 → 构造 `sdk.openProject({ files, template: 'node' })`，使用官方 SDK `@stackblitz/sdk`。
- 离线 / 不可访问：自动隐藏按钮。

### J3.3 「让 AI 改这段」补丁 Agent

沿用 dev-agent 的 Pi session，但传入 `systemPromptOverride` 切换到「patch 模式」：

```tsx
export const DEV_PATCH_SYSTEM = `你是开发 Agent 的 patch 模式。任务：仅修改用户指定的文件区间，禁止重写整个项目。
输入：filePath / lineRange / userInstruction。
输出：直接 workspace_write 改写该文件；改完用 workspace_list 确认。
禁止跨文件大范围改动；超出范围请在 PLAN.md 末尾追加 TODO。`
```

API: `POST /api/projects/:id/dev/patch`，body `{ filePath, range:[start,end], instruction }`。

### J3.4 沙箱兜底修复（保留为可选 Run 按钮）

如果用户仍想用沙箱，至少要修以下几处，避免一启动就失败：

文件 `src/lib/sandbox/child-process.ts`：

```tsx
const child = spawn(opts.command, [], {
  cwd: opts.workspaceDir,
  env: sanitizedEnv(port),
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true, // ← 全平台开 shell，让 $PORT 与 && 能解析
})
// waitPort 超时改 180_000
await waitPort(port, 180_000)
```

文件 `src/lib/sandbox/index.ts` 增加 `installFirst` 选项，并在 `startSandbox` 里默认 `true`：

```tsx
export async function startSandbox(opts: SandboxStartOpts) {
  const cmds = detectStartCommand(opts.workspaceDir)
  if (cmds.install) {
    // 同步先跑 install，写日志
    execSync(cmds.install, { cwd: opts.workspaceDir, stdio: 'inherit', timeout: 10*60_000 })
  }
  // 再 startChild，传完整 start 命令
  return startChild({ ...opts, command: cmds.start.replace('$PORT', String(/* 端口由 acquirePort 决定 */)) })
}
```

（端口注入需要把 acquirePort 提前到 startSandbox 里，再传给 startChild。）

### J3.5 验收

```bash
# 代码浏览器：
curl http://localhost:3000/api/projects/$ID/dev/tree | jq
curl 'http://localhost:3000/api/projects/$ID/dev/file?path=src/app/page.tsx'
# StackBlitz：UI 上点「在 StackBlitz 中预览」打开嵌入页
# 沙箱（可选）：点「Run」120s 内 iframe 出页面或报详细日志
```

---

## J4 · 综合 e2e（替换原冒烟）

文件：`scripts/smoke-fixpack4.ts`（新建）

步骤：

1. 创建项目 + oneLiner
2. 触发 requirement-agent，PRD 锁定（G1）
3. 触发 design-agent **5 个 subtype**：summary/detail/api/db **正常**；ui 走 §J0 新流程，断言：
    - `<!-- PAGE:dashboard -->` … `<!-- PAGE:empty-error -->` 6 个全在
    - `<!-- END:ui-shell -->` 与 6 个 `<!-- END:ui-* -->` 标记全在
    - `selfCheckUi(html).score >= 70`
4. 锁定 5 个设计产物 → G2
5. 触发 dev-agent，断言：
    - `workspace` 中**没有** `PRD.md` / `PRIOR_CONTEXT.md` / `DESIGN-*.md`
    - `PLAN.md` 与 `COVERAGE.md` 存在
    - `package.json` 存在
6. 调 `/api/projects/:id/dev/confirm`，断言返回 `ok:true` 且 `nextStage='review'`，即使 builtOk=false 也能通过
7. 调 `/api/projects/:id/dev/tree` 与 `/file` 验证代码浏览器可用

---

## J5 · 文档同步更新

更新 §08（HITL）、§09（沙箱）、§07（Agent 提示词）三页对应小节，把：

- §07 § 3 设计 UI 段改为「shell + 6 page + 自愈 patch 三阶段」
- §08 §1.1 G3 条件改为「软化 builtOk + 强制原子锁代码」
- §09 §3 沙箱前置条件追加「shell:true / installFirst / 180s」并标注「默认走代码浏览器」

---

## J6 · 端口号统一管理（禁止硬编码）

**目标**：所有端口集中到 `src/config/ports.ts`，走环境变量 + 默认值；仓库内**任何文件不准出现 3000 / 3010 / 3100 等端口字面量**（除本配置文件本身）。避免端口被外部占用时项目不可访问。

### J6.1 新建 `src/config/ports.ts`

```tsx
function num(name: string, def: number): number {
	const v = Number(process.env[name]); return Number.isFinite(v) && v > 0 ? v : def
}
function range(name: string, defStart: number, defEnd: number): [number, number] {
	const raw = process.env[name]
	if (raw && /^\d+-\d+$/.test(raw)) { const [s, e] = raw.split('-').map(Number); return [s, e] }
	return [defStart, defEnd]
}
export const PORTS = {
	app:        num('APP_PORT', 3000),                              // Next.js 主应用
	sandbox:    range('SANDBOX_PORT_RANGE', 3010, 3099),            // 子项目沙箱
	uiPreview:  range('UI_PREVIEW_PORT_RANGE', 3100, 3199),         // 设计阶段 UI 预览
	reviewE2E:  range('REVIEW_E2E_PORT_RANGE', 3200, 3249),         // 审查阶段 e2e
} as const
export function isPortReserved(port: number): boolean {
	return port === PORTS.app
		|| (port >= PORTS.sandbox[0] && port <= PORTS.sandbox[1])
		|| (port >= PORTS.uiPreview[0] && port <= PORTS.uiPreview[1])
		|| (port >= PORTS.reviewE2E[0] && port <= PORTS.reviewE2E[1])
}
```

### J6.2 全仓 grep 替换硬编码

必查位置（一位也不能漏）：

- `next.config.mjs` / `package.json` scripts（`next dev -p` / `next start -p`）
- `src/lib/sandbox/port-pool.ts`（`RANGE = [3010, 3099]` → `PORTS.sandbox`）
- `src/lib/sandbox/child-process.ts` / `src/lib/sandbox/index.ts`
- `src/agents/prompts/*.ts`（提示词中提及端口的位置改为「由外部注入 PORT，不要写死」）
- `scripts/smoke-*.ts` / `e2e/*` / `playwright.config.ts`
- 前端 `fetch('http://localhost:3000/...')` → 改走相对路径 / `process.env.NEXT_PUBLIC_APP_URL`

验收脚本 `scripts/check-no-hardcoded-port.ts`：扣除白名单（`config/ports.ts`、`.env.example`、`README.md`）后，grep `\b30(00|10|99|100|199|200|249)\b` 必须为空。

### J6.3 端口冲突自动让位

`acquirePort(kind: 'sandbox'|'uiPreview'|'reviewE2E')` 在分配前 `net.connect` ping：

```tsx
async function isFree(port: number, host = '127.0.0.1', timeout = 300): Promise<boolean> {
	return new Promise(resolve => {
		const sock = new net.Socket()
		const done = (free: boolean) => { sock.destroy(); resolve(free) }
		sock.setTimeout(timeout)
		sock.once('connect', () => done(false))
		sock.once('timeout', () => done(true))
		sock.once('error', () => done(true))
		sock.connect(port, host)
	})
}
```

被外部进程占用的端口跳过下一个；范围内连续 5 个都不可用招 `E_NO_PORT` + reasons。

### J6.4 `.env.example` + README

```
APP_PORT=3000
SANDBOX_PORT_RANGE=3010-3099
UI_PREVIEW_PORT_RANGE=3100-3199
REVIEW_E2E_PORT_RANGE=3200-3249
```

README “运行”一节加：“如 3000 被占用，设 `APP_PORT=3001` 重起；沙箱范围调 `SANDBOX_PORT_RANGE`。”

---

## J7 · 项目列表可删除

### J7.1 Prisma schema 加 onDelete: Cascade

```
model Project {
	id String @id @default(cuid())
	jobs           Job[]
	artifacts      Artifact[]
	gates          Gate[]
	conversations  Conversation[]
	messages       Message[]
	archived       Boolean @default(false)
	// ...
}
model Job        { project Project @relation(fields:[projectId], references:[id], onDelete: Cascade); projectId String }
model Artifact   { project Project @relation(fields:[projectId], references:[id], onDelete: Cascade); projectId String }
model Gate       { project Project @relation(fields:[projectId], references:[id], onDelete: Cascade); projectId String }
model Conversation { project Project @relation(fields:[projectId], references:[id], onDelete: Cascade); projectId String }
model Message    { project Project @relation(fields:[projectId], references:[id], onDelete: Cascade); projectId String }
```

```bash
pnpm prisma migrate dev --name project_cascade_delete
```

### J7.2 后端 `DELETE /api/projects/[id]/route.ts`

```tsx
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
	const id = params.id
	const project = await prisma.project.findUnique({ where: { id } })
	if (!project) return NextResponse.json({ ok: false, error: '项目不存在' }, { status: 404 })
	// 1. 先软删（避免后续 Job 访问）
	await prisma.project.update({ where: { id }, data: { archived: true } })
	try {
		// 2. 停掉运行中的沙箱
		await getRunning(id)?.stop().catch(() => {})
		// 3. 物理删除 fs
		await fs.rm(paths.workspace(id), { recursive: true, force: true })
		await fs.rm(paths.designs(id),   { recursive: true, force: true })
		await fs.rm(paths.exports(id),   { recursive: true, force: true })
		// 4. DB 级联删（onDelete: Cascade 带动子表）
		await prisma.project.delete({ where: { id } })
		return NextResponse.json({ ok: true })
	} catch (e: any) {
		// 任一步失败回滚 archived
		await prisma.project.update({ where: { id }, data: { archived: false } }).catch(() => {})
		return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
	}
}
```

### J7.3 前端项目卡片删除入口

`src/components/projects/ProjectCard.tsx`：

- hover 右上角出现 `<DropdownMenu>`（⋯）
- 选「删除项目」打开 `<AlertDialog>`，要求输入项目名二次确认（`disabled={input !== project.name}`）
- 删除中卡片 opacity-50 + spinner
- 成功 → SWR `mutate('/api/projects')` / RSC `router.refresh()`；失败 → toast 错误 + 保留卡片

### J7.4 验收

```bash
ID=$(curl -s -XPOST /api/projects -d '{"oneLiner":"测试"}' | jq -r .id)
curl -X DELETE http://localhost:$APP_PORT/api/projects/$ID -i  # 期望 200 ok:true
ls storage/projects/$ID 2>&1 | grep -q 'No such'                # PASS
sqlite3 prisma/dev.db "select count(*) from Project where id='$ID'"  # = 0
sqlite3 prisma/dev.db "select count(*) from Job where projectId='$ID'" # = 0
```

---

## J8 · 设计「一键生成」改顺序执行 + UI 流式

### J8.1 后端 `generate-all` 取消 Promise.all

原因：并发调 5 个 Pi session 会争抢 pool + 争抢 LLM 额度，其中一个拿不到 session 就报「Pi 不可用，回退传统流式生成 detail」。改为严格串行：

```tsx
const SUBTYPES = ['summary', 'detail', 'api', 'db', 'ui'] as const
export async function runDesignAll(ctx: AgentRunCtx) {
	const results: Record<string, 'pending'|'running'|'done'|'failed'> = Object.fromEntries(SUBTYPES.map(s => [s, 'pending']))
	ctx.send('progress', { phase: 'design-plan', subtypes: SUBTYPES, results })
	for (const subtype of SUBTYPES) {
		results[subtype] = 'running'
		ctx.send('progress', { phase: 'design-step-start', subtype, results })
		try {
			await generateOne(ctx, subtype)         // 等落盘 + artifact 写入
			results[subtype] = 'done'
			ctx.send('progress', { phase: 'design-step-done', subtype, results })
		} catch (e: any) {
			results[subtype] = 'failed'
			ctx.send('error',    { phase: 'design-step-failed', subtype, error: e?.message ?? String(e), results })
			throw e   // 前一步失败立即停，后续不跳
		}
	}
}
```

### J8.2 修「Pi 不可用」回退逻辑

根因：`pool.poolGet` 失败时 fallback 走 Gateway `chat()` 非流式路径，WS 推送链路断了。修：

- `poolGet` 内加健康检查：每 30s `session.ping()`（调一次空 prompt，超时 5s），失败标记 `pi.unhealthy = true`
- design-agent fallback **仍使用** `streamOnceWithContinuation` 走 Gateway streaming（不是一次性 chat），保证流式不丢
- fallback 仅对当前 subtype 生效；成功后下一个 subtype 先重试 Pi 路径，避免一始终始 fallback
- 错误消息从「Pi 不可用，回退传统流式生成 detail」改为「Pi 不可用（原因：…），本轮 `${subtype}` 临时走 Gateway 流式。下一个 subtype 会重试 Pi。」

### J8.3 UI 子产物流式推送

`generateUi()` 内，`streamOnceWithContinuation` 收到 piece 时调：

```tsx
ctx.send('progress', {
	phase: 'design-ui-stream',
	subPhase: label,                  // 'ui-shell' | 'ui-dashboard' | ...
	delta: piece,                     // 本次增量
	cumulativeBytes: buf.length,
})
```

前端 `DesignWorkspace` UI 预览面板：

- 订阅 `design-ui-stream`，本地维护 `pageBuffers: Record<page, string>` + `shellBuffer`
- 合成 `previewHtml = shellBuffer.replace('<main id="page-root"></main>', join(pageBuffers))`
- `<iframe srcdoc={previewHtml}>` 每 200ms throttle 一次重新赋值（避免频繁 reload）
- 收到 `phase: 'design-step-done', subtype: 'ui'` 时拉一次最终 artifact（含 patch 后的版本）覆盖 srcdoc

### J8.4 前端 5 步进度条

`<DesignProgressRail steps=` 5 个 step，收到 `design-step-start` 点亮旋转，`done` 打 ✓，`failed` 打 ✕ + 折叠错误详情；点「重试此步」仅重跳该 subtype。

### J8.5 验收

```bash
# WS 抓包（1）design-step-done 出现 5 次 且顺序为 summary→detail→api→db→ui
# （2）design-ui-stream delta 事件 ≥ 10 条
# （3）恶意让 detail 报错：api/db/ui 未被触发，进度条错状出现在 detail
```

---

## J9 · Mermaid / 流程图 配色统一

### J9.1 新建 `src/lib/markdown/mermaid-theme.ts`

```tsx
export const MERMAID_LIGHT = `%%{init: {
	'theme':'base',
	'themeVariables': {
		'primaryColor':'#eef2ff',     'primaryTextColor':'#1e1b4b',  'primaryBorderColor':'#6366f1',
		'secondaryColor':'#f5f5f5',   'tertiaryColor':'#fafafa',
		'lineColor':'#4f46e5',        'textColor':'#171717',
		'mainBkg':'#eef2ff',          'nodeBorder':'#6366f1',
		'clusterBkg':'#f5f5f5',       'clusterBorder':'#d4d4d4',
		'edgeLabelBackground':'#ffffff',
		'fontFamily':'ui-sans-serif, system-ui, -apple-system'
	}
}}%%\n`

export const MERMAID_DARK = `%%{init: {
	'theme':'base',
	'themeVariables': {
		'primaryColor':'#312e81',     'primaryTextColor':'#e0e7ff',  'primaryBorderColor':'#818cf8',
		'secondaryColor':'#262626',   'tertiaryColor':'#171717',
		'lineColor':'#a5b4fc',        'textColor':'#fafafa',
		'mainBkg':'#312e81',          'nodeBorder':'#818cf8',
		'clusterBkg':'#262626',       'clusterBorder':'#404040',
		'edgeLabelBackground':'#0a0a0a',
		'fontFamily':'ui-sans-serif, system-ui, -apple-system'
	}
}}%%\n`

/** 给 markdown 中所有 ```mermaid 块补 init 头；已有 init 头的块会被覆盖。 */
export function injectMermaidTheme(md: string, theme: 'light' | 'dark'): string {
	const header = theme === 'dark' ? MERMAID_DARK : MERMAID_LIGHT
	return md.replace(/```mermaid\s*\n(?:%%\{\s*init:[^}]*\}\s*%%\s*\n)?/g, '```mermaid\n' + header)
}
```

### J9.2 接入点

- **前端渲染**：`src/lib/markdown/render.tsx` `<ReactMarkdown>` 不是手写的话，加 remark plugin；或者在传入 `children` 前调 `injectMermaidTheme(md, theme)`
- **设计 Agent**：`src/agents/prompts/design.ts` db 子产物 prompt 末尾追加：「请勿在 ```mermaid 块开头写 `%%{init: …}%%` 头，由渲染器统一注入。」
- **导出**：`src/lib/export/pandoc.ts` 调 pandoc 前先 `injectMermaidTheme(inputMd, 'light')` 写临时文件（PDF 常亮色）
- **主题切换**：`useTheme()` 变化时重新渲染 markdown 树，`mermaid.run()` 会重画

### J9.3 已有文档批量回填

```bash
pnpm exec tsx scripts/inject-mermaid-theme.ts
# 递归 storage/projects/*/design/*.md 与 docs/*.md，允许 --dry-run
```

### J9.4 验收

- 打开任一项目设计文档 → mermaid 节点底色 `#eef2ff` + 边框 `#6366f1`，与 Skill 库设计令牌一致
- 切深色模式 → 自动换 dark theme，文字 `#fafafa` 可辨
- 导出 PDF 中 mermaid 图不出现「黑底黑字」问题

---

## 提交顺序与回归

建议一次 PR 完成 J0 → J9，按 J 号拆 commit（每个 J 一个 commit，commit message 用 `fix-pack-4(Jx): xxx`）。

回归命令：

```bash
pnpm install
pnpm exec tsx scripts/check-no-hardcoded-port.ts   # J6
pnpm prisma migrate deploy                          # J7
pnpm exec tsx scripts/inject-mermaid-theme.ts       # J9 回填
pnpm exec tsx scripts/smoke-fixpack4.ts             # J0–J5 主流程
pnpm exec tsx scripts/smoke-fixpack4-extras.ts      # J6–J9 新增项
pnpm tsc --noEmit
pnpm lint --max-warnings=0
pnpm exec next build
pnpm test -- --run
```

全绿即认为 Fix-Pack #4 完成。