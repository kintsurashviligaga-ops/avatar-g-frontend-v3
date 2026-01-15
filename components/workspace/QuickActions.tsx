'use client'

import { useRouter } from 'next/navigation'

const quickActions = [
  { id: 'image', label: 'Image', path: '/image-architect' },
  { id: 'video', label: 'Video', path: '/video-cine-lab' },
  { id: 'text', label: 'Text', path: '/ai-production' },
  { id: 'voice', label: 'Voice', path: '/voice-lab' },
]

export default function QuickActions() {
  const router = useRouter()

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        padding: '0 20px',
        marginBottom: '32px',
      }}
    >
      {quickActions.map((action) => (
        <button
          key={action.id}
          onClick={() => router.push(action.path)}
          style={{
            padding: '16px 8px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(192, 192, 192, 0.15)',
            borderRadius: '16px',
            backdropFilter: 'blur(16px)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            textAlign: 'center',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" style={{ margin: '0 auto 8px' }}>
            {action.id === 'image' && (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            )}
            {action.id === 'video' && (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            )}
            {action.id === 'text' && (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            )}
            {action.id === 'voice' && (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            )}
          </svg>
          <div style={{ fontSize: '12px', fontWeight: '500', color: '#ffffff' }}>{action.label}</div>
        </button>
      ))}
    </div>
  )
}
