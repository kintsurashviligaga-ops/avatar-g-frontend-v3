import * as React from "react"

import { cn } from "@/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-xl border border-white/[0.09] bg-[linear-gradient(135deg,rgba(7,14,30,0.85),rgba(4,9,22,0.75))] px-3.5 py-2.5 text-sm text-white/85 placeholder:text-white/25 backdrop-blur-xl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/40 focus-visible:border-cyan-400/35 hover:border-white/[0.16] transition-all disabled:cursor-not-allowed disabled:opacity-50 resize-none",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
