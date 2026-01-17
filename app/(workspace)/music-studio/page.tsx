'use client'

import React, { useState, useMemo } from 'react';

export default function MusicStudioPremium() {
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

  // Backend API URL
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

  // Handle music generation
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

  // Stable star particles
  const starParticles = useMemo(() => {
    return [...Array(80)].map((_, i) => ({
      id: i,
      size: (i % 4) * 0.5 + 1,
      left: ((i * 47) % 100),
      top: ((i * 83) % 100),
      opacity: (i % 5) * 0.15 + 0.3,
      duration: (i % 10) * 3 + 20,
      delay: (i % 8) * 0.5
    }));
  }, []);

  // Fire ember particles
  const emberParticles = useMemo(() => {
    return [...Array(25)].map((_, i) => ({
      id: i,
      size: (i % 3) * 1.5 + 2,
      left: ((i * 67) % 100),
      bottom: -10 + (i % 5) * 5,
      duration: (i % 6) * 2 + 8,
      delay: (i % 7) * 0.8
    }));
  }, []);

  return (
    <div className="app-root">
      {/* Cosmic Background */}
      <div className="cosmic-background">
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
        
        {emberParticles.map((ember) => (
          <div
            key={`ember-${ember.id}`}
            className="ember"
            style={{
              width: ember.size + 'px',
              height: ember.size + 'px',
              left: ember.left + '%',
              bottom: ember.bottom + '%',
              animation: `rise ${ember.duration}s ease-out ${ember.delay}s infinite`
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="content-container">
        
        {/* Header */}
        <div className="page-header">
          <div className="header-top">
            <button className="back-button glass-element neon-outline">
              <span className="back-arrow">←</span>
              <span>Back</span>
            </button>
            <div className="credit-badge glass-element neon-outline">
              <span className="credit-icon">✦</span>
              <span className="credit-text">{credits} Credits</span>
            </div>
          </div>
          
          <h1 className="electric-title">Music Studio</h1>
          <p className="electric-subtitle">Neural Audio Production Lab</p>
        </div>

        {/* Project Setup */}
        <div className="glass-card neon-outline section-card">
          <h3 className="section-title">Project Setup</h3>
          <div className="chips-row">
            <button 
              className={`chip-button glass-element neon-outline ${genre === 'Alt Rock' ? 'active' : ''}`}
              onClick={() => setGenre('Alt Rock')}>
              <span className="chip-emoji">🎸</span>
              <span>Alt Rock</span>
            </button>
            <button 
              className={`chip-button glass-element neon-outline ${instruments === 'Cello, Synth' ? 'active' : ''}`}
              onClick={() => setInstruments('Cello, Synth')}>
              <span className="chip-emoji">🎹</span>
              <span>Cello, Synth</span>
            </button>
            <button 
              className={`chip-button glass-element neon-outline ${mood === 'Energetic' ? 'active' : ''}`}
              onClick={() => setMood('Energetic')}>
              <span className="chip-emoji">⚡</span>
              <span>Energetic</span>
            </button>
          </div>
          <button className="explore-button glass-element neon-outline">
            <span>Explore Genres</span>
            <span className="arrow-icon">→</span>
          </button>
        </div>

        {/* Lyrics & Vision */}
        <div className="glass-card neon-outline section-card">
          <div className="card-header">
            <h3 className="section-title">Lyrics & Vision</h3>
            <button 
              className={`sync-button glass-element neon-outline ${isSyncing ? 'syncing' : ''}`}
              onClick={handleSmartSync}
              disabled={isSyncing}>
              <span className="sync-emoji">✨</span>
              <span>{isSyncing ? 'Syncing...' : 'Smart Sync'}</span>
            </button>
          </div>
          <textarea
            className="lyrics-input glass-element neon-outline"
            placeholder="Enter your lyrics or musical vision..."
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
          />
        </div>

        {/* Music Vibe & Scene Description */}
        <div className="glass-card neon-outline section-card">
          <h3 className="section-title">Music Vibe & Scene Description</h3>
          <textarea
            className="description-input glass-element neon-outline"
            placeholder="Describe the mood, instruments, and atmosphere..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Capture My Melody */}
        <div className="glass-card neon-outline section-card">
          <h3 className="section-title">Capture My Melody</h3>
          <button 
            className={`melody-button glass-element neon-outline ${isRecording ? 'recording' : ''}`}
            onClick={handleCaptureMelody}>
            <span className="mic-icon">{isRecording ? '⏹' : '🎤'}</span>
            <span className="melody-text">
              {isRecording ? 'Stop Recording' : 'Capture My Melody'}
            </span>
          </button>
          <div className="voice-status">
            <span className="status-dot"></span>
            <span className="status-text">Connected: Giorgi Voice v1</span>
          </div>
          <button className="voice-lab-link">
            <span>Go to Voice Lab</span>
            <span className="link-arrow">→</span>
          </button>
        </div>

        {/* Visual Alchemist */}
        <div className="glass-card neon-outline section-card">
          <div className="card-header">
            <h3 className="section-title">Visual Alchemist</h3>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={visualEnabled}
                onChange={() => setVisualEnabled(!visualEnabled)}
              />
              <span className="toggle-slider glass-element"></span>
            </label>
          </div>
          
          {visualEnabled && (
            <>
              <div className="style-pills">
                {['Cinematic', 'Cyberpunk', 'Abstract', 'Retro'].map((style) => (
                  <button
                    key={style}
                    className={`style-pill glass-element neon-outline ${visualStyle === style ? 'active' : ''}`}
                    onClick={() => setVisualStyle(style)}>
                    {style}
                  </button>
                ))}
              </div>
              
              <div className="cover-preview glass-element">
                <div className="cover-gradient"></div>
                <span className="cover-label">Cover Preview</span>
              </div>
            </>
          )}
        </div>

        {/* Voice & Timeline */}
        <div className="glass-card neon-outline section-card">
          <h3 className="section-title">Voice & Timeline</h3>
          
          <div className="voice-mode-selector">
            <button 
              className={`mode-button glass-element neon-outline ${voiceMode === 'AI' ? 'active' : ''}`}
              onClick={() => setVoiceMode('AI')}>
              AI Voice
            </button>
            <button 
              className={`mode-button glass-element neon-outline ${voiceMode === 'YOUR' ? 'active' : ''}`}
              onClick={() => setVoiceMode('YOUR')}>
              Your Voice
            </button>
          </div>

          <div className="timeline-strip">
            {['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Outro'].map((segment) => (
              <button
                key={segment}
                className={`timeline-segment glass-element ${selectedSegment === segment ? 'active' : ''}`}
                onClick={() => setSelectedSegment(segment)}>
                <span className="segment-label">{segment}</span>
                <div className={`segment-bar ${selectedSegment === segment ? 'active' : ''}`} />
              </button>
            ))}
          </div>
          
          <div className="timeline-progress-bar">
            <div className="progress-track glass-element">
              <div className="progress-active" style={{ width: '40%' }}></div>
            </div>
          </div>
        </div>

        {/* Studio Equipment */}
        <div className="glass-card neon-outline section-card preview-card">
          <h3 className="section-title">Studio Equipment</h3>
          <div className="equipment-display">
            <div className="retro-equipment">
              <div className="tape-reel">
                <div className={`reel-circle left-reel ${isGenerating ? 'spinning' : ''}`}>
                  <div className="reel-center" />
                  <div className="reel-spokes" />
                </div>
                <div className="tape-strip" />
                <div className={`reel-circle right-reel ${isGenerating ? 'spinning' : ''}`}>
                  <div className="reel-center" />
                  <div className="reel-spokes" />
                </div>
              </div>
              <div className="equipment-label">
                {isGenerating ? 'Recording...' : 'Analog Tape Deck'}
              </div>
            </div>
            
            <div className="waveform-preview">
              <div className="waveform-bars">
                {[...Array(20)].map((_, i) => (
                  <div 
                    key={i} 
                    className={`wave-bar ${isGenerating ? 'active' : ''}`}
                    style={{ 
                      height: `${20 + Math.sin(i * 0.5) * 40}%`,
                      animationDelay: `${i * 0.05}s`
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Audio Player */}
        {audioUrl && !isGenerating && (
          <div className="glass-card neon-outline audio-player-card">
            <h3 className="section-title">Generated Track</h3>
            <audio 
              controls 
              className="audio-player"
              src={audioUrl}>
              Your browser does not support audio playback.
            </audio>
            <button 
              className="download-button glass-element neon-outline"
              onClick={() => {
                const a = document.createElement('a');
                a.href = audioUrl;
                a.download = 'generated-track.mp3';
                a.click();
              }}>
              <span>⬇</span>
              <span>Download Track</span>
            </button>
          </div>
        )}

        {/* Advanced Section */}
        <div className="advanced-section">
          <button 
            className="advanced-toggle glass-element neon-outline"
            onClick={() => setAdvancedOpen(!advancedOpen)}>
            <span className="advanced-label">Advanced</span>
            <span className={`advanced-arrow ${advancedOpen ? 'open' : ''}`}>▼</span>
          </button>
          
          {advancedOpen && (
            <div className="advanced-content glass-card neon-outline">
              <div className="advanced-row">
                <span className="advanced-option">Reverb</span>
                <input type="range" className="advanced-slider" min="0" max="100" defaultValue="30" />
              </div>
              <div className="advanced-row">
                <span className="advanced-option">Echo</span>
                <input type="range" className="advanced-slider" min="0" max="100" defaultValue="20" />
              </div>
              <div className="advanced-row">
                <span className="advanced-option">Compression</span>
                <input type="range" className="advanced-slider" min="0" max="100" defaultValue="50" />
              </div>
            </div>
          )}
        </div>

        {/* Generate Button */}
        <button 
          className={`primary-cta glass-element neon-outline ${isGenerating ? 'generating' : ''}`}
          onClick={handleGenerate}
          disabled={isGenerating}>
          <span className="cta-glow" />
          {isGenerating ? (
            <>
              <span className="spinner" />
              <span className="cta-text">Generating {generationProgress}%</span>
            </>
          ) : (
            <>
              <span className="cta-text">Generate Track</span>
              <span className="cta-icon">→</span>
            </>
          )}
        </button>

        {/* Progress Bar */}
        {isGenerating && (
          <div className="generation-progress">
            <div 
              className="progress-fill"
              style={{ width: `${generationProgress}%` }}
            />
          </div>
        )}

      </div>

      {/* Bottom Navigation */}
      <nav className="bottom-nav glass-element">
        <button className="nav-item">
          <span className="nav-icon">🏠</span>
          <span className="nav-label">Home</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">🎨</span>
          <span className="nav-label">Create</span>
        </button>
        <button className="nav-item active">
          <div className="nav-glow-ring" />
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: 'Inter', sans-serif;
        }

        /* ============ COSMIC BACKGROUND ============ */
        .app-root {
          min-height: 100vh;
          width: 100%;
          position: relative;
          overflow-x: hidden;
          overflow-y: auto;
        }

        .cosmic-background {
          position: fixed;
          inset: 0;
          background: 
            radial-gradient(ellipse at top left, rgba(30, 58, 138, 0.4), transparent 50%),
            radial-gradient(ellipse at bottom right, rgba(59, 130, 246, 0.3), transparent 50%),
            radial-gradient(ellipse at center, rgba(15, 23, 42, 0.8), transparent 70%),
            linear-gradient(180deg, #0a1128 0%, #0d1b3a 50%, #1a1f3a 100%);
          z-index: 0;
        }

        .star {
          position: absolute;
          background: white;
          border-radius: 50%;
          pointer-events: none;
          box-shadow: 0 0 4px rgba(255, 255, 255, 0.8);
        }

        .ember {
          position: absolute;
          background: radial-gradient(circle, rgba(255, 150, 80, 0.9), rgba(255, 80, 40, 0.4));
          border-radius: 50%;
          pointer-events: none;
          filter: blur(1px);
          box-shadow: 0 0 8px rgba(255, 120, 60, 0.6);
        }

        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        @keyframes rise {
          0% { transform: translateY(0) translateX(0); opacity: 0.8; }
          50% { opacity: 1; }
          100% { transform: translateY(-100vh) translateX(20px); opacity: 0; }
        }

        /* ============ GLASS & NEON SYSTEM ============ */
        .glass-element {
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
        }

        .neon-outline {
          border: 2px solid transparent;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.08)),
            linear-gradient(135deg, rgba(34, 211, 238, 0.6) 0%, rgba(251, 146, 60, 0.6) 100%);
          background-origin: border-box;
          background-clip: padding-box, border-box;
          box-shadow: 
            0 0 20px rgba(34, 211, 238, 0.3),
            0 0 40px rgba(251, 146, 60, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.15);
        }

        /* ============ CONTENT CONTAINER ============ */
        .content-container {
          position: relative;
          z-index: 1;
          max-width: 480px;
          margin: 0 auto;
          padding: 20px 16px 100px;
        }

        /* ============ HEADER ============ */
        .page-header {
          margin-bottom: 32px;
        }

        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .back-button {
          padding: 10px 18px;
          border-radius: 14px;
          border: none;
          color: rgba(255, 255, 255, 0.9);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .back-button:hover {
          transform: translateX(-2px);
          box-shadow: 
            0 0 30px rgba(34, 211, 238, 0.4),
            0 0 50px rgba(251, 146, 60, 0.3);
        }

        .back-arrow {
          font-size: 18px;
        }

        .credit-badge {
          padding: 10px 18px;
          border-radius: 20px;
          border: none;
          display: flex;
          align-items: center;
          gap: 8px;
          color: rgba(255, 255, 255, 0.95);
          font-size: 15px;
          font-weight: 600;
        }

        .credit-icon {
          color: #fbbf24;
          font-size: 18px;
        }

        .credit-text {
          letter-spacing: 0.02em;
        }

        /* ============ ELECTRIC TYPOGRAPHY ============ */
        .electric-title {
          font-size: 42px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.98);
          letter-spacing: -0.02em;
          margin-bottom: 8px;
          text-shadow: 
            0 0 30px rgba(34, 211, 238, 0.5),
            0 0 60px rgba(251, 146, 60, 0.3),
            0 2px 4px rgba(0, 0, 0, 0.3);
          filter: drop-shadow(0 1px 2px rgba(255, 255, 255, 0.3));
        }

        .electric-subtitle {
          font-size: 15px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.7);
          letter-spacing: 0.05em;
        }

        .section-title {
          font-size: 18px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.95);
          margin-bottom: 16px;
          text-shadow: 0 0 20px rgba(34, 211, 238, 0.4);
        }

        /* ============ CARDS ============ */
        .glass-card {
          border-radius: 20px;
          padding: 24px;
          margin-bottom: 20px;
          position: relative;
        }

        .section-card {
          animation: fadeInUp 0.6s ease-out forwards;
          opacity: 0;
        }

        .section-card:nth-child(2) { animation-delay: 0.1s; }
        .section-card:nth-child(3) { animation-delay: 0.2s; }
        .section-card:nth-child(4) { animation-delay: 0.3s; }
        .section-card:nth-child(5) { animation-delay: 0.4s; }
        .section-card:nth-child(6) { animation-delay: 0.5s; }
        .section-card:nth-child(7) { animation-delay: 0.6s; }
        .section-card:nth-child(8) { animation-delay: 0.7s; }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        /* ============ CHIPS ============ */
        .chips-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 16px;
        }

        .chip-button {
          padding: 11px 18px;
          border-radius: 16px;
          border: none;
          color: rgba(255, 255, 255, 0.85);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .chip-emoji {
          font-size: 16px;
        }

        .chip-button:hover {
          transform: translateY(-2px);
          box-shadow: 
            0 0 30px rgba(34, 211, 238, 0.5),
            0 0 50px rgba(251, 146, 60, 0.3);
        }

        .chip-button.active {
          color: #fff;
          box-shadow: 
            0 0 40px rgba(34, 211, 238, 0.6),
            0 0 60px rgba(251, 146, 60, 0.4),
            inset 0 0 20px rgba(255, 255, 255, 0.1);
        }

        .explore-button {
          width: 100%;
          padding: 12px 20px;
          border-radius: 14px;
          border: none;
          color: rgba(255, 255, 255, 0.9);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.3s ease;
        }

        .explore-button:hover {
          transform: translateY(-2px);
          box-shadow: 
            0 0 30px rgba(34, 211, 238, 0.5),
            0 0 50px rgba(251, 146, 60, 0.3);
        }

        .arrow-icon {
          font-size: 18px;
          transition: transform 0.3s ease;
        }

        .explore-button:hover .arrow-icon {
          transform: translateX(4px);
        }

        .sync-button {
          padding: 9px 16px;
          border-radius: 14px;
          border: none;
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .sync-emoji {
          font-size: 15px;
        }

        .sync-button:hover:not(:disabled) {
          transform: scale(1.05);
          box-shadow: 
            0 0 30px rgba(34, 211, 238, 0.5),
            0 0 50px rgba(251, 146, 60, 0.3);
        }

        .sync-button.syncing {
          animation: syncPulse 0.5s ease-in-out infinite;
        }

        @keyframes syncPulse {
          0%, 100% { 
            box-shadow: 
              0 0 30px rgba(34, 211, 238, 0.5),
              0 0 50px rgba(251, 146, 60, 0.3);
          }
          50% { 
            box-shadow: 
              0 0 50px rgba(34, 211, 238, 0.8),
              0 0 80px rgba(251, 146, 60, 0.5);
          }
        }

        .sync-button:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        /* ============ INPUTS ============ */
        .lyrics-input,
        .description-input {
          width: 100%;
          min-height: 140px;
          padding: 16px;
          border-radius: 16px;
          border: none;
          color: rgba(255, 255, 255, 0.95);
          font-size: 15px;
          line-height: 1.6;
          resize: none;
          outline: none;
          transition: all 0.3s ease;
        }

        .description-input {
          min-height: 100px;
        }

        .lyrics-input::placeholder,
        .description-input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .lyrics-input:focus,
        .description-input:focus {
          box-shadow: 
            0 0 40px rgba(34, 211, 238, 0.5),
            0 0 60px rgba(251, 146, 60, 0.3),
            inset 0 0 30px rgba(255, 255, 255, 0.05);
        }

        /* ============ CAPTURE MELODY ============ */
        .melody-button {
          width: 100%;
          padding: 16px 24px;
          border-radius: 16px;
          border: none;
          color: rgba(255, 255, 255, 0.95);
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          transition: all 0.3s ease;
          margin-bottom: 16px;
        }

        .melody-button:hover {
          transform: translateY(-2px);
          box-shadow: 
            0 0 30px rgba(34, 211, 238, 0.5),
            0 0 50px rgba(251, 146, 60, 0.3);
        }

        .melody-button.recording {
          animation: recordingPulse 1s ease-in-out infinite;
        }

        @keyframes recordingPulse {
          0%, 100% {
            box-shadow: 
              0 0 30px rgba(239, 68, 68, 0.5),
              0 0 50px rgba(239, 68, 68, 0.3);
          }
          50% {
            box-shadow: 
              0 0 50px rgba(239, 68, 68, 0.8),
              0 0 80px rgba(239, 68, 68, 0.5);
          }
        }

        .mic-icon {
          font-size: 24px;
        }

        .melody-text {
          font-size: 15px;
        }

        .voice-status {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          padding: 8px 0;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.6);
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .status-text {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
          font-weight: 500;
        }

        .voice-lab-link {
          background: transparent;
          border: none;
          color: rgba(34, 211, 238, 0.9);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0;
          transition: all 0.3s ease;
        }

        .voice-lab-link:hover {
          color: rgba(34, 211, 238, 1);
          transform: translateX(2px);
        }

        .link-arrow {
          font-size: 16px;
          transition: transform 0.3s ease;
        }

        .voice-lab-link:hover .link-arrow {
          transform: translateX(4px);
        }

        /* ============ VISUAL ALCHEMIST ============ */
        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 52px;
          height: 28px;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          border-radius: 14px;
          transition: all 0.3s ease;
          border: 2px solid rgba(34, 211, 238, 0.4);
        }

        .toggle-slider:before {
          content: '';
          position: absolute;
          height: 20px;
          width: 20px;
          left: 3px;
          bottom: 3px;
          background: white;
          border-radius: 50%;
          transition: all 0.3s ease;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        input:checked + .toggle-slider {
          border-color: rgba(34, 211, 238, 0.8);
          box-shadow: 
            0 0 20px rgba(34, 211, 238, 0.4),
            inset 0 0 15px rgba(34, 211, 238, 0.2);
        }

        input:checked + .toggle-slider:before {
          transform: translateX(24px);
          background: linear-gradient(135deg, #22d3ee, #fb923c);
        }

        .style-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 20px;
        }

        .style-pill {
          padding: 10px 18px;
          border-radius: 20px;
          border: none;
          color: rgba(255, 255, 255, 0.85);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .style-pill:hover {
          transform: translateY(-2px);
          box-shadow: 
            0 0 20px rgba(34, 211, 238, 0.4),
            0 0 30px rgba(251, 146, 60, 0.2);
        }

        .style-pill.active {
          color: #fff;
          box-shadow: 
            0 0 30px rgba(34, 211, 238, 0.6),
            0 0 50px rgba(251, 146, 60, 0.4),
            inset 0 0 20px rgba(255, 255, 255, 0.1);
        }

        .cover-preview {
          width: 100%;
          height: 200px;
          border-radius: 16px;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .cover-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, 
            rgba(34, 211, 238, 0.3) 0%, 
            rgba(168, 85, 247, 0.3) 50%, 
            rgba(251, 146, 60, 0.3) 100%);
          animation: gradientShift 8s ease-in-out infinite;
        }

        @keyframes gradientShift {
          0%, 100% { 
            background: linear-gradient(135deg, 
              rgba(34, 211, 238, 0.3) 0%, 
              rgba(168, 85, 247, 0.3) 50%, 
              rgba(251, 146, 60, 0.3) 100%);
          }
          50% { 
            background: linear-gradient(135deg, 
              rgba(251, 146, 60, 0.3) 0%, 
              rgba(34, 211, 238, 0.3) 50%, 
              rgba(168, 85, 247, 0.3) 100%);
          }
        }

        .cover-label {
          position: relative;
          z-index: 1;
          color: rgba(255, 255, 255, 0.7);
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.05em;
        }

        /* ============ VOICE MODE ============ */
        .voice-mode-selector {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }

        .mode-button {
          flex: 1;
          padding: 13px;
          border-radius: 14px;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .mode-button:hover {
          color: rgba(255, 255, 255, 0.9);
          transform: translateY(-2px);
        }

        .mode-button.active {
          color: #fff;
          box-shadow: 
            0 0 30px rgba(34, 211, 238, 0.5),
            0 0 50px rgba(251, 146, 60, 0.3),
            inset 0 0 15px rgba(255, 255, 255, 0.1);
        }

        /* ============ TIMELINE ============ */
        .timeline-strip {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
          margin-bottom: 16px;
        }

        .timeline-segment {
          flex: 1;
          min-width: 80px;
          padding: 10px 12px;
          border-radius: 12px;
          text-align: center;
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(20px);
        }

        .timeline-segment:hover {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.08);
        }

        .timeline-segment.active {
          background: rgba(255, 255, 255, 0.1);
          box-shadow: 
            0 0 20px rgba(34, 211, 238, 0.4),
            0 0 30px rgba(251, 146, 60, 0.3);
        }

        .segment-label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 6px;
        }

        .segment-bar {
          height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          position: relative;
          overflow: hidden;
        }

        .segment-bar.active::after {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          width: 100%;
          background: linear-gradient(90deg, #22d3ee, #fb923c);
          box-shadow: 0 0 10px rgba(34, 211, 238, 0.6);
          animation: progress 2s ease-in-out infinite;
        }

        @keyframes progress {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .timeline-progress-bar {
          width: 100%;
        }

        .progress-track {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          position: relative;
          overflow: hidden;
        }

        .progress-active {
          height: 100%;
          background: linear-gradient(90deg, #22d3ee, #fb923c);
          border-radius: 3px;
          box-shadow: 0 0 12px rgba(34, 211, 238, 0.6);
          transition: width 0.5s ease;
        }

        /* ============ EQUIPMENT PREVIEW ============ */
        .preview-card {
          background: rgba(255, 255, 255, 0.06);
        }

        .equipment-display {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
        }

        .retro-equipment {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .tape-reel {
          display: flex;
          align-items: center;
          gap: 20px;
          filter: drop-shadow(0 4px 12px rgba(34, 211, 238, 0.3));
        }

        .reel-circle {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: 
            radial-gradient(circle at 30% 30%, rgba(200, 200, 200, 0.9), rgba(120, 120, 120, 0.8)),
            linear-gradient(135deg, rgba(180, 180, 180, 0.9), rgba(100, 100, 100, 0.8));
          border: 3px solid rgba(80, 80, 80, 0.9);
          position: relative;
          box-shadow: 
            0 4px 12px rgba(0, 0, 0, 0.5),
            inset 0 2px 4px rgba(255, 255, 255, 0.3),
            inset 0 -2px 4px rgba(0, 0, 0, 0.3);
          transition: animation-duration 0.3s ease;
        }

        .reel-circle.spinning {
          animation: rotate 2s linear infinite !important;
        }

        .left-reel {
          animation: rotate 8s linear infinite;
          animation-direction: normal;
        }

        .right-reel {
          animation: rotate 8s linear infinite;
          animation-direction: reverse;
        }

        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .reel-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: 
            radial-gradient(circle at 30% 30%, rgba(150, 150, 150, 1), rgba(60, 60, 60, 0.9));
          box-shadow: 
            0 2px 6px rgba(0, 0, 0, 0.6),
            inset 0 1px 2px rgba(255, 255, 255, 0.4);
        }

        .reel-spokes {
          position: absolute;
          inset: 0;
          background: 
            linear-gradient(0deg, transparent 48%, rgba(80, 80, 80, 0.8) 48%, rgba(80, 80, 80, 0.8) 52%, transparent 52%),
            linear-gradient(90deg, transparent 48%, rgba(80, 80, 80, 0.8) 48%, rgba(80, 80, 80, 0.8) 52%, transparent 52%),
            linear-gradient(45deg, transparent 48%, rgba(80, 80, 80, 0.8) 48%, rgba(80, 80, 80, 0.8) 52%, transparent 52%),
            linear-gradient(-45deg, transparent 48%, rgba(80, 80, 80, 0.8) 48%, rgba(80, 80, 80, 0.8) 52%, transparent 52%);
        }

        .tape-strip {
          width: 40px;
          height: 6px;
          background: linear-gradient(180deg, rgba(90, 60, 40, 0.9), rgba(60, 40, 30, 0.9));
          border-radius: 1px;
          box-shadow: 
            0 2px 6px rgba(0, 0, 0, 0.5),
            inset 0 1px 1px rgba(255, 255, 255, 0.2);
        }

        .equipment-label {
          font-size: 13px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.7);
          letter-spacing: 0.05em;
          transition: all 0.3s ease;
        }

        /* ============ WAVEFORM ============ */
        .waveform-preview {
          width: 100%;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 12px;
          padding: 8px;
        }

        .waveform-bars {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
          height: 100%;
        }

        .wave-bar {
          width: 3px;
          background: linear-gradient(180deg, rgba(34, 211, 238, 0.4), rgba(251, 146, 60, 0.4));
          border-radius: 2px;
          transition: all 0.3s ease;
        }

        .wave-bar.active {
          background: linear-gradient(180deg, #22d3ee, #fb923c);
          animation: wave 0.8s ease-in-out infinite;
          box-shadow: 0 0 6px rgba(34, 211, 238, 0.6);
        }

        @keyframes wave {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1.2); }
        }

        /* ============ AUDIO PLAYER ============ */
        .audio-player-card {
          background: rgba(255, 255, 255, 0.06);
          animation: fadeInUp 0.6s ease-out;
        }

        .audio-player {
          width: 100%;
          height: 50px;
          margin-bottom: 16px;
          border-radius: 12px;
          filter: 
            drop-shadow(0 0 20px rgba(34, 211, 238, 0.3))
            drop-shadow(0 0 40px rgba(251, 146, 60, 0.2));
        }

        .download-button {
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          border: none;
          color: rgba(255, 255, 255, 0.9);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.3s ease;
        }

        .download-button:hover {
          transform: translateY(-2px);
          box-shadow: 
            0 0 30px rgba(34, 211, 238, 0.5),
            0 0 50px rgba(251, 146, 60, 0.3);
        }

        /* ============ ADVANCED SECTION ============ */
        .advanced-section {
          margin-bottom: 20px;
        }

        .advanced-toggle {
          width: 100%;
          padding: 14px 20px;
          border-radius: 14px;
          border: none;
          color: rgba(255, 255, 255, 0.9);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.3s ease;
        }

        .advanced-toggle:hover {
          transform: translateY(-2px);
          box-shadow: 
            0 0 30px rgba(34, 211, 238, 0.4),
            0 0 50px rgba(251, 146, 60, 0.2);
        }

        .advanced-label {
          font-size: 15px;
        }

        .advanced-arrow {
          font-size: 12px;
          transition: transform 0.3s ease;
        }

        .advanced-arrow.open {
          transform: rotate(180deg);
        }

        .advanced-content {
          margin-top: 12px;
          padding: 20px;
          animation: fadeInUp 0.4s ease-out;
        }

        .advanced-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
        }

        .advanced-row:last-child {
          margin-bottom: 0;
        }

        .advanced-option {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.85);
          min-width: 100px;
        }

        .advanced-slider {
          flex: 1;
          height: 6px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.1);
          outline: none;
          -webkit-appearance: none;
        }

        .advanced-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(135deg, #22d3ee, #fb923c);
          cursor: pointer;
          box-shadow: 0 0 10px rgba(34, 211, 238, 0.6);
        }

        .advanced-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(135deg, #22d3ee, #fb923c);
          cursor: pointer;
          box-shadow: 0 0 10px rgba(34, 211, 238, 0.6);
          border: none;
        }

        /* ============ PRIMARY CTA ============ */
        .primary-cta {
          width: 100%;
          padding: 18px 32px;
          border-radius: 18px;
          border: none;
          color: #fff;
          font-size: 17px;
          font-weight: 700;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          transition: all 0.3s ease;
        }

        .primary-cta:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 
            0 0 50px rgba(34, 211, 238, 0.6),
            0 0 80px rgba(251, 146, 60, 0.4);
        }

        .primary-cta:disabled {
          cursor: not-allowed;
        }

        .primary-cta.generating {
          animation: generatePulse 1.5s ease-in-out infinite;
        }

        @keyframes generatePulse {
          0%, 100% {
            box-shadow: 
              0 0 30px rgba(34, 211, 238, 0.4),
              0 0 50px rgba(251, 146, 60, 0.3);
          }
          50% {
            box-shadow: 
              0 0 60px rgba(34, 211, 238, 0.7),
              0 0 100px rgba(251, 146, 60, 0.5);
          }
        }

        .cta-glow {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.3), rgba(251, 146, 60, 0.3));
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .primary-cta:hover .cta-glow {
          opacity: 1;
        }

        .cta-text {
          position: relative;
          z-index: 1;
        }

        .cta-icon {
          position: relative;
          z-index: 1;
          transition: transform 0.3s ease;
          font-size: 20px;
        }

        .primary-cta:hover .cta-icon {
          transform: translateX(4px);
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          position: relative;
          z-index: 1;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* ============ PROGRESS BAR ============ */
        .generation-progress {
          width: 100%;
          height: 4px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          overflow: hidden;
          margin-top: 12px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #22d3ee, #fb923c);
          border-radius: 2px;
          transition: width 0.3s ease;
          box-shadow: 0 0 10px rgba(34, 211, 238, 0.6);
        }

        /* ============ BOTTOM NAV ============ */
        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          justify-content: space-around;
          padding: 12px 8px 16px;
          border-top: 2px solid transparent;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.08)),
            linear-gradient(90deg, rgba(34, 211, 238, 0.4) 0%, rgba(251, 146, 60, 0.4) 100%);
          background-origin: border-box;
          background-clip: padding-box, border-box;
          box-shadow: 
            0 -4px 24px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          z-index: 100;
        }

        .nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 8px 12px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
        }

        .nav-item:hover {
          color: rgba(255, 255, 255, 0.9);
        }

        .nav-item.active {
          color: #fff;
        }

        .nav-glow-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 50px;
          height: 50px;
          border-radius: 50%;
          border: 2px solid rgba(34, 211, 238, 0.6);
          box-shadow: 
            0 0 20px rgba(34, 211, 238, 0.6),
            0 0 40px rgba(251, 146, 60, 0.4);
          animation: pulse-ring 2s ease-in-out infinite;
        }

        @keyframes pulse-ring {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.7; }
        }

        .nav-icon {
          font-size: 22px;
          position: relative;
          z-index: 1;
        }

        .nav-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.03em;
          position: relative;
          z-index: 1;
        }

        /* ============ SCROLLBAR ============ */
        ::-webkit-scrollbar {
          width: 6px;
        }

        ::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }

        ::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(34, 211, 238, 0.5), rgba(251, 146, 60, 0.5));
          border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(34, 211, 238, 0.7), rgba(251, 146, 60, 0.7));
        }
      `}</style>
    </div>
  );
}
