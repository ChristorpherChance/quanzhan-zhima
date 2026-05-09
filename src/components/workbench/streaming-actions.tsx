"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { CornerDownRight, CornerUpLeft, Send } from "lucide-react"

interface StreamingActionsProps {
  projectId: string
  streaming: boolean
  className?: string
}

export function StreamingActions({ projectId, streaming, className }: StreamingActionsProps) {
  const [mode, setMode] = useState<"steer" | "follow-up" | null>(null)
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)

  if (!streaming) return null

  const handleAction = async () => {
    if (!message.trim() || !mode) return
    setSending(true)
    try {
      await fetch(`/api/projects/${projectId}/sessions/${mode === "steer" ? "steer" : "follow-up"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      })
      setMessage("")
      setMode(null)
    } catch {
      // 静默失败
    } finally {
      setSending(false)
    }
  }

  if (mode) {
    return (
      <div className={cn("flex items-center gap-2 p-2 bg-muted/50 border-t", className)}>
        <span className="text-xs font-medium shrink-0">
          {mode === "steer" ? "打断重导" : "等完再说"}
        </span>
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAction()}
          placeholder={mode === "steer" ? "输入新的指令..." : "输入追加的指令..."}
          disabled={sending}
          className="text-xs h-7"
        />
        <Button size="sm" className="h-7" onClick={handleAction} disabled={sending || !message.trim()}>
          <Send className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7" onClick={() => setMode(null)}>
          取消
        </Button>
      </div>
    )
  }

  return (
    <div className={cn("flex gap-1 p-2 border-t", className)}>
      <Button
        variant="outline"
        size="sm"
        className="text-xs gap-1 h-7"
        onClick={() => setMode("steer")}
      >
        <CornerUpLeft className="w-3 h-3" />
        Steer 打断重导
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-xs gap-1 h-7"
        onClick={() => setMode("follow-up")}
      >
        <CornerDownRight className="w-3 h-3" />
        Follow-up 等完再说
      </Button>
    </div>
  )
}
