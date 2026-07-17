'use client';

/**
 * SurgicalEditor — a NON-LINEAR, Premiere-style editor (ქირურგიული მონტაჟი).
 *
 * Multi-clip: drop up to 5 different videos and they become blocks on ONE timeline, each block pointing at its
 * own source file. Split / delete / reorder / mute work across clips, all in React state (<10ms, no server).
 * Colour grade is a live CSS filter. On Export the whole ordered sequence goes in ONE /api/ai/edit call — a
 * single ffmpeg pass that trims + scales-to-uniform + concatenates the distinct sources, then grade + fade.
 *
 * PHOTO mode swaps the timeline for Crop + Colour + a mask-paint AI object-removal panel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Scissors, Crop, Volume2, VolumeX, Play, Pause, Upload, X, Download, Loader2, Trash2, ChevronLeft, ChevronRight,
  SunMedium, Contrast as ContrastIcon, Droplet, Thermometer, RotateCcw, Sparkles, Film, Clapperboard, Brush,
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser';

type Lang = 'ka' | 'en' | 'ru';
const norm = (l: string): Lang => (l === 'en' || l === 'ru' ? l : 'ka');
const MAX_CLIPS = 35;
const MAX_SEQ_CLIPS = 5; // distinct video sources in one concat sequence
const MASK_CAP = 1536;

interface Copy {
  title: string; subtitle: string; drop: string; dropHint: string; pick: string;
  crop: string; color: string; fade: string; split: string; mute: string; unmute: string; reset: string;
  saturation: string; contrast: string; brightness: string; temperature: string; fadeIn: string; fadeOut: string;
  maxReached: string; max5: string; cropHint: string; sequence: string; seqDur: string; del: string; moveL: string; moveR: string; clipN: string;
  transition: string; tCut: string; tCross: string; tFade: string;
  textOverlay: string; overlayPh: string; oSize: string; oColor: string;
  exportVideo: string; exportPhoto: string; exporting: string; exportHint: string;
  result: string; download: string; done: string; failed: string; needClip: string; close: string;
  aiRemove: string; brush: string; drawMask: string; clearMask: string; remove: string; paintFirst: string; inpaintOff: string; aiPromptPh: string;
}

const T: Record<Lang, Copy> = {
  ka: {
    title: 'ქირურგიული მონტაჟი', subtitle: 'არა-ლინეარული რედაქტორი — გადააბი სხვადასხვა კლიპი',
    drop: 'ჩააგდე ან ატვირთე ვიდეო/ფოტო', dropHint: 'ვიდეო ან სურათი — მაქს. 35 ფაილი', pick: 'ფაილის არჩევა',
    crop: 'ჩამოჭრა', color: 'ფერის გრადაცია', fade: 'მილევა', split: 'გაჭრა', mute: 'დადუმება', unmute: 'ხმის ჩართვა', reset: 'გადატვირთვა',
    saturation: 'გაჯერება', contrast: 'კონტრასტი', brightness: 'სიკაშკაშე', temperature: 'ტემპერატურა', fadeIn: 'შესვლა', fadeOut: 'გასვლა',
    maxReached: 'მაქსიმუმ 35 ფაილი', max5: 'მაქსიმუმ 5 კლიპი თანმიმდევრობაში', cropHint: 'გადაათრიე კადრზე მოსაჭრელი არეს მოსანიშნად', sequence: 'თანმიმდევრობა', seqDur: 'ხანგრძლივობა', del: 'წაშლა', moveL: 'მარცხნივ', moveR: 'მარჯვნივ', clipN: 'კლიპი',
    transition: 'გადასვლა', tCut: 'კვეთა', tCross: 'გადადნობა', tFade: 'ჩაქრობა',
    textOverlay: 'ტექსტის დადება', overlayPh: 'სათაური / ხელმოწერა / წყალნიშანი…', oSize: 'ზომა', oColor: 'ფერი',
    exportVideo: 'ვიდეოს ექსპორტი', exportPhoto: 'სურათის შენახვა', exporting: 'მიმდინარეობს ვიდეოს დამუშავება…', exportHint: 'გამოიყენე ცვლილება ან დაამატე მეორე კლიპი',
    result: 'შედეგი', download: 'ჩამოტვირთვა', done: 'მზადაა', failed: 'ვერ შესრულდა', needClip: 'ჯერ ატვირთე კლიპი', close: 'დახურვა',
    aiRemove: 'AI ობიექტის მოშორება', brush: 'ფუნჯი', drawMask: 'მასკის დახატვა', clearMask: 'გასუფთავება', remove: 'მოშორება', paintFirst: 'ჯერ მონიშნე მოსაშორებელი არე', inpaintOff: 'ობიექტის მოშორება ჯერ არ არის კონფიგურირებული', aiPromptPh: 'აღწერა (არჩევითი)…',
  },
  en: {
    title: 'Surgical Editor', subtitle: 'Non-linear editor — stitch different clips',
    drop: 'Drop or upload video/photo', dropHint: 'Video or image — up to 35 files', pick: 'Choose file',
    crop: 'Crop', color: 'Color grade', fade: 'Fade', split: 'Split', mute: 'Mute', unmute: 'Unmute', reset: 'Reset',
    saturation: 'Saturation', contrast: 'Contrast', brightness: 'Brightness', temperature: 'Temperature', fadeIn: 'In', fadeOut: 'Out',
    maxReached: 'Maximum 35 files', max5: 'Up to 5 clips in a sequence', cropHint: 'Drag on the frame to mark the crop region', sequence: 'Sequence', seqDur: 'Length', del: 'Delete', moveL: 'Left', moveR: 'Right', clipN: 'Clip',
    transition: 'Transition', tCut: 'Cut', tCross: 'Crossfade', tFade: 'Fade',
    textOverlay: 'Text overlay', overlayPh: 'Title / handle / watermark…', oSize: 'Size', oColor: 'Color',
    exportVideo: 'Export Video', exportPhoto: 'Export Photo', exporting: 'Exporting render…', exportHint: 'Make an edit or add a second clip',
    result: 'Result', download: 'Download', done: 'Ready', failed: 'Failed', needClip: 'Upload a clip first', close: 'Close',
    aiRemove: 'AI object removal', brush: 'Brush', drawMask: 'Draw mask', clearMask: 'Clear', remove: 'Remove', paintFirst: 'Paint the area to remove first', inpaintOff: 'Object removal is not configured yet', aiPromptPh: 'Description (optional)…',
  },
  ru: {
    title: 'Хирургический редактор', subtitle: 'Нелинейный редактор — сшивайте разные клипы',
    drop: 'Перетащите или загрузите видео/фото', dropHint: 'Видео или изображение — до 35 файлов', pick: 'Выбрать файл',
    crop: 'Обрезка', color: 'Цветокоррекция', fade: 'Затухание', split: 'Разрез', mute: 'Заглушить', unmute: 'Включить звук', reset: 'Сброс',
    saturation: 'Насыщенность', contrast: 'Контраст', brightness: 'Яркость', temperature: 'Температура', fadeIn: 'Вход', fadeOut: 'Выход',
    maxReached: 'Максимум 35 файлов', max5: 'До 5 клипов в последовательности', cropHint: 'Проведите по кадру, чтобы задать область обрезки', sequence: 'Последовательность', seqDur: 'Длина', del: 'Удалить', moveL: 'Влево', moveR: 'Вправо', clipN: 'Клип',
    transition: 'Переход', tCut: 'Срез', tCross: 'Наплыв', tFade: 'Затемнение',
    textOverlay: 'Текст поверх', overlayPh: 'Заголовок / ник / водяной знак…', oSize: 'Размер', oColor: 'Цвет',
    exportVideo: 'Экспорт видео', exportPhoto: 'Сохранить фото', exporting: 'Обработка видео…', exportHint: 'Сделайте правку или добавьте второй клип',
    result: 'Результат', download: 'Скачать', done: 'Готово', failed: 'Не удалось', needClip: 'Сначала загрузите клип', close: 'Закрыть',
    aiRemove: 'AI-удаление объектов', brush: 'Кисть', drawMask: 'Нарисовать маску', clearMask: 'Очистить', remove: 'Удалить', paintFirst: 'Сначала закрасьте область', inpaintOff: 'Удаление объектов ещё не настроено', aiPromptPh: 'Описание (необязательно)…',
  },
};

interface Clip { id: string; file: File; url: string; kind: 'video' | 'image'; name: string; dur?: number; w?: number; h?: number }
interface Grade { saturation: number; contrast: number; brightness: number; temperature: number }
interface Rect { x: number; y: number; w: number; h: number }
type Transition = 'none' | 'crossfade' | 'fade';
type OverlayPosition = 'top-left' | 'top-right' | 'bottom-center' | 'center';
interface TextOverlay { text: string; position: OverlayPosition; fontSize: number; fontColor: string }
/** One block in the export sequence — points at its OWN source clip; `transition` = blend FROM the previous block. */
interface Segment { id: string; clipId: string; start: number; end: number; muted: boolean; transition?: Transition; textOverlay?: TextOverlay }

const NEUTRAL: Grade = { saturation: 100, contrast: 100, brightness: 100, temperature: 0 };
const isNeutral = (g: Grade) => g.saturation === 100 && g.contrast === 100 && g.brightness === 100 && g.temperature === 0;

function gradeFilter(g: Grade): string {
  const warm = g.temperature / 100;
  const sepia = warm > 0 ? warm * 0.35 : 0;
  const hue = warm < 0 ? warm * 18 : 0;
  return `saturate(${g.saturation}%) contrast(${g.contrast}%) brightness(${g.brightness}%) sepia(${sepia.toFixed(2)}) hue-rotate(${hue.toFixed(0)}deg)`;
}

/** Read a video's duration + dimensions client-side (a throwaway <video>), so the sequence knows each clip. */
function probeVideo(url: string): Promise<{ dur: number; w: number; h: number }> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => resolve({ dur: v.duration || 0, w: v.videoWidth || 0, h: v.videoHeight || 0 });
    v.onerror = () => resolve({ dur: 0, w: 0, h: 0 });
    v.src = url;
  });
}

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
  } catch { return null; }
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
  const [photoDim, setPhotoDim] = useState<{ w: number; h: number } | null>(null);

  const [grade, setGrade] = useState<Grade>(NEUTRAL);
  const [fade, setFade] = useState<{ inSec: number; outSec: number }>({ inSec: 0, outSec: 0 });
  const [crop, setCrop] = useState<Rect | null>(null);
  const [cropOn, setCropOn] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]); // the export SEQUENCE (across clips)
  const [selectedSeg, setSelectedSeg] = useState(0);

  const [maskMode, setMaskMode] = useState(false);
  const [brush, setBrush] = useState(48);
  const [maskPainted, setMaskPainted] = useState(false);
  const [prompt, setPrompt] = useState('');

  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [result, setResult] = useState<{ url: string; kind: 'video' | 'image' } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const painting = useRef(false);
  const clipsRef = useRef<Clip[]>([]);

  const clip = clips[active];
  const isPhoto = clip?.kind === 'image';
  const distinctClipIds = useMemo(() => Array.from(new Set(segments.map((s) => s.clipId))), [segments]);
  const videoClips = useMemo(() => clips.filter((c) => c.kind === 'video'), [clips]);

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => () => { clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url)); }, []);

  const flash = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600); }, []);

  // Switching the PREVIEW clip resets only preview-local UI (crop/mask/playhead) — the sequence + grade/fade
  // are the GLOBAL draft and persist across clips.
  useEffect(() => { setCrop(null); setCropOn(false); setMaskMode(false); setMaskPainted(false); setCurrent(0); setPhotoDim(null); }, [active]);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const incoming: Clip[] = [];
    for (const f of Array.from(files)) {
      const kind: 'video' | 'image' | null = f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : null;
      if (!kind) continue;
      incoming.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: f, url: URL.createObjectURL(f), kind, name: f.name });
    }
    if (!incoming.length) return;
    setClips((prev) => {
      if (prev.length + incoming.length > MAX_CLIPS) flash(t.maxReached);
      return [...prev, ...incoming].slice(0, MAX_CLIPS);
    });
    // Probe each new VIDEO + append it as a segment to the sequence (cap 5 distinct sources).
    for (const c of incoming) {
      if (c.kind !== 'video') continue;
      void probeVideo(c.url).then(({ dur, w, h }) => {
        setClips((prev) => prev.map((x) => (x.id === c.id ? { ...x, dur, w, h } : x)));
        setSegments((prev) => {
          if (prev.some((s) => s.clipId === c.id)) return prev;
          if (new Set(prev.map((s) => s.clipId)).size >= MAX_SEQ_CLIPS) { flash(t.max5); return prev; }
          return [...prev, { id: `seg-${c.id}`, clipId: c.id, start: 0, end: dur || 0, muted: false }];
        });
      });
    }
  }, [flash, t.maxReached, t.max5]);

  const resetDraft = useCallback(() => {
    setGrade(NEUTRAL); setFade({ inSec: 0, outSec: 0 }); setCrop(null); setCropOn(false); setResult(null);
    setMaskMode(false); setMaskPainted(false); setPrompt('');
    // Rebuild the sequence to one full segment per video clip, in upload order.
    setSegments(clipsRef.current.filter((c) => c.kind === 'video').slice(0, MAX_SEQ_CLIPS).map((c) => ({ id: `seg-${c.id}`, clipId: c.id, start: 0, end: c.dur || 0, muted: false })));
    setSelectedSeg(0);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { void v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  }, []);
  const seekTo = useCallback((frac: number) => {
    const v = videoRef.current; if (!v || !duration) return;
    const time = Math.max(0, Math.min(duration, frac * duration));
    v.currentTime = time; setCurrent(time);
  }, [duration]);

  const clipIndexById = useCallback((id: string) => clips.findIndex((c) => c.id === id), [clips]);
  const selectSeg = useCallback((i: number) => {
    setSelectedSeg(i);
    const seg = segments[i];
    if (seg) { const idx = clipIndexById(seg.clipId); if (idx >= 0 && idx !== active) setActive(idx); }
  }, [segments, clipIndexById, active]);

  // Split the SELECTED segment (its clip == the previewed clip) at the playhead.
  const splitAtPlayhead = useCallback(() => {
    if (!duration || !clip || clip.kind !== 'video') return;
    setSegments((prev) => {
      const out: Segment[] = []; let did = false;
      prev.forEach((s, i) => {
        if (!did && i === selectedSeg && s.clipId === clip.id && current > s.start + 0.05 && current < s.end - 0.05) {
          out.push({ id: `${s.id}a${Math.round(current * 100)}`, clipId: s.clipId, start: s.start, end: current, muted: s.muted });
          out.push({ id: `${s.id}b${Math.round(current * 100)}`, clipId: s.clipId, start: current, end: s.end, muted: s.muted });
          did = true;
        } else out.push(s);
      });
      return out;
    });
  }, [current, duration, clip, selectedSeg]);

  const toggleMuteSeg = useCallback((i: number) => setSegments((prev) => prev.map((s, k) => (k === i ? { ...s, muted: !s.muted } : s))), []);
  const deleteSeg = useCallback((i: number) => {
    setSegments((prev) => (prev.length <= 1 ? prev : prev.filter((_, k) => k !== i)));
    setSelectedSeg((sel) => (sel >= i && sel > 0 ? sel - 1 : sel));
  }, []);
  const moveSeg = useCallback((i: number, dir: -1 | 1) => {
    setSegments((prev) => {
      const j = i + dir; if (j < 0 || j >= prev.length) return prev;
      const out = [...prev]; const a = out[i], b = out[j];
      if (!a || !b) return prev;
      out[i] = b; out[j] = a; return out;
    });
    setSelectedSeg((sel) => (sel === i ? i + dir : sel === i + dir ? i : sel));
  }, []);
  // Cycle the transition INTO segment i (none → crossfade → fade → none).
  const cycleTransition = useCallback((i: number) => {
    const nextOf = (tr: Transition | undefined): Transition => (tr === 'crossfade' ? 'fade' : tr === 'fade' ? 'none' : 'crossfade');
    setSegments((prev) => prev.map((s, k) => (k === i ? { ...s, transition: nextOf(s.transition) } : s)));
  }, []);
  const transLabel = useCallback((tr: Transition | undefined): string => (tr === 'crossfade' ? t.tCross : tr === 'fade' ? t.tFade : t.tCut), [t.tCross, t.tFade, t.tCut]);
  // Merge a patch into the selected segment's text overlay (creating a default overlay on first edit).
  const setSegOverlay = useCallback((i: number, patch: Partial<TextOverlay>) => {
    setSegments((prev) => prev.map((s, k) => {
      if (k !== i) return s;
      const cur: TextOverlay = s.textOverlay ?? { text: '', position: 'bottom-center', fontSize: 24, fontColor: '#ffffff' };
      return { ...s, textOverlay: { ...cur, ...patch } };
    }));
  }, []);

  // ── Crop overlay (single-source only) ──
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

  // ── Mask canvas (photo inpaint) ──
  useEffect(() => {
    if (!maskMode || !photoDim) return;
    const c = maskCanvasRef.current; if (!c) return;
    const scale = Math.min(1, MASK_CAP / Math.max(photoDim.w, photoDim.h));
    c.width = Math.max(2, Math.round(photoDim.w * scale));
    c.height = Math.max(2, Math.round(photoDim.h * scale));
    const ctx = c.getContext('2d'); if (ctx) { ctx.fillStyle = 'black'; ctx.fillRect(0, 0, c.width, c.height); }
    setMaskPainted(false);
  }, [maskMode, photoDim]);
  const paintAt = useCallback((clientX: number, clientY: number) => {
    const c = maskCanvasRef.current; if (!c) return;
    const r = c.getBoundingClientRect(); if (!r.width || !r.height) return;
    const x = (clientX - r.left) / r.width * c.width;
    const y = (clientY - r.top) / r.height * c.height;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = 'white'; ctx.beginPath();
    ctx.arc(x, y, (brush / 100) * c.width * 0.08 + 4, 0, Math.PI * 2); ctx.fill();
    if (!maskPainted) setMaskPainted(true);
  }, [brush, maskPainted]);
  const clearMask = useCallback(() => {
    const c = maskCanvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (ctx) { ctx.fillStyle = 'black'; ctx.fillRect(0, 0, c.width, c.height); }
    setMaskPainted(false);
  }, []);

  const seqDuration = useMemo(() => segments.reduce((a, s) => a + Math.max(0, s.end - s.start), 0), [segments]);
  const hasMutations = useMemo(() => (
    !isNeutral(grade) || fade.inSec > 0 || fade.outSec > 0 || (!!crop && crop.w > 4) || segments.length > 1 || segments.some((s) => s.muted || !!s.textOverlay?.text.trim())
  ), [grade, fade, crop, segments]);
  const cropAllowed = distinctClipIds.length <= 1; // crop is a single-source op

  // ── Export ──
  const doExport = useCallback(async () => {
    if (!clip) { flash(t.needClip); return; }
    if (!hasMutations || exporting) return;
    setExporting(true); setExportPct(6); setResult(null);
    const tick = window.setInterval(() => setExportPct((p) => (p < 90 ? p + Math.max(1, Math.round((90 - p) / 12)) : p)), 400);
    try {
      const byId = new Map(clips.map((c) => [c.id, c]));
      if (isPhoto) {
        const path = await uploadClip(clip.file);
        if (!path) { flash(t.failed); return; }
        const res = await postEdit({ action: 'render', mediaUrl: path, kind: 'photo', draft: { grade: isNeutral(grade) ? undefined : grade, crop: sourceCrop() } });
        finishExport(res, 'image');
      } else if (distinctClipIds.length > 1) {
        // MULTI-CLIP concat — upload each distinct source (aligned to sequence src indices).
        const uploads = await Promise.all(distinctClipIds.map((id) => { const c = byId.get(id); return c ? uploadClip(c.file) : Promise.resolve(null); }));
        if (uploads.some((u) => !u)) { flash(t.failed); return; }
        const srcIndex = new Map(distinctClipIds.map((id, i) => [id, i]));
        const sequence = segments.map((s) => ({ src: srcIndex.get(s.clipId) ?? 0, start: s.start, end: s.end, muted: s.muted, transition: s.transition ?? 'none', textOverlay: s.textOverlay?.text.trim() ? s.textOverlay : undefined }));
        const first = byId.get(distinctClipIds[0] ?? '');
        const res = await postEdit({
          action: 'render', kind: 'video', sources: uploads as string[], sequence,
          targetW: first?.w || 1280, targetH: first?.h || 720,
          draft: { grade: isNeutral(grade) ? undefined : grade, fade: (fade.inSec > 0 || fade.outSec > 0) ? { inSec: fade.inSec, outSec: fade.outSec } : undefined },
        });
        finishExport(res, 'video');
      } else {
        // SINGLE clip — the legacy path keeps precise source-px crop.
        const onlyId = distinctClipIds[0] ?? clip.id;
        const only = byId.get(onlyId) ?? clip;
        const path = await uploadClip(only.file);
        if (!path) { flash(t.failed); return; }
        const segs = segments.filter((s) => s.clipId === onlyId).map((s) => ({ start: s.start, end: s.end, muted: s.muted, transition: s.transition ?? 'none', textOverlay: s.textOverlay?.text.trim() ? s.textOverlay : undefined }));
        const res = await postEdit({
          action: 'render', mediaUrl: path, kind: 'video', durationSec: only.dur || duration,
          draft: { grade: isNeutral(grade) ? undefined : grade, fade: (fade.inSec > 0 || fade.outSec > 0) ? { inSec: fade.inSec, outSec: fade.outSec } : undefined, crop: sourceCrop(), segments: segs },
        });
        finishExport(res, 'video');
      }
    } catch { flash(t.failed); }
    finally { window.clearInterval(tick); window.setTimeout(() => { setExporting(false); setExportPct(0); }, 400); }

    async function postEdit(payload: Record<string, unknown>) {
      const r = await fetch('/api/ai/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
      return (await r.json().catch(() => null)) as { url?: string | null } | null;
    }
    function finishExport(j: { url?: string | null } | null, kind: 'video' | 'image') {
      if (j?.url) { setExportPct(100); setResult({ url: j.url, kind }); flash(t.done); } else flash(t.failed);
    }
  }, [clip, hasMutations, exporting, clips, isPhoto, distinctClipIds, segments, grade, fade, sourceCrop, duration, flash, t.needClip, t.failed, t.done]);

  // ── AI object removal (photo) ──
  const runInpaint = useCallback(async () => {
    if (!clip) return;
    const c = maskCanvasRef.current;
    if (!maskPainted || !c) { flash(t.paintFirst); return; }
    setExporting(true); setExportPct(25); setResult(null);
    try {
      const maskUrl = c.toDataURL('image/png');
      const path = await uploadClip(clip.file);
      if (!path) { flash(t.failed); return; }
      const res = await fetch('/api/ai/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'inpaint', mediaUrl: path, maskUrl, prompt: prompt.trim() }) });
      const j = (await res.json().catch(() => null)) as { url?: string | null } | null;
      if (res.status === 503) flash(t.inpaintOff);
      else if (res.ok && j?.url) { setResult({ url: j.url, kind: 'image' }); flash(t.done); }
      else flash(t.failed);
    } catch { flash(t.failed); }
    finally { setExporting(false); setExportPct(0); }
  }, [clip, maskPainted, prompt, flash, t.paintFirst, t.failed, t.done, t.inpaintOff]);

  const filterCss = useMemo(() => gradeFilter(grade), [grade]);
  const progress = duration ? Math.min(1, current / duration) : 0;
  const sel = segments[selectedSeg];

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col bg-app-bg text-app-text">
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
            <button type="button" onClick={doExport} disabled={!hasMutations || exporting} title={hasMutations ? '' : t.exportHint}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={hasMutations ? { background: 'linear-gradient(180deg, rgb(34,211,238), rgb(6,182,212))', color: '#06121a', boxShadow: '0 0 0 1px rgba(6,182,212,0.4), 0 10px 30px -8px rgba(6,182,212,0.7)' } : { background: 'var(--color-elevated)', color: 'var(--color-muted)' }}>
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Clapperboard size={14} />}{isPhoto ? t.exportPhoto : t.exportVideo}
            </button>
          )}
          <button type="button" onClick={onExit} aria-label={t.close} className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-app-elevated hover:text-app-text"><X size={17} /></button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {clips.length === 0 ? (
          <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-app-border/25 bg-app-surface/40 p-10 text-center transition-colors hover:border-app-accent/40">
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
                <Upload size={15} /><input type="file" accept="video/*,image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              </label>
            </div>

            {/* Preview stage */}
            <div ref={stageRef} onMouseDown={onStageDown} onMouseMove={onStageMove} onMouseUp={onStageUp} onMouseLeave={onStageUp}
              className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-black ${cropOn ? 'cursor-crosshair' : ''}`} style={{ minHeight: 220, maxHeight: 360 }}>
              {isPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img ref={imgRef} src={clip?.url} alt="" style={{ filter: filterCss, maxHeight: 360 }} className="h-auto max-w-full"
                  onLoad={(e) => setPhotoDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
              ) : (
                <video ref={videoRef} src={clip?.url} playsInline style={{ filter: filterCss, maxHeight: 360 }} className="h-auto max-w-full"
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)} onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
              )}
              {isPhoto && maskMode && imgRef.current && stageRef.current && (() => {
                const ir = imgRef.current.getBoundingClientRect(); const sr = stageRef.current.getBoundingClientRect();
                return (
                  <canvas ref={maskCanvasRef}
                    style={{ position: 'absolute', left: ir.left - sr.left, top: ir.top - sr.top, width: ir.width, height: ir.height, opacity: 0.45, cursor: 'crosshair', touchAction: 'none' }}
                    onMouseDown={(e) => { painting.current = true; paintAt(e.clientX, e.clientY); }}
                    onMouseMove={(e) => { if (painting.current) paintAt(e.clientX, e.clientY); }}
                    onMouseUp={() => { painting.current = false; }} onMouseLeave={() => { painting.current = false; }}
                    onTouchStart={(e) => { painting.current = true; const tp = e.touches[0]; if (tp) paintAt(tp.clientX, tp.clientY); }}
                    onTouchMove={(e) => { const tp = e.touches[0]; if (painting.current && tp) { e.preventDefault(); paintAt(tp.clientX, tp.clientY); } }}
                    onTouchEnd={() => { painting.current = false; }} />
                );
              })()}
              {cropOn && crop && crop.w > 4 && <div className="pointer-events-none absolute border-2 border-app-accent bg-app-accent/10" style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }} />}
              {cropOn && !crop && <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1 text-[11px] text-white">{t.cropHint}</div>}
              {/* Instant CSS preview of the selected segment's text overlay, positioned over the video box. */}
              {!isPhoto && sel?.textOverlay?.text.trim() && sel.clipId === clip?.id && videoRef.current && stageRef.current && (() => {
                const vr = videoRef.current.getBoundingClientRect(); const sr = stageRef.current.getBoundingClientRect();
                const nh = videoRef.current.videoHeight || 720;
                const fsPx = Math.max(9, (sel.textOverlay.fontSize || 24) * (vr.height / nh));
                const pos = sel.textOverlay.position;
                return (
                  <div className="pointer-events-none absolute flex p-3" style={{
                    left: vr.left - sr.left, top: vr.top - sr.top, width: vr.width, height: vr.height,
                    alignItems: pos === 'center' ? 'center' : pos.startsWith('top') ? 'flex-start' : 'flex-end',
                    justifyContent: pos === 'top-left' ? 'flex-start' : pos === 'top-right' ? 'flex-end' : 'center',
                  }}>
                    <span style={{ color: sel.textOverlay.fontColor, fontSize: fsPx, fontWeight: 600, lineHeight: 1.1, textShadow: '0 2px 4px rgba(0,0,0,0.7)', maxWidth: '96%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel.textOverlay.text}</span>
                  </div>
                );
              })()}
            </div>

            {/* Timeline + sequence (VIDEO) */}
            {!isPhoto && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={togglePlay} className="flex h-8 w-8 items-center justify-center rounded-lg bg-app-elevated text-app-text ring-1 ring-app-border/15">{playing ? <Pause size={15} /> : <Play size={15} />}</button>
                  <div className="relative h-8 flex-1 cursor-pointer overflow-hidden rounded-lg bg-app-elevated" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekTo((e.clientX - r.left) / r.width); }}>
                    <div className="absolute inset-y-0 left-0 bg-app-accent/20" style={{ width: `${progress * 100}%` }} />
                    <div className="absolute inset-y-0 w-0.5 bg-app-accent" style={{ left: `${progress * 100}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-app-muted">{fmt(current)} / {fmt(duration)}</span>
                </div>

                {segments.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wide text-app-muted">{t.sequence} · {distinctClipIds.length} {t.clipN.toLowerCase()}{distinctClipIds.length > 1 ? 's' : ''}</p>
                      <p className="text-[10px] tabular-nums text-app-muted">{t.seqDur}: {fmt(seqDuration)}</p>
                    </div>
                    <div className="flex gap-1">
                      {segments.map((s, i) => {
                        const w = seqDuration ? ((s.end - s.start) / seqDuration) * 100 : 0;
                        const clipNo = videoClips.findIndex((c) => c.id === s.clipId) + 1;
                        return (
                          <div key={s.id} style={{ flexBasis: `${Math.max(9, w)}%` }}
                            className={`group relative flex h-10 min-w-0 items-center justify-center gap-1 overflow-hidden rounded-md border text-[10px] ${i === selectedSeg ? 'border-app-accent bg-app-accent/15 text-app-text' : 'border-app-border/20 bg-app-elevated text-app-muted'}`}>
                            {s.transition && s.transition !== 'none' && i > 0 && <span className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l bg-cyan-400/80" title={transLabel(s.transition)} />}
                            <button type="button" onClick={() => selectSeg(i)} className="flex h-full w-full flex-col items-center justify-center leading-none">
                              <span className="flex items-center gap-0.5">{s.muted ? <VolumeX size={10} className="text-amber-400" /> : null}<span className="opacity-60">#{clipNo}</span></span>
                              <span className="truncate tabular-nums">{fmt(s.end - s.start)}</span>
                            </button>
                            {segments.length > 1 && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); deleteSeg(i); }} aria-label={t.del}
                                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white/80 hover:bg-red-500/80 hover:text-white"><X size={9} /></button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {sel && segments.length > 1 && (
                      <div className="flex items-center gap-1.5">
                        <span className="mr-1 text-[10px] text-app-muted">#{videoClips.findIndex((c) => c.id === sel.clipId) + 1}</span>
                        <MiniBtn icon={<ChevronLeft size={13} />} label={t.moveL} onClick={() => moveSeg(selectedSeg, -1)} disabled={selectedSeg === 0} />
                        <MiniBtn icon={<ChevronRight size={13} />} label={t.moveR} onClick={() => moveSeg(selectedSeg, 1)} disabled={selectedSeg >= segments.length - 1} />
                        {selectedSeg > 0 && (
                          <MiniBtn icon={<Film size={13} />} label={transLabel(sel.transition)} active={!!sel.transition && sel.transition !== 'none'} onClick={() => cycleTransition(selectedSeg)} />
                        )}
                        <MiniBtn icon={sel.muted ? <VolumeX size={13} /> : <Volume2 size={13} />} label={sel.muted ? t.unmute : t.mute} active={sel.muted} onClick={() => toggleMuteSeg(selectedSeg)} />
                        <MiniBtn icon={<Trash2 size={13} />} label={t.del} onClick={() => deleteSeg(selectedSeg)} danger />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tools */}
            <div className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3">
              {(isPhoto || cropAllowed) && <ToolButton icon={<Crop size={15} />} label={t.crop} active={cropOn} onClick={() => setCropOn((v) => !v)} />}
              {!isPhoto && <ToolButton icon={<Scissors size={15} />} label={t.split} onClick={splitAtPlayhead} />}
              <ToolButton icon={<RotateCcw size={15} />} label={t.reset} onClick={resetDraft} />
            </div>

            {/* Color grading */}
            <div className="space-y-2.5 rounded-xl border border-app-border/15 bg-app-surface/50 p-3.5">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-app-muted">{t.color}</span>
              <Slider icon={<Droplet size={13} />} label={t.saturation} min={0} max={200} value={grade.saturation} onChange={(v) => setGrade((g) => ({ ...g, saturation: v }))} />
              <Slider icon={<ContrastIcon size={13} />} label={t.contrast} min={0} max={200} value={grade.contrast} onChange={(v) => setGrade((g) => ({ ...g, contrast: v }))} />
              <Slider icon={<SunMedium size={13} />} label={t.brightness} min={0} max={200} value={grade.brightness} onChange={(v) => setGrade((g) => ({ ...g, brightness: v }))} />
              <Slider icon={<Thermometer size={13} />} label={t.temperature} min={-100} max={100} value={grade.temperature} onChange={(v) => setGrade((g) => ({ ...g, temperature: v }))} />
            </div>

            {/* Fade (VIDEO) */}
            {!isPhoto && (
              <div className="space-y-2.5 rounded-xl border border-app-border/15 bg-app-surface/50 p-3.5">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-app-muted">{t.fade}</span>
                <Slider label={t.fadeIn} min={0} max={5} step={0.1} value={fade.inSec} onChange={(v) => setFade((f) => ({ ...f, inSec: v }))} suffix="s" />
                <Slider label={t.fadeOut} min={0} max={5} step={0.1} value={fade.outSec} onChange={(v) => setFade((f) => ({ ...f, outSec: v }))} suffix="s" />
              </div>
            )}

            {/* Text overlay for the selected segment */}
            {!isPhoto && sel && (
              <div className="space-y-2.5 rounded-xl border border-app-border/15 bg-app-surface/50 p-3.5">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-app-muted">{t.textOverlay}</span>
                <input value={sel.textOverlay?.text ?? ''} onChange={(e) => setSegOverlay(selectedSeg, { text: e.target.value })} placeholder={t.overlayPh}
                  className="w-full rounded-lg bg-app-bg/40 px-3 py-2 text-[13px] text-app-text placeholder:text-app-muted focus:outline-none" />
                <div className="flex items-center gap-1.5">
                  {(['top-left', 'top-right', 'bottom-center', 'center'] as OverlayPosition[]).map((p) => {
                    const on = (sel.textOverlay?.position ?? 'bottom-center') === p;
                    return (
                      <button key={p} type="button" onClick={() => setSegOverlay(selectedSeg, { position: p })} title={p}
                        className={`flex h-8 flex-1 items-center justify-center rounded-lg text-[14px] ${on ? 'bg-app-accent text-app-bg' : 'bg-app-elevated text-app-muted ring-1 ring-app-border/15 hover:bg-app-surface'}`}>
                        {p === 'top-left' ? '↖' : p === 'top-right' ? '↗' : p === 'center' ? '⊙' : '▽'}
                      </button>
                    );
                  })}
                </div>
                <Slider label={t.oSize} min={10} max={120} value={sel.textOverlay?.fontSize ?? 24} onChange={(v) => setSegOverlay(selectedSeg, { fontSize: v })} suffix="px" />
                <div className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-[11.5px] text-app-text/80 sm:w-24">{t.oColor}</span>
                  <input type="color" value={sel.textOverlay?.fontColor ?? '#ffffff'} onChange={(e) => setSegOverlay(selectedSeg, { fontColor: e.target.value })} className="h-7 w-14 cursor-pointer rounded bg-transparent" aria-label={t.oColor} />
                </div>
              </div>
            )}

            {/* AI object removal (PHOTO) */}
            {isPhoto && (
              <div className="space-y-2.5 rounded-xl border border-app-border/15 bg-app-surface/50 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-app-muted"><Sparkles size={12} className="text-app-accent" />{t.aiRemove}</span>
                  <div className="flex gap-1.5">
                    <MiniBtn icon={<Brush size={13} />} label={t.drawMask} active={maskMode} onClick={() => setMaskMode((v) => !v)} />
                    <MiniBtn icon={<RotateCcw size={13} />} label={t.clearMask} onClick={clearMask} disabled={!maskMode} />
                  </div>
                </div>
                {maskMode && <Slider icon={<Brush size={13} />} label={t.brush} min={10} max={100} value={brush} onChange={setBrush} />}
                <div className="flex items-center gap-2">
                  <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t.aiPromptPh} className="min-w-0 flex-1 rounded-lg bg-app-bg/40 px-3 py-2 text-[13px] text-app-text placeholder:text-app-muted focus:outline-none" />
                  <button type="button" onClick={() => void runInpaint()} disabled={!maskPainted || exporting} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-app-accent px-3.5 py-2 text-[12px] font-bold text-app-bg disabled:opacity-50">
                    {exporting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}{t.remove}
                  </button>
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

      {exporting && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-[340px] rounded-2xl border border-app-border/20 bg-app-surface p-6 text-center shadow-2xl">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-app-accent/15"><Clapperboard size={22} className="text-app-accent" /></span>
            <div className="mb-3 text-[13.5px] font-semibold text-app-text">{t.exporting}</div>
            <div className="h-2 overflow-hidden rounded-full bg-app-elevated"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${exportPct}%`, background: 'linear-gradient(90deg, rgb(34,211,238), rgb(6,182,212))' }} /></div>
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

function MiniBtn({ icon, label, onClick, active, disabled, danger }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition-colors disabled:opacity-30 ${active ? 'bg-app-accent text-app-bg' : danger ? 'bg-app-elevated text-red-400 ring-1 ring-app-border/15 hover:bg-red-500/15' : 'bg-app-elevated text-app-text ring-1 ring-app-border/15 hover:bg-app-surface'}`}>
      {icon}<span className="hidden sm:inline">{label}</span>
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
