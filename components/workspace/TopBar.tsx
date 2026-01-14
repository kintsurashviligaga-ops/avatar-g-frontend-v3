'use client'

import React from 'react'
import { motion } from 'framer-motion'
import Badge from '@/components/ui/Badge'
import { useWorkspace } from './WorkspaceProvider'

const TopBar: React.FC = () => {
  const { credits } = useWorkspace()

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="glass-panel border-b border-silver/10 h-14 flex items-center px-4 relative z-10"
    >
      {/* Logo - Always Visible */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-midnight-blue to-deep-navy flex items-center justify-center border border-silver/20">
          <span className="text-base font-bold text-silver">A</span>
        </div>
        <div className="hidden sm:block">
          <h1 className="text-xs font-bold text-silver">Avatar G</h1>
          <p className="text-[9px] text-silver/50">Neural Ecosystem</p>
        </div>
      </div>

      {/* Right Side */}
      <div className="ml-auto flex items-center gap-2">
        {/* Credits - Mobile Compact */}
        <div className="text-[10px] text-silver/70 md:hidden">
          {credits}
        </div>
        
        {/* Credits - Desktop */}
        <div className="hidden md:flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
            <span className="text-silver/70">Live</span>
          </div>
          <span className="text-silver/70">
            Credits: <span className="text-silver font-medium">{credits}</span>
          </span>
        </div>

        <Badge variant="premium" className="hidden sm:inline-flex text-[9px] px-2 py-0.5">
          Pro
        </Badge>

        {/* User Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold border border-silver/20">
          DU
        </div>
      </div>
    </motion.header>
  )
}

export default TopBar
