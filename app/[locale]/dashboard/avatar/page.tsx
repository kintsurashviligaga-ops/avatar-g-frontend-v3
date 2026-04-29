'use client';

import { useState } from 'react';
import { UserCircle2, Zap, Wand2, RefreshCw, Download, Sparkles } from 'lucide-react';

const STYLES = ['Professional', 'Creative', 'Artistic', 'Gaming', 'Anime', 'Realistic'];
const BACKGROUNDS = ['Studio', 'Office', 'Nature', 'Abstract', 'Gradient', 'Dark'];
const MOODS = ['Confident', 'Friendly', 'Serious', 'Playful', 'Elegant', 'Bold'];

export default function AvatarStudioPage() {
  const [style, setStyle] = useState('Professional');
  const [bg, setBg] = useState('Studio');
  const [mood, setMood] = useState('Confident');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 2500));
    setResult(`https://placehold.co/400x400/1a1a2e/8b5cf6?text=Avatar+${style}`);
    setLoading(false);
  };

  const Selector = ({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) => (
    <div>
      <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)}
            className="px-3 py-1.5 rounded-lg text-xs transition-all"
            style={value === o
              ? { background: '#8b5cf618', border: '1px solid #8b5cf640', color: '#c4b5fd' }
              : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }
            }>{o}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#8b5cf618', border: '1px solid #8b5cf640' }}>
          <UserCircle2 className="w-5 h-5" style={{ color: '#8b5cf6' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>Avatar Studio</h1>
          <p className="text-xs text-white/40">AI ავატარების დიზაინი და გენერაცია</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs" style={{ background: '#8b5cf618', border: '1px solid #8b5cf630', color: '#c4b5fd' }}>
          <Zap className="w-3 h-3" /> 30 credits/avatar
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-4 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Selector label="Avatar Style" options={STYLES} value={style} onChange={setStyle} />
          <Selector label="Background" options={BACKGROUNDS} value={bg} onChange={setBg} />
          <Selector label="Mood & Expression" options={MOODS} value={mood} onChange={setMood} />

          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Additional Description</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="დამატებითი დეტალები... (სათვალე, ტანსაცმელი, თმის სტილი)"
              rows={3}
              className="w-full bg-transparent outline-none resize-none text-sm text-white placeholder-white/25 rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>

          <button
            onClick={generate}
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)' }}
          >
            {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creating Avatar...</> : <><Wand2 className="w-4 h-4" /> Generate Avatar</>}
          </button>
        </div>

        {/* Preview */}
        <div className="flex flex-col gap-4">
          <div
            className="flex-1 rounded-2xl overflow-hidden flex items-center justify-center min-h-64"
            style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(139,92,246,0.2)' }}
          >
            {loading ? (
              <div className="text-center">
                <Sparkles className="w-10 h-10 text-purple-500/60 mx-auto mb-3 animate-spin" style={{ animationDuration: '2s' }} />
                <p className="text-sm text-white/40">Creating your avatar...</p>
              </div>
            ) : result ? (
              <div className="w-full h-full relative group">
                <img src={result} alt="Avatar" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                    <Download className="w-5 h-5 text-white" />
                  </button>
                  <button onClick={generate} className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                    <RefreshCw className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center p-8">
                <UserCircle2 className="w-16 h-16 text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/30">თქვენი ავატარი აქ გამოჩნდება</p>
                <p className="text-xs text-white/20 mt-1">Style: {style} · BG: {bg} · Mood: {mood}</p>
              </div>
            )}
          </div>

          {result && (
            <div className="grid grid-cols-3 gap-2">
              {['Professional', 'Creative', 'Artistic'].map(v => (
                <div key={v} className="aspect-square rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  <img src={`https://placehold.co/120x120/0d0d18/8b5cf6?text=${v[0]}`} alt={v} className="w-full h-full object-cover opacity-60 hover:opacity-100 transition-opacity cursor-pointer" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
