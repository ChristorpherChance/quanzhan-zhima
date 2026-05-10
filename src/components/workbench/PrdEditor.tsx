"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MarkdownView } from "./MarkdownView"
import { Save, Lock, Undo2, Loader2 } from "lucide-react"

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.Editor), { ssr: false })

interface PrdEditorProps {
  projectId: string
  initialContent: string
  locked: boolean
  onSaved: () => void
  onLocked: () => void
}

export function PrdEditor({ projectId, initialContent, locked, onSaved, onLocked }: PrdEditorProps) {
  const [content, setContent] = useState(initialContent)
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pristineRef = useRef(true)

  useEffect(() => {
    setContent(initialContent)
    pristineRef.current = true
  }, [initialContent])

  const doSave = useCallback(async (c: string) => {
    setSaving(true)
    try {
      await fetch(`/api/projects/${projectId}/requirement/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: c }),
      })
      setLastSaved(new Date())
      onSaved()
    } catch {
      // save failed, keep current state
    } finally {
      setSaving(false)
    }
  }, [projectId, onSaved])

  // 自动保存防抖 1.5s
  const onChange = useCallback((v: string | undefined) => {
    const next = v ?? ""
    setContent(next)
    pristineRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSave(next), 1500)
  }, [doSave])

  const handleLockPrd = async () => {
    setLocking(true)
    try {
      await fetch(`/api/projects/${projectId}/artifacts/prd/lock`, { method: "POST" })
      onLocked()
    } catch {
      // lock failed
    } finally {
      setLocking(false)
    }
  }

  const handleRevert = () => {
    setContent(initialContent)
    pristineRef.current = true
  }

  const handleManualSave = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    doSave(content)
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleManualSave} disabled={saving || locked} className="gap-1">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            保存
          </Button>
          <Button size="sm" variant="outline" onClick={handleRevert} disabled={locked} className="gap-1">
            <Undo2 className="w-3.5 h-3.5" />
            还原
          </Button>
          <Button size="sm" variant="outline" onClick={handleLockPrd} disabled={locking || locked} className="gap-1">
            <Lock className="w-3.5 h-3.5" />
            {locking ? "锁定中..." : locked ? "已锁定" : "锁定 PRD"}
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {lastSaved && <span>已保存 {lastSaved.toLocaleTimeString()}</span>}
          {locked && <span className="text-amber-600 font-medium">PRD 已锁定（只读）</span>}
        </div>
      </div>

      {/* Dual pane */}
      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        {/* Left: Editor */}
        <div className="border rounded-md overflow-hidden">
          <div className="px-3 py-1.5 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
            Markdown 编辑
          </div>
          <div style={{ height: 500 }}>
            <MonacoEditor
              height="100%"
              defaultLanguage="markdown"
              value={content}
              onChange={onChange}
              options={{
                readOnly: locked,
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                wordWrap: "on",
                scrollBeyondLastLine: false,
              }}
              loading={<Skeleton className="h-full w-full" />}
            />
          </div>
        </div>

        {/* Right: Preview */}
        <div className="border rounded-md overflow-hidden">
          <div className="px-3 py-1.5 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
            实时预览
          </div>
          <div className="overflow-auto p-3" style={{ height: 500 }}>
            <MarkdownView source={content} />
          </div>
        </div>
      </div>
    </div>
  )
}
