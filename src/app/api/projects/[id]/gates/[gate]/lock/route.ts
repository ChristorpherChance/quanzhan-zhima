import { withErrorBoundary } from "@/lib/errors"
import { lockGate, type GateType } from "@/lib/hitl/gates"
import { appendGateLog } from "@/agents/orchestrator"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string; gate: string } },
) => {
  const result = await lockGate(params.id, params.gate as GateType)
  void appendGateLog(params.id, params.gate)
  return result
})
