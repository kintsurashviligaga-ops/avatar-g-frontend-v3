'use client'

import ServicePageShell from '@/components/workspace/ServicePageShell'
import HeroChat from '@/components/workspace/HeroChat'

export default function MusicStudioPage() {
  return (
    <ServicePageShell serviceName="Music Studio" serviceSubtitle="Audio Composition">
      <div style={{ padding: '20px' }}>
        <HeroChat serviceName="Music Studio" />

        <div style={{ marginTop: '24px' }}>
          <div
            style={{
              height: '120px',
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
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3B82F6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <p style={{ fontSize: '11px', color: 'rgba(192, 192, 192, 0.6)', marginTop: '8px' }}>Waveform</p>
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
            Generate Music
          </button>
        </div>
      </div>
    </ServicePageShell>
  )
}
