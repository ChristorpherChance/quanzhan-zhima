"use client"

import { useState, type ReactNode, Suspense } from "react"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight } from "lucide-react"

export function ThreePane({
  left,
  center,
  right,
  bottomBar,
}: {
  left: ReactNode
  center: ReactNode
  right?: ReactNode
  bottomBar?: ReactNode
}) {
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧栏 */}
        <aside
          className={cn(
            "overflow-hidden bg-background transition-all duration-200",
            leftOpen ? "w-56 border-r" : "w-0",
          )}
        >
          <Suspense fallback={<div className="w-56 p-3" />}>
            <div className="w-56">{left}</div>
          </Suspense>
        </aside>

        {/* 左侧折叠条 */}
        <button
          type="button"
          onClick={() => setLeftOpen(!leftOpen)}
          className={cn(
            "shrink-0 w-4 hover:bg-muted/50 flex items-center justify-center transition-colors cursor-pointer",
            leftOpen && "border-r",
          )}
          title={leftOpen ? "收起左侧栏" : "展开左侧栏"}
        >
          {leftOpen ? (
            <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          )}
        </button>

        {/* 中间内容区 */}
        <main className="flex-1 overflow-auto min-w-0">{center}</main>

        {/* 右侧折叠条 */}
        {right && (
          <button
            type="button"
            onClick={() => setRightOpen(!rightOpen)}
            className={cn(
              "shrink-0 w-4 hover:bg-muted/50 flex items-center justify-center transition-colors cursor-pointer",
              rightOpen && "border-l",
            )}
            title={rightOpen ? "收起右侧栏" : "展开右侧栏"}
          >
            {rightOpen ? (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronLeft className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        )}

        {/* 右侧栏 */}
        {right && (
          <aside
            className={cn(
              "overflow-hidden flex flex-col bg-background transition-all duration-200",
              rightOpen ? "w-96 border-l" : "w-0",
            )}
          >
            <Suspense fallback={<div className="w-96 p-3" />}>
              <div className="w-96 flex flex-col h-full">{right}</div>
            </Suspense>
          </aside>
        )}
      </div>
      {bottomBar && (
        <div className="border-t p-2 flex justify-end gap-2 bg-background">{bottomBar}</div>
      )}
    </div>
  )
}
