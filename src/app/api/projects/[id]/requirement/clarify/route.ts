import { withErrorBoundary } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"
import { clarifySchema } from "@/lib/api-schemas"
import { startJob } from "@/agents/orchestrator"
import { clarify } from "@/agents/requirement-agent"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const body = clarifySchema.parse(await req.json())
  const project = await prisma.project.findUniqueOrThrow({ where: { id: params.id } })
  const job = await startJob({
    projectId: params.id,
    agentType: "requirement",
    type: "clarify",
    run: async (ctx) => { await clarify(ctx, project.oneLiner, body.extraContext) },
  })
  return { jobId: job.id }
})
