"use client"

import { useState, useCallback } from "react"

interface UsePiStreamingOptions {
  projectId: string
}

export function usePiStreaming({ projectId }: UsePiStreamingOptions) {
  const [streaming, setStreaming] = useState(false)

  const steer = useCallback(async (message: string) => {
    const res = await fetch(`/api/projects/${projectId}/sessions/steer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    })
    return res.ok
  }, [projectId])

  const followUp = useCallback(async (message: string) => {
    const res = await fetch(`/api/projects/${projectId}/sessions/follow-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    })
    return res.ok
  }, [projectId])

  return { streaming, setStreaming, steer, followUp }
}
