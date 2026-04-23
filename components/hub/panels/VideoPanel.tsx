'use client';

/**
 * VideoPanel — AI Video generation workspace
 * Shot type, duration, motion style, cinematic controls, scene builder
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Play, Pause, Download, Share2, RefreshCw,
  AlertCircle, Loader2, Film, Sliders, Plus, Trash2, GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAiPipeline } from '@/hooks/useAiPipeline';
import { beginPanelShellRun, createTextPreview } from './panelShellBridge';
import type { PanelRunCallbacks } from '@/types/dashboard';

const VIDEO_STYLES = [
  { id: 'cinematic',   label: 'Cinematic',    emoji: '🎬' },
  { id: 'documentary', label: 'Documentary',  emoji: '📹' },
  { id: 'animation',   label: 'Animation',    emoji: '✨' },
  { id: 'commercial',  label: 'Commercial',   emoji: '📣' },
  { id: 'music-video', label: 'Music Video',  emoji: '🎵' },
  { id: 'social',      label: 'Social Media', emoji: '📱' },
];

const CAMERA_MOVES = [
  { id: 'static',       label: 'Static'       },
  { id: 'pan',          label: 'Pan'          },
  { id: 'zoom-in',      label: 'Zoom In'      },
  { id: 'zoom-out',     label: 'Zoom Out'     },
  { id: 'tracking',     label: 'Tracking'     },
  { id: 'handheld',     label: 'Handheld'     },
  { id: 'aerial',       label: 'Aerial'       },
];

const ASPECT_RATIOS = [
  { id: '16:9', label: '16:9 (Landscape)' },
  { id: '9:16', label: '9:16 (Vertical)'  },
  { id: '1:1',  label: '1:1 (Square)'     },
  { id: '4:5',  label: '4:5 (Portrait)'   },
];

type Scene = { id: string; prompt: string; duration: number; camera: string };

export function VideoPanel({ locale, callbacks }: { locale: string; callbacks?: PanelRunCallbacks }) {
  const [videoStyle, setVideoStyle] = useState('cinematic');
  const [camera,     setCamera]     = useState('static');
  const [ratio,      setRatio]      = useState('16:9');
  const [duration,   setDuration]   = useState(15);
  const [tab,        setTab]        = useState<'single' | 'scenes'>('single');
  const [prompt,     setPrompt]     = useState('');
  const [scenes,     setScenes]     = useState<Scene[]>([
    { id: '1', prompt: '', duration: 5, camera: 'static' },
  ]);

  const { run, loading, error, lastResult, clearError } = useAiPipeline('video');

  const handleGenerate = async () => {
    if (!prompt.trim() && tab === 'single') return;
    const ctx = `Video Style: ${videoStyle}, Camera: ${camera}, Ratio: ${ratio}, Duration: ${duration}s`;
    const p = tab === 'single' ? prompt : scenes.map((s, i) => `Scene ${i + 1}: ${s.prompt}`).join('\n');
    const shellRun = beginPanelShellRun(callbacks, 'video', 'Video Studio', 16);

    await run(
      { prompt: p, context: ctx },
      {
        onSuccess: (result) => {
          shellRun.complete(ctx, createTextPreview('Video Studio', ctx, result.result));
        },
        onError: (message) => {
          shellRun.fail(message);
        },
      },
    );
  };

  const addScene = () => setScenes(s => [...s, { id: Date.now().toString(), prompt: '', duration: 5, camera: 'static' }]);
  const removeScene = (id: string) => setScenes(s => s.filter(sc => sc.id !== id));
  const updateScene = (id: string, field: keyof Scene, val: string | number) =>
    setScenes(s => s.map(sc => sc.id === id ? { ...sc, [field]: val } : sc));

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg">
            <span className="text-lg">🎬</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Video Studio</h1>
            <p className="text-[12px] text-white/40">Generate cinematic AI video sequences</p>
          </div>
          <div className="ml-auto flex gap-1 p-1 bg-white/[0.04] rounded-xl border border-white/[0.07]">
            {(['single', 'scenes'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all capitalize',
                  tab === t ? 'bg-white/[0.1] text-white' : 'text-white/40 hover:text-white/70')}>
                {t === 'single' ? 'Single Shot' : 'Scene Builder'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_280px] gap-5">
          <div className="space-y-4">

            {/* Video Style */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Video Style</p>
              <div className="grid grid-cols-3 gap-2">
                {VIDEO_STYLES.map(s => (
                  <button key={s.id} onClick={() => setVideoStyle(s.id)}
                    className={cn('flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[12px] font-medium transition-all',
                      videoStyle === s.id
                        ? 'border-sky-400/40 bg-sky-400/[0.10] text-sky-200'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                    <span>{s.emoji}</span><span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {tab === 'single' ? (
              /* Single prompt */
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Scene Description</p>
                  <span className="text-[10px] text-white/25">{prompt.length}/800</span>
                </div>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value.slice(0, 800))}
                  placeholder="Describe the video scene you want to create…"
                  rows={4}
                  className="w-full px-4 py-3 rounded-2xl border border-white/[0.10] bg-white/[0.03] text-white/80 placeholder:text-white/25 text-[13px] resize-none outline-none focus:border-sky-400/40 focus:bg-sky-400/[0.03] transition-all"
                />
              </div>
            ) : (
              /* Scene builder */
              <div className="space-y-3">
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Scenes</p>
                {scenes.map((sc, i) => (
                  <div key={sc.id} className="flex gap-2 items-start p-3 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                    <GripVertical size={14} className="text-white/20 shrink-0 mt-2.5 cursor-grab" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-white/30">SCENE {i + 1}</span>
                        <div className="flex items-center gap-1 ml-auto">
                          <span className="text-[10px] text-white/30">{sc.duration}s</span>
                          <input type="range" min={2} max={15} value={sc.duration}
                            onChange={e => updateScene(sc.id, 'duration', +e.target.value)}
                            className="w-16 accent-sky-400" />
                        </div>
                      </div>
                      <input
                        value={sc.prompt}
                        onChange={e => updateScene(sc.id, 'prompt', e.target.value)}
                        placeholder={`Scene ${i + 1} description…`}
                        className="w-full px-3 py-2 rounded-xl border border-white/[0.08] bg-white/[0.02] text-white/70 placeholder:text-white/25 text-[12px] outline-none focus:border-sky-400/30 transition-all"
                      />
                    </div>
                    {scenes.length > 1 && (
                      <button onClick={() => removeScene(sc.id)} className="text-white/25 hover:text-rose-400 transition-colors mt-2">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={addScene}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-dashed border-white/[0.12] text-white/35 hover:text-white/60 hover:border-white/[0.25] text-[12px] transition-colors">
                  <Plus size={13} /> Add Scene
                </button>
              </div>
            )}

            {/* Camera movement */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Camera Movement</p>
              <div className="flex gap-2 flex-wrap">
                {CAMERA_MOVES.map(c => (
                  <button key={c.id} onClick={() => setCamera(c.id)}
                    className={cn('px-3 py-1.5 rounded-xl border text-[12px] font-medium transition-all',
                      camera === c.id
                        ? 'border-sky-400/40 bg-sky-400/[0.10] text-sky-200'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-start gap-2.5 px-4 py-3 rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] text-rose-300">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <p className="text-[12px] flex-1">{error}</p>
                  <button onClick={clearError}>×</button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Generate */}
            <button onClick={handleGenerate} disabled={loading || (!prompt.trim() && tab === 'single')}
              className={cn('w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[14px] font-bold transition-all',
                loading || (!prompt.trim() && tab === 'single')
                  ? 'bg-white/[0.05] border border-white/[0.08] text-white/25 cursor-not-allowed'
                  : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_24px_rgba(14,165,233,0.4)] hover:shadow-[0_0_32px_rgba(14,165,233,0.55)] hover:scale-[1.01]')}>
              {loading ? (<><Loader2 size={16} className="animate-spin" />Generating video…</>) : (<><Sparkles size={16} />Generate Video  ·  15 credits</>)}
            </button>
          </div>

          {/* Settings panel */}
          <div className="space-y-4">
            {/* Aspect ratio */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Aspect Ratio</p>
              <div className="space-y-1.5">
                {ASPECT_RATIOS.map(r => (
                  <button key={r.id} onClick={() => setRatio(r.id)}
                    className={cn('w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-[12px] font-medium transition-all',
                      ratio === r.id
                        ? 'border-sky-400/40 bg-sky-400/[0.10] text-sky-200'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                    {r.label}
                    <span className="text-[10px] opacity-60">{r.id}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Duration</p>
                <span className="text-[12px] font-bold text-sky-300">{duration}s</span>
              </div>
              <input type="range" min={5} max={60} step={5} value={duration}
                onChange={e => setDuration(+e.target.value)}
                className="w-full accent-sky-400" />
              <div className="flex justify-between text-[10px] text-white/25 mt-1">
                <span>5s</span><span>60s</span>
              </div>
            </div>

            {/* Preview */}
            <div className={cn('relative rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden flex items-center justify-center',
              ratio === '9:16' ? 'aspect-[9/16]' : ratio === '4:5' ? 'aspect-[4/5]' : ratio === '1:1' ? 'aspect-square' : 'aspect-video')}>
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-full border-2 border-sky-400/40 border-t-sky-400 animate-spin" />
                  <p className="text-[11px] text-sky-300/80">Generating…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-white/20">
                  <Film size={36} />
                  <p className="text-[11px]">Preview here</p>
                </div>
              )}
              {lastResult && !loading && (
                <div className="absolute bottom-3 inset-x-3 flex gap-2">
                  <button className="flex-1 py-1.5 rounded-xl bg-black/60 backdrop-blur-sm border border-white/20 text-white/80 text-[10px] font-semibold flex items-center justify-center gap-1"><Download size={10} /> Save</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
