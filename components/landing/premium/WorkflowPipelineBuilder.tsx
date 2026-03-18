'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SERVICES, type ServiceDefinition } from '@/lib/services/catalog'

/* ══════════════════════════════════════════════════════════════════
 *  ACCENT COLOURS  — one per service, matching PageEnvironment moods
 * ══════════════════════════════════════════════════════════════════ */
const ACCENT: Record<string, string> = {
  avatar: '#a78bfa', video: '#f59e0b', image: '#f472b6',
  music: '#34d399', text: '#818cf8', editing: '#06b6d4',
  photo: '#fb923c', workflow: '#fb923c', 'agent-g': '#22d3ee',
  'visual-intel': '#3b82f6', prompt: '#fbbf24', media: '#ec4899',
  business: '#8b5cf6', shop: '#10b981', software: '#6366f1',
  tourism: '#14b8a6',
}
const ac = (slug: string) => ACCENT[slug] || '#22d3ee'

/* Services shown in the builder — the 7 core creative + automation services */
const BUILDER_SLUGS = new Set(['avatar', 'video', 'image', 'music', 'text', 'workflow', 'agent-g'])
const BUILDER_SERVICES = SERVICES.filter(s => BUILDER_SLUGS.has(s.slug))

/* ══════════════════════════════════════════════════════════════════
 *  TYPES
 * ══════════════════════════════════════════════════════════════════ */
interface PNode {
  id: string
  service: ServiceDefinition
  prompt: string
  status: 'idle' | 'running' | 'complete'
}

interface Tpl {
  id: string
  icon: string
  name: { en: string; ka: string; ru: string }
  desc: { en: string; ka: string; ru: string }
  slugs: string[]
}

type Lang = 'en' | 'ka' | 'ru'

/* ══════════════════════════════════════════════════════════════════
 *  i18n
 * ══════════════════════════════════════════════════════════════════ */
