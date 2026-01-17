'use client'

import React, { useState, useMemo } from 'react';

export default function MusicStudioPremium() {
  const [genre, setGenre] = useState('Alt Rock');
  const [mood, setMood] = useState('Energetic');
  const [voiceMode, setVoiceMode] = useState('AI');
  const [visualEnabled, setVisualEnabled] = useState(true);
  const [visualStyle, setVisualStyle] = useState('Cyberpunk');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [lyrics, setLyrics] = useState("Chasing dreams, running through the night.\nA spark in the heart, burning so bright.");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState('Chorus');

  const handleGenerate = () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    
    // Simulate generation progress
    const interval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsGenerating(false);
            setGenerationProgress(0);
          }, 500);
          return 100;
        }
        return prev + 2;
      });
    }, 50);
  };

  const handleSmartSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 2500);
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
        {/* Stars */}
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
        
        {/* Fire Embers */}
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
            <button className="back-button glass-element neon-outline">← Back</button>
            <div className="credit-badge glass-element neon-outline">
              <span className="credit-icon">✦</span>
              <span>100 Credits</span>
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
              🎸 Alt Rock
            </button>
            <button 
              className={`chip-button glass-element neon-outline ${genre === 'Pop' ? 'active' : ''}`}
              onClick={() => setGenre('Pop')}>
              🎹 Pop
            </button>
            <button 
              className={`chip-button glass-element neon-outline ${mood === 'Energetic' ? 'active' : ''}`}
              onClick={() => setMood('Energetic')}>
              ⚡ Energetic
            </button>
          </div>
        </div>

        {/* Lyrics Input */}
        <div className="glass-card neon-outline section-card">
          <div className="card-header">
            <h3 className="section-title">Lyrics & Vision</h3>
            <button 
              className={`sync-button glass-element neon-outline ${isSyncing ? 'syncing' : ''}`}
              onClick={handleSmartSync}
              disabled={isSyncing}>
              {isSyncing ? '⚡ Syncing...' : '✨ Smart Sync'}
            </button>
          </div>
          <textarea
            className="lyrics-input glass-element neon-outline"
            placeholder="Enter your lyrics or musical vision..."
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
          />
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
              className={`mode-button glass-element neon-outline ${voiceMode === 'MY' ? 'active' : ''}`}
              onClick={() => setVoiceMode('MY')}>
              Your Voice
            </button>
          </div>

          <div className="timeline-strip">
            {['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro'].map((segment, idx) => (
              <button
                key={segment}
                className={`timeline-segment glass-element ${selectedSegment === segment ? 'active' : ''}`}
                onClick={() => setSelectedSegment(segment)}>
                <span className="segment-label">{segment}</span>
                <div className={`segment-bar ${selectedSegment === segment ? 'active' : ''}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Equipment Preview */}
        <div className="glass-card neon-outline section-card preview-card">
          <h3 className="section-title">Studio Equipment</h3>
          <div className="equipment-display">
            <div className="retro-equipment">
              {/* Vintage tape reel icon representation */}
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
          padding: 8px 16px;
          border-radius: 12px;
          border: none;
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .back-button:hover {
          transform: translateX(-2px);
          box-shadow: 
            0 0 30px rgba(34, 211, 238, 0.4),
            0 0 50px rgba(251, 146, 60, 0.3);
        }

        .credit-badge {
          padding: 8px 16px;
          border-radius: 20px;
          border: none;
          display: flex;
          align-items: center;
          gap: 6px;
          color: rgba(255, 255, 255, 0.95);
          font-size: 14px;
          font-weight: 600;
        }

        .credit-icon {
          color: #fbbf24;
          font-size: 16px;
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

        .section-card:nth-child(1) { animation-delay: 0.1s; }
        .section-card:nth-child(2) { animation-delay: 0.2s; }
        .section-card:nth-child(3) { animation-delay: 0.3s; }
        .section-card:nth-child(4) { animation-delay: 0.4s; }

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
        }

        .chip-button {
          padding: 10px 18px;
          border-radius: 16px;
          border: none;
          color: rgba(255, 255, 255, 0.85);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
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

        .sync-button {
          padding: 8px 16px;
          border-radius: 12px;
          border: none;
          color: rgba(255, 255, 255, 0.9);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
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
        .lyrics-input {
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

        .lyrics-input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .lyrics-input:focus {
          box-shadow: 
            0 0 40px rgba(34, 211, 238, 0.5),
            0 0 60px rgba(251, 146, 60, 0.3),
            inset 0 0 30px rgba(255, 255, 255, 0.05);
        }

        /* ============ VOICE MODE ============ */
        .voice-mode-selector {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }

        .mode-button {
          flex: 1;
          padding: 12px;
          border-radius: 14px;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          font-size: 14px;
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
        }

        .timeline-segment {
          flex: 1;
          min-width: 70px;
          padding: 10px 12px;
          border-radius: 12px;
          text-align: center;
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .timeline-segment:hover {
          transform: translateY(-2px);
        }

        .timeline-segment.active {
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
