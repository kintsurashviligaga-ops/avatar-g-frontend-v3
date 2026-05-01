'use client';

/**
 * ImagePanel — AI Image generation with style controls,
 * aspect ratio, seed, negative prompt, and output gallery.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, RefreshCw, Download, Share2, ZoomIn,
  Shuffle, Lock, AlertCircle, Loader2, ImageIcon, SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAiPipeline } from '@/hooks/useAiPipeline';
import { beginPanelShellRun, createTextPreview } from './panelShellBridge';
import type { PanelRunCallbacks } from '@/types/dashboard';

// ─── Config ───────────────────────────────────────────────────

const STYLES = [
  { id: 'photorealistic', label: 'Photorealistic', emoji: '📸' },
  { id: 'digital-art',    label: 'Digital Art',    emoji: '🎨' },
  { id: 'oil-painting',   label: 'Oil Painting',   emoji: '🖼️' },
  { id: 'watercolor',     label: 'Watercolor',     emoji: '💧' },
  { id: 'anime',          label: 'Anime',          emoji: '✨' },
  { id: 'cinematic',      label: 'Cinematic',      emoji: '🎬' },
  { id: '3d-render',      label: '3D Render',      emoji: '🎭' },
  { id: 'minimalist',     label: 'Minimalist',     emoji: '◾' },
];

const RATIOS = [
  { id: '1:1',   label: '1:1',    w: 1, h: 1 },
  { id: '4:3',   label: '4:3',    w: 4, h: 3 },
  { id: '16:9',  label: '16:9',   w: 16, h: 9 },
  { id: '9:16',  label: '9:16',   w: 9, h: 16 },
  { id: '3:4',   label: '3:4',    w: 3, h: 4 },
];

const LIGHTING = [
  { id: 'studio', label: 'Studio' },
  { id: 'golden', label: 'Golden Hour' },
  { id: 'neon',   label: 'Neon' },
  { id: 'dramatic', label: 'Dramatic' },
  { id: 'soft',   label: 'Soft' },
];

const QUICK_PROMPTS = [
  { label: 'Portrait',  p: 'Photorealistic portrait of a person, studio lighting, bokeh background, 8k' },
  { label: 'Landscape', p: 'Epic mountain landscape at sunset, dramatic clouds, cinematic, ultra detailed' },
  { label: 'Product',   p: 'Premium product shot on white background, studio lighting, commercial photography' },
  { label: 'Abstract',  p: 'Abstract digital art, flowing colors, neon accents, dark background, 4k' },
];

const SAMPLE_OUTPUTS = ['from-blue-600 to-violet-700', 'from-orange-600 to-red-700', 'from-emerald-600 to-teal-700', 'from-pink-600 to-rose-700'];

// ─── Component ────────────────────────────────────────────────

export function ImagePanel({ locale: _locale, callbacks }: { locale: string; callbacks?: PanelRunCallbacks }) {
  const [style,    setStyle]    = useState('photorealistic');
  const [ratio,    setRatio]    = useState('1:1');
  const [lighting, setLighting] = useState('studio');
  const [prompt,   setPrompt]   = useState('');
  const [negPrompt,setNegPrompt]= useState('');
  const [seed,     setSeed]     = useState('');
  const [seedLocked, setSeedLocked] = useState(false);
  const [showNeg,  setShowNeg]  = useState(false);
  const [tab,      setTab]      = useState<'generate' | 'gallery'>('generate');

  const { run, loading, error, lastResult, clearError } = useAiPipeline('image');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const detail = `Style: ${style}, Ratio: ${ratio}, Lighting: ${lighting}${negPrompt ? `, Negative: ${negPrompt}` : ''}`;
    const shellRun = beginPanelShellRun(callbacks, 'image', 'Image Creator', 14);

    await run(
      { prompt, context: detail },
      {
        onSuccess: (result) => {
          shellRun.complete(detail, createTextPreview('Image Creator', detail, result.result));
        },
        onError: (message) => {
          shellRun.fail(message);
        },
      },
    );
  };

  const randomSeed = () => setSeed(String(Math.floor(Math.random() * 99999999)));

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg">
            <span className="text-lg">🖼️</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Image Creator</h1>
            <p className="text-[12px] text-white/40">Generate AI images with full style control</p>
          </div>
          <div className="ml-auto flex gap-1 p-1 bg-white/[0.04] rounded-xl border border-white/[0.07]">
            {(['generate', 'gallery'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all capitalize',
                  tab === t ? 'bg-white/[0.1] text-white' : 'text-white/40 hover:text-white/70')}
              >{t}</button>
            ))}
          </div>
        </div>

        {tab === 'generate' ? (
          <div className="grid lg:grid-cols-[1fr_300px] gap-5">
            <div className="space-y-4">

              {/* Prompt */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Prompt</p>
                  <span className="text-[10px] text-white/25">{prompt.length}/1000</span>
                </div>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value.slice(0, 1000))}
                  placeholder="Describe the image you want to generate…"
                  rows={3}
                  className="w-full px-4 py-3 rounded-2xl border border-white/[0.10] bg-white/[0.03] text-white/80 placeholder:text-white/25 text-[13px] resize-none outline-none focus:border-teal-400/40 focus:bg-teal-400/[0.03] transition-all"
                />

                {/* Quick prompts */}
                <div className="mt-2 flex gap-2 flex-wrap">
                  {QUICK_PROMPTS.map(q => (
                    <button key={q.label} onClick={() => setPrompt(q.p)}
                      className="px-2.5 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/40 hover:text-white/70 hover:border-white/[0.15] text-[10px] font-medium transition-all">
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Style</p>
                <div className="grid grid-cols-4 gap-2">
                  {STYLES.map(s => (
                    <button key={s.id} onClick={() => setStyle(s.id)}
                      className={cn('flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-[11px] font-medium transition-all',
                        style === s.id
                          ? 'border-teal-400/40 bg-teal-400/[0.10] text-teal-200'
                          : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                      <span>{s.emoji}</span><span>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Lighting */}
              <div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Lighting</p>
                <div className="flex gap-2 flex-wrap">
                  {LIGHTING.map(l => (
                    <button key={l.id} onClick={() => setLighting(l.id)}
                      className={cn('px-3 py-1.5 rounded-xl border text-[12px] font-medium transition-all',
                        lighting === l.id
                          ? 'border-cyan-400/40 bg-cyan-400/[0.10] text-cyan-200'
                          : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced options toggle */}
              <button onClick={() => setShowNeg(v => !v)}
                className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors">
                <SlidersHorizontal size={11} />
                {showNeg ? 'Hide' : 'Show'} advanced options
              </button>

              <AnimatePresence>
                {showNeg && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3"
                  >
                    {/* Negative prompt */}
                    <div>
                      <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Negative Prompt</p>
                      <input
                        value={negPrompt}
                        onChange={e => setNegPrompt(e.target.value)}
                        placeholder="Elements to exclude (e.g. blurry, watermark, text)"
                        className="w-full px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-white/70 placeholder:text-white/25 text-[12px] outline-none focus:border-teal-400/30 transition-all"
                      />
                    </div>

                    {/* Seed */}
                    <div>
                      <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Seed</p>
                      <div className="flex gap-2">
                        <input
                          value={seed}
                          onChange={e => setSeed(e.target.value)}
                          disabled={seedLocked}
                          placeholder="Random seed…"
                          className="flex-1 px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-white/70 placeholder:text-white/25 text-[12px] outline-none focus:border-teal-400/30 transition-all disabled:opacity-40"
                        />
                        <button onClick={randomSeed}
                          className="px-3 py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition-colors">
                          <Shuffle size={13} />
                        </button>
                        <button onClick={() => setSeedLocked(v => !v)}
                          className={cn('px-3 py-2 rounded-xl border transition-colors',
                            seedLocked ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300' : 'border-white/[0.08] bg-white/[0.03] text-white/40 hover:text-white/70')}>
                          <Lock size={13} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-start gap-2.5 px-4 py-3 rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] text-rose-300">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <p className="text-[12px] flex-1">{error}</p>
                    <button onClick={clearError} className="text-rose-400/60">×</button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Generate */}
              <button onClick={handleGenerate} disabled={loading || !prompt.trim()}
                className={cn('w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[14px] font-bold transition-all',
                  loading || !prompt.trim()
                    ? 'bg-white/[0.05] border border-white/[0.08] text-white/25 cursor-not-allowed'
                    : 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-[0_0_24px_rgba(20,184,166,0.4)] hover:shadow-[0_0_32px_rgba(20,184,166,0.55)] hover:scale-[1.01]')}>
                {loading ? (<><Loader2 size={16} className="animate-spin" />Generating image…</>) : (<><Sparkles size={16} />Generate Image  ·  5 credits</>)}
              </button>
            </div>

            {/* Preview */}
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Aspect Ratio</p>
                <div className="flex gap-2 flex-wrap">
                  {RATIOS.map(r => (
                    <button key={r.id} onClick={() => setRatio(r.id)}
                      className={cn('px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition-all',
                        ratio === r.id
                          ? 'border-teal-400/40 bg-teal-400/[0.10] text-teal-200'
                          : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Canvas */}
              <div className={cn('relative rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden flex items-center justify-center',
                ratio === '16:9' ? 'aspect-video' : ratio === '9:16' ? 'aspect-[9/16]' : ratio === '4:3' ? 'aspect-[4/3]' : ratio === '3:4' ? 'aspect-[3/4]' : 'aspect-square')}>
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full border-2 border-teal-400/40 border-t-teal-400 animate-spin" />
                    <p className="text-[12px] text-teal-300/80">Generating…</p>
                  </div>
                ) : lastResult ? (
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 to-emerald-600/20 flex items-center justify-center">
                    <ImageIcon size={48} className="text-white/30" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-white/20">
                    <ImageIcon size={40} />
                    <p className="text-[11px]">Preview here</p>
                  </div>
                )}
                {lastResult && !loading && (
                  <div className="absolute bottom-3 inset-x-3 flex gap-2">
                    <button className="flex-1 py-2 rounded-xl bg-black/50 backdrop-blur-sm border border-white/20 text-white/80 text-[11px] font-semibold flex items-center justify-center gap-1 hover:bg-black/70 transition-colors">
                      <Download size={11} /> Save
                    </button>
                    <button className="flex-1 py-2 rounded-xl bg-black/50 backdrop-blur-sm border border-white/20 text-white/80 text-[11px] font-semibold flex items-center justify-center gap-1 hover:bg-black/70 transition-colors">
                      <Share2 size={11} /> Share
                    </button>
                  </div>
                )}
              </div>

              {lastResult && (
                <button onClick={handleGenerate}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.10] bg-white/[0.04] text-white/60 hover:text-white/80 hover:bg-white/[0.07] text-[12px] font-medium transition-colors">
                  <RefreshCw size={12} /> Regenerate
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SAMPLE_OUTPUTS.map((gradient, i) => (
              <div key={i} className="group relative aspect-square rounded-2xl overflow-hidden border border-white/[0.08]">
                <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button className="p-2 rounded-xl bg-white/20 border border-white/30 text-white hover:bg-white/30 transition-colors"><Download size={13} /></button>
                  <button className="p-2 rounded-xl bg-white/20 border border-white/30 text-white hover:bg-white/30 transition-colors"><ZoomIn size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
