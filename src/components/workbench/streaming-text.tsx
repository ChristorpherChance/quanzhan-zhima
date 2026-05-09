"use client"

import { MarkdownView } from "@/components/markdown"
import { cn } from "@/lib/utils"

interface StreamingTextProps {
  content: string
  streaming?: boolean
}

export function StreamingText({ content, streaming }: StreamingTextProps) {
  return (
    <div className="relative">
      <MarkdownView content={content} />
      {streaming && (
        <span
          className={cn(
            "inline-block w-2 h-4 ml-0.5 align-text-bottom",
            "bg-primary animate-pulse rounded-sm"
          )}
        />
      )}
    </div>
  )
}
