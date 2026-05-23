'use client'

import React, { useEffect, useState } from 'react'
import { BrandLogo } from './BrandLogo'

interface LoadingScreenProps {
  onDone?: () => void
}

export function LoadingScreen({ onDone }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(true)
  const [typedText, setTypedText] = useState('')
  const fullText = 'AVATAR G'

  useEffect(() => {
    // Typing animation
    let i = 0
    const typeInterval = setInterval(() => {
      if (i < fullText.length) {
        setTypedText(fullText.slice(0, i + 1))
        i++
      } else {
        clearInterval(typeInterval)
      }
    }, 100)

    // Progress bar
    const progressInterval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(progressInterval)
          return 100
        }
        return p + 2
      })
    }, 25)

    // Fade out after 1.5s
    const fadeTimer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDone?.(), 400)
    }, 1500)

    return () => {
      clearInterval(typeInterval)
      clearInterval(progressInterval)
      clearTimeout(fadeTimer)
    }
  }, [onDone])

  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-center transition-opacity duration-400"
      style={{
        backgroundColor: '#03030a',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'all' : 'none',
      }}
    >
      {/* Logo */}
      <div className="mb-6">
        <BrandLogo size="md" showText={false} glow />
      </div>

      {/* Typing text */}
      <div className="mb-10 h-8 flex items-center">
        <span
          className="text-2xl font-extrabold tracking-[0.25em]"
          style={{
            background: 'linear-gradient(90deg, #00d4ff, #0284c7)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {typedText}
          <span className="animate-pulse">|</span>
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 w-48 h-0.5 rounded-full overflow-hidden"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-100 ease-out"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(to right, #00d4ff, #0284c7)',
            boxShadow: '0 0 8px rgba(0,212,255,0.6)',
          }}
        />
      </div>
    </div>
  )
}
