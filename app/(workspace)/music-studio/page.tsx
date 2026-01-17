'use client'

import React, { useState, useMemo } from 'react';

export default function MusicStudioPremium() {
  const [genre, setGenre] = useState('Alt Rock');
  const [mood, setMood] = useState('Energetic');
  const [voiceMode, setVoiceMode] = useState('AI');
  const [visualEnabled, setVisualEnabled] = useState(true);
  const [visualStyle, setVisualStyle] = useState('Cyberpunk');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [syncGlow, setSyncGlow] = useState(false);

  const handleSmartSync = () => {
    setSyncGlow(true);
    setTimeout(() => setSyncGlow(false), 2800);
  };

  // Stable star particles (no random jitter per render)
  const starParticles = useMemo(() => {
    return [...Array(50)].map((_, i) => ({
      id: i,
      width: (i % 5) * 0.6 + 1,
      height: (i % 5) * 0.6 + 1,
      left: ((i * 37) % 100),
      top: ((i * 73) % 100),
      background: i % 3 === 0 ? 'rgba(168, 85, 247, 0.3)' : 
                 i % 3 === 1 ? 'rgba(236, 72, 153, 0.25)' : 
                 'rgba(59, 130, 246, 0.2)',
      shadowSize: (i % 7) + 4,
      shadowOpacity: (i % 5) * 0.08 + 0.2,
      duration: (i % 8) * 2 + 15,
      delay: (i % 10) * 0.5
    }));
  }, []);

  return (
    <div className="app-container">
      {/* Stable floating star particles */}
      <div className="particles-container">
        {starParticles.map((star) => (
          <div
            key={star.id}
            className="star-particle"
            style={{
              width: star.width + 'px',
              height: star.height + 'px',
              left: star.left + '%',
              top: star.top + '%',
              background: star.background,
              boxShadow: `0 0 ${star.shadowSize}px rgba(168, 85, 247, ${star.shadowOpacity})`,
              animation: `float ${star.duration}s linear infinite`,
              animationDelay: star.delay + 's'
            }}
          />
        ))}
      </div>

      {/* Main Container */}
      <div className="main-container">
        
        {/* Premium Header with Horizontal Band Glow */}
        <div className="header-section">
          {/* Wide horizontal purple "band glow" - aurora bar effect */}
          <div className="band-glow-outer" />
          <div className="band-glow-inner" />
          
          <h1 className="main-title">Music Studio</h1>
          <p className="subtitle">Neural Audio-Visual Lab</p>
        </div>

        {/* Main Card */}
        <div className="glass-card">
          
          {/* Project Setup */}
          <div className="section">
            <div className="section-header">
              <h3 className="section-title">Project Setup</h3>
              <button className="explore-button">Explore Genres →</button>
            </div>
            <div className="chips-container">
              <div className="chip chip-purple">
                <span className="chip-icon">🎸</span>
                {genre}
              </div>
              <div className="chip chip-blue">
                <span className="chip-icon">🎹</span>
                Cello, Synth
              </div>
              <div className="chip chip-pink">
                <span className="chip-icon">⚡</span>
                {mood}
              </div>
            </div>
          </div>

          {/* Lyrics Section with Horizontal Sync Bridge */}
          <div className="section lyrics-section">
            <div className="lyrics-header">
              <h3 className="section-title">Lyrics / Idea</h3>
              
              {/* Horizontal Sync Bridge */}
              {syncGlow && (
                <div className="sync-bridge">
                  <div className="sync-bridge-line" />
                  <div className="sync-flare sync-flare-left" />
                  <div className="sync-flare sync-flare-right" />
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="sync-sparkle"
                      style={{
                        left: `${20 + i * 20}%`,
                        animationDelay: `${i * 0.2}s`
                      }}
                    />
                  ))}
                </div>
              )}
              
              <button onClick={handleSmartSync} className="smart-sync-button">
                <span className="smart-sync-icon">✨</span>
                Smart Sync
              </button>
            </div>
            
            <div className="textarea-wrapper">
              <textarea
                className="lyrics-textarea"
                placeholder="Enter your lyrics or musical idea..."
                defaultValue="Chasing dreams, running through the night.&#10;A spark in the heart, burning so bright."
              />
              <button className="clear-button">✕</button>
            </div>
          </div>

          {/* Description Section */}
          <div className="section">
            <h3 className="section-title">Music Vibe & Scene Description</h3>
            <textarea
              className="description-textarea"
              placeholder="Describe mood, pacing, instruments, scene..."
              defaultValue="Starts slow with Georgian chonguri, then turns into energetic alt-rock chorus."
            />
          </div>

          {/* Melody & Voice Section */}
          <div className="section melody-section">
            <button className="melody-button">
              <span className="melody-icon">🎤</span>
              Capture My Melody
            </button>
            <div className="voice-info">
              <p className="voice-connected">Connected: Giorgi Voice v1</p>
              <a href="#" className="voice-link">Go to Voice Lab →</a>
            </div>
          </div>

          {/* Compact Timeline with Progress Line */}
          <div className="section">
            <h3 className="section-title">Timeline</h3>
            <div className="timeline-wrapper">
              <div className="timeline-segments">
                {['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Outro'].map((segment) => (
                  <div key={segment} className="timeline-segment">
                    {segment}
                  </div>
                ))}
              </div>
              <div className="timeline-progress-track">
                <div className="timeline-progress-bar" />
              </div>
            </div>
          </div>

          {/* Voice Mode Section */}
          <div className="section">
            <h3 className="section-title">Voice Mode</h3>
            <div className="voice-mode-buttons">
              <button
                onClick={() => setVoiceMode('AI')}
                className={`voice-mode-button ${voiceMode === 'AI' ? 'active' : ''}`}>
                AI Voice
              </button>
              <button
                onClick={() => setVoiceMode('MY')}
                className={`voice-mode-button ${voiceMode === 'MY' ? 'active' : ''}`}>
                Use My Voice
              </button>
            </div>
            {voiceMode === 'AI' && (
              <select className="voice-select">
                <option>Neutral</option>
                <option>Pop</option>
                <option>Rap</option>
                <option>Cinematic</option>
              </select>
            )}
          </div>

          {/* Visual Alchemist with Horizontal Scrollable Pills */}
          <div className="section">
            <div className="visual-header">
              <h3 className="section-title">Visual Alchemist</h3>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={visualEnabled}
                  onChange={(e) => setVisualEnabled(e.target.checked)}
                  className="toggle-input"
                />
                <div className={`toggle ${visualEnabled ? 'active' : ''}`} />
              </label>
            </div>
            
            {visualEnabled && (
              <>
                {/* Single horizontal scrollable pill row */}
                <div className="visual-pills-scroll">
                  {['Cinematic', 'Cyberpunk', 'Abstract', 'Retro', 'Minimal', 'Noir'].map((style) => (
                    <button
                      key={style}
                      onClick={() => setVisualStyle(style)}
                      className={`visual-pill ${visualStyle === style ? 'active' : ''}`}>
                      {style}
                    </button>
                  ))}
                </div>
                
                {/* Animated Nebula Preview */}
                <div className="visual-preview">
                  <div className="nebula-layer nebula-layer-1" />
                  <div className="nebula-layer nebula-layer-2" />
                  <div className="nebula-layer nebula-layer-3" />
                  <div className="shimmer-overlay" />
                  
                  <div className="preview-content">
                    <div className="preview-circle" />
                    <p className="preview-text">Cover Preview</p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Advanced Section */}
          <div className="section">
            <button
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="advanced-button">
              <span className="advanced-label">
                <span className="advanced-icon">⚙️</span>
                Advanced
              </span>
              <span className={`advanced-chevron ${advancedOpen ? 'open' : ''}`}>▼</span>
            </button>
            
            {advancedOpen && (
              <div className="advanced-panel">
                <p className="advanced-text">
                  🎛️ Vibe Switcher, Auto-Mix Controls, Collaboration Links — Coming Soon!
                </p>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button className="generate-button">
            <span className="generate-content">
              Generate Track
              <span className="generate-arrow">→</span>
            </span>
          </button>
        </div>
      </div>

      {/* Floating Chat Button */}
      <button className="chat-button">💬</button>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        /* Reset and Base */
        * {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        /* App Container */
        .app-container {
          min-height: 100vh;
          width: 100%;
          overflow: auto;
          background: radial-gradient(ellipse at top, rgba(88, 28, 135, 0.35), transparent 65%), 
                      radial-gradient(ellipse at bottom, rgba(30, 58, 138, 0.25), transparent 65%), 
                      #0a0a0f;
        }

        /* Particles */
        .particles-container {
          position: fixed;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }

        .star-particle {
          position: absolute;
          border-radius: 50%;
          will-change: transform;
        }

        /* Main Container */
        .main-container {
          position: relative;
          max-width: 448px;
          margin: 0 auto;
          padding: 40px 20px 112px;
        }

        /* Header Section */
        .header-section {
          text-align: center;
          margin-bottom: 48px;
          position: relative;
        }

        .band-glow-outer {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 120%;
          height: 128px;
          background: linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.4) 20%, rgba(168, 85, 247, 0.5) 50%, rgba(139, 92, 246, 0.4) 80%, transparent);
          filter: blur(40px);
          opacity: 0.6;
          animation: band-pulse 6s ease-in-out infinite;
        }

        .band-glow-inner {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 100%;
          height: 80px;
          background: linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.6) 30%, rgba(236, 72, 153, 0.4) 50%, rgba(168, 85, 247, 0.6) 70%, transparent);
          filter: blur(30px);
          opacity: 0.5;
        }

        .main-title {
          position: relative;
          font-size: 48px;
          font-weight: 700;
          margin-bottom: 12px;
          background: linear-gradient(to right, rgba(216, 180, 254, 1), rgba(233, 213, 255, 1), rgba(191, 219, 254, 1));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow: 0 0 80px rgba(168, 85, 247, 0.9), 0 0 40px rgba(236, 72, 153, 0.5);
          letter-spacing: 0.02em;
          line-height: 1.2;
        }

        .subtitle {
          position: relative;
          font-size: 10px;
          color: rgba(216, 180, 254, 0.5);
          font-weight: 300;
          letter-spacing: 0.3em;
          text-transform: uppercase;
        }

        /* Glass Card */
        .glass-card {
          background: rgba(15, 15, 25, 0.75);
          backdrop-filter: blur(28px);
          border: 1px solid rgba(139, 92, 246, 0.25);
          border-radius: 32px;
          padding: 28px;
          box-shadow: 
            0 12px 48px rgba(0, 0, 0, 0.5),
            0 4px 16px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            inset 0 -1px 0 rgba(255, 255, 255, 0.02);
        }

        /* Section */
        .section {
          margin-bottom: 28px;
        }

        .section:last-child {
          margin-bottom: 0;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .section-title {
          font-size: 14px;
          font-weight: 600;
          color: rgba(233, 213, 255, 1);
        }

        /* Explore Button */
        .explore-button {
          padding: 6px 12px;
          font-size: 12px;
          border-radius: 9999px;
          background: rgba(139, 92, 246, 0.12);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(139, 92, 246, 0.25);
          color: rgba(216, 180, 254, 1);
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .explore-button:hover {
          background: rgba(139, 92, 246, 0.22);
          border-color: rgba(139, 92, 246, 0.45);
          color: rgba(233, 213, 255, 1);
          box-shadow: 0 4px 20px rgba(139, 92, 246, 0.25);
          transform: translateY(-1px);
        }

        /* Chips */
        .chips-container {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .chip {
          padding: 9px 18px;
          border-radius: 24px;
          font-size: 13px;
          font-weight: 500;
          backdrop-filter: blur(14px);
          border: 1px solid;
          display: inline-flex;
          align-items: center;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .chip-icon {
          font-size: 18px;
          margin-right: 6px;
        }

        .chip-purple {
          background: rgba(139, 92, 246, 0.25);
          border-color: rgba(139, 92, 246, 0.4);
          color: rgba(196, 181, 253, 1);
          box-shadow: 0 2px 12px rgba(139, 92, 246, 0.25);
        }

        .chip-purple:hover {
          background: rgba(139, 92, 246, 0.32);
          box-shadow: 0 4px 16px rgba(139, 92, 246, 0.35);
          transform: translateY(-1px);
        }

        .chip-blue {
          background: rgba(59, 130, 246, 0.25);
          border-color: rgba(59, 130, 246, 0.4);
          color: rgba(147, 197, 253, 1);
          box-shadow: 0 2px 12px rgba(59, 130, 246, 0.25);
        }

        .chip-blue:hover {
          background: rgba(59, 130, 246, 0.32);
          box-shadow: 0 4px 16px rgba(59, 130, 246, 0.35);
          transform: translateY(-1px);
        }

        .chip-pink {
          background: rgba(236, 72, 153, 0.25);
          border-color: rgba(236, 72, 153, 0.4);
          color: rgba(251, 207, 232, 1);
          box-shadow: 0 2px 12px rgba(236, 72, 153, 0.25);
        }

        .chip-pink:hover {
          background: rgba(236, 72, 153, 0.32);
          box-shadow: 0 4px 16px rgba(236, 72, 153, 0.35);
          transform: translateY(-1px);
        }

        /* Lyrics Section */
        .lyrics-section {
          position: relative;
        }

        .lyrics-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          position: relative;
        }

        /* Sync Bridge */
        .sync-bridge {
          position: absolute;
          left: 100px;
          right: 120px;
          top: 50%;
          transform: translateY(-50%);
          height: 2px;
          z-index: 10;
          animation: fadeOut 2.8s ease-out forwards;
        }

        .sync-bridge-line {
          position: absolute;
          inset: 0;
          background: linear-gradient(to right, rgb(168, 85, 247), rgb(244, 114, 182), rgb(59, 130, 246));
          box-shadow: 0 0 20px rgba(168, 85, 247, 0.9), 0 0 40px rgba(236, 72, 153, 0.6);
          filter: brightness(1.5);
        }

        .sync-flare {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: pulse 0.5s ease-in-out infinite alternate;
        }

        .sync-flare-left {
          left: 0;
          background: rgb(192, 132, 252);
          box-shadow: 0 0 12px rgba(168, 85, 247, 1), 0 0 24px rgba(168, 85, 247, 0.8);
        }

        .sync-flare-right {
          right: 0;
          background: rgb(96, 165, 250);
          box-shadow: 0 0 12px rgba(59, 130, 246, 1), 0 0 24px rgba(59, 130, 246, 0.8);
        }

        .sync-sparkle {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: white;
          opacity: 0;
          animation: sparkle 1s ease-in-out infinite;
        }

        /* Smart Sync Button */
        .smart-sync-button {
          padding: 6px 12px;
          font-size: 12px;
          border-radius: 9999px;
          background: rgba(139, 92, 246, 0.28);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(139, 92, 246, 0.45);
          color: rgba(216, 180, 254, 1);
          cursor: pointer;
          position: relative;
          z-index: 20;
          transition: all 0.3s ease;
          box-shadow: 
            0 4px 28px rgba(139, 92, 246, 0.35),
            0 2px 12px rgba(168, 85, 247, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
        }

        .smart-sync-button:hover {
          background: rgba(139, 92, 246, 0.35);
          border-color: rgba(139, 92, 246, 0.6);
          color: rgba(233, 213, 255, 1);
          box-shadow: 
            0 6px 32px rgba(139, 92, 246, 0.45),
            0 3px 16px rgba(168, 85, 247, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.15);
          transform: translateY(-1px);
        }

        .smart-sync-icon {
          margin-right: 4px;
        }

        /* Textareas */
        .textarea-wrapper {
          position: relative;
        }

        .lyrics-textarea,
        .description-textarea {
          width: 100%;
          background: rgba(10, 10, 20, 0.85);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(139, 92, 246, 0.25);
          border-radius: 18px;
          padding: 14px 18px;
          color: rgba(255, 255, 255, 0.92);
          font-size: 14px;
          line-height: 1.5;
          resize: none;
          outline: none;
          transition: all 0.3s ease;
        }

        .lyrics-textarea {
          height: 112px;
        }

        .description-textarea {
          height: 96px;
        }

        .lyrics-textarea::placeholder,
        .description-textarea::placeholder {
          color: rgba(168, 139, 230, 0.45);
        }

        .lyrics-textarea:focus,
        .description-textarea:focus {
          border-color: rgba(139, 92, 246, 0.6);
          background: rgba(10, 10, 20, 0.9);
          box-shadow: 
            0 0 0 3px rgba(139, 92, 246, 0.15),
            0 4px 20px rgba(139, 92, 246, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }

        .clear-button {
          position: absolute;
          bottom: 12px;
          right: 12px;
          padding: 6px;
          border-radius: 8px;
          background: rgba(139, 92, 246, 0.12);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(139, 92, 246, 0.25);
          color: rgba(216, 180, 254, 0.6);
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .clear-button:hover {
          color: rgba(233, 213, 255, 1);
          background: rgba(139, 92, 246, 0.22);
        }

        /* Melody Section */
        .melody-section {
          text-align: center;
        }

        .melody-button {
          width: 100%;
          padding: 20px;
          border-radius: 16px;
          background: rgba(139, 92, 246, 0.28);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(139, 92, 246, 0.45);
          color: rgba(233, 213, 255, 1);
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 
            0 4px 28px rgba(139, 92, 246, 0.35),
            0 2px 12px rgba(168, 85, 247, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
        }

        .melody-button:hover {
          transform: scale(1.02);
          box-shadow: 
            0 6px 32px rgba(139, 92, 246, 0.45),
            0 3px 16px rgba(168, 85, 247, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.15);
        }

        .melody-icon {
          font-size: 24px;
          margin-right: 8px;
        }

        .voice-info {
          margin-top: 16px;
          font-size: 14px;
        }

        .voice-connected {
          color: rgba(216, 180, 254, 1);
          font-weight: 500;
          margin-bottom: 4px;
        }

        .voice-link {
          color: rgba(192, 132, 252, 0.6);
          font-size: 12px;
          text-decoration: underline;
          transition: color 0.3s ease;
        }

        .voice-link:hover {
          color: rgba(216, 180, 254, 1);
        }

        /* Timeline */
        .timeline-wrapper {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .timeline-segments {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 8px;
        }

        .timeline-segment {
          flex: 1;
          min-width: 70px;
          padding: 8px 12px;
          background: rgba(139, 92, 246, 0.12);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(139, 92, 246, 0.2);
          border-radius: 16px;
          font-size: 10px;
          font-weight: 500;
          text-align: center;
          color: rgba(196, 181, 253, 0.8);
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .timeline-segment:hover {
          background: rgba(139, 92, 246, 0.18);
          border-color: rgba(139, 92, 246, 0.3);
          color: rgba(196, 181, 253, 1);
        }

        .timeline-progress-track {
          width: 100%;
          height: 4px;
          border-radius: 9999px;
          background: rgba(59, 27, 90, 0.4);
          overflow: hidden;
        }

        .timeline-progress-bar {
          height: 100%;
          width: 35%;
          background: linear-gradient(to right, rgb(168, 85, 247), rgb(236, 72, 153), rgb(59, 130, 246));
          border-radius: 9999px;
          box-shadow: 0 0 12px rgba(168, 85, 247, 0.7), 0 0 6px rgba(236, 72, 153, 0.5);
          transition: width 1s ease;
        }

        /* Voice Mode */
        .voice-mode-buttons {
          display: flex;
          gap: 10px;
          margin-bottom: 12px;
        }

        .voice-mode-button {
          flex: 1;
          padding: 12px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 500;
          background: rgba(139, 92, 246, 0.12);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(139, 92, 246, 0.25);
          color: rgba(192, 132, 252, 0.6);
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .voice-mode-button:hover {
          background: rgba(139, 92, 246, 0.22);
          border-color: rgba(139, 92, 246, 0.45);
        }

        .voice-mode-button.active {
          background: rgba(139, 92, 246, 0.28);
          border-color: rgba(139, 92, 246, 0.45);
          color: rgba(233, 213, 255, 1);
          box-shadow: 
            0 4px 28px rgba(139, 92, 246, 0.35),
            0 2px 12px rgba(168, 85, 247, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
        }

        .voice-select {
          width: 100%;
          padding: 12px;
          background: rgba(10, 10, 20, 0.85);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(139, 92, 246, 0.25);
          border-radius: 18px;
          color: rgba(255, 255, 255, 0.92);
          font-size: 14px;
          outline: none;
          cursor: pointer;
        }

        .voice-select:focus {
          border-color: rgba(139, 92, 246, 0.6);
          box-shadow: 
            0 0 0 3px rgba(139, 92, 246, 0.15),
            0 4px 20px rgba(139, 92, 246, 0.25);
        }

        /* Visual Alchemist */
        .visual-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .toggle-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .toggle-input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }

        .toggle {
          width: 48px;
          height: 26px;
          background: rgba(139, 92, 246, 0.15);
          border: 1px solid rgba(139, 92, 246, 0.35);
          border-radius: 13px;
          position: relative;
          transition: all 0.3s ease;
        }

        .toggle::after {
          content: '';
          position: absolute;
          width: 20px;
          height: 20px;
          background: rgba(168, 139, 230, 0.7);
          border-radius: 50%;
          top: 2px;
          left: 2px;
          transition: all 0.3s ease;
          box-shadow: 0 2px 10px rgba(139, 92, 246, 0.5);
        }

        .toggle.active {
          background: rgba(139, 92, 246, 0.45);
          border-color: rgba(168, 85, 247, 0.7);
          box-shadow: 0 0 16px rgba(139, 92, 246, 0.4);
        }

        .toggle.active::after {
          left: 24px;
          background: rgba(196, 181, 253, 1);
          box-shadow: 
            0 2px 14px rgba(139, 92, 246, 0.7),
            0 0 8px rgba(168, 85, 247, 0.5);
        }

        /* Visual Pills - Horizontal Scroll Row */
        .visual-pills-scroll {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 8px;
          margin-bottom: 16px;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .visual-pills-scroll::-webkit-scrollbar {
          display: none;
        }

        .visual-pill {
          padding: 10px 20px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          background: rgba(139, 92, 246, 0.12);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(139, 92, 246, 0.25);
          color: rgba(192, 132, 252, 0.6);
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .visual-pill:hover {
          background: rgba(139, 92, 246, 0.22);
          border-color: rgba(139, 92, 246, 0.45);
        }

        .visual-pill.active {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.7), rgba(236, 72, 153, 0.6));
          border: 1.5px solid rgba(168, 85, 247, 0.9);
          color: rgba(255, 255, 255, 0.98);
          box-shadow: 
            0 0 24px rgba(168, 85, 247, 0.7),
            0 0 48px rgba(236, 72, 153, 0.4),
            0 4px 16px rgba(139, 92, 246, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.25),
            inset 0 0 20px rgba(168, 85, 247, 0.3);
        }

        /* Visual Preview */
        .visual-preview {
          position: relative;
          overflow: hidden;
          border-radius: 24px;
          aspect-ratio: 16 / 9;
          background: rgba(10, 10, 20, 0.65);
          backdrop-filter: blur(18px);
          border: 1px solid rgba(139, 92, 246, 0.18);
        }

        .nebula-layer {
          position: absolute;
          inset: 0;
        }

        .nebula-layer-1 {
          background: radial-gradient(ellipse at 30% 40%, rgba(139, 92, 246, 0.5), rgba(168, 85, 247, 0.3) 40%, transparent 65%);
          animation: nebula-drift-1 25s ease-in-out infinite;
        }

        .nebula-layer-2 {
          background: radial-gradient(ellipse at 70% 60%, rgba(236, 72, 153, 0.4), rgba(219, 39, 119, 0.25) 35%, transparent 60%);
          animation: nebula-drift-2 30s ease-in-out infinite;
        }

        .nebula-layer-3 {
          background: radial-gradient(ellipse at 50% 30%, rgba(59, 130, 246, 0.45), rgba(96, 165, 250, 0.3) 40%, transparent 75%);
          animation: nebula-drift-1 35s ease-in-out infinite reverse;
        }

        .shimmer-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.04),
            rgba(168, 85, 247, 0.02),
            transparent
          );
          animation: shimmer 10s ease-in-out infinite;
        }

        .preview-content {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          z-index: 10;
        }

        .preview-circle {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(to bottom right, rgba(192, 132, 252, 0.2), rgba(244, 114, 182, 0.2));
          backdrop-filter: blur(4px);
          border: 1px solid rgba(192, 132, 252, 0.3);
          animation: pulse-slow 4s ease-in-out infinite;
        }

        .preview-text {
          font-size: 12px;
          color: rgba(233, 213, 255, 0.5);
          font-weight: 300;
          letter-spacing: 0.05em;
        }

        /* Advanced Section */
        .advanced-button {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          border-radius: 16px;
          background: rgba(139, 92, 246, 0.12);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(139, 92, 246, 0.25);
          color: rgba(216, 180, 254, 1);
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .advanced-button:hover {
          background: rgba(139, 92, 246, 0.22);
          border-color: rgba(139, 92, 246, 0.45);
          color: rgba(233, 213, 255, 1);
        }

        .advanced-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 500;
        }

        .advanced-chevron {
          transition: transform 0.3s ease;
        }

        .advanced-chevron.open {
          transform: rotate(180deg);
        }

        .advanced-panel {
          margin-top: 12px;
          padding: 20px;
          background: rgba(10, 10, 20, 0.65);
          backdrop-filter: blur(18px);
          border: 1px solid rgba(139, 92, 246, 0.18);
          border-radius: 16px;
          animation: fadeIn 0.3s ease;
        }

        .advanced-text {
          font-size: 12px;
          color: rgba(216, 180, 254, 0.7);
        }

        /* Generate Button */
        .generate-button {
          width: 100%;
          padding: 24px;
          border-radius: 24px;
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.85), rgba(59, 130, 246, 0.85));
          border: 1px solid rgba(168, 85, 247, 0.6);
          color: white;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
          box-shadow: 
            0 10px 40px rgba(139, 92, 246, 0.5),
            0 4px 16px rgba(59, 130, 246, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.25),
            inset 0 -1px 0 rgba(0, 0, 0, 0.1);
        }

        .generate-button::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.4), rgba(99, 102, 241, 0.4));
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .generate-button:hover {
          transform: translateY(-3px);
          box-shadow: 
            0 16px 52px rgba(139, 92, 246, 0.6),
            0 8px 24px rgba(59, 130, 246, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.35);
        }

        .generate-button:hover::before {
          opacity: 1;
        }

        .generate-content {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .generate-arrow {
          transition: transform 0.3s ease;
        }

        .generate-button:hover .generate-arrow {
          transform: translateX(4px);
        }

        /* Chat Button */
        .chat-button {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.95), rgba(59, 130, 246, 0.95));
          backdrop-filter: blur(16px);
          border: 1px solid rgba(168, 85, 247, 0.6);
          font-size: 24px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 
            0 10px 40px rgba(139, 92, 246, 0.6),
            0 4px 16px rgba(59, 130, 246, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chat-button:hover {
          transform: scale(1.12);
          box-shadow: 
            0 14px 52px rgba(139, 92, 246, 0.7),
            0 6px 24px rgba(59, 130, 246, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.35);
        }

        /* Animations */
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); }
          33% { transform: translateY(-20px) translateX(10px); }
          66% { transform: translateY(-10px) translateX(-10px); }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0); }
          50% { opacity: 1; transform: scale(1.5); }
        }

        @keyframes pulse {
          from { opacity: 0.6; }
          to { opacity: 1; }
        }

        @keyframes pulse-slow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }

        @keyframes nebula-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(10%, -5%) scale(1.1); }
          66% { transform: translate(-5%, 10%) scale(0.95); }
        }

        @keyframes nebula-drift-2 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(-8%, 8%) rotate(180deg); }
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        @keyframes fadeOut {
          0% { opacity: 1; }
          75% { opacity: 1; }
          100% { opacity: 0; }
        }

        @keyframes band-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.7; }
        }

        /* Custom Scrollbar */
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }

        ::-webkit-scrollbar-track {
          background: rgba(139, 92, 246, 0.05);
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(139, 92, 246, 0.3);
          border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.5);
        }
      `}</style>
    </div>
  );
}
