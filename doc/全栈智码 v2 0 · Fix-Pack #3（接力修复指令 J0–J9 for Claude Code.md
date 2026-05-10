# 全栈智码 v2.0 · Fix-Pack #3（接力修复指令 J0–J9 for Claude Code）

> 本文是在 [全栈智码 v2.0 · Fix-Pack #2](https://www.notion.so/v2-0-Fix-Pack-2-for-Claude-Code-0ed8178531384762a39589dbdb3a9569?pvs=21) 之后的**第三轮接力修复包**。Claude Code 已完成 I0–I7 大部分修复（仓库 `ChristorpherChance/quanzhan-zhima` master 当前 HEAD），但实跑仍暴露 5 类阻塞性体验问题。本文按 J0–J9 任务卡形式给出可直接执行的指令。
**使用方式**：将本页整体粘贴给 Claude Code，按 §11 顺序执行；§10 红线必须遵守；每张卡一个 PR。
> 

---

## 0. 实跑反馈 → 根因定位（基于 master 最新代码逐文件复核）

| 用户反馈 | 根因（带文件证据） | 任务卡 | 级别 |
| --- | --- | --- | --- |
| ① 设计产物中的图（mermaid/ER/流程图）只显示源码，看不到画好的图；UI 原型设计内置指导太粗 | 1) 前端 design 子产物 viewer 仅做 markdown 渲染，未挂 mermaid.js 等渲染器，更没有 "渲染图 / 源码" 双视图切换。2) `src/agents/prompts/design.ts` 的 `UI_PROMPT` 仅给 8 类交互骨架，没有视觉系统、组件库映射、信息架构、可访问性、可用性等内置指导，导出的原型质量不稳定 | <strong>J1 + J2</strong> | P0 |
| ② 沙箱起来只能看代码文件，看不到真正运行；生成代码不达 PRD/设计/UI 原型要求 | 1) `dev-agent.ts` 的 `prompt = instruction ?? "请开始按系统提示完成任务。"` — 上下文中根本没有 PRD + design-summary/detail/api/db/ui 5 个产物拼接。2) `runPiSession` 硬编码 `timeoutMs: 240_000`（4 分钟），完整应用根本写不完。3) 沙箱用 `npm run dev` 跑 `_skeleton/server.js` 占位服务，对 React/Vue/Next 项目没有框架自动适配；缺 "构建+运行+自检" 三段式启动。4) 没有 dev 完成后的 "是否覆盖 PRD/AC" 验收闭环 | <strong>J3 + J4</strong> | P0 |
| ③ 审查反馈 ESLint/pnpm audit 都被 skipped，结果几乎没意义 | `review-agent.ts` 当 workspace 没有 `eslint.config.*` 或 `pnpm-lock.yaml` 时直接 skip。问题不在审查 agent，而在 dev-agent 不为生成代码自动生成这些项目基建文件 | <strong>J5</strong> | P0 |
| ④ Agent / 子 Agent 缺少管理界面：记忆、技能、提示词、模型、温度、可用工具都写死 | 提示词全部硬编码在 `src/agents/prompts/*.ts`；没有 "agent 注册表 + 设置面板 + 记忆库" 概念；微调 prompt 必须改代码重启 | <strong>J6 + J7</strong> | P1（决定演示天花板） |
| ⑤ 其他遗漏 | 见 §0.1 | <strong>J8 + J9</strong> | P1/P2 |

### 0.1 §0 复核中额外发现的 8 个隐性问题

1. `src/agents/design-agent.ts` 的 `DESIGN_ORDER = ["summary","api","db","detail","ui"]` 与 Fix-Pack #2 §I3 约定的 `summary→detail→api→db→ui` 顺序**不一致**：当前 detail 排在 api/db 之后，会导致 detail 重复发明数据/接口而不是引用。**必须改回**。
2. `design-agent.ts` 中 `END_MARKER_RE = / /` 是空白正则（被 markdown 转义吃掉了），`hasEndMarker` 永远 true，**续写机制实际从未触发**。
3. `dev-agent.ts` 没有把 5 份 design 产物注入 Pi system prompt，且 `runPiSession.timeoutMs=240_000` 上限 4 分钟，复杂应用必然中断。
4. `gates.ts G3` 文件级兜底只检查 `index.html / server.js / package.json` 之一存在，但未校验 "能正常 build/start" — "能锁定但跑不起来" 仍可能发生。
5. `review-agent.ts` 的 `eslintConfigs` 检测列表缺 `.eslintrc.cjs`，且 `npx --no-install eslint` 在没装本地 eslint 时直接判 "未安装"，没有兜底落 platform 自带的 eslint。
6. `review-agent.ts` 的 `fixReview` 中 `(eslintR.exitCode ?? eslintR.skipped ? 0 : 1) === 0` 是错的优先级：实际等价于 `(eslintR.exitCode ?? (eslintR.skipped ? 0 : 1)) === 0`，skipped=true 会被当成 0（通过），存在误报修复成功的风险。
7. `CodeBrowser.tsx` 的 "沙箱中打开" 把 selectedPath 直接拼到 sandbox URL — 对 SPA / 后端 API 路径无意义，反而会 404。
8. 项目级 "重新生成" 各阶段产物时，**没有自动反锁后续阶段的 gates**，会造成 "PRD 已改但 G2 仍 locked" 的状态漂移。Fix-Pack #2 §I1.4 只解决了 artifact 的 locked 反置，没解决 Gate 表的反置。

### 0.2 优先级

- **P0（阻塞演示）**：J1 设计图渲染、J2 UI 原型方法论、J3 dev 上下文+预算、J4 真编译真运行、J5 review 闭环
- **P1（决定平台调性）**：J6 Agent 注册表、J7 Agent 设置面板与记忆库
- **P2（隐性 bug 收尾）**：J8 §0.1 8 个隐性问题、J9 端到端冒烟脚本

