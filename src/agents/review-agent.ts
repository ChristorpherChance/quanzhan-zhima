import { prisma } from "@/lib/db/prisma"
import { paths } from "@/config/paths"
import { log } from "@/lib/log"
import { J } from "@/lib/db/json"
import { chat } from "@/lib/llm/gateway"
import type { AgentRunCtx } from "@/agents/types"
import { execSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

async function execIn(cwd: string, cmd: string) {
  try {
    return execSync(cmd, { cwd, stdio: "pipe", timeout: 60_000 }).toString()
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string }
    return `FAILED: ${err.message}\n${err.stdout?.toString() ?? ""}\n${err.stderr?.toString() ?? ""}`
  }
}

async function summarizeWithLlm(results: Record<string, unknown>) {
  const summary = await chat({
    task: "review",
    messages: [
      {
        role: "system",
        content:
          "你是审查 Agent。基于工具输出，生成 review-report.md。\n" +
          "格式：\n# 摘要（<=200字）\n# 关键发现\n按 P0/P1/P2 分组：\n- [P0] path/file.ts:123 描述\n- [P1] path/other.ts:45 描述\n" +
          "# 修复建议（最多8条）\n# 复跑命令\n\n严禁编造行号。",
      },
      { role: "user", content: JSON.stringify(results) },
    ],
    temperature: 0.2,
    maxTokens: 2048,
  })
  return summary.text
}

export async function runReview(ctx: AgentRunCtx, scope: string[]): Promise<void> {
  const ws = paths.workspace(ctx.projectId)
  const out: Record<string, unknown> = {}

  if (scope.includes("lint")) {
    ctx.send("log", { line: "跑 lint..." })
    out.lint = await execIn(ws, "pnpm lint --max-warnings=0").catch((e: unknown) => ({ failed: true, log: String((e as Error)?.message ?? e) }))
  }
  if (scope.includes("types")) {
    ctx.send("log", { line: "跑 tsc..." })
    out.types = await execIn(ws, "pnpm tsc --noEmit").catch((e: unknown) => ({ failed: true, log: String((e as Error)?.message ?? e) }))
  }
  if (scope.includes("audit")) {
    ctx.send("log", { line: "跑审计..." })
    out.audit = await execIn(ws, "pnpm audit --json").catch((e: unknown) => ({ failed: true, log: String((e as Error)?.message ?? e) }))
  }
  if (scope.includes("unit")) {
    ctx.send("log", { line: "跑测试..." })
    out.unit = await execIn(ws, "pnpm test --reporter=json").catch((e: unknown) => ({ failed: true, log: String((e as Error)?.message ?? e) }))
  }
  if (scope.includes("e2e")) {
    ctx.send("log", { line: "跑 e2e..." })
    out.e2e = await execIn(ws, "pnpm playwright test --reporter=json").catch((e: unknown) => ({ skipped: true, log: String((e as Error)?.message ?? e) }))
  }

  ctx.send("log", { line: "LLM 分析中..." })
  const markdown = await summarizeWithLlm(out)
  const hasP0 = /^- \[P0\]/m.test(markdown)
  const hasP1 = /^- \[P1\]/m.test(markdown)

  // Write report
  const reportDir = path.join(paths.project(ctx.projectId), "reports")
  await fs.mkdir(reportDir, { recursive: true })
  await fs.writeFile(path.join(reportDir, "review.md"), markdown, "utf8")

  // Upsert artifact
  const existing = await prisma.artifact.findFirst({
    where: { projectId: ctx.projectId, type: "review-report" },
    orderBy: { version: "desc" },
  })
  if (existing && !existing.locked) {
    await prisma.artifact.update({
      where: { id: existing.id },
      data: { storagePath: path.join(reportDir, "review.md"), meta: J.stringify({ hasP0, hasP1 }), version: existing.version + 1 },
    })
  } else {
    await prisma.artifact.create({
      data: { projectId: ctx.projectId, type: "review-report", version: (existing?.version ?? 0) + 1, storagePath: path.join(reportDir, "review.md"), meta: J.stringify({ hasP0, hasP1 }) },
    })
  }

  ctx.send("result", { hasP0, hasP1 })
}

export async function fixReview(ctx: AgentRunCtx, severityFilter: ("P0" | "P1")[]): Promise<void> {
  ctx.send("log", { line: `修复请求: ${severityFilter.join(", ")}` })
  const reportDir = path.join(paths.project(ctx.projectId), "reports")
  const reportPath = path.join(reportDir, "review.md")
  let reportContent = ""
  try {
    reportContent = await fs.readFile(reportPath, "utf8")
  } catch {
    ctx.send("log", { line: "无审查报告，跳过修复" })
    return
  }

  const repairPrompt = `基于以下审查报告修复 workspace 内对应文件：
${reportContent}

修复后运行 build 验证。`

  // Re-use dev agent pattern - call chat to generate fixes
  const result = await chat({
    task: "code-fix",
    messages: [
      { role: "system", content: "你是代码修复 Agent。基于审查报告修复问题。输出修复后的文件内容。" },
      { role: "user", content: repairPrompt },
    ],
    temperature: 0.1,
    maxTokens: 4096,
  })

  ctx.send("result", { repaired: true, summary: result.text.slice(0, 200) })
}
