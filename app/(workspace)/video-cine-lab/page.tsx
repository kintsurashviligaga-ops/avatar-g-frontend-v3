'use client'

import { useRouter } from 'next/navigation'

export default function VoiceLabPage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0A0E14 0%, #1a2945 50%, #0f1419 100%)', paddingBottom: '100px' }}>
      <header
        style={{
          padding: '16px 20px',
          background: 'rgba(10, 14, 20, 0.95)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(192, 192, 192, 0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <button onClick={() => router.push('/')} style={{ padding: '8px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(192, 192, 192, 0.15)', borderRadius: '8px', cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(192, 192, 192, 0.8)">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', margin: 0 }}>Voice Lab</h1>
          <p style={{ fontSize: '11px', color: 'rgba(192, 192, 192, 0.6)', margin: 0 }}>AI Voice Synthesis</p>
        </div>
        <div style={{ padding: '4px 10px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', fontSize: '10px', fontWeight: '600', color: '#10B981' }}>
          Active
        </div>
      </header>

      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '32px', fontWeight: '700', color: '#ffffff', marginBottom: '40px' }}>Voice Lab</h2>
        <div style={{ height: '200px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(192, 192, 192, 0.12)', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <button style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #3B82F6, #6366F1)', border: 'none', borderRadius: '14px', color: '#ffffff', fontSize: '16px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 20px rgba(59, 130, 246, 0.3)' }}>
          Generate Voice
        </button>
      </div>
    </div>
  )
}
