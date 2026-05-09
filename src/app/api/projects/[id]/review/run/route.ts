import { withErrorBoundary } from "@/lib/errors"
import { reviewRunSchema } from "@/lib/api-schemas"
import { startJob } from "@/agents/orchestrator"
import { runReview } from "@/agents/review-agent"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const body = reviewRunSchema.parse(await req.json())
  const job = await startJob({
    projectId: params.id,
    agentType: "review",
    type: "review-run",
    run: async (ctx) => { await runReview(ctx, body.scope ?? ["lint", "types", "audit", "unit"]) },
  })
  return { jobId: job.id }
})
