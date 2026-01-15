'use client'

import ServicePageShell from '@/components/workspace/ServicePageShell'
import HeroChat from '@/components/workspace/HeroChat'

export default function VideoCineLabPage() {
  return (
    <ServicePageShell serviceName="Video Cine-Lab" serviceSubtitle="AI Filmmaking">
      <div style={{ padding: '20px' }}>
        <HeroChat serviceName="Video Cine-Lab" />

        <div style={{ marginTop: '24px' }}>
          <div
            style={{
              aspectRatio: '16/9',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '2px solid rgba(192, 192, 192, 0.2)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3B82F6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p style={{ fontSize: '12px', color: 'rgba(192, 192, 192, 0.6)', marginTop: '12px' }}>Video Frame</p>
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
            Generate Video
          </button>
        </div>
      </div>
    </ServicePageShell>
  )
}
