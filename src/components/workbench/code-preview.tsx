"use client"

import { cn } from "@/lib/utils"

interface CodePreviewProps {
  content: string
  fileName: string
  className?: string
}

function detectLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    json: "json", css: "css", html: "html", md: "markdown",
    py: "python", sql: "sql", yaml: "yaml", yml: "yaml",
    xml: "xml", svg: "svg", sh: "bash", dockerfile: "dockerfile",
  }
  return map[ext] ?? ext
}

export function CodePreview({ content, fileName, className }: CodePreviewProps) {
  return (
    <div className={cn("rounded-lg border overflow-hidden", className)}>
      <div className="flex items-center px-3 py-1.5 bg-muted/50 border-b text-xs font-mono text-muted-foreground">
        <span>{fileName}</span>
        <span className="ml-2 text-[10px] opacity-50">{detectLanguage(fileName)}</span>
        <span className="ml-auto text-[10px] opacity-50">{content.length.toLocaleString()} 字符</span>
      </div>
      <pre className="p-4 text-xs font-mono leading-relaxed overflow-auto max-h-[500px] whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  )
}
