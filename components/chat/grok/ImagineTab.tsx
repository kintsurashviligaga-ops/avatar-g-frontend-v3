'use client'

/**
 * ImagineTab — The "Create" tab content for Agent G.
 * Shows: Featured hero card, template grid, creative exploration.
 * Inspired by top-tier AI creation apps, fully adapted to MyAvatar.ge.
 */

import { useState, useCallback } from 'react'

/* ── Template data ── */
const FEATURED = {
  title: 'Animate your photos',
  subtitle: 'Turn any photo into a vivid AI animation',
  cta: 'Continue',
  gradient: 'linear-gradient(135deg, rgba(34,211,238,0.25) 0%, rgba(139,92,246,0.2) 50%, rgba(236,72,153,0.2) 100%)',
}

const TEMPLATES = [
  { id: 'avatar-style', icon: '🎭', label: 'Avatar Style', color: '#ec4899' },
  { id: 'poster-design', icon: '🖼️', label: 'Poster Design', color: '#3b82f6' },
  { id: 'reel-creation', icon: '🎬', label: 'Reel Creation', color: '#f59e0b' },
  { id: 'ai-animation', icon: '✨', label: 'AI Animation', color: '#8b5cf6' },
  { id: 'product-ad', icon: '📦', label: 'Product Ad', color: '#10b981' },
  { id: 'soundtrack', icon: '🎵', label: 'Soundtrack', color: '#06b6d4' },
  { id: 'business-copy', icon: '📝', label: 'Business Copy', color: '#f43f5e' },
  { id: 'workflow', icon: '⚡', label: 'Workflow', color: '#eab308' },
]

const PHOTO_SAMPLES = [
  { id: 1, gradient: 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)' },
  { id: 2, gradient: 'linear-gradient(135deg, #2d1b69, #11998e)' },
  { id: 3, gradient: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' },
]

interface ImagineTabProps {
  onCreateAction: (templateId: string) => void
  onOpenSettings: () => void
  onFeaturedAction: () => void
}

export function ImagineTab({ onCreateAction, onOpenSettings, onFeaturedAction }: ImagineTabProps) {
  return (
    <div className="flex-1 px-4 pt-2 pb-4 space-y-6">

      {/* ── Featured Hero Card ── */}
      <div className="ma-featured-card" onClick={onFeaturedAction} role="button" tabIndex={0}>
        {/* Preview thumbnails */}
        <div className="ma-featured-thumbnails">
          {PHOTO_SAMPLES.map(s => (
            <div key={s.id} className="ma-featured-thumb" style={{ background: s.gradient }}>
              <div className="absolute inset-0 flex items-center justify-center text-white/20 text-2xl">
                {s.id === 1 ? '👤' : s.id === 2 ? '🦌' : '🐕'}
              </div>
            </div>
          ))}
        </div>

        {/* Text + CTA */}
        <p className="text-[15px] font-medium mt-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {FEATURED.title}
        </p>
        <button
          className="ma-featured-cta"
          onClick={e => { e.stopPropagation(); onFeaturedAction() }}
          type="button"
        >
          {FEATURED.cta}
        </button>
      </div>

      {/* ── Section: Create from template ── */}
      <div>
        <h3 className="text-[15px] font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.85)' }}>
          Create from template
        </h3>

        <div className="ma-template-grid">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              className="ma-template-card"
              onClick={() => onCreateAction(t.id)}
              type="button"
            >
              <div
                className="ma-template-card-bg"
                style={{ background: `linear-gradient(135deg, ${t.color}22 0%, ${t.color}08 100%)` }}
              />
              <span className="text-[28px] mb-2 relative z-10">{t.icon}</span>
              <span className="text-[13px] font-semibold relative z-10" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Quick Actions Row ── */}
      <div className="flex gap-3">
        <button className="ma-quick-tool" onClick={() => onCreateAction('edit-image')} type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.21 1.21 0 0 0 1.72 0L21.64 5.36a1.21 1.21 0 0 0 0-1.72z" /><path d="m14 7 3 3" /></svg>
          <span>Edit Images</span>
        </button>
        <button className="ma-quick-tool" onClick={() => onCreateAction('animate-photo')} type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="2.18" /><path d="m10 8 6 4-6 4z" /></svg>
          <span>Animate Photos</span>
        </button>
      </div>
    </div>
  )
}
