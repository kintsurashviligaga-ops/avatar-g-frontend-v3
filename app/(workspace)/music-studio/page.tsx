'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase/client'
import { useMusicStudioStore } from '@/lib/stores/musicStudioStore'
import { apiClient } from '@/lib/api/client'
import toast, { Toaster } from 'react-hot-toast'

export default function MusicStudioPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  
  const {
    pageState,
    setPageState,
    lyrics,
    setLyrics,
    description,
    setDescription,
    isSynced,
    setIsSynced,
    genre,
    setGenre,
    mood,
    setMood,
    segments,
    updateSegment,
    voiceMode,
    setVoiceMode,
    voiceStyle,
    setVoiceStyle,
    voiceConnected,
    visualEnabled,
    setVisualEnabled,
    visualStyle,
    setVisualStyle,
    coverUrl,
    audioUrl,
    setAudioUrl,
    advancedOpen,
    setAdvancedOpen,
    chatOpen,
    setChatOpen,
  } = useMusicStudioStore()

  const [showGenreSheet, setShowGenreSheet] = useState(false)
  const [syncAnimating, setSyncAnimating] = useState(false)

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

  const handleSmartSync = async () => {
    if (!lyrics.trim()) {
      toast.error('Please add lyrics first')
      return
    }

    setSyncAnimating(true)
    
    // Simulate AI sync (in real app, call API)
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Generate description from lyrics
    const generatedDescription = `${mood} track with ${genre} vibes. ${lyrics.split('\n')[0]}...`
    setDescription(generatedDescription)
    setIsSynced(true)
    setSyncAnimating(false)
    toast.success('Lyrics & description synced!')
  }

  const handleGenerate = async () => {
    // Validation
    if (!lyrics.trim()) {
      toast.error('Please add lyrics')
      setPageState('ERROR_VALIDATION')
      return
    }

    if (voiceMode === 'MY' && !voiceConnected) {
      toast.error('Please connect your voice first')
      setPageState('ERROR_VALIDATION')
      return
    }

    setPageState('GENERATING')
    const loadingToast = toast.loading('Generating music...')

    try {
      // Simulate progressive generation
      for (let i = 0; i < segments.length; i++) {
        updateSegment(segments[i].id, { status: 'in_progress' })
        
        // Simulate progress
        for (let p = 0; p <= 100; p += 20) {
          await new Promise(resolve => setTimeout(resolve, 200))
          updateSegment(segments[i].id, { progress: p / 100 })
        }
        
        updateSegment(segments[i].id, { status: 'completed', progress: 1 })
      }

      // Call backend
      const result = await apiClient.generateMusic({
        prompt: `${lyrics}\n\nStyle: ${genre}, Mood: ${mood}\n${description}`,
        duration: 120,
        style: genre.toLowerCase(),
      })

      if (result.audioUrl) {
        setAudioUrl(result.audioUrl)
        setPageState('SUCCESS')
        toast.success('Music generated successfully!', { id: loadingToast })
      } else {
        throw new Error('No audio URL returned')
      }
    } catch (error: any) {
      console.error('Generation error:', error)
      setPageState('ERROR_RUNTIME')
      toast.error(error.message || 'Generation failed', { id: loadingToast })
    }
  }

  const getStatusColor = () => {
    if (pageState === 'GENERATING') return 'bg-yellow-500'
    if (pageState.startsWith('ERROR')) return 'bg-red-500'
    return 'bg-green-500'
  }

  const getStatusText = () => {
    if (pageState === 'GENERATING') return 'Busy'
    if (pageState.startsWith('ERROR')) return 'Error'
    return 'Active'
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, rgba(139, 92, 246, 0.15), transparent 50%), #0a0e14', paddingBottom: '120px' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, padding: '20px', background: 'rgba(10, 14, 20, 0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.push('/')} style={{ padding: '8px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', cursor: 'pointer', color: '#fff', fontSize: '18px' }}>←</button>
        
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', margin: 0 }}>Music Studio</h1>
          <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', margin: 0 }}>Neural Audio-Visual Lab</p>
        </div>
        
        <div style={{ padding: '6px 12px', background: `rgba(${getStatusColor().includes('green') ? '16, 185, 129' : getStatusColor().includes('yellow') ? '245, 158, 11' : '239, 68, 68'}, 0.1)`, border: `1px solid rgba(${getStatusColor().includes('green') ? '16, 185, 129' : getStatusColor().includes('yellow') ? '245, 158, 11' : '239, 68, 68'}, 0.3)`, borderRadius: '12px', fontSize: '11px', fontWeight: '600', color: getStatusColor().includes('green') ? '#10B981' : getStatusColor().includes('yellow') ? '#F59E0B' : '#EF4444' }}>
          {getStatusText()}
        </div>
      </header>

      <div style={{ padding: '20px' }}>
        {/* Main Studio Card */}
        <div style={{ background: 'rgba(26, 26, 46, 0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '24px' }}>
          
          {/* Project Setup Chips */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <button onClick={() => setShowGenreSheet(true)} style={{ padding: '8px 16px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '12px', color: '#8B5CF6', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                🎸 {genre}
              </button>
              <button style={{ padding: '8px 16px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '12px', color: '#3B82F6', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                🎹 Guitar, Drums
              </button>
              <button onClick={() => {
                const moods = ['Energetic', 'Calm', 'Melancholic', 'Epic', 'Chill']
                const currentIndex = moods.indexOf(mood)
                setMood(moods[(currentIndex + 1) % moods.length])
              }} style={{ padding: '8px 16px', background: 'rgba(236, 72, 153, 0.2)', border: '1px solid rgba(236, 72, 153, 0.3)', borderRadius: '12px', color: '#EC4899', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                ⚡ {mood}
              </button>
            </div>
            <button onClick={() => setShowGenreSheet(true)} style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Explore Genres →
            </button>
          </div>

          {/* Lyrics Input */}
          <div style={{ marginBottom: '24px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#fff', margin: 0 }}>Lyrics / Idea</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={handleSmartSync}
                  disabled={syncAnimating || pageState === 'GENERATING'}
                  style={{ padding: '6px 12px', background: syncAnimating ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px', color: '#8B5CF6', fontSize: '12px', fontWeight: '500', cursor: syncAnimating ? 'wait' : 'pointer', opacity: syncAnimating || pageState === 'GENERATING' ? 0.5 : 1 }}>
                  {syncAnimating ? '✨ Syncing...' : '✨ Smart Sync'}
                </button>
                {isSynced && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{ padding: '6px 12px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', fontSize: '12px', fontWeight: '500', color: '#10B981' }}>
                    Aligned ✓
                  </motion.div>
                )}
                <button onClick={() => setLyrics('')} disabled={pageState === 'GENERATING'} style={{ padding: '6px 12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: '#fff', fontSize: '12px', cursor: pageState === 'GENERATING' ? 'not-allowed' : 'pointer' }}>Clear</button>
              </div>
            </div>
            
            {syncAnimating && (
              <motion.div
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #8B5CF6, #3B82F6)', transformOrigin: 'left', zIndex: 10 }}
              />
            )}
            
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Enter your lyrics or song idea here..."
              disabled={pageState === 'GENERATING'}
              style={{ width: '100%', minHeight: '120px', padding: '14px', background: 'rgba(10, 14, 20, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', opacity: pageState === 'GENERATING' ? 0.5 : 1 }}
            />
          </div>

          {/* Description Input */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>Music Vibe & Scene Description</h3>
            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '12px' }}>Describe mood, pacing, instruments, scene...</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A dramatic orchestral piece with sweeping strings and powerful brass..."
              disabled={pageState === 'GENERATING'}
              style={{ width: '100%', minHeight: '100px', padding: '14px', background: 'rgba(10, 14, 20, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', opacity: pageState === 'GENERATING' ? 0.5 : 1 }}
            />
          </div>

          {/* Timeline Preview */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '12px' }}>Timeline</h3>
            <div style={{ display: 'flex', gap: '4px', height: '40px', background: 'rgba(10, 14, 20, 0.6)', borderRadius: '12px', padding: '4px', overflow: 'hidden' }}>
              {segments.map((segment, idx) => (
                <div key={segment.id} style={{ flex: 1, position: 'relative', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', overflow: 'hidden' }}>
                  {segment.status === 'in_progress' && (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${segment.progress * 100}%` }}
                      style={{ position: 'absolute', top: 0, left: 0, bottom: 0, background: 'linear-gradient(90deg, #8B5CF6, #3B82F6)', borderRadius: '8px' }}
                    />
                  )}
                  {segment.status === 'completed' && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(16, 185, 129, 0.3)', borderRadius: '8px' }} />
                  )}
                  <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff', fontWeight: '500' }}>
                    {segment.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Voice Section */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '12px' }}>Voice</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button 
                onClick={() => setVoiceMode('AI')}
                disabled={pageState === 'GENERATING'}
                style={{ flex: 1, padding: '12px', background: voiceMode === 'AI' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${voiceMode === 'AI' ? '#8B5CF6' : 'rgba(255, 255, 255, 0.1)'}`, borderRadius: '12px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: pageState === 'GENERATING' ? 'not-allowed' : 'pointer' }}>
                AI Voice
              </button>
              <button 
                onClick={() => setVoiceMode('MY')}
                disabled={pageState === 'GENERATING'}
                style={{ flex: 1, padding: '12px', background: voiceMode === 'MY' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${voiceMode === 'MY' ? '#8B5CF6' : 'rgba(255, 255, 255, 0.1)'}`, borderRadius: '12px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: pageState === 'GENERATING' ? 'not-allowed' : 'pointer' }}>
                Use My Voice
              </button>
            </div>
            
            {voiceMode === 'AI' && (
              <select value={voiceStyle} onChange={(e) => setVoiceStyle(e.target.value)} disabled={pageState === 'GENERATING'} style={{ width: '100%', padding: '12px', background: 'rgba(10, 14, 20, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px', outline: 'none', cursor: pageState === 'GENERATING' ? 'not-allowed' : 'pointer' }}>
                <option value="Neutral">Neutral</option>
                <option value="Pop">Pop</option>
                <option value="Rap">Rap</option>
                <option value="Cinematic">Cinematic</option>
              </select>
            )}
            
            {voiceMode === 'MY' && (
              <div style={{ padding: '16px', background: 'rgba(10, 14, 20, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px' }}>
                <button onClick={() => router.push('/voice-lab')} style={{ width: '100%', padding: '12px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '12px', color: '#8B5CF6', fontSize: '14px', fontWeight: '500', cursor: 'pointer', marginBottom: '8px' }}>
                  🎤 Record & Sync Your Voice
                </button>
                <button onClick={() => router.push('/voice-lab')} style={{ width: '100%', padding: '10px', background: 'none', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: 'rgba(255, 255, 255, 0.7)', fontSize: '13px', cursor: 'pointer' }}>
                  Go to Voice Lab →
                </button>
                <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', marginTop: '8px', marginBottom: 0 }}>
                  {voiceConnected ? '✓ Connected' : 'Not connected'}
                </p>
              </div>
            )}
          </div>

          {/* Visual Section */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#fff', margin: 0 }}>Visual Alchemist</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={visualEnabled} 
                  onChange={(e) => setVisualEnabled(e.target.checked)}
                  disabled={pageState === 'GENERATING'}
                  style={{ width: '16px', height: '16px' }}
                />
                <span style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }}>Enable</span>
              </label>
            </div>
            
            {visualEnabled && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  {['Cinematic', 'Cyberpunk', 'Abstract', 'Retro', 'Minimal', 'Noir'].map((style) => (
                    <button
                      key={style}
                      onClick={() => setVisualStyle(style)}
                      disabled={pageState === 'GENERATING'}
                      style={{ padding: '10px', background: visualStyle === style ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${visualStyle === style ? '#8B5CF6' : 'rgba(255, 255, 255, 0.1)'}`, borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: '500', cursor: pageState === 'GENERATING' ? 'not-allowed' : 'pointer' }}>
                      {style}
                    </button>
                  ))}
                </div>
                
                <div style={{ width: '100%', height: '200px', background: 'rgba(10, 14, 20, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {coverUrl ? (
                    <img src={coverUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)' }}>Cover art will appear here</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Advanced Drawer */}
          <div style={{ marginBottom: '24px' }}>
            <button 
              onClick={() => setAdvancedOpen(!advancedOpen)}
              disabled={pageState === 'GENERATING'}
              style={{ width: '100%', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: pageState === 'GENERATING' ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚙️ Advanced</span>
              <span>{advancedOpen ? '▲' : '▼'}</span>
            </button>
            
            <AnimatePresence>
              {advancedOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  style={{ overflow: 'hidden', marginTop: '12px', padding: '16px', background: 'rgba(10, 14, 20, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px' }}>
                  <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', margin: 0 }}>
                    🎛️ Vibe Switcher, Auto-Mix Controls, Collaboration Links — Coming Soon!
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={pageState === 'GENERATING' || !lyrics.trim() || (voiceMode === 'MY' && !voiceConnected)}
            style={{ width: '100%', padding: '18px', background: pageState === 'GENERATING' || !lyrics.trim() ? 'rgba(139, 92, 246, 0.3)' : 'linear-gradient(135deg, #8B5CF6, #3B82F6)', border: 'none', borderRadius: '20px', color: '#fff', fontSize: '16px', fontWeight: '600', cursor: pageState === 'GENERATING' || !lyrics.trim() ? 'not-allowed' : 'pointer', boxShadow: pageState === 'GENERATING' || !lyrics.trim() ? 'none' : '0 8px 24px rgba(139, 92, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {pageState === 'GENERATING' ? (
              <>
                <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                Generating Track...
              </>
            ) : pageState === 'SUCCESS' ? (
              'Regenerate Track'
            ) : pageState.startsWith('ERROR') ? (
              'Try Again'
            ) : (
              'Generate Track'
            )}
          </button>

          {/* Result Panel */}
          {pageState === 'SUCCESS' && audioUrl && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: '24px', padding: '20px', background: 'rgba(26, 26, 46, 0.6)', borderRadius: '16px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#fff' }}>Generated Track</span>
              </div>
              <audio controls style={{ width: '100%', height: '40px', marginBottom: '12px' }}>
                <source src={audioUrl} type="audio/mpeg" />
              </audio>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                <button style={{ padding: '10px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px', color: '#8B5CF6', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                  📹 Export Video 9:16
                </button>
                <button style={{ padding: '10px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', color: '#3B82F6', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                  🎵 Download MP3
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Chat Bubble */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        style={{ position: 'fixed', bottom: '24px', right: '24px', width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer', boxShadow: '0 8px 24px rgba(139, 92, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        💬
      </button>

      {/* Genre Explorer Sheet */}
      <AnimatePresence>
        {showGenreSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowGenreSheet(false)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.8)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: '600px', background: '#1a1a2e', borderRadius: '24px 24px 0 0', padding: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>Explore Genres</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                {['Alt Rock', 'Pop', 'Hip Hop', 'Classical', 'Electronic', 'Jazz', 'R&B', 'Country', 'Metal', 'Indie'].map((g) => (
                  <button
                    key={g}
                    onClick={() => {
                      setGenre(g)
                      setShowGenreSheet(false)
                    }}
                    style={{ padding: '16px', background: genre === g ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${genre === g ? '#8B5CF6' : 'rgba(255, 255, 255, 0.1)'}`, borderRadius: '12px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: 'pointer', textAlign: 'left' }}>
                    {g}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toaster position="bottom-center" />
      
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
    }
