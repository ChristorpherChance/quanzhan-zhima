"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Code2, Eye, ExternalLink, Maximize2, Copy } from "lucide-react"

interface PageInfo {
  name: string
  html: string
  start: number
  end: number
}

function parsePages(html: string): PageInfo[] {
  const pages: PageInfo[] = []
  const regex = /<!--\s*PAGE:\s*(.+?)\s*-->/g
  let match: RegExpExecArray | null
  const markers: { name: string; index: number }[] = []

  while ((match = regex.exec(html)) !== null) {
    markers.push({ name: match[1].trim(), index: match.index })
  }

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index
    const end = i + 1 < markers.length ? markers[i + 1].index : html.length
    pages.push({
      name: markers[i].name,
      html: html.slice(start, end),
      start,
      end,
    })
  }

  return pages
}

interface Props {
  htmlSource: string
  sandboxUrl?: string | null
  projectId?: string
}

export function UiPrototypeViewer({ htmlSource, sandboxUrl, projectId }: Props) {
  const [mode, setMode] = useState<"preview" | "source" | "pages">("preview")
  const [activePage, setActivePage] = useState(0)

  const pages = useMemo(() => parsePages(htmlSource), [htmlSource])
  const hasPages = pages.length > 0

  const currentSrcDoc = hasPages ? pages[activePage]?.html : htmlSource

  const onCopyHtml = () => navigator.clipboard.writeText(htmlSource)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={mode === "preview" ? "default" : "ghost"}
            onClick={() => setMode("preview")}
          >
            <Eye className="h-3.5 w-3.5" /> 原型预览
          </Button>
          <Button
            size="sm"
            variant={mode === "source" ? "default" : "ghost"}
            onClick={() => setMode("source")}
          >
            <Code2 className="h-3.5 w-3.5" /> HTML 源码
          </Button>
          {hasPages && (
            <Button
              size="sm"
              variant={mode === "pages" ? "default" : "ghost"}
              onClick={() => setMode("pages")}
            >
              页面索引
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onCopyHtml}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          {sandboxUrl && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(`${sandboxUrl}/preview/`, "_blank")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const w = window.open("", "_blank")
              if (w) {
                w.document.write(htmlSource)
                w.document.close()
              }
            }}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {mode === "preview" && (
          <iframe
            srcDoc={currentSrcDoc}
            className="w-full h-full border-0"
            title="UI Prototype"
            sandbox="allow-scripts allow-same-origin"
          />
        )}
        {mode === "source" && (
          <pre className="overflow-auto p-3 text-xs bg-muted/30 h-full">
            <code>{htmlSource}</code>
          </pre>
        )}
        {mode === "pages" && hasPages && (
          <div className="flex h-full">
            {/* Page navigation sidebar */}
            <div className="w-48 border-r overflow-auto p-2 space-y-1">
              {pages.map((page, i) => (
                <Button
                  key={i}
                  variant={activePage === i ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-start text-xs h-7"
                  onClick={() => { setActivePage(i); setMode("preview") }}
                >
                  {page.name}
                </Button>
              ))}
            </div>
            {/* Page preview */}
            <div className="flex-1">
              <iframe
                srcDoc={pages[activePage]?.html}
                className="w-full h-full border-0"
                title={`UI Page: ${pages[activePage]?.name}`}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