const COPY = {
  en: {
    eyebrow: 'AI WORKFLOW ENGINE',
    title: 'Build Your AI Pipeline',
    sub: 'Connect services into automated workflows. Choose a template or build your own — run everything with one click.',
    templates: 'Quick Start',
    agentPlaceholder: 'Describe what you want to create\u2026',
    agentBtn: 'Build',
    services: 'Services',
    pipeline: 'Pipeline',
    step: 'STEP',
    emptyTitle: 'Start Building',
    emptyHint: 'Click a service on the left or pick a template above',
    run: 'Run Pipeline',
    reset: 'Reset',
    exportBtn: 'Export',
    processing: 'Processing\u2026',
    complete: 'Complete!',
    ready: 'Ready',
    settings: 'Node Settings',
    promptLabel: 'Prompt',
    promptPlaceholder: 'What should this step produce?',
    previewLabel: 'Preview',
    noSelection: 'Select a node to configure',
    previewHint: '\u2728 Preview will appear here',
    tryService: 'Try this service \u2192',
  },
  ka: {
    eyebrow: 'AI WORKFLOW ENGINE',
    title: '\u10d0\u10d0\u10ec\u10e7\u10d5\u10d4 \u10e8\u10d4\u10dc\u10d8 AI \u10de\u10d0\u10d8\u10de\u10da\u10d0\u10d8\u10dc\u10d8',
    sub: '\u10d3\u10d0\u10d0\u10d9\u10d0\u10d5\u10e8\u10d8\u10e0\u10d4 \u10e1\u10d4\u10e0\u10d5\u10d8\u10e1\u10d4\u10d1\u10d8 \u10d0\u10d5\u10e2\u10dd\u10db\u10d0\u10e2\u10d8\u10d6\u10d8\u10e0\u10d4\u10d1\u10e3\u10da \u10dc\u10d0\u10d9\u10d0\u10d3\u10d4\u10d1\u10e8\u10d8. \u10d0\u10d8\u10e0\u10e9\u10d8\u10d4 \u10e8\u10d0\u10d1\u10da\u10dd\u10dc\u10d8 \u10d0\u10dc \u10d0\u10d0\u10ec\u10e7\u10d5\u10d4 \u10d7\u10d0\u10d5\u10d0\u10d3 \u2014 \u10d2\u10d0\u10e3\u10e8\u10d5\u10d8 \u10e7\u10d5\u10d4\u10da\u10d0\u10e4\u10d4\u10e0\u10d8 \u10d4\u10e0\u10d7\u10d8 \u10d9\u10da\u10d8\u10d9\u10d8\u10d7.',
    templates: '\u10e1\u10ec\u10e0\u10d0\u10e4\u10d8 \u10d3\u10d0\u10ec\u10e7\u10d4\u10d1\u10d0',
    agentPlaceholder: '\u10d0\u10e6\u10ec\u10d4\u10e0\u10d4 \u10e0\u10d8\u10e1\u10d8 \u10e8\u10d4\u10e5\u10db\u10dc\u10d0 \u10d2\u10d8\u10dc\u10d3\u10d0\u2026',
    agentBtn: '\u10d0\u10ec\u10e7\u10dd\u10d1\u10d0',
    services: '\u10e1\u10d4\u10e0\u10d5\u10d8\u10e1\u10d4\u10d1\u10d8',
    pipeline: '\u10de\u10d0\u10d8\u10de\u10da\u10d0\u10d8\u10dc\u10d8',
    step: '\u10dc\u10d0\u10d1\u10d8\u10ef\u10d8',
    emptyTitle: '\u10d3\u10d0\u10d0\u10db\u10d0\u10e2\u10d4 \u10e1\u10d4\u10e0\u10d5\u10d8\u10e1\u10d4\u10d1\u10d8',
    emptyHint: '\u10d3\u10d0\u10d0\u10ed\u10d8\u10e0\u10d4 \u10e1\u10d4\u10e0\u10d5\u10d8\u10e1\u10e1 \u10db\u10d0\u10e0\u10ea\u10ee\u10dc\u10d8\u10d5 \u10d0\u10dc \u10d0\u10d8\u10e0\u10e9\u10d8\u10d4 \u10e8\u10d0\u10d1\u10da\u10dd\u10dc\u10d8',
    run: '\u10d2\u10d0\u10e8\u10d5\u10d4\u10d1\u10d0',
    reset: '\u10d2\u10d0\u10e1\u10e3\u10e4\u10d7\u10d0\u10d5\u10d4\u10d1\u10d0',
    exportBtn: '\u10d4\u10e5\u10e1\u10de\u10dd\u10e0\u10e2\u10d8',
    processing: '\u10db\u10e3\u10e8\u10d0\u10d5\u10d3\u10d4\u10d1\u10d0\u2026',
    complete: '\u10d3\u10d0\u10e1\u10e0\u10e3\u10da\u10d3\u10d0!',
    ready: '\u10db\u10d6\u10d0\u10d3\u10d0\u10d0',
    settings: '\u10dc\u10dd\u10d3\u10d8\u10e1 \u10de\u10d0\u10e0\u10d0\u10db\u10d4\u10e2\u10e0\u10d4\u10d1\u10d8',
    promptLabel: '\u10de\u10e0\u10dd\u10db\u10de\u10e2\u10d8',
    promptPlaceholder: '\u10e0\u10d0 \u10e3\u10dc\u10d3\u10d0 \u10e8\u10d4\u10e5\u10db\u10dc\u10d0\u10e1 \u10d0\u10db \u10dc\u10d0\u10d1\u10d8\u10ef\u10db\u10d0?',
    previewLabel: '\u10de\u10e0\u10d4\u10d5\u10d8\u10e3',
    noSelection: '\u10d0\u10d8\u10e0\u10e9\u10d8\u10d4 \u10dc\u10dd\u10d3\u10d8 \u10d9\u10dd\u10dc\u10e4\u10d8\u10d2\u10e3\u10e0\u10d0\u10ea\u10d8\u10d8\u10e1\u10d7\u10d5\u10d8\u10e1',
    previewHint: '\u2728 \u10de\u10e0\u10d4\u10d5\u10d8\u10e3 \u10d0\u10e5 \u10d2\u10d0\u10db\u10dd\u10e9\u10dc\u10d3\u10d4\u10d1\u10d0',
    tryService: '\u10e1\u10ea\u10d0\u10d3\u10d4 \u10e1\u10d4\u10e0\u10d5\u10d8\u10e1\u10d8 \u2192',
  },
  ru: {
    eyebrow: 'AI WORKFLOW ENGINE',
    title: '\u041f\u043e\u0441\u0442\u0440\u043e\u0439 \u0441\u0432\u043e\u0439 AI-\u043f\u0430\u0439\u043f\u043b\u0430\u0439\u043d',
    sub: '\u0421\u043e\u0435\u0434\u0438\u043d\u044f\u0439 \u0441\u0435\u0440\u0432\u0438\u0441\u044b \u0432 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u044b\u0435 \u043f\u043e\u0442\u043e\u043a\u0438. \u0412\u044b\u0431\u0435\u0440\u0438 \u0448\u0430\u0431\u043b\u043e\u043d \u0438\u043b\u0438 \u043f\u043e\u0441\u0442\u0440\u043e\u0439 \u0441\u0430\u043c \u2014 \u0437\u0430\u043f\u0443\u0441\u0442\u0438 \u0432\u0441\u0451 \u043e\u0434\u043d\u0438\u043c \u043a\u043b\u0438\u043a\u043e\u043c.',
    templates: '\u0411\u044b\u0441\u0442\u0440\u044b\u0439 \u0441\u0442\u0430\u0440\u0442',
    agentPlaceholder: '\u041e\u043f\u0438\u0448\u0438, \u0447\u0442\u043e \u0445\u043e\u0447\u0435\u0448\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c\u2026',
    agentBtn: '\u0421\u043e\u0431\u0440\u0430\u0442\u044c',
    services: '\u0421\u0435\u0440\u0432\u0438\u0441\u044b',
    pipeline: '\u041f\u0430\u0439\u043f\u043b\u0430\u0439\u043d',
    step: '\u0428\u0410\u0413',
    emptyTitle: '\u0414\u043e\u0431\u0430\u0432\u044c \u0441\u0435\u0440\u0432\u0438\u0441\u044b',
    emptyHint: '\u041d\u0430\u0436\u043c\u0438 \u043d\u0430 \u0441\u0435\u0440\u0432\u0438\u0441 \u0441\u043b\u0435\u0432\u0430 \u0438\u043b\u0438 \u0432\u044b\u0431\u0435\u0440\u0438 \u0448\u0430\u0431\u043b\u043e\u043d',
    run: '\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c',
    reset: '\u0421\u0431\u0440\u043e\u0441',
    exportBtn: '\u042d\u043a\u0441\u043f\u043e\u0440\u0442',
    processing: '\u041e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430\u2026',
    complete: '\u0413\u043e\u0442\u043e\u0432\u043e!',
    ready: '\u0413\u043e\u0442\u043e\u0432',
    settings: '\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0443\u0437\u043b\u0430',
    promptLabel: '\u041f\u0440\u043e\u043c\u043f\u0442',
    promptPlaceholder: '\u0427\u0442\u043e \u0434\u043e\u043b\u0436\u0435\u043d \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u044d\u0442\u043e\u0442 \u0448\u0430\u0433?',
    previewLabel: '\u041f\u0440\u0435\u0432\u044c\u044e',
    noSelection: '\u0412\u044b\u0431\u0435\u0440\u0438 \u0443\u0437\u0435\u043b \u0434\u043b\u044f \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438',
    previewHint: '\u2728 \u041f\u0440\u0435\u0432\u044c\u044e \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u0437\u0434\u0435\u0441\u044c',
    tryService: '\u041f\u043e\u043f\u0440\u043e\u0431\u043e\u0432\u0430\u0442\u044c \u0441\u0435\u0440\u0432\u0438\u0441 \u2192',
  },
} as const

