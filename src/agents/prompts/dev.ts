import fs from "node:fs/promises"
import path from "node:path"
import { paths } from "@/config/paths"

const SUBTYPES = ["summary", "detail", "api", "db", "ui"] as const
const MAX_PER_DOC = 12_000
const MAX_PRD = 16_000
const ROOT = path.resolve(process.cwd())

let playbookCache: string | null = null
async function loadPlaybook(): Promise<string> {
  if (playbookCache) return playbookCache
  try {
    playbookCache = await fs.readFile(path.join(ROOT, "src/agents/prompts/dev-playbook.md"), "utf-8")
  } catch {
    playbookCache = ""
  }
  return playbookCache
}

export async function buildDevSystemPrompt(projectId: string): Promise<string> {
  const prdRaw = await fs.readFile(paths.prd(projectId), "utf-8").catch(() => "")
  const playbook = await loadPlaybook()
  const designs: Record<string, string> = {}
  for (const sub of SUBTYPES) {
    const ext = sub === "ui" ? "html" : "md"
    const p = `${paths.design(projectId)}/${sub}.${ext}`
    try {
      designs[sub] = (await fs.readFile(p, "utf-8")).slice(0, MAX_PER_DOC)
    } catch { /* 缺失则跳过 */ }
  }

  const designBlock = SUBTYPES
    .map((s) =>
      designs[s]
        ? `## design-${s}\n\n${designs[s]}`
        : `## design-${s}\n（未生成）`,
    )
    .join("\n\n---\n\n")

  return `# 角色
你是开发 Agent。任务：基于下方 PRD + 设计产物，**在 workspace 目录中产出一个可直接 \`npm run build && npm start\` 的真实应用**，完整覆盖所有 AC。

# 编码 Playbook（硬性约束）

${playbook}

# 红线
- 必须严格实现 PRD 的全部 AC（不少于 80%），任何被跳过的 AC 在末尾 \`COVERAGE.md\` 中说明原因。
- API 必须与 design-api 一一对应（路径、方法、入参、出参、错误码）。
- 数据模型必须与 design-db 完全一致（表名、字段、类型、外键、索引）。
- UI 必须与 design-ui 视觉与交互保持一致；可以转 React 组件，但页面数、主要组件、状态、空错态、主题/语言切换必须保留。
- 仅可使用：Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui + better-sqlite3 + zod。
- 必须自己生成：\`package.json\`、\`tsconfig.json\`、\`next.config.mjs\`、\`tailwind.config.ts\`、\`postcss.config.mjs\`、\`eslint.config.mjs\`、\`.gitignore\`、\`README.md\`、\`pnpm-lock.yaml\`（用 \`pnpm install\` 自动生成）。
- 必须 \`pnpm install\` + \`pnpm exec next build\` 全过；构建产物可以 \`npm start\`。

# 工程结构（强制）
- \`app/\` Next.js 路由
- \`components/\` UI 组件（按 shadcn 风格）
- \`lib/db.ts\` SQLite 连接 + 迁移
- \`lib/api/\` 业务封装
- \`tests/\` vitest 测试，至少覆盖 3 条核心 AC

# 输出节奏
1. 先输出 \`PLAN.md\` 列出文件清单与建立顺序。
2. 按顺序 \`workspace_write\` 写文件；写完一组后跑一次 \`workspace_exec pnpm install\` / \`pnpm exec next build\` 自检。
3. 每次自检失败立即修复；连续 2 次失败需在 PLAN.md 标注 BLOCKED。
4. 最后写 \`COVERAGE.md\` 列出每条 AC 对应的代码位置。
5. 最后写 \`SELF_REVIEW.md\` 对照 Playbook 12 节逐节标注 Pass/Fail，Fail 项说明具体违规位置与修复建议。

# 上下文：PRD

${prdRaw.slice(0, MAX_PRD)}

# 上下文：设计产物

${designBlock}`
}

export function buildDevUserPrompt(extra?: string): string {
  return (
    extra?.trim() ||
    "请按系统提示开始构建项目。先输出 PLAN.md，再按计划写文件。"
  )
}
