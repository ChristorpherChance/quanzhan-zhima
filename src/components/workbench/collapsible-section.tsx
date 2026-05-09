"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  variant?: "default" | "thinking" | "tool"
}

export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
  variant = "default",
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className={cn(
        "rounded-md mb-2 overflow-hidden border",
        variant === "tool" && "border-orange-300 bg-orange-50/50",
        variant === "thinking" && "border-blue-200 bg-blue-50/30",
        variant === "default" && "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        )}
        {variant === "thinking" && (
          <Loader2 className="w-3 h-3 animate-spin text-blue-500 shrink-0" />
        )}
        <span className="truncate">{title}</span>
      </button>
      {open && <div className="px-3 pb-3 text-xs">{children}</div>}
    </div>
  )
}