/* ══════════════════════════════════════════════════════════════════
 *  PIPELINE TEMPLATES
 * ══════════════════════════════════════════════════════════════════ */
const TEMPLATES: Tpl[] = [
  {
    id: 'social',
    icon: '\uD83D\uDCF1',
    name: { en: 'Social Content', ka: '\u10e1\u10dd\u10ea\u10d8\u10d0\u10da\u10e3\u10e0\u10d8 \u10d9\u10dd\u10dc\u10e2\u10d4\u10dc\u10e2\u10d8', ru: '\u0421\u043e\u0446\u0441\u0435\u0442\u0438' },
    desc: { en: 'Write \u2192 Design \u2192 Produce', ka: '\u10e2\u10d4\u10e5\u10e1\u10e2\u10d8 \u2192 \u10d3\u10d8\u10d6\u10d0\u10d8\u10dc\u10d8 \u2192 \u10d5\u10d8\u10d3\u10d4\u10dd', ru: '\u0422\u0435\u043a\u0441\u0442 \u2192 \u0414\u0438\u0437\u0430\u0439\u043d \u2192 \u0412\u0438\u0434\u0435\u043e' },
    slugs: ['text', 'image', 'video'],
  },
  {
    id: 'music-video',
    icon: '\uD83C\uDFB5',
    name: { en: 'Music Video', ka: '\u10db\u10e3\u10e1\u10d8\u10d9\u10d0\u10da\u10e3\u10e0\u10d8 \u10d5\u10d8\u10d3\u10d4\u10dd', ru: '\u041a\u043b\u0438\u043f' },
    desc: { en: 'Compose \u2192 Visualize \u2192 Render', ka: '\u10d9\u10dd\u10db\u10de\u10dd\u10d6\u10d8\u10ea\u10d8\u10d0 \u2192 \u10d5\u10d8\u10d6\u10e3\u10d0\u10da\u10d8 \u2192 \u10e0\u10d4\u10dc\u10d3\u10d4\u10e0\u10d8', ru: '\u041c\u0443\u0437\u044b\u043a\u0430 \u2192 \u0412\u0438\u0437\u0443\u0430\u043b \u2192 \u0420\u0435\u043d\u0434\u0435\u0440' },
    slugs: ['text', 'music', 'image', 'video'],
  },
  {
    id: 'brand',
    icon: '\u2728',
    name: { en: 'Brand Identity', ka: '\u10d1\u10e0\u10d4\u10dc\u10d3\u10d8', ru: '\u0411\u0440\u0435\u043d\u0434' },
    desc: { en: 'Avatar \u2192 Visuals \u2192 Copy', ka: '\u10d0\u10d5\u10d0\u10e2\u10d0\u10e0\u10d8 \u2192 \u10d5\u10d8\u10d6\u10e3\u10d0\u10da\u10d8 \u2192 \u10d9\u10dd\u10de\u10d8', ru: '\u0410\u0432\u0430\u0442\u0430\u0440 \u2192 \u0412\u0438\u0437\u0443\u0430\u043b \u2192 \u0422\u0435\u043a\u0441\u0442' },
    slugs: ['avatar', 'image', 'text'],
  },
  {
    id: 'full',
    icon: '\uD83D\uDE80',
    name: { en: 'Full Production', ka: '\u10e1\u10e0\u10e3\u10da\u10d8 \u10de\u10e0\u10dd\u10d3\u10d0\u10e5\u10e8\u10d4\u10dc\u10d8', ru: '\u041f\u043e\u043b\u043d\u044b\u0439 \u043f\u0440\u043e\u0434\u0430\u043a\u0448\u043d' },
    desc: { en: 'End-to-end content pipeline', ka: '\u10e1\u10e0\u10e3\u10da\u10d8 \u10d9\u10dd\u10dc\u10e2\u10d4\u10dc\u10e2 \u10de\u10d0\u10d8\u10de\u10da\u10d0\u10d8\u10dc\u10d8', ru: '\u041f\u043e\u043b\u043d\u044b\u0439 \u043a\u043e\u043d\u0442\u0435\u043d\u0442-\u043f\u0430\u0439\u043f\u043b\u0430\u0439\u043d' },
    slugs: ['text', 'avatar', 'image', 'music', 'video'],
  },
]

