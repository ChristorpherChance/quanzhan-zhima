/**
 * 统一事件映射（Single Source of Truth）
 *
 * Pi SDK 内部事件 → SSE 通道事件 → 前端渲染事件
 * v2.0 只使用细粒度事件: tool_start / tool_update / tool_end
 * 不再使用合并事件: tool-call
 */
import type { PiStreamEventType } from "@/lib/pi/session"

// ── SSE 通道事件名（与前端 agent-chat 处理保持一致） ──────

export const SSE_EVENT = {
  TEXT_DELTA: "text_delta",
  THINKING_DELTA: "thinking_delta",
  TOOL_START: "tool_start",
  TOOL_UPDATE: "tool_update",
  TOOL_END: "tool_end",
  RESULT: "result",
  ERROR: "error",
  PROGRESS: "progress",
  LOG: "log",
  PHASE: "phase",
  HEARTBEAT: "heartbeat",
  DRAFT: "draft",
  END: "end",
  ABORTED: "aborted",
  DROPPED: "dropped",
} as const

export type SseEventName = (typeof SSE_EVENT)[keyof typeof SSE_EVENT]

// ── 前端 MessageBlock 显示类型 ────────────────────────────

export type BlockKind = "thinking" | "text" | "tool-call" | "error"

// ── Agent 阶段类型 ────────────────────────────────────────

export type AgentPhase =
  | "queued"
  | "thinking"
  | "tool_running"
  | "writing"
  | "reviewing"
  | "done"
  | "error"
  | "aborted"

// ── Pi SDK 事件 → SSE 事件映射 ────────────────────────────

export function mapPiEventToSse(type: PiStreamEventType): SseEventName | null {
  switch (type) {
    case "text_delta": return SSE_EVENT.TEXT_DELTA
    case "thinking_delta": return SSE_EVENT.THINKING_DELTA
    case "tool_start": return SSE_EVENT.TOOL_START
    case "tool_update": return SSE_EVENT.TOOL_UPDATE
    case "tool_end": return SSE_EVENT.TOOL_END
    case "done": return SSE_EVENT.END
    case "error": return SSE_EVENT.ERROR
    // 旧版合并事件不再映射到 SSE
    case "tool-call": return null
    case "delta": return null
    default: return null
  }
}

// ── Job 状态类型 ──────────────────────────────────────────

export type JobStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled"
