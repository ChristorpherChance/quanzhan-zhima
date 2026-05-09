"use client"

import { useEffect, useRef, useState } from "react"

interface UseSSEOptions {
  onOpen?: () => void
  onClose?: () => void
  maxRetries?: number
  baseDelay?: number
}

export function useSSE(
  url: string | null,
  onEvent: (event: string, data: unknown) => void,
  opts?: UseSSEOptions,
) {
  const { maxRetries = 5, baseDelay = 1000, onOpen, onClose } = opts ?? {}
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "disconnected">("disconnected")

  useEffect(() => {
    if (!url) return
    let stopped = false
    let retries = 0

    const connect = async () => {
      if (stopped) return
      setConnectionState("connecting")

      const aborter = new AbortController()

      try {
        const res = await fetch(url, { signal: aborter.signal })
        if (!res.ok || !res.body) {
          throw new Error(`SSE connect failed: ${res.status}`)
        }

        setConnectionState("connected")
        retries = 0
        onOpenRef.current?.()

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (!stopped) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const parts = buffer.split("\n\n")
          buffer = parts.pop() ?? ""

          for (const part of parts) {
            const lines = part.split("\n")
            let event = ""
            let data = ""
            for (const line of lines) {
              if (line.startsWith("event: ")) event = line.slice(7)
              else if (line.startsWith("data: ")) data = line.slice(6)
            }
            if (!event) continue
            try {
              onEventRef.current(event, JSON.parse(data))
            } catch {
              onEventRef.current(event, data)
            }
          }
        }

        // 流正常结束
        if (!stopped) {
          setConnectionState("disconnected")
          onCloseRef.current?.()
        }
      } catch {
        if (stopped) return

        // 指数退避重连
        if (retries < maxRetries) {
          retries++
          const delay = baseDelay * Math.pow(2, retries - 1)
          await new Promise<void>((resolve) => setTimeout(resolve, delay))
          if (!stopped) connect()
        } else {
          setConnectionState("disconnected")
          onCloseRef.current?.()
        }
      }
    }

    connect()

    return () => {
      stopped = true
    }
  }, [url, maxRetries, baseDelay])

  return { connectionState }
}
