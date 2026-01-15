'use client'

import { useRouter } from 'next/navigation'

export default function ServicePage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)', paddingBottom: '100px' }}>
      <header style={{ padding: '16px 20px', background: 'rgba(26, 26, 46, 0.95)', backdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.push('/')} style={{ padding: '8px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '12px', cursor: 'pointer' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A78BFA">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', margin: 0 }}>Service Name</h1>
      </header>

      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ height: '200px', background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.15)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)' }}>
          <span style={{ fontSize: '64px' }}>🎨</span>
        </div>
        <button style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)', border: 'none', borderRadius: '20px', color: '#ffffff', fontSize: '16px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 8px 24px rgba(139, 92, 246, 0.3)' }}>
          Generate
        </button>
      </div>
    </div>
  )
}
