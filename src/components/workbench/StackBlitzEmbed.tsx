"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ExternalLink, Loader2 } from "lucide-react"

interface StackBlitzEmbedProps {
  projectId: string
  className?: string
}

export function StackBlitzEmbed({ projectId, className }: StackBlitzEmbedProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openInStackBlitz = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 动态加载 SDK，未安装时自动隐藏功能
      // @ts-ignore @stackblitz/sdk 为可选依赖
      const sdk = await import("@stackblitz/sdk").catch(() => null)
      if (!sdk) {
        setError("StackBlitz SDK 未安装，请使用下载 zip 或代码浏览器")
        setLoading(false)
        return
      }

      // 扫描 workspace 文件
      const treeRes = await fetch(`/api/projects/${projectId}/dev/tree`)
      const { files } = await treeRes.json() as { files: Array<{ path: string; isDirectory: boolean }> }
      const fileItems: Record<string, string> = {}
      const batch = files.filter((f) => !f.isDirectory).slice(0, 200)

      for (const f of batch) {
        try {
          const fr = await fetch(`/api/projects/${projectId}/dev/file?path=${encodeURIComponent(f.path)}`)
          const fd = await fr.json() as { content?: string }
          if (fd.content != null) fileItems[f.path] = fd.content
        } catch { /* skip unreadable files */ }
      }

      sdk.default.openProject({
        files: fileItems,
        title: `Project ${projectId}`,
        description: "AI generated project",
        template: "node",
      })
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "StackBlitz 不可用")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  return (
    <div className={className}>
      <Button
        variant="outline"
        size="sm"
        onClick={openInStackBlitz}
        disabled={loading}
        className="gap-1"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ExternalLink className="w-3.5 h-3.5" />
        )}
        StackBlitz 预览
      </Button>
      {error && (
        <p className="text-xs text-muted-foreground mt-1">{error}</p>
      )}
    </div>
  )
}
