export type AgentEventType =
  | "log" | "progress" | "tool-call" | "result" | "error"
  | "text_delta" | "thinking_delta"
  | "tool_start" | "tool_update" | "tool_end"

export interface AgentRunCtx {
  projectId: string
  jobId: string
  send: (event: AgentEventType, data: unknown) => void
  abortSignal?: AbortSignal
}
