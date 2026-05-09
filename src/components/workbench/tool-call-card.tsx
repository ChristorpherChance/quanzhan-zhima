"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Wrench, Check, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type ToolStatus = "pending" | "running" | "success" | "error"

interface ToolCallCardProps {
  toolName: string
  toolCallId?: string
  status: ToolStatus
  args?: unknown
  result?: unknown
  defaultOpen?: boolean
}

const statusConfig: Record<ToolStatus, { icon: React.ReactNode; label: string; border: string; bg: string }> = {
  pending: {
    icon: <Wrench className="w-3.5 h-3.5 text-orange-500" />,
    label: "准备中",
    border: "border-orange-300",
    bg: "bg-orange-50/40",
  },
  running: {
    icon: <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
    label: "执行中",
    border: "border-blue-300",
    bg: "bg-blue-50/40",
  },
  success: {
    icon: <Check className="w-3.5 h-3.5 text-green-600" />,
    label: "完成",
    border: "border-green-300",
    bg: "bg-green-50/30",
  },
  error: {
    icon: <X className="w-3.5 h-3.5 text-red-600" />,
    label: "失败",
    border: "border-red-300",
    bg: "bg-red-50/30",
  },
}

export function ToolCallCard({
  toolName,
  status = "pending",
  args,
  result,
  defaultOpen = false,
}: ToolCallCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const cfg = statusConfig[status]

  return (
    <div className={cn("rounded-md mb-2 overflow-hidden border", cfg.border, cfg.bg)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        )}
        {cfg.icon}
        <span className="font-mono text-xs truncate">{toolName}</span>
        <span className="text-muted-foreground ml-auto shrink-0">{cfg.label}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {args !== undefined && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">参数</div>
              <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 rounded p-2 max-h-32 overflow-y-auto">
                {typeof args === "string" ? args : JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {result !== undefined && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {status === "error" ? "错误" : "结果"}
              </div>
              <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 rounded p-2 max-h-48 overflow-y-auto">
                {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