/* ══════════════════════════════════════════════════════════════════
 *  HELPERS
 * ══════════════════════════════════════════════════════════════════ */
let _nodeId = 0
const uid = (slug: string) => `${slug}-${++_nodeId}-${Date.now()}`

const matchTemplate = (prompt: string): string => {
  const l = prompt.toLowerCase()
  if (l.includes('music') && (l.includes('video') || l.includes('clip'))) return 'music-video'
  if (l.includes('social') || l.includes('post') || l.includes('instagram') || l.includes('tiktok')) return 'social'
  if (l.includes('brand') || l.includes('identity') || l.includes('logo')) return 'brand'
  return 'full'
}

/* ══════════════════════════════════════════════════════════════════
 *  SUB-COMPONENTS
 * ══════════════════════════════════════════════════════════════════ */

/* ── Template card ── */
function TplCard({ t, lang, active, onPick }: { t: Tpl; lang: Lang; active: boolean; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all duration-200 active:scale-[0.97] select-none whitespace-nowrap"
      style={{
        background: active
          ? 'linear-gradient(135deg, rgba(34,211,238,0.18), rgba(6,182,212,0.08))'
          : 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
        border: active ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: active ? '0 0 24px rgba(34,211,238,0.1)' : 'none',
      }}
    >
      <span className="text-base">{t.icon}</span>
      <div className="text-left">
        <div className="text-xs font-bold" style={{ color: active ? '#22d3ee' : 'rgba(255,255,255,0.85)' }}>
          {t.name[lang]}
        </div>
        <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {t.desc[lang]}
        </div>
      </div>
    </button>
  )
}

