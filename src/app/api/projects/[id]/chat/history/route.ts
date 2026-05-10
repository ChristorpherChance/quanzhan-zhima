import { withErrorBoundary } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"

export const GET = withErrorBoundary(async (
  req: Request,
  { params }: { params: { id: string } },
) => {
  const url = new URL(req.url)
  const agentType = url.searchParams.get("agentType") ?? "dev"
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200)

  const conv = await prisma.conversation.findUnique({
    where: { projectId_agentType: { projectId: params.id, agentType } },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: limit,
      },
    },
  })

  if (!conv) return { messages: [], conversationId: null }

  return {
    conversationId: conv.id,
    messages: conv.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      meta: m.meta,
      createdAt: m.createdAt,
    })),
  }
})
