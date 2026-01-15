'use client'

import { useRouter } from 'next/navigation'

export default function VoiceLabPage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, rgba(139, 92, 246, 0.15), transparent 50%), #0a0e14', paddingBottom: '100px' }}>
      <header style={{ padding: '20px', background: 'rgba(10, 14, 20, 0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.push('/')} style={{ padding: '8px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', cursor: 'pointer', color: '#fff', fontSize: '18px' }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', margin: 0 }}>Voice Lab</h1>
          <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', margin: 0 }}>Neural Speech Studio</p>
        </div>
        <div style={{ padding: '6px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', fontSize: '11px', fontWeight: '600', color: '#10B981' }}>Active</div>
      </header>

      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ height: '200px', background: 'rgba(26, 26, 46, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6"><circle cx="12" cy="12" r="10" /></svg>
        </div>
        <button style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)', border: 'none', borderRadius: '20px', color: '#fff', fontSize: '16px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 8px 24px rgba(139, 92, 246, 0.3)' }}>
          Generate Voice
        </button>
      </div>
    </div>
  )
}
