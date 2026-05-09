import { withErrorBoundary } from "@/lib/errors"
import { designEditSchema } from "@/lib/api-schemas"
import { startJob } from "@/agents/orchestrator"
import { edit } from "@/agents/design-agent"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const body = designEditSchema.parse(await req.json())
  const job = await startJob({
    projectId: params.id,
    agentType: "design",
    type: "design-gen",
    run: async (ctx) => { await edit(ctx, body.subtype, body.instruction) },
  })
  return { jobId: job.id }
})
