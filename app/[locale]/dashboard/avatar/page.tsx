'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { UserCircle2, Zap, Wand2, RefreshCw, Download, Sparkles, Upload, X, AlertCircle } from 'lucide-react';

const STYLES = [
  { label: 'Professional', variant: 'fast',      prompt: 'professional business portrait, sharp suit, confident expression' },
  { label: 'Creative',     variant: 'fast',      prompt: 'creative artistic portrait, vibrant colors, expressive look' },
  { label: 'Artistic',     variant: 'stylized',  prompt: 'artistic oil painting style portrait, painterly strokes, rich tones' },
  { label: 'Gaming',       variant: 'stylized',  prompt: 'gaming character portrait, cyberpunk neon, futuristic style' },
  { label: 'Anime',        variant: 'stylized',  prompt: 'anime manga style portrait, clean line art, expressive eyes' },
  { label: 'Realistic',    variant: 'realistic', prompt: '8k hyperrealistic portrait, photographic quality, natural lighting' },
] as const;

const BACKGROUNDS = [
  { label: 'Studio',   prompt: 'clean studio background, professional lighting' },
  { label: 'Office',   prompt: 'modern office background, blurred corporate interior' },
  { label: 'Nature',   prompt: 'soft bokeh nature background, green outdoor setting' },
  { label: 'Abstract', prompt: 'abstract geometric background, gradient colors' },
  { label: 'Gradient', prompt: 'smooth gradient background, elegant tones' },
  { label: 'Dark',     prompt: 'dark moody background, cinematic shadows' },
] as const;

const MOODS = [
  { label: 'Confident', prompt: 'confident powerful expression, direct gaze' },
  { label: 'Friendly',  prompt: 'warm friendly smile, approachable expression' },
  { label: 'Serious',   prompt: 'serious focused expression, professional demeanor' },
  { label: 'Playful',   prompt: 'playful happy smile, energetic expression' },
  { label: 'Elegant',   prompt: 'elegant refined look, sophisticated poise' },
  { label: 'Bold',      prompt: 'bold striking look, dramatic lighting' },
] as const;

type StyleLabel      = (typeof STYLES)[number]['label'];
type BackgroundLabel = (typeof BACKGROUNDS)[number]['label'];
type MoodLabel       = (typeof MOODS)[number]['label'];

