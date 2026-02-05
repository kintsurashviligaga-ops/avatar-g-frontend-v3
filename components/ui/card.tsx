import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-lg border bg-[#0A0F1C] border-cyan-500/20 shadow-sm", className)}
      {...props}
    />
  )
)
Card.displayName = "Card"
export { Card }
