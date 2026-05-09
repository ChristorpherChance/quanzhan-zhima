import { withErrorBoundary } from "@/lib/errors"
import { designGenerateSchema } from "@/lib/api-schemas"
import { startJob } from "@/agents/orchestrator"
import { generate } from "@/agents/design-agent"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const body = designGenerateSchema.parse(await req.json())
  const job = await startJob({
    projectId: params.id,
    agentType: "design",
    type: "design-gen",
    run: async (ctx) => { await generate(ctx, body.subtype) },
  })
  return { jobId: job.id }
})
