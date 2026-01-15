'use client'

import { useRouter } from 'next/navigation'

const services = [
  { id: 'voice-lab', label: 'Voice Lab', subtitle: 'AI voice synthesis', path: '/voice-lab' },
  { id: 'avatar-builder', label: 'Avatar Builder', subtitle: 'Digital personas', path: '/avatar-builder' },
  { id: 'image-architect', label: 'Image Architect', subtitle: 'Visual creation', path: '/image-architect' },
  { id: 'music-studio', label: 'Music Studio', subtitle: 'Audio composition', path: '/music-studio' },
  { id: 'video-cine-lab', label: 'Video Cine-Lab', subtitle: 'AI filmmaking', path: '/video-cine-lab' },
  { id: 'game-forge', label: 'Game Forge', subtitle: 'World builder', path: '/game-forge' },
  { id: 'ai-production', label: 'AI Production', subtitle: 'Assembly pipeline', path: '/ai-production' },
  { id: 'business-agent', label: 'Business Agent', subtitle: 'Strategy intelligence', path: '/business-agent' },
]

export default function ServiceGrid() {
  const router = useRouter()

  return (
    <div style={{ padding: '0 20px 100px' }}>
      <h2
        style={{
          fontSize: '20px',
          fontWeight: '600',
          color: '#ffffff',
          marginBottom: '16px',
          letterSpacing: '-0.01em',
        }}
      >
        All Services
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
        }}
      >
        {services.map((service) => (
          <button
            key={service.id}
            onClick={() => router.push(service.path)}
            style={{
              padding: '20px 16px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(192, 192, 192, 0.15)',
              borderRadius: '16px',
              backdropFilter: 'blur(16px)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', marginBottom: '4px' }}>
              {service.label}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(192, 192, 192, 0.6)' }}>{service.subtitle}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
