"use client"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

export default function ExportSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-xl font-semibold mb-4">数据导出</h1>
      <Card>
        <CardHeader><CardTitle>数据导出配置</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            此页面将在后续版本中提供数据导出格式和计划任务配置功能。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
