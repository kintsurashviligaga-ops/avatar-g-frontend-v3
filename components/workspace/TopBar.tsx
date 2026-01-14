'use client'

import React from 'react'
import { motion } from 'framer-motion'
import Badge from '@/components/ui/Badge'
import { useWorkspace } from './WorkspaceProvider'

const TopBar: React.FC = () => {
  const { credits, storageUsed, storageTotal } = useWorkspace()

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="glass-panel border-b border-silver/10 h-14 md:h-16 flex items-center px-3 md:px-6 relative z-10"
    >
      <div className="flex items-center gap-2 md:gap-3">
        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-midnight-blue to-deep-navy flex items-center justify-center border border-silver/20">
          <span className="text-base md:text-lg font-bold text-silver">A</span>
        </div>
        <div>
          <h1 className="text-xs md:text-sm font-bold text-silver tracking-tight">Avatar G</h1>
          <p className="text-[10px] md:text-xs text-silver/50">Neural Ecosystem</p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2 md:gap-4">
        <div className="hidden lg:flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
            <span className="text-silver/70">Live</span>
          </div>
          <div className="w-px h-4 bg-silver/10"></div>
          <span className="text-silver/70">Credits: <span className="text-silver font-medium">{credits}</span></span>
          <div className="w-px h-4 bg-silver/10"></div>
          <span className="text-silver/70">Storage: <span className="text-silver font-medium">{storageUsed}/{storageTotal} GB</span></span>
        </div>

        <Badge variant="premium" className="hidden sm:inline-flex text-[10px] md:text-xs">Pro</Badge>

        <div className="flex items-center gap-1.5 md:gap-2">
          <div className="hidden sm:block text-right">
            <p className="text-[10px] md:text-xs font-medium text-silver">Demo User</p>
            <p className="text-[9px] md:text-xs text-silver/50">demo@avatar-g.io</p>
          </div>
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] md:text-xs font-bold border border-silver/20">
            DU
          </div>
        </div>
      </div>
    </motion.header>
  )
}

export default TopBar
