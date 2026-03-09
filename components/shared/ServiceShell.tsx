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
    <div className="min-h-screen bg-transparent text-white">
      {/* Header */}
      <header className="sticky top-0 z-40">
        {/* Top neon edge */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/35 to-transparent" />
        <div className="bg-[linear-gradient(180deg,rgba(3,7,16,0.96),rgba(3,7,16,0.88))] backdrop-blur-2xl border-b border-white/[0.07]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Left: Back + title */}
              <div className="flex items-center gap-4">
                <Link
                  href="/"
                  className="flex items-center gap-2 text-white/40 hover:text-white transition-colors px-3 py-1.5 rounded-xl hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08]"
                >
                  <ArrowLeft size={16} />
                  <span className="hidden sm:inline text-sm font-medium">Back</span>
                </Link>

                <div className="w-px h-5 bg-white/[0.12]" />

                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-[0_0_16px_rgba(34,211,238,0.35)]`}
                  >
                    <Sparkles size={15} className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-base font-bold text-white leading-tight">{title}</h1>
                    <p className="text-[11px] text-white/40 hidden sm:block leading-tight">{subtitle}</p>
                  </div>
                </div>
              </div>

              {/* Right: Actions */}
              {actions && (
                <div className="flex items-center gap-2">{actions}</div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  )
}

