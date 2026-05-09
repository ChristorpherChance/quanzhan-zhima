"use client"

import { useState, useRef, useCallback } from "react"
import { Upload, Loader2, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

interface FileUploadProps {
  projectId: string
  onParsed: (content: string, fileName: string) => void
}

export function FileUpload({ projectId, onParsed }: FileUploadProps) {
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const ACCEPT = ".md,.txt,.doc,.docx"

  const handleFile = useCallback(
    async (file: File) => {
      setFileName(file.name)
      setParsing(true)
      try {
        const formData = new FormData()
        formData.set("file", file)
        const r = await fetch(`/api/projects/${projectId}/design/upload`, {
          method: "POST",
          body: formData,
        })
        const { data } = await r.json()
        if (data?.content) {
          onParsed(data.content, data.fileName ?? file.name)
        }
      } catch {
        // ignore
      } finally {
        setParsing(false)
      }
    },
    [projectId, onParsed],
  )

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f) handleFile(f)
        }}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-dashed transition-colors",
          dragging
            ? "border-primary bg-primary/5 text-primary"
            : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground",
        )}
      >
        {parsing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Upload className="w-3.5 h-3.5" />
        )}
        {parsing ? "解析中..." : fileName ? (
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {fileName}
          </span>
        ) : (
          "上传文档"
        )}
      </button>
    </div>
  )
}
