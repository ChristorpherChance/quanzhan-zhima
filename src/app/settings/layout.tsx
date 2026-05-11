"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Cpu, Bot, Gauge, Container, Download } from "lucide-react"

const NAV_ITEMS = [
  { href: "/settings/llm", label: "LLM 提供商", icon: Cpu, ready: true },
  { href: "/settings/agents", label: "Agent 配置", icon: Bot, ready: true },
  { href: "/settings/hitl", label: "HITL 模式", icon: Gauge, ready: false },
  { href: "/settings/sandbox", label: "沙箱 & 工具", icon: Container, ready: false },
  { href: "/settings/export", label: "数据导出", icon: Download, ready: false },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-full">
      {/* 左侧菜单 */}
      <aside className="w-48 border-r bg-muted/20 shrink-0 py-4 space-y-1">
        <div className="px-4 pb-3 mb-2 border-b">
          <h2 className="text-sm font-semibold">设置</h2>
        </div>
        {NAV_ITEMS.filter((item) => item.ready).map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 mx-2 px-3 py-1.5 rounded-md text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </aside>

      {/* 右侧内容 */}
      <main className="flex-1 min-h-0 overflow-auto">{children}</main>
    </div>
  )
}
