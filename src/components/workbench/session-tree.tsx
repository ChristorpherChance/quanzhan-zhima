"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { GitBranch, GitFork, ListTree, ChevronRight, ChevronDown, ArrowLeft } from "lucide-react"
import type { SessionTreeNode } from "@/lib/pi/session-manager"

interface SessionTreeProps {
  projectId: string
  className?: string
}

export function SessionTree({ projectId, className }: SessionTreeProps) {
  const [tree, setTree] = useState<SessionTreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const fetchTree = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/sessions/tree`)
      const data = await res.json()
      setTree(data.tree ?? [])
    } catch {
      // 静默失败
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTree()
    const interval = setInterval(fetchTree, 30_000)
    return () => clearInterval(interval)
  }, [projectId])

  const toggleExpand = (id: string) => {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }

  const handleCompact = async () => {
    try {
      await fetch(`/api/projects/${projectId}/sessions/compact`, { method: "POST" })
      fetchTree()
    } catch { /* 静默失败 */ }
  }

  const handleFork = async () => {
    try {
      await fetch(`/api/projects/${projectId}/sessions/fork`, { method: "POST" })
      fetchTree()
    } catch { /* 静默失败 */ }
  }

  const handleNavigate = async (nodeId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/sessions/navigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }),
      })
      fetchTree()
    } catch { /* 静默失败 */ }
  }

  const renderNode = (node: SessionTreeNode, depth: number) => {
    const isExpanded = expanded.has(node.id)
    const hasChildren = node.children && node.children.length > 0

    return (
      <div key={node.id}>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 w-full text-left px-2 py-1 text-xs hover:bg-muted/50 transition-colors",
            node.active && "bg-primary/10 border-l-2 border-l-primary font-medium",
            !node.active && "border-l-2 border-l-transparent",
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => {
            if (hasChildren) toggleExpand(node.id)
            handleNavigate(node.id)
          }}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <span className="truncate flex-1">{node.label}</span>
          {node.messageCount > 0 && (
            <span className="text-[10px] text-muted-foreground shrink-0">{node.messageCount}</span>
          )}
        </button>
        {isExpanded && hasChildren && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <GitBranch className="w-3.5 h-3.5" />
          <span>会话分支</span>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleFork} title="分叉">
            <GitFork className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleCompact} title="压缩">
            <ListTree className="w-3 h-3" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {loading && tree.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground text-center">加载中...</div>
        )}
        {!loading && tree.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground text-center">
            <ArrowLeft className="w-4 h-4 mx-auto mb-1 opacity-30" />
            暂无会话分支
          </div>
        )}
        {tree.map((n) => renderNode(n, 0))}
      </ScrollArea>
    </div>
  )
}
