import { withErrorBoundary } from "@/lib/errors"
import { reopenGate, type GateType } from "@/lib/hitl/gates"
import { reopenGateSchema } from "@/lib/api-schemas"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string; gate: string } },
) => {
  const body = reopenGateSchema.parse(await req.json())
  const result = await reopenGate(params.id, params.gate as GateType, body.reason)
  return result
})
