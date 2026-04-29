'use client';

import { useState } from 'react';
import { Video, Zap, Wand2, RefreshCw, Play, Clock } from 'lucide-react';

const TYPES = ['Product Promo', 'Social Reel', 'YouTube Intro', 'Corporate', 'Tutorial', 'Story'];
const DURATIONS = ['15s', '30s', '60s', '2min', '5min'];
const TONES = ['Professional', 'Energetic', 'Calm', 'Humorous', 'Inspirational'];

export default function VideoGenerationPage() {
  const [topic, setTopic] = useState('');
  const [type, setType] = useState('Social Reel');
  const [duration, setDuration] = useState('30s');
  const [tone, setTone] = useState('Energetic');
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState<string | null>(null);

  const generate = async () => {
    if (!topic.trim() || loading) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 1800));
    setScript(`🎬 VIDEO SCRIPT: "${topic}"\nType: ${type} | Duration: ${duration} | Tone: ${tone}\n\n[INTRO - 0:00-0:05]\nVisual: Dynamic opening shot with brand logo\nVO: "განაახლე შენი ვიზია AI-ით..."\n\n[HOOK - 0:05-0:15]\nVisual: Product close-up with motion graphics\nVO: "მხოლოდ ${duration}-ში..."\n\n[MAIN CONTENT - 0:15-0:25]\nVisual: Feature showcase montage\nVO: "AI ტექნოლოგია, რომელიც იმუშავებს შენთვის"\n\n[CTA - 0:25-0:30]\nVisual: Brand end card\nVO: "myavatar.ge — ახლავე სცადე"`);
    setLoading(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#ef444418', border: '1px solid #ef444440' }}>
          <Video className="w-5 h-5" style={{ color: '#ef4444' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>Video Generation</h1>
          <p className="text-xs text-white/40">AI ვიდეო სკრიპტები და პროდუქცია</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs" style={{ background: '#ef444418', border: '1px solid #ef444430', color: '#fca5a5' }}>
          <Zap className="w-3 h-3" /> 25 credits/script
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Video Topic</label>
            <textarea value={topic} onChange={e => setTopic(e.target.value)} placeholder="ვიდეოს თემა ან პროდუქტი..." rows={3}
              className="w-full bg-transparent outline-none resize-none text-sm text-white placeholder-white/25 rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />
          </div>
          {[{ label: 'Video Type', opts: TYPES, val: type, set: setType },
            { label: 'Duration', opts: DURATIONS, val: duration, set: setDuration },
            { label: 'Tone', opts: TONES, val: tone, set: setTone }].map(({ label, opts, val, set }) => (
            <div key={label}>
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">{label}</label>
              <div className="flex flex-wrap gap-1.5">
                {opts.map(o => (
                  <button key={o} onClick={() => set(o)} className="px-2 py-1 rounded-lg text-xs transition-all"
                    style={val === o ? { background: '#ef444418', border: '1px solid #ef444440', color: '#fca5a5' }
                      : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>{o}</button>
                ))}
              </div>
            </div>
          ))}
          <button onClick={generate} disabled={!topic.trim() || loading}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>
            {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Scripting...</> : <><Wand2 className="w-4 h-4" /> Generate Script</>}
          </button>
        </div>

        <div className="lg:col-span-2">
          {!script ? (
            <div className="h-full min-h-64 rounded-2xl flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(239,68,68,0.2)' }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#ef444418' }}>
                <Play className="w-7 h-7" style={{ color: '#ef4444' }} />
              </div>
              <p className="text-sm text-white/30">ვიდეო სკრიპტი აქ გამოჩნდება</p>
              <div className="flex items-center gap-2 text-xs text-white/20">
                <Clock className="w-3.5 h-3.5" /> Duration: {duration}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl p-5 h-full" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Script Ready</span>
              </div>
              <pre className="text-sm text-white/75 whitespace-pre-wrap leading-relaxed" style={{ fontFamily: 'var(--font-dm, system-ui)' }}>{script}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
