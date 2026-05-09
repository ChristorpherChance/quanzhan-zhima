"use client"

import { useRef, useCallback } from "react"
import { useSSE } from "@/lib/use-sse"

interface UseAgentStreamOptions {
  projectId: string
  jobId: string | null
  onEvent: (event: string, data: unknown) => void
  onOpen?: () => void
  onClose?: () => void
  maxRetries?: number
}

/**
 * 统一流式 hook
 *
 * v2.0 策略：优先尝试 WebSocket（Future），当前统一走 SSE。
 * 当自定义服务器启用 ws:// 后，此处自动切换到 WS 通道。
 * 前端消费端无需修改 —— onEvent 签名完全一致。
 */
export function useAgentStream(opts: UseAgentStreamOptions) {
  const { projectId, jobId, onEvent, onOpen, onClose, maxRetries = 5 } = opts
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const handleEvent = useCallback((event: string, data: unknown) => {
    // 过滤掉已废弃的事件名
    if (event === "tool-call" || event === "delta") return
    onEventRef.current(event, data)
  }, [])

  const sseUrl = jobId ? `/api/jobs/${jobId}/stream` : null

  // ── 当前使用 SSE（日后可在此处插入 WebSocket 分支） ──────
  const { connectionState } = useSSE(sseUrl, handleEvent, {
    onOpen,
    onClose,
    maxRetries,
  })

  return {
    connectionState,
    // WebSocket-ready 标记（供未来使用）
    transport: "sse" as "sse" | "ws",
  }
}
