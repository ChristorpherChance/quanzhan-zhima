"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CodePreview } from "@/components/workbench/code-preview"
import { MarkdownView } from "@/components/markdown"
import { cn } from "@/lib/utils"
import { FileText, Code, Eye, Download, FolderOpen } from "lucide-react"
import type { FileChange } from "@/lib/pi/file-tracker"

interface FilePreviewPanelProps {
  files: FileChange[]
  className?: string
}

const PREVIEWABLE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "json", "css", "html", "md", "py", "sql",
  "yaml", "yml", "xml", "svg", "sh", "env", "gitignore", "dockerfile",
])

const MARKDOWN_EXT = new Set(["md"])

function isPreviewable(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
  return PREVIEWABLE_EXT.has(ext) || MARKDOWN_EXT.has(ext)
}

function downloadFile(file: FileChange) {
  const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = file.path.split("/").pop() ?? file.path
  a.click()
  URL.revokeObjectURL(url)
}

export function FilePreviewPanel({ files, className }: FilePreviewPanelProps) {
  const [selected, setSelected] = useState<string | null>(null)

  const selectedFile = useMemo(
    () => files.find((f) => f.path === selected),
    [files, selected],
  )

  if (files.length === 0) {
    return (
      <div className={cn("flex items-center justify-center p-8 text-xs text-muted-foreground", className)}>
        <div className="text-center">
          <FolderOpen className="w-6 h-6 mx-auto mb-2 opacity-30" />
          <p>暂无文件变更</p>
          <p className="mt-0.5 opacity-50">Agent 写出的文件将在此预览</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="px-3 py-2 border-b text-xs font-medium flex items-center gap-2">
        <FileText className="w-3.5 h-3.5" />
        <span>文件变更</span>
        <span className="text-muted-foreground">({files.length})</span>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* 文件列表 */}
        <ScrollArea className="w-48 border-r shrink-0">
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setSelected(f.path === selected ? null : f.path)}
              className={cn(
                "flex items-center gap-1.5 w-full text-left px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors border-l-2",
                f.path === selected
                  ? "border-l-primary bg-muted/30 font-medium"
                  : "border-l-transparent",
              )}
            >
              {MARKDOWN_EXT.has(f.path.split(".").pop()?.toLowerCase() ?? "") ? (
                <Eye className="w-3 h-3 shrink-0 text-blue-500" />
              ) : (
                <Code className="w-3 h-3 shrink-0 text-orange-500" />
              )}
              <span className="truncate flex-1">{f.path.split("/").pop() ?? f.path}</span>
            </button>
          ))}
        </ScrollArea>

        {/* 预览区域 */}
        <div className="flex-1 min-w-0">
          {selectedFile ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-3 py-1.5 border-b text-xs text-muted-foreground">
                <span className="font-mono truncate">{selectedFile.path}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-xs"
                  onClick={() => downloadFile(selectedFile)}
                >
                  <Download className="w-3 h-3" />
                  下载
                </Button>
              </div>
              <ScrollArea className="flex-1">
                {MARKDOWN_EXT.has(selectedFile.path.split(".").pop()?.toLowerCase() ?? "") ? (
                  <div className="p-3">
                    <MarkdownView content={selectedFile.content} />
                  </div>
                ) : (
                  <CodePreview
                    content={selectedFile.content}
                    fileName={selectedFile.path}
                  />
                )}
              </ScrollArea>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
              选择文件以预览
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