/* ── Service chip (sidebar) ── */
function SvcChip({ s, lang, inPipeline, onAdd }: {
  s: ServiceDefinition; lang: Lang; inPipeline: boolean; onAdd: () => void
}) {
  const color = ac(s.slug)
  return (
    <button
      onClick={onAdd}
      className="group relative shrink-0 lg:w-full flex items-center gap-2 px-3 py-2 lg:py-2.5 rounded-xl text-left transition-all duration-200 active:scale-[0.97] select-none"
      style={{
        background: inPipeline
          ? `linear-gradient(135deg, ${color}22, ${color}0a)`
          : 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
        border: inPipeline ? `1px solid ${color}55` : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span className="text-lg shrink-0">{s.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold truncate" style={{ color: inPipeline ? color : 'rgba(255,255,255,0.8)' }}>
          {s.title[lang] || s.title.en}
        </div>
        <div className="text-[10px] truncate hidden lg:block" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {s.description[lang] || s.description.en}
        </div>
      </div>
      {inPipeline ? (
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
      ) : (
        <span className="text-[9px] font-bold opacity-0 group-hover:opacity-60 transition-opacity" style={{ color }}>+</span>
      )}
    </button>
  )
}

/* ── Pipeline node card ── */
function NodeCard({ node, lang, index, stepLabel, selected, onSelect, onRemove }: {
  node: PNode; lang: Lang; index: number; stepLabel: string
  selected: boolean; onSelect: () => void; onRemove: () => void
}) {
  const color = ac(node.service.slug)
  const running = node.status === 'running'
  const done = node.status === 'complete'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.25 }}
      onClick={onSelect}
      className="shrink-0 cursor-pointer group w-[240px] lg:w-[160px]"
    >
      <div
        className="relative rounded-2xl p-[1px] overflow-hidden transition-all duration-300"
        style={{
          background: selected
            ? `linear-gradient(135deg, ${color}88, ${color}33)`
            : running
              ? `linear-gradient(135deg, ${color}55, ${color}22)`
              : 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03))',
          boxShadow: running
            ? `0 0 30px ${color}33`
            : selected
              ? `0 0 20px ${color}22`
              : 'none',
        }}
      >
        <div
          className="rounded-2xl p-3"
          style={{ background: 'linear-gradient(165deg, #0f1923, #0a1018)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[8px] font-black tracking-[0.15em] px-1.5 py-0.5 rounded"
              style={{
                background: `${color}22`,
                border: `1px solid ${color}33`,
                color,
              }}
            >
              {stepLabel} {index + 1}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              className="w-5 h-5 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
              style={{
                background: 'rgba(255,70,70,0.15)',
                border: '1px solid rgba(255,70,70,0.2)',
                color: 'rgba(255,120,120,0.8)',
              }}
              aria-label="Remove"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Icon */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mx-auto mb-2"
            style={{
              background: `linear-gradient(135deg, ${color}18, ${color}08)`,
              border: `1px solid ${color}25`,
            }}
          >
            {node.service.icon}
          </div>

          {/* Name */}
          <div className="text-[11px] font-bold text-center truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>
            {node.service.title[lang] || node.service.title.en}
          </div>

          {/* Status */}
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: done ? '#34d399' : running ? '#fbbf24' : `${color}88`,
                boxShadow: running ? '0 0 8px #fbbf24' : done ? '0 0 8px #34d399' : `0 0 4px ${color}44`,
                animation: running ? 'pulse 0.8s ease-in-out infinite' : undefined,
              }}
            />
            <span className="text-[9px]" style={{ color: done ? '#34d399' : running ? '#fbbf24' : 'rgba(255,255,255,0.25)' }}>
              {done ? '\u2713' : running ? '\u23F3' : node.prompt ? '\u25CF' : '\u25CB'}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ── Horizontal arrow connector (desktop) ── */
function HArrow({ color, active }: { color: string; active: boolean }) {
  return (
    <div className="hidden lg:flex items-center shrink-0 px-0.5">
      <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
        <line x1="0" y1="10" x2="24" y2="10" stroke={active ? color : 'rgba(255,255,255,0.12)'} strokeWidth="1.5" strokeDasharray="4 3">
          {active && <animate attributeName="stroke-dashoffset" from="14" to="0" dur="0.8s" repeatCount="indefinite" />}
        </line>
        <polygon points="24,5 32,10 24,15" fill={active ? color : 'rgba(255,255,255,0.1)'} />
      </svg>
    </div>
  )
}

