'use client';

import { useEffect, useRef, useState } from 'react';
import { Video, Zap, Wand2, RefreshCw, Download, AlertCircle } from 'lucide-react';

const MODELS = [
  { id: 'ltx-2-3-fast', label: 'LTX 2.3 Fast', credits: 40 },
  { id: 'ltx-2-3-pro', label: 'LTX 2.3 Pro', credits: 80 },
  { id: 'ltx-2-fast', label: 'LTX 2 Fast', credits: 30 },
  { id: 'ltx-2-pro', label: 'LTX 2 Pro', credits: 60 },
] as const;

const RESOLUTIONS = [
  { value: '1920x1080', label: '1080p Landscape' },
  { value: '1080x1920', label: '1080p Portrait', ltx23Only: true },
  { value: '2560x1440', label: '1440p Landscape' },
  { value: '3840x2160', label: '4K Landscape' },
] as const;

const DURATIONS = [6, 8, 10, 12, 14, 16, 18, 20] as const;

type ModelId = (typeof MODELS)[number]['id'];
type ResolutionValue = (typeof RESOLUTIONS)[number]['value'];

export default function VideoGenerationPage() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<ModelId>('ltx-2-3-fast');
  const [resolution, setResolution] = useState<ResolutionValue>('1920x1080');
  const [duration, setDuration] = useState(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  const isLtx23 = model === 'ltx-2-3-fast' || model === 'ltx-2-3-pro';
  const validResolutions = RESOLUTIONS.filter((r) => !('ltx23Only' in r) || isLtx23);

  useEffect(() => {
    if (!isLtx23 && resolution === '1080x1920') setResolution('1920x1080');
  }, [isLtx23, resolution]);

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
      prevUrlRef.current = null;
    }

    try {
      const fps = model.startsWith('ltx-2-3') ? 24 : 25;
      const res = await fetch('/api/ltx-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model, resolution, duration, fps }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || `Error ${res.status}`);
        return;
      }

      const bytes = Uint8Array.from(atob(data.video), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      prevUrlRef.current = url;
      setVideoUrl(url);
    } catch {
      setError('ქსელის შეცდომა — სცადეთ თავიდან');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `myavatar-video-${Date.now()}.mp4`;
    a.click();
  };

  const selectedModel = MODELS.find((m) => m.id === model)!;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#ef444418', border: '1px solid #ef444440' }}>
          <Video className="w-5 h-5" style={{ color: '#ef4444' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Video Generation</h1>
          <p className="text-xs text-white/40">AI ვიდეო • LTX Video Engine</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs" style={{ background: '#ef444418', border: '1px solid #ef444430', color: '#fca5a5' }}>
          <Zap className="w-3 h-3" /> {selectedModel.credits} credits
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="lg:col-span-1 space-y-4 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="შეიყვანე ვიდეოს აღწერა..."
              rows={4}
              className="w-full bg-transparent outline-none resize-none text-sm text-white placeholder-white/25 rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Model</label>
            <div className="flex flex-col gap-1.5">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className="px-3 py-2 rounded-xl text-xs text-left transition-all flex items-center justify-between"
                  style={model === m.id
                    ? { background: '#ef444418', border: '1px solid #ef444440', color: '#fca5a5' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}
                >
                  <span className="font-medium">{m.label}</span>
                  <span className="opacity-60">{m.credits}cr</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Resolution</label>
            <div className="flex flex-col gap-1.5">
              {validResolutions.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setResolution(r.value)}
                  className="px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={resolution === r.value
                    ? { background: '#ef444418', border: '1px solid #ef444440', color: '#fca5a5' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">Duration</label>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.filter((d) => {
                const isFullRange = isLtx23 && resolution === '1920x1080';
                return isFullRange || d <= 10;
              }).map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className="px-2 py-1 rounded-lg text-xs transition-all"
                  style={duration === d
                    ? { background: '#ef444418', border: '1px solid #ef444440', color: '#fca5a5' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={generate}
            disabled={!prompt.trim() || loading}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
            style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}
          >
            {loading ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> გენერირება...</>
            ) : (
              <><Wand2 className="w-4 h-4" /> ვიდეოს გენერირება</>
            )}
          </button>

          {loading && (
            <p className="text-center text-xs text-white/30">
              ვიდეო იქმნება... {duration}წამიანი ვიდეო შეიძლება 30-90 წამი მოითხოვდეს.
            </p>
          )}
        </div>

        {/* Video output */}
        <div className="lg:col-span-2">
          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl p-4" style={{ background: '#ef444412', border: '1px solid #ef444430' }}>
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {videoUrl ? (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(239,68,68,0.25)' }}>
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                autoPlay
                loop
                className="w-full"
                style={{ maxHeight: 400, background: '#000' }}
              />
              <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Ready</span>
                  <span className="text-xs text-white/30">• {model} • {resolution} • {duration}s</span>
                </div>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 transition-all hover:text-white"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              </div>
            </div>
          ) : (
            <div
              className="h-full min-h-80 rounded-2xl flex flex-col items-center justify-center gap-4"
              style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(239,68,68,0.2)' }}
            >
              {loading ? (
                <>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#ef444418' }}>
                    <RefreshCw className="w-7 h-7 text-red-400 animate-spin" />
                  </div>
                  <p className="text-sm text-white/40">ვიდეო იქმნება LTX Video-ით...</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#ef444418' }}>
                    <Video className="w-7 h-7" style={{ color: '#ef4444' }} />
                  </div>
                  <p className="text-sm text-white/30">ჩაწერე prompt და დააჭირე Generate</p>
                  <p className="text-xs text-white/20">Powered by LTX Video AI</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
