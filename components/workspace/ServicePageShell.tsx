'use client'

import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from './BottomNav'

interface ServicePageShellProps {
  serviceName: string
  serviceSubtitle: string
  children: ReactNode
}

export default function ServicePageShell({ serviceName, serviceSubtitle, children }: ServicePageShellProps) {
  const router = useRouter()

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0A0E14 0%, #1a2945 50%, #0f1419 100%)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: '80px',
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
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => router.push('/')}
            style={{
              padding: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(192, 192, 192, 0.15)',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(192, 192, 192, 0.8)">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', margin: 0 }}>{serviceName}</h1>
            <p style={{ fontSize: '11px', color: 'rgba(192, 192, 192, 0.6)', margin: 0 }}>{serviceSubtitle}</p>
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
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
            Active
          </div>
        </div>
      </header>

      <main>{children}</main>

      <BottomNav />
    </div>
  )
}
