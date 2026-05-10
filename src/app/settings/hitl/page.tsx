"use client"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function HitlSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-xl font-semibold mb-4">HITL 人机协同</h1>
      <Card>
        <CardHeader><CardTitle>HITL 配置</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            HITL 模式配置已合并到主设置页。点击下方跳转。
          </p>
          <Link href="/settings">
            <Button variant="outline" size="sm">前往主设置页</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
