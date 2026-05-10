"use client"

import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"
import { Button } from "@/components/ui/button"
import { Code2, Eye, Copy, Download } from "lucide-react"

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  flowchart: { htmlLabels: true },
})

export function MermaidBlock({ code, caption }: { code: string; caption?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<"render" | "source">("render")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (view !== "render" || !ref.current) return
    const id = `m-${Math.random().toString(36).slice(2)}`
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg
        setError(null)
      })
      .catch((e) => setError(String((e as Error)?.message ?? e)))
  }, [code, view])

  const onCopy = () => navigator.clipboard.writeText(code)
  const onDownload = () => {
    const svg = ref.current?.querySelector("svg")?.outerHTML
    if (!svg) return
    const blob = new Blob([svg], { type: "image/svg+xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${caption || "diagram"}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="my-4 rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs text-muted-foreground">{caption ?? "diagram"}</span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={view === "render" ? "default" : "ghost"}
            onClick={() => setView("render")}
          >
            <Eye className="h-3.5 w-3.5" /> 图
          </Button>
          <Button
            size="sm"
            variant={view === "source" ? "default" : "ghost"}
            onClick={() => setView("source")}
          >
            <Code2 className="h-3.5 w-3.5" /> 源码
          </Button>
          <Button size="sm" variant="ghost" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDownload}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {view === "render" ? (
        <div className="overflow-auto p-4">
          {error ? (
            <pre className="text-xs text-red-600 whitespace-pre-wrap">
              {error}
              {"\n\n--- 原始源码 ---\n"}
              {code}
            </pre>
          ) : (
            <div ref={ref} className="flex justify-center" />
          )}
        </div>
      ) : (
        <pre className="overflow-auto p-3 text-xs bg-muted/30">
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}
