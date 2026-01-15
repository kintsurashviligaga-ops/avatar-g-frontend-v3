'use client'

import ServicePageShell from '@/components/workspace/ServicePageShell'
import HeroChat from '@/components/workspace/HeroChat'

export default function ImageArchitectPage() {
  return (
    <ServicePageShell serviceName="Image Architect" serviceSubtitle="Visual Creation">
      <div style={{ padding: '20px' }}>
        <HeroChat serviceName="Image Architect" />

        <div style={{ marginTop: '24px' }}>
          <div
            style={{
              aspectRatio: '1/1',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '2px solid rgba(192, 192, 192, 0.2)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3B82F6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p style={{ fontSize: '12px', color: 'rgba(192, 192, 192, 0.6)', marginTop: '12px' }}>Image Canvas</p>
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
            Generate Image
          </button>
        </div>
      </div>
    </ServicePageShell>
  )
}
