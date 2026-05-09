"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  side?: "left" | "right" | "top" | "bottom"
  children: React.ReactNode
}

function Sheet({ open, onOpenChange, side = "right", children }: SheetProps) {
  if (!open) return null

  const sideClasses: Record<string, string> = {
    left: "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r",
    right: "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l",
    top: "inset-x-0 top-0 w-full h-auto border-b",
    bottom: "inset-x-0 bottom-0 w-full h-auto border-t",
  }

  const transformClasses: Record<string, string> = {
    left: "data-[state=closed]:-translate-x-full",
    right: "data-[state=closed]:translate-x-full",
    top: "data-[state=closed]:-translate-y-full",
    bottom: "data-[state=closed]:translate-y-full",
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/80 transition-opacity"
        onClick={() => onOpenChange(false)}
      />
      {/* Panel */}
      <div
        className={cn(
          "fixed z-50 bg-background p-6 shadow-lg transition-transform duration-300",
          sideClasses[side],
          transformClasses[side]
        )}
      >
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <span className="sr-only">Close</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        {children}
      </div>
    </div>,
    document.body
  )
}

const SheetHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
      {...props}
    />
  )
)
SheetHeader.displayName = "SheetHeader"

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  )
)
SheetTitle.displayName = "SheetTitle"

const SheetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
)
SheetDescription.displayName = "SheetDescription"

export { Sheet, SheetHeader, SheetTitle, SheetDescription }
