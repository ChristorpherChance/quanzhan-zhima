"use client"

import { useEffect, useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { AgentTabs } from "@/components/workbench/AgentTabs"
import { PanelRightClose, PanelRightOpen } from "lucide-react"

interface ChatDockProps {
  projectId?: string
  jobIds: Record<string, string | null>
  streamingUrls: Record<string, string | null>
  onSend: Record<string, (text: string) => Promise<void>>
  onDone?: Record<string, () => void>
  className?: string
}

export function ChatDock({ projectId, jobIds, streamingUrls, onSend, onDone, className }: ChatDockProps) {
  const [open, setOpen] = useState(true)

  // Cmd+J 切换
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "j") {
      e.preventDefault()
      setOpen((p) => !p)
    }
  }, [])

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className={cn("flex shrink-0 transition-all duration-200", open ? "w-[420px]" : "w-0", className)}>
      {/* 折叠条 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="shrink-0 w-4 hover:bg-muted/50 flex items-center justify-center transition-colors cursor-pointer border-l"
        title={open ? "收起对话 (⌘+J)" : "展开对话 (⌘+J)"}
      >
        {open ? (
          <PanelRightClose className="w-3 h-3 text-muted-foreground" />
        ) : (
          <PanelRightOpen className="w-3 h-3 text-muted-foreground" />
        )}
      </button>

      {/* 抽屉内容 */}
      {open && (
        <div className="w-[404px] border-l flex flex-col h-full bg-background">
          <AgentTabs
            projectId={projectId}
            jobIds={jobIds}
            streamingUrls={streamingUrls}
            onSend={onSend}
            onDone={onDone}
          />
        </div>
      )}
    </div>
  )
}