---

## J0 · 全局约定（贯穿所有 PR）

1. 所有新增 React 组件放在 `src/components/workbench/` 下，纯函数 + tailwind；所有 server only 代码放 `src/lib/`；agent 行为放 `src/agents/`。
2. 新增依赖必须在 PR 中执行 `pnpm add <pkg>` 并提交 `pnpm-lock.yaml`，禁止改 npm/yarn。
3. 所有路由改动后跑 `pnpm typecheck && pnpm build && pnpm smoke:llm && pnpm smoke:pi` 全过再合并。
4. UI 字符串遵循 Fix-Pack #2 §I0：内部标识 `gate / G0..G6` 不动，用户文案统一 "阶段"。
5. 任何 prompt 修改必须**只动数据文件**（J6 之后改 `src/agents/registry/*.json` 或 DB），**不动 agent 业务逻辑代码**。

---

## J1 · 设计产物可视化：图 / 源码双视图（P0 ⭐）

**目标**：每一处可视化语法（mermaid、ER、flow、sequence、HTML 原型）默认显示**渲染后的图**，右上角 `图` / `源码` Toggle 可一键切换。

### J1.1 安装依赖

```bash
pnpm add mermaid react-markdown remark-gfm rehype-raw rehype-sanitize
```

### J1.2 新建组件 `src/components/workbench/MermaidBlock.tsx`

```tsx
"use client"
import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"
import { Button } from "@/components/ui/button"
import { Code2, Eye, Copy, Download } from "lucide-react"

mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose", flowchart: { htmlLabels: true } })

export function MermaidBlock({ code, caption }: { code: string; caption?: string }) {
	const ref = useRef<HTMLDivElement>(null)
	const [view, setView] = useState<"render" | "source">("render")
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (view !== "render" || !ref.current) return
		const id = `m-${Math.random().toString(36).slice(2)}`
		mermaid.render(id, code)
			.then(({ svg }) => { if (ref.current) ref.current.innerHTML = svg; setError(null) })
			.catch((e) => setError(String(e?.message ?? e)))
	}, [code, view])

	const onCopy = () => navigator.clipboard.writeText(code)
	const onDownload = () => {
		const svg = ref.current?.querySelector("svg")?.outerHTML; if (!svg) return
		const blob = new Blob([svg], { type: "image/svg+xml" })
		const url = URL.createObjectURL(blob); const a = document.createElement("a")
		a.href = url; a.download = `${caption || "diagram"}.svg`; a.click(); URL.revokeObjectURL(url)
	}

	return (
		<div className="my-4 rounded-lg border bg-card">
			<div className="flex items-center justify-between border-b px-3 py-1.5">
				<span className="text-xs text-muted-foreground">{caption ?? "diagram"}</span>
				<div className="flex items-center gap-1">
					<Button size="sm" variant={view === "render" ? "default" : "ghost"} onClick={() => setView("render")}><Eye className="h-3.5 w-3.5" /> 图</Button>
					<Button size="sm" variant={view === "source" ? "default" : "ghost"} onClick={() => setView("source")}><Code2 className="h-3.5 w-3.5" /> 源码</Button>
					<Button size="sm" variant="ghost" onClick={onCopy}><Copy className="h-3.5 w-3.5" /></Button>
					<Button size="sm" variant="ghost" onClick={onDownload}><Download className="h-3.5 w-3.5" /></Button>
				</div>
			</div>
			{view === "render" ? (
				<div className="overflow-auto p-4">
					{error
						? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}\n\n--- 原始源码 ---\n{code}</pre>
						: <div ref={ref} className="flex justify-center" />}
				</div>
			) : (
				<pre className="overflow-auto p-3 text-xs bg-muted/30"><code>{code}</code></pre>
			)}
		</div>
	)
}
```

### J1.3 新建组件 `src/components/workbench/MarkdownView.tsx`

替换现有 design 子产物 viewer。要点：

- 使用 `react-markdown` + `remark-gfm`，自定义 `code` 渲染器：当 `lang === "mermaid"` 时渲染 `<MermaidBlock>`，其他语言走 prism/highlight；
- 顶部工具栏：`渲染 / 原文 Markdown` 全局切换（默认渲染）；
- 支持 "导出 PNG"（mermaid 图）与 "导出 .md"。

```tsx
"use client"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import { useState } from "react"
import { MermaidBlock } from "./MermaidBlock"
import { Button } from "@/components/ui/button"

export function MarkdownView({ source, title }: { source: string; title?: string }) {
	const [mode, setMode] = useState<"render" | "source">("render")
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				{title && <h2 className="text-lg font-semibold">{title}</h2>}
				<div className="flex gap-1">
					<Button size="sm" variant={mode === "render" ? "default" : "ghost"} onClick={() => setMode("render")}>渲染</Button>
					<Button size="sm" variant={mode === "source" ? "default" : "ghost"} onClick={() => setMode("source")}>Markdown 源码</Button>
				</div>
			</div>
			{mode === "source" ? (
				<pre className="overflow-auto rounded-lg bg-muted/40 p-3 text-xs"><code>{source}</code></pre>
			) : (
				<div className="prose prose-sm dark:prose-invert max-w-none">
					<ReactMarkdown
						remarkPlugins={[remarkGfm]}
						rehypePlugins={[rehypeRaw]}
						components={{
							code({ inline, className, children, ...props }) {
								const match = /language-(\w+)/.exec(className || "")
								const lang = match?.[1]
								const code = String(children).replace(/\n$/, "")
								if (!inline && lang === "mermaid") return <MermaidBlock code={code} caption="mermaid" />
								return <code className={className} {...props}>{children}</code>
							},
						}}>{source}</ReactMarkdown>
				</div>
			)}
		</div>
	)
}
```

### J1.4 新建组件 `src/components/workbench/UiPrototypeViewer.tsx`

