"use client"

import { useState, useEffect } from "react"
import { ChevronDown, ChevronRight, BrainCircuit } from "lucide-react"
import { cn } from "@/lib/utils"

interface ThinkingCardProps {
  content: string
  streaming?: boolean
  defaultOpen?: boolean
}

export function ThinkingCard({ content, streaming, defaultOpen = false }: ThinkingCardProps) {
  const [open, setOpen] = useState(defaultOpen)

  // 流式输出时自动展开
  useEffect(() => {
    if (streaming) setOpen(true)
  }, [streaming])

  if (!content) return null

  const preview = content.length > 80 ? content.slice(0, 80) + "..." : content

  return (
    <div className="rounded-md mb-2 overflow-hidden border border-blue-200 bg-blue-50/30">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs font-medium hover:bg-blue-100/40 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        )}
        <BrainCircuit
          className={cn("w-3.5 h-3.5 text-blue-500 shrink-0", streaming && "animate-pulse")}
        />
        <span className="truncate text-blue-700">
          {open ? "思考中..." : preview}
        </span>
        {streaming && (
          <span className="thinking-dots ml-1">
            <span /><span /><span />
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  )
}
