import { withErrorBoundary } from "@/lib/errors"
import { editRequirementSchema } from "@/lib/api-schemas"
import { startJob } from "@/agents/orchestrator"
import { edit } from "@/agents/requirement-agent"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const body = editRequirementSchema.parse(await req.json())
  const job = await startJob({
    projectId: params.id,
    agentType: "requirement",
    type: "edit",
    run: async (ctx) => { await edit(ctx, body.instruction, body.section) },
  })
  return { jobId: job.id }
})
