'use client'

import React from 'react'
import { motion } from 'framer-motion'

interface WaveformMicProps {
  isRecording: boolean
  onClick: () => void
}

const WaveformMic: React.FC<WaveformMicProps> = ({ isRecording, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-all relative ${
        isRecording
          ? 'bg-red-500/20 border-2 border-red-500/50'
          : 'glass-card hover:bg-white/10'
      }`}
    >
      {isRecording && (
        <motion.div
          className="absolute inset-0 rounded-lg bg-red-500/20"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
      
      <svg
        className={`w-5 h-5 relative z-10 ${isRecording ? 'text-red-400' : 'text-silver/70'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
        />
      </svg>

      {isRecording && (
        <motion.div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-0.5 bg-red-400 rounded-full"
              animate={{ height: ['4px', '12px', '4px'] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.1,
              }}
            />
          ))}
        </motion.div>
      )}
    </button>
  )
}

export default WaveformMic
