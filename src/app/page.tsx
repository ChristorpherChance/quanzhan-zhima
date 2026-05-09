import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 text-center px-4">
      <h1 className="text-5xl font-bold tracking-tight">
        <span className="text-primary">全栈智码</span>
      </h1>
      <p className="text-xl text-muted-foreground max-w-lg">
        AI 驱动的全栈开发平台 — 从需求到代码，全程自动编排
      </p>
      <div className="flex gap-4 mt-4">
        <Link href="/projects">
          <Button size="lg" className="text-base">
            进入项目
          </Button>
        </Link>
        <Link href="/settings">
          <Button size="lg" variant="outline" className="text-base">
            设置模型
          </Button>
        </Link>
      </div>
    </div>
  )
}
