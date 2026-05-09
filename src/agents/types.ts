export type AgentEventType =
  | "log" | "progress" | "result" | "error"
  | "text_delta" | "thinking_delta"
  | "tool_start" | "tool_update" | "tool_end"
  | "phase" | "heartbeat"

export type AgentPhase =
  | "queued"
  | "thinking"
  | "tool_running"
  | "writing"
  | "reviewing"
  | "done"
  | "error"
  | "aborted"

export interface PhasePayload {
  phase: AgentPhase
  label: string
  percent?: number
  tokenIn?: number
  tokenOut?: number
  elapsedMs: number
}

export interface AgentRunCtx {
  projectId: string
  jobId: string
  send: (event: AgentEventType, data: unknown) => void
  abortSignal?: AbortSignal
  setPhase: (phase: AgentPhase, label?: string) => void
  addTokens: (tokensIn: number, tokensOut: number) => void
}