export default function AvatarStudioPage() {
  const [style, setStyle]     = useState<StyleLabel>('Professional');
  const [bg, setBg]           = useState<BackgroundLabel>('Studio');
  const [mood, setMood]       = useState<MoodLabel>('Confident');
  const [desc, setDesc]       = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [result, setResult]   = useState<string | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [activeVariantIdx, setActiveVariantIdx] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedStyle = STYLES.find(s => s.label === style)!;
  const selectedBg    = BACKGROUNDS.find(b => b.label === bg)!;
  const selectedMood  = MOODS.find(m => m.label === mood)!;

  const buildPrompt = () => {
    const parts: string[] = [selectedStyle.prompt, selectedBg.prompt, selectedMood.prompt];
    if (desc.trim()) parts.push(desc.trim());
    return parts.join(', ');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const generate = async (promptOverride?: string) => {
    setLoading(true);
    setError(null);

    try {
      const prompt = promptOverride ?? buildPrompt();
      const hasPhoto = !!photoUrl;
      const variant  = hasPhoto ? 'identity' : selectedStyle.variant;

      const body: Record<string, unknown> = {
        service: 'avatar',
        prompt,
        variant,
        quality: 'high',
        aspectRatio: '1:1',
      };
      if (hasPhoto) body.imageUrl = photoUrl;

      const res = await fetch('/api/replicate/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json() as { success?: boolean; url?: string | null; error?: string };

      if (!res.ok || !data.success || !data.url) {
        setError(data.error || `Generation failed (${res.status})`);
        return;
      }

      setResult(data.url);
      setActiveVariantIdx(0);

      // Generate 2 quick style variants in the background (no photo, fast quality)
      Promise.all(
        ['Creative', 'Artistic'].map(async (varLabel) => {
          const s = STYLES.find(x => x.label === varLabel)!;
          const vRes = await fetch('/api/replicate/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service: 'avatar',
              prompt: [s.prompt, selectedBg.prompt, selectedMood.prompt].join(', '),
              variant: s.variant,
              quality: 'standard',
              aspectRatio: '1:1',
            }),
          });
          const vData = await vRes.json() as { url?: string | null };
          return vData.url ?? null;
        })
      ).then((urls) => setVariants(urls.filter((u): u is string => !!u)));
    } catch {
      setError('ქსელის შეცდომა — სცადეთ თავიდან');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const url = variants[activeVariantIdx] ?? result;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `myavatar-${style.toLowerCase()}-${Date.now()}.png`;
    a.target = '_blank';
    a.click();
  };

  const allImages = [result, ...variants].filter((u): u is string => !!u);

  const Selector = <T extends string>({
    label,
    options,
    value,
    onChange,
  }: {
    label: string;
    options: readonly { label: T }[];
    value: T;
    onChange: (v: T) => void;
  }) => (
    <div>
      <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.label}
            onClick={() => onChange(o.label)}
            className="px-3 py-1.5 rounded-lg text-xs transition-all"
            style={
              value === o.label
                ? { background: '#8b5cf618', border: '1px solid #8b5cf640', color: '#c4b5fd' }
                : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
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
              onChange={(e) => setDesc(e.target.value)}
              placeholder="დამატებითი დეტალები... (სათვალე, ტანსაცმელი, თმის სტილი)"
              rows={3}
              className="w-full bg-transparent outline-none resize-none text-sm text-white placeholder-white/25 rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>

          {/* Optional photo upload for identity mode */}
          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">
              Reference Photo <span className="text-white/30 font-normal">(optional — for identity transfer)</span>
            </label>
            {photoUrl ? (
              <div className="relative w-16 h-16">
                <Image src={photoUrl} alt="Reference" width={64} height={64} className="rounded-lg object-cover w-full h-full" unoptimized />
                <button
                  onClick={() => setPhotoUrl(null)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/80 flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)' }}
              >
                <Upload className="w-3.5 h-3.5" /> Upload Photo
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl text-xs text-red-300" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={() => generate()}
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)' }}
          >
            {loading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creating Avatar...</>
              : <><Wand2 className="w-4 h-4" /> Generate Avatar</>}
          </button>
        </div>

        {/* Preview */}
        <div className="flex flex-col gap-4">
          <div
            className="flex-1 rounded-2xl overflow-hidden flex items-center justify-center min-h-64"
            style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(139,92,246,0.2)' }}
          >
            {loading ? (
              <div className="text-center p-8">
                <Sparkles className="w-10 h-10 text-purple-500/60 mx-auto mb-3 animate-spin" style={{ animationDuration: '2s' }} />
                <p className="text-sm text-white/40">Creating your avatar...</p>
                <p className="text-xs text-white/20 mt-1">~20-40 seconds</p>
              </div>
            ) : allImages.length > 0 ? (
              <div className="w-full h-full relative group">
                <Image
                  src={allImages[activeVariantIdx] ?? allImages[0]!}
                  alt="Avatar"
                  width={1024}
                  height={1024}
                  unoptimized
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button onClick={handleDownload} className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                    <Download className="w-5 h-5 text-white" />
                  </button>
                  <button onClick={() => generate()} className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
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

          {/* Style variants row */}
          {allImages.length > 1 && (
            <div className="grid grid-cols-3 gap-2">
              {allImages.slice(0, 3).map((url, i) => (
                <button
                  key={url}
                  onClick={() => setActiveVariantIdx(i)}
                  className="aspect-square rounded-xl overflow-hidden transition-all"
                  style={{
                    border: activeVariantIdx === i
                      ? '2px solid rgba(139,92,246,0.7)'
                      : '1px solid rgba(255,255,255,0.08)',
                    opacity: activeVariantIdx === i ? 1 : 0.6,
                  }}
                >
                  <Image src={url} alt={`Variant ${i + 1}`} width={120} height={120} unoptimized className="w-full h-full object-cover hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
