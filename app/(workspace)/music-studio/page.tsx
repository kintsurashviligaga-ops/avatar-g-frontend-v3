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
    <div className="min-h-screen w-full overflow-auto" style={{
      background: 'radial-gradient(ellipse at top, rgba(88, 28, 135, 0.35), transparent 65%), radial-gradient(ellipse at bottom, rgba(30, 58, 138, 0.25), transparent 65%), #0a0a0f'
    }}>
      {/* Stable floating star particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {starParticles.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full star-particle"
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
      <div className="relative max-w-md mx-auto px-5 py-10 pb-28">
        
        {/* Premium Header with Horizontal Band Glow */}
        <div className="text-center mb-12 relative">
          {/* Wide horizontal purple "band glow" - aurora bar effect */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-32 band-glow" 
               style={{
                 background: 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.4) 20%, rgba(168, 85, 247, 0.5) 50%, rgba(139, 92, 246, 0.4) 80%, transparent)',
                 filter: 'blur(40px)',
                 opacity: 0.6
               }} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-20"
               style={{
                 background: 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.6) 30%, rgba(236, 72, 153, 0.4) 50%, rgba(168, 85, 247, 0.6) 70%, transparent)',
                 filter: 'blur(30px)',
                 opacity: 0.5
               }} />
          
          <h1 className="relative text-5xl font-bold mb-3 bg-gradient-to-r from-purple-200 via-purple-100 to-blue-200 bg-clip-text text-transparent"
              style={{ 
                textShadow: '0 0 80px rgba(168, 85, 247, 0.9), 0 0 40px rgba(236, 72, 153, 0.5)',
                letterSpacing: '0.02em',
                lineHeight: 1.2
              }}>
            Music Studio
          </h1>
          <p className="relative text-[10px] text-purple-300/50 font-light tracking-[0.3em] uppercase">
            Neural Audio-Visual Lab
          </p>
        </div>

        {/* Main Card */}
        <div className="glass-card p-7 space-y-7">
          
          {/* Project Setup */}
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-purple-100">Project Setup</h3>
              <button className="px-3 py-1.5 text-xs rounded-full glass-button text-purple-300 hover:text-purple-100">
                Explore Genres →
              </button>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <div className="chip chip-purple">
                <span className="text-lg mr-1.5">🎸</span>
                {genre}
              </div>
              <div className="chip chip-blue">
                <span className="text-lg mr-1.5">🎹</span>
                Cello, Synth
              </div>
              <div className="chip chip-pink">
                <span className="text-lg mr-1.5">⚡</span>
                {mood}
              </div>
            </div>
          </div>

          {/* Lyrics Section with Horizontal Sync Bridge */}
          <div className="space-y-3 relative">
            <div className="flex items-center justify-between relative">
              <h3 className="text-sm font-semibold text-purple-100 relative z-20">Lyrics / Idea</h3>
              
              {/* Horizontal Sync Bridge */}
              {syncGlow && (
                <div className="absolute left-[100px] right-[120px] top-1/2 -translate-y-1/2 h-0.5 z-10 sync-bridge">
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500 via-pink-400 to-blue-400" 
                       style={{
                         boxShadow: '0 0 20px rgba(168, 85, 247, 0.9), 0 0 40px rgba(236, 72, 153, 0.6)',
                         filter: 'brightness(1.5)'
                       }} />
                  {/* Left flare point */}
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-purple-400"
                       style={{
                         boxShadow: '0 0 12px rgba(168, 85, 247, 1), 0 0 24px rgba(168, 85, 247, 0.8)',
                         animation: 'pulse 0.5s ease-in-out infinite alternate'
                       }} />
                  {/* Right flare point */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400"
                       style={{
                         boxShadow: '0 0 12px rgba(59, 130, 246, 1), 0 0 24px rgba(59, 130, 246, 0.8)',
                         animation: 'pulse 0.5s ease-in-out infinite alternate'
                       }} />
                  {/* Sparkles */}
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white"
                      style={{
                        left: `${20 + i * 20}%`,
                        animation: `sparkle 1s ease-in-out ${i * 0.2}s infinite`,
                        opacity: 0
                      }}
                    />
                  ))}
                </div>
              )}
              
              <button 
                onClick={handleSmartSync}
                className="px-3 py-1.5 text-xs rounded-full glass-button-glow text-purple-300 hover:text-purple-100 transition-all relative z-20">
                <span className="mr-1">✨</span>
                Smart Sync
              </button>
            </div>
            
            <textarea
              className="glass-input w-full h-28 resize-none"
              placeholder="Enter your lyrics or musical idea..."
              defaultValue="Chasing dreams, running through the night.&#10;A spark in the heart, burning so bright."
            />
            <button className="absolute bottom-3 right-3 p-1.5 rounded-lg glass-button text-purple-300/60 hover:text-purple-200">
              ✕
            </button>
          </div>

          {/* Description Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-purple-100">Music Vibe & Scene Description</h3>
            <textarea
              className="glass-input w-full h-24 resize-none"
              placeholder="Describe mood, pacing, instruments, scene..."
              defaultValue="Starts slow with Georgian chonguri, then turns into energetic alt-rock chorus."
            />
          </div>

          {/* Melody & Voice Section */}
          <div className="space-y-4 text-center">
            <button className="w-full py-5 rounded-2xl glass-button-glow text-purple-100 font-semibold text-base hover:scale-[1.02] transition-transform">
              <span className="text-2xl mr-2">🎤</span>
              Capture My Melody
            </button>
            <div className="text-sm">
              <p className="text-purple-300 font-medium">Connected: Giorgi Voice v1</p>
              <a href="#" className="text-purple-400/60 text-xs hover:text-purple-300 transition-colors underline">
                Go to Voice Lab →
              </a>
            </div>
          </div>

          {/* Compact Timeline with Progress Line */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-purple-100">Timeline</h3>
            <div className="space-y-2.5">
              <div className="flex gap-1.5 overflow-x-auto pb-2">
                {['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Outro'].map((segment) => (
                  <div key={segment} className="timeline-segment-compact">
                    {segment}
                  </div>
                ))}
              </div>
              {/* Thin progress bar with 35% placeholder */}
              <div className="w-full h-1 rounded-full bg-purple-950/40 overflow-hidden">
                <div className="h-full w-[35%] bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500 rounded-full transition-all duration-1000"
                     style={{
                       boxShadow: '0 0 12px rgba(168, 85, 247, 0.7), 0 0 6px rgba(236, 72, 153, 0.5)'
                     }} />
              </div>
            </div>
          </div>

          {/* Voice Mode Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-purple-100">Voice Mode</h3>
            <div className="flex gap-2.5">
              <button
                onClick={() => setVoiceMode('AI')}
                className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all ${
                  voiceMode === 'AI' 
                    ? 'glass-button-glow text-purple-100' 
                    : 'glass-button text-purple-400/60'
                }`}>
                AI Voice
              </button>
              <button
                onClick={() => setVoiceMode('MY')}
                className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all ${
                  voiceMode === 'MY' 
                    ? 'glass-button-glow text-purple-100' 
                    : 'glass-button text-purple-400/60'
                }`}>
                Use My Voice
              </button>
            </div>
            {voiceMode === 'AI' && (
              <select className="glass-input w-full py-3 text-sm">
                <option>Neutral</option>
                <option>Pop</option>
                <option>Rap</option>
                <option>Cinematic</option>
              </select>
            )}
          </div>

          {/* Visual Alchemist with Horizontal Scrollable Pills */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-purple-100">Visual Alchemist</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visualEnabled}
                  onChange={(e) => setVisualEnabled(e.target.checked)}
                  className="sr-only"
                />
                <div className={`toggle ${visualEnabled ? 'active' : ''}`} />
              </label>
            </div>
            
            {visualEnabled && (
              <>
                {/* Single horizontal scrollable pill row */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {['Cinematic', 'Cyberpunk', 'Abstract', 'Retro', 'Minimal', 'Noir'].map((style) => (
                    <button
                      key={style}
                      onClick={() => setVisualStyle(style)}
                      className={`py-2.5 px-5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                        visualStyle === style
                          ? 'visual-pill-active'
                          : 'glass-button text-purple-400/60'
                      }`}>
                      {style}
                    </button>
                  ))}
                </div>
                
                {/* Animated Nebula Preview */}
                <div className="relative overflow-hidden rounded-3xl aspect-video glass-panel">
                  {/* Layered radial gradients for nebula effect */}
                  <div className="absolute inset-0 nebula-layer-1" />
                  <div className="absolute inset-0 nebula-layer-2" />
                  <div className="absolute inset-0 nebula-layer-3" />
                  <div className="absolute inset-0 shimmer-overlay" />
                  
                  {/* Cover Preview text */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center space-y-3 z-10">
                      <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-400/20 to-pink-400/20 animate-pulse-slow backdrop-blur-sm border border-purple-400/30" />
                      <p className="text-xs text-purple-200/50 font-light tracking-wide">Cover Preview</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Advanced Section */}
          <div className="space-y-3">
            <button
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="w-full flex items-center justify-between py-3 px-5 rounded-2xl glass-button text-purple-300 hover:text-purple-100 transition-colors">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span>⚙️</span>
                Advanced
              </span>
              <span className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
            
            {advancedOpen && (
              <div className="glass-panel p-5 space-y-3 animate-fadeIn rounded-2xl">
                <p className="text-xs text-purple-300/70">
                  🎛️ Vibe Switcher, Auto-Mix Controls, Collaboration Links — Coming Soon!
                </p>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button className="w-full py-6 rounded-3xl font-bold text-lg generate-button group">
            <span className="relative z-10 flex items-center justify-center gap-2">
              Generate Track
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </span>
          </button>
        </div>
      </div>

      {/* Floating Chat Button */}
      <button className="fixed bottom-6 right-6 w-16 h-16 rounded-full chat-button flex items-center justify-center text-2xl shadow-2xl">
        💬
      </button>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        * {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

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

        .sync-bridge {
          animation: fadeOut 2.8s ease-out forwards;
        }

        @keyframes fadeOut {
          0% { opacity: 1; }
          75% { opacity: 1; }
          100% { opacity: 0; }
        }

        .star-particle {
          will-change: transform;
        }

        .band-glow {
          animation: band-pulse 6s ease-in-out infinite;
        }

        @keyframes band-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.7; }
        }

        .glass-card {
          background: rgba(15, 15, 25, 0.75);
          backdrop-filter: blur(28px);
          border: 1px solid rgba(139, 92, 246, 0.25);
          border-radius: 32px;
          box-shadow: 
            0 12px 48px rgba(0, 0, 0, 0.5),
            0 4px 16px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            inset 0 -1px 0 rgba(255, 255, 255, 0.02);
        }

        .glass-panel {
          background: rgba(10, 10, 20, 0.65);
          backdrop-filter: blur(18px);
          border: 1px solid rgba(139, 92, 246, 0.18);
        }

        .glass-button {
          background: rgba(139, 92, 246, 0.12);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(139, 92, 246, 0.25);
          transition: all 0.3s ease;
        }

        .glass-button:hover {
          background: rgba(139, 92, 246, 0.22);
          border-color: rgba(139, 92, 246, 0.45);
          box-shadow: 0 4px 20px rgba(139, 92, 246, 0.25);
          transform: translateY(-1px);
        }

        .glass-button-glow {
          background: rgba(139, 92, 246, 0.28);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(139, 92, 246, 0.45);
          box-shadow: 
            0 4px 28px rgba(139, 92, 246, 0.35),
            0 2px 12px rgba(168, 85, 247, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
          transition: all 0.3s ease;
        }

        .glass-button-glow:hover {
          background: rgba(139, 92, 246, 0.35);
          border-color: rgba(139, 92, 246, 0.6);
          box-shadow: 
            0 6px 32px rgba(139, 92, 246, 0.45),
            0 3px 16px rgba(168, 85, 247, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.15);
          transform: translateY(-1px);
        }

        .glass-input {
          background: rgba(10, 10, 20, 0.85);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(139, 92, 246, 0.25);
          border-radius: 18px;
          padding: 14px 18px;
          color: rgba(255, 255, 255, 0.92);
          outline: none;
          transition: all 0.3s ease;
          font-size: 14px;
          line-height: 1.5;
        }

        .glass-input:focus {
          border-color: rgba(139, 92, 246, 0.6);
          background: rgba(10, 10, 20, 0.9);
          box-shadow: 
            0 0 0 3px rgba(139, 92, 246, 0.15),
            0 4px 20px rgba(139, 92, 246, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }

        .glass-input::placeholder {
          color: rgba(168, 139, 230, 0.45);
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
          transition: all 0.3s ease;
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

        .timeline-segment-compact {
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
          transition: all 0.3s ease;
        }

        .timeline-segment-compact:hover {
          background: rgba(139, 92, 246, 0.18);
          border-color: rgba(139, 92, 246, 0.3);
          color: rgba(196, 181, 253, 1);
        }

        .visual-pill-active {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.7), rgba(236, 72, 153, 0.6));
          border: 1.5px solid rgba(168, 85, 247, 0.9);
          color: rgba(255, 255, 255, 0.98);
          box-shadow: 
            0 0 24px rgba(168, 85, 247, 0.7),
            0 0 48px rgba(236, 72, 153, 0.4),
            0 4px 16px rgba(139, 92, 246, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.25),
            inset 0 0 20px rgba(168, 85, 247, 0.3);
          backdrop-filter: blur(16px);
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
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.04),
            rgba(168, 85, 247, 0.02),
            transparent
          );
          animation: shimmer 10s ease-in-out infinite;
        }

        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
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

        .generate-button {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.85), rgba(59, 130, 246, 0.85));
          border: 1px solid rgba(168, 85, 247, 0.6);
          box-shadow: 
            0 10px 40px rgba(139, 92, 246, 0.5),
            0 4px 16px rgba(59, 130, 246, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.25),
            inset 0 -1px 0 rgba(0, 0, 0, 0.1);
          color: white;
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
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

        .chat-button {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.95), rgba(59, 130, 246, 0.95));
          backdrop-filter: blur(16px);
          border: 1px solid rgba(168, 85, 247, 0.6);
          box-shadow: 
            0 10px 40px rgba(139, 92, 246, 0.6),
            0 4px 16px rgba(59, 130, 246, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.25);
          transition: all 0.3s ease;
        }

        .chat-button:hover {
          transform: scale(1.12);
          box-shadow: 
            0 14px 52px rgba(139, 92, 246, 0.7),
            0 6px 24px rgba(59, 130, 246, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.35);
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease;
        }

        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }

        /* Custom scrollbar for other elements */
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
