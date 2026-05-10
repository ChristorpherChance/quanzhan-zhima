"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useMemo } from "react"
import { injectMermaidTheme } from "@/lib/markdown/mermaid-theme"

interface MarkdownViewProps {
  content: string
}

export function MarkdownView({ content }: MarkdownViewProps) {
  const themedContent = useMemo(() => injectMermaidTheme(content, "light"), [content])

  return (
    <article className="prose prose-slate max-w-none
      prose-headings:font-semibold prose-headings:tracking-tight
      prose-h1:text-2xl prose-h1:mt-8 prose-h1:mb-4 prose-h1:pb-2 prose-h1:border-b prose-h1:border-border
      prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3
      prose-h3:text-lg prose-h3:mt-5 prose-h3:mb-2
      prose-p:leading-7 prose-p:my-3
      prose-li:my-1 prose-li:leading-7
      prose-table:border prose-table:border-collapse
      prose-th:border prose-th:border-border prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-th:text-sm prose-th:font-medium
      prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-sm
      prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal
      prose-pre:bg-slate-950 prose-pre:text-slate-50 prose-pre:rounded-lg prose-pre:text-sm
      prose-img:rounded-lg prose-img:border
      prose-hr:my-6
      prose-strong:font-semibold
      prose-a:text-primary prose-a:underline hover:prose-a:no-underline
      prose-blockquote:border-l-primary prose-blockquote:bg-muted/50 prose-blockquote:py-1 prose-blockquote:px-4
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto rounded-lg border border-border my-4">
              <table className="m-0 border-0" {...props}>
                {children}
              </table>
            </div>
          ),
        }}
      >
        {themedContent}
      </ReactMarkdown>
    </article>
  )
}
