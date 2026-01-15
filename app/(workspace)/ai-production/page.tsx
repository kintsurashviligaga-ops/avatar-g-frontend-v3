'use client'

import ServicePageShell from '@/components/workspace/ServicePageShell'
import HeroChat from '@/components/workspace/HeroChat'

export default function AIProductionPage() {
  return (
    <ServicePageShell serviceName="AI Production" serviceSubtitle="Assembly Pipeline">
      <div style={{ padding: '20px' }}>
        <HeroChat serviceName="AI Production" />

        <div style={{ marginTop: '24px' }}>
          <div
            style={{
              height: '150px',
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              <p style={{ fontSize: '12px', color: 'rgba(192, 192, 192, 0.6)', marginTop: '12px' }}>Timeline</p>
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
            Assemble Project
          </button>
        </div>
      </div>
    </ServicePageShell>
  )
}
