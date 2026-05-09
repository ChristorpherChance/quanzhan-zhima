import { withErrorBoundary } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"
import { answerSchema } from "@/lib/api-schemas"
import { startJob } from "@/agents/orchestrator"
import { draft } from "@/agents/requirement-agent"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const body = answerSchema.parse(await req.json())
  const project = await prisma.project.findUniqueOrThrow({ where: { id: params.id } })
  const job = await startJob({
    projectId: params.id,
    agentType: "requirement",
    type: "draft",
    run: async (ctx) => { await draft(ctx, project.oneLiner, body.answers) },
  })
  return { jobId: job.id }
})
