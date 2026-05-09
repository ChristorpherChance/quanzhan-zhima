export type LlmRole = "system" | "user" | "assistant"

export type LlmMessage = { role: LlmRole; content: string }

export type LlmTask =
  | "reason-heavy"
  | "high-frequency"
  | "code-fix"
  | "review"
  | "clarify"

export interface LlmRequest {
  task: LlmTask
  messages: LlmMessage[]
  temperature?: number
  maxTokens?: number
  preferModel?: string
}

export interface LlmResponse {
  text: string
  model: string
  tokensIn: number
  tokensOut: number
}

export interface LlmStreamEvent {
  type: "delta" | "done" | "error"
  text?: string
  error?: string
  model?: string
}
