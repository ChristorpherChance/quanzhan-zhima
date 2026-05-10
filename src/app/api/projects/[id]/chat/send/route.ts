import { withErrorBoundary, AppError } from "@/lib/errors"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { z } from "zod"

const SendSchema = z.object({
  agentType: z.string().min(1),
  content: z.string().min(1),
  role: z.enum(["user"]).default("user"),
})

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const raw = await req.json()
  const parsed = SendSchema.safeParse(raw)
  if (!parsed.success) {
    throw new AppError("E_BAD_REQUEST", "参数校验失败: " + parsed.error.flatten().fieldErrors.content?.join(", "))
  }

  const { agentType, content } = parsed.data

  // Find or create conversation for this project + agentType
  let conv = await prisma.conversation.findUnique({
    where: { projectId_agentType: { projectId: params.id, agentType } },
  })
  if (!conv) {
    conv = await prisma.conversation.create({
      data: { projectId: params.id, agentType, messagesJson: "[]" },
    })
  }

  const msg = await prisma.chatMessage.create({
    data: {
      conversationId: conv.id,
      role: "user",
      content,
    },
  })

  return { message: msg, conversationId: conv.id }
})
