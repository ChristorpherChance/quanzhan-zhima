import { withErrorBoundary } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"
import { piSessionPool } from "@/lib/pi/session-manager"
import { NextRequest } from "next/server"

// Import orchestrator's event targets to push abort events
import { getJobEventTarget } from "@/agents/orchestrator"

export const POST = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const job = await prisma.job.findUnique({ where: { id: params.id } })
  if (!job) return { ok: false, error: "Job not found" }

  // 1. Update job status
  await prisma.job.update({
    where: { id: params.id },
    data: { status: "cancelled", endedAt: new Date() },
  })

  // 2. Abort the Pi session
  if (job.projectId) {
    try {
      const session = piSessionPool.get(job.projectId)
      if (session) {
        await session.session.abort()
        piSessionPool.dispose(job.projectId)
      }
    } catch {
      // abort may throw if already settled
    }
  }

  // 3. Push aborted phase + end events via EventTarget
  const target = getJobEventTarget(params.id)
  if (target) {
    const now = Date.now()
    target.dispatchEvent(new CustomEvent("job-event", {
      detail: { event: "phase", data: { phase: "aborted", label: "已终止", tokenIn: 0, tokenOut: 0, elapsedMs: now - new Date(job.startedAt).getTime() }, ts: new Date().toISOString() },
    }))
    target.dispatchEvent(new CustomEvent("job-event", {
      detail: { event: "aborted", data: { jobId: params.id, at: now }, ts: new Date().toISOString() },
    }))
    target.dispatchEvent(new CustomEvent("job-event", {
      detail: { event: "end", data: { reason: "cancelled" }, ts: new Date().toISOString() },
    }))
  }

  return { ok: true }
})
