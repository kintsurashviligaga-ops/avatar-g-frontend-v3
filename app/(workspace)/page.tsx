'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function WorkspacePage() {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [isListening, setIsListening] = useState(false)

  const quickActions = [
    { id: 'image', label: 'Image', path: '/image-architect' },
    { id: 'video', label: 'Video', path: '/video-cine-lab' },
    { id: 'text', label: 'Text', path: '/ai-production' },
    { id: 'voice', label: 'Voice', path: '/voice-lab' },
  ]

  const services = [
    { id: 'voice', label: 'Voice Lab', subtitle: 'AI voice synthesis', path: '/voice-lab' },
    { id: 'avatar', label: 'Avatar Builder', subtitle: 'Digital personas', path: '/avatar-builder' },
    { id: 'image', label: 'Image Architect', subtitle: 'Visual creation', path: '/image-architect' },
    { id: 'music', label: 'Music Studio', subtitle: 'Audio composition', path: '/music-studio' },
    { id: 'video', label: 'Video Cine-Lab', subtitle: 'AI filmmaking', path: '/video-cine-lab' },
    { id: 'game', label: 'Game Forge', subtitle: 'World builder', path: '/game-forge' },
    { id: 'production', label: 'AI Production', subtitle: 'Assembly pipeline', path: '/ai-production' },
    { id: 'business', label: 'Business Agent', subtitle: 'Strategy intelligence', path: '/business-agent' },
  ]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0A0E14 0%, #1a2945 50%, #0f1419 100%)',
      }}
    >
      {/* TOP BAR */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '16px 20px',
          background: 'rgba(10, 14, 20, 0.95)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(192, 192, 192, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: '700',
            color: '#ffffff',
          }}
        >
          G
        </div>

        <h1 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', margin: 0 }}>Avatar G</h1>

        <div style={{ position: 'relative' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              border: '2px solid rgba(192, 192, 192, 0.2)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#10B981',
              border: '2px solid #0A0E14',
            }}
          />
        </div>
      </header>

      {/* HERO CHAT */}
      <div style={{ padding: '48px 20px 32px', textAlign: 'center' }}>
        <h2
          style={{
            fontSize: '36px',
            fontWeight: '700',
            color: '#ffffff',
            marginBottom: '28px',
            letterSpacing: '-0.02em',
            lineHeight: '1.1',
          }}
        >
          Ask anything…
        </h2>

        <div style={{ position: 'relative', maxWidth: '420px', margin: '0 auto' }}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask anything…"
            style={{
              width: '100%',
              padding: '18px 60px 18px 24px',
              fontSize: '16px',
              color: '#ffffff',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(192, 192, 192, 0.15)',
              borderRadius: '30px',
              outline: 'none',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
            }}
          />

          <button
            onClick={() => setIsListening(!isListening)}
            style={{
              position: 'absolute',
              right: '6px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: isListening ? 'linear-gradient(135deg, #EF4444, #DC2626)' : 'rgba(59, 130, 246, 0.15)',
              border: `1px solid ${isListening ? 'rgba(239, 68, 68, 0.5)' : 'rgba(59, 130, 246, 0.3)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isListening ? '#ffffff' : '#3B82F6'} strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
        </div>
      </div>

      {/* QUICK ACTIONS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          padding: '0 20px',
          marginBottom: '40px',
        }}
      >
        {quickActions.map((action) => (
          <button
            key={action.id}
            onClick={() => router.push(action.path)}
            style={{
              padding: '20px 12px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(192, 192, 192, 0.12)',
              borderRadius: '18px',
              backdropFilter: 'blur(20px)',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" style={{ margin: '0 auto 10px' }}>
              {action.id === 'image' && <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />}
              {action.id === 'video' && <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />}
              {action.id === 'text' && <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />}
              {action.id === 'voice' && <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />}
            </svg>
            <div style={{ fontSize: '13px', fontWeight: '500', color: '#ffffff' }}>{action.label}</div>
          </button>
        ))}
      </div>

      {/* ALL SERVICES */}
      <div style={{ padding: '0 20px 120px' }}>
        <h3
          style={{
            fontSize: '22px',
            fontWeight: '600',
            color: '#ffffff',
            marginBottom: '20px',
            letterSpacing: '-0.01em',
          }}
        >
          All Services
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
          {services.map((service) => (
            <button
              key={service.id}
              onClick={() => router.push(service.path)}
              style={{
                padding: '24px 18px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(192, 192, 192, 0.12)',
                borderRadius: '18px',
                backdropFilter: 'blur(20px)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '6px' }}>{service.label}</div>
              <div style={{ fontSize: '12px', color: 'rgba(192, 192, 192, 0.6)' }}>{service.subtitle}</div>
            </button>
          ))}
        </div>
      </div>

      {/* BOTTOM NAV */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '82px',
          background: 'rgba(10, 14, 20, 0.98)',
          backdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(192, 192, 192, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
          zIndex: 100,
        }}
      >
        {[
          { id: 'home', label: 'Home', active: true },
          { id: 'explore', label: 'Explore' },
          { id: 'create', label: 'Create', center: true },
          { id: 'chats', label: 'Chats' },
          { id: 'profile', label: 'Profile' },
        ].map((item) => (
          <button
            key={item.id}
            style={{
              flex: item.center ? 0 : 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: item.center ? 'linear-gradient(135deg, #3B82F6, #6366F1)' : 'transparent',
              width: item.center ? '58px' : 'auto',
              height: item.center ? '58px' : 'auto',
              borderRadius: item.center ? '50%' : '0',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              top: item.center ? '-14px' : '0',
              boxShadow: item.center ? '0 8px 28px rgba(59, 130, 246, 0.35)' : 'none',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={item.center ? '#ffffff' : item.active ? '#3B82F6' : '#6B7280'} strokeWidth="2.5">
              {item.id === 'home' && <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />}
              {item.id === 'explore' && <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />}
              {item.id === 'create' && <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />}
              {item.id === 'chats' && <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />}
              {item.id === 'profile' && <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />}
            </svg>
            {!item.center && <span style={{ fontSize: '11px', color: item.active ? '#3B82F6' : '#6B7280', fontWeight: item.active ? '600' : '500' }}>{item.label}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
                }
