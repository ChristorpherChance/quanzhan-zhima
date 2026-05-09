"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Save, X, Edit3 } from "lucide-react"

interface ArtifactEditorProps {
  content: string
  artifactType: string
  projectId: string
  onSave: (newContent: string) => Promise<void>
  onCancel: () => void
}

export function ArtifactEditor({
  content,
  artifactType,
  onSave,
  onCancel,
}: ArtifactEditorProps) {
  const [draft, setDraft] = useState(content)
  const [saving, setSaving] = useState(false)
  const isHtml = artifactType === "design-ui"

  const handleSave = async () => {
    if (draft === content) {
      onCancel()
      return
    }
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-[500px]">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-yellow-50/80 dark:bg-yellow-950/20">
        <span className="text-sm text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
          <Edit3 className="h-4 w-4" />
          编辑模式 — {isHtml ? "HTML" : "Markdown"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            <X className="h-4 w-4 mr-1" />取消
          </Button>
          <Button variant="default" size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? "保存中..." : "保存并创建新版本"}
          </Button>
        </div>
      </div>

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="flex-1 resize-none border-0 rounded-none font-mono text-sm leading-relaxed p-4 focus-visible:ring-0 focus-visible:ring-offset-0"
        placeholder="输入内容..."
        spellCheck={false}
      />

      <div className="px-4 py-2 border-t text-xs text-muted-foreground bg-muted/20">
        {isHtml
          ? "编辑 HTML 源码 — 保存后将更新 UI 原型预览"
          : "编辑 Markdown 源码 — 支持 GFM 语法（表格、代码块等）"}
      </div>
    </div>
  )
}
