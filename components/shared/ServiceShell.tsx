"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowLeft, Home } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ServiceShellProps {
  title: string
  subtitle: string
  gradient: string
  children: React.ReactNode
  actions?: React.ReactNode
}

export function ServiceShell({ title, subtitle, gradient, children, actions }: ServiceShellProps) {
  return (
    <div className="min-h-screen bg-[#05070A] text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#05070A]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft size={18} className="mr-2" /> Back
              </Button>
            </Link>
            <div className="h-6 w-px bg-white/10" />
            <Link href="/">
              <Button variant="ghost" size="sm">
                <Home size={18} />
              </Button>
            </Link>
          </div>
          
          <div className="flex items-center gap-3">
            <h1 className={`text-xl font-bold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {actions}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-gray-400 mb-8 text-lg">{subtitle}</p>
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  )
}
