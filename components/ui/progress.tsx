"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06] border border-white/[0.06]",
          className
        )}
        {...props}
      >
        <div
          className="h-full w-full flex-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-sky-500 transition-all duration-500 ease-out"
          style={{
            transform: `translateX(-${100 - (value || 0)}%)`,
            boxShadow: '0 0 8px rgba(34,211,238,0.6), 0 0 20px rgba(34,211,238,0.25)',
          }}
        />
      </div>
    )
  }
)

Progress.displayName = "Progress"

export { Progress }
