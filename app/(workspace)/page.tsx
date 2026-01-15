'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function WorkspacePage() {
  const router = useRouter()
  const [message, setMessage] = useState('')

  const services = [
    { id: 'voice', label: 'Voice Lab', emoji: '🎙️', subtitle: 'Voice synthesis', path: '/voice-lab' },
    { id: 'avatar', label: 'Avatar Builder', emoji: '👤', subtitle: 'Digital personas', path: '/avatar-builder' },
    { id: 'image', label: 'Image Architect', emoji: '🖼️', subtitle: 'Visual creation', path: '/image-architect' },
    { id: 'music', label: 'Music Studio', emoji: '🎵', subtitle: 'Audio composition', path: '/music-studio' },
    { id: 'video', label: 'Video Cine-Lab', emoji: '🎬', subtitle: 'AI filmmaking', path: '/video-cine-lab' },
    { id: 'game', label: 'Game Forge', emoji: '🎮', subtitle: 'World builder', path: '/game-forge' },
    { id: 'production', label: 'AI Production', emoji: '⚡', subtitle: 'Assembly pipeline', path: '/ai-production' },
    { id: 'business', label: 'Business Agent', emoji: '💼', subtitle: 'Strategy intelligence', path: '/business-agent' },
  ]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, rgb(26, 26, 46) 0%, rgb(22, 33, 62) 50%, rgb(15, 20, 25) 100%)',
      }}
    >
      {/* TOP BAR */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '16px 20px',
          backgroundColor: 'rgba(26, 26, 46, 0.95)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(139, 92, 246, 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgb(139, 92, 246), rgb(167, 139, 250))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              fontWeight: 700,
              color: 'rgb(255, 255, 255)',
              boxShadow: '0 4px 16px rgba(139, 92, 246, 0.3)',
            }}
          >
            G
          </div>

          <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'rgb(255, 255, 255)', margin: 0 }}>Avatar G</h1>

          <div style={{ position: 'relative' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgb(167, 139, 250), rgb(196, 181, 253))',
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
                backgroundColor: 'rgb(16, 185, 129)',
                border: '3px solid rgb(26, 26, 46)',
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
            WebkitBackdropFilter: 'blur(20px)',
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
              color: 'rgb(255, 255, 255)',
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
            }}
          />
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgb(251, 191, 36), rgb(245, 158, 11))',
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
            fontWeight: 600,
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
                backgroundColor: 'rgba(139, 92, 246, 0.08)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(139, 92, 246, 0.15)',
                borderRadius: '20px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>{service.emoji}</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(255, 255, 255)', marginBottom: '4px' }}>
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
          backgroundColor: 'rgba(26, 26, 46, 0.95)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(139, 92, 246, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
          zIndex: 100,
        }}
      >
        {[
          { id: 'home', label: 'Home', emoji: '🏠', active: true },
          { id: 'explore', label: 'Explore', emoji: '🔍', active: false },
          { id: 'create', label: '', emoji: '➕', center: true },
          { id: 'chats', label: 'Chats', emoji: '💬', active: false },
          { id: 'profile', label: 'Profile', emoji: '👤', active: false },
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
              background: item.center ? 'linear-gradient(135deg, rgb(139, 92, 246), rgb(167, 139, 250))' : 'transparent',
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
            <span style={{ fontSize: item.center ? '28px' : '24px' }}>{item.emoji}</span>
            {!item.center && (
              <span
                style={{
                  fontSize: '11px',
                  color: item.active ? 'rgb(167, 139, 250)' : 'rgba(255, 255, 255, 0.5)',
                  fontWeight: item.active ? 600 : 500,
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
