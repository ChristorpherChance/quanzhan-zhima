"use client"

import { useState, useMemo, useRef, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Maximize2, Columns, ExternalLink, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react"

interface UiPrototypeFrameProps {
  htmlContent: string
}

interface ProtoPage {
  name: string
  html: string
}

function parseMultiPage(content: string): ProtoPage[] {
  const pages: ProtoPage[] = []
  const regex = /<!--\s*page:\s*(.+?)\s*-->([\s\S]*?)(?=<!--\s*page:|$)/g
  let match
  while ((match = regex.exec(content)) !== null) {
    pages.push({ name: match[1].trim(), html: match[2].trim() })
  }
  if (pages.length === 0 && content.trim()) {
    pages.push({ name: "预览", html: content })
  }
  return pages
}

function ensureDocStructure(html: string): string {
  if (/<!DOCTYPE html>/i.test(html) || /<html/i.test(html)) {
    return html
  }
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"><\/script></head>
<body>${html}</body>
</html>`
}

export function UiPrototypeFrame({ htmlContent }: UiPrototypeFrameProps) {
  const pages = useMemo(() => parseMultiPage(htmlContent), [htmlContent])
  const [activePage, setActivePage] = useState(pages[0]?.name ?? "预览")
  const [fullPreview, setFullPreview] = useState(false)
  const [popupWindow, setPopupWindow] = useState<Window | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const openInNewWindow = useCallback(() => {
    if (popupWindow && !popupWindow.closed) {
      popupWindow.focus()
      return
    }
    const fullHtml = ensureDocStructure(htmlContent)
    const win = window.open("", "_blank", "width=1280,height=800,menubar=no,toolbar=no,location=no,status=no")
    if (win) {
      win.document.write(fullHtml)
      win.document.close()
      setPopupWindow(win)
    }
  }, [htmlContent, popupWindow])

  const refreshIframe = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = ensureDocStructure(htmlContent)
    }
  }, [htmlContent])

  const iframeSandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation"

  return (
    <div className="w-full flex flex-col">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {pages.length > 1 && !fullPreview && (
          <Tabs defaultValue={pages[0]?.name ?? "预览"} value={activePage} onValueChange={setActivePage} className="flex-1">
            <TabsList className="w-full justify-start">
              {pages.map((p) => (
                <TabsTrigger key={p.name} value={p.name}>{p.name}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          {pages.length > 1 && fullPreview && (
            <Button variant="outline" size="sm" onClick={() => setFullPreview(false)} className="gap-1 text-xs">
              <Columns className="h-3.5 w-3.5" />
              分页预览
            </Button>
          )}
          {pages.length > 1 && !fullPreview && (
            <Button variant="outline" size="sm" onClick={() => setFullPreview(true)} className="gap-1 text-xs">
              <Maximize2 className="h-3.5 w-3.5" />
              完整预览
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={refreshIframe} className="gap-1 text-xs" title="刷新预览">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="default" size="sm" onClick={openInNewWindow} className="gap-1 text-xs">
            <ExternalLink className="h-3.5 w-3.5" />
            新窗口打开
          </Button>
        </div>
      </div>

      {/* 完整预览模式 — iframe 中渲染整个 HTML，内部导航可工作 */}
      {fullPreview || pages.length === 1 ? (
        <div className="w-full rounded-lg border overflow-hidden bg-white shadow-sm">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b text-xs text-muted-foreground">
            <span className="font-medium">内置浏览器预览</span>
            <span className="text-muted-foreground/50">|</span>
            <span>页面内链接可直接点击跳转</span>
          </div>
          <iframe
            ref={iframeRef}
            srcDoc={ensureDocStructure(htmlContent)}
            sandbox={iframeSandbox}
            className="w-full min-h-[650px] border-0"
            style={{ height: "calc(100vh - 16rem)" }}
            title="UI 原型完整预览"
          />
        </div>
      ) : (
        /* 分页预览模式 — 每个页面独立 iframe + Tabs 快速切换 */
        <div className="w-full rounded-lg border overflow-hidden bg-white shadow-sm">
          <div className="flex items-center px-3 py-1.5 bg-muted/30 border-b text-xs text-muted-foreground">
            <span className="font-medium">分页预览</span>
          </div>
          <iframe
            key={activePage}
            srcDoc={ensureDocStructure(pages.find((p) => p.name === activePage)?.html ?? pages[0].html)}
            sandbox={iframeSandbox}
            className="w-full min-h-[500px] border-0"
            style={{ height: "calc(100vh - 18rem)" }}
            title={`页面: ${activePage}`}
          />
        </div>
      )}
    </div>
  )
}