/* ── Vertical arrow connector (mobile) ── */
function VArrow({ color, active }: { color: string; active: boolean }) {
  return (
    <div className="flex lg:hidden items-center justify-center py-1">
      <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
        <line x1="10" y1="0" x2="10" y2="18" stroke={active ? color : 'rgba(255,255,255,0.12)'} strokeWidth="1.5" strokeDasharray="4 3">
          {active && <animate attributeName="stroke-dashoffset" from="14" to="0" dur="0.8s" repeatCount="indefinite" />}
        </line>
        <polygon points="5,18 10,24 15,18" fill={active ? color : 'rgba(255,255,255,0.1)'} />
      </svg>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
 *  MAIN EXPORT — WorkflowPipelineBuilder
 * ══════════════════════════════════════════════════════════════════════ */
export function WorkflowPipelineBuilder() {
  const { language } = useLanguage()
  const lang = (language as Lang) || 'en'
  const c = COPY[lang] || COPY.en

  /* ── State ── */
  const [pipeline, setPipeline] = useState<PNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [agentPrompt, setAgentPrompt] = useState('')
  const [agentThinking, setAgentThinking] = useState(false)
  const [activeTpl, setActiveTpl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])

  const selected = pipeline.find(n => n.id === selectedId) || null
  const slugsUsed = new Set(pipeline.map(n => n.service.slug))

  /* Cleanup timers on unmount */
  useEffect(() => {
    return () => { timers.current.forEach(clearTimeout) }
  }, [])

  /* ── Actions ── */
  const addService = useCallback((svc: ServiceDefinition) => {
    const id = uid(svc.slug)
    setPipeline(prev => [...prev, { id, service: svc, prompt: '', status: 'idle' }])
    setSelectedId(id)
    setIsComplete(false)
    setActiveTpl(null)
    setTimeout(() => canvasRef.current?.scrollTo({ left: canvasRef.current.scrollWidth, behavior: 'smooth' }), 80)
  }, [])

  const removeNode = useCallback((id: string) => {
    setPipeline(prev => prev.filter(n => n.id !== id))
    setSelectedId(prev => prev === id ? null : prev)
    setIsComplete(false)
  }, [])

  const updatePrompt = useCallback((id: string, prompt: string) => {
    setPipeline(prev => prev.map(n => n.id === id ? { ...n, prompt } : n))
  }, [])

  const loadTemplate = useCallback((tpl: Tpl) => {
    const nodes: PNode[] = tpl.slugs
      .map(slug => {
        const svc = SERVICES.find(s => s.slug === slug)
        return svc ? { id: uid(slug), service: svc, prompt: '', status: 'idle' as const } : null
      })
      .filter(Boolean) as PNode[]
    setPipeline(nodes)
    setSelectedId(null)
    setActiveTpl(tpl.id)
    setIsComplete(false)
    setIsRunning(false)
  }, [])

  const runPipeline = useCallback(() => {
    if (!pipeline.length || isRunning) return
    setIsRunning(true)
    setIsComplete(false)
    setPipeline(prev => prev.map(n => ({ ...n, status: 'idle' as const })))

    timers.current.forEach(clearTimeout)
    timers.current = []

    pipeline.forEach((_, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setPipeline(prev => prev.map((n, j) => j === i ? { ...n, status: 'running' as const } : n))
        }, i * 900),
        window.setTimeout(() => {
          setPipeline(prev => prev.map((n, j) => j === i ? { ...n, status: 'complete' as const } : n))
        }, i * 900 + 650),
      )
    })

    timers.current.push(
      window.setTimeout(() => { setIsRunning(false); setIsComplete(true) }, pipeline.length * 900 + 650),
    )
  }, [pipeline, isRunning])

  const resetPipeline = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setPipeline([])
    setSelectedId(null)
    setIsRunning(false)
    setIsComplete(false)
    setActiveTpl(null)
  }, [])

  const handleAgentBuild = useCallback(() => {
    if (!agentPrompt.trim() || agentThinking) return
    setAgentThinking(true)
    const tplId = matchTemplate(agentPrompt)
    setTimeout(() => {
      const tpl = TEMPLATES.find(t => t.id === tplId)
      if (tpl) loadTemplate(tpl)
      setAgentPrompt('')
      setAgentThinking(false)
    }, 600)
  }, [agentPrompt, agentThinking, loadTemplate])

  /* ── Render ── */
  return (
    <section className="cinematic-section relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Background textures */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(34,211,238,0.04) 0%, transparent 70%)' }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.012]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      <div className="absolute top-0 left-0 w-[500px] h-[500px] pointer-events-none" style={{ background: 'radial-gradient(circle at 20% 20%, rgba(34,211,238,0.06), transparent 60%)', filter: 'blur(100px)' }} />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] pointer-events-none" style={{ background: 'radial-gradient(circle at 80% 80%, rgba(6,182,212,0.05), transparent 60%)', filter: 'blur(100px)' }} />

      <div className="relative max-w-6xl mx-auto">

        {/* ═══════════ HEADER ═══════════ */}
        <div className="text-center mb-10 sm:mb-14">
          <p className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase font-black mb-3" style={{ color: '#22d3ee', textShadow: '0 0 20px rgba(34,211,238,0.3)' }}>
            {c.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.95)' }}>
            {c.title}
          </h2>
          <p className="mt-4 text-sm sm:text-base max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {c.sub}
          </p>
        </div>

        {/* ═══════════ TEMPLATES BAR ═══════════ */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-black tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {c.templates}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {TEMPLATES.map(t => (
              <TplCard key={t.id} t={t} lang={lang} active={activeTpl === t.id} onPick={() => loadTemplate(t)} />
            ))}
          </div>
        </div>

        {/* ═══════════ AGENT G PROMPT BAR ═══════════ */}
        <div className="mb-6">
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span className="text-lg shrink-0">{agentThinking ? '\u23F3' : '\uD83E\uDD16'}</span>
            <input
              type="text"
              value={agentPrompt}
              onChange={e => setAgentPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAgentBuild()}
              placeholder={c.agentPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'rgba(255,255,255,0.8)' }}
            />
            <button
              onClick={handleAgentBuild}
              disabled={!agentPrompt.trim() || agentThinking}
              className="shrink-0 text-xs font-bold px-4 py-2 rounded-lg transition-all active:scale-95 disabled:opacity-30"
              style={{
                background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(6,182,212,0.1))',
                border: '1px solid rgba(34,211,238,0.3)',
                color: '#22d3ee',
              }}
            >
              {agentThinking ? '\u23F3' : c.agentBtn}
            </button>
          </div>
        </div>

        {/* ═══════════ MAIN PANEL ═══════════ */}
        <div
          className="holo-panel relative !rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(170deg, #0b1219, #080e14 40%, #0a1018)',
            boxShadow: '0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(34,211,238,0.04), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {/* Window chrome */}
          <div
            className="flex items-center justify-between px-4 sm:px-6 py-3"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,95,87,0.7)' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,189,46,0.7)' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(39,201,63,0.7)' }} />
              </div>
              <span className="ml-3 text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
                PIPELINE STUDIO
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{
                  backgroundColor: isRunning ? '#fbbf24' : isComplete ? '#34d399' : '#22d3ee',
                  boxShadow: `0 0 6px ${isRunning ? '#fbbf24' : isComplete ? '#34d399' : '#22d3ee'}`,
                }}
              />
              <span className="text-[9px] font-bold" style={{ color: isRunning ? 'rgba(251,191,36,0.7)' : isComplete ? 'rgba(52,211,153,0.7)' : 'rgba(34,211,238,0.6)' }}>
                {isRunning ? c.processing : isComplete ? c.complete : 'ONLINE'}
              </span>
            </div>
          </div>

          {/* ── Inner layout: sidebar + canvas + preview ── */}
          <div className="flex flex-col lg:flex-row min-h-[480px]">

            {/* LEFT — Services Library */}
            <div
              className="lg:w-[200px] shrink-0 p-4 overflow-x-auto lg:overflow-y-auto border-b lg:border-b-0 lg:border-r"
              style={{ borderColor: 'rgba(255,255,255,0.04)', maxHeight: '600px' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                </svg>
                <span className="text-[10px] font-bold tracking-[0.1em] uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {c.services}
                </span>
              </div>
              <div className="flex lg:flex-col gap-2 lg:gap-1.5">
                {BUILDER_SERVICES.map(s => (
                  <SvcChip key={s.slug} s={s} lang={lang} inPipeline={slugsUsed.has(s.slug)} onAdd={() => addService(s)} />
                ))}
              </div>
            </div>

            {/* CENTER — Canvas + Inspector + Action Bar */}
            <div className="flex-1 flex flex-col p-4 sm:p-5 min-w-0">
              {/* Pipeline header */}
              <div className="flex items-center gap-2 mb-3">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round">
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
                </svg>
                <span className="text-[10px] font-bold tracking-[0.1em] uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {c.pipeline}
                </span>
                {pipeline.length > 0 && (
                  <span
                    className="text-[10px] font-black px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee' }}
                  >
                    {pipeline.length}
                  </span>
                )}
              </div>

              {/* ── Pipeline canvas ── */}
              <div
                ref={canvasRef}
                className="flex-1 min-h-[240px] overflow-x-auto overflow-y-auto rounded-xl p-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.015), rgba(255,255,255,0.005))',
                  border: '1px solid rgba(255,255,255,0.04)',
                  backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
                  backgroundSize: '28px 28px',
                }}
              >
                {pipeline.length === 0 ? (
                  /* Empty state */
                  <div className="flex items-center justify-center h-full min-h-[200px]">
                    <div className="text-center">
                      <div
                        className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)' }}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{c.emptyTitle}</p>
                      <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.18)' }}>{c.emptyHint}</p>
                    </div>
                  </div>
                ) : (
                  /* Node flow — horizontal on desktop, vertical on mobile */
                  <div className="flex flex-col lg:flex-row items-center">
                    <AnimatePresence mode="popLayout">
                      {pipeline.map((node, i) => (
                        <div key={node.id} className="flex flex-col lg:flex-row items-center">
                          <NodeCard
                            node={node}
                            lang={lang}
                            index={i}
                            stepLabel={c.step}
                            selected={selectedId === node.id}
                            onSelect={() => setSelectedId(selectedId === node.id ? null : node.id)}
                            onRemove={() => removeNode(node.id)}
                          />
                          {i < pipeline.length - 1 && (
                            <>
                              <HArrow
                                color={ac(node.service.slug)}
                                active={node.status === 'complete' && pipeline[i + 1]?.status === 'running'}
                              />
                              <VArrow
                                color={ac(node.service.slug)}
                                active={node.status === 'complete' && pipeline[i + 1]?.status === 'running'}
                              />
                            </>
                          )}
                        </div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* ── Action bar ── */}
              {pipeline.length > 0 && (
                <div className="mt-4 pt-4 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* Status */}
                  <div className="flex items-center gap-1.5 mr-auto">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: isComplete ? '#34d399' : isRunning ? '#fbbf24' : '#22d3ee',
                        boxShadow: `0 0 8px ${isComplete ? '#34d399' : isRunning ? '#fbbf24' : '#22d3ee'}`,
                        animation: isRunning ? 'pulse 0.6s ease-in-out infinite' : undefined,
                      }}
                    />
                    <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {isRunning ? c.processing : isComplete ? c.complete : c.ready}
                    </span>
                  </div>

                  {/* Run */}
                  <button
                    onClick={runPipeline}
                    disabled={isRunning}
                    className="cinematic-btn cinematic-btn-primary rounded-xl px-6 py-2.5 disabled:opacity-40"
                  >
                    <span className="relative text-xs font-black tracking-wider text-white uppercase">
                      {isRunning ? `\u23F3 ${c.processing}` : `\u26A1 ${c.run}`}
                    </span>
                  </button>

                  {/* Export */}
                  <button
                    onClick={() => {
                      const desc = pipeline.map((n, i) => `${i + 1}. ${n.service.title.en}${n.prompt ? ': ' + n.prompt : ''}`).join('\n')
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(desc).catch(() => {})
                      }
                    }}
                    className="rounded-xl px-4 py-2.5 text-xs font-bold tracking-wider uppercase transition-all active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                  >
                    {c.exportBtn}
                  </button>

                  {/* Reset */}
                  <button
                    onClick={resetPipeline}
                    className="rounded-xl px-4 py-2.5 text-xs font-bold tracking-wider uppercase transition-all active:scale-95"
                    style={{ background: 'rgba(255,70,70,0.08)', border: '1px solid rgba(255,70,70,0.15)', color: 'rgba(255,120,120,0.6)' }}
                  >
                    {c.reset}
                  </button>
                </div>
              )}
            </div>

            {/* RIGHT — Preview / Settings Panel (desktop) */}
            <div
              className="hidden lg:flex lg:w-[220px] shrink-0 flex-col p-4 border-l overflow-y-auto"
              style={{ borderColor: 'rgba(255,255,255,0.04)', maxHeight: '600px' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" />
                </svg>
                <span className="text-[10px] font-bold tracking-[0.1em] uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {c.settings}
                </span>
              </div>

              {selected ? (
                <div className="flex-1 flex flex-col">
                  {/* Selected node header */}
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                      style={{ background: `${ac(selected.service.slug)}15`, border: `1px solid ${ac(selected.service.slug)}25` }}
                    >
                      {selected.service.icon}
                    </div>
                    <div>
                      <div className="text-[11px] font-bold" style={{ color: ac(selected.service.slug) }}>
                        {selected.service.title[lang] || selected.service.title.en}
                      </div>
                      <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {c.step} {pipeline.findIndex(n => n.id === selected.id) + 1}
                      </div>
                    </div>
                  </div>

                  {/* Prompt */}
                  <label className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {c.promptLabel}
                  </label>
                  <textarea
                    value={selected.prompt}
                    onChange={e => updatePrompt(selected.id, e.target.value)}
                    placeholder={c.promptPlaceholder}
                    rows={3}
                    className="w-full bg-transparent rounded-lg px-2.5 py-2 text-[11px] outline-none resize-none mb-3"
                    style={{ color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)' }}
                  />

                  {/* Preview */}
                  <label className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {c.previewLabel}
                  </label>
                  <div
                    className="flex-1 rounded-lg min-h-[80px] flex items-center justify-center mb-3"
                    style={{ background: `linear-gradient(135deg, ${ac(selected.service.slug)}08, ${ac(selected.service.slug)}03)`, border: `1px solid ${ac(selected.service.slug)}15` }}
                  >
                    <div className="text-center p-2">
                      <div className="text-2xl mb-1">{selected.service.icon}</div>
                      <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                        {selected.prompt ? c.previewHint : c.noSelection}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="space-y-1.5">
                    <Link
                      href={`/${language}/services/${selected.service.slug}`}
                      className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-[10px] font-bold transition-all active:scale-95"
                      style={{ background: `${ac(selected.service.slug)}15`, border: `1px solid ${ac(selected.service.slug)}25`, color: ac(selected.service.slug) }}
                    >
                      {c.tryService}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" className="mx-auto mb-2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /></svg>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.18)' }}>{c.noSelection}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
