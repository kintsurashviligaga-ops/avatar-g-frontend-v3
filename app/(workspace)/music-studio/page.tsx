'use client'

import React, { useState, useMemo, useEffect } from 'react';

export default function MusicStudioPremium() {
  const [mounted, setMounted] = useState(false);
  const [genre, setGenre] = useState('Alt Rock');
  const [instruments, setInstruments] = useState('Cello, Synth');
  const [mood, setMood] = useState('Energetic');
  const [voiceMode, setVoiceMode] = useState('AI');
  const [lyrics, setLyrics] = useState("Chasing dreams, running through the night.\nA spark in the heart, burning so bright.");
  const [description, setDescription] = useState("Starts slow with Georgian chonguri, then turns into energetic alt-rock chorus.");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState('Chorus');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [credits, setCredits] = useState(100);
  const [isRecording, setIsRecording] = useState(false);
  const [visualEnabled, setVisualEnabled] = useState(true);
  const [visualStyle, setVisualStyle] = useState('Cyberpunk');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Ensure client-side mounting
  useEffect(() => {
    setMounted(true);
  }, []);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://avatarg-backend.vercel.app';

  const handleSmartSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 2500);
  };

  const handleCaptureMelody = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      setTimeout(() => setIsRecording(false), 3000);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setAudioUrl(null);
    
    try {
      const prompt = `${lyrics}\n\nStyle: ${genre}, Instruments: ${instruments}, Mood: ${mood}\n${description}`;
      
      const progressInterval = setInterval(() => {
        setGenerationProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      const response = await fetch(`${API_URL}/api/music/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          duration: 30,
          style: genre.toLowerCase()
        }),
      });

      clearInterval(progressInterval);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      setGenerationProgress(100);
      setAudioUrl(data.audioUrl);
      
      if (data.creditsUsed) {
        setCredits(prev => Math.max(0, prev - data.creditsUsed));
      }

      setTimeout(() => {
        setIsGenerating(false);
        setGenerationProgress(0);
      }, 2000);

    } catch (error) {
      console.error('Generation error:', error);
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  // Simplified particles - only generate on client
  const starParticles = useMemo(() => {
    if (!mounted) return [];
    return [...Array(80)].map((_, i) => ({
      id: i,
      size: (i % 5) * 0.5 + 0.5,
      left: ((i * 47) % 100),
      top: ((i * 83) % 100),
      opacity: (i % 7) * 0.1 + 0.2,
      duration: (i % 12) * 2 + 15,
      delay: (i % 10) * 0.3
    }));
  }, [mounted]);

  const particleGlow = useMemo(() => {
    if (!mounted) return [];
    return [...Array(20)].map((_, i) => ({
      id: i,
      size: (i % 4) * 20 + 40,
      left: ((i * 73) % 100),
      top: ((i * 61) % 100),
      opacity: (i % 3) * 0.1 + 0.05,
      color: i % 3 === 0 ? 'cyan' : i % 3 === 1 ? 'magenta' : 'orange',
      duration: (i % 8) * 3 + 20,
      delay: (i % 6) * 2
    }));
  }, [mounted]);

  // Show loading state while mounting
  if (!mounted) {
    return (
      <div style={{
        minHeight: '100vh',
        width: '100%',
        background: '#050B2A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: '16px',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(34, 211, 238, 0.3)',
            borderTopColor: '#22D3EE',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <div>Loading Music Studio...</div>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="app-root">
      {/* Deep Space Background */}
      <div className="cosmic-background">
        <div className="nebula-layer"></div>
        <div className="noise-layer"></div>
        
        {/* Stars - Only render when mounted */}
        {starParticles.map((star) => (
          <div
            key={`star-${star.id}`}
            className="star"
            style={{
              width: star.size + 'px',
              height: star.size + 'px',
              left: star.left + '%',
              top: star.top + '%',
              opacity: star.opacity,
              animation: `twinkle ${star.duration}s ease-in-out ${star.delay}s infinite`
            }}
          />
        ))}
        
        {/* Glowing Particles */}
        {particleGlow.map((particle) => (
          <div
            key={`glow-${particle.id}`}
            className={`particle-glow particle-${particle.color}`}
            style={{
              width: particle.size + 'px',
              height: particle.size + 'px',
              left: particle.left + '%',
              top: particle.top + '%',
              opacity: particle.opacity,
              animation: `float ${particle.duration}s ease-in-out ${particle.delay}s infinite`
            }}
          />
        ))}
      </div>

      {/* Main Content - Always renders */}
      <div className="content-container">
        
        {/* Header */}
        <div className="page-header">
          <div className="header-top">
            <button className="back-button cosmic-card" onClick={() => window.history.back()}>
              <span className="back-arrow">←</span>
              <span>Back</span>
            </button>
            <div className="credit-badge cosmic-card">
              <span className="credit-icon">✦</span>
              <span className="credit-text">{credits}</span>
              <span className="credit-label">Credits</span>
            </div>
          </div>
          
          <h1 className="electric-title">Music Studio</h1>
          <p className="electric-subtitle">Neural Audio Production Lab</p>
        </div>

        {/* Project Setup */}
        <div className="cosmic-card section-card">
          <div className="card-inner-glow"></div>
          <h3 className="section-title">
            <span className="title-icon">🎚️</span>
            Project Setup
          </h3>
          <div className="chips-row">
            <button 
              className={`chip-button cosmic-pill ${genre === 'Alt Rock' ? 'active' : ''}`}
              onClick={() => setGenre('Alt Rock')}>
              <span className="chip-icon">🎸</span>
              <span>Alt Rock</span>
            </button>
            <button 
              className={`chip-button cosmic-pill ${instruments === 'Cello, Synth' ? 'active' : ''}`}
              onClick={() => setInstruments('Cello, Synth')}>
              <span className="chip-icon">🎹</span>
              <span>Cello, Synth</span>
            </button>
            <button 
              className={`chip-button cosmic-pill ${mood === 'Energetic' ? 'active' : ''}`}
              onClick={() => setMood('Energetic')}>
              <span className="chip-icon">⚡</span>
              <span>Energetic</span>
            </button>
          </div>
          <button className="explore-button neon-button">
            <span>Explore Genres</span>
            <span className="arrow-glow">→</span>
          </button>
        </div>

        {/* Lyrics & Vision */}
        <div className="cosmic-card section-card">
          <div className="card-inner-glow"></div>
          <div className="card-header">
            <h3 className="section-title">
              <span className="title-icon">✍️</span>
              Lyrics & Vision
            </h3>
            <button 
              className={`sync-button cosmic-pill ${isSyncing ? 'syncing' : ''}`}
              onClick={handleSmartSync}
              disabled={isSyncing}>
              <span className="sync-icon">✨</span>
              <span>{isSyncing ? 'Syncing...' : 'Smart Sync'}</span>
            </button>
          </div>
          <textarea
            className="cosmic-input"
            placeholder="Enter your lyrics or musical vision..."
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
          />
        </div>

        {/* Music Vibe & Scene */}
        <div className="cosmic-card section-card">
          <div className="card-inner-glow"></div>
          <h3 className="section-title">
            <span className="title-icon">🌌</span>
            Music Vibe & Scene
          </h3>
          <textarea
            className="cosmic-input scene-input"
            placeholder="Describe the mood, instruments, and atmosphere..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Capture Melody */}
        <div className="cosmic-card section-card">
          <div className="card-inner-glow"></div>
          <h3 className="section-title">
            <span className="title-icon">🎤</span>
            Capture My Melody
          </h3>
          <button 
            className={`melody-button neon-button ${isRecording ? 'recording' : ''}`}
            onClick={handleCaptureMelody}>
            <div className="vintage-mic">
              <div className="mic-grille"></div>
              <div className="mic-body"></div>
              <div className="mic-base"></div>
            </div>
            <span className="melody-text">
              {isRecording ? 'Stop Recording' : 'Capture My Melody'}
            </span>
          </button>
          <div className="voice-status">
            <span className="status-pulse"></span>
            <span className="status-text">Connected: Giorgi Voice v1</span>
          </div>
          <button className="voice-lab-link neon-link">
            <span>Go to Voice Lab</span>
            <span className="link-arrow">→</span>
          </button>
        </div>

        {/* Visual Alchemist */}
        <div className="cosmic-card section-card">
          <div className="card-inner-glow"></div>
          <div className="card-header">
            <h3 className="section-title">
              <span className="title-icon">🎨</span>
              Visual Alchemist
            </h3>
            <label className="power-switch">
              <input 
                type="checkbox" 
                checked={visualEnabled}
                onChange={() => setVisualEnabled(!visualEnabled)}
              />
              <span className="switch-track">
                <span className="switch-thumb"></span>
                <span className="switch-glow"></span>
              </span>
            </label>
          </div>
          
          {visualEnabled && (
            <>
              <div className="style-pills">
                {['Cinematic', 'Cyberpunk', 'Abstract', 'Retro'].map((style) => (
                  <button
                    key={style}
                    className={`style-pill cosmic-pill ${visualStyle === style ? 'active' : ''}`}
                    onClick={() => setVisualStyle(style)}>
                    {style}
                  </button>
                ))}
              </div>
              
              <div className="cover-preview cosmic-display">
                <div className="cover-gradient-flow"></div>
                <div className="cover-particles">
                  {mounted && [...Array(20)].map((_, i) => (
                    <div 
                      key={i} 
                      className="cover-particle"
                      style={{
                        left: `${(i * 17) % 100}%`,
                        top: `${(i * 23) % 100}%`,
                        animationDelay: `${i * 0.3}s`
                      }}
                    />
                  ))}
                </div>
                <span className="cover-label">Album Art Preview</span>
              </div>
            </>
          )}
        </div>

        {/* Voice & Timeline */}
        <div className="cosmic-card section-card">
          <div className="card-inner-glow"></div>
          <h3 className="section-title">
            <span className="title-icon">🎙️</span>
            Voice & Timeline
          </h3>
          
          <div className="voice-mode-selector">
            <button 
              className={`mode-button cosmic-pill ${voiceMode === 'AI' ? 'active' : ''}`}
              onClick={() => setVoiceMode('AI')}>
              AI Voice
            </button>
            <button 
              className={`mode-button cosmic-pill ${voiceMode === 'YOUR' ? 'active' : ''}`}
              onClick={() => setVoiceMode('YOUR')}>
              Your Voice
            </button>
          </div>

          <div className="timeline-transport">
            {['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Outro'].map((segment) => (
              <button
                key={segment}
                className={`transport-segment cosmic-capsule ${selectedSegment === segment ? 'active' : ''}`}
                onClick={() => setSelectedSegment(segment)}>
                <span className="segment-label">{segment}</span>
                <div className={`segment-indicator ${selectedSegment === segment ? 'active' : ''}`} />
              </button>
            ))}
          </div>
          
          <div className="energy-progress">
            <div className="progress-track">
              <div className="progress-energy" style={{ width: '40%' }}>
                <div className="energy-glow"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Studio Equipment */}
        <div className="cosmic-card section-card equipment-panel">
          <div className="card-inner-glow"></div>
          <h3 className="section-title">
            <span className="title-icon">🎚️</span>
            Studio Equipment
          </h3>
          <div className="equipment-display">
            <div className="vintage-deck">
              <div className="tape-reel-container">
                <div className={`reel left-reel ${isGenerating ? 'spinning' : ''}`}>
                  <div className="reel-hub"></div>
                  <div className="reel-tape"></div>
                </div>
                <div className="tape-path"></div>
                <div className={`reel right-reel ${isGenerating ? 'spinning' : ''}`}>
                  <div className="reel-hub"></div>
                  <div className="reel-tape"></div>
                </div>
              </div>
              <div className="deck-panel">
                <div className="vu-meter">
                  {mounted && [...Array(20)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`vu-bar ${isGenerating ? 'active' : ''}`}
                      style={{ animationDelay: `${i * 0.05}s` }}
                    />
                  ))}
                </div>
              </div>
              <div className="equipment-status">
                {isGenerating ? 'Recording in Progress...' : 'Analog Tape Deck Ready'}
              </div>
            </div>
          </div>
        </div>

        {/* Audio Player */}
        {audioUrl && !isGenerating && (
          <div className="cosmic-card audio-output">
            <div className="card-inner-glow"></div>
            <h3 className="section-title">
              <span className="title-icon">🎵</span>
              Generated Track
            </h3>
            <audio 
              controls 
              className="cosmic-audio-player"
              src={audioUrl}>
            </audio>
            <button 
              className="download-button neon-button"
              onClick={() => {
                const a = document.createElement('a');
                a.href = audioUrl;
                a.download = 'generated-track.mp3';
                a.click();
              }}>
              <span className="download-icon">⬇</span>
              <span>Download Track</span>
            </button>
          </div>
        )}

        {/* Advanced */}
        <div className="advanced-section">
          <button 
            className={`advanced-toggle cosmic-card ${advancedOpen ? 'open' : ''}`}
            onClick={() => setAdvancedOpen(!advancedOpen)}>
            <span className="advanced-label">
              <span className="adv-icon">⚙️</span>
              Advanced Audio Controls
            </span>
            <span className={`advanced-chevron ${advancedOpen ? 'open' : ''}`}>▼</span>
          </button>
          
          {advancedOpen && (
            <div className="advanced-content cosmic-card">
              <div className="card-inner-glow"></div>
              {['Reverb', 'Echo', 'Compression'].map((param) => (
                <div key={param} className="advanced-row">
                  <span className="param-label">{param}</span>
                  <div className="param-control">
                    <input type="range" className="cosmic-slider" defaultValue="50" />
                    <span className="param-value">50%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Generate Button */}
        <button 
          className={`generate-cta neon-button-primary ${isGenerating ? 'generating' : ''}`}
          onClick={handleGenerate}
          disabled={isGenerating}>
          <div className="button-glow-layer"></div>
          {isGenerating ? (
            <>
              <span className="energy-spinner"></span>
              <span className="cta-text">Generating {generationProgress}%</span>
            </>
          ) : (
            <>
              <span className="cta-icon">🎵</span>
              <span className="cta-text">Generate Track</span>
              <span className="cta-arrow">→</span>
            </>
          )}
        </button>

        {isGenerating && (
          <div className="generation-energy-bar">
            <div className="energy-fill" style={{ width: `${generationProgress}%` }}>
              <div className="energy-pulse"></div>
            </div>
          </div>
        )}

      </div>

      {/* Bottom Navigation */}
      <nav className="bottom-navigation">
        <div className="nav-glow-bar"></div>
        <button className="nav-item" onClick={() => window.location.href = '/'}>
          <span className="nav-icon">🏠</span>
          <span className="nav-label">Home</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">🎨</span>
          <span className="nav-label">Create</span>
        </button>
        <button className="nav-item active">
          <div className="nav-active-glow"></div>
          <span className="nav-icon">🎵</span>
          <span className="nav-label">Music</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">📁</span>
          <span className="nav-label">Projects</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">⚙️</span>
          <span className="nav-label">Settings</span>
        </button>
      </nav>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: 'Inter', -apple-system, system-ui, sans-serif;
        }

        .app-root {
          min-height: 100vh;
          width: 100%;
          position: relative;
          overflow-x: hidden;
          overflow-y: auto;
          background: #050B2A;
        }

        .cosmic-background {
          position: fixed;
          inset: 0;
          background: 
            radial-gradient(ellipse at 20% 30%, rgba(6, 78, 159, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 70%, rgba(139, 92, 246, 0.12) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(5, 11, 42, 1) 0%, #050B2A 100%);
          z-index: 0;
        }

        .nebula-layer {
          position: absolute;
          inset: 0;
          background: 
            radial-gradient(circle at 15% 25%, rgba(56, 189, 248, 0.08) 0%, transparent 40%),
            radial-gradient(circle at 85% 75%, rgba(236, 72, 153, 0.06) 0%, transparent 40%),
            radial-gradient(circle at 50% 50%, rgba(251, 146, 60, 0.04) 0%, transparent 50%);
          animation: nebulaFlow 30s ease-in-out infinite;
        }

        @keyframes nebulaFlow {
          0%, 100% { opacity: 0.6; transform: scale(1) rotate(0deg); }
          50% { opacity: 0.8; transform: scale(1.1) rotate(5deg); }
        }

        .noise-layer {
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E");
          opacity: 0.4;
          animation: noiseMove 8s linear infinite;
        }

        @keyframes noiseMove {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-10%, -10%); }
        }

        .star {
          position: absolute;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 50%;
          pointer-events: none;
          box-shadow: 0 0 4px rgba(255, 255, 255, 0.8), 0 0 8px rgba(56, 189, 248, 0.4);
        }

        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); filter: brightness(1); }
          50% { opacity: 1; transform: scale(1.3); filter: brightness(1.5); }
        }

        .particle-glow {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(40px);
        }

        .particle-cyan {
          background: radial-gradient(circle, rgba(34, 211, 238, 0.4), transparent);
        }

        .particle-magenta {
          background: radial-gradient(circle, rgba(236, 72, 153, 0.3), transparent);
        }

        .particle-orange {
          background: radial-gradient(circle, rgba(251, 146, 60, 0.25), transparent);
        }

        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }

        .content-container {
          position: relative;
          z-index: 1;
          max-width: 480px;
          margin: 0 auto;
          padding: 20px 16px 120px;
        }

        .cosmic-card {
          position: relative;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-radius: 24px;
          border: 1.5px solid transparent;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.03)),
            linear-gradient(135deg, rgba(34, 211, 238, 0.3) 0%, rgba(236, 72, 153, 0.2) 50%, rgba(251, 146, 60, 0.25) 100%);
          background-origin: border-box;
          background-clip: padding-box, border-box;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset, 0 0 60px rgba(34, 211, 238, 0.1);
        }

        .card-inner-glow {
          position: absolute;
          inset: 0;
          border-radius: 24px;
          background: radial-gradient(circle at 50% 0%, rgba(34, 211, 238, 0.08), transparent 70%);
          pointer-events: none;
        }

        .section-card {
          padding: 28px 24px;
          margin-bottom: 24px;
          animation: cardFloat 0.8s ease-out forwards;
          opacity: 0;
        }

        .section-card:nth-child(2) { animation-delay: 0.1s; }
        .section-card:nth-child(3) { animation-delay: 0.15s; }
        .section-card:nth-child(4) { animation-delay: 0.2s; }
        .section-card:nth-child(5) { animation-delay: 0.25s; }
        .section-card:nth-child(6) { animation-delay: 0.3s; }
        .section-card:nth-child(7) { animation-delay: 0.35s; }
        .section-card:nth-child(8) { animation-delay: 0.4s; }

        @keyframes cardFloat {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .page-header {
          margin-bottom: 36px;
        }

        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 28px;
        }

        .back-button {
          padding: 12px 20px;
          border: none;
          color: rgba(255, 255, 255, 0.95);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.3s ease;
        }

        .back-button:hover {
          transform: translateX(-3px);
          box-shadow: 0 0 40px rgba(34, 211, 238, 0.3), 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        .back-arrow {
          font-size: 20px;
        }

        .credit-badge {
          padding: 12px 20px;
          border: none;
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(255, 255, 255, 0.95);
        }

        .credit-icon {
          font-size: 22px;
          color: #FBB040;
          filter: drop-shadow(0 0 8px rgba(251, 176, 64, 0.6));
          animation: creditPulse 2s ease-in-out infinite;
        }

        @keyframes creditPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(251, 176, 64, 0.6)); }
          50% { transform: scale(1.1); filter: drop-shadow(0 0 12px rgba(251, 176, 64, 0.8)); }
        }

        .credit-text {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .credit-label {
          font-size: 13px;
          font-weight: 600;
          opacity: 0.7;
        }

        .electric-title {
          font-size: 48px;
          font-weight: 900;
          background: linear-gradient(135deg, #FFFFFF 0%, #22D3EE 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.03em;
          margin-bottom: 12px;
          filter: drop-shadow(0 0 30px rgba(34, 211, 238, 0.4));
          animation: titleGlow 3s ease-in-out infinite;
        }

        @keyframes titleGlow {
          0%, 100% { filter: drop-shadow(0 0 30px rgba(34, 211, 238, 0.4)); }
          50% { filter: drop-shadow(0 0 40px rgba(34, 211, 238, 0.6)); }
        }

        .electric-subtitle {
          font-size: 16px;
          font-weight: 500;
          color: rgba(34, 211, 238, 0.8);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .section-title {
          font-size: 20px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.95);
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          position: relative;
        }

        .title-icon {
          font-size: 24px;
          filter: drop-shadow(0 0 8px rgba(34, 211, 238, 0.5));
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .cosmic-pill {
          position: relative;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          border: 1px solid rgba(34, 211, 238, 0.2);
          padding: 12px 20px;
          color: rgba(255, 255, 255, 0.85);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .cosmic-pill:hover {
          transform: translateY(-2px);
          border-color: rgba(34, 211, 238, 0.5);
          box-shadow: 0 0 30px rgba(34, 211, 238, 0.3), 0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        .cosmic-pill.active {
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.2) 0%, rgba(236, 72, 153, 0.15) 100%);
          border-color: rgba(34, 211, 238, 0.6);
          color: #FFFFFF;
          box-shadow: 0 0 40px rgba(34, 211, 238, 0.5), 0 8px 24px rgba(0, 0, 0, 0.3), inset 0 0 20px rgba(34, 211, 238, 0.15);
        }

        .chips-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 20px;
        }

        .chip-button {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .chip-icon {
          font-size: 18px;
        }

        .neon-button {
          width: 100%;
          padding: 16px 28px;
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%);
          border: 2px solid rgba(34, 211, 238, 0.4);
          border-radius: 18px;
          color: rgba(255, 255, 255, 0.95);
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          transition: all 0.3s ease;
          box-shadow: 0 0 30px rgba(34, 211, 238, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .neon-button:hover {
          transform: translateY(-3px);
          border-color: rgba(34, 211, 238, 0.6);
          box-shadow: 0 0 50px rgba(34, 211, 238, 0.4), 0 12px 40px rgba(0, 0, 0, 0.4), inset 0 0 20px rgba(34, 211, 238, 0.1);
        }

        .arrow-glow {
          font-size: 20px;
          transition: transform 0.3s ease;
        }

        .neon-button:hover .arrow-glow {
          transform: translateX(4px);
        }

        .explore-button {
          margin-top: 4px;
        }

        .sync-button {
          padding: 10px 18px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .sync-icon {
          font-size: 16px;
        }

        .sync-button.syncing {
          animation: syncPulse 1s ease-in-out infinite;
        }

        @keyframes syncPulse {
          0%, 100% { box-shadow: 0 0 30px rgba(34, 211, 238, 0.4), inset 0 0 10px rgba(34, 211, 238, 0.1); }
          50% { box-shadow: 0 0 50px rgba(34, 211, 238, 0.6), inset 0 0 20px rgba(34, 211, 238, 0.2); }
        }

        .cosmic-input {
          width: 100%;
          min-height: 150px;
          padding: 18px;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(34, 211, 238, 0.2);
          border-radius: 16px;
          color: rgba(255, 255, 255, 0.95);
          font-size: 15px;
          line-height: 1.7;
          font-family: 'Inter', sans-serif;
          resize: none;
          outline: none;
          transition: all 0.3s ease;
          box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05);
        }

        .cosmic-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .cosmic-input:focus {
          border-color: rgba(34, 211, 238, 0.5);
          box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 30px rgba(34, 211, 238, 0.2), inset 0 0 20px rgba(34, 211, 238, 0.05);
        }

        .scene-input {
          min-height: 110px;
        }

        .melody-button {
          position: relative;
          flex-direction: column;
          padding: 32px;
          gap: 20px;
        }

        .melody-button.recording {
          animation: recordingPulse 1.5s ease-in-out infinite;
          border-color: rgba(239, 68, 68, 0.6);
        }

        @keyframes recordingPulse {
          0%, 100% { box-shadow: 0 0 40px rgba(239, 68, 68, 0.4), inset 0 0 20px rgba(239, 68, 68, 0.1); }
          50% { box-shadow: 0 0 60px rgba(239, 68, 68, 0.6), inset 0 0 30px rgba(239, 68, 68, 0.15); }
        }

        .vintage-mic {
          position: relative;
          width: 60px;
          height: 80px;
          display: flex;
          flex-direction: column;
          align-items: center;
          filter: drop-shadow(0 4px 16px rgba(34, 211, 238, 0.4));
        }

        .mic-grille {
          width: 50px;
          height: 50px;
          border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
          background: linear-gradient(135deg, rgba(192, 192, 192, 0.9) 0%, rgba(128, 128, 128, 0.8) 100%);
          border: 2px solid rgba(80, 80, 80, 0.6);
          box-shadow: inset 0 -2px 8px rgba(0, 0, 0, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3);
          position: relative;
        }

        .mic-grille::before {
          content: '';
          position: absolute;
          inset: 6px;
          border-radius: 50%;
          background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.2) 0px, transparent 1px, transparent 3px, rgba(0, 0, 0, 0.2) 4px);
        }

        .mic-body {
          width: 30px;
          height: 15px;
          background: linear-gradient(180deg, rgba(160, 160, 160, 0.9), rgba(100, 100, 100, 0.8));
          border-radius: 4px;
          box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.3), 0 2px 6px rgba(0, 0, 0, 0.3);
        }

        .mic-base {
          width: 24px;
          height: 8px;
          background: linear-gradient(180deg, rgba(120, 120, 120, 0.9), rgba(60, 60, 60, 0.8));
          border-radius: 2px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
        }

        .melody-text {
          font-size: 17px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.95);
        }

        .voice-status {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 16px 0;
          padding: 12px 0;
        }

        .status-pulse {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #10B981;
          box-shadow: 0 0 16px rgba(16, 185, 129, 0.8);
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 16px rgba(16, 185, 129, 0.8); }
          50% { opacity: 0.6; transform: scale(0.9); box-shadow: 0 0 24px rgba(16, 185, 129, 1); }
        }

        .status-text {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.7);
          font-weight: 500;
        }

        .neon-link {
          background: transparent;
          border: none;
          color: rgba(34, 211, 238, 0.95);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0;
          transition: all 0.3s ease;
        }

        .neon-link:hover {
          color: #22D3EE;
          text-shadow: 0 0 16px rgba(34, 211, 238, 0.6);
          transform: translateX(3px);
        }

        .link-arrow {
          font-size: 18px;
          transition: transform 0.3s ease;
        }

        .neon-link:hover .link-arrow {
          transform: translateX(4px);
        }

        .power-switch {
          position: relative;
          width: 64px;
          height: 32px;
          cursor: pointer;
        }

        .power-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .switch-track {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 16px;
          border: 2px solid rgba(34, 211, 238, 0.3);
          transition: all 0.3s ease;
          box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.4);
        }

        .switch-thumb {
          position: absolute;
          width: 24px;
          height: 24px;
          left: 3px;
          top: 2px;
          background: linear-gradient(135deg, rgba(200, 200, 200, 0.9), rgba(150, 150, 150, 0.9));
          border-radius: 50%;
          transition: all 0.3s ease;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.5);
        }

        .switch-glow {
          position: absolute;
          inset: 0;
          border-radius: 16px;
          opacity: 0;
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.3), rgba(59, 130, 246, 0.3));
          transition: opacity 0.3s ease;
        }

        input:checked + .switch-track {
          background: rgba(34, 211, 238, 0.15);
          border-color: rgba(34, 211, 238, 0.6);
          box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 0 30px rgba(34, 211, 238, 0.3);
        }

        input:checked + .switch-track .switch-thumb {
          transform: translateX(32px);
          background: linear-gradient(135deg, #22D3EE, #3B82F6);
          box-shadow: 0 2px 12px rgba(34, 211, 238, 0.6), inset 0 1px 2px rgba(255, 255, 255, 0.5);
        }

        input:checked + .switch-track .switch-glow {
          opacity: 1;
        }

        .style-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 24px;
        }

        .style-pill {
          padding: 10px 20px;
        }

        .cosmic-display {
          position: relative;
          width: 100%;
          height: 220px;
          border-radius: 20px;
          background: rgba(0, 0, 0, 0.4);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .cover-gradient-flow {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.25) 0%, rgba(168, 85, 247, 0.2) 33%, rgba(236, 72, 153, 0.25) 66%, rgba(251, 146, 60, 0.2) 100%);
          animation: gradientFlow 12s ease-in-out infinite;
        }

        @keyframes gradientFlow {
          0%, 100% { background: linear-gradient(135deg, rgba(34, 211, 238, 0.25) 0%, rgba(168, 85, 247, 0.2) 33%, rgba(236, 72, 153, 0.25) 66%, rgba(251, 146, 60, 0.2) 100%); }
          50% { background: linear-gradient(135deg, rgba(251, 146, 60, 0.2) 0%, rgba(34, 211, 238, 0.25) 33%, rgba(236, 72, 153, 0.25) 66%, rgba(168, 85, 247, 0.2) 100%); }
        }

        .cover-particles {
          position: absolute;
          inset: 0;
        }

        .cover-particle {
          position: absolute;
          width: 3px;
          height: 3px;
          background: rgba(255, 255, 255, 0.8);
          border-radius: 50%;
          animation: particleDrift 8s ease-in-out infinite;
          box-shadow: 0 0 6px rgba(34, 211, 238, 0.6);
        }

        @keyframes particleDrift {
          0%, 100% { transform: translate(0, 0); opacity: 0.3; }
          50% { transform: translate(40px, -40px); opacity: 1; }
        }

        .cover-label {
          position: relative;
          z-index: 1;
          color: rgba(255, 255, 255, 0.7);
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .voice-mode-selector {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
        }

        .mode-button {
          flex: 1;
          padding: 14px;
        }

        .timeline-transport {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          margin-bottom: 20px;
          padding-bottom: 4px;
        }

        .cosmic-capsule {
          min-width: 85px;
          padding: 12px 14px;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(34, 211, 238, 0.2);
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .cosmic-capsule:hover {
          transform: translateY(-2px);
          border-color: rgba(34, 211, 238, 0.4);
          box-shadow: 0 0 20px rgba(34, 211, 238, 0.2), 0 4px 16px rgba(0, 0, 0, 0.3);
        }

        .cosmic-capsule.active {
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.15), rgba(59, 130, 246, 0.1));
          border-color: rgba(34, 211, 238, 0.6);
          box-shadow: 0 0 30px rgba(34, 211, 238, 0.4), 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 0 20px rgba(34, 211, 238, 0.1);
        }

        .segment-label {
          font-size: 12px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.7);
          letter-spacing: 0.03em;
        }

        .segment-indicator {
          width: 100%;
          height: 4px;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 2px;
          position: relative;
          overflow: hidden;
        }

        .segment-indicator.active::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, #22D3EE, #3B82F6);
          box-shadow: 0 0 10px rgba(34, 211, 238, 0.8);
          animation: indicatorPulse 2s ease-in-out infinite;
        }

        @keyframes indicatorPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .energy-progress {
          margin-top: 8px;
        }

        .progress-track {
          width: 100%;
          height: 8px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 4px;
          position: relative;
          overflow: hidden;
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
        }

        .progress-energy {
          height: 100%;
          background: linear-gradient(90deg, #22D3EE, #3B82F6);
          border-radius: 4px;
          position: relative;
          transition: width 0.5s ease;
        }

        .energy-glow {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
          animation: energyFlow 2s linear infinite;
        }

        @keyframes energyFlow {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .equipment-panel {
          background: rgba(0, 0, 0, 0.25);
        }

        .equipment-display {
          padding: 24px 0;
        }

        .vintage-deck {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }

        .tape-reel-container {
          display: flex;
          align-items: center;
          gap: 30px;
          position: relative;
        }

        .reel {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(220, 220, 220, 0.95), rgba(140, 140, 140, 0.9));
          border: 3px solid rgba(80, 80, 80, 0.7);
          position: relative;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5), inset 0 2px 6px rgba(255, 255, 255, 0.4), inset 0 -2px 6px rgba(0, 0, 0, 0.4);
        }

        .reel.spinning {
          animation: rotate 3s linear infinite;
        }

        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .reel-hub {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(180, 180, 180, 1), rgba(80, 80, 80, 0.9));
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6), inset 0 1px 3px rgba(255, 255, 255, 0.5);
        }

        .reel-tape {
          position: absolute;
          inset: 8px;
          border-radius: 50%;
          background: repeating-conic-gradient(from 0deg, rgba(60, 60, 60, 0.8) 0deg 10deg, rgba(100, 100, 100, 0.7) 10deg 20deg);
        }

        .tape-path {
          width: 50px;
          height: 8px;
          background: linear-gradient(180deg, rgba(90, 60, 40, 0.9), rgba(60, 40, 30, 0.9));
          border-radius: 2px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.2);
        }

        .deck-panel {
          width: 100%;
          padding: 20px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 12px;
        }

        .vu-meter {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 4px;
          height: 60px;
        }

        .vu-bar {
          width: 4px;
          height: 20%;
          background: linear-gradient(180deg, rgba(34, 211, 238, 0.3), rgba(59, 130, 246, 0.3));
          border-radius: 2px;
          transition: all 0.1s ease;
        }

        .vu-bar.active {
          height: 70%;
          background: linear-gradient(180deg, #22D3EE, #3B82F6);
          box-shadow: 0 0 8px rgba(34, 211, 238, 0.8);
          animation: vuBounce 0.8s ease-in-out infinite;
        }

        @keyframes vuBounce {
          0%, 100% { height: 30%; }
          50% { height: 85%; }
        }

        .equipment-status {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.7);
          text-align: center;
        }

        .audio-output {
          padding: 28px 24px;
          animation: cardFloat 0.6s ease-out;
        }

        .cosmic-audio-player {
          width: 100%;
          height: 56px;
          margin-bottom: 20px;
          border-radius: 14px;
          filter: drop-shadow(0 0 30px rgba(34, 211, 238, 0.3)) drop-shadow(0 4px 16px rgba(0, 0, 0, 0.4));
        }

        .download-button {
          padding: 14px;
          gap: 10px;
        }

        .download-icon {
          font-size: 20px;
        }

        .advanced-section {
          margin-bottom: 24px;
        }

        .advanced-toggle {
          width: 100%;
          padding: 18px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .advanced-toggle:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 40px rgba(34, 211, 238, 0.25), 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        .advanced-label {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 16px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.95);
        }

        .adv-icon {
          font-size: 22px;
        }

        .advanced-chevron {
          font-size: 14px;
          color: rgba(34, 211, 238, 0.8);
          transition: transform 0.3s ease;
        }

        .advanced-chevron.open {
          transform: rotate(180deg);
        }

        .advanced-content {
          margin-top: 16px;
          padding: 24px;
          animation: cardFloat 0.4s ease-out;
        }

        .advanced-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 20px;
        }

        .advanced-row:last-child {
          margin-bottom: 0;
        }

        .param-label {
          font-size: 15px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.85);
          min-width: 110px;
        }

        .param-control {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .cosmic-slider {
          flex: 1;
          height: 8px;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.4);
          outline: none;
          -webkit-appearance: none;
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
        }

        .cosmic-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #22D3EE, #3B82F6);
          cursor: pointer;
          box-shadow: 0 0 16px rgba(34, 211, 238, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4);
          transition: all 0.2s ease;
        }

        .cosmic-slider::-webkit-slider-thumb:hover {
          transform: scale(1.1);
          box-shadow: 0 0 24px rgba(34, 211, 238, 0.8), 0 2px 12px rgba(0, 0, 0, 0.5);
        }

        .cosmic-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border: none;
          border-radius: 50%;
          background: linear-gradient(135deg, #22D3EE, #3B82F6);
          cursor: pointer;
          box-shadow: 0 0 16px rgba(34, 211, 238, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4);
        }

        .param-value {
          font-size: 14px;
          font-weight: 600;
          color: rgba(34, 211, 238, 0.9);
          min-width: 45px;
          text-align: right;
        }

        .generate-cta {
          width: 100%;
          padding: 22px 36px;
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.25) 0%, rgba(59, 130, 246, 0.2) 100%);
          border: 2px solid rgba(34, 211, 238, 0.5);
          border-radius: 20px;
          color: #FFFFFF;
          font-size: 18px;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
          box-shadow: 0 0 40px rgba(34, 211, 238, 0.3), 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15);
        }

        .generate-cta:hover:not(:disabled) {
          transform: translateY(-4px);
          border-color: rgba(34, 211, 238, 0.7);
          box-shadow: 0 0 60px rgba(34, 211, 238, 0.5), 0 12px 48px rgba(0, 0, 0, 0.5), inset 0 0 30px rgba(34, 211, 238, 0.15);
        }

        .generate-cta:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .generate-cta.generating {
          animation: generatePulse 2s ease-in-out infinite;
        }

        @keyframes generatePulse {
          0%, 100% { box-shadow: 0 0 40px rgba(34, 211, 238, 0.4), 0 8px 32px rgba(0, 0, 0, 0.4); }
          50% { box-shadow: 0 0 80px rgba(34, 211, 238, 0.6), 0 12px 48px rgba(0, 0, 0, 0.5); }
        }

        .button-glow-layer {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.15), rgba(59, 130, 246, 0.1));
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .generate-cta:hover .button-glow-layer {
          opacity: 1;
        }

        .cta-icon {
          font-size: 26px;
          position: relative;
          z-index: 1;
        }

        .cta-text {
          position: relative;
          z-index: 1;
          letter-spacing: 0.02em;
        }

        .cta-arrow {
          font-size: 24px;
          position: relative;
          z-index: 1;
          transition: transform 0.3s ease;
        }

        .generate-cta:hover .cta-arrow {
          transform: translateX(6px);
        }

        .energy-spinner {
          width: 24px;
          height: 24px;
          border: 3px solid rgba(255, 255, 255, 0.2);
          border-top-color: #FFFFFF;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          position: relative;
          z-index: 1;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .generation-energy-bar {
          width: 100%;
          height: 6px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 3px;
          margin-top: 16px;
          overflow: hidden;
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
        }

        .energy-fill {
          height: 100%;
          background: linear-gradient(90deg, #22D3EE, #3B82F6);
          border-radius: 3px;
          position: relative;
          transition: width 0.3s ease;
        }

        .energy-pulse {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
          animation: energyFlow 1.5s linear infinite;
        }

        .bottom-navigation {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(5, 11, 42, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 2px solid transparent;
          background-image: 
            linear-gradient(rgba(5, 11, 42, 0.95), rgba(5, 11, 42, 0.95)),
            linear-gradient(90deg, rgba(34, 211, 238, 0.3) 0%, rgba(236, 72, 153, 0.25) 50%, rgba(251, 146, 60, 0.3) 100%);
          background-origin: border-box;
          background-clip: padding-box, border-box;
          display: flex;
          justify-content: space-around;
          align-items: center;
          padding: 12px 8px 16px;
          z-index: 100;
          box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .nav-glow-bar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, rgba(34, 211, 238, 0.6), rgba(236, 72, 153, 0.5), rgba(251, 146, 60, 0.6));
          filter: blur(4px);
        }

        .nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
        }

        .nav-item:hover {
          color: rgba(255, 255, 255, 0.8);
          transform: translateY(-2px);
        }

        .nav-item.active {
          color: #FFFFFF;
        }

        .nav-active-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(34, 211, 238, 0.3), transparent 70%);
          animation: navPulse 2s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes navPulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
          50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
        }

        .nav-icon {
          font-size: 24px;
          position: relative;
          z-index: 1;
          filter: drop-shadow(0 0 8px rgba(34, 211, 238, 0.3));
        }

        .nav-item.active .nav-icon {
          filter: drop-shadow(0 0 16px rgba(34, 211, 238, 0.8));
        }

        .nav-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          position: relative;
          z-index: 1;
        }

        ::-webkit-scrollbar {
          width: 8px;
        }

        ::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.3);
        }

        ::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(34, 211, 238, 0.4), rgba(59, 130, 246, 0.4));
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(34, 211, 238, 0.6), rgba(59, 130, 246, 0.6));
        }
      `}</style>
    </div>
  );
}
