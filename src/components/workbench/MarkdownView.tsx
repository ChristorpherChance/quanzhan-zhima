"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import { useState, useMemo } from "react"
import { MermaidBlock } from "./MermaidBlock"
import { Button } from "@/components/ui/button"
import { injectMermaidTheme } from "@/lib/markdown/mermaid-theme"

export function MarkdownView({ source, title }: { source: string; title?: string }) {
  const [mode, setMode] = useState<"render" | "source">("render")
  // J9: 注入 mermaid 配色（默认 light；后续接 useTheme 可切换 dark）
  const themedSource = useMemo(() => injectMermaidTheme(source, "light"), [source])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        {title && <h2 className="text-lg font-semibold">{title}</h2>}
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={mode === "render" ? "default" : "ghost"}
            onClick={() => setMode("render")}
          >
            渲染
          </Button>
          <Button
            size="sm"
            variant={mode === "source" ? "default" : "ghost"}
            onClick={() => setMode("source")}
          >
            Markdown 源码
          </Button>
        </div>
      </div>
      {mode === "source" ? (
        <pre className="overflow-auto rounded-lg bg-muted/40 p-3 text-xs">
          <code>{source}</code>
        </pre>
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              code({ className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || "")
                const lang = match?.[1]
                const code = String(children).replace(/\n$/, "")
                // Block code with mermaid language → render diagram
                if (className && lang === "mermaid") {
                  return <MermaidBlock code={code} caption="mermaid" />
                }
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                )
              },
            }}
          >
            {themedSource}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}
