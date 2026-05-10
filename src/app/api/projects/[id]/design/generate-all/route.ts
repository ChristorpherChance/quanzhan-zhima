import { withErrorBoundary } from "@/lib/errors"
import { startJob } from "@/agents/orchestrator"
import { generate } from "@/agents/design-agent"
import type { AgentRunCtx } from "@/agents/types"
import { NextRequest } from "next/server"

export const maxDuration = 1800

const DESIGN_ORDER = ["summary", "detail", "api", "db", "ui"] as const
const LABELS: Record<string, string> = {
  summary: "概要设计", detail: "详细设计", api: "接口设计", db: "数据库设计", ui: "UI原型",
}

type StepResult = "pending" | "running" | "done" | "failed"

export const POST = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const projectId = params.id

  const job = await startJob({
    projectId,
    agentType: "design",
    type: "design-gen-all",
    run: async (ctx: AgentRunCtx) => {
      const results: Record<string, StepResult> = Object.fromEntries(
        DESIGN_ORDER.map((s) => [s, "pending"]),
      ) as Record<string, StepResult>
      const startAll = Date.now()

      ctx.send("progress", { phase: "design-plan", subtypes: DESIGN_ORDER, results })

      for (let i = 0; i < DESIGN_ORDER.length; i++) {
        const subtype = DESIGN_ORDER[i]
        const label = LABELS[subtype] ?? subtype
        results[subtype] = "running"
        ctx.send("progress", { phase: "design-step-start", subtype, results, step: i, total: 5 })

        const t0 = Date.now()
        try {
          const content = await generate(ctx, subtype)
          results[subtype] = "done"
          ctx.send("progress", {
            phase: "design-step-done",
            subtype,
            results,
            step: i,
            total: 5,
            elapsedMs: Date.now() - t0,
            message: `${label} 完成 (${((Date.now() - t0) / 1000).toFixed(0)}s, ${content.length} 字符)`,
          })
        } catch (e: unknown) {
          const msg = String((e as Error)?.message ?? e)
          results[subtype] = "failed"
          ctx.send("progress", {
            phase: "design-step-failed",
            subtype,
            results,
            step: i,
            total: 5,
            elapsedMs: Date.now() - t0,
            message: msg,
          })
          throw e // 前一步失败立即停，后续不跳
        }
      }

      const totalMs = Date.now() - startAll
      ctx.send("result", { results, totalMs })
    },
  })

  return { jobId: job.id }
})
