"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

const EXPORT_ITEMS = [
  { type: "prd", label: "PRD 文档", formats: ["md", "docx", "pdf"] },
  { type: "design", label: "设计文档", formats: ["md", "docx", "pdf"] },
  { type: "code", label: "代码", formats: ["zip"] },
  { type: "review", label: "审查报告", formats: ["md", "docx", "pdf", "xlsx"] },
]

export default function ExportsPage() {
  const params = useParams()
  const pid = params.id as string
  const [loading, setLoading] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  const handleExport = async (type: string, format: string) => {
    const key = `${type}-${format}`
    setLoading(key)
    setErrors((prev) => ({ ...prev, [key]: null }))
    try {
      const r = await fetch(`/api/projects/${pid}/exports/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formats: [format] }),
      })
      const { data } = await r.json()
      const file = data?.files?.[0]
      if (file?.downloadUrl) {
        window.open(file.downloadUrl, "_blank")
      } else if (file?.error) {
        setErrors((prev) => ({ ...prev, [key]: file.error }))
        toast({ title: "导出失败", description: file.error, variant: "destructive" })
      }
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e)
      setErrors((prev) => ({ ...prev, [key]: msg }))
      toast({ title: "导出失败", description: msg, variant: "destructive" })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">导出中心</h2>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-4 md:grid-cols-2 max-w-4xl">
          {EXPORT_ITEMS.map((item) => (
            <Card key={item.type}>
              <CardHeader>
                <CardTitle className="text-base">{item.label}</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2 flex-wrap">
                {item.formats.map((fmt) => {
                  const key = `${item.type}-${fmt}`
                  const hasError = errors[key]
                  return (
                    <div key={fmt} className="flex items-center gap-1">
                      <Button
                        variant={hasError ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => handleExport(item.type, fmt)}
                        disabled={loading === key}
                      >
                        {loading === key ? "..." : fmt.toUpperCase()}
                      </Button>
                      {hasError && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => handleExport(item.type, fmt)}
                        >
                          重试
                        </Button>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
