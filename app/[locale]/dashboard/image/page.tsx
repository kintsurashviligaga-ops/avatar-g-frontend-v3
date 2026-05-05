'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ImageIcon, Sparkles, Zap, Download, RefreshCw, Wand2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const STYLES = [
  'Photorealistic', 'Digital Art', 'Oil Painting',
  'Watercolor', 'Anime', 'Sketch', '3D Render', 'Cinematic',
] as const;
type Style = (typeof STYLES)[number];

const RATIOS = [
  { value: '1:1',  label: '1:1'  },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3',  label: '4:3'  },
] as const;
type Ratio = (typeof RATIOS)[number]['value'];

const QUALITIES = [
  { value: 'standard', label: 'Standard', endpoint: 'v2-1k',  model: 'NanoBanana V2 1K',  credits: 8  },
  { value: 'high',     label: 'HD',       endpoint: 'v2-2k',  model: 'NanoBanana V2 2K',  credits: 12 },
  { value: 'ultra',    label: 'Ultra HD', endpoint: 'pro-4k', model: 'NanoBanana Pro 4K', credits: 24 },
] as const;
type Quality = (typeof QUALITIES)[number]['value'];

const EXAMPLES = [
  'A futuristic cityscape at night with neon lights reflecting on wet streets',
  'Professional product photo of a luxury watch on marble surface',
  'Aerial view of a hidden waterfall in a tropical rainforest',
  'Portrait of an astronaut floating in deep space, golden hour lighting',
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeneratedImage {
  id: string; // predictionId or timestamp
  url: string;
  prompt: string;
  style: Style;
  ratio: Ratio;
  quality: Quality;
  model: string;
}

type GenStatus = 'idle' | 'starting' | 'processing' | 'done' | 'failed';

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ImageGenerationPage() {
  const [prompt,  setPrompt]  = useState('');
  const [style,   setStyle]   = useState<Style>('Photorealistic');
  const [ratio,   setRatio]   = useState<Ratio>('1:1');
  const [quality, setQuality] = useState<Quality>('high');
  const [negPrompt, setNegPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [status,   setStatus]   = useState<GenStatus>('idle');
  const [error,    setError]    = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [elapsed,  setElapsed]  = useState(0);

  const [gallery, setGallery]  = useState<GeneratedImage[]>([]);
  const [selected, setSelected] = useState<GeneratedImage | null>(null);

  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
  }, []);

  const qConfig = QUALITIES.find(q => q.value === quality)!;

  const startElapsed = () => {
    setElapsed(0);
    elapsedTimer.current = setInterval(() => setElapsed(s => s + 1), 1000);
  };
  const stopElapsed = () => {
    if (elapsedTimer.current) { clearInterval(elapsedTimer.current); elapsedTimer.current = null; }
  };

  // Animate progress toward 95% while waiting for server response
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startProgress = () => {
    setProgress(5);
    progressRef.current = setInterval(() => {
      setProgress(p => p < 90 ? p + Math.random() * 4 : p);
    }, 800);
  };
  const stopProgress = (final: number) => {
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
    setProgress(final);
  };

  const generate = async () => {
    if (!prompt.trim() || status === 'starting' || status === 'processing') return;

    setError(null);
    setProgress(0);
    setStatus('starting');
    startElapsed();
    startProgress();

    try {
      // Primary: NanoBananaAI — server polls internally, returns URL directly
      const res = await fetch('/api/nanobanana/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt:      prompt.trim(),
          style,
          quality,
          endpoint:    qConfig.endpoint,
          aspectRatio: ratio,
        }),
      });
      const data = await res.json() as {
        success?: boolean; url?: string | null;
        model?: string; endpoint?: string; credits?: number; error?: string;
      };

      stopElapsed();
      stopProgress(data.success && data.url ? 100 : 0);

      if (!res.ok || !data.success || !data.url) {
        // Fallback: Replicate FLUX
        setError(null);
        setStatus('processing');
        startElapsed();
        startProgress();

        const fbRes = await fetch('/api/replicate/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt:        prompt.trim(),
            style,
            quality,
            variant:       quality === 'ultra' ? 'premium' : 'fast',
            aspectRatio:   ratio,
          }),
        });
        const fbData = await fbRes.json() as {
          success?: boolean; predictionId?: string; url?: string | null;
          model?: string; error?: string;
        };

        stopElapsed();
        stopProgress(fbData.success && fbData.url ? 100 : 0);

        if (!fbRes.ok || fbData.error || !fbData.url) {
          setStatus('failed');
          setError(fbData.error ?? data.error ?? `Generation failed (${res.status})`);
          return;
        }

        const img: GeneratedImage = {
          id: fbData.predictionId ?? String(Date.now()),
          url: fbData.url,
          prompt: prompt.trim(), style, ratio, quality,
          model: fbData.model ?? qConfig.model,
        };
        setGallery(prev => [img, ...prev]);
        setSelected(img);
        setStatus('done');
        return;
      }

      const img: GeneratedImage = {
        id: String(Date.now()),
        url: data.url,
        prompt: prompt.trim(), style, ratio, quality,
        model: data.model ?? qConfig.model,
      };
      setGallery(prev => [img, ...prev]);
      setSelected(img);
      setStatus('done');
    } catch {
      stopElapsed();
      stopProgress(0);
      setStatus('failed');
      setError('Network error — please try again.');
    }
  };

  const busy = status === 'starting' || status === 'processing';

  const handleDownload = (img: GeneratedImage) => {
    const a = document.createElement('a');
    a.href = img.url; a.target = '_blank';
    a.download = `myavatar-image-${Date.now()}.jpg`;
    a.click();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#f59e0b18', border: '1px solid #f59e0b40' }}>
          <ImageIcon className="w-5 h-5" style={{ color: '#f59e0b' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>Image Generation</h1>
          <p className="text-xs text-white/40">AI სურათებისა და ხელოვნების გენერაცია · NanoBananaAI V2/Pro</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs" style={{ background: '#f59e0b18', border: '1px solid #f59e0b30', color: '#fbbf24' }}>
          <Zap className="w-3 h-3" /> {qConfig.credits} credits/image
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-2xl p-4 space-y-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>

            {/* Prompt */}
            <div>
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Prompt</label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.metaKey && generate()}
                placeholder="Describe the image you want to create..."
                rows={4}
                className="w-full bg-transparent outline-none resize-none text-sm text-white placeholder-white/25 rounded-xl p-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {EXAMPLES.slice(0, 2).map(ex => (
                  <button key={ex} onClick={() => setPrompt(ex)}
                    className="text-[10px] px-2 py-1 rounded-lg text-white/40 hover:text-white/70 transition-colors text-left"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', maxWidth: '100%' }}
                  >{ex.slice(0, 36)}…</button>
                ))}
              </div>
            </div>

            {/* Style */}
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

            {/* Ratio */}
            <div>
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Aspect Ratio</label>
              <div className="flex gap-2">
                {RATIOS.map(r => (
                  <button key={r.value} onClick={() => setRatio(r.value)}
                    className="flex-1 py-1.5 rounded-lg text-xs transition-all"
                    style={ratio === r.value
                      ? { background: '#f59e0b18', border: '1px solid #f59e0b40', color: '#fbbf24' }
                      : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }
                    }>{r.label}</button>
                ))}
              </div>
            </div>

            {/* Quality */}
            <div>
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Quality</label>
              <div className="flex gap-2">
                {QUALITIES.map(q => (
                  <button key={q.value} onClick={() => setQuality(q.value)}
                    className="flex-1 py-1.5 rounded-lg text-xs transition-all"
                    style={quality === q.value
                      ? { background: '#f59e0b18', border: '1px solid #f59e0b40', color: '#fbbf24' }
                      : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }
                    }>{q.label}</button>
                ))}
              </div>
              <p className="text-[10px] text-white/25 mt-1 text-right">{qConfig.model} · {qConfig.credits} credits</p>
            </div>

            {/* Advanced */}
            <div>
              <button onClick={() => setShowAdvanced(p => !p)}
                className="flex items-center gap-1 text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Advanced options
              </button>
              {showAdvanced && (
                <div className="mt-2">
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">Negative Prompt</label>
                  <textarea
                    value={negPrompt}
                    onChange={e => setNegPrompt(e.target.value)}
                    placeholder="What to avoid... (blurry, watermark, extra fingers)"
                    rows={2}
                    className="w-full bg-transparent outline-none resize-none text-xs text-white placeholder-white/25 rounded-xl p-3"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl text-xs text-red-300" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}

            <button onClick={generate} disabled={!prompt.trim() || busy}
              className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              style={{
                background: busy ? 'rgba(245,158,11,0.4)' : 'linear-gradient(135deg,#f59e0b,#ef4444)',
                boxShadow: busy ? 'none' : '0 0 20px rgba(245,158,11,0.25)',
              }}
            >
              {busy
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating... ({elapsed}s)</>
                : <><Wand2 className="w-4 h-4" /> Generate Image</>}
            </button>

            {/* Progress bar */}
            {busy && (
              <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#f59e0b,#ef4444)' }} />
              </div>
            )}
          </div>
        </div>

        {/* Gallery / Preview */}
        <div className="lg:col-span-2 space-y-4">
          {/* Main preview */}
          <div className="rounded-2xl overflow-hidden min-h-64 flex items-center justify-center relative"
            style={{
              background: 'rgba(0,0,0,0.25)',
              border: `2px ${selected ? 'solid rgba(245,158,11,0.4)' : 'dashed rgba(255,255,255,0.08)'}`,
              aspectRatio: ratio === '9:16' ? '9/16' : ratio === '16:9' ? '16/9' : ratio === '4:3' ? '4/3' : '1/1',
              maxHeight: '500px',
            }}
          >
            {busy && (
              <div className="text-center p-8">
                <Sparkles className="w-10 h-10 text-amber-500/60 mx-auto mb-3 animate-spin" style={{ animationDuration: '2s' }} />
                <p className="text-sm text-white/40">Generating with {qConfig.model}...</p>
                <p className="text-xs text-white/20 mt-1">{elapsed}s · NanoBananaAI is fast ⚡</p>
              </div>
            )}
            {!busy && selected && (
              <div className="w-full h-full relative group">
                <Image src={selected.url} alt={selected.prompt} fill unoptimized className="object-contain" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button onClick={() => handleDownload(selected)}
                    className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-2 text-xs text-white"
                  ><Download className="w-4 h-4" /> Download</button>
                  <button onClick={generate}
                    className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-2 text-xs text-white"
                  ><RefreshCw className="w-4 h-4" /> Regenerate</button>
                </div>
                <div className="absolute bottom-3 left-3 right-3">
                  <div className="px-3 py-1.5 rounded-lg text-xs text-white/60 truncate" style={{ background: 'rgba(0,0,0,0.7)' }}>
                    {selected.style} · {selected.ratio} · {selected.model}
                  </div>
                </div>
              </div>
            )}
            {!busy && !selected && (
              <div className="text-center p-8">
                <ImageIcon className="w-12 h-12 text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/30">Your generated image will appear here</p>
                <p className="text-xs text-white/20 mt-1">Powered by NanoBananaAI V2 · FLUX fallback</p>
              </div>
            )}
          </div>

          {/* Gallery grid */}
          {gallery.length > 0 && (
            <div>
              <p className="text-xs text-white/30 mb-2 uppercase tracking-wider font-semibold">History ({gallery.length})</p>
              <div className="grid grid-cols-4 gap-2">
                {gallery.map(img => (
                  <button key={img.id} onClick={() => setSelected(img)}
                    className="aspect-square rounded-xl overflow-hidden relative transition-all"
                    style={{
                      border: selected?.id === img.id ? '2px solid rgba(245,158,11,0.7)' : '1px solid rgba(255,255,255,0.08)',
                      opacity: selected?.id === img.id ? 1 : 0.65,
                    }}
                  >
                    <Image src={img.url} alt={img.prompt} fill unoptimized className="object-cover" />
                  </button>
                ))}
                {/* Generating slot */}
                {busy && (
                  <div className="aspect-square rounded-xl flex items-center justify-center animate-pulse" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <Sparkles className="w-6 h-6 text-amber-500/50 animate-spin" style={{ animationDuration: '2s' }} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
