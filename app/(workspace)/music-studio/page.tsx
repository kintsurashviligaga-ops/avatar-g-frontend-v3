'use client'

import React, { useState, useEffect } from 'react';

export default function MusicStudioPage() {
  const [isClient, setIsClient] = useState(false);
  const [hasError, setHasError] = useState(false);
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

  // Client-side mounting
  useEffect(() => {
    console.log('🎵 Music Studio - Component Mounting...');
    try {
      setIsClient(true);
      console.log('✅ Music Studio - Mounted Successfully');
    } catch (error) {
      console.error('❌ Music Studio - Mount Error:', error);
      setHasError(true);
    }
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

  // Error State
  if (hasError) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#050B2A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ef4444',
        fontSize: '16px',
        fontFamily: 'Inter, sans-serif',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
          <div>Error Loading Music Studio</div>
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '12px 24px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer'
            }}>
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  // Loading State
  if (!isClient) {
    return (
      <div style={{
        minHeight: '100vh',
        width: '100%',
        background: 'linear-gradient(180deg, #050B2A 0%, #0B1445 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: '16px',
        fontFamily: 'Inter, sans-serif',
        gap: '24px'
      }}>
        <div style={{
          fontSize: '64px',
          animation: 'pulse 2s ease-in-out infinite'
        }}>🎵</div>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid rgba(34, 211, 238, 0.3)',
          borderTopColor: '#22D3EE',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{ fontSize: '18px', fontWeight: '600' }}>Loading Music Studio...</div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.1); }
          }
        `}</style>
      </div>
    );
  }

  // Main Content - Only renders after client mount
  return (
    <>
      <div className="music-studio-root">
        {/* Background */}
        <div className="cosmic-bg">
          <div className="nebula"></div>
          
          {/* Simplified Stars - Only 30 */}
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="star"
              style={{
                width: (i % 3) + 1 + 'px',
                height: (i % 3) + 1 + 'px',
                left: ((i * 47) % 100) + '%',
                top: ((i * 83) % 100) + '%',
                opacity: (i % 5) * 0.15 + 0.3,
                animationDelay: (i % 8) * 0.5 + 's'
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="content">
          
          {/* Header */}
          <header className="header">
            <div className="header-top">
              <button className="btn-back" onClick={() => window.history.back()}>
                <span>←</span>
                <span>Back</span>
              </button>
              <div className="credits">
                <span className="credits-icon">✦</span>
                <span className="credits-num">{credits}</span>
                <span className="credits-label">Credits</span>
              </div>
            </div>
            <h1 className="title">Music Studio</h1>
            <p className="subtitle">Neural Audio Production Lab</p>
          </header>

          {/* Project Setup */}
          <section className="card">
            <h3 className="card-title">
              <span>🎚️</span>
              <span>Project Setup</span>
            </h3>
            <div className="chips">
              <button 
                className={`chip ${genre === 'Alt Rock' ? 'active' : ''}`}
                onClick={() => setGenre('Alt Rock')}>
                <span>🎸</span>
                <span>Alt Rock</span>
              </button>
              <button 
                className={`chip ${instruments === 'Cello, Synth' ? 'active' : ''}`}
                onClick={() => setInstruments('Cello, Synth')}>
                <span>🎹</span>
                <span>Cello, Synth</span>
              </button>
              <button 
                className={`chip ${mood === 'Energetic' ? 'active' : ''}`}
                onClick={() => setMood('Energetic')}>
                <span>⚡</span>
                <span>Energetic</span>
              </button>
            </div>
            <button className="btn-primary">
              <span>Explore Genres</span>
              <span>→</span>
            </button>
          </section>

          {/* Lyrics */}
          <section className="card">
            <div className="card-header">
              <h3 className="card-title">
                <span>✍️</span>
                <span>Lyrics & Vision</span>
              </h3>
              <button 
                className={`btn-sync ${isSyncing ? 'syncing' : ''}`}
                onClick={handleSmartSync}
                disabled={isSyncing}>
                <span>✨</span>
                <span>{isSyncing ? 'Syncing...' : 'Smart Sync'}</span>
              </button>
            </div>
            <textarea
              className="input-text"
              placeholder="Enter your lyrics or musical vision..."
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
            />
          </section>

          {/* Description */}
          <section className="card">
            <h3 className="card-title">
              <span>🌌</span>
              <span>Music Vibe & Scene</span>
            </h3>
            <textarea
              className="input-text short"
              placeholder="Describe the mood, instruments, and atmosphere..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </section>

          {/* Capture Melody */}
          <section className="card">
            <h3 className="card-title">
              <span>🎤</span>
              <span>Capture My Melody</span>
            </h3>
            <button 
              className={`btn-melody ${isRecording ? 'recording' : ''}`}
              onClick={handleCaptureMelody}>
              <div className="mic">🎤</div>
              <span>{isRecording ? 'Stop Recording' : 'Capture My Melody'}</span>
            </button>
            <div className="status">
              <span className="status-dot"></span>
              <span>Connected: Giorgi Voice v1</span>
            </div>
            <button className="link">
              <span>Go to Voice Lab</span>
              <span>→</span>
            </button>
          </section>

          {/* Visual Alchemist */}
          <section className="card">
            <div className="card-header">
              <h3 className="card-title">
                <span>🎨</span>
                <span>Visual Alchemist</span>
              </h3>
              <label className="toggle">
                <input 
                  type="checkbox" 
                  checked={visualEnabled}
                  onChange={() => setVisualEnabled(!visualEnabled)}
                />
                <span className="toggle-track"></span>
              </label>
            </div>
            
            {visualEnabled && (
              <>
                <div className="pills">
                  {['Cinematic', 'Cyberpunk', 'Abstract', 'Retro'].map((style) => (
                    <button
                      key={style}
                      className={`pill ${visualStyle === style ? 'active' : ''}`}
                      onClick={() => setVisualStyle(style)}>
                      {style}
                    </button>
                  ))}
                </div>
                <div className="preview">
                  <span>Album Art Preview</span>
                </div>
              </>
            )}
          </section>

          {/* Voice & Timeline */}
          <section className="card">
            <h3 className="card-title">
              <span>🎙️</span>
              <span>Voice & Timeline</span>
            </h3>
            
            <div className="mode-selector">
              <button 
                className={`mode ${voiceMode === 'AI' ? 'active' : ''}`}
                onClick={() => setVoiceMode('AI')}>
                AI Voice
              </button>
              <button 
                className={`mode ${voiceMode === 'YOUR' ? 'active' : ''}`}
                onClick={() => setVoiceMode('YOUR')}>
                Your Voice
              </button>
            </div>

            <div className="timeline">
              {['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Outro'].map((seg) => (
                <button
                  key={seg}
                  className={`segment ${selectedSegment === seg ? 'active' : ''}`}
                  onClick={() => setSelectedSegment(seg)}>
                  <span>{seg}</span>
                  <div className="indicator"></div>
                </button>
              ))}
            </div>
          </section>

          {/* Studio Equipment */}
          <section className="card">
            <h3 className="card-title">
              <span>🎚️</span>
              <span>Studio Equipment</span>
            </h3>
            <div className="equipment">
              <div className="deck">
                <div className="reels">
                  <div className={`reel ${isGenerating ? 'spin' : ''}`}></div>
                  <div className="tape"></div>
                  <div className={`reel ${isGenerating ? 'spin' : ''}`}></div>
                </div>
                <div className="vu">
                  {[...Array(15)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`bar ${isGenerating ? 'active' : ''}`}
                      style={{ animationDelay: `${i * 0.05}s` }}
                    />
                  ))}
                </div>
                <div className="status-text">
                  {isGenerating ? 'Recording...' : 'Tape Deck Ready'}
                </div>
              </div>
            </div>
          </section>

          {/* Audio Player */}
          {audioUrl && !isGenerating && (
            <section className="card">
              <h3 className="card-title">
                <span>🎵</span>
                <span>Generated Track</span>
              </h3>
              <audio controls className="audio" src={audioUrl} />
              <button 
                className="btn-primary"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = audioUrl;
                  a.download = 'track.mp3';
                  a.click();
                }}>
                <span>⬇</span>
                <span>Download Track</span>
              </button>
            </section>
          )}

          {/* Advanced */}
          <div className="advanced">
            <button 
              className="advanced-toggle"
              onClick={() => setAdvancedOpen(!advancedOpen)}>
              <span>
                <span>⚙️</span>
                <span>Advanced Audio Controls</span>
              </span>
              <span className={advancedOpen ? 'open' : ''}>▼</span>
            </button>
            
            {advancedOpen && (
              <div className="advanced-content card">
                {['Reverb', 'Echo', 'Compression'].map((param) => (
                  <div key={param} className="param">
                    <span>{param}</span>
                    <div className="param-ctrl">
                      <input type="range" defaultValue="50" />
                      <span>50%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button 
            className={`btn-generate ${isGenerating ? 'generating' : ''}`}
            onClick={handleGenerate}
            disabled={isGenerating}>
            {isGenerating ? (
              <>
                <span className="spinner"></span>
                <span>Generating {generationProgress}%</span>
              </>
            ) : (
              <>
                <span>🎵</span>
                <span>Generate Track</span>
                <span>→</span>
              </>
            )}
          </button>

          {isGenerating && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${generationProgress}%` }} />
            </div>
          )}

        </div>

        {/* Bottom Nav */}
        <nav className="bottom-nav">
          <button onClick={() => window.location.href = '/'}>
            <span>🏠</span>
            <span>Home</span>
          </button>
          <button>
            <span>🎨</span>
            <span>Create</span>
          </button>
          <button className="active">
            <div className="glow"></div>
            <span>🎵</span>
            <span>Music</span>
          </button>
          <button>
            <span>📁</span>
            <span>Projects</span>
          </button>
          <button>
            <span>⚙️</span>
            <span>Settings</span>
          </button>
        </nav>
      </div>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        .music-studio-root {
          min-height: 100vh;
          width: 100%;
          position: relative;
          background: #050B2A;
          font-family: 'Inter', sans-serif;
          overflow-x: hidden;
        }

        .cosmic-bg {
          position: fixed;
          inset: 0;
          background: radial-gradient(ellipse at 20% 30%, rgba(6, 78, 159, 0.15), transparent 50%),
                      radial-gradient(ellipse at 80% 70%, rgba(139, 92, 246, 0.12), transparent 50%),
                      linear-gradient(180deg, #050B2A 0%, #0B1445 100%);
          z-index: 0;
        }

        .nebula {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 15% 25%, rgba(56, 189, 248, 0.08), transparent 40%),
                      radial-gradient(circle at 85% 75%, rgba(236, 72, 153, 0.06), transparent 40%);
          animation: nebula 30s ease-in-out infinite;
        }

        @keyframes nebula {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.8; }
        }

        .star {
          position: absolute;
          background: white;
          border-radius: 50%;
          animation: twinkle 20s ease-in-out infinite;
        }

        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }

        .content {
          position: relative;
          z-index: 1;
          max-width: 480px;
          margin: 0 auto;
          padding: 20px 16px 120px;
        }

        .header {
          margin-bottom: 36px;
        }

        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 28px;
        }

        .btn-back {
          padding: 12px 20px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1.5px solid rgba(34, 211, 238, 0.3);
          border-radius: 14px;
          color: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.3s;
        }

        .btn-back:hover {
          transform: translateX(-3px);
          border-color: rgba(34, 211, 238, 0.5);
          box-shadow: 0 0 30px rgba(34, 211, 238, 0.3);
        }

        .credits {
          padding: 12px 20px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1.5px solid rgba(34, 211, 238, 0.3);
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: white;
        }

        .credits-icon {
          font-size: 22px;
          color: #FBB040;
        }

        .credits-num {
          font-size: 20px;
          font-weight: 800;
        }

        .credits-label {
          font-size: 13px;
          opacity: 0.7;
        }

        .title {
          font-size: 48px;
          font-weight: 900;
          background: linear-gradient(135deg, #FFF, #22D3EE);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 12px;
        }

        .subtitle {
          font-size: 16px;
          font-weight: 500;
          color: rgba(34, 211, 238, 0.8);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .card {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          border: 1.5px solid transparent;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.03)),
            linear-gradient(135deg, rgba(34, 211, 238, 0.3), rgba(236, 72, 153, 0.2), rgba(251, 146, 60, 0.25));
          background-origin: border-box;
          background-clip: padding-box, border-box;
          border-radius: 24px;
          padding: 28px 24px;
          margin-bottom: 24px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 60px rgba(34, 211, 238, 0.1);
        }

        .card-title {
          font-size: 20px;
          font-weight: 700;
          color: white;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 20px;
        }

        .chip {
          padding: 12px 20px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(34, 211, 238, 0.2);
          border-radius: 16px;
          color: rgba(255, 255, 255, 0.85);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.3s;
        }

        .chip:hover {
          transform: translateY(-2px);
          border-color: rgba(34, 211, 238, 0.5);
          box-shadow: 0 0 20px rgba(34, 211, 238, 0.3);
        }

        .chip.active {
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.2), rgba(236, 72, 153, 0.15));
          border-color: rgba(34, 211, 238, 0.6);
          color: white;
          box-shadow: 0 0 30px rgba(34, 211, 238, 0.5);
        }

        .btn-primary {
          width: 100%;
          padding: 16px 28px;
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.15), rgba(59, 130, 246, 0.15));
          border: 2px solid rgba(34, 211, 238, 0.4);
          border-radius: 18px;
          color: white;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          transition: all 0.3s;
        }

        .btn-primary:hover {
          transform: translateY(-3px);
          border-color: rgba(34, 211, 238, 0.6);
          box-shadow: 0 0 40px rgba(34, 211, 238, 0.4);
        }

        .btn-sync {
          padding: 10px 18px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(34, 211, 238, 0.2);
          border-radius: 16px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.3s;
        }

        .btn-sync:hover {
          border-color: rgba(34, 211, 238, 0.5);
          box-shadow: 0 0 20px rgba(34, 211, 238, 0.3);
        }

        .btn-sync.syncing {
          animation: sync-pulse 1s ease-in-out infinite;
        }

        @keyframes sync-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(34, 211, 238, 0.4); }
          50% { box-shadow: 0 0 40px rgba(34, 211, 238, 0.6); }
        }

        .input-text {
          width: 100%;
          min-height: 150px;
          padding: 18px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(34, 211, 238, 0.2);
          border-radius: 16px;
          color: white;
          font-size: 15px;
          line-height: 1.7;
          font-family: 'Inter', sans-serif;
          resize: none;
          outline: none;
        }

        .input-text.short {
          min-height: 110px;
        }

        .input-text::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .input-text:focus {
          border-color: rgba(34, 211, 238, 0.5);
          box-shadow: 0 0 20px rgba(34, 211, 238, 0.2);
        }

        .btn-melody {
          width: 100%;
          padding: 32px;
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.15), rgba(59, 130, 246, 0.15));
          border: 2px solid rgba(34, 211, 238, 0.4);
          border-radius: 18px;
          color: white;
          font-size: 17px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          transition: all 0.3s;
          margin-bottom: 16px;
        }

        .btn-melody:hover {
          transform: translateY(-3px);
          box-shadow: 0 0 40px rgba(34, 211, 238, 0.4);
        }

        .btn-melody.recording {
          border-color: rgba(239, 68, 68, 0.6);
          animation: recording 1.5s ease-in-out infinite;
        }

        @keyframes recording {
          0%, 100% { box-shadow: 0 0 30px rgba(239, 68, 68, 0.4); }
          50% { box-shadow: 0 0 50px rgba(239, 68, 68, 0.6); }
        }

        .mic {
          font-size: 48px;
        }

        .status {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 16px 0;
          color: rgba(255, 255, 255, 0.7);
          font-size: 14px;
        }

        .status-dot {
          width: 10px;
          height: 10px;
          background: #10B981;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.8);
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .link {
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
          transition: all 0.3s;
        }

        .link:hover {
          color: #22D3EE;
          transform: translateX(3px);
        }

        .toggle {
          position: relative;
          width: 64px;
          height: 32px;
          cursor: pointer;
        }

        .toggle input {
          display: none;
        }

        .toggle-track {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          border: 2px solid rgba(34, 211, 238, 0.3);
          border-radius: 16px;
          transition: all 0.3s;
        }

        .toggle-track::before {
          content: '';
          position: absolute;
          width: 24px;
          height: 24px;
          left: 3px;
          top: 2px;
          background: linear-gradient(135deg, #ccc, #999);
          border-radius: 50%;
          transition: all 0.3s;
        }

        input:checked + .toggle-track {
          background: rgba(34, 211, 238, 0.15);
          border-color: rgba(34, 211, 238, 0.6);
          box-shadow: 0 0 20px rgba(34, 211, 238, 0.3);
        }

        input:checked + .toggle-track::before {
          transform: translateX(32px);
          background: linear-gradient(135deg, #22D3EE, #3B82F6);
        }

        .pills {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 24px;
        }

        .pill {
          padding: 10px 20px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(34, 211, 238, 0.2);
          border-radius: 16px;
          color: rgba(255, 255, 255, 0.85);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }

        .pill:hover {
          border-color: rgba(34, 211, 238, 0.5);
          box-shadow: 0 0 20px rgba(34, 211, 238, 0.3);
        }

        .pill.active {
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.2), rgba(236, 72, 153, 0.15));
          border-color: rgba(34, 211, 238, 0.6);
          color: white;
          box-shadow: 0 0 30px rgba(34, 211, 238, 0.5);
        }

        .preview {
          width: 100%;
          height: 220px;
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.15), rgba(168, 85, 247, 0.1), rgba(251, 146, 60, 0.1));
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.7);
          font-size: 15px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .mode-selector {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
        }

        .mode {
          flex: 1;
          padding: 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(34, 211, 238, 0.2);
          border-radius: 16px;
          color: rgba(255, 255, 255, 0.85);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }

        .mode:hover {
          border-color: rgba(34, 211, 238, 0.5);
        }

        .mode.active {
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.2), rgba(236, 72, 153, 0.15));
          border-color: rgba(34, 211, 238, 0.6);
          color: white;
          box-shadow: 0 0 30px rgba(34, 211, 238, 0.5);
        }

        .timeline {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          margin-bottom: 20px;
        }

        .segment {
          min-width: 85px;
          padding: 12px 14px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(34, 211, 238, 0.2);
          border-radius: 14px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          transition: all 0.3s;
        }

        .segment:hover {
          border-color: rgba(34, 211, 238, 0.4);
        }

        .segment.active {
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.15), rgba(59, 130, 246, 0.1));
          border-color: rgba(34, 211, 238, 0.6);
          box-shadow: 0 0 20px rgba(34, 211, 238, 0.4);
        }

        .indicator {
          width: 100%;
          height: 4px;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 2px;
        }

        .segment.active .indicator {
          background: linear-gradient(90deg, #22D3EE, #3B82F6);
          box-shadow: 0 0 8px rgba(34, 211, 238, 0.8);
        }

        .equipment {
          padding: 24px 0;
        }

        .deck {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }

        .reels {
          display: flex;
          align-items: center;
          gap: 30px;
        }

        .reel {
          width: 70px;
          height: 70px;
          background: radial-gradient(circle, #ddd, #8c8c8c);
          border: 3px solid #555;
          border-radius: 50%;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
        }

        .reel.spin {
          animation: rotate 3s linear infinite;
        }

        @keyframes rotate {
          to { transform: rotate(360deg); }
        }

        .tape {
          width: 50px;
          height: 8px;
          background: linear-gradient(180deg, #5a3c28, #3c281e);
          border-radius: 2px;
        }

        .vu {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 4px;
          height: 60px;
          width: 100%;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 12px;
          padding: 20px;
        }

        .bar {
          width: 4px;
          height: 20%;
          background: linear-gradient(180deg, rgba(34, 211, 238, 0.3), rgba(59, 130, 246, 0.3));
          border-radius: 2px;
        }

        .bar.active {
          background: linear-gradient(180deg, #22D3EE, #3B82F6);
          box-shadow: 0 0 8px rgba(34, 211, 238, 0.8);
          animation: vu 0.8s ease-in-out infinite;
        }

        @keyframes vu {
          0%, 100% { height: 30%; }
          50% { height: 85%; }
        }

        .status-text {
          color: rgba(255, 255, 255, 0.7);
          font-size: 14px;
          font-weight: 600;
          text-align: center;
        }

        .audio {
          width: 100%;
          height: 56px;
          margin-bottom: 20px;
          border-radius: 14px;
        }

        .advanced {
          margin-bottom: 24px;
        }

        .advanced-toggle {
          width: 100%;
          padding: 18px 24px;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          border: 1.5px solid transparent;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.03)),
            linear-gradient(135deg, rgba(34, 211, 238, 0.3), rgba(236, 72, 153, 0.2));
          background-origin: border-box;
          background-clip: padding-box, border-box;
          border-radius: 18px;
          color: white;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.3s;
        }

        .advanced-toggle:hover {
          box-shadow: 0 0 30px rgba(34, 211, 238, 0.25);
        }

        .advanced-toggle span:first-child {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .advanced-toggle span:last-child {
          color: rgba(34, 211, 238, 0.8);
          transition: transform 0.3s;
        }

        .advanced-toggle span:last-child.open {
          transform: rotate(180deg);
        }

        .advanced-content {
          margin-top: 16px;
        }

        .param {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 20px;
          color: rgba(255, 255, 255, 0.85);
          font-size: 15px;
          font-weight: 600;
        }

        .param:last-child {
          margin-bottom: 0;
        }

        .param-ctrl {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .param-ctrl input {
          flex: 1;
          height: 8px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 4px;
          outline: none;
          -webkit-appearance: none;
        }

        .param-ctrl input::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          background: linear-gradient(135deg, #22D3EE, #3B82F6);
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 12px rgba(34, 211, 238, 0.6);
        }

        .param-ctrl span {
          min-width: 45px;
          text-align: right;
          color: rgba(34, 211, 238, 0.9);
          font-size: 14px;
        }

        .btn-generate {
          width: 100%;
          padding: 22px 36px;
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.25), rgba(59, 130, 246, 0.2));
          border: 2px solid rgba(34, 211, 238, 0.5);
          border-radius: 20px;
          color: white;
          font-size: 18px;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          transition: all 0.3s;
          box-shadow: 0 0 40px rgba(34, 211, 238, 0.3);
        }

        .btn-generate:hover:not(:disabled) {
          transform: translateY(-4px);
          box-shadow: 0 0 60px rgba(34, 211, 238, 0.5);
        }

        .btn-generate:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .btn-generate.generating {
          animation: gen-pulse 2s ease-in-out infinite;
        }

        @keyframes gen-pulse {
          0%, 100% { box-shadow: 0 0 40px rgba(34, 211, 238, 0.4); }
          50% { box-shadow: 0 0 80px rgba(34, 211, 238, 0.6); }
        }

        .spinner {
          width: 24px;
          height: 24px;
          border: 3px solid rgba(255, 255, 255, 0.2);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .progress-bar {
          width: 100%;
          height: 6px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 3px;
          margin-top: 16px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #22D3EE, #3B82F6);
          border-radius: 3px;
          transition: width 0.3s;
        }

        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(5, 11, 42, 0.95);
          backdrop-filter: blur(20px);
          border-top: 2px solid transparent;
          background-image: 
            linear-gradient(rgba(5, 11, 42, 0.95), rgba(5, 11, 42, 0.95)),
            linear-gradient(90deg, rgba(34, 211, 238, 0.3), rgba(236, 72, 153, 0.25), rgba(251, 146, 60, 0.3));
          background-origin: border-box;
          background-clip: padding-box, border-box;
          display: flex;
          justify-content: space-around;
          padding: 12px 8px 16px;
          z-index: 100;
          box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.6);
        }

        .bottom-nav button {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          position: relative;
          transition: all 0.3s;
        }

        .bottom-nav button:hover {
          color: rgba(255, 255, 255, 0.8);
        }

        .bottom-nav button.active {
          color: white;
        }

        .bottom-nav button span:first-child {
          font-size: 24px;
        }

        .glow {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 60px;
          height: 60px;
          background: radial-gradient(circle, rgba(34, 211, 238, 0.3), transparent 70%);
          border-radius: 50%;
          animation: nav-pulse 2s ease-in-out infinite;
        }

        @keyframes nav-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </>
  );
}
