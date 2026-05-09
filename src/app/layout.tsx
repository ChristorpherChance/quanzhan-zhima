import type { Metadata } from "next"
import Link from "next/link"
import { Toaster } from "@/components/ui/toast"
import "./globals.css"

export const metadata: Metadata = {
  title: "全栈智码",
  description: "AI 驱动的全栈开发平台",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background font-sans antialiased">
        <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
          <div className="flex h-14 items-center px-4 gap-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
              <span className="text-2xl">🧠</span>
              <span>全栈智码</span>
            </Link>
            <div className="flex-1" />
            <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
              项目
            </Link>
            <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
              设置
            </Link>
          </div>
        </nav>
        <main>{children}</main>
        <Toaster />
      </body>
    </html>
  )
}
