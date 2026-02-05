import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variants = {
      default: "bg-cyan-500 text-white hover:bg-cyan-400",
      outline: "border border-cyan-500/30 bg-transparent hover:bg-cyan-500/10",
      ghost: "hover:bg-cyan-500/10",
    }
    const sizes = { default: "h-10 px-4 py-2", sm: "h-9 px-3", lg: "h-11 px-8" }
    return <button className={cn("inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50", variants[variant], sizes[size], className)} ref={ref} {...props} />
  }
)
Button.displayName = "Button"
export { Button }
