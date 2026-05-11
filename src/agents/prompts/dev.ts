export async function buildDevSystemPrompt(_projectId: string): Promise<string> {
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

export const DEV_PATCH_SYSTEM = `你是开发 Agent 的 patch 模式。任务：仅修改用户指定的文件区间，禁止重写整个项目。
输入：filePath / lineRange / userInstruction。
输出：直接 workspace_write 改写该文件；改完用 workspace_list 确认。
禁止跨文件大范围改动；超出范围请在 PLAN.md 末尾追加 TODO。`

export function buildDevUserPrompt(extra?: string): string {
  return (
    extra?.trim() ||
    "请按系统提示开始构建项目。先输出 PLAN.md，再按计划写文件。"
  )
}

/**
 * Build system prompt for direct LLM code generation (non-Pi fallback).
 * Same context as Pi mode but formatted for chat completion.
 */
export async function buildLLMDevPrompt(projectId: string): Promise<string> {
  const basePrompt = await buildDevSystemPrompt(projectId)
  const { RED_LINES_BLOCK } = await import("./_red-lines")

  // LLM 直连模式无法调用 read_artifact 工具,必须直接注入 PRD + 设计产物文本(fix)
  const fs = await import("node:fs/promises")
  const path = await import("node:path")
  const { paths } = await import("@/config/paths")

  const tryRead = async (p: string, limit = 8000): Promise<string> => {
    try {
      const raw = await fs.readFile(p, "utf-8")
      return raw.length > limit ? raw.slice(0, limit) + "\n...(截断)" : raw
    } catch { return "" }
  }

  const prdContent = await tryRead(paths.prd(projectId))
  const designDir = paths.design(projectId)
  const summary = await tryRead(path.join(designDir, "summary.md"))
  const detail = await tryRead(path.join(designDir, "detail.md"), 12000)
  const api = await tryRead(path.join(designDir, "api.md"), 8000)
  const db = await tryRead(path.join(designDir, "db.md"), 6000)

  const contextBlock = [
    prdContent && `## PRD（产品需求文档）\n${prdContent}`,
    summary && `## 概要设计\n${summary}`,
    detail && `## 详细设计\n${detail}`,
    api && `## API 设计\n${api}`,
    db && `## 数据库设计\n${db}`,
  ].filter(Boolean).join("\n\n---\n\n")

  const systemPrompt = `${RED_LINES_BLOCK}

${basePrompt}

# ⚠️ 强制约束 — 必须严格遵循 PRD,禁止凭空发挥
你将基于下方真实的 PRD + 4 份设计产物生成代码。**严禁生成与 PRD 无关的功能**(如任务管理器、待办清单等通用 demo)。所有功能模块、字段名、术语必须来自 PRD。

# 项目上下文(必读)

${contextBlock || "(注:PRD 和设计产物为空,请直接根据用户需求生成)"}
`
  return systemPrompt
}
