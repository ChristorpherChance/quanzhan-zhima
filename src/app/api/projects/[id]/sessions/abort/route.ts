import { withErrorBoundary } from "@/lib/errors"
import { piSessionPool } from "@/lib/pi/session-manager"
import { prisma } from "@/lib/db/prisma"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  // 1. Abort the Pi session (stops LLM streaming and tool calls)
  const session = piSessionPool.get(params.id)
  if (session) {
    try {
      await session.session.abort()
    } catch {
      // abort may throw if already settled, ignore
    }
    piSessionPool.dispose(params.id)
  }

  // 2. Cancel all running jobs for this project
  await prisma.job.updateMany({
    where: { projectId: params.id, status: "running" },
    data: { status: "cancelled", endedAt: new Date() },
  })

  return { ok: true }
})
