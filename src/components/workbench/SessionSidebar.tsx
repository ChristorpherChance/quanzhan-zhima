"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { GitBranch, GitFork, ListTree, ChevronDown } from "lucide-react"
import type { SessionTreeNode } from "@/lib/pi/session-manager"

interface SessionSidebarProps {
  projectId: string
  className?: string
  onFork?: () => void
  onCompact?: () => void
  onNavigate?: (nodeId: string) => void
}

export function SessionSidebar({ projectId, className, onFork, onCompact, onNavigate }: SessionSidebarProps) {
  const [sessionTree, setSessionTree] = useState<SessionTreeNode[]>([])
  const [showDropdown, setShowDropdown] = useState(false)

  const fetchTree = useCallback(() => {
    fetch(`/api/projects/${projectId}/sessions/tree`)
      .then((r) => r.json())
      .then((d) => setSessionTree(d.tree ?? []))
      .catch(() => {})
  }, [projectId])

  useEffect(() => {
    fetchTree()
    const interval = setInterval(fetchTree, 30_000)
    return () => clearInterval(interval)
  }, [fetchTree])

  const activeSession = sessionTree.find((n) => n.active) ?? sessionTree[0]

  const handleNavigate = (nodeId: string) => {
    onNavigate?.(nodeId)
    setShowDropdown(false)
    fetchTree()
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-1 px-3 py-2 border-b relative">
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted flex-1 min-w-0"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <GitBranch className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{activeSession?.label ?? "默认会话"}</span>
          <ChevronDown className={cn("w-3 h-3 shrink-0 ml-auto transition-transform", showDropdown && "rotate-180")} />
        </button>
        <button
          type="button"
          className="shrink-0 p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
          onClick={onFork}
          title="分叉新会话"
        >
          <GitFork className="w-3 h-3" />
        </button>
        <button
          type="button"
          className="shrink-0 p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
          onClick={onCompact}
          title="压缩会话"
        >
          <ListTree className="w-3 h-3" />
        </button>

        {/* 下拉菜单 */}
        {showDropdown && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
            <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-popover border rounded-md shadow-md max-h-64 overflow-y-auto">
              {sessionTree.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">暂无会话分支</div>
              )}
              {sessionTree.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={cn(
                    "flex items-center gap-1.5 w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                    node.active && "bg-primary/10 font-medium border-l-2 border-l-primary",
                    !node.active && "border-l-2 border-l-transparent",
                  )}
                  onClick={() => handleNavigate(node.id)}
                >
                  <span className="truncate flex-1">{node.label}</span>
                  {node.messageCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">{node.messageCount}</span>
                  )}
                  {node.active && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
