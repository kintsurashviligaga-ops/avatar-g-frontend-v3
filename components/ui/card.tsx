"use client"

import { motion, type HTMLMotionProps } from "framer-motion"
import { cn } from "@/lib/utils"

interface CardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  glow?: boolean
  gradient?: string
  children?: React.ReactNode
}

export function Card({ className, glow, gradient, children, ...props }: CardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className={cn(
        "relative rounded-2xl bg-[#0A0F1C] border border-white/10 overflow-hidden",
        glow && "shadow-[0_0_40px_rgba(6,182,212,0.15)]",
        className
      )}
      {...props}
    >
      {gradient && (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-5`} />
      )}
      <div className="relative z-10">{children}</div>
    </motion.div>
  )
}

export function CardHeader({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={cn("p-6 pb-3", className)}>{children}</div>
}

export function CardTitle({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <h3 className={cn("text-xl font-bold", className)}>{children}</h3>
}

export function CardDescription({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <p className={cn("text-sm text-gray-400 mt-1", className)}>{children}</p>
}

export function CardContent({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={cn("p-6 pt-0", className)}>{children}</div>
}
