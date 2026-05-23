'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  UserCircle2, Zap, Wand2, RefreshCw, Download, Sparkles,
  Upload, X, AlertCircle, Video, ImageIcon,
  CheckCircle2, Clock,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'talking' | 'portrait';
type VideoStatus = 'idle' | 'starting' | 'processing' | 'completed' | 'failed';

// ─── Constants ────────────────────────────────────────────────────────────────

const VOICE_GENDERS = [
  { value: 'female', label: '♀ Female' },
  { value: 'male',   label: '♂ Male'   },
] as const;

const VOICE_LANGUAGES = [
  { value: 'en', label: '🇺🇸 English'   },
  { value: 'ka', label: '🇬🇪 Georgian'  },
  { value: 'ru', label: '🇷🇺 Russian'   },
  { value: 'de', label: '🇩🇪 German'    },
  { value: 'fr', label: '🇫🇷 French'    },
  { value: 'es', label: '🇪🇸 Spanish'   },
] as const;

const VIDEO_FORMATS = [
  { value: '16:9', label: '16:9 Landscape' },
  { value: '9:16', label: '9:16 Portrait'  },
  { value: '1:1',  label: '1:1 Square'     },
] as const;

const PORTRAIT_STYLES = [
  { label: 'Professional', variant: 'fast',      prompt: 'professional business portrait, sharp suit, confident expression' },
  { label: 'Creative',     variant: 'fast',      prompt: 'creative artistic portrait, vibrant colors, expressive look' },
  { label: 'Artistic',     variant: 'stylized',  prompt: 'artistic oil painting style portrait, painterly strokes, rich tones' },
  { label: 'Gaming',       variant: 'stylized',  prompt: 'gaming character portrait, cyberpunk neon, futuristic style' },
  { label: 'Anime',        variant: 'stylized',  prompt: 'anime manga style portrait, clean line art, expressive eyes' },
  { label: 'Realistic',    variant: 'realistic', prompt: '8k hyperrealistic portrait, photographic quality, natural lighting' },
] as const;

const PORTRAIT_BACKGROUNDS = [
  { label: 'Studio',   prompt: 'clean studio background, professional lighting' },
  { label: 'Office',   prompt: 'modern office background, blurred corporate interior' },
  { label: 'Nature',   prompt: 'soft bokeh nature background, green outdoor setting' },
  { label: 'Abstract', prompt: 'abstract geometric background, gradient colors' },
  { label: 'Dark',     prompt: 'dark moody background, cinematic shadows' },
] as const;

type PortraitStyle = (typeof PORTRAIT_STYLES)[number]['label'];
type PortraitBg    = (typeof PORTRAIT_BACKGROUNDS)[number]['label'];

// ─── Small shared components ──────────────────────────────────────────────────

function Pill<T extends string>({
  options, value, onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className="px-3 py-1.5 rounded-lg text-xs transition-all"
          style={value === o.value
            ? { background: '#38bdf818', border: '1px solid #38bdf850', color: '#c4b5fd' }
            : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }
          }
        >{o.label}</button>
      ))}
    </div>
  );
}

// ─── Talking Avatar Tab ───────────────────────────────────────────────────────

