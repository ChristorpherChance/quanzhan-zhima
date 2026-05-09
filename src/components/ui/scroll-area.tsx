import * as React from "react"
import { cn } from "@/lib/utils"

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "vertical" | "horizontal" | "both"
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, orientation = "vertical", children, ...props }, ref) => {
    const overflowClass = {
      vertical: "overflow-y-auto",
      horizontal: "overflow-x-auto",
      both: "overflow-auto",
    }

    return (
      <div
        ref={ref}
        className={cn(
          "relative",
          overflowClass[orientation],
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
ScrollArea.displayName = "ScrollArea"

export { ScrollArea }
