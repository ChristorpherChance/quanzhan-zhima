import { withErrorBoundary } from "@/lib/errors"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { z } from "zod"

const AgentUpdateSchema = z.object({
  key: z.string().min(1),
  modelId: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(393216).optional(),
  timeoutMs: z.number().int().min(10000).max(3600000).optional(),
  enabled: z.boolean().optional(),
  systemPrompt: z.string().nullable().optional(),
})

export const GET = withErrorBoundary(async () => {
  const rows = await prisma.agentConfig.findMany({ orderBy: { key: "asc" } })
  return { agents: rows }
})

export const PUT = withErrorBoundary(async (req: NextRequest) => {
  const raw = await req.json()
  const parsed = AgentUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "E_BAD_REQUEST", message: "参数校验失败", details: parsed.error.flatten() } },
      { status: 400 },
    )
  }
  const body = parsed.data

  const updated = await prisma.agentConfig.update({
    where: { key: body.key },
    data: {
      modelId: body.modelId,
      provider: body.provider,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      timeoutMs: body.timeoutMs,
      enabled: body.enabled,
      systemPrompt: body.systemPrompt,
    },
  })

  return { agent: updated }
})
