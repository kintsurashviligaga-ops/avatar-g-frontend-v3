'use client'

import { useState } from 'react'
import HeroChat from '@/components/workspace/HeroChat'
import QuickActions from '@/components/workspace/QuickActions'
import ServiceGrid from '@/components/workspace/ServiceGrid'
import BottomNav from '@/components/workspace/BottomNav'

export default function WorkspacePage() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])

  const handleChatSubmit = (message: string) => {
    setMessages([...messages, { role: 'user', content: message }])
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'How can I help you with that?' }])
    }, 1000)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0A0E14 0%, #1a2945 50%, #0f1419 100%)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
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

        <div style={{ flex: 1, textAlign: 'center' }}>
          <h1 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', margin: 0 }}>Avatar G</h1>
        </div>

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

      <HeroChat onSubmit={handleChatSubmit} />

      <QuickActions />

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

      <ServiceGrid />

      <BottomNav />
    </div>
  )
}
