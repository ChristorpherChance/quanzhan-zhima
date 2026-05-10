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
      const results: Array<{ subtype: string; ok: boolean; length: number; error?: string }> = []
      const startAll = Date.now()

      for (let i = 0; i < DESIGN_ORDER.length; i++) {
        const subtype = DESIGN_ORDER[i]
        const label = LABELS[subtype] ?? subtype
        ctx.setPhase("thinking", `生成 ${label} (${i + 1}/5)`)
        ctx.send("progress", {
          phase: `design-gen-all`,
          message: `[${i + 1}/5] 正在生成 ${label}...`,
          step: i,
          total: 5,
          subtype,
        })

        const t0 = Date.now()
        try {
          const content = await generate(ctx, subtype)
          results.push({ subtype, ok: true, length: content.length })
          ctx.send("progress", {
            phase: `design-gen-all`,
            message: `[${i + 1}/5] ${label} 完成 (${((Date.now() - t0) / 1000).toFixed(0)}s, ${content.length} 字符)`,
            step: i,
            total: 5,
            subtype,
            done: true,
            elapsedMs: Date.now() - t0,
          })
        } catch (e: unknown) {
          const msg = String((e as Error)?.message ?? e)
          results.push({ subtype, ok: false, length: 0, error: msg })
          ctx.send("progress", {
            phase: `design-gen-all`,
            message: `[${i + 1}/5] ${label} 失败: ${msg}`,
            step: i,
            total: 5,
            subtype,
            failed: true,
            elapsedMs: Date.now() - t0,
          })
          // 失败不中断，继续执行后续步骤
        }
      }

      const totalMs = Date.now() - startAll
      ctx.send("result", {
        results,
        totalMs,
        summary: `${results.filter((r) => r.ok).length}/${DESIGN_ORDER.length} 成功，总耗时 ${(totalMs / 1000).toFixed(0)}s`,
      })
    },
  })

  return { jobId: job.id }
})
