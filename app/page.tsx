'use client'

import { useState } from 'react'

export default function HomePage() {
  const [selected, setSelected] = useState<string | null>(null)

  const items = [
    { id: 'avatar', icon: '👤', name: 'Avatar Builder', desc: 'Digital Identity', color: 'from-blue-500/20 to-cyan-500/20' },
    { id: 'voice', icon: '🎙️', name: 'Voice Lab', desc: 'Georgian Synthesis', color: 'from-purple-500/20 to-pink-500/20' },
    { id: 'image', icon: '🎨', name: 'Image Architect', desc: 'Visual Design', color: 'from-orange-500/20 to-red-500/20' },
    { id: 'music', icon: '🎵', name: 'Music Studio', desc: 'Audio Composition', color: 'from-indigo-500/20 to-purple-500/20' },
    { id: 'video', icon: '🎬', name: 'Video Cine-Lab', desc: 'Motion Pictures', color: 'from-green-500/20 to-teal-500/20' },
    { id: 'game', icon: '🎮', name: 'Game Forge', desc: 'World Builder', color: 'from-violet-500/20 to-blue-500/20' },
    { id: 'production', icon: '⚡', name: 'AI Production', desc: 'Full Pipeline', color: 'from-yellow-500/20 to-orange-500/20' },
    { id: 'business', icon: '💼', name: 'Business Agent', desc: 'Strategy Alpha', color: 'from-slate-500/20 to-zinc-500/20' },
  ]

  if (selected) {
    const item = items.find(i => i.id === selected)
    return (
      <div style={{ minHeight: '100vh', height: '100vh', display: 'flex', flexDirection: 'column', background: '#05070A', color: 'white', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ height: '56px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', padding: '0 16px', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <button 
            onClick={() => setSelected(null)}
            style={{ 
              padding: '8px 16px', 
              background: 'rgba(255,255,255,0.1)', 
              border: '1px solid rgba(192,192,192,0.2)', 
              borderRadius: '8px', 
              color: 'white', 
              cursor: 'pointer', 
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div style={{ marginLeft: '16px', fontSize: '14px', fontWeight: '600', color: '#C0C0C0' }}>
            {item?.name}
          </div>
        </div>
        
        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            {/* Service Info Card */}
            <div style={{ 
              background: `linear-gradient(135deg, ${item?.color})`, 
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(192,192,192,0.1)', 
              borderRadius: '16px', 
              padding: '24px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                <div style={{ 
                  width: '64px', 
                  height: '64px', 
                  borderRadius: '12px', 
                  background: 'rgba(255,255,255,0.1)', 
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(192,192,192,0.2)',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center'
                }}>
                  <span style={{ fontSize: '32px' }}>{item?.icon}</span>
                </div>
                <div>
                  <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', margin: 0, marginBottom: '4px' }}>
                    {item?.name}
                  </h1>
                  <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                    {item?.desc}
                  </p>
                </div>
              </div>
              
              <div style={{ 
                padding: '16px', 
                background: 'rgba(0,0,0,0.3)', 
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', margin: 0, lineHeight: '1.6' }}>
                  This AI service is part of Avatar G's Neural Ecosystem. Connect with our backend to start generating content.
                </p>
              </div>
            </div>

            {/* Coming Soon Card */}
            <div style={{ 
              background: 'rgba(255,255,255,0.05)', 
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(192,192,192,0.1)', 
              borderRadius: '16px', 
              padding: '32px',
              textAlign: 'center'
            }}>
              <div style={{ 
                width: '80px', 
                height: '80px', 
                margin: '0 auto 20px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{ fontSize: '40px' }}>💬</span>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#C0C0C0', margin: '0 0 12px 0' }}>
                Chat Interface Coming Soon
              </h3>
              <p style={{ fontSize: '14px', color: 'rgba(192,192,192,0.6)', margin: 0, lineHeight: '1.6' }}>
                Connect this frontend to your Avatar G backend API to enable real-time AI generation and conversation.
              </p>
              
              <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button style={{
                  padding: '10px 20px',
                  background: 'rgba(59,130,246,0.2)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  borderRadius: '8px',
                  color: '#60A5FA',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'not-allowed',
                  opacity: 0.6
                }}>
                  Connect Backend
                </button>
                <button style={{
                  padding: '10px 20px',
                  background: 'rgba(192,192,192,0.1)',
                  border: '1px solid rgba(192,192,192,0.2)',
                  borderRadius: '8px',
                  color: '#C0C0C0',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'not-allowed',
                  opacity: 0.6
                }}>
                  View Docs
                </button>
              </div>
            </div>

            {/* Features Preview */}
            <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              {['Real-time Generation', 'Georgian Language Support', 'Credit System', 'Asset Library'].map((feature, idx) => (
                <div key={idx} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(192,192,192,0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(192,192,192,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px'
                  }}>
                    ✓
                  </div>
                  <span style={{ fontSize: '14px', color: '#C0C0C0' }}>{feature}</span>
                </div>
              ))}
            </div>
          </div>
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

      {/* Main Content */}
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
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: '1px solid rgba(192,192,192,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '24px' }}>{item.icon}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#C0C0C0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{item.name}</h3>
                  <p style={{ fontSize: '12px', color: 'rgba(192,192,192,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{item.desc}</p>
                </div>
                <svg style={{ width: '20px', height: '20px', color: 'rgba(192,192,192,0.3)', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>

        {/* Credits Widget */}
        <div style={{ marginTop: '32px', maxWidth: '448px', margin: '32px auto 0' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.2), rgba(126, 34, 206, 0.2))', backdropFilter: 'blur(8px)', border: '1px solid rgba(192,192,192,0.1)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '12px', color: 'rgba(192,192,192,0.5)', marginBottom: '4px', margin: 0 }}>Neural Credits</p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#C0C0C0', margin: 0, marginTop: '4px' }}>1,250</p>
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
