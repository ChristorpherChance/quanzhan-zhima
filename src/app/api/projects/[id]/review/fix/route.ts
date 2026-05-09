import { withErrorBoundary } from "@/lib/errors"
import { reviewFixSchema } from "@/lib/api-schemas"
import { startJob } from "@/agents/orchestrator"
import { fixReview } from "@/agents/review-agent"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const body = reviewFixSchema.parse(await req.json())
  const job = await startJob({
    projectId: params.id,
    agentType: "dev",
    type: "review-run",
    run: async (ctx) => { await fixReview(ctx, body.severityFilter) },
  })
  return { jobId: job.id }
})
