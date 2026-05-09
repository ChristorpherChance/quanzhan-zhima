"use client"

import { useEffect, useCallback, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  FolderKanban, Box, GitBranch, Container, Download, PanelLeftClose, PanelLeft, Brain,
} from "lucide-react"

interface NavSidebarProps {
  className?: string
}

const NAV_ITEMS = [
  { href: "/projects", label: "项目", icon: FolderKanban },
  { href: "/settings", label: "设置", icon: Brain },
]

export function NavSidebar({ className }: NavSidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Cmd+\ 折叠
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
      e.preventDefault()
      setCollapsed((p) => !p)
    }
  }, [])

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-background transition-all duration-200 shrink-0",
        collapsed ? "w-12" : "w-[200px]",
        className,
      )}
    >
      {/* Logo 区域 */}
      <div className={cn("flex items-center h-14 px-3 border-b", collapsed ? "justify-center" : "gap-2")}>
        <Link href="/" className="flex items-center gap-2 font-bold text-lg shrink-0">
          <span className="text-xl">🧠</span>
          {!collapsed && <span className="text-sm">全栈智码</span>}
        </Link>
      </div>

      {/* 导航项 */}
      <nav className="flex-1 py-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 mx-2 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "justify-center mx-1 px-1",
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* 底部折叠按钮 */}
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="icon"
          className="w-full h-8"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "展开侧栏 (⌘+\\)" : "折叠侧栏 (⌘+\\)"}
        >
          {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </Button>
      </div>
    </aside>
  )
}
