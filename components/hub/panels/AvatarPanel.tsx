'use client';

/**
 * AvatarPanel — Full-featured avatar creation workspace
 * Features: style presets, gender/ethnicity controls, background picker,
 *           prompt input, generation queue, output gallery
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, ScanFace, User, Sparkles, RefreshCw, Download, Share2, Star, Camera, Wand2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAiPipeline } from '@/hooks/useAiPipeline';
import { beginPanelShellRun, createTextPreview } from './panelShellBridge';
import type { PanelRunCallbacks } from '@/types/dashboard';

// ─── Options ───────────────────────────────────────────────────

const AVATAR_STYLES = [
  { id: 'realistic',  label: 'Realistic',   emoji: '📸' },
  { id: 'anime',      label: 'Anime',       emoji: '✨' },
  { id: 'cinematic',  label: 'Cinematic',   emoji: '🎬' },
  { id: '3d-render',  label: '3D Render',   emoji: '🎭' },
  { id: 'oil-paint',  label: 'Oil Paint',   emoji: '🖌️' },
  { id: 'pixel-art',  label: 'Pixel Art',   emoji: '🕹️' },
];

const FRAMING = [
  { id: 'portrait',  label: 'Portrait',   icon: '🟦' },
  { id: 'full-body', label: 'Full Body',  icon: '🟩' },
  { id: 'bust',      label: 'Bust',       icon: '🟨' },
  { id: 'headshot',  label: 'Headshot',   icon: '🟥' },
];

const BACKGROUNDS = [
  { id: 'studio',  label: 'Studio',      color: 'bg-slate-700'  },
  { id: 'nature',  label: 'Nature',      color: 'bg-emerald-700'},
  { id: 'urban',   label: 'Urban',       color: 'bg-indigo-700' },
  { id: 'gradient',label: 'Gradient',    color: 'bg-gradient-to-br from-violet-600 to-cyan-600'},
  { id: 'custom',  label: 'Custom',      color: 'bg-white/10 border-2 border-dashed border-white/30'},
];

const QUICK_PROMPTS = [
  'Professional LinkedIn headshot, business attire, confident smile',
  'Fantasy warrior avatar, glowing armor, dramatic lighting',
  'Anime character, expressive eyes, pastel color palette',
  'Futuristic cyberpunk style, neon accents, dark background',
];

const SAMPLE_OUTPUTS = [
  { id: 1, label: 'Professional Portrait', gradient: 'from-violet-600 to-indigo-700' },
  { id: 2, label: 'Fantasy Character',     gradient: 'from-cyan-600 to-blue-700'     },
  { id: 3, label: 'Anime Style',           gradient: 'from-pink-600 to-violet-700'   },
];

// ─── Component ────────────────────────────────────────────────

export function AvatarPanel({ locale: _locale, callbacks }: { locale: string; callbacks?: PanelRunCallbacks }) {
  const [style,      setStyle]      = useState('realistic');
  const [framing,    setFraming]    = useState('portrait');
  const [bg,         setBg]         = useState('studio');
  const [prompt,     setPrompt]     = useState('');
  const [tab,        setTab]        = useState<'create' | 'gallery'>('create');
  const [copiedIdx,  setCopiedIdx]  = useState<number | null>(null);

  const { run, loading, error, lastResult, clearError } = useAiPipeline('avatar');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const detail = `Style: ${style}, Framing: ${framing}, Background: ${bg}`;
    const shellRun = beginPanelShellRun(callbacks, 'avatar', 'Avatar Studio', 18);

    await run(
      { prompt: `${prompt} — ${detail}` },
      {
        onSuccess: (result) => {
          shellRun.complete(detail, createTextPreview('Avatar Studio', detail, result.result));
        },
        onError: (message) => {
          shellRun.fail(message);
        },
      },
    );
  };

  const copyPrompt = (p: string, idx: number) => {
    setPrompt(p);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Header ─── */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <span className="text-lg">🧑‍🎨</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Avatar Studio</h1>
            <p className="text-[12px] text-white/40">Create AI avatars from prompts or photos</p>
          </div>
          {/* Tabs */}
          <div className="ml-auto flex gap-1 p-1 bg-white/[0.04] rounded-xl border border-white/[0.07]">
            {(['create', 'gallery'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all capitalize',
                  tab === t ? 'bg-white/[0.1] text-white' : 'text-white/40 hover:text-white/70',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === 'create' ? (
          <div className="grid lg:grid-cols-[1fr_320px] gap-5">

            {/* Left: Controls */}
            <div className="space-y-4">

              {/* Upload zone */}
              <div className="relative rounded-2xl border-2 border-dashed border-white/[0.12] bg-white/[0.02] hover:border-violet-400/40 hover:bg-violet-400/[0.03] transition-all cursor-pointer group p-5 text-center">
                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" />
                <div className="w-10 h-10 mx-auto rounded-2xl bg-white/[0.06] flex items-center justify-center mb-3 group-hover:bg-violet-400/[0.1] transition-colors">
                  <Upload className="w-5 h-5 text-white/40 group-hover:text-violet-300" />
                </div>
                <p className="text-[13px] font-semibold text-white/60 group-hover:text-white/80">
                  Drop photo here or <span className="text-violet-300">browse</span>
                </p>
                <p className="text-[11px] text-white/30 mt-1">PNG, JPG, WEBP · max 10MB</p>
                <div className="flex justify-center gap-3 mt-4">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/[0.10] text-white/60 hover:text-white/80 text-[11px] transition-colors">
                    <Camera size={12} /> Take Photo
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/[0.10] text-white/60 hover:text-white/80 text-[11px] transition-colors">
                    <ScanFace size={12} /> Scan Face
                  </button>
                </div>
              </div>

              {/* Style selection */}
              <div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Style</p>
                <div className="grid grid-cols-3 gap-2">
                  {AVATAR_STYLES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setStyle(s.id)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[12px] font-medium transition-all',
                        style === s.id
                          ? 'border-violet-400/40 bg-violet-400/[0.12] text-violet-200'
                          : 'border-white/[0.07] bg-white/[0.03] text-white/50 hover:border-white/[0.15] hover:text-white/80',
                      )}
                    >
                      <span>{s.emoji}</span>
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Framing */}
              <div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Framing</p>
                <div className="flex gap-2 flex-wrap">
                  {FRAMING.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setFraming(f.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12px] font-medium transition-all',
                        framing === f.id
                          ? 'border-cyan-400/40 bg-cyan-400/[0.10] text-cyan-200'
                          : 'border-white/[0.07] bg-white/[0.03] text-white/50 hover:border-white/[0.15] hover:text-white/80',
                      )}
                    >
                      {f.icon} {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Describe Your Avatar</p>
                  <span className="text-[10px] text-white/25">{prompt.length}/500</span>
                </div>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value.slice(0, 500))}
                  placeholder="Describe the avatar you want to create…"
                  rows={3}
                  className="w-full px-4 py-3 rounded-2xl border border-white/[0.10] bg-white/[0.03] text-white/80 placeholder:text-white/25 text-[13px] resize-none outline-none focus:border-violet-400/40 focus:bg-violet-400/[0.03] transition-all"
                />

                {/* Quick prompts */}
                <div className="mt-2 flex gap-1.5 flex-wrap">
                  {QUICK_PROMPTS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => copyPrompt(p, i)}
                      className={cn(
                        'flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-medium transition-all',
                        copiedIdx === i
                          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                          : 'border-white/[0.08] bg-white/[0.03] text-white/40 hover:text-white/70 hover:border-white/[0.15]',
                      )}
                    >
                      {copiedIdx === i ? <CheckCircle2 size={10} /> : <Wand2 size={10} />}
                      {p.slice(0, 30)}…
                    </button>
                  ))}
                </div>
              </div>

              {/* Background selector */}
              <div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Background</p>
                <div className="flex gap-2">
                  {BACKGROUNDS.map(b => (
                    <button
                      key={b.id}
                      onClick={() => setBg(b.id)}
                      title={b.label}
                      className={cn(
                        'w-8 h-8 rounded-xl transition-all',
                        b.color,
                        bg === b.id ? 'ring-2 ring-white/50 ring-offset-1 ring-offset-transparent scale-110' : 'opacity-60 hover:opacity-90',
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-start gap-2.5 px-4 py-3 rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] text-rose-300"
                  >
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <p className="text-[12px] flex-1">{error}</p>
                    <button onClick={clearError} className="text-rose-400/60 hover:text-rose-300">×</button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className={cn(
                  'w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[14px] font-bold transition-all',
                  loading || !prompt.trim()
                    ? 'bg-white/[0.05] border border-white/[0.08] text-white/25 cursor-not-allowed'
                    : 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-[0_0_24px_rgba(139,92,246,0.4)] hover:shadow-[0_0_32px_rgba(139,92,246,0.55)] hover:scale-[1.01]',
                )}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generating avatar…
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Generate Avatar  ·  10 credits
                  </>
                )}
              </button>
            </div>

            {/* Right: Live preview */}
            <div className="space-y-4">
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Preview</p>

              {/* Preview canvas */}
              <div className="relative aspect-square rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden flex items-center justify-center">
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-full border-2 border-violet-400/40 border-t-violet-400 animate-spin" />
                    <p className="text-[12px] text-violet-300/80">Generating…</p>
                  </div>
                ) : lastResult ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-violet-600/20 to-indigo-700/20 p-4">
                    <div className="w-full h-full rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                      <User size={64} className="text-white/60" />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-white/20">
                    <User size={48} />
                    <p className="text-[12px]">Preview will appear here</p>
                  </div>
                )}

                {/* Actions overlay */}
                {lastResult && !loading && (
                  <div className="absolute bottom-3 inset-x-3 flex gap-2">
                    <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-black/50 backdrop-blur-sm border border-white/20 text-white/80 text-[11px] font-semibold hover:bg-black/70 transition-colors">
                      <Download size={12} /> Save
                    </button>
                    <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-black/50 backdrop-blur-sm border border-white/20 text-white/80 text-[11px] font-semibold hover:bg-black/70 transition-colors">
                      <Share2 size={12} /> Share
                    </button>
                  </div>
                )}
              </div>

              {/* Result text */}
              {lastResult && (
                <div className="p-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] text-[12px] text-white/60 max-h-32 overflow-y-auto">
                  {JSON.stringify(lastResult.result, null, 2)}
                </div>
              )}

              {/* Regenerate */}
              {lastResult && (
                <button
                  onClick={handleGenerate}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.10] bg-white/[0.04] text-white/60 hover:text-white/80 hover:bg-white/[0.07] text-[12px] font-medium transition-colors"
                >
                  <RefreshCw size={12} /> Regenerate
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Gallery tab */
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SAMPLE_OUTPUTS.map(o => (
                <div key={o.id} className="group relative aspect-square rounded-2xl overflow-hidden border border-white/[0.08]">
                  <div className={`w-full h-full bg-gradient-to-br ${o.gradient} flex items-center justify-center`}>
                    <User size={40} className="text-white/40" />
                  </div>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                    <div className="w-full flex gap-2">
                      <button className="flex-1 py-1.5 rounded-lg bg-white/20 border border-white/30 text-white text-[11px] font-semibold hover:bg-white/30 transition-colors flex items-center justify-center gap-1">
                        <Download size={11} /> Save
                      </button>
                      <button className="w-9 h-7 rounded-lg bg-white/20 border border-white/30 text-white hover:bg-white/30 transition-colors flex items-center justify-center">
                        <Star size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {/* Empty slot */}
              <div className="aspect-square rounded-2xl border-2 border-dashed border-white/[0.08] flex flex-col items-center justify-center text-white/20 hover:border-violet-400/30 hover:text-violet-300/40 transition-all cursor-pointer" onClick={() => setTab('create')}>
                <Sparkles size={24} />
                <p className="text-[11px] mt-2">Generate new</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
