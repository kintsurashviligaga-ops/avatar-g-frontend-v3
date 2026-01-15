'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MusicStudioPage() {
  const router = useRouter()
  const [musicType, setMusicType] = useState('Ambient')

  const musicTypes = ['Ambient', 'Cinematic', 'Elecori', 'Uplifting']

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, rgb(26, 26, 46) 0%, rgb(22, 33, 62) 100%)',
        paddingBottom: '100px',
      }}
    >
      <header
        style={{
          padding: '16px 20px',
          backgroundColor: 'rgba(26, 26, 46, 0.95)',
          backdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(139, 92, 246, 0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '8px',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            border: '1px solid rgba(139, 92, 246, 0.2)',
            borderRadius: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(167, 139, 250)">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgb(139, 92, 246), rgb(167, 139, 250))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: 700,
            color: 'rgb(255, 255, 255)',
            boxShadow: '0 4px 16px rgba(139, 92, 246, 0.3)',
          }}
        >
          G
        </div>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'rgb(255, 255, 255)', margin: 0 }}>Music Studio</h1>
      </header>

      <div style={{ padding: '24px 20px' }}>
        <div
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(167, 139, 250, 0.15))',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            border: '1px solid rgba(139, 92, 246, 0.2)',
            boxShadow: '0 8px 32px rgba(139, 92, 246, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <input
            type="text"
            placeholder="Ask anything..."
            style={{
              flex: 1,
              padding: '8px 0',
              fontSize: '17px',
              color: 'rgb(255, 255, 255)',
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
            }}
          />
          <div style={{ fontSize: '24px' }}>😊</div>
        </div>
      </div>

      <div style={{ padding: '0 20px 24px' }}>
        <div
          style={{
            padding: '24px 20px',
            backgroundColor: 'rgba(139, 92, 246, 0.05)',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            border: '1px solid rgba(139, 92, 246, 0.15)',
          }}
        >
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.5)',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            Music Configuration Panel
          </h3>

          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.4)',
                display: 'block',
                marginBottom: '10px',
                textTransform: 'uppercase',
              }}
            >
              Music Type
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {musicTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setMusicType(type)}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: musicType === type ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.08)',
                    border:
                      musicType === type
                        ? '1px solid rgba(139, 92, 246, 0.5)'
                        : '1px solid rgba(139, 92, 246, 0.15)',
                    borderRadius: '16px',
                    color: 'rgb(255, 255, 255)',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
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
              padding: '18px',
              background: 'linear-gradient(135deg, rgb(139, 92, 246), rgb(167, 139, 250))',
              border: 'none',
              borderRadius: '20px',
              color: 'rgb(255, 255, 255)',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(139, 92, 246, 0.3)',
            }}
          >
            Generate Music
          </button>
        </div>
      </div>
    </div>
  )
}
