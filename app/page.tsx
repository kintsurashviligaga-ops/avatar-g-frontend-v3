'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WorkspaceProvider, useWorkspace } from '@/components/workspace/WorkspaceProvider'
import TopBar from '@/components/workspace/TopBar'
import Sidebar from '@/components/workspace/Sidebar'
import ServiceGrid from '@/components/workspace/ServiceGrid'
import ChatPanel from '@/components/workspace/ChatPanel'

function SplashScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 800)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-obsidian flex items-center justify-center z-50"
    >
      <div className="text-center px-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-4"
        >
          <div className="w-16 h-16 md:w-20 md:h-20 mx-auto rounded-xl bg-gradient-to-br from-midnight-blue to-deep-navy flex items-center justify-center border border-silver/20">
            <span className="text-2xl md:text-3xl font-bold text-silver">A</span>
          </div>
        </motion.div>
        
        <motion.h1
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-lg md:text-xl font-bold text-silver mb-1"
        >
          Avatar G
        </motion.h1>
        
        <motion.p
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-xs text-silver/50"
        >
          Neural Ecosystem Initializing...
        </motion.p>
      </div>
    </motion.div>
  )
}

function WorkspaceContent() {
  const { activeService } = useWorkspace()

  return (
    <div className="h-screen w-screen flex flex-col bg-obsidian overflow-hidden">
      <TopBar />
      
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        
        <main className="flex-1 overflow-hidden">
          {!activeService ? (
            <ServiceGrid />
          ) : (
            <ChatPanel />
          )}
        </main>
      </div>
    </div>
  )
}

export default function HomePage() {
  const [showSplash, setShowSplash] = useState(true)

  return (
    <>
      <AnimatePresence>
        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      </AnimatePresence>

      {!showSplash && (
        <WorkspaceProvider>
          <WorkspaceContent />
        </WorkspaceProvider>
      )}
    </>
  )
}
