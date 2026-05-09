"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
  className?: string
}

function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const sideClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }

  return (
    <div className="group relative inline-block">
      {children}
      <div
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-xs rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100",
          sideClasses[side],
          className
        )}
      >
        {content}
      </div>
    </div>
  )
}

export { Tooltip }
