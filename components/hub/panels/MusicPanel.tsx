'use client';

/**
 * MusicPanel — AI Music composition workspace
 * Genre, mood, BPM, instruments, structure, duration, audio player mock
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Play, Pause, Download, Share2, RefreshCw,
  AlertCircle, Loader2, Music2, Volume2, SkipBack, SkipForward,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAiPipeline } from '@/hooks/useAiPipeline';
import { beginPanelShellRun, createTextPreview } from './panelShellBridge';
import type { PanelRunCallbacks } from '@/types/dashboard';

const GENRES = [
  { id: 'electronic',  label: 'Electronic',  emoji: '⚡' },
  { id: 'hip-hop',     label: 'Hip-Hop',     emoji: '🎤' },
  { id: 'cinematic',   label: 'Cinematic',   emoji: '🎬' },
  { id: 'pop',         label: 'Pop',         emoji: '🎵' },
  { id: 'jazz',        label: 'Jazz',        emoji: '🎷' },
  { id: 'ambient',     label: 'Ambient',     emoji: '🌊' },
  { id: 'rock',        label: 'Rock',        emoji: '🎸' },
  { id: 'classical',   label: 'Classical',   emoji: '🎼' },
  { id: 'rnb',         label: 'R&B / Soul',  emoji: '🎙️' },
  { id: 'lo-fi',       label: 'Lo-Fi',       emoji: '☕' },
  { id: 'world',       label: 'World',       emoji: '🌍' },
  { id: 'custom',      label: 'Custom',      emoji: '✨' },
];

const MOODS = [
  { id: 'energetic',  label: 'Energetic'  },
  { id: 'chill',      label: 'Chill'      },
  { id: 'dark',       label: 'Dark'       },
  { id: 'happy',      label: 'Happy'      },
  { id: 'sad',        label: 'Sad'        },
  { id: 'epic',       label: 'Epic'       },
  { id: 'romantic',   label: 'Romantic'   },
  { id: 'tense',      label: 'Tense'      },
];

const INSTRUMENTS = [
  { id: 'synth',    label: 'Synth'      },
  { id: 'piano',    label: 'Piano'      },
  { id: 'guitar',   label: 'Guitar'     },
  { id: 'drums',    label: 'Drums'      },
  { id: 'bass',     label: 'Bass'       },
  { id: 'strings',  label: 'Strings'    },
  { id: 'brass',    label: 'Brass'      },
  { id: 'vocal',    label: 'Vocal'      },
  { id: 'pad',      label: 'Pad'        },
  { id: '808',      label: '808'        },
];

const STRUCTURES = [
  { id: 'verse-chorus',    label: 'Verse – Chorus'     },
  { id: 'intro-loop',      label: 'Intro – Loop'       },
  { id: 'aba',             label: 'A-B-A'              },
  { id: 'through-composed',label: 'Through-Composed'   },
];

// Fake waveform bars
const BARS = Array.from({ length: 40 }, () => 20 + Math.random() * 80);

export function MusicPanel({ locale, callbacks }: { locale: string; callbacks?: PanelRunCallbacks }) {
  const [genre,       setGenre]       = useState('electronic');
  const [mood,        setMood]        = useState('energetic');
  const [instruments, setInstruments] = useState<string[]>(['synth', 'drums']);
  const [structure,   setStructure]   = useState('verse-chorus');
  const [bpm,         setBpm]         = useState(120);
  const [duration,    setDuration]    = useState(60);
  const [prompt,      setPrompt]      = useState('');
  const [playing,     setPlaying]     = useState(false);

  const { run, loading, error, lastResult, clearError } = useAiPipeline('music');

  const toggleInstrument = (id: string) =>
    setInstruments(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const handleGenerate = async () => {
    const p = prompt.trim() || `${mood} ${genre} track`;
    const detail = `Genre: ${genre}, Mood: ${mood}, BPM: ${bpm}, Instruments: ${instruments.join(', ')}, Structure: ${structure}, Duration: ${duration}s`;
    const shellRun = beginPanelShellRun(callbacks, 'music', 'Music Studio', 15);

    await run(
      { prompt: p, context: detail },
      {
        onSuccess: (result) => {
          shellRun.complete(detail, createTextPreview('Music Studio', detail, result.result));
        },
        onError: (message) => {
          shellRun.fail(message);
        },
      },
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg">
            <span className="text-lg">🎵</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Music Studio</h1>
            <p className="text-[12px] text-white/40">Compose AI music with full creative control</p>
          </div>
        </div>

        {/* Player (shows when result ready) */}
        <AnimatePresence>
          {(lastResult || true) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="rounded-2xl border border-pink-400/20 bg-gradient-to-r from-pink-500/[0.07] to-rose-600/[0.05] p-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shrink-0">
                  <Music2 size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white/90 truncate">
                    {lastResult ? 'Generated Track' : 'No track yet — generate below'}
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {lastResult ? `${genre} · ${bpm} BPM · ${duration}s` : 'Adjust settings and click Generate'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="p-2 rounded-full text-white/40 hover:text-white/70"><SkipBack size={14} /></button>
                  <button
                    onClick={() => setPlaying(v => !v)}
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center transition-all',
                      lastResult
                        ? 'bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-[0_0_16px_rgba(236,72,153,0.4)]'
                        : 'bg-white/[0.06] text-white/30',
                    )}
                  >
                    {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                  </button>
                  <button className="p-2 rounded-full text-white/40 hover:text-white/70"><SkipForward size={14} /></button>
                </div>
                {lastResult && (
                  <button className="p-2 rounded-xl border border-white/[0.10] bg-white/[0.04] text-white/50 hover:text-white/80 hover:bg-white/[0.08] transition-colors">
                    <Download size={14} />
                  </button>
                )}
              </div>

              {/* Waveform */}
              <div className="mt-4 flex items-center gap-0.5 h-12">
                {BARS.map((h, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex-1 rounded-full transition-all',
                      playing
                        ? i % 3 === 0 ? 'bg-pink-400/80 animate-pulse' : 'bg-pink-400/40'
                        : lastResult ? 'bg-pink-400/30' : 'bg-white/[0.06]',
                    )}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>

              {/* Progress */}
              <div className="mt-2 flex items-center gap-3">
                <span className="text-[10px] text-white/30">0:00</span>
                <div className="flex-1 h-1 rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-pink-400 w-0 transition-all" />
                </div>
                <span className="text-[10px] text-white/30">{Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}</span>
                <Volume2 size={12} className="text-white/30" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid lg:grid-cols-2 gap-5">
          <div className="space-y-4">

            {/* Genre */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Genre</p>
              <div className="grid grid-cols-4 gap-1.5">
                {GENRES.map(g => (
                  <button key={g.id} onClick={() => setGenre(g.id)}
                    className={cn('flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-[11px] font-medium transition-all',
                      genre === g.id
                        ? 'border-pink-400/40 bg-pink-400/[0.10] text-pink-200'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                    <span>{g.emoji}</span><span className="truncate">{g.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mood */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Mood</p>
              <div className="flex gap-2 flex-wrap">
                {MOODS.map(m => (
                  <button key={m.id} onClick={() => setMood(m.id)}
                    className={cn('px-3 py-1.5 rounded-xl border text-[12px] font-medium transition-all',
                      mood === m.id
                        ? 'border-pink-400/40 bg-pink-400/[0.10] text-pink-200'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Instruments */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Instruments</p>
              <div className="flex gap-2 flex-wrap">
                {INSTRUMENTS.map(ins => (
                  <button key={ins.id} onClick={() => toggleInstrument(ins.id)}
                    className={cn('px-2.5 py-1.5 rounded-xl border text-[11px] font-medium transition-all',
                      instruments.includes(ins.id)
                        ? 'border-rose-400/40 bg-rose-400/[0.10] text-rose-200'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                    {ins.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom prompt */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Custom Description (optional)</p>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe the track mood, instruments, references…"
                rows={2}
                className="w-full px-4 py-3 rounded-2xl border border-white/[0.10] bg-white/[0.03] text-white/80 placeholder:text-white/25 text-[13px] resize-none outline-none focus:border-pink-400/40 transition-all"
              />
            </div>
          </div>

          <div className="space-y-4">
            {/* BPM */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">BPM</p>
                <span className="text-[13px] font-bold text-pink-300">{bpm}</span>
              </div>
              <input type="range" min={60} max={200} step={5} value={bpm}
                onChange={e => setBpm(+e.target.value)}
                className="w-full accent-pink-400" />
              <div className="flex justify-between text-[10px] text-white/25 mt-1">
                <span>60 (Slow)</span><span>200 (Fast)</span>
              </div>
            </div>

            {/* Duration */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Duration</p>
                <span className="text-[13px] font-bold text-pink-300">{duration}s</span>
              </div>
              <input type="range" min={15} max={300} step={15} value={duration}
                onChange={e => setDuration(+e.target.value)}
                className="w-full accent-pink-400" />
              <div className="flex justify-between text-[10px] text-white/25 mt-1">
                <span>15s</span><span>5min</span>
              </div>
            </div>

            {/* Structure */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Structure</p>
              <div className="space-y-1.5">
                {STRUCTURES.map(s => (
                  <button key={s.id} onClick={() => setStructure(s.id)}
                    className={cn('w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-[12px] font-medium transition-all',
                      structure === s.id
                        ? 'border-pink-400/40 bg-pink-400/[0.10] text-pink-200'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/[0.15] hover:text-white/70')}>
                    {s.label}
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
            <button onClick={handleGenerate} disabled={loading}
              className={cn('w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[14px] font-bold transition-all mt-auto',
                loading
                  ? 'bg-white/[0.05] border border-white/[0.08] text-white/25 cursor-not-allowed'
                  : 'bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-[0_0_24px_rgba(236,72,153,0.4)] hover:shadow-[0_0_32px_rgba(236,72,153,0.55)] hover:scale-[1.01]')}>
              {loading ? (<><Loader2 size={16} className="animate-spin" />Composing track…</>) : (<><Sparkles size={16} />Compose Music  ·  8 credits</>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
