'use client'

import { useState } from 'react'

interface HeroChatProps {
  serviceName?: string
  onSubmit?: (message: string) => void
}

export default function HeroChat({ serviceName, onSubmit }: HeroChatProps) {
  const [message, setMessage] = useState('')
  const [isListening, setIsListening] = useState(false)

  const handleSubmit = () => {
    if (message.trim()) {
      onSubmit?.(message)
      setMessage('')
    }
  }

  const toggleVoice = () => {
    setIsListening(!isListening)
  }

  return (
    <div
      style={{
        padding: '32px 20px',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontSize: '32px',
          fontWeight: '700',
          color: '#ffffff',
          marginBottom: '24px',
          letterSpacing: '-0.02em',
        }}
      >
        {serviceName ? `${serviceName}` : 'Ask anything…'}
      </h1>

      <div
        style={{
          position: 'relative',
          maxWidth: '400px',
          margin: '0 auto',
        }}
      >
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Ask anything…"
          style={{
            width: '100%',
            padding: '16px 56px 16px 20px',
            fontSize: '16px',
            color: '#ffffff',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(192, 192, 192, 0.2)',
            borderRadius: '28px',
            outline: 'none',
            backdropFilter: 'blur(20px)',
            transition: 'all 0.2s ease',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'rgba(59, 130, 246, 0.4)'
            e.target.style.background = 'rgba(255, 255, 255, 0.08)'
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'rgba(192, 192, 192, 0.2)'
            e.target.style.background = 'rgba(255, 255, 255, 0.05)'
          }}
        />

        <button
          onClick={toggleVoice}
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: isListening ? 'linear-gradient(135deg, #EF4444, #DC2626)' : 'rgba(59, 130, 246, 0.2)',
            border: `1px solid ${isListening ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isListening ? '#ffffff' : '#3B82F6'}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
