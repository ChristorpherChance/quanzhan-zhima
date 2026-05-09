import type { Metadata } from "next"
import { Toaster } from "@/components/ui/toast"
import { AppShell } from "@/components/shell/AppShell"
import "./globals.css"

export const metadata: Metadata = {
  title: "全栈智码",
  description: "AI 驱动的全栈开发平台",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background font-sans antialiased">
        <AppShell>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  )
}
