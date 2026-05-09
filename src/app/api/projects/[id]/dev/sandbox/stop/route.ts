import { withErrorBoundary } from "@/lib/errors"
import { getRunning } from "@/lib/sandbox"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const h = getRunning(params.id)
  if (h) await h.stop()
  return { stopped: true }
})
