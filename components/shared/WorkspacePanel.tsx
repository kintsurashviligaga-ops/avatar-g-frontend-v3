"use client"

import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { ReactNode } from "react"

interface WorkspacePanelProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function WorkspacePanel({ isOpen, onClose, title, children }: WorkspacePanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />
          
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-[linear-gradient(180deg,rgba(3,7,18,0.97),rgba(5,10,25,0.95))] border-l border-white/[0.08] z-50 overflow-hidden flex flex-col shadow-[-16px_0_64px_rgba(0,0,0,0.7)]"
          >
            {/* Neon edge */}
            <div className="absolute top-0 left-0 w-px h-full bg-gradient-to-b from-cyan-400/20 via-transparent to-transparent pointer-events-none" />
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
              <h2 className="text-base font-bold text-white tracking-tight">{title}</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.08] flex items-center justify-center transition-all"
              >
                <X size={15} className="text-white/60" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
