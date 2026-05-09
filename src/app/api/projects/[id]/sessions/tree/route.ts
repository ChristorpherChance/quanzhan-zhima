import { withErrorBoundary } from "@/lib/errors"
import { piSessionPool } from "@/lib/pi/session-manager"
import { NextRequest } from "next/server"

export const GET = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const tree = await piSessionPool.getTree(params.id)
  return { tree }
})
