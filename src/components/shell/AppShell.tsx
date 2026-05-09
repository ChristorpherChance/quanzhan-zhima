"use client"

import { usePathname } from "next/navigation"
import { NavSidebar } from "@/components/shell/NavSidebar"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // 只在项目详情页显示侧栏布局，首页和设置页用独立布局
  const isProjectPage = pathname.startsWith("/projects/") && pathname.split("/").length >= 3
  const isProjectsList = pathname === "/projects"
  const isSettings = pathname === "/settings"

  // 项目列表和设置页：显示侧栏 + 内容（无 ChatDock）
  // 首页：不显示侧栏
  // 项目详情页：由各页面自行管理 ThreePane 布局

  const showSidebar = isProjectPage || isProjectsList || isSettings

  return (
    <div className="flex h-screen overflow-hidden">
      {showSidebar ? (
        <>
          <NavSidebar />
          <main className="flex-1 overflow-hidden min-w-0">{children}</main>
        </>
      ) : (
        <main className="flex-1 overflow-auto">{children}</main>
      )}
    </div>
  )
}
