import { ReactNode } from "react"

interface BadgeProps {
  children: ReactNode
  variant?: "default" | "success" | "warning" | "error" | "primary" | "secondary" | "outline"
  className?: string
}

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  const variants = {
    default: "bg-white/10 text-gray-300 border-white/10",
    success: "bg-green-500/20 text-green-400 border-green-500/30",
    warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
    primary: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    secondary: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    outline: "bg-transparent text-gray-300 border-white/20",
  }

  return (
    <span className={`
      inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border
      ${variants[variant]}
      ${className}
    `}>
      {children}
    </span>
  )
}
