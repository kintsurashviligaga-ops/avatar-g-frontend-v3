'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function VoiceLabPage() {
  const router = useRouter()
  const [config, setConfig] = useState({ voice: 'neural' })

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0A0E14 0%, #1a2945 50%, #0f1419 100%)',
        paddingBottom: '80px',
      }}
    >
      <header
        style={{
          padding: '16px 20px',
          background: 'rgba(10, 14, 20, 0.95)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(192, 192, 192, 0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(192, 192, 192, 0.15)',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(192, 192, 192, 0.8)">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', margin: 0 }}>Voice Lab</h1>
          <p style={{ fontSize: '11px', color: 'rgba(192, 192, 192, 0.6)', margin: 0 }}>AI Voice Synthesis</p>
        </div>

        <div
          style={{
            padding: '4px 10px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '12px',
            fontSize: '10px',
            fontWeight: '600',
            color: '#10B981',
          }}
        >
          Active
        </div>
      </header>

      <div style={{ padding: '20px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff', marginBottom: '24px', textAlign: 'center' }}>Voice Lab</h2>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '11px', color: 'rgba(192, 192, 192, 0.6)', display: 'block', marginBottom: '8px' }}>Voice Type</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['neural', 'standard', 'premium'].map((type) => (
              <button
                key={type}
                onClick={() => setConfig({ voice: type })}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: config.voice === type ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                  border: config.voice === type ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(192, 192, 192, 0.15)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <button
          style={{
            width: '100%',
            padding: '16px',
            background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
            border: 'none',
            borderRadius: '12px',
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Generate Voice
        </button>
      </div>
    </div>
  )
}
