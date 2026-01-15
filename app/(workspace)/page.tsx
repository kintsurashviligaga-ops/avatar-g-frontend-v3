'use client'

import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  const services = [
    { id: 'avatar-builder', title: 'Avatar Builder', subtitle: 'Identity Lab', path: '/avatar-builder' },
    { id: 'voice-lab', title: 'Voice Lab', subtitle: 'Neural Speech', path: '/voice-lab' },
    { id: 'image-architect', title: 'Image Architect', subtitle: 'Spatial Engine', path: '/image-architect' },
    { id: 'music-studio', title: 'Music Studio', subtitle: 'Global Symphony', path: '/music-studio' },
    { id: 'video-cine-lab', title: 'Video Cine-Lab', subtitle: 'AI Cinema', path: '/video-cine-lab' },
    { id: 'game-forge', title: 'Game Forge', subtitle: 'Multiplayer World', path: '/game-forge' },
    { id: 'ai-production', title: 'AI Production', subtitle: 'Assembly Line', path: '/ai-production' },
    { id: 'business-agent', title: 'Business Agent', subtitle: 'The Brain', path: '/business-agent' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, rgba(139, 92, 246, 0.15), transparent 50%), #0a0e14', paddingBottom: '100px' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, padding: '20px', background: 'rgba(10, 14, 20, 0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', margin: 0 }}>Home</h2>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)', border: '2px solid rgba(255, 255, 255, 0.1)' }} />
      </header>

      {/* Hero */}
      <div style={{ padding: '32px 20px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#fff', marginBottom: '24px', textAlign: 'center', letterSpacing: '-0.02em' }}>
          Hello, how can I help?
        </h1>

        <div style={{ position: 'relative', maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.1))', backdropFilter: 'blur(20px)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '9999px', boxShadow: '0 0 40px rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'center', padding: '4px' }}>
            <input type="text" placeholder="Ask anything…" style={{ flex: 1, padding: '14px 20px', fontSize: '16px', color: '#fff', background: 'transparent', border: 'none', outline: 'none' }} />
            <button style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ padding: '0 20px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {[
            { label: 'Image', path: '/image-architect' },
            { label: 'Video', path: '/video-cine-lab' },
            { label: 'Text', path: '/ai-production' },
            { label: 'Voice', path: '/voice-lab' },
          ].map((item) => (
            <button key={item.path} onClick={() => router.push(item.path)} style={{ padding: '20px 12px', background: 'rgba(26, 26, 46, 0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#fff', fontSize: '13px', fontWeight: '500' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>●</div>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Services Grid */}
      <div style={{ padding: '0 20px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
          All Services
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {services.map((service) => (
            <button key={service.id} onClick={() => router.push(service.path)} style={{ padding: '20px 16px', background: 'rgba(26, 26, 46, 0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '20px', cursor: 'pointer', textAlign: 'left', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #8B5CF6, #3B82F6)', opacity: 0.6 }} />
              <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>{service.title}</h4>
              <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)', margin: 0 }}>{service.subtitle}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Nav */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '80px', background: 'rgba(10, 14, 20, 0.95)', backdropFilter: 'blur(24px)', borderTop: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', zIndex: 100 }}>
        {[
          { label: 'Home', active: true },
          { label: 'Explore' },
          { label: '', center: true },
          { label: 'Chats' },
          { label: 'Profile' },
        ].map((item, i) => (
          <button key={i} style={{ flex: item.center ? 0 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: item.center ? 'linear-gradient(135deg, #8B5CF6, #3B82F6)' : 'transparent', width: item.center ? '56px' : 'auto', height: item.center ? '56px' : 'auto', borderRadius: item.center ? '50%' : '0', border: 'none', cursor: 'pointer', position: 'relative', top: item.center ? '-12px' : '0', boxShadow: item.center ? '0 8px 28px rgba(139, 92, 246, 0.4)' : 'none', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={item.center ? '#fff' : item.active ? '#8B5CF6' : '#6B7280'}><circle cx="12" cy="12" r="10" /></svg>
            {!item.center && <span style={{ fontSize: '11px', color: item.active ? '#8B5CF6' : '#6B7280', fontWeight: item.active ? '600' : '500' }}>{item.label}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
