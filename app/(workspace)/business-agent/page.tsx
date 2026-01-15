'use client'

import ServicePageShell from '@/components/workspace/ServicePageShell'
import HeroChat from '@/components/workspace/HeroChat'

export default function BusinessAgentPage() {
  const kpis = [
    { label: 'Revenue', value: '₾45,230', change: '+12.5%' },
    { label: 'ROI', value: '247%', change: '+18.3%' },
    { label: 'Growth', value: '+2,340', change: '+8.7%' },
  ]

  return (
    <ServicePageShell serviceName="Business Agent" serviceSubtitle="Strategy Intelligence">
      <div style={{ padding: '20px' }}>
        <HeroChat serviceName="Business Agent" />

        <div style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            {kpis.map((kpi, idx) => (
              <div
                key={idx}
                style={{
                  padding: '16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(192, 192, 192, 0.15)',
                  borderRadius: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: 'rgba(192, 192, 192, 0.6)', marginBottom: '4px' }}>{kpi.label}</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#ffffff' }}>{kpi.value}</div>
                </div>
                <div
                  style={{
                    padding: '4px 8px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#10B981',
                  }}
                >
                  {kpi.change}
                </div>
              </div>
            ))}
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
            Generate Strategy
          </button>
        </div>
      </div>
    </ServicePageShell>
  )
}
