"use client"

import { motion } from "framer-motion"
import { ArrowLeft, Sparkles } from "lucide-react"
import Link from "next/link"
import { ReactNode } from "react"

interface ServiceShellProps {
  title: string
  subtitle: string
  gradient: string
  children: ReactNode
  actions?: ReactNode
}

export function ServiceShell({ title, subtitle, gradient, children, actions }: ServiceShellProps) {
  return (
    <div className="min-h-screen bg-[#05070A] text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#05070A]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Back + Logo */}
            <div className="flex items-center gap-4">
              <Link 
                href="/"
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={20} />
                <span className="hidden sm:inline text-sm">Back</span>
              </Link>
              
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                  <Sparkles size={16} />
                </div>
                <div>
                  <h1 className="text-lg font-bold">{title}</h1>
                  <p className="text-xs text-gray-500 hidden sm:block">{subtitle}</p>
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            {actions && (
              <div className="flex items-center gap-2">
                {actions}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  )
}
