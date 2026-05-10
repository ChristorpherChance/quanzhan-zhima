"use client"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

export default function SandboxSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-xl font-semibold mb-4">沙箱 & 工具</h1>
      <Card>
        <CardHeader><CardTitle>沙箱配置</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            此页面将在后续版本中提供沙箱运行时配置和工具管理功能。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
