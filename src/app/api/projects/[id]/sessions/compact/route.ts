import { withErrorBoundary } from "@/lib/errors"
import { piSessionPool } from "@/lib/pi/session-manager"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  await piSessionPool.compact(params.id)
  return { ok: true }
})
