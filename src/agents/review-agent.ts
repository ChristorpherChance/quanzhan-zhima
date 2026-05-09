import { prisma } from "@/lib/db/prisma"
import { paths } from "@/config/paths"
import { log } from "@/lib/log"
import { J } from "@/lib/db/json"
import { chat } from "@/lib/llm/gateway"
import { piSessionPool } from "@/lib/pi/session-manager"
import type { AgentRunCtx } from "@/agents/types"
import { execSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

interface ExecResult {
  stdout?: string
  stderr?: string
  skipped?: boolean
  exitCode?: number
}

async function execIn(cwd: string, cmd: string): Promise<ExecResult> {
  try {
    const stdout = execSync(cmd, { cwd, stdio: "pipe", timeout: 60_000 }).toString()
    return { stdout, exitCode: 0 }
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string; status?: number }
    return { stdout: err.stdout?.toString() ?? "", stderr: err.stderr?.toString() ?? "", exitCode: err.status ?? 1 }
  }
}

/** Check if a tool is available in the workspace */
function toolAvailable(cwd: string, bin: string): boolean {
  try {
    execSync(`npx --no-install ${bin} --version`, { cwd, stdio: "pipe", timeout: 15_000 })
    return true
  } catch {
    return false
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
  ctx.setPhase("tool_running", "运行代码检查")
  const ws = paths.workspace(ctx.projectId)
  const out: Record<string, unknown> = {}

  if (scope.includes("lint")) {
    ctx.send("log", { line: "跑 eslint..." })
    if (toolAvailable(ws, "eslint")) {
      const r = await execIn(ws, "npx --no-install eslint . --max-warnings=0 2>&1")
      out.lint = r.exitCode === 0 ? "passed" : { exitCode: r.exitCode, stdout: r.stdout?.slice(0, 2000), stderr: r.stderr?.slice(0, 1000) }
    } else {
      out.lint = { skipped: true, reason: "eslint not installed in workspace" }
    }
  }
  if (scope.includes("types")) {
    ctx.send("log", { line: "跑 tsc --noEmit..." })
    if (toolAvailable(ws, "tsc")) {
      const r = await execIn(ws, "npx --no-install tsc --noEmit 2>&1")
      out.types = r.exitCode === 0 ? "passed" : { exitCode: r.exitCode, stdout: r.stdout?.slice(0, 2000), stderr: r.stderr?.slice(0, 1000) }
    } else {
      out.types = { skipped: true, reason: "typescript not installed in workspace" }
    }
  }
  if (scope.includes("audit")) {
    ctx.send("log", { line: "检查依赖审计..." })
    // 仅当存在 lockfile 时才跑 audit
    try {
      await fs.access(path.join(ws, "pnpm-lock.yaml"))
      const r = await execIn(ws, "pnpm audit --json 2>&1")
      out.audit = r
    } catch {
      out.audit = { skipped: true, reason: "no pnpm-lock.yaml in workspace" }
    }
  }
  if (scope.includes("unit")) {
    ctx.send("log", { line: "跑测试..." })
    if (toolAvailable(ws, "vitest")) {
      const r = await execIn(ws, "npx --no-install vitest run --reporter=json 2>&1")
      out.unit = r
    } else {
      out.unit = { skipped: true, reason: "vitest not installed" }
    }
  }
  if (scope.includes("e2e")) {
    ctx.send("log", { line: "跑 e2e..." })
    const r = await execIn(ws, "npx --no-install playwright test --reporter=json 2>&1")
    out.e2e = r.exitCode === 0 ? "passed" : { skipped: true, reason: "playwright not configured" }
  }

  ctx.setPhase("reviewing", "LLM 分析审查结果")
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

/** Build a repair instruction from defects extracted from the review report */
function buildFixInstruction(reportContent: string, severityFilter: ("P0" | "P1")[]): string {
  // Extract defect lines from the report
  const lines = reportContent.split("\n")
  const defects = lines.filter(l => {
    const m = l.match(/^-\s*\[(P[012])\]/)
    return m && severityFilter.includes(m[1] as "P0" | "P1")
  })

  if (defects.length === 0) return "修复审查报告中的所有问题。"

  return `请修复以下审查缺陷，只修改 workspace 中对应的文件：

${defects.join("\n")}

修复完成后，运行 tsc --noEmit 和 eslint . 验证。`
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

  const ws = paths.workspace(ctx.projectId)
  const instruction = buildFixInstruction(reportContent, severityFilter)

  // 使用 Pi dev session 执行真实修复（workspace_write tool）
  try {
    ctx.send("log", { line: "通过 Pi AgentSession 执行修复..." })
    await piSessionPool.followUp(ctx.projectId, instruction)
  } catch {
    ctx.send("log", { line: "Pi session 不可用，使用 LLM 生成修复方案" })
    const result = await chat({
      task: "code-fix",
      messages: [
        { role: "system", content: "你是代码修复 Agent。基于审查报告修复问题。输出完整修复后的文件内容。" },
        { role: "user", content: instruction + "\n\n审查报告:\n" + reportContent },
      ],
      temperature: 0.1,
      maxTokens: 4096,
    })
    ctx.send("log", { line: `修复方案: ${result.text.slice(0, 300)}...` })
  }

  // 重新跑静态检查验证修复效果
  ctx.send("log", { line: "重跑 tsc --noEmit 验证修复..." })
  const tscR = await execIn(ws, "npx --no-install tsc --noEmit 2>&1")

  ctx.send("log", { line: "重跑 eslint 验证修复..." })
  let eslintR: ExecResult = { skipped: true }
  if (toolAvailable(ws, "eslint")) {
    eslintR = await execIn(ws, "npx --no-install eslint . --max-warnings=0 2>&1")
  }

  const fixed = (tscR.exitCode ?? 1) === 0 && (eslintR.exitCode ?? eslintR.skipped ? 0 : 1) === 0

  ctx.send("result", {
    repaired: fixed,
    tscPassed: (tscR.exitCode ?? 1) === 0,
    eslintPassed: (eslintR.exitCode ?? 1) === 0 || eslintR.skipped,
  })
}