function TalkingAvatarTab() {
  const fileRef   = useRef<HTMLInputElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [photo,      setPhoto]      = useState<string | null>(null);
  const [photoMime,  setPhotoMime]  = useState('image/jpeg');
  const [script,     setScript]     = useState('');
  const [gender,     setGender]     = useState<'female' | 'male'>('female');
  const [lang,       setLang]       = useState<string>('en');
  const [format,     setFormat]     = useState<string>('16:9');
  const [status,     setStatus]     = useState<VideoStatus>('idle');
  const [, setVideoId] = useState<string | null>(null);
  const [videoUrl,   setVideoUrl]   = useState<string | null>(null);
  const [thumbnail,  setThumbnail]  = useState<string | null>(null);
  const [progress,   setProgress]   = useState(0);
  const [error,      setError]      = useState<string | null>(null);
  const [elapsed,    setElapsed]    = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // cleanup on unmount
  useEffect(() => () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoMime(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = (ev) => setPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const startElapsed = () => {
    setElapsed(0);
    elapsedRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
  };

  const stopElapsed = () => {
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
  };

  const pollStatus = (vid: string) => {
    let tick = 0;
    pollTimer.current = setInterval(async () => {
      tick++;
      // Fake smooth progress bar (HeyGen usually takes 60-120s)
      setProgress(Math.min(95, Math.round((tick / 30) * 95)));

      try {
        const res  = await fetch(`/api/heygen/avatar?videoId=${vid}`);
        const data = await res.json() as { status?: string; url?: string | null; thumbnail?: string | null; error?: string | null };

        if (data.status === 'completed' && data.url) {
          clearInterval(pollTimer.current!);
          stopElapsed();
          setProgress(100);
          setStatus('completed');
          setVideoUrl(data.url);
          setThumbnail(data.thumbnail ?? null);
        } else if (data.status === 'failed') {
          clearInterval(pollTimer.current!);
          stopElapsed();
          setStatus('failed');
          setError(data.error ?? 'Video generation failed');
        }
      } catch {
        // transient network glitch — keep polling
      }

      if (tick >= 60) { // 5 min max
        clearInterval(pollTimer.current!);
        stopElapsed();
        setStatus('failed');
        setError('Generation timed out. Please try again.');
      }
    }, 5000);
  };

  const generate = async () => {
    if (!script.trim()) { setError('Please enter a script for your avatar.'); return; }
    setError(null);
    setVideoUrl(null);
    setThumbnail(null);
    setProgress(0);
    setStatus('starting');
    startElapsed();

    try {
      const body: Record<string, unknown> = {
        script: script.trim(),
        voiceGender:   gender,
        voiceLanguage: lang,
        videoFormat:   format,
      };
      if (photo) {
        body.photoBase64  = photo;
        body.photoMimeType = photoMime;
      }

      const res  = await fetch('/api/heygen/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { success?: boolean; videoId?: string; error?: string };

      if (!res.ok || !data.success || !data.videoId) {
        stopElapsed();
        setStatus('failed');
        setError(data.error ?? `Failed to start generation (${res.status})`);
        return;
      }

      setVideoId(data.videoId);
      setStatus('processing');
      pollStatus(data.videoId);
    } catch {
      stopElapsed();
      setStatus('failed');
      setError('Network error — please try again.');
    }
  };

  const reset = () => {
    if (pollTimer.current)  clearInterval(pollTimer.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    setStatus('idle'); setVideoId(null); setVideoUrl(null);
    setThumbnail(null); setProgress(0); setError(null); setElapsed(0);
  };

  const handleDownload = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl; a.target = '_blank';
    a.download = `myavatar-talking-${Date.now()}.mp4`;
    a.click();
  };

  const busy = status === 'starting' || status === 'processing';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Controls */}
      <div className="space-y-5 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>

        {/* Photo upload */}
        <div>
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">
            Your Photo <span className="text-white/30 normal-case font-normal">(upload for personalized avatar)</span>
          </label>
          {photo ? (
            <div className="flex items-center gap-3">
              <div className="relative w-16 h-16 shrink-0">
                <Image src={photo} alt="Your photo" width={64} height={64} unoptimized className="rounded-xl object-cover w-full h-full ring-2 ring-purple-500/40" />
                <button onClick={() => setPhoto(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/80 flex items-center justify-center hover:bg-red-500 transition-colors">
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
              <p className="text-xs text-green-400/80 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Photo ready — your face will be animated</p>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm transition-all hover:border-purple-500/40"
              style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}
            >
              <Upload className="w-4 h-4" />
              <span>Upload face photo <span className="text-white/25">(JPG / PNG)</span></span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
        </div>

        {/* Script */}
        <div>
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">
            Avatar Script <span className="text-purple-400/60">*</span>
          </label>
          <textarea
            value={script}
            onChange={e => setScript(e.target.value)}
            maxLength={1500}
            placeholder="Enter what your avatar should say... e.g. 'Hello, I'm your AI assistant from MyAvatar.ge — ready to help you today!'"
            rows={5}
            className="w-full bg-transparent outline-none resize-none text-sm text-white placeholder-white/25 rounded-xl p-3 leading-relaxed"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
          />
          <p className="text-right text-xs text-white/25 mt-1">{script.length}/1500</p>
        </div>

        {/* Voice settings */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Voice</label>
            <Pill options={VOICE_GENDERS} value={gender} onChange={setGender} />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Language</label>
            <Pill options={VOICE_LANGUAGES} value={lang} onChange={setLang} />
          </div>
        </div>

        {/* Format */}
        <div>
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Video Format</label>
          <Pill options={VIDEO_FORMATS} value={format} onChange={setFormat} />
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl text-xs text-red-300" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button onClick={busy ? undefined : generate} disabled={busy}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
          style={{ background: busy ? 'rgba(139,92,246,0.4)' : 'linear-gradient(135deg,#38bdf8,#6366f1)', boxShadow: busy ? 'none' : '0 0 24px rgba(139,92,246,0.3)' }}
        >
          {busy
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating Avatar Video...</>
            : <><Video className="w-4 h-4" /> Generate Talking Avatar</>}
        </button>
      </div>

      {/* Right: Preview */}
      <div className="flex flex-col gap-4">
        <div className="flex-1 rounded-2xl overflow-hidden flex flex-col items-center justify-center min-h-72 relative"
          style={{ background: 'rgba(0,0,0,0.3)', border: `2px ${status === 'completed' ? 'solid rgba(139,92,246,0.5)' : 'dashed rgba(139,92,246,0.2)'}` }}
        >
          {status === 'idle' && (
            <div className="text-center p-8">
              <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: '#38bdf810', border: '1px solid #38bdf830' }}>
                <Video className="w-10 h-10 text-purple-500/50" />
              </div>
              <p className="text-sm text-white/30">Your talking avatar video will appear here</p>
              <p className="text-xs text-white/20 mt-1">Powered by HeyGen AI · ~60-120s generation time</p>
            </div>
          )}

          {(status === 'starting' || status === 'processing') && (
            <div className="text-center p-8 w-full">
              <Sparkles className="w-10 h-10 text-purple-500/70 mx-auto mb-4 animate-spin" style={{ animationDuration: '2s' }} />
              <p className="text-sm font-semibold text-white/70 mb-1">
                {status === 'starting' ? 'Starting HeyGen...' : 'Generating your avatar video'}
              </p>
              <p className="text-xs text-white/30 mb-4 flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" /> {elapsed}s elapsed — usually 60-120s
              </p>
              {/* Progress bar */}
              <div className="w-full h-1.5 rounded-full mx-auto max-w-xs overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#38bdf8,#6366f1)' }} />
              </div>
              <p className="text-xs text-white/20 mt-2">{progress}%</p>
            </div>
          )}

          {status === 'completed' && videoUrl && (
            <div className="w-full h-full relative">
              <video
                ref={videoRef}
                src={videoUrl}
                poster={thumbnail ?? undefined}
                controls
                className="w-full h-full object-contain"
                style={{ maxHeight: '400px' }}
              />
              <div className="absolute top-3 right-3 flex gap-2">
                <button onClick={handleDownload}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 text-white transition-colors"
                  style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.15)' }}
                ><Download className="w-3 h-3" /> Download MP4</button>
                <button onClick={reset}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 text-white/70 transition-colors"
                  style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
                ><RefreshCw className="w-3 h-3" /> New</button>
              </div>
            </div>
          )}

          {status === 'failed' && (
            <div className="text-center p-8">
              <AlertCircle className="w-12 h-12 text-red-400/60 mx-auto mb-3" />
              <p className="text-sm text-red-300">{error}</p>
              <button onClick={reset} className="mt-4 px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white transition-colors" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>Try Again</button>
            </div>
          )}
        </div>

        {/* HeyGen quality badge */}
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#6366f120' }}>
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <p className="text-xs text-white/40 leading-relaxed">
            Powered by <span className="text-indigo-400 font-semibold">HeyGen v2</span> — industry-leading lip sync, natural facial expressions & HD output.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── AI Portrait Tab ──────────────────────────────────────────────────────────

function AIPortraitTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [psty,    setPsty]    = useState<PortraitStyle>('Professional');
  const [pbg,     setPbg]     = useState<PortraitBg>('Studio');
  const [desc,    setDesc]    = useState('');
  const [photo,   setPhoto]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<string | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [error,   setError]   = useState<string | null>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const callReplicate = async (styleLabel: PortraitStyle): Promise<string | null> => {
    const s = PORTRAIT_STYLES.find(x => x.label === styleLabel)!;
    const b = PORTRAIT_BACKGROUNDS.find(x => x.label === pbg)!;
    const parts: string[] = [s.prompt, b.prompt];
    if (desc.trim()) parts.push(desc.trim());

    const res = await fetch('/api/replicate/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'avatar',
        prompt:  parts.join(', '),
        variant: photo ? 'identity' : s.variant,
        quality: 'high',
        aspectRatio: '1:1',
        ...(photo ? { imageUrl: photo } : {}),
      }),
    });
    const data = await res.json() as { success?: boolean; url?: string | null };
    return data.url ?? null;
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setVariants([]);

    try {
      const main = await callReplicate(psty);
      if (!main) { setError('Generation failed — please try again.'); return; }
      setResult(main);
      setActiveIdx(0);

      // Generate 2 style variants async
      const otherStyles: PortraitStyle[] = (PORTRAIT_STYLES.map(s => s.label) as PortraitStyle[]).filter(l => l !== psty).slice(0, 2);
      Promise.all(otherStyles.map(s => callReplicate(s))).then(urls => {
        setVariants(urls.filter((u): u is string => !!u));
      });
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  };

  const allImages = [result, ...variants].filter((u): u is string => !!u);

  const handleDownload = () => {
    const url = allImages[activeIdx] ?? null;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.target = '_blank';
    a.download = `myavatar-portrait-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>

        {/* Style */}
        <div>
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Style</label>
          <Pill options={PORTRAIT_STYLES.map(s => ({ value: s.label, label: s.label }))} value={psty} onChange={setPsty} />
        </div>

        {/* Background */}
        <div>
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Background</label>
          <Pill options={PORTRAIT_BACKGROUNDS.map(b => ({ value: b.label, label: b.label }))} value={pbg} onChange={setPbg} />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Details</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Glasses, hair color, clothing style..."
            rows={3}
            className="w-full bg-transparent outline-none resize-none text-sm text-white placeholder-white/25 rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
        </div>

        {/* Reference photo */}
        <div>
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">
            Reference Photo <span className="text-white/30 normal-case font-normal">(optional)</span>
          </label>
          {photo ? (
            <div className="relative w-14 h-14">
              <Image src={photo} alt="ref" width={56} height={56} unoptimized className="rounded-lg object-cover w-full h-full ring-2 ring-purple-500/40" />
              <button onClick={() => setPhoto(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/80 flex items-center justify-center">
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}
            ><Upload className="w-3.5 h-3.5" /> Upload Photo</button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl text-xs text-red-300" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}

        <button onClick={generate} disabled={loading}
          className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          style={{ background: loading ? 'rgba(139,92,246,0.4)' : 'linear-gradient(135deg,#38bdf8,#6366f1)', boxShadow: loading ? 'none' : '0 0 20px rgba(139,92,246,0.25)' }}
        >
          {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</> : <><Wand2 className="w-4 h-4" /> Generate AI Portrait</>}
        </button>
      </div>

      {/* Preview */}
      <div className="flex flex-col gap-4">
        <div className="flex-1 rounded-2xl overflow-hidden flex items-center justify-center min-h-64 relative"
          style={{ background: 'rgba(0,0,0,0.25)', border: `2px ${allImages.length > 0 ? 'solid rgba(139,92,246,0.4)' : 'dashed rgba(139,92,246,0.2)'}` }}
        >
          {loading ? (
            <div className="text-center p-8">
              <Sparkles className="w-10 h-10 text-purple-500/60 mx-auto mb-3 animate-spin" style={{ animationDuration: '2s' }} />
              <p className="text-sm text-white/40">Creating your AI portrait...</p>
              <p className="text-xs text-white/20 mt-1">~20-40 seconds</p>
            </div>
          ) : allImages.length > 0 ? (
            <div className="w-full h-full relative group">
              <Image src={allImages[activeIdx] ?? allImages[0]!} alt="Avatar" width={1024} height={1024} unoptimized className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <button onClick={handleDownload} className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"><Download className="w-5 h-5 text-white" /></button>
                <button onClick={generate} className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"><RefreshCw className="w-5 h-5 text-white" /></button>
              </div>
            </div>
          ) : (
            <div className="text-center p-8">
              <ImageIcon className="w-14 h-14 text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">AI portrait will appear here</p>
            </div>
          )}
        </div>

        {allImages.length > 1 && (
          <div className="grid grid-cols-3 gap-2">
            {allImages.slice(0, 3).map((url, i) => (
              <button key={url} onClick={() => setActiveIdx(i)}
                className="aspect-square rounded-xl overflow-hidden transition-all"
                style={{ border: activeIdx === i ? '2px solid rgba(139,92,246,0.7)' : '1px solid rgba(255,255,255,0.08)', opacity: activeIdx === i ? 1 : 0.55 }}
              >
                <Image src={url} alt={`v${i+1}`} width={120} height={120} unoptimized className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AvatarStudioPage() {
  const [mode, setMode] = useState<Mode>('talking');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#38bdf818', border: '1px solid #38bdf840' }}>
          <UserCircle2 className="w-5 h-5" style={{ color: '#38bdf8' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>Avatar Studio</h1>
          <p className="text-xs text-white/40">MyAvatar.ge — Premium AI Avatar Creation</p>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2 p-1 rounded-2xl w-full max-w-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {([
          { value: 'talking', icon: Video,     label: 'Talking Avatar',  sub: 'HeyGen AI · Best' },
          { value: 'portrait', icon: ImageIcon, label: 'AI Portrait',     sub: 'Replicate SDXL'   },
        ] as const).map(({ value, icon: Icon, label }) => (
          <button key={value} onClick={() => setMode(value)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm transition-all"
            style={mode === value
              ? { background: 'linear-gradient(135deg,#38bdf8,#6366f1)', color: '#fff', fontWeight: 600, boxShadow: '0 2px 12px rgba(139,92,246,0.3)' }
              : { color: 'rgba(255,255,255,0.4)' }
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="leading-none">{label}</span>
            {value === 'talking' && mode !== 'talking' && (
              <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(139,92,246,0.25)', color: '#c4b5fd' }}>Best</span>
            )}
          </button>
        ))}
      </div>

      {mode === 'talking'  && <TalkingAvatarTab />}
      {mode === 'portrait' && <AIPortraitTab  />}
    </div>
  );
}
