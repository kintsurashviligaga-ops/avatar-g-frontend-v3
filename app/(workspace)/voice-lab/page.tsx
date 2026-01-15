'use client'

import { useState } from 'react'
import ServicePageShell from '@/components/workspace/ServicePageShell'
import HeroChat from '@/components/workspace/HeroChat'

export default function VoiceLabPage() {
  const [config, setConfig] = useState({ voice: 'neural', language: 'georgian', emotion: 'neutral' })

  return (
    <ServicePageShell serviceName="Voice Lab" serviceSubtitle="AI Voice Synthesis">
      <div style={{ padding: '20px' }}>
        <HeroChat serviceName="Voice Lab" />

        <div style={{ marginTop: '24px' }}>
          <label style={{ fontSize: '11px', color: 'rgba(192, 192, 192, 0.6)', display: 'block', marginBottom: '8px' }}>
            Voice Type
          </label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {['neural', 'standard', 'premium'].map((type) => (
              <button
                key={type}
                onClick={() => setConfig({ ...config, voice: type })}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: config.voice === type ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                  border: config.voice === type ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(192, 192, 192, 0.15)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {type}
              </button>
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
            Generate Voice
          </button>
        </div>
      </div>
    </ServicePageShell>
  )
}