用于 design-ui 子产物的渲染：

- 默认 iframe 渲染 `design/ui-prototype/index.html`（mountPreviewPrototype 已经把它复制到 `workspace/preview/`，沙箱起来后可走 `/preview/`）；
- 顶部 Toggle：`原型预览 / HTML 源码 / 多页面索引（左侧菜单）`；
- 提供 "在新标签打开 / 全屏预览 / 复制 HTML" 按钮；
- 解析 UI prompt 约定的 `<!-- PAGE: name -->` 分隔注释，渲染左侧导航；点击后用 `iframe srcdoc` 切换页面。

### J1.5 集成到 `src/app/projects/[id]/design/page.tsx`（或对应文件）

- design-summary / detail / api / db → 用 `<MarkdownView>`；
- design-ui → 用 `<UiPrototypeViewer>`；
- 5 个 Tab 共享一个 "全部展开 / 折叠" 主开关；
- artifact `meta.truncated=true` 时顶部红色 Banner 提示 "内容截断，建议续写"。

**验收**：

- 任意一份 design-summary/detail 中包含  ``mermaid ` 代码块时，默认看到画好的图；点 "源码" 看到原始 mermaid 文本。
- design-db 包含 erDiagram 时同样默认渲染。
- design-ui 默认渲染原型 iframe，可切到 HTML 源码。
- 一键导出 SVG/PNG/MD 全部可用。

---

## J2 · UI 原型设计：内置完整方法论（P0 ⭐）

**目标**：把零散的 8 类交互升级为一套**可被 Agent 严格执行的 UI 原型方法论**，让产出的原型既贴合 PRD，又达到 Notion-native 级别的视觉与交互完整度。

### J2.1 新建 `src/agents/prompts/ui-prototype-spec.md`（作为 system 提示词的一部分）

方法论 7 大模块（Agent 必须按此顺序写代码）：

1. **信息架构（IA）**：5 段式 — 全局导航 / 主操作区 / 次操作区 / 状态展示 / 帮助说明；列出每个页面在 IA 中的位置。
2. **设计令牌（Design Tokens）**：色板（primary/secondary/success/warning/danger/neutral 各 11 阶）、字号 7 阶、间距 8/12/16/24/32/48/64、圆角 6/10/14/20、阴影 sm/md/lg/xl、动效 timing-fast/normal/slow。这些写成 CSS 变量挂在 `:root`。
3. **组件库映射（按 shadcn/ui 命名）**：Button / Input / Select / Dialog / Drawer / Tabs / Table / Card / Badge / Toast / Skeleton / Tooltip / DropdownMenu / Pagination / EmptyState / ErrorBoundary。每个组件用 Tailwind class + Alpine 行为模拟。
4. **页面模板**：`PageHeader（标题+面包屑+主操作）+ Toolbar（筛选+搜索+视图切换）+ Content（表格/卡片/详情）+ Footer/Pagination`。所有 list/detail 页必须套用此模板。
5. **可访问性 (a11y)**：所有交互元素带 `aria-*`，键盘可达（Tab/Esc/Enter）；对比度 ≥ 4.5:1；表单控件必须 `<label>` 关联。
6. **响应式**：sm/md/lg/xl 4 断点；表格 < md 转卡片视图；侧边栏 < md 折叠抽屉。
7. **Mock 数据规范**：从 PRD AC 中抽取实体名 → 生成 ≥ 12 条假数据；时间用最近 30 天；包含 "正常 / 边界 / 异常" 三类样本。

### J2.2 改写 `src/agents/prompts/design.ts` 中的 `UI_PROMPT`

核心改动：

- 把 J2.1 的 7 大模块完整内嵌；
- 强制要求最少 6 个页面：`dashboard / list / detail / create-edit / settings / empty-error`，每页 ≥ 80 个 DOM 节点；
- 强制要求 ≥ 12 类交互（在 8 类基础上增补：`命令面板 cmd+k / 全文搜索 / 批量操作 / 数据分页 / 撤销操作 / 快捷键提示`）；
- 强制顶部 Header 含 "产品名 + 主导航 + 命令面板入口 + 主题切换 + 语言切换 + 用户菜单"；
- 引入  `<!-- PAGE: name --> ... <!-- /PAGE -->`  分隔块，便于 J1.4 viewer 解析；
- 输出末尾必须 `<!-- END_UI -->` 作为完成标记（同时修复 J8 的 END marker 正则 bug）。

### J2.3 新增 "原型自检清单"（Agent 内部 self-check）

在 design-ui 生成完成后，自动跑一段后置 LLM 评分：

```tsx
// src/agents/design-agent.ts 末尾
async function selfCheckUi(html: string): Promise<{ score: number; missing: string[] }> {
	const CHECKLIST = [
		["含 design tokens CSS 变量", /:root\s*{[^}]*--/],
		["含 mock 数据 ≥ 12 条", (h: string) => (h.match(/id\s*:\s*['\"][\w-]+/g)?.length ?? 0) >= 12],
		["含命令面板", /cmd\+k|command\s+palette/i],
		["含主题切换", /toggle.*theme|dark[-\s]?mode/i],
		["含语言切换", /i18n|locale|switch.*lang/i],
		["含分页", /pagination|page-(prev|next)/i],
		["含空状态", /empty[-\s]?state|暂无|没有数据/i],
		["页面分隔注释", /<!--\s*PAGE:/],
		["END 标记", /<!--\s*END_UI\s*-->/],
		["a11y aria-*", /aria-/],
	]
	const missing: string[] = []
	let score = 0
	for (const [name, m] of CHECKLIST) {
		const ok = typeof m === "function" ? (m as Function)(html) : (m as RegExp).test(html)
		if (ok) score += 10
		else missing.push(name as string)
	}
	return { score, missing }
}
```

如果 score < 70 或缺关键项（PAGE 分隔 / END 标记 / mock 数据），自动追加一次 "补完" LLM 续写，最多 1 次。

**验收**：

- 跑"做一个简易待办清单"种子，design-ui.html ≥ 6 页面、≥ 480 个 DOM 节点、含命令面板 / 主题切换 / 语言切换；
- viewer 中能在 6 个页面之间切换；
- 自检 score ≥ 80；
- HTML 含 `<!-- END_UI -->`。

---

## J3 · Dev Agent：上下文完整 + 预算合理（P0 ⭐）

**根因复盘**：当前 `dev-agent.ts:23` `const prompt = instruction ?? "请开始按系统提示完成任务。"` 完全不读 PRD 与 5 份 design 产物；`runPiSession({ timeoutMs: 240_000 })` 只给 4 分钟，根本写不完一个真实应用。

### J3.1 新建 `src/agents/prompts/dev.ts`

```tsx
import fs from "node:fs/promises"
import { paths } from "@/config/paths"

const SUBTYPES = ["summary", "detail", "api", "db", "ui"] as const
const MAX_PER_DOC = 12_000
const MAX_PRD = 16_000

export async function buildDevSystemPrompt(projectId: string): Promise<string> {
	const prdRaw = await fs.readFile(paths.prd(projectId), "utf-8").catch(() => "")
	const designs: Record<string, string> = {}
	for (const sub of SUBTYPES) {
		const ext = sub === "ui" ? "html" : "md"
		const p = `${paths.design(projectId)}/${sub}.${ext}`
		try { designs[sub] = (await fs.readFile(p, "utf-8")).slice(0, MAX_PER_DOC) } catch { /* 缺失则跳过 */ }
	}
	return `# 角色\n你是开发 Agent。任务：基于下方 PRD + 设计产物，**在 workspace 目录中产出一个可直接 \`npm run build && npm start\` 的真实应用**，完整覆盖所有 AC。\n\n# 红线\n- 必须严格实现 PRD 的全部 AC（不少于 80%），任何被跳过的 AC 在末尾 \`COVERAGE.md\` 中说明原因。\n- API 必须与 design-api 一一对应（路径、方法、入参、出参、错误码）。\n- 数据模型必须与 design-db 完全一致（表名、字段、类型、外键、索引）。\n- UI 必须与 design-ui 视觉与交互保持一致；可以转 React 组件，但页面数、主要组件、状态、空错态、主题/语言切换必须保留。\n- 仅可使用：Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui + better-sqlite3 + zod。\n- 必须自己生成：\`package.json\`、\`tsconfig.json\`、\`next.config.mjs\`、\`tailwind.config.ts\`、\`postcss.config.mjs\`、\`eslint.config.mjs\`、\`.gitignore\`、\`README.md\`、\`pnpm-lock.yaml\`（用 \`pnpm install\` 自动生成）。\n- 必须 \`npm install\` + \`npm run build\` 全过；构建产物可以 \`npm start\`。\n\n# 工程结构（强制）\n- \`app/\` Next.js 路由\n- \`components/\` UI 组件（按 shadcn 风格）\n- \`lib/db.ts\` SQLite 连接 + 迁移\n- \`lib/api/\` 业务封装\n- \`tests/\` vitest 测试，至少覆盖 3 条核心 AC\n\n# 输出节奏\n1. 先输出 \`PLAN.md\` 列出文件清单与建立顺序。\n2. 按顺序 \`workspace_write\` 写文件；写完一组后跑一次 \`workspace_exec npm install\` / \`npm run build\` 自检。\n3. 每次自检失败立即修复；连续 2 次失败需在 PLAN.md 标注 BLOCKED。\n4. 最后写 \`COVERAGE.md\` 列出每条 AC 对应的代码位置。\n\n# 上下文：PRD\n\n${prdRaw.slice(0, MAX_PRD)}\n\n# 上下文：设计产物\n${SUBTYPES.map(s => designs[s] ? `## design-${s}\n\n${designs[s]}` : `## design-${s}\n（未生成）`).join("\n\n---\n\n")}\n`
}

export function buildDevUserPrompt(extra?: string): string {
	return extra?.trim() || "请按系统提示开始构建项目。先输出 PLAN.md，再按计划写文件。"
}
```

### J3.2 改造 `src/agents/dev-agent.ts`

关键改动：

```tsx
import { buildDevSystemPrompt, buildDevUserPrompt } from "@/agents/prompts/dev"
// ...
const systemPrompt = await buildDevSystemPrompt(project.id)
const userPrompt = buildDevUserPrompt(instruction)
// 拼成 Pi 的 messages（如 runPiSession 不支持 system 单字段，则在 prompt 顶部用 ===SYSTEM=== 分块）

const r = await runPiSession({
	projectId: project.id,
	workspaceDir,
	system: systemPrompt,                  // 若 SDK 不支持 system 字段，则 prompt = systemPrompt + "\n\n===USER===\n" + userPrompt
	prompt: userPrompt,
	provider: "deepseek",
	modelId: "deepseek-chat",
	timeoutMs: 30 * 60_000,                // 30 分钟，单子任务可被 Pi 内部分片
	maxTurns: 80,                          // 提高轮次上限，确保能 install + build
	onEvent: (e) => { /* 不变 */ },
})
```

如果 `runPiSession` 不接受 `system / maxTurns` 字段，按 SDK 行为加在 prompt 顶部并用 `===SYSTEM===` 包裹（不要擅自换 SDK，遵守 §10）。

### J3.3 dev 完成 → 自动构建自检

在 dev-agent 写完所有文件后、关闭 Pi session 之前，跑：

```tsx
import { execSync } from "node:child_process"
function execIn(cwd: string, cmd: string, ms = 5 * 60_000) {
	try { return { ok: true, out: execSync(cmd, { cwd, stdio: "pipe", timeout: ms }).toString() } }
	catch (e: any) { return { ok: false, out: (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "") } }
}
const install = execIn(workspaceDir, "pnpm install --silent", 10 * 60_000)
ctx.send("log", { line: install.ok ? "✓ pnpm install" : "✗ pnpm install:\n" + install.out.slice(-1500) })
const build = execIn(workspaceDir, "pnpm exec next build || pnpm exec tsc --noEmit", 10 * 60_000)
ctx.send("log", { line: build.ok ? "✓ build" : "✗ build:\n" + build.out.slice(-1500) })
```

构建成功才把 code artifact 标 `meta.builtOk=true`，否则标 `false` 并写一条 `dev-error.log`。

### J3.4 在 code artifact meta 上记录 AC 覆盖率

```tsx
const coverageMd = await fs.readFile(`${workspaceDir}/COVERAGE.md`, "utf-8").catch(() => "")
const totalAcs = (prdContent.match(/AC[\d.]+/g) ?? []).length
const coveredAcs = (coverageMd.match(/AC[\d.]+/g) ?? []).length
meta.coverage = totalAcs > 0 ? Math.round(coveredAcs / totalAcs * 100) : null
```

前端 dev tab 顶部 Banner 显示 "AC 覆盖率 78%" + "构建状态 ✓ / ✗"。

**验收**：

- 待办清单种子跑 dev → 生成完整 Next.js 工程，含 app/, components/, lib/db.ts, tests/, package.json, eslint.config.mjs, pnpm-lock.yaml；
- `pnpm install && pnpm build` 全过；
- [COVERAGE.md](http://COVERAGE.md) 至少覆盖 80% AC；
- dev tab 显示绿色 "✓ Build OK · AC 80%+"。

---

## J4 · 沙箱：真编译真运行 + 框架自适应（P0 ⭐）

**目标**：沙箱不再只是文件浏览器，而是 **"真实启动生成代码、可见可点的运行时"**。

### J4.1 改造 `src/lib/sandbox/index.ts`：自动选择启动命令

新增检测逻辑（伪代码）：

```tsx
import { existsSync, readFileSync } from "node:fs"

export function detectStartCommand(workspaceDir: string): { install: string; build?: string; start: string; port: number } {
	const pkgPath = `${workspaceDir}/package.json`
	if (existsSync(pkgPath)) {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
		const hasNext = !!(pkg.dependencies?.next || pkg.devDependencies?.next)
		const hasVite = !!(pkg.dependencies?.vite || pkg.devDependencies?.vite)
		const hasReact = !!(pkg.dependencies?.react)
		if (hasNext)  return { install: "pnpm install --prod=false", build: "pnpm exec next build", start: "pnpm exec next start -p $PORT", port: 3100 }
		if (hasVite)  return { install: "pnpm install --prod=false", build: "pnpm exec vite build",      start: "pnpm exec vite preview --host 0.0.0.0 --port $PORT", port: 3100 }
		if (pkg.scripts?.start) return { install: "pnpm install --prod=false", start: pkg.scripts.start.includes("$PORT") ? pkg.scripts.start : `${pkg.scripts.start} -- --port $PORT`, port: 3100 }
		if (pkg.scripts?.dev)   return { install: "pnpm install --prod=false", start: pkg.scripts.dev,   port: 3100 }
	}
	// 静态站点兜底：根有 index.html
	if (existsSync(`${workspaceDir}/index.html`)) {
		return { install: "", start: "node $SKELETON_SERVER", port: 3100 }
	}
	return { install: "", start: "node server.js", port: 3100 }
}
```

`startSandbox` 改为：

1. 调 `detectStartCommand`；
2. 串行执行 `install → build → start`，每段最长 10 分钟；
3. 把 stdout/stderr 流式回调给 dev SSE，前端 "运行日志" 面板实时打印；
4. start 起来后 `fetch http://localhost:$PORT/` 探活，5 秒未通则判失败（保留进程便于排查）。

### J4.2 改造 `_skeleton/server.js`（Fix-Pack #2 §I4.2 已就位的话则核对，不在则补）

确保是 "真静态文件 + SPA fallback" 服务（详见 Fix-Pack #2 §I4.2）。**新增 `/preview/` 子路由**：把 `design/ui-prototype/` 内容也挂载，方便用户对比 UI 原型与实际产物。

### J4.3 前端 "沙箱面板" 改造

`src/components/workbench/SandboxPanel.tsx` 三栏布局：

- 左：文件树（保留 J0.1 现有）；
- 中上：iframe 预览；中下："运行日志" 流式 console（订阅 sandbox SSE）；
- 右：状态卡 — `Install ✓ 12.3s / Build ✓ 28.7s / Start ✓ port 3100`；失败时显示 "重试此步" + 错误尾部 50 行。

顶部按钮：`重启沙箱 / 强制重装依赖 / 打开新标签预览 / 复制预览链接`。

### J4.4 "代码运行" 与 "代码浏览" 解耦

- 之前 "沙箱" 仅含 CodeBrowser；现在拆为两个 Tab：`运行 (Sandbox)` + `代码 (Files)`；
- 运行 Tab 默认展示 J4.3 三栏；代码 Tab 才是 CodeBrowser；
- 切到运行 Tab 时若沙箱未起，按钮高亮 "启动沙箱"。

**验收**：

- 待办清单种子跑完 dev → 切运行 Tab → 自动 install + build + start → iframe 渲染真实 Next.js 应用，能 add / toggle / delete todo；
- 运行日志面板能看到 install/build/start 的实时输出；
- 切代码 Tab 仍能浏览所有文件。

---

## J5 · 审查阶段：从 "被动 skip" 升级 "主动闭环"（P0）

**根因**：用户报的 ESLint/audit skip 不是 review-agent 的 bug，而是 dev-agent 没生成 `eslint.config.mjs` 和 `pnpm-lock.yaml`。但 review 端也要兜底。

### J5.1 dev-agent 必须生成的项目基建文件清单（在 J3.1 system prompt 已要求）

硬性要求：

- `eslint.config.mjs`（flat config）含 `@typescript-eslint`、`eslint-plugin-react`、`eslint-plugin-react-hooks`、`eslint-plugin-import`；
- `pnpm-lock.yaml`：通过 J3.3 自动 `pnpm install` 触发生成；
- `tsconfig.json` strict + path alias `@/*`；
- `vitest.config.ts` + `tests/` 至少 3 个用例。

如果 dev-agent 漏生成，J3.3 自检失败 → 自动 followUp 一次 "请补全 eslint.config.mjs / vitest.config.ts / 至少 3 个测试用例并通过"。

### J5.2 修 `review-agent.ts` 的 4 个隐性问题

```tsx
// (1) 把 .eslintrc.cjs 加进检测列表
const eslintConfigs = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json"]

// (2) eslint 不存在时回落到 platform 自带 eslint（仅做语法 + 基础规则）
if (!toolAvailable(ws, "eslint")) {
	const r = await execIn(ws, `npx --yes eslint@9 --no-eslintrc --rule '{"no-unused-vars":"warn"}' --ext .ts,.tsx,.js,.jsx . 2>&1`)
	out.lint = r.exitCode === 0 ? "passed (platform fallback)" : { exitCode: r.exitCode, stdout: r.stdout?.slice(0, 2000), fallback: true }
} else { /* 原逻辑 */ }

// (3) audit 兜底：没有 lockfile 时跑 npm-audit-resolver 风格的简易扫描
if (scope.includes("audit")) {
	try {
		await fs.access(path.join(ws, "pnpm-lock.yaml"))
		out.audit = await execIn(ws, "pnpm audit --json 2>&1")
	} catch {
		// 改 skipped → 跑 npm i --package-lock-only --silent 后 npm audit
		const gen = await execIn(ws, "npm install --package-lock-only --silent 2>&1", 90_000)
		if (gen.exitCode === 0) {
			const r = await execIn(ws, "npm audit --json 2>&1")
			out.audit = { ...r, fallback: "npm-package-lock-only" }
		} else {
			out.audit = { skipped: true, reason: "无 lockfile 且无法生成 package-lock.json" }
		}
	}
}

// (4) fixReview 中 eslint 通过判断的优先级 bug
const eslintPassed = (eslintR.exitCode === 0) || eslintR.skipped === true
const tscPassed    = (tscR.exitCode === 0)
const fixed = tscPassed && eslintPassed
```

### J5.3 审查报告增加 "覆盖率 + 构建状态" 板块

报告头部新增 4 个指标：

- AC 覆盖率（来自 J3.4 meta）
- 构建状态（来自 J4.1 status 卡）
- 静态分析通过率
- 测试通过率

以表格 + 进度条形式渲染在 review tab。

### J5.4 一键自动修复闭环

`fixReview` 在 followUp 后必须重跑 `runReview`，新报告版本号 +1，UI 显示 "修复前/后 diff"（缺陷条数对比）。如果修复后仍 P0，按钮变红 "重新生成代码"，点击后 reopen G3 + 重跑 dev-agent。

**验收**：

- 待办清单种子跑 review → 不再出现 "无 eslint config skip" / "无 lockfile skip"；
- 报告含 AC 覆盖率 / 构建状态 / 静态分析 / 测试 4 板块；
- 故意往代码里塞一个 TS 错误 → review 标 P0 → 一键修复 → 自动重跑 → P0=0。

---

## J6 · Agent 注册表 + 数据驱动配置（P1 ⭐）

**目标**：把 "Agent 是什么、怎么思考、用什么模型、能用什么工具、记得什么" 全部从代码搬到**可视化可编辑的注册表**。

### J6.1 数据模型（Prisma migration）

新增表：

```
model Agent {
	id          String   @id @default(cuid())
	key         String   @unique             // requirement / design / dev / review / export / orchestrator / ui-sub / api-sub / db-sub ...
	name        String
	description String
	role        String   // top | sub
	parentKey   String?  // 子 Agent 指向父 Agent key
	systemPrompt String  // 长文，支持 prdContent 等占位符
	modelId     String   // deepseek-chat / claude-3-5-sonnet ...
	temperature Float    @default(0.3)
	maxTokens   Int      @default(4096)
	toolsJson   String   // JSON: ["workspace_write", "workspace_exec", "web.search", ...]
	memoryMode  String   @default("per_project") // per_project | global | none
	isEnabled   Boolean  @default(true)
	createdAt   DateTime @default(now())
	updatedAt   DateTime @updatedAt
}

model AgentMemory {
	id        String   @id @default(cuid())
	agentKey  String
	projectId String?  // null 表示全局记忆
	kind      String   // fact | preference | skill_note | error_lesson
	title     String
	content   String
	weight    Float    @default(1.0)  // 检索时的权重
	createdAt DateTime @default(now())
	updatedAt DateTime @updatedAt
	@@index([agentKey, projectId])
}

model AgentSkill {
	id        String   @id @default(cuid())
	agentKey  String
	name      String
	instruction String   // 例："如何写 zod schema"
	examplesJson String  // few-shot examples
	isEnabled Boolean  @default(true)
	@@index([agentKey])
}
```

执行：`pnpm prisma migrate dev -n add-agent-registry`

### J6.2 Seed：把现有硬编码 prompt 迁入 Agent 表

新建 `prisma/seed-agents.ts`：

```tsx
import { PrismaClient } from "@prisma/client"
import { DESIGN_SYSTEM } from "@/agents/prompts/design"
import { buildDevSystemPrompt } from "@/agents/prompts/dev"
// ...
const prisma = new PrismaClient()
const seeds = [
	{ key: "requirement",     role: "top", systemPrompt: "<requirement system prompt 全文>", modelId: "deepseek-chat", temperature: 0.4, toolsJson: JSON.stringify(["web.search"]) },
	{ key: "design",          role: "top", systemPrompt: "<design 总指挥>",       modelId: "deepseek-chat", temperature: 0.3, toolsJson: "[]" },
	{ key: "design.summary",  role: "sub", parentKey: "design", systemPrompt: DESIGN_SYSTEM("summary") },
	{ key: "design.detail",   role: "sub", parentKey: "design", systemPrompt: DESIGN_SYSTEM("detail") },
	{ key: "design.api",      role: "sub", parentKey: "design", systemPrompt: DESIGN_SYSTEM("api") },
	{ key: "design.db",       role: "sub", parentKey: "design", systemPrompt: DESIGN_SYSTEM("db") },
	{ key: "design.ui",       role: "sub", parentKey: "design", systemPrompt: DESIGN_SYSTEM("ui") },
	{ key: "dev",             role: "top", systemPrompt: "<占位，运行时动态拼>", modelId: "deepseek-chat", temperature: 0.2, toolsJson: JSON.stringify(["workspace_write","workspace_exec","workspace_read"]) },
	{ key: "review",          role: "top", systemPrompt: "<review system prompt>", modelId: "deepseek-chat", temperature: 0.2 },
	{ key: "review.fix",      role: "sub", parentKey: "review", systemPrompt: "<fixer prompt>" },
	{ key: "export",          role: "top", systemPrompt: "<export prompt>" },
]
for (const s of seeds) await prisma.agent.upsert({ where: { key: s.key }, create: s, update: s })
```

包到 `pnpm seed:agents` 命令。

### J6.3 运行时改造：所有 agent 从 DB 读取配置

新建 `src/agents/registry.ts`：

```tsx
import { prisma } from "@/lib/db/prisma"
export async function loadAgent(key: string) {
	const row = await prisma.agent.findUnique({ where: { key } })
	if (!row) throw new Error(`Agent ${key} not found`)
	return row
}
export async function loadMemories(agentKey: string, projectId?: string, limit = 20) {
	return prisma.agentMemory.findMany({
		where: { agentKey, OR: [{ projectId: projectId ?? undefined }, { projectId: null }] },
		orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
		take: limit,
	})
}
export async function loadSkills(agentKey: string) {
	return prisma.agentSkill.findMany({ where: { agentKey, isEnabled: true } })
}
export function renderPrompt(template: string, vars: Record<string, string>) {
	return template.replace(/(\w+)/g, (_, k) => vars[k] ?? "")
}
export async function buildSystemMessage(agentKey: string, projectId: string, vars: Record<string, string>) {
	const [agent, mems, skills] = await Promise.all([loadAgent(agentKey), loadMemories(agentKey, projectId), loadSkills(agentKey)])
	const memoryBlock = mems.length ? `\n\n# 记忆库（按权重）\n${mems.map(m => `- [${m.kind}] ${m.title}: ${m.content}`).join("\n")}` : ""
	const skillBlock  = skills.length ? `\n\n# 技能库\n${skills.map(s => `## ${s.name}\n${s.instruction}\n示例：\n${s.examplesJson}`).join("\n\n")}` : ""
	return renderPrompt(agent.systemPrompt, vars) + memoryBlock + skillBlock
}
```

把 `requirement-agent / design-agent / dev-agent / review-agent` 中所有读取硬编码 prompt 的地方改成 `await buildSystemMessage("design.summary", projectId, { prdContent })`。

### J6.4 "经验回写"：每次 Agent 完成任务后自动登记记忆

在每个 agent 末尾追加：

```tsx
import { recordMemory } from "@/agents/registry"
await recordMemory({
	agentKey: "design.detail",
	projectId: ctx.projectId,
	kind: "skill_note",
	title: `从 PRD #${prdVersion} 抽取的字段`,
	content: extractedFieldsList,
	weight: 0.8,
})
```

出错时 kind=`error_lesson`，下次构造 prompt 时优先权重更高。

**验收**：

- 跑 prisma migrate 与 seed 后，DB 中存在 11+ Agent 记录；
- 把 design.summary 的 systemPrompt 改一个字（如 "风险与假设 → 风险"）后，无需重启代码即可生效；
- AgentMemory 表能看到至少 3 条自动写入记录；
- 所有 agent 在执行前 ≤ 200ms 内 load 一次配置（带短缓存）。

---

## J7 · Agent 设置面板 + 记忆/技能管理 UI（P1 ⭐）

### J7.1 路由结构

- `/settings/agents` — Agent 列表（按 role 分组：top + sub）
- `/settings/agents/[key]` — 单 Agent 详情：系统提示词、模型、温度、tools、记忆库、技能库
- 顶部全局开关："使用注册表 / 使用代码默认"（防止误改导致演示翻车）

### J7.2 详情页五大区块

1. **基础**：name/description/modelId/temperature/maxTokens/isEnabled
2. **System Prompt**：Monaco Editor，支持 `var` 高亮 + 预览（替换示例值后渲染）
3. **Tools**：复选框 + 每个工具旁的 "使用次数 / 上次成功率"（由 Job 日志聚合）
4. **Memory Library**：表格 — kind / title / content / weight；可增删改、可拖拽排序权重
5. **Skill Library**：手风琴卡片 — name / instruction / examples（JSON 编辑器）

### J7.3 "沙盒试运行"

顶部 "试运行" 按钮 → 弹窗输入 mock vars → 调一个轻量端点 `/api/agents/[key]/dry-run` → 显示渲染后的最终 prompt + 估算 token 数（用 tiktoken 或 deepseek 自带计数）。

### J7.4 导入/导出

- 单 Agent 配置导出 JSON
- 工作区级 "全量配置包" 导入/导出（含所有 Agent + Memory + Skill），便于在多个环境间同步

**验收**：

- 在 UI 中编辑 design.ui 的 systemPrompt 并保存 → 立即生效（下一次设计生成读到新版）；
- 添加一条 memory "用户偏好深色主题" → design.ui 下次生成的原型默认深色；
- 导出 JSON 配置 → 在另一台机器导入后行为一致。

---

## J8 · §0.1 8 个隐性 Bug 集中扫雷（P2 但必须修）

按编号一一对应：

| # | 文件 | 修法 |
| --- | --- | --- |
| 1 | `design-agent.ts` | `DESIGN_ORDER` 改回 `["summary","detail","api","db","ui"]`，与 prior context 含义一致 |
| 2 | `design-agent.ts` | `END_MARKER_RE = /<!--s*END_(?:SUMMARY\ |
| 3 | `dev-agent.ts` | 见 J3.2 |
| 4 | `gates.ts` G3 | 加一条 "meta.builtOk === true" 的硬条件（来自 J3.3） |
| 5 | `review-agent.ts` | 见 J5.2(1)(2) |
| 6 | `review-agent.ts` `fixReview` | 见 J5.2(4) |
| 7 | `CodeBrowser.tsx` | "沙箱中打开" 按钮仅在 `selectedPath.endsWith('.html')` 或 "sandbox 已声明静态映射" 时启用，其他文件灰掉并 tooltip "非静态文件，不支持沙箱直链" |
| 8 | `gates.ts`  • agents | 任何阶段 "重新生成产物" 时，主动 `prisma.gate.update` 把当前 + 后续 Gate 反置为 `reopened`，并清空 `lockedAt`；前端 StageBar 显示橙色 "已重置" 徽章 |

---

## J9 · 端到端冒烟自动化（P1）

**目标**：把 Fix-Pack #2 §8 的人工验收清单做成 `pnpm smoke:e2e` 一键脚本。

### J9.1 新建 `scripts/smoke-e2e.ts`

步骤：

1. 创建测试项目 "待办清单_smoke"
2. 调 `/api/projects/{id}/requirement/draft` → 等 PRD
3. 调 `/stages/G1/complete`
4. 调 `/api/projects/{id}/design/generate-all` → 轮询 SSE 至 5 子产物完成
5. 校验 `summary→detail→api→db→ui` 顺序，且 detail 引用 summary 词汇 ≥ 3 处（grep）
6. 调 `/stages/G2/complete`
7. 调 `/api/projects/{id}/dev/run` → 等 build ok
8. 调 `/api/projects/{id}/dev/sandbox/run` → 探活 200
9. 调 `/stages/G3/complete`
10. 调 `/api/projects/{id}/review/run` → 校验 hasP0=false
11. 调 `/stages/G4/complete`
12. 调 `/api/projects/{id}/exports/docx` + `/exports/pdf` + `/exports/zip` 全部 200
13. 任一失败用 `process.exitCode=1` 退出，前端 README 加 "通过状态徽章"

### J9.2 Github Actions（可选）

`.github/workflows/smoke.yml`：在 PR 合并前跑 `pnpm typecheck && pnpm build && pnpm smoke:llm && pnpm smoke:pi && pnpm smoke:e2e`。

**验收**：本地 `pnpm smoke:e2e` 全过，整套耗时 ≤ 35 分钟。

---

## 10. 红线（沿用 Fix-Pack #1 §5 与 #2 §9，并补三条）

- **不要降级 SDK**：Pi 0.73 行为如不符预期，停下来在 commit 中加 `BLOCKED:` 前缀写明，不擅自换 API；
- **不要回退 Pandoc**：导出走 native（marked + html-to-docx + puppeteer），仅在 `EXPORT_USE_PANDOC=1` 才走 pandoc；
- **不要绕过 Agent 注册表**：J6 之后所有 prompt 必须 DB 驱动，禁止再在 `src/agents/prompts/*.ts` 中硬编码新增提示词（已存在的保留为 fallback）；
- **不要跳过构建自检**：J3.3 install/build 必须真实执行，不允许用 "return ok=true" 假成功；
- **不要去掉 `<!-- END_xxx -->` 标记**：J8 #2 修好后，任何 prompt 改动都必须保留 marker 协议；
- **任何 LLM/agent 行为修改前后**必须跑 `pnpm smoke:pi` + `pnpm smoke:llm`；面向用户的修改必须跑 `pnpm smoke:e2e`。

---

## 11. 给 Claude Code 的执行口令（接力第三轮）

> 你已完成 I0–I7（仓库 master 当前 HEAD）。现在按 **J0 → J3 → J4 → J5 → J1 → J2 → J8 → J6 → J7 → J9** 顺序执行；每张卡一个 PR；commit 前缀 `fix(J<n>): ...` 或 `feat(J<n>): ...`。

**顺序理由**：J0 是约定；J3/J4/J5 是演示链路的硬阻塞（无真实运行 + 无真实审查 = 没法演示），必须先打通；J1/J2 提升设计阶段观感；J8 收尾 8 个隐性 bug；J6/J7 把平台从 "能跑" 升级到 "可被运营"，决定调性；J9 自动化兜底。

**验收节奏**：每完成 J3+J4+J5（P0）后立刻跑一次 "做一个简易待办清单" 端到端：需求 → 设计（5 子产物全部图渲染默认显示）→ 开发（Next.js 真工程）→ 沙箱启动（iframe 看到能交互的 todo）→ 审查（无 skip，AC 覆盖率 ≥ 80%）→ 导出（docx + pdf + zip）。**视频或截图必须贴 PR 描述**。

**§10 红线不得违反**。遇到与文档/SDK 行为不符立即停下用 `BLOCKED:` 前缀提交，不要自作主张。
> 

---

## 12. 一句话总结

Fix-Pack #2 让平台 "能跑通"，**Fix-Pack #3 让平台 "能被信任"**：设计看得见图、开发跑得起来、审查关得上闭环、Agent 可调可教。完成后即可进入大赛 Demo 录制阶段。