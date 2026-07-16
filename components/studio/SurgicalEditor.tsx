'use client';

/**
 * SurgicalEditor — a NON-LINEAR, Premiere-style editor (ქირურგიული მონტაჟი).
 *
 * Every edit is INSTANT + client-side: colour grade is a live CSS filter, splits slice the timeline in React
 * state, mute flips a flag. Nothing hits the server until the user clicks "Export" — then the whole accumulated
 * `draft` is sent in ONE POST to /api/ai/edit (action:'render'), which runs a single deterministic ffmpeg pass.
 *
 * Adaptive layout: a PHOTO hides the timeline / play / audio / fade tools and shows only Crop + Colour + the AI
 * object-removal panel (export → "Export Photo"); a VIDEO shows the full timeline (export → "Export Video").
 *
 * HONEST SCOPE: split/crop/grade/fade/mute are deterministic (no frames invented). AI object-removal is
 * generative fill — clearly labelled, metered, and inert (clean 503) until the inpaint model is configured.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Scissors, Crop, Volume2, VolumeX, Play, Pause, Upload, X, Download, Loader2,
  SunMedium, Contrast as ContrastIcon, Droplet, Thermometer, RotateCcw, Sparkles, Film, Clapperboard, Image as ImageIcon,
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser';

type Lang = 'ka' | 'en' | 'ru';
const norm = (l: string): Lang => (l === 'en' || l === 'ru' ? l : 'ka');
const MAX_CLIPS = 35;

interface Copy {
  title: string; subtitle: string; drop: string; dropHint: string; pick: string;
  crop: string; color: string; fade: string; split: string; mute: string; unmute: string; reset: string;
  saturation: string; contrast: string; brightness: string; temperature: string; fadeIn: string; fadeOut: string;
  clips: string; maxReached: string; cropHint: string; segments: string; segment: string; muted: string;
  exportVideo: string; exportPhoto: string; exporting: string; exportHint: string; noEdits: string;
  result: string; download: string; done: string; failed: string; needClip: string; close: string;
  aiRemove: string; aiRemovePh: string; aiRemoveRun: string; inpaintOff: string;
}

const T: Record<Lang, Copy> = {
  ka: {
    title: 'ქირურგიული მონტაჟი', subtitle: 'არა-ლინეარული რედაქტორი — ცვლილებები მყისიერია',
    drop: 'ჩააგდე ან ატვირთე ვიდეო/ფოტო', dropHint: 'ვიდეო ან სურათი — მაქს. 35 კლიპი', pick: 'ფაილის არჩევა',
    crop: 'ჩამოჭრა', color: 'ფერის გრადაცია', fade: 'მილევა', split: 'გაჭრა', mute: 'დადუმება', unmute: 'ხმის ჩართვა', reset: 'გადატვირთვა',
    saturation: 'გაჯერება', contrast: 'კონტრასტი', brightness: 'სიკაშკაშე', temperature: 'ტემპერატურა', fadeIn: 'შესვლა', fadeOut: 'გასვლა',
    clips: 'კლიპები', maxReached: 'მაქსიმუმ 35 კლიპი', cropHint: 'გადაათრიე კადრზე მოსაჭრელი არეს მოსანიშნად', segments: 'სეგმენტები', segment: 'სეგმენტი', muted: 'დადუმებული',
    exportVideo: 'ვიდეოს ექსპორტი', exportPhoto: 'სურათის შენახვა', exporting: 'მიმდინარეობს ვიდეოს დამუშავება…', exportHint: 'გამოიყენე ერთი ან მეტი ცვლილება ექსპორტისთვის', noEdits: 'ცვლილებები არ არის',
    result: 'შედეგი', download: 'ჩამოტვირთვა', done: 'მზადაა', failed: 'ვერ შესრულდა', needClip: 'ჯერ ატვირთე კლიპი', close: 'დახურვა',
    aiRemove: 'AI ობიექტის მოშორება', aiRemovePh: 'აღწერე მოსაშორებელი ობიექტი…', aiRemoveRun: 'მოშორება', inpaintOff: 'ობიექტის მოშორება ჯერ არ არის კონფიგურირებული',
  },
  en: {
    title: 'Surgical Editor', subtitle: 'Non-linear editor — every edit is instant',
    drop: 'Drop or upload video/photo', dropHint: 'Video or image — up to 35 clips', pick: 'Choose file',
    crop: 'Crop', color: 'Color grade', fade: 'Fade', split: 'Split', mute: 'Mute', unmute: 'Unmute', reset: 'Reset',
    saturation: 'Saturation', contrast: 'Contrast', brightness: 'Brightness', temperature: 'Temperature', fadeIn: 'In', fadeOut: 'Out',
    clips: 'Clips', maxReached: 'Maximum 35 clips', cropHint: 'Drag on the frame to mark the crop region', segments: 'Segments', segment: 'Segment', muted: 'Muted',
    exportVideo: 'Export Video', exportPhoto: 'Export Photo', exporting: 'Exporting render…', exportHint: 'Make an edit to enable export', noEdits: 'No edits yet',
    result: 'Result', download: 'Download', done: 'Ready', failed: 'Failed', needClip: 'Upload a clip first', close: 'Close',
    aiRemove: 'AI object removal', aiRemovePh: 'Describe the object to remove…', aiRemoveRun: 'Remove', inpaintOff: 'Object removal is not configured yet',
  },
  ru: {
    title: 'Хирургический редактор', subtitle: 'Нелинейный редактор — правки мгновенны',
    drop: 'Перетащите или загрузите видео/фото', dropHint: 'Видео или изображение — до 35 клипов', pick: 'Выбрать файл',
    crop: 'Обрезка', color: 'Цветокоррекция', fade: 'Затухание', split: 'Разрез', mute: 'Заглушить', unmute: 'Включить звук', reset: 'Сброс',
    saturation: 'Насыщенность', contrast: 'Контраст', brightness: 'Яркость', temperature: 'Температура', fadeIn: 'Вход', fadeOut: 'Выход',
    clips: 'Клипы', maxReached: 'Максимум 35 клипов', cropHint: 'Проведите по кадру, чтобы задать область обрезки', segments: 'Сегменты', segment: 'Сегмент', muted: 'Без звука',
    exportVideo: 'Экспорт видео', exportPhoto: 'Сохранить фото', exporting: 'Обработка видео…', exportHint: 'Сделайте правку, чтобы включить экспорт', noEdits: 'Пока нет правок',
    result: 'Результат', download: 'Скачать', done: 'Готово', failed: 'Не удалось', needClip: 'Сначала загрузите клип', close: 'Закрыть',
    aiRemove: 'AI-удаление объектов', aiRemovePh: 'Опишите удаляемый объект…', aiRemoveRun: 'Удалить', inpaintOff: 'Удаление объектов ещё не настроено',
  },
};

interface Clip { id: string; file: File; url: string; kind: 'video' | 'image'; name: string }
interface Grade { saturation: number; contrast: number; brightness: number; temperature: number }
interface Rect { x: number; y: number; w: number; h: number }
interface Segment { id: string; start: number; end: number; muted: boolean }

const NEUTRAL: Grade = { saturation: 100, contrast: 100, brightness: 100, temperature: 0 };
const isNeutral = (g: Grade) => g.saturation === 100 && g.contrast === 100 && g.brightness === 100 && g.temperature === 0;

/** CSS approximation of the ffmpeg grade so the live preview matches the export intent. */
function gradeFilter(g: Grade): string {
  const warm = g.temperature / 100;
  const sepia = warm > 0 ? warm * 0.35 : 0;
  const hue = warm < 0 ? warm * 18 : 0;
  return `saturate(${g.saturation}%) contrast(${g.contrast}%) brightness(${g.brightness}%) sepia(${sepia.toFixed(2)}) hue-rotate(${hue.toFixed(0)}deg)`;
}

/** Upload a File to Supabase via a signed URL; returns the storage PATH (server signs a read URL). */
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

  // ── The non-linear draft (all edits accumulate here — nothing renders server-side until Export) ──
  const [grade, setGrade] = useState<Grade>(NEUTRAL);
  const [fade, setFade] = useState<{ inSec: number; outSec: number }>({ inSec: 0, outSec: 0 });
  const [crop, setCrop] = useState<Rect | null>(null);
  const [cropOn, setCropOn] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSeg, setSelectedSeg] = useState(0);

  const [cmd, setCmd] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [result, setResult] = useState<{ url: string; kind: 'video' | 'image' } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const clipsRef = useRef<Clip[]>([]);

  const clip = clips[active];
  const isPhoto = clip?.kind === 'image';

  // Revoke object URLs only on unmount (a [clips]-deps cleanup would revoke still-in-use URLs on every upload).
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => () => { clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url)); }, []);

  const flash = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600); }, []);

  // Reset the whole draft to the pristine uploaded media when the active clip changes.
  const resetDraft = useCallback((dur: number) => {
    setGrade(NEUTRAL); setFade({ inSec: 0, outSec: 0 }); setCrop(null); setCropOn(false);
    setSegments(dur > 0 ? [{ id: 'seg-0', start: 0, end: dur, muted: false }] : []);
    setSelectedSeg(0); setResult(null); setCurrent(0);
  }, []);
  useEffect(() => { resetDraft(0); }, [active, resetDraft]);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const incoming: Clip[] = [];
    for (const f of Array.from(files)) {
      const kind: 'video' | 'image' | null = f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : null;
      if (!kind) continue;
      incoming.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: f, url: URL.createObjectURL(f), kind, name: f.name });
    }
    setClips((prev) => {
      if (prev.length + incoming.length > MAX_CLIPS) flash(t.maxReached);
      return [...prev, ...incoming].slice(0, MAX_CLIPS);
    });
  }, [flash, t.maxReached]);

  const onLoadedMeta = useCallback((dur: number) => { setDuration(dur); setSegments([{ id: 'seg-0', start: 0, end: dur, muted: false }]); setSelectedSeg(0); }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { void v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  }, []);

  const seekTo = useCallback((frac: number) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const time = Math.max(0, Math.min(duration, frac * duration));
    v.currentTime = time; setCurrent(time);
  }, [duration]);

  // Split the segment under the playhead into two — pure React state, no server call.
  const splitAtPlayhead = useCallback(() => {
    if (!duration) return;
    setSegments((prev) => {
      const src = prev.length ? prev : [{ id: 'seg-0', start: 0, end: duration, muted: false }];
      const out: Segment[] = [];
      let did = false;
      for (const s of src) {
        if (!did && current > s.start + 0.05 && current < s.end - 0.05) {
          out.push({ id: `${s.id}-a-${Math.round(current * 100)}`, start: s.start, end: current, muted: s.muted });
          out.push({ id: `${s.id}-b-${Math.round(current * 100)}`, start: current, end: s.end, muted: s.muted });
          did = true;
        } else {
          out.push(s);
        }
      }
      return out;
    });
  }, [current, duration]);

  const toggleMuteSeg = useCallback(() => {
    setSegments((prev) => prev.map((s, i) => (i === selectedSeg ? { ...s, muted: !s.muted } : s)));
  }, [selectedSeg]);

  const onStageDown = useCallback((e: React.MouseEvent) => {
    if (!cropOn || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    dragStart.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    setCrop({ x: dragStart.current.x, y: dragStart.current.y, w: 0, h: 0 });
  }, [cropOn]);
  const onStageMove = useCallback((e: React.MouseEvent) => {
    if (!cropOn || !dragStart.current || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top; const s = dragStart.current;
    setCrop({ x: Math.min(s.x, cx), y: Math.min(s.y, cy), w: Math.abs(cx - s.x), h: Math.abs(cy - s.y) });
  }, [cropOn]);
  const onStageUp = useCallback(() => { dragStart.current = null; }, []);

  // Translate the display-space crop rect into SOURCE pixels (media is letterboxed inside the stage).
  const sourceCrop = useCallback((): Rect | null => {
    if (!crop || crop.w < 4 || !stageRef.current) return null;
    const el: HTMLVideoElement | HTMLImageElement | null = isPhoto ? imgRef.current : videoRef.current;
    if (!el) return null;
    const mediaRect = el.getBoundingClientRect();
    const stageRect = stageRef.current.getBoundingClientRect();
    const nw = isPhoto ? (el as HTMLImageElement).naturalWidth : (el as HTMLVideoElement).videoWidth;
    const nh = isPhoto ? (el as HTMLImageElement).naturalHeight : (el as HTMLVideoElement).videoHeight;
    if (!nw || !nh || !mediaRect.width || !mediaRect.height) return null;
    const sx = nw / mediaRect.width, sy = nh / mediaRect.height;
    const x = Math.max(0, Math.min(nw - 2, (crop.x - (mediaRect.left - stageRect.left)) * sx));
    const y = Math.max(0, Math.min(nh - 2, (crop.y - (mediaRect.top - stageRect.top)) * sy));
    return { x, y, w: Math.min(crop.w * sx, nw - x), h: Math.min(crop.h * sy, nh - y) };
  }, [crop, isPhoto]);

  const hasMutations = useMemo(() => (
    !isNeutral(grade) || fade.inSec > 0 || fade.outSec > 0 || (!!crop && crop.w > 4) || segments.some((s) => s.muted)
  ), [grade, fade, crop, segments]);

  // ── EXPORT — the single server round-trip: pack the whole draft into one /api/ai/edit render call ──
  const doExport = useCallback(async () => {
    if (!clip) { flash(t.needClip); return; }
    if (!hasMutations || exporting) return;
    setExporting(true); setExportPct(6); setResult(null);
    const tick = window.setInterval(() => setExportPct((p) => (p < 90 ? p + Math.max(1, Math.round((90 - p) / 12)) : p)), 400);
    try {
      const path = await uploadClip(clip.file);
      if (!path) { flash(t.failed); return; }
      const draft = {
        grade: isNeutral(grade) ? undefined : grade,
        fade: (fade.inSec > 0 || fade.outSec > 0) ? { inSec: fade.inSec, outSec: fade.outSec } : undefined,
        crop: sourceCrop(),
        mutedRanges: segments.filter((s) => s.muted).map((s) => ({ start: s.start, end: s.end })),
      };
      const res = await fetch('/api/ai/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'render', mediaUrl: path, kind: isPhoto ? 'photo' : 'video', durationSec: duration, draft }),
      });
      const j = (await res.json().catch(() => null)) as { url?: string | null; error?: string } | null;
      if (res.ok && j?.url) { setExportPct(100); setResult({ url: j.url, kind: isPhoto ? 'image' : 'video' }); flash(t.done); }
      else flash(t.failed);
    } catch {
      flash(t.failed);
    } finally {
      window.clearInterval(tick);
      window.setTimeout(() => { setExporting(false); setExportPct(0); }, 400);
    }
  }, [clip, hasMutations, exporting, grade, fade, segments, sourceCrop, isPhoto, duration, flash, t.needClip, t.failed, t.done]);

  // AI object removal (photo panel) — honest generative fill; inert (clean 503) until the model is configured.
  const runInpaint = useCallback(async () => {
    if (!clip || !cmd.trim()) return;
    setExporting(true); setExportPct(20); setResult(null);
    try {
      const path = await uploadClip(clip.file);
      if (!path) { flash(t.failed); return; }
      const res = await fetch('/api/ai/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'inpaint', mediaUrl: path, prompt: cmd.trim() }),
      });
      const j = (await res.json().catch(() => null)) as { url?: string | null; error?: string } | null;
      if (res.status === 503) flash(t.inpaintOff);
      else if (res.ok && j?.url) { setResult({ url: j.url, kind: 'image' }); flash(t.done); }
      else flash(t.failed);
    } catch { flash(t.failed); } finally { setExporting(false); setExportPct(0); setCmd(''); }
  }, [clip, cmd, flash, t.failed, t.done, t.inpaintOff]);

  const filterCss = useMemo(() => gradeFilter(grade), [grade]);
  const progress = duration ? Math.min(1, current / duration) : 0;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col bg-app-bg text-app-text">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-app-border/15 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-app-accent/15"><Scissors size={16} className="text-app-accent" /></span>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-bold leading-tight">{t.title}</div>
            <div className="truncate text-[11px] text-app-muted">{t.subtitle}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {clips.length > 0 && (
            <button
              type="button" onClick={doExport} disabled={!hasMutations || exporting}
              title={hasMutations ? '' : t.exportHint}
              className="group inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={hasMutations ? { background: 'linear-gradient(180deg, rgb(34,211,238), rgb(6,182,212))', color: 'var(--color-bg, #06121a)', boxShadow: '0 0 0 1px rgba(6,182,212,0.4), 0 10px 30px -8px rgba(6,182,212,0.7)' } : { background: 'var(--color-elevated)', color: 'var(--color-muted)' }}
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Clapperboard size={14} />}
              {isPhoto ? t.exportPhoto : t.exportVideo}
            </button>
          )}
          <button type="button" onClick={onExit} aria-label={t.close} className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-app-elevated hover:text-app-text"><X size={17} /></button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {clips.length === 0 ? (
          <label
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
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
                  className={`relative flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${i === active ? 'border-app-accent ring-1 ring-app-accent' : 'border-app-border/20'} bg-app-elevated`}>
                  {c.kind === 'image' ? <img src={c.url} alt="" className="h-full w-full object-cover" /> : <Film size={16} className="text-app-muted" />}
                </button>
              ))}
              <label className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed border-app-border/25 text-app-muted hover:border-app-accent/40">
                <Upload size={15} />
                <input type="file" accept="video/*,image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              </label>
            </div>

            {/* Preview stage */}
            <div
              ref={stageRef} onMouseDown={onStageDown} onMouseMove={onStageMove} onMouseUp={onStageUp} onMouseLeave={onStageUp}
              className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-black ${cropOn ? 'cursor-crosshair' : ''}`}
              style={{ minHeight: 220, maxHeight: 360 }}
            >
              {isPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img ref={imgRef} src={clip?.url} alt="" style={{ filter: filterCss, maxHeight: 360 }} className="h-auto max-w-full" />
              ) : (
                <video
                  ref={videoRef} src={clip?.url} playsInline style={{ filter: filterCss, maxHeight: 360 }} className="h-auto max-w-full"
                  onLoadedMetadata={(e) => onLoadedMeta(e.currentTarget.duration || 0)}
                  onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)}
                />
              )}
              {cropOn && crop && crop.w > 4 && <div className="pointer-events-none absolute border-2 border-app-accent bg-app-accent/10" style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }} />}
              {cropOn && !crop && <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1 text-[11px] text-white">{t.cropHint}</div>}
            </div>

            {/* Timeline + segments (VIDEO ONLY) */}
            {!isPhoto && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={togglePlay} className="flex h-8 w-8 items-center justify-center rounded-lg bg-app-elevated text-app-text ring-1 ring-app-border/15">
                    {playing ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <div className="relative h-8 flex-1 cursor-pointer overflow-hidden rounded-lg bg-app-elevated"
                    onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekTo((e.clientX - r.left) / r.width); }}>
                    <div className="absolute inset-y-0 left-0 bg-app-accent/20" style={{ width: `${progress * 100}%` }} />
                    {segments.slice(1).map((s) => <div key={s.id} className="absolute inset-y-0 w-0.5 bg-amber-400" style={{ left: `${duration ? (s.start / duration) * 100 : 0}%` }} />)}
                    <div className="absolute inset-y-0 w-0.5 bg-app-accent" style={{ left: `${progress * 100}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-app-muted">{fmt(current)} / {fmt(duration)}</span>
                </div>

                {/* Virtual segment blocks — click to select, showing mute state. */}
                {segments.length > 1 && (
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-app-muted">{t.segments}</p>
                    <div className="flex gap-1">
                      {segments.map((s, i) => {
                        const w = duration ? ((s.end - s.start) / duration) * 100 : 0;
                        return (
                          <button key={s.id} type="button" onClick={() => setSelectedSeg(i)}
                            style={{ flexBasis: `${w}%` }}
                            className={`relative flex h-9 min-w-0 items-center justify-center gap-1 overflow-hidden rounded-md border text-[10px] transition-colors ${i === selectedSeg ? 'border-app-accent bg-app-accent/15 text-app-text' : 'border-app-border/20 bg-app-elevated text-app-muted'}`}>
                            {s.muted ? <VolumeX size={11} className="shrink-0 text-amber-400" /> : null}
                            <span className="truncate">{fmt(s.end - s.start)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tools */}
            <div className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3">
              <ToolButton icon={<Crop size={15} />} label={t.crop} active={cropOn} onClick={() => setCropOn((v) => !v)} />
              {!isPhoto && <ToolButton icon={<Scissors size={15} />} label={t.split} onClick={splitAtPlayhead} />}
              {!isPhoto && (
                <ToolButton
                  icon={segments[selectedSeg]?.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  label={segments[selectedSeg]?.muted ? t.unmute : t.mute}
                  active={!!segments[selectedSeg]?.muted}
                  onClick={toggleMuteSeg} disabled={segments.length < 1}
                />
              )}
              <ToolButton icon={<RotateCcw size={15} />} label={t.reset} onClick={() => resetDraft(duration)} />
            </div>

            {/* Color grading (both) — instant CSS preview, no server call */}
            <div className="space-y-2.5 rounded-xl border border-app-border/15 bg-app-surface/50 p-3.5">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-app-muted">{t.color}</span>
              <Slider icon={<Droplet size={13} />} label={t.saturation} min={0} max={200} value={grade.saturation} onChange={(v) => setGrade((g) => ({ ...g, saturation: v }))} />
              <Slider icon={<ContrastIcon size={13} />} label={t.contrast} min={0} max={200} value={grade.contrast} onChange={(v) => setGrade((g) => ({ ...g, contrast: v }))} />
              <Slider icon={<SunMedium size={13} />} label={t.brightness} min={0} max={200} value={grade.brightness} onChange={(v) => setGrade((g) => ({ ...g, brightness: v }))} />
              <Slider icon={<Thermometer size={13} />} label={t.temperature} min={-100} max={100} value={grade.temperature} onChange={(v) => setGrade((g) => ({ ...g, temperature: v }))} />
            </div>

            {/* Fade (VIDEO ONLY) */}
            {!isPhoto && (
              <div className="space-y-2.5 rounded-xl border border-app-border/15 bg-app-surface/50 p-3.5">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-app-muted">{t.fade}</span>
                <Slider label={t.fadeIn} min={0} max={5} step={0.1} value={fade.inSec} onChange={(v) => setFade((f) => ({ ...f, inSec: v }))} suffix="s" />
                <Slider label={t.fadeOut} min={0} max={5} step={0.1} value={fade.outSec} onChange={(v) => setFade((f) => ({ ...f, outSec: v }))} suffix="s" />
              </div>
            )}

            {/* AI object removal (PHOTO ONLY) */}
            {isPhoto && (
              <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-surface/50 p-3.5">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-app-muted"><Sparkles size={12} className="text-app-accent" />{t.aiRemove}</span>
                <div className="flex items-center gap-2">
                  <input value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runInpaint(); }}
                    placeholder={t.aiRemovePh} className="min-w-0 flex-1 rounded-lg bg-app-bg/40 px-3 py-2 text-[13px] text-app-text placeholder:text-app-muted focus:outline-none" />
                  <button type="button" onClick={() => void runInpaint()} disabled={!cmd.trim() || exporting}
                    className="shrink-0 rounded-lg bg-app-elevated px-3 py-2 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 disabled:opacity-50">{t.aiRemoveRun}</button>
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="space-y-2 rounded-xl border border-app-accent/25 bg-app-surface/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-app-accent">{t.result}</span>
                  <a href={result.url} download className="inline-flex items-center gap-1 rounded-lg bg-app-elevated px-3 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15"><Download size={12} />{t.download}</a>
                </div>
                {result.kind === 'image'
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={result.url} alt="" className="max-h-52 w-full rounded-lg bg-black object-contain" />
                  : <video src={result.url} controls playsInline className="max-h-52 w-full rounded-lg bg-black" />}
              </div>
            )}
          </>
        )}
      </div>

      {/* Export progress modal */}
      {exporting && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-[340px] rounded-2xl border border-app-border/20 bg-app-surface p-6 text-center shadow-2xl">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-app-accent/15"><Clapperboard size={22} className="text-app-accent" /></span>
            <div className="mb-3 text-[13.5px] font-semibold text-app-text">{t.exporting}</div>
            <div className="h-2 overflow-hidden rounded-full bg-app-elevated">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${exportPct}%`, background: 'linear-gradient(90deg, rgb(34,211,238), rgb(6,182,212))' }} />
            </div>
            <div className="mt-2 text-[11px] tabular-nums text-app-muted">{exportPct}%</div>
          </div>
        </div>
      )}

      {toast && <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-[12px] text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function ToolButton({ icon, label, onClick, active, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`inline-flex min-h-[42px] min-w-0 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-center text-[12px] font-semibold leading-tight transition-colors disabled:opacity-40 ${active ? 'bg-app-accent text-app-bg' : 'bg-app-elevated text-app-text ring-1 ring-app-border/15 hover:bg-app-surface'}`}>
      <span className="shrink-0">{icon}</span><span className="min-w-0 break-words">{label}</span>
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
