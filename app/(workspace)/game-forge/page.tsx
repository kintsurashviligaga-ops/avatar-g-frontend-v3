'use client'

import ServicePageShell from '@/components/workspace/ServicePageShell'
import HeroChat from '@/components/workspace/HeroChat'

export default function GameForgePage() {
  return (
    <ServicePageShell serviceName="Game Forge" serviceSubtitle="World Builder">
      <div style={{ padding: '20px' }}>
        <HeroChat serviceName="Game Forge" />

        <div style={{ marginTop: '24px' }}>
          <div
            style={{
              height: '200px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(192, 192, 192, 0.2)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3B82F6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <p style={{ fontSize: '12px', color: 'rgba(192, 192, 192, 0.6)', marginTop: '12px' }}>3D Grid</p>
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
            Build World
          </button>
        </div>
      </div>
    </ServicePageShell>
  )
}
