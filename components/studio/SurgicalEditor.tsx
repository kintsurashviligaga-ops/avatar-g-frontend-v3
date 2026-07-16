'use client';

/**
 * SurgicalEditor — the non-generative "Surgical Editor" (ქირურგიული მონტაჟი).
 *
 * A deterministic, creator-grade video/photo editor. Everything the user sees is REAL and client-side:
 *  • live colour grading via CSS filters (instant, non-destructive preview),
 *  • a scrubbable timeline with split markers,
 *  • a draggable crop overlay,
 *  • audio detach / mute.
 * "Apply" uploads the source to storage (bypassing the 4.5MB function-body limit) and calls /api/ai/edit,
 * which runs the SAME transform deterministically with ffmpeg-static and returns a hosted result.
 *
 * HONEST SCOPE: split/crop/detach/colour/fade are non-generative (no frames invented). Object-removal
 * ("remove the cup") is AI fill — it SYNTHESISES pixels inside the mask — so it is clearly labelled as
 * such and metered like a generation. It stays inert until the inpaint model is configured server-side.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Scissors, Crop, Volume2, VolumeX, Play, Pause, Upload, X, Download, Loader2,
  SunMedium, Contrast as ContrastIcon, Droplet, Thermometer, RotateCcw, Wand2, Film,
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser';

type Lang = 'ka' | 'en' | 'ru';
const norm = (l: string): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

const MAX_CLIPS = 35;

interface Copy {
  title: string; subtitle: string; drop: string; dropHint: string; pick: string;
  split: string; crop: string; detach: string; fade: string; color: string;
  saturation: string; contrast: string; brightness: string; temperature: string;
  fadeIn: string; fadeOut: string; reset: string; apply: string; applying: string;
  muted: string; mute: string; addSplit: string; cropHint: string; cmdPh: string; send: string;
  result: string; download: string; clips: string; maxReached: string;
  aiFill: string; inpaintOff: string; done: string; failed: string; needClip: string; close: string;
}

const T: Record<Lang, Copy> = {
  ka: {
    title: 'ქირურგიული მონტაჟი', subtitle: 'დეტერმინისტული, არა-გენერაციული რედაქტორი',
    drop: 'ჩააგდე ან ატვირთე ვიდეო/ფოტო', dropHint: 'ვიდეო ან სურათი — მაქს. 35 კლიპი', pick: 'ფაილის არჩევა',
    split: 'გაჭრა', crop: 'ჩამოჭრა', detach: 'ხმის განცალკევება', fade: 'მილევა', color: 'ფერის გრადაცია',
    saturation: 'გაჯერება', contrast: 'კონტრასტი', brightness: 'სიკაშკაშე', temperature: 'ტემპერატურა',
    fadeIn: 'შესვლა', fadeOut: 'გასვლა', reset: 'გადატვირთვა', apply: 'გამოყენება', applying: 'მუშავდება…',
    muted: 'დადუმებული', mute: 'დადუმება', addSplit: 'გაჭრის ნიშნული', cropHint: 'გადაათრიე კადრზე მოსაჭრელი არეს მოსანიშნად',
    cmdPh: 'G, გაჭერი 2.5 წამზე და მოაშორე წითელი ჭიქა…', send: 'გაგზავნა',
    result: 'შედეგი', download: 'ჩამოტვირთვა', clips: 'კლიპები', maxReached: 'მაქსიმუმ 35 კლიპი',
    aiFill: 'AI შევსება (გენერაციული)', inpaintOff: 'ობიექტის მოშორება ჯერ არ არის კონფიგურირებული', done: 'მზადაა',
    failed: 'ვერ შესრულდა', needClip: 'ჯერ ატვირთე კლიპი', close: 'დახურვა',
  },
  en: {
    title: 'Surgical Editor', subtitle: 'Deterministic, non-generative editor',
    drop: 'Drop or upload video/photo', dropHint: 'Video or image — up to 35 clips', pick: 'Choose file',
    split: 'Split', crop: 'Crop', detach: 'Detach audio', fade: 'Fade', color: 'Color grade',
    saturation: 'Saturation', contrast: 'Contrast', brightness: 'Brightness', temperature: 'Temperature',
    fadeIn: 'In', fadeOut: 'Out', reset: 'Reset', apply: 'Apply', applying: 'Processing…',
    muted: 'Muted', mute: 'Mute', addSplit: 'Split marker', cropHint: 'Drag on the frame to mark the crop region',
    cmdPh: 'G, slice this clip at 2.5s and remove the red cup…', send: 'Send',
    result: 'Result', download: 'Download', clips: 'Clips', maxReached: 'Maximum 35 clips',
    aiFill: 'AI fill (generative)', inpaintOff: 'Object removal is not configured yet', done: 'Ready',
    failed: 'Failed', needClip: 'Upload a clip first', close: 'Close',
  },
  ru: {
    title: 'Хирургический редактор', subtitle: 'Детерминированный, не-генеративный редактор',
    drop: 'Перетащите или загрузите видео/фото', dropHint: 'Видео или изображение — до 35 клипов', pick: 'Выбрать файл',
    split: 'Разрез', crop: 'Обрезка', detach: 'Отделить звук', fade: 'Затухание', color: 'Цветокоррекция',
    saturation: 'Насыщенность', contrast: 'Контраст', brightness: 'Яркость', temperature: 'Температура',
    fadeIn: 'Вход', fadeOut: 'Выход', reset: 'Сброс', apply: 'Применить', applying: 'Обработка…',
    muted: 'Без звука', mute: 'Заглушить', addSplit: 'Метка разреза', cropHint: 'Проведите по кадру, чтобы задать область обрезки',
    cmdPh: 'G, разрежь на 2.5с и убери красную чашку…', send: 'Отправить',
    result: 'Результат', download: 'Скачать', clips: 'Клипы', maxReached: 'Максимум 35 клипов',
    aiFill: 'AI-заливка (генеративная)', inpaintOff: 'Удаление объектов ещё не настроено', done: 'Готово',
    failed: 'Не удалось', needClip: 'Сначала загрузите клип', close: 'Закрыть',
  },
};

interface Clip { id: string; file: File; url: string; kind: 'video' | 'image'; name: string }
interface Grade { saturation: number; contrast: number; brightness: number; temperature: number }
interface Rect { x: number; y: number; w: number; h: number }
type EditAction = 'split' | 'crop' | 'detach' | 'color' | 'fade';

const NEUTRAL: Grade = { saturation: 100, contrast: 100, brightness: 100, temperature: 0 };

/** CSS approximation of the ffmpeg grade so the preview matches the export intent. */
function gradeFilter(g: Grade): string {
  const warm = g.temperature / 100; // -1..1
  const sepia = warm > 0 ? warm * 0.35 : 0;
  const hue = warm < 0 ? warm * 18 : 0; // cool → slight blue hue-rotate
  return `saturate(${g.saturation}%) contrast(${g.contrast}%) brightness(${g.brightness}%) sepia(${sepia.toFixed(2)}) hue-rotate(${hue.toFixed(0)}deg)`;
}

