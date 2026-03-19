'use client'

/**
 * ImagineTab — Premium "Create" tab with 4D visual depth.
 * Featured hero card, template grid, creative exploration.
 */

import { useCallback } from 'react'

/* ── Template data ── */
const FEATURED = {
  title: 'Animate your photos',
  subtitle: 'Turn any photo into a vivid AI animation',
  cta: 'Continue',
}

const TEMPLATES = [
  { id: 'avatar-style', icon: '🎭', label: 'Avatar Style', desc: 'AI portraits & identity', color: '#a78bfa', gradient: 'linear-gradient(145deg, #1a0a2e, #2d1b69)' },
  { id: 'poster-design', icon: '🖼️', label: 'Poster Design', desc: 'Campaign-grade visuals', color: '#3b82f6', gradient: 'linear-gradient(145deg, #0a1530, #1e3a5f)' },
  { id: 'reel-creation', icon: '🎬', label: 'Reel Creation', desc: 'Social video content', color: '#f59e0b', gradient: 'linear-gradient(145deg, #1a1408, #3d2e0a)' },
  { id: 'ai-animation', icon: '✨', label: 'AI Animation', desc: 'Bring stills to life', color: '#8b5cf6', gradient: 'linear-gradient(145deg, #14082e, #2a1260)' },
  { id: 'product-ad', icon: '📦', label: 'Product Ad', desc: 'E-commerce ready shots', color: '#10b981', gradient: 'linear-gradient(145deg, #081a14, #0d3024)' },
  { id: 'soundtrack', icon: '🎵', label: 'Soundtrack', desc: 'AI music generation', color: '#06b6d4', gradient: 'linear-gradient(145deg, #081a20, #0c2a38)' },
  { id: 'business-copy', icon: '📝', label: 'Business Copy', desc: 'AI-powered writing', color: '#f43f5e', gradient: 'linear-gradient(145deg, #1a0810, #3d0c1e)' },
  { id: 'workflow', icon: '⚡', label: 'Workflow', desc: 'Chain AI tools together', color: '#eab308', gradient: 'linear-gradient(145deg, #1a1608, #3d3008)' },
]

const PHOTO_SAMPLES = [
  { id: 1, gradient: 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)', icon: '👤' },
  { id: 2, gradient: 'linear-gradient(135deg, #2d1b69, #11998e)', icon: '🦌' },
  { id: 3, gradient: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)', icon: '🐕' },
]

interface ImagineTabProps {
  onCreateAction: (templateId: string) => void
  onOpenSettings: () => void
  onFeaturedAction: () => void
}

export function ImagineTab({ onCreateAction, onOpenSettings, onFeaturedAction }: ImagineTabProps) {
  return (
    <div className="flex-1 pt-2 pb-4 space-y-5">

      {/* ── Featured Hero Card ── */}
      <div className="ma-featured-card" onClick={onFeaturedAction} role="button" tabIndex={0}>
        {/* Preview thumbnails */}
        <div className="ma-featured-thumbnails">
          {PHOTO_SAMPLES.map(s => (
            <div key={s.id} className="ma-featured-thumb" style={{ background: s.gradient }}>
              <div className="flex items-center justify-center w-full h-full text-white/30 text-2xl">
                {s.icon}
              </div>
            </div>
          ))}
        </div>

        {/* Title + CTA */}
        <h3 className="text-[17px] font-bold mt-3" style={{ color: '#fff' }}>
          {FEATURED.title}
        </h3>
        <p className="text-[13px] mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {FEATURED.subtitle}
        </p>
        <button
          className="ma-featured-cta"
          onClick={e => { e.stopPropagation(); onFeaturedAction() }}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          {FEATURED.cta}
        </button>
      </div>

      {/* ── Section: Create from template ── */}
      <div className="px-4">
        <h3 className="ma-section-heading">Create from template</h3>

        <div className="ma-template-grid">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              className="ma-template-card"
              onClick={() => onCreateAction(t.id)}
              type="button"
            >
              <div className="ma-template-card-bg" style={{ background: t.gradient }} />
              {/* Accent glow */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(circle at 50% 80%, ${t.color}22 0%, transparent 70%)` }} />
              <div className="ma-template-card-info">
                <span className="text-[28px] block mb-2">{t.icon}</span>
                <h4>{t.label}</h4>
                <span>{t.desc}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Quick Actions Row ── */}
      <div className="ma-quick-tools">
        <button className="ma-quick-tool" onClick={() => onCreateAction('edit-image')} type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.21 1.21 0 0 0 1.72 0L21.64 5.36a1.21 1.21 0 0 0 0-1.72z" /><path d="m14 7 3 3" /></svg>
          <span>Edit Images</span>
        </button>
        <button className="ma-quick-tool" onClick={() => onCreateAction('animate-photo')} type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="2.18" /><path d="m10 8 6 4-6 4z" /></svg>
          <span>Animate Photos</span>
        </button>
        <button className="ma-quick-tool" onClick={onOpenSettings} type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Settings</span>
        </button>
      </div>
    </div>
  )
}
