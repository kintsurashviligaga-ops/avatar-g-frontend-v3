'use client'

import { useState } from 'react'

export default function V2Page() {
  const [selected, setSelected] = useState<string | null>(null)

  const items = [
    { id: 'avatar', icon: '👤', name: 'Avatar Builder', desc: 'Digital Identity' },
    { id: 'voice', icon: '🎙️', name: 'Voice Lab', desc: 'Georgian Synthesis' },
    { id: 'image', icon: '🎨', name: 'Image Architect', desc: 'Visual Design' },
    { id: 'music', icon: '🎵', name: 'Music Studio', desc: 'Audio Composition' },
    { id: 'video', icon: '🎬', name: 'Video Cine-Lab', desc: 'Motion Pictures' },
    { id: 'game', icon: '🎮', name: 'Game Forge', desc: 'World Builder' },
    { id: 'production', icon: '⚡', name: 'AI Production', desc: 'Full Pipeline' },
    { id: 'business', icon: '💼', name: 'Business Agent', desc: 'Strategy Alpha' },
  ]

  if (selected) {
    const item = items.find(i => i.id === selected)
    return (
      <div style={{ minHeight: '100vh', background: '#05070A', color: 'white', padding: '20px' }}>
        <button 
          onClick={() => setSelected(null)}
          style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', color: 'white', marginBottom: '20px' }}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>{item?.name}</h1>
        <p style={{ color: '#999' }}>{item?.desc}</p>
        <div style={{ marginTop: '30px', padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
          Chat interface coming soon...
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#05070A', color: 'white' }}>
      {/* Header */}
      <div style={{ height: '56px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', padding: '0 16px', background: 'rgba(255,255,255,0.05)' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #1a2332, #0f1419)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(192,192,192,0.2)' }}>
          <span style={{ fontWeight: 'bold', color: '#C0C0C0' }}>A</span>
        </div>
        <div style={{ marginLeft: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#C0C0C0' }}>Avatar G</div>
          <div style={{ fontSize: '9px', color: 'rgba(192,192,192,0.5)' }}>Neural Ecosystem</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: 'rgba(192,192,192,0.7)' }}>1250</span>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>
            DU
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ padding: '20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px', marginTop: '16px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#C0C0C0', marginBottom: '8px' }}>Choose Your Service</h2>
          <p style={{ fontSize: '14px', color: 'rgba(192,192,192,0.5)' }}>Select an AI module to begin</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '448px', margin: '0 auto' }}>
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelected(item.id)}
              style={{ 
                width: '100%', 
                background: 'rgba(255,255,255,0.05)', 
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(192,192,192,0.1)', 
                borderRadius: '12px', 
                padding: '16px', 
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseDown={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseUp={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: '1px solid rgba(192,192,192,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '24px' }}>{item.icon}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#C0C0C0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</h3>
                  <p style={{ fontSize: '12px', color: 'rgba(192,192,192,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.desc}</p>
                </div>
                <svg style={{ width: '20px', height: '20px', color: 'rgba(192,192,192,0.3)', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>

        {/* Credits */}
        <div style={{ marginTop: '32px', maxWidth: '448px', margin: '32px auto 0' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.2), rgba(126, 34, 206, 0.2))', backdropFilter: 'blur(8px)', border: '1px solid rgba(192,192,192,0.1)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '12px', color: 'rgba(192,192,192,0.5)', marginBottom: '4px' }}>Neural Credits</p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#C0C0C0' }}>1,250</p>
              </div>
              <button style={{ padding: '8px 16px', background: 'rgba(192,192,192,0.1)', border: '1px solid rgba(192,192,192,0.2)', color: '#C0C0C0', fontSize: '12px', fontWeight: '500', borderRadius: '8px', cursor: 'pointer' }}>
                Buy More
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
