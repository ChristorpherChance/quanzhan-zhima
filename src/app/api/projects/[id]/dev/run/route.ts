import { withErrorBoundary } from "@/lib/errors"
import { devRunSchema } from "@/lib/api-schemas"
import { startJob } from "@/agents/orchestrator"
import { runDev } from "@/agents/dev-agent"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const body = devRunSchema.parse(await req.json())
  const job = await startJob({
    projectId: params.id,
    agentType: "dev",
    type: "pi-run",
    run: async (ctx) => { await runDev(ctx, body.instruction) },
  })
  return { jobId: job.id }
})
