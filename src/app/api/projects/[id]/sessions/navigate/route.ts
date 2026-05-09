import { withErrorBoundary } from "@/lib/errors"
import { piSessionPool } from "@/lib/pi/session-manager"
import { NextRequest } from "next/server"
import { z } from "zod"

const navigateSchema = z.object({ nodeId: z.string() })

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const { nodeId } = navigateSchema.parse(await req.json())
  await piSessionPool.navigate(params.id, nodeId)
  return { ok: true }
})
