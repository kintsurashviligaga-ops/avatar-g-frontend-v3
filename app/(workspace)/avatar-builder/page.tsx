'use client'

import ServicePageShell from '@/components/workspace/ServicePageShell'
import HeroChat from '@/components/workspace/HeroChat'

export default function AvatarBuilderPage() {
  return (
    <ServicePageShell serviceName="Avatar Builder" serviceSubtitle="Digital Personas">
      <div style={{ padding: '20px' }}>
        <HeroChat serviceName="Avatar Builder" />

        <div style={{ marginTop: '24px' }}>
          <div
            style={{
              height: '200px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(192, 192, 192, 0.2)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3B82F6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <p style={{ fontSize: '12px', color: 'rgba(192, 192, 192, 0.6)', marginTop: '12px' }}>Avatar Preview</p>
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
            Create Avatar
          </button>
        </div>
      </div>
    </ServicePageShell>
  )
}
