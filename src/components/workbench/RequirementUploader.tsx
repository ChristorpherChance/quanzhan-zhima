"use client"

import { useState, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { Upload, FileText, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface UploadedDoc {
  uploadId: string
  originalName: string
  format: string
  contentLength: number
  preview: string
}

interface Props {
  projectId: string
  onUploaded?: (doc: UploadedDoc) => void
}

export function RequirementUploader({ projectId, onUploaded }: Props) {
  const [docs, setDocs] = useState<UploadedDoc[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const r = await fetch(`/api/projects/${projectId}/requirement/upload`, {
        method: "POST",
        body: formData,
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error?.message ?? "上传失败")

      const doc = json.data as UploadedDoc
      setDocs((prev) => [...prev, doc])
      onUploaded?.(doc)
      toast({ title: `已上传: ${doc.originalName}` })
    } catch (e: unknown) {
      toast({ title: "上传失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }, [projectId, onUploaded])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    // reset so same file can be re-uploaded
    e.target.value = ""
  }, [uploadFile])

  const removeDoc = useCallback((uploadId: string) => {
    setDocs((prev) => prev.filter((d) => d.uploadId !== uploadId))
  }, [])

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50",
          uploading && "opacity-50 pointer-events-none",
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".docx,.pdf,.md,.txt"
          onChange={handleChange}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            解析中...
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <Upload className="w-5 h-5" />
            <span className="text-xs">拖拽或点击上传文档</span>
            <span className="text-[10px]">支持 .docx .pdf .md .txt (≤10MB)</span>
          </div>
        )}
      </div>

      {/* 已上传文档列表 */}
      {docs.length > 0 && (
        <div className="space-y-1">
          {docs.map((doc) => (
            <div
              key={doc.uploadId}
              className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-md text-xs"
            >
              <FileText className="w-3.5 h-3.5 text-green-600 shrink-0" />
              <span className="flex-1 truncate">{doc.originalName}</span>
              <span className="text-[10px] text-muted-foreground">
                {doc.format.toUpperCase()} · {(doc.contentLength / 1000).toFixed(1)}KB
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 shrink-0"
                onClick={(e) => { e.stopPropagation(); removeDoc(doc.uploadId) }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
