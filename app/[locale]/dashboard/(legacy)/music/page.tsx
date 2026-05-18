'use client';

import { useState } from 'react';
import { Music2, Zap, Wand2, RefreshCw, Play, Pause, Volume2 } from 'lucide-react';

const GENRES = ['Electronic', 'Hip-Hop', 'Lo-Fi', 'Cinematic', 'Jazz', 'Rock', 'Pop', 'Ambient'];
const MOODS = ['Energetic', 'Calm', 'Dark', 'Happy', 'Epic', 'Romantic', 'Mysterious'];
const DURATIONS = ['30s', '1min', '2min', '3min', '5min'];
const INSTRUMENTS = ['Synth', 'Piano', 'Guitar', 'Drums', 'Bass', 'Strings', 'Brass', 'Vocals'];

export default function MusicProductionPage() {
  const [genre, setGenre] = useState('Electronic');
  const [mood, setMood] = useState('Energetic');
  const [duration, setDuration] = useState('1min');
  const [instruments, setInstruments] = useState<string[]>(['Synth', 'Drums']);
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggleInstrument = (inst: string) =>
    setInstruments(prev => prev.includes(inst) ? prev.filter(i => i !== inst) : [...prev, inst]);

  const generate = async () => {
    setLoading(true);
    for (let i = 0; i <= 100; i += 5) {
      await new Promise(r => setTimeout(r, 80));
      setProgress(i);
    }
    setGenerated(true);
    setLoading(false);
    setProgress(0);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#10b98118', border: '1px solid #10b98140' }}>
          <Music2 className="w-5 h-5" style={{ color: '#10b981' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>Music Production</h1>
          <p className="text-xs text-white/40">AI მუსიკის კომპოზიცია და პროდუქცია</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs" style={{ background: '#10b98118', border: '1px solid #10b98130', color: '#6ee7b7' }}>
          <Zap className="w-3 h-3" /> 35 credits/track
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {[
            { label: 'Genre', opts: GENRES, val: genre, set: setGenre },
            { label: 'Mood', opts: MOODS, val: mood, set: setMood },
            { label: 'Duration', opts: DURATIONS, val: duration, set: setDuration },
          ].map(({ label, opts, val, set }) => (
            <div key={label}>
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">{label}</label>
              <div className="flex flex-wrap gap-1.5">
                {opts.map(o => (
                  <button key={o} onClick={() => set(o)} className="px-3 py-1.5 rounded-lg text-xs transition-all"
                    style={val === o ? { background: '#10b98118', border: '1px solid #10b98140', color: '#6ee7b7' }
                      : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>{o}</button>
                ))}
              </div>
            </div>
          ))}

          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Instruments</label>
            <div className="flex flex-wrap gap-1.5">
              {INSTRUMENTS.map(i => (
                <button key={i} onClick={() => toggleInstrument(i)} className="px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={instruments.includes(i) ? { background: '#10b98118', border: '1px solid #10b98140', color: '#6ee7b7' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>{i}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="დამატებითი ინსტრუქციები..." rows={2}
              className="w-full bg-transparent outline-none resize-none text-sm text-white placeholder-white/25 rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />
          </div>

          <button onClick={generate} disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)' }}>
            {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Composing...</> : <><Wand2 className="w-4 h-4" /> Generate Music</>}
          </button>
        </div>

        <div className="space-y-4">
          {loading && (
            <div className="rounded-2xl p-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <p className="text-xs font-semibold text-emerald-400 mb-2">Composing...</p>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#10b981,#06b6d4)' }} />
              </div>
              <p className="text-[10px] text-white/30 mt-1">{progress}%</p>
            </div>
          )}

          {generated && (
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-400">Track Ready</span>
                <Volume2 className="w-4 h-4 text-white/30" />
              </div>
              <div className="text-sm text-white/70">{genre} · {mood}</div>
              <div className="flex items-center gap-3">
                <button onClick={() => setPlaying(!playing)}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                  style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)' }}>
                  {playing ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
                </button>
                <div className="flex-1">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full w-1/3 rounded-full" style={{ background: 'linear-gradient(90deg,#10b981,#06b6d4)' }} />
                  </div>
                </div>
                <span className="text-xs text-white/40">{duration}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {instruments.map(i => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#6ee7b7' }}>{i}</span>
                ))}
              </div>
            </div>
          )}

          {!generated && !loading && (
            <div className="rounded-2xl p-5 flex flex-col items-center justify-center gap-3 min-h-48" style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(16,185,129,0.15)' }}>
              <Music2 className="w-10 h-10 text-white/15" />
              <p className="text-sm text-white/30 text-center">AI ტრეკი აქ გამოჩნდება</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
