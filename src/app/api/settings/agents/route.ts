import { withErrorBoundary } from "@/lib/errors"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db/prisma"

export const GET = withErrorBoundary(async () => {
  const rows = await prisma.agentConfig.findMany({ orderBy: { key: "asc" } })
  return { agents: rows }
})

export const PUT = withErrorBoundary(async (req: NextRequest) => {
  const body = await req.json() as {
    key: string
    modelId?: string
    provider?: string
    temperature?: number
    maxTokens?: number
    timeoutMs?: number
    enabled?: boolean
  }

  const updated = await prisma.agentConfig.update({
    where: { key: body.key },
    data: {
      modelId: body.modelId,
      provider: body.provider,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      timeoutMs: body.timeoutMs,
      enabled: body.enabled,
    },
  })

  return { agent: updated }
})
