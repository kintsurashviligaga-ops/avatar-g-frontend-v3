'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ImageIcon, Sparkles, Zap, Download, RefreshCw, Wand2 } from 'lucide-react';


const STYLES = ['Photorealistic', 'Digital Art', 'Oil Painting', 'Watercolor', 'Anime', 'Sketch', '3D Render', 'Cinematic'];
const RATIOS = ['1:1', '16:9', '9:16', '4:3'];
const QUALITIES = ['Standard', 'HD', 'Ultra HD'];

const EXAMPLES = [
  'ფოტორეალისტური პროდუქტის სარეკლამო გამოსახულება',
  'ფუტურისტული ქალაქის ლანდშაფტი ღამე',
  'მინიმალისტური ბრენდის ლოგოს კონცეფცია',
  'Professional portrait photo with studio lighting',
];

export default function ImageGenerationPage() {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('Photorealistic');
  const [ratio, setRatio] = useState('1:1');
  const [quality, setQuality] = useState('HD');
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<string[]>([]);

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 2000));
    setGenerated(prev => [
      `https://placehold.co/512x512/1a1a2e/6366f1?text=${encodeURIComponent(style)}`,
      `https://placehold.co/512x512/0d0d18/00d4ff?text=${encodeURIComponent(quality)}`,
      ...prev,
    ]);
    setLoading(false);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#f59e0b18', border: '1px solid #f59e0b40' }}>
          <ImageIcon className="w-5 h-5" style={{ color: '#f59e0b' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>Image Generation</h1>
          <p className="text-xs text-white/40">AI სურათებისა და ხელოვნების გენერაცია</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs" style={{ background: '#f59e0b18', border: '1px solid #f59e0b30', color: '#fbbf24' }}>
          <Zap className="w-3 h-3" /> 20 credits/image
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-2xl p-4 space-y-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div>
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Prompt</label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="აღწერეთ სურათი, რომლის შექმნაც გსურთ..."
                rows={4}
                className="w-full bg-transparent outline-none resize-none text-sm text-white placeholder-white/25 rounded-xl p-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {EXAMPLES.slice(0, 2).map(e => (
                  <button key={e} onClick={() => setPrompt(e)} className="text-[10px] px-2 py-1 rounded-lg text-white/40 hover:text-white/70 transition-colors truncate max-w-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {e.slice(0, 30)}...
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Style</label>
              <div className="grid grid-cols-2 gap-1.5">
                {STYLES.map(s => (
                  <button key={s} onClick={() => setStyle(s)}
                    className="px-2 py-1.5 rounded-lg text-xs transition-all"
                    style={style === s
                      ? { background: '#f59e0b18', border: '1px solid #f59e0b40', color: '#fbbf24' }
                      : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }
                    }>{s}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Aspect Ratio</label>
              <div className="flex gap-2">
                {RATIOS.map(r => (
                  <button key={r} onClick={() => setRatio(r)}
                    className="flex-1 py-1.5 rounded-lg text-xs transition-all"
                    style={ratio === r
                      ? { background: '#f59e0b18', border: '1px solid #f59e0b40', color: '#fbbf24' }
                      : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }
                    }>{r}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Quality</label>
              <div className="flex gap-2">
                {QUALITIES.map(q => (
                  <button key={q} onClick={() => setQuality(q)}
                    className="flex-1 py-1.5 rounded-lg text-xs transition-all"
                    style={quality === q
                      ? { background: '#f59e0b18', border: '1px solid #f59e0b40', color: '#fbbf24' }
                      : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }
                    }>{q}</button>
                ))}
              </div>
            </div>

            <button
              onClick={generate}
              disabled={!prompt.trim() || loading}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}
            >
              {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</> : <><Wand2 className="w-4 h-4" /> Generate Images</>}
            </button>
          </div>
        </div>

        {/* Gallery */}
        <div className="lg:col-span-2">
          {generated.length === 0 && !loading ? (
            <div className="h-64 rounded-2xl flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.08)' }}>
              <ImageIcon className="w-10 h-10 text-white/15" />
              <p className="text-sm text-white/30">გენერირებული სურათები აქ გამოჩნდება</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {loading && (
                <div className="aspect-square rounded-2xl flex items-center justify-center animate-pulse" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <Sparkles className="w-8 h-8 text-amber-500/50 animate-spin" style={{ animationDuration: '2s' }} />
                </div>
              )}
              {generated.map((src, i) => (
                <div key={i} className="group relative aspect-square rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  <Image src={src} alt="Generated" width={1024} height={1024} unoptimized className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                      <Download className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
