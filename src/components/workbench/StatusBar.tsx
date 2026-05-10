"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface StatusBarProps {
  projectId?: string
  className?: string
}

interface StatusInfo {
  phase: string
  tokensIn: number
  tokensOut: number
  cost: number
}

export function StatusBar({ projectId, className }: StatusBarProps) {
  const [status, setStatus] = useState<StatusInfo>({
    phase: "待命",
    tokensIn: 0,
    tokensOut: 0,
    cost: 0,
  })

  useEffect(() => {
    if (!projectId) return

    const handler = (e: CustomEvent<StatusInfo>) => {
      setStatus((prev) => ({ ...prev, ...e.detail }))
    }

    window.addEventListener("agent-status" as any, handler as EventListener)
    return () => window.removeEventListener("agent-status" as any, handler as EventListener)
  }, [projectId])

  const totalTokens = status.tokensIn + status.tokensOut

  return (
    <div className={cn(
      "flex items-center justify-between px-3 py-1.5 border-t text-xs text-muted-foreground bg-muted/30 shrink-0",
      className,
    )}>
      <div className="flex items-center gap-2">
        <span className={cn(
          "inline-block w-1.5 h-1.5 rounded-full",
          status.phase === "待命" ? "bg-gray-400" : "bg-green-500 animate-pulse",
        )} />
        <span>{status.phase}</span>
      </div>
      <div className="flex items-center gap-3">
        {totalTokens > 0 && (
          <span title={`输入 ${status.tokensIn} / 输出 ${status.tokensOut}`}>
            {totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens} tokens
          </span>
        )}
        {status.cost > 0 && (
          <span>¥{status.cost.toFixed(4)}</span>
        )}
      </div>
    </div>
  )
}
