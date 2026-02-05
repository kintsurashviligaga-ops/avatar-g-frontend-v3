import { ReactNode } from "react"
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#05070A] disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-white/10 text-white hover:bg-white/20 border border-white/10",
        primary: "bg-gradient-to-r from-cyan-400 to-blue-500 text-white hover:opacity-90 shadow-lg shadow-cyan-500/25",
        secondary: "bg-white/5 text-white hover:bg-white/10 border border-white/10",
        outline: "border border-white/20 text-white hover:bg-white/5",
        ghost: "hover:bg-white/5 text-gray-400 hover:text-white",
        glow: "bg-gradient-to-r from-cyan-400 to-blue-500 text-white hover:opacity-90 shadow-[0_0_20px_rgba(6,182,212,0.5)]",
        destructive: "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  children: ReactNode
}

export function Button({ children, variant, size, className = "", ...props }: ButtonProps) {
  return (
    <button 
      className={`${buttonVariants({ variant, size })} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
