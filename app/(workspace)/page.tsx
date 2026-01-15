'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function WorkspacePage() {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])

  const quickActions = [
    { id: 'image', label: 'Image', path: '/image-architect' },
    { id: 'video', label: 'Video', path: '/video-cine-lab' },
    { id: 'text', label: 'Text', path: '/ai-production' },
    { id: 'voice', label: 'Voice', path: '/voice-lab' },
  ]

  const services = [
    { id: 'voice-lab', label: 'Voice Lab', subtitle: 'AI voice synthesis', path: '/voice-lab' },
    { id: 'avatar-builder', label: 'Avatar Builder', subtitle: 'Digital personas', path: '/avatar-builder' },
    { id: 'image-architect', label: 'Image Architect', subtitle: 'Visual creation', path: '/image-architect' },
    { id: 'music-studio', label: 'Music Studio', subtitle: 'Audio composition', path: '/music-studio' },
    { id: 'video-cine-lab', label: 'Video Cine-Lab', subtitle: 'AI filmmaking', path: '/video-cine-lab' },
    { id: 'game-forge', label: 'Game Forge', subtitle: 'World builder', path: '/game-forge' },
    { id: 'ai-production', label: 'AI Production', subtitle: 'Assembly pipeline', path: '/ai-production' },
    { id: 'business-agent', label: 'Business Agent', subtitle: 'Strategy intelligence', path: '/business-agent' },
  ]

  const navItems = [
    { id: 'home', label: 'Home', icon: 'home', path: '/', active: true },
    { id: 'explore', label: 'Explore', icon: 'compass', path: '/explore' },
    { id: 'create', label: 'Create', icon: 'plus', path: '/create', center: true },
    { id: 'chats', label: 'Chats', icon: 'message', path: '/chats' },
    { id: 'profile', label: 'Profile', icon: 'user', path: '/profile' },
  ]

  const handleSubmit = () => {
    if (message.trim()) {
      setMessages([...messages, { role: 'user', content: message }])
      setMessage('')
      setTimeout(() => {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'How can I help you with that?' }])
      }, 1000)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0A0E14 0%, #1a2945 50%, #0f1419 100%)',
        paddingTop: 'env(safe-area-inset-top)',
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
              bottom: '0',
              right: '0',
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
      <div style={{ padding: '32px 20px', textAlign: 'center' }}>
        <h1
          style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#ffffff',
            marginBottom: '24px',
            letterSpacing: '-0.02em',
          }}
        >
          Ask anything…
        </h1>

        <div style={{ position: 'relative', maxWidth: '400px', margin: '0 auto' }}>
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
            }}
          />

          <button
            onClick={() => setIsListening(!isListening)}
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

      {/* QUICK ACTIONS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          padding: '0 20px',
          marginBottom: '32px',
        }}
      >
        {quickActions.map((action) => (
          <button
            key={action.id}
            onClick={() => router.push(action.path)}
            style={{
              padding: '16px 8px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(192, 192, 192, 0.15)',
              borderRadius: '16px',
              backdropFilter: 'blur(16px)',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" style={{ margin: '0 auto 8px' }}>
              {action.id === 'image' && (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              )}
              {action.id === 'video' && (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              )}
              {action.id === 'text' && (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              )}
              {action.id === 'voice' && (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              )}
            </svg>
            <div style={{ fontSize: '12px', fontWeight: '500', color: '#ffffff' }}>{action.label}</div>
          </button>
        ))}
      </div>

      {/* MESSAGES */}
      {messages.length > 0 && (
        <div style={{ padding: '0 20px 24px' }}>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: '12px',
                padding: '12px 16px',
                background: msg.role === 'user' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${msg.role === 'user' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(192, 192, 192, 0.1)'}`,
                borderRadius: '12px',
                fontSize: '14px',
                color: '#ffffff',
              }}
            >
              {msg.content}
            </div>
          ))}
        </div>
      )}

      {/* SERVICE GRID */}
      <div style={{ padding: '0 20px 100px' }}>
        <h2
          style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#ffffff',
            marginBottom: '16px',
            letterSpacing: '-0.01em',
          }}
        >
          All Services
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {services.map((service) => (
            <button
              key={service.id}
              onClick={() => router.push(service.path)}
              style={{
                padding: '20px 16px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(192, 192, 192, 0.15)',
                borderRadius: '16px',
                backdropFilter: 'blur(16px)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', marginBottom: '4px' }}>
                {service.label}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(192, 192, 192, 0.6)' }}>{service.subtitle}</div>
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
          height: '80px',
          background: 'rgba(10, 14, 20, 0.95)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(192, 192, 192, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingBottom: 'env(safe-area-inset-bottom)',
          zIndex: 100,
        }}
      >
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => router.push(item.path)}
            style={{
              flex: item.center ? 0 : 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: item.center ? 'linear-gradient(135deg, #3B82F6, #6366F1)' : 'transparent',
              width: item.center ? '56px' : 'auto',
              height: item.center ? '56px' : 'auto',
              borderRadius: item.center ? '50%' : '0',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              top: item.center ? '-12px' : '0',
              boxShadow: item.center ? '0 8px 24px rgba(59, 130, 246, 0.3)' : 'none',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={item.center ? '#ffffff' : item.active ? '#3B82F6' : '#9CA3AF'}>
              {item.icon === 'home' && (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              )}
              {item.icon === 'compass' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
              {item.icon === 'plus' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />}
              {item.icon === 'message' && (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              )}
              {item.icon === 'user' && (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              )}
            </svg>
            {!item.center && (
              <span style={{ fontSize: '10px', color: item.active ? '#3B82F6' : '#9CA3AF', fontWeight: item.active ? '600' : '500' }}>
                {item.label}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
          }
