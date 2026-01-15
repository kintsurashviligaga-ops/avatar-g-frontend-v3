'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function WorkspacePage() {
  const router = useRouter()
  const [message, setMessage] = useState('')

  const services = [
    { id: 'voice', label: 'Voice Lab', subtitle: '🎙️ Voice synthesis', path: '/voice-lab' },
    { id: 'avatar', label: 'Avatar Builder', subtitle: '👤 Digital personas', path: '/avatar-builder' },
    { id: 'image', label: 'Image Architect', subtitle: '🖼️ Visual creation', path: '/image-architect' },
    { id: 'music', label: 'Music Studio', subtitle: '🎵 Audio composition', path: '/music-studio' },
    { id: 'video', label: 'Video Cine-Lab', subtitle: '🎬 AI filmmaking', path: '/video-cine-lab' },
    { id: 'game', label: 'Game Forge', subtitle: '🎮 World builder', path: '/game-forge' },
    { id: 'production', label: 'AI Production', subtitle: '⚡ Assembly pipeline', path: '/ai-production' },
    { id: 'business', label: 'Business Agent', subtitle: '💼 Strategy intelligence', path: '/business-agent' },
  ]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f1419 100%)',
      }}
    >
      {/* TOP BAR */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '16px 20px',
          background: 'rgba(26, 26, 46, 0.95)',
          backdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(139, 92, 246, 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              fontWeight: '700',
              color: '#ffffff',
              boxShadow: '0 4px 16px rgba(139, 92, 246, 0.3)',
            }}
          >
            G
          </div>

          <h1 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 }}>Avatar G</h1>

          <div style={{ position: 'relative' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #A78BFA, #C4B5FD)',
                border: '2px solid rgba(139, 92, 246, 0.3)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#10B981',
                border: '3px solid #1a1a2e',
              }}
            />
          </div>
        </div>
      </header>

      {/* HERO CHAT */}
      <div style={{ padding: '40px 20px 32px' }}>
        <div
          style={{
            maxWidth: '500px',
            margin: '0 auto',
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(167, 139, 250, 0.15))',
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
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask anything..."
            style={{
              flex: 1,
              padding: '8px 0',
              fontSize: '17px',
              color: '#ffffff',
              background: 'transparent',
              border: 'none',
              outline: 'none',
            }}
          />
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              cursor: 'pointer',
            }}
          >
            😊
          </div>
        </div>
      </div>

      {/* SERVICES GRID */}
      <div style={{ padding: '0 20px 120px' }}>
        <h2
          style={{
            fontSize: '13px',
            fontWeight: '600',
            color: 'rgba(255, 255, 255, 0.5)',
            marginBottom: '16px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Choose Your Service
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {services.map((service) => (
            <button
              key={service.id}
              onClick={() => router.push(service.path)}
              style={{
                padding: '24px 20px',
                background: 'rgba(139, 92, 246, 0.08)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(139, 92, 246, 0.15)',
                borderRadius: '20px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
              }}
            >
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '6px' }}>
                {service.label}
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)' }}>{service.subtitle}</div>
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
          height: '90px',
          background: 'rgba(26, 26, 46, 0.95)',
          backdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(139, 92, 246, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
          zIndex: 100,
        }}
      >
        {[
          { id: 'home', label: 'Home', icon: '🏠', active: true },
          { id: 'explore', label: 'Explore', icon: '🔍' },
          { id: 'create', label: '', icon: '➕', center: true },
          { id: 'chats', label: 'Chats', icon: '💬' },
          { id: 'profile', label: 'Profile', icon: '👤' },
        ].map((item) => (
          <button
            key={item.id}
            style={{
              flex: item.center ? 0 : 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: item.center ? 'linear-gradient(135deg, #8B5CF6, #A78BFA)' : 'transparent',
              width: item.center ? '64px' : 'auto',
              height: item.center ? '64px' : 'auto',
              borderRadius: item.center ? '50%' : '0',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              top: item.center ? '-16px' : '0',
              boxShadow: item.center ? '0 8px 28px rgba(139, 92, 246, 0.4)' : 'none',
            }}
          >
            <span style={{ fontSize: item.center ? '28px' : '24px' }}>{item.icon}</span>
            {!item.center && (
              <span
                style={{
                  fontSize: '11px',
                  color: item.active ? '#A78BFA' : 'rgba(255, 255, 255, 0.5)',
                  fontWeight: item.active ? '600' : '500',
                }}
              >
                {item.label}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
              }
