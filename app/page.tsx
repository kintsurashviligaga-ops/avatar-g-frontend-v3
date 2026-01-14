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
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <div className="w-20 h-20 md:w-24 md:h-24 mx-auto rounded-2xl bg-gradient-to-br from-midnight-blue to-deep-navy flex items-center justify-center border border-silver/20 shadow-2xl">
            <span className="text-3xl md:text-4xl font-bold text-silver">A</span>
          </div>
        </motion.div>
        
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-xl md:text-2xl font-bold text-silver mb-2"
        >
          Avatar G
        </motion.h1>
        
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-silver/50 text-xs md:text-sm"
        >
          Neural Ecosystem Initializing...
        </motion.p>

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="mt-6 flex gap-2 justify-center"
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-silver/50"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  )
}

function WorkspaceContent() {
  const { activeService } = useWorkspace()

  return (
    <div className="h-screen flex flex-col bg-obsidian overflow-hidden">
      <TopBar />
      
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        
        <main className="flex-1 flex overflow-hidden relative">
          <AnimatePresence mode="wait">
            {!activeService ? (
              <motion.div
                key="service-grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex overflow-hidden"
              >
                <ServiceGrid />
              </motion.div>
            ) : (
              <motion.div
                key="chat-panel"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex overflow-hidden"
              >
                <ChatPanel />
              </motion.div>
            )}
          </AnimatePresence>
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