/** Upload a File straight to Supabase via a signed URL; returns the storage PATH (server signs a read URL). */
async function uploadClip(file: File): Promise<string | null> {
  try {
    const signRes = await fetch('/api/upload/sign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ contentType: file.type || 'application/octet-stream' }),
    });
    const sign = (await signRes.json().catch(() => ({}))) as { bucket?: string; path?: string; token?: string };
    if (!signRes.ok || !sign.path || !sign.token) return null;
    const sb = createBrowserClient();
    const { error } = await sb.storage.from(sign.bucket || 'uploads').uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type || 'application/octet-stream' });
    return error ? null : (sign.path ?? null);
  } catch {
    return null;
  }
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function SurgicalEditor({ locale, onExit }: { locale: string; onExit: () => void }) {
  const t = T[norm(locale)];
  const [clips, setClips] = useState<Clip[]>([]);
  const [active, setActive] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [splits, setSplits] = useState<number[]>([]);
  const [grade, setGrade] = useState<Grade>(NEUTRAL);
  const [fade, setFade] = useState<{ inSec: number; outSec: number }>({ inSec: 0, outSec: 0 });
  const [cropOn, setCropOn] = useState(false);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [cmd, setCmd] = useState('');
  const [busy, setBusy] = useState<EditAction | null>(null);
  const [result, setResult] = useState<{ url: string; audioUrl?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const clipsRef = useRef<Clip[]>([]);

  const clip = clips[active];

  // Revoke object URLs ONLY on unmount (via a ref) — a [clips]-deps cleanup would revoke still-in-use URLs on
  // every upload, blanking earlier previews. Keep the ref in sync so unmount frees exactly the live set.
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => () => { clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url)); }, []);
  useEffect(() => { setSplits([]); setGrade(NEUTRAL); setFade({ inSec: 0, outSec: 0 }); setCrop(null); setResult(null); setCurrent(0); }, [active]);

  const flash = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600); }, []);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const incoming: Clip[] = [];
    for (const f of Array.from(files)) {
      const kind: 'video' | 'image' | null = f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : null;
      if (!kind) continue;
      incoming.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: f, url: URL.createObjectURL(f), kind, name: f.name });
    }
    setClips((prev) => {
      const next = [...prev, ...incoming].slice(0, MAX_CLIPS);
      if (prev.length + incoming.length > MAX_CLIPS) flash(t.maxReached);
      return next;
    });
  }, [flash, t.maxReached]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { void v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  }, []);

  const seekTo = useCallback((frac: number) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const time = Math.max(0, Math.min(duration, frac * duration));
    v.currentTime = time;
    setCurrent(time);
  }, [duration]);

  const onStageDown = useCallback((e: React.MouseEvent) => {
    if (!cropOn || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    dragStart.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    setCrop({ x: dragStart.current.x, y: dragStart.current.y, w: 0, h: 0 });
  }, [cropOn]);

  const onStageMove = useCallback((e: React.MouseEvent) => {
    if (!cropOn || !dragStart.current || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const s = dragStart.current;
    setCrop({ x: Math.min(s.x, cx), y: Math.min(s.y, cy), w: Math.abs(cx - s.x), h: Math.abs(cy - s.y) });
  }, [cropOn]);

  const onStageUp = useCallback(() => { dragStart.current = null; }, []);

  // Lightweight, HONEST command parsing: pull a timecode (→ seek + split) and flag an object-removal intent.
  const runCommand = useCallback(() => {
    const s = cmd.trim();
    if (!s) return;
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:s|sec|წამ|сек|с)\b/i);
    if (m && m[1] && duration) {
      const at = parseFloat(m[1].replace(',', '.'));
      seekTo(Math.min(1, at / duration));
      setSplits((prev) => Array.from(new Set([...prev, Math.min(duration, at)])).sort((a, b) => a - b));
    }
    if (/remove|erase|delete|მოაშ|убер|удали/i.test(s)) flash(t.inpaintOff);
    setCmd('');
  }, [cmd, duration, seekTo, flash, t.inpaintOff]);

  const apply = useCallback(async (action: EditAction) => {
    if (!clip) { flash(t.needClip); return; }
    if (busy) return;
    setBusy(action);
    setResult(null);
    try {
      const path = await uploadClip(clip.file);
      if (!path) { flash(t.failed); setBusy(null); return; }
      const body: Record<string, unknown> = { action, mediaUrl: path };
      if (action === 'split') { body.startSec = current; body.durationSec = Math.max(1, duration - current || 5); }
      if (action === 'color') { body.saturation = grade.saturation; body.contrast = grade.contrast; body.brightness = grade.brightness; body.temperature = grade.temperature; }
      if (action === 'fade') { body.fadeInSec = fade.inSec; body.fadeOutSec = fade.outSec; body.durationSec = duration; }
      if (action === 'crop') {
        // The media is letterboxed/centered inside the stage, so crop coords (measured from the STAGE) must be
        // translated into media-local space, scaled by the SOURCE/displayed ratio, and clamped to the source
        // frame. Works for both video (videoWidth/Height) and image (naturalWidth/Height). No valid media ⇒ abort.
        const isVid = clip?.kind === 'video';
        const el: HTMLVideoElement | HTMLImageElement | null = isVid ? videoRef.current : imgRef.current;
        if (!crop || !el || !stageRef.current) { flash(t.failed); setBusy(null); return; }
        const mediaRect = el.getBoundingClientRect();
        const stageRect = stageRef.current.getBoundingClientRect();
        const nw = isVid ? (el as HTMLVideoElement).videoWidth : (el as HTMLImageElement).naturalWidth;
        const nh = isVid ? (el as HTMLVideoElement).videoHeight : (el as HTMLImageElement).naturalHeight;
        if (!nw || !nh || !mediaRect.width || !mediaRect.height) { flash(t.failed); setBusy(null); return; }
        const sx = nw / mediaRect.width, sy = nh / mediaRect.height;
        const x = Math.max(0, Math.min(nw - 2, (crop.x - (mediaRect.left - stageRect.left)) * sx));
        const y = Math.max(0, Math.min(nh - 2, (crop.y - (mediaRect.top - stageRect.top)) * sy));
        body.bounds = { x, y, w: Math.min(crop.w * sx, nw - x), h: Math.min(crop.h * sy, nh - y) };
      }
      const res = await fetch('/api/ai/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const j = (await res.json().catch(() => null)) as { url?: string | null; audioUrl?: string | null; error?: string } | null;
      if (res.ok && j?.url) { setResult({ url: j.url, audioUrl: j.audioUrl ?? undefined }); flash(t.done); }
      else flash(t.failed);
    } catch {
      flash(t.failed);
    } finally {
      setBusy(null);
    }
  }, [clip, busy, current, duration, grade, fade, crop, flash, t.needClip, t.failed, t.done]);

  const filterCss = useMemo(() => gradeFilter(grade), [grade]);
  const progress = duration ? Math.min(1, current / duration) : 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-app-bg text-app-text">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-app-border/15 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-app-accent/15"><Scissors size={16} className="text-app-accent" /></span>
          <div>
            <div className="text-[14px] font-bold leading-tight">{t.title}</div>
            <div className="text-[11px] text-app-muted">{t.subtitle}</div>
          </div>
        </div>
        <button type="button" onClick={onExit} aria-label={t.close} className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-app-elevated hover:text-app-text"><X size={17} /></button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {clips.length === 0 ? (
          /* Dropzone */
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-app-border/25 bg-app-surface/40 p-10 text-center transition-colors hover:border-app-accent/40"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-app-accent/12"><Upload size={24} className="text-app-accent" /></span>
            <div className="text-[15px] font-semibold">{t.drop}</div>
            <div className="text-[12px] text-app-muted">{t.dropHint}</div>
            <span className="mt-1 rounded-lg bg-app-accent px-4 py-2 text-[13px] font-semibold text-app-bg">{t.pick}</span>
            <input type="file" accept="video/*,image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </label>
        ) : (
          <>
            {/* Clip strip */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {clips.map((c, i) => (
                <button key={c.id} type="button" onClick={() => setActive(i)}
                  className={`relative flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border text-[10px] ${i === active ? 'border-app-accent ring-1 ring-app-accent' : 'border-app-border/20'} bg-app-elevated`}>
                  {c.kind === 'image'
                    ? <img src={c.url} alt="" className="h-full w-full object-cover" />
                    : <Film size={16} className="text-app-muted" />}
                </button>
              ))}
              <label className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed border-app-border/25 text-app-muted hover:border-app-accent/40">
                <Upload size={15} />
                <input type="file" accept="video/*,image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              </label>
            </div>

            {/* Preview stage */}
            <div
              ref={stageRef}
              onMouseDown={onStageDown} onMouseMove={onStageMove} onMouseUp={onStageUp} onMouseLeave={onStageUp}
              className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-black ${cropOn ? 'cursor-crosshair' : ''}`}
              style={{ minHeight: 220, maxHeight: 360 }}
            >
              {clip?.kind === 'video' ? (
                <video
                  ref={videoRef} src={clip.url} muted={muted} playsInline
                  style={{ filter: filterCss, maxHeight: 360 }} className="h-auto max-w-full"
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                  onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                  onEnded={() => setPlaying(false)}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img ref={imgRef} src={clip?.url} alt="" style={{ filter: filterCss, maxHeight: 360 }} className="h-auto max-w-full" />
              )}
              {cropOn && crop && crop.w > 4 && (
                <div className="pointer-events-none absolute border-2 border-app-accent bg-app-accent/10" style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }} />
              )}
              {cropOn && !crop && (
                <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1 text-[11px] text-white">{t.cropHint}</div>
              )}
            </div>

            {/* Timeline (video only) */}
            {clip?.kind === 'video' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={togglePlay} className="flex h-8 w-8 items-center justify-center rounded-lg bg-app-elevated text-app-text ring-1 ring-app-border/15">
                    {playing ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <div
                    className="relative h-8 flex-1 cursor-pointer overflow-hidden rounded-lg bg-app-elevated"
                    onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekTo((e.clientX - r.left) / r.width); }}
                  >
                    <div className="absolute inset-y-0 left-0 bg-app-accent/20" style={{ width: `${progress * 100}%` }} />
                    {splits.map((s, i) => (
                      <div key={i} className="absolute inset-y-0 w-0.5 bg-amber-400" style={{ left: `${duration ? (s / duration) * 100 : 0}%` }} />
                    ))}
                    <div className="absolute inset-y-0 w-0.5 bg-app-accent" style={{ left: `${progress * 100}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-app-muted">{fmt(current)} / {fmt(duration)}</span>
                </div>
              </div>
            )}

            {/* Tools dashboard — auto-rows-fr keeps a wrapped Georgian label from making rows uneven. */}
            <div className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3">
              <ToolButton icon={<Scissors size={15} />} label={t.split} busy={busy === 'split'} onClick={() => apply('split')} disabled={clip?.kind !== 'video'} />
              <ToolButton icon={<Crop size={15} />} label={t.crop} active={cropOn} busy={busy === 'crop'} onClick={() => { if (cropOn && crop) apply('crop'); else setCropOn((v) => !v); }} />
              <ToolButton icon={muted ? <VolumeX size={15} /> : <Volume2 size={15} />} label={t.detach} busy={busy === 'detach'} onClick={() => { setMuted(true); apply('detach'); }} disabled={clip?.kind !== 'video'} />
              <ToolButton icon={<Scissors size={15} />} label={t.addSplit} onClick={() => { if (duration) setSplits((p) => Array.from(new Set([...p, current])).sort((a, b) => a - b)); }} disabled={clip?.kind !== 'video'} />
              <ToolButton icon={muted ? <VolumeX size={15} /> : <Volume2 size={15} />} label={muted ? t.muted : t.mute} active={muted} onClick={() => setMuted((v) => !v)} disabled={clip?.kind !== 'video'} />
              <ToolButton icon={<RotateCcw size={15} />} label={t.reset} onClick={() => { setGrade(NEUTRAL); setFade({ inSec: 0, outSec: 0 }); setCrop(null); setCropOn(false); setSplits([]); }} />
            </div>

            {/* Color grading */}
            <div className="space-y-2.5 rounded-xl border border-app-border/15 bg-app-surface/50 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-app-muted">{t.color}</span>
                <button type="button" onClick={() => apply('color')} disabled={busy === 'color'} className="inline-flex items-center gap-1.5 rounded-lg bg-app-accent px-3 py-1.5 text-[12px] font-semibold text-app-bg disabled:opacity-60">
                  {busy === 'color' ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}{busy === 'color' ? t.applying : t.apply}
                </button>
              </div>
              <Slider icon={<Droplet size={13} />} label={t.saturation} min={0} max={200} value={grade.saturation} onChange={(v) => setGrade((g) => ({ ...g, saturation: v }))} />
              <Slider icon={<ContrastIcon size={13} />} label={t.contrast} min={0} max={200} value={grade.contrast} onChange={(v) => setGrade((g) => ({ ...g, contrast: v }))} />
              <Slider icon={<SunMedium size={13} />} label={t.brightness} min={0} max={200} value={grade.brightness} onChange={(v) => setGrade((g) => ({ ...g, brightness: v }))} />
              <Slider icon={<Thermometer size={13} />} label={t.temperature} min={-100} max={100} value={grade.temperature} onChange={(v) => setGrade((g) => ({ ...g, temperature: v }))} />
            </div>

            {/* Fade */}
            {clip?.kind === 'video' && (
              <div className="space-y-2.5 rounded-xl border border-app-border/15 bg-app-surface/50 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-app-muted">{t.fade}</span>
                  <button type="button" onClick={() => apply('fade')} disabled={busy === 'fade'} className="inline-flex items-center gap-1.5 rounded-lg bg-app-elevated px-3 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 disabled:opacity-60">
                    {busy === 'fade' ? <Loader2 size={12} className="animate-spin" /> : null}{busy === 'fade' ? t.applying : t.apply}
                  </button>
                </div>
                <Slider label={t.fadeIn} min={0} max={5} step={0.1} value={fade.inSec} onChange={(v) => setFade((f) => ({ ...f, inSec: v }))} suffix="s" />
                <Slider label={t.fadeOut} min={0} max={5} step={0.1} value={fade.outSec} onChange={(v) => setFade((f) => ({ ...f, outSec: v }))} suffix="s" />
              </div>
            )}

            {/* Command box */}
            <div className="flex items-center gap-2 rounded-xl border border-app-border/15 bg-app-surface/50 p-2">
              <input
                value={cmd} onChange={(e) => setCmd(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runCommand(); }}
                placeholder={t.cmdPh}
                className="min-w-0 flex-1 bg-transparent px-2 text-[13px] text-app-text placeholder:text-app-muted focus:outline-none"
              />
              <button type="button" onClick={runCommand} className="shrink-0 rounded-lg bg-app-elevated px-3 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15">{t.send}</button>
            </div>

            {/* Result */}
            {result && (
              <div className="space-y-2 rounded-xl border border-app-accent/25 bg-app-surface/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-app-accent">{t.result}</span>
                  <div className="flex gap-2">
                    <a href={result.url} download className="inline-flex items-center gap-1 rounded-lg bg-app-elevated px-3 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15"><Download size={12} />{t.download}</a>
                    {result.audioUrl && <a href={result.audioUrl} download className="inline-flex items-center gap-1 rounded-lg bg-app-elevated px-3 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15"><Volume2 size={12} />{t.detach}</a>}
                  </div>
                </div>
                <video src={result.url} controls playsInline className="max-h-52 w-full rounded-lg bg-black" />
              </div>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-[12px] text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}

function ToolButton({ icon, label, onClick, busy, active, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; busy?: boolean; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy}
      className={`inline-flex min-h-[42px] min-w-0 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-center text-[12px] font-semibold leading-tight transition-colors disabled:opacity-40 ${active ? 'bg-app-accent text-app-bg' : 'bg-app-elevated text-app-text ring-1 ring-app-border/15 hover:bg-app-surface'}`}>
      <span className="shrink-0">{busy ? <Loader2 size={14} className="animate-spin" /> : icon}</span>
      <span className="min-w-0 break-words">{label}</span>
    </button>
  );
}

function Slider({ icon, label, min, max, value, step = 1, suffix = '%', onChange }: { icon?: React.ReactNode; label: string; min: number; max: number; value: number; step?: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex w-20 shrink-0 items-center gap-1.5 text-[11.5px] leading-tight text-app-text/80 sm:w-24">{icon}<span className="min-w-0 break-words">{label}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-app-elevated accent-app-accent" />
      <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-app-muted">{step < 1 ? value.toFixed(1) : Math.round(value)}{suffix}</span>
    </div>
  );
}
