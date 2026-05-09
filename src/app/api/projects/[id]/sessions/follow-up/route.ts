import { withErrorBoundary } from "@/lib/errors"
import { piSessionPool } from "@/lib/pi/session-manager"
import { NextRequest } from "next/server"
import { z } from "zod"

const followUpSchema = z.object({ message: z.string().min(1) })

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const { message } = followUpSchema.parse(await req.json())
  await piSessionPool.followUp(params.id, message)
  return { ok: true }
})
