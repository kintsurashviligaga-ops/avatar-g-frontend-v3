'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { apiClient } from '@/lib/api/client'
import toast, { Toaster } from 'react-hot-toast'

export default function VoiceLabPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [language, setLanguage] = useState<'ge' | 'en' | 'ru' | 'cn'>('ge')
  const [emotion, setEmotion] = useState(50)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/')
        return
      }
      setUser(session.user)
      apiClient.setToken(session.access_token)
    })
  }, [router])

  const handleGenerate = async () => {
    if (!text.trim()) {
      toast.error('Please enter text')
      return
    }

    if (text.length < 10) {
      toast.error('Text must be at least 10 characters')
      return
    }

    setLoading(true)
    const loadingToast = toast.loading('Generating voice...')

    try {
      const result = await apiClient.generateVoice({
        text,
        language,
        emotion,
      })

      if (result.audioUrl) {
        setAudioUrl(result.audioUrl)
        toast.success('Voice generated successfully!', { id: loadingToast })
      } else {
        throw new Error('No audio URL returned')
      }
    } catch (error: any) {
      console.error('Generation error:', error)
      toast.error(error.message || 'Generation failed', { id: loadingToast })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, rgba(139, 92, 246, 0.15), transparent 50%), #0a0e14', paddingBottom: '100px' }}>
      {/* Header */}
      <header style={{ padding: '20px', background: 'rgba(10, 14, 20, 0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.push('/')} style={{ padding: '8px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', cursor: 'pointer', color: '#fff', fontSize: '18px' }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', margin: 0 }}>Voice Lab</h1>
          <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', margin: 0 }}>Neural Speech Studio</p>
        </div>
        <div style={{ padding: '6px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', fontSize: '11px', fontWeight: '600', color: '#10B981' }}>Active</div>
      </header>

      <div style={{ padding: '20px' }}>
        {/* Language Selection */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '12px' }}>Language</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {(['ge', 'en', 'ru', 'cn'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                disabled={loading}
                style={{
                  padding: '12px',
                  background: language === lang ? 'rgba(139, 92, 246, 0.2)' : 'rgba(26, 26, 46, 0.6)',
                  border: `1px solid ${language === lang ? '#8B5CF6' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  textTransform: 'uppercase',
                  opacity: loading ? 0.5 : 1
                }}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        {/* Emotion Slider */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#fff', margin: 0 }}>Emotion</h3>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#8B5CF6' }}>{emotion}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={emotion}
            onChange={(e) => setEmotion(Number(e.target.value))}
            disabled={loading}
            style={{ 
              width: '100%', 
              height: '6px',
              borderRadius: '3px',
              opacity: loading ? 0.5 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>Calm</span>
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>Expressive</span>
          </div>
        </div>

        {/* Text Input */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#fff', margin: 0 }}>Text</h3>
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>{text.length} characters</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter text to synthesize... (minimum 10 characters)"
            disabled={loading}
            style={{
              width: '100%',
              minHeight: '140px',
              padding: '14px',
              background: 'rgba(26, 26, 46, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '14px',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              opacity: loading ? 0.5 : 1
            }}
          />
        </div>

        {/* Audio Player */}
        {audioUrl && (
          <div style={{ marginBottom: '20px', padding: '20px', background: 'rgba(26, 26, 46, 0.6)', borderRadius: '16px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#fff' }}>Generated Audio</span>
            </div>
            <audio controls style={{ width: '100%', height: '40px' }}>
              <source src={audioUrl} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={loading || !text.trim()}
          style={{
            width: '100%',
            padding: '18px',
            background: loading || !text.trim() ? 'rgba(139, 92, 246, 0.3)' : 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
            border: 'none',
            borderRadius: '20px',
            color: '#fff',
            fontSize: '16px',
            fontWeight: '600',
            cursor: loading || !text.trim() ? 'not-allowed' : 'pointer',
            boxShadow: loading || !text.trim() ? 'none' : '0 8px 24px rgba(139, 92, 246, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          {loading ? (
            <>
              <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              Generating...
            </>
          ) : (
            'Generate Voice'
          )}
        </button>
      </div>

      <Toaster position="bottom-center" />
      
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
        }
