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
  Eraser, Maximize2, Smile, Palette, Share2, Check, Music2, Waves, Mic, Gauge, Wand2,
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
  aiStudio: string; removeBg: string; upscale: string; faceRestore: string; colorize: string; photoProcessing: string; insufficient: string; notConfig: string;
  exportSuccess: string; share: string; linkCopied: string;
  exportVideo: string; exportPhoto: string; exporting: string; exportHint: string;
  result: string; download: string; done: string; failed: string; needClip: string; close: string;
  aiRemove: string; brush: string; drawMask: string; clearMask: string; remove: string; paintFirst: string; inpaintOff: string; aiPromptPh: string;
  audioStudio: string; vocalIso: string; vocalSplit: string; pitch: string; speed: string; aStart: string; aEnd: string; applyAudio: string; audioProcessing: string; instrumental: string; vocals: string;
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
    aiStudio: 'AI ფოტო სტუდია', removeBg: 'ფონის წაშლა', upscale: 'ხარისხის 4X გაზრდა', faceRestore: 'სახის აღდგენა', colorize: 'გაფერადება', photoProcessing: 'მიმდინარეობს ფოტოს დამუშავება…', insufficient: 'არასაკმარისი კრედიტები', notConfig: 'ეს ხელსაწყო ჯერ არ არის კონფიგურირებული',
    exportSuccess: 'ექსპორტი წარმატებულია', share: 'გაზიარება', linkCopied: 'ბმული დაკოპირდა',
    exportVideo: 'ვიდეოს ექსპორტი', exportPhoto: 'სურათის შენახვა', exporting: 'მიმდინარეობს ვიდეოს დამუშავება…', exportHint: 'გამოიყენე ცვლილება ან დაამატე მეორე კლიპი',
    result: 'შედეგი', download: 'ჩამოტვირთვა', done: 'მზადაა', failed: 'ვერ შესრულდა', needClip: 'ჯერ ატვირთე კლიპი', close: 'დახურვა',
    aiRemove: 'AI ობიექტის მოშორება', brush: 'ფუნჯი', drawMask: 'მასკის დახატვა', clearMask: 'გასუფთავება', remove: 'მოშორება', paintFirst: 'ჯერ მონიშნე მოსაშორებელი არე', inpaintOff: 'ობიექტის მოშორება ჯერ არ არის კონფიგურირებული', aiPromptPh: 'აღწერა (არჩევითი)…',
    audioStudio: 'AI აუდიო სტუდია', vocalIso: 'ვოკალის იზოლაცია', vocalSplit: 'ვოკალი / მუსიკა', pitch: 'ტონი', speed: 'სიჩქარე', aStart: 'დასაწყისი', aEnd: 'დასასრული', applyAudio: 'დამუშავება', audioProcessing: 'მიმდინარეობს აუდიოს დამუშავება…', instrumental: 'ინსტრუმენტალი', vocals: 'ვოკალი',
  },
  en: {
    title: 'Surgical Editor', subtitle: 'Non-linear editor — stitch different clips',
    drop: 'Drop or upload video/photo', dropHint: 'Video or image — up to 35 files', pick: 'Choose file',
    crop: 'Crop', color: 'Color grade', fade: 'Fade', split: 'Split', mute: 'Mute', unmute: 'Unmute', reset: 'Reset',
    saturation: 'Saturation', contrast: 'Contrast', brightness: 'Brightness', temperature: 'Temperature', fadeIn: 'In', fadeOut: 'Out',
    maxReached: 'Maximum 35 files', max5: 'Up to 5 clips in a sequence', cropHint: 'Drag on the frame to mark the crop region', sequence: 'Sequence', seqDur: 'Length', del: 'Delete', moveL: 'Left', moveR: 'Right', clipN: 'Clip',
    transition: 'Transition', tCut: 'Cut', tCross: 'Crossfade', tFade: 'Fade',
    textOverlay: 'Text overlay', overlayPh: 'Title / handle / watermark…', oSize: 'Size', oColor: 'Color',
    aiStudio: 'AI Photo Studio', removeBg: 'Remove background', upscale: '4× Upscale', faceRestore: 'Face restore', colorize: 'Colorize', photoProcessing: 'Processing AI photo magic…', insufficient: 'Insufficient credits', notConfig: 'This tool is not configured yet',
    exportSuccess: 'Export Successful', share: 'Share', linkCopied: 'Link copied',
    exportVideo: 'Export Video', exportPhoto: 'Export Photo', exporting: 'Exporting render…', exportHint: 'Make an edit or add a second clip',
    result: 'Result', download: 'Download', done: 'Ready', failed: 'Failed', needClip: 'Upload a clip first', close: 'Close',
    aiRemove: 'AI object removal', brush: 'Brush', drawMask: 'Draw mask', clearMask: 'Clear', remove: 'Remove', paintFirst: 'Paint the area to remove first', inpaintOff: 'Object removal is not configured yet', aiPromptPh: 'Description (optional)…',
    audioStudio: 'AI Audio Studio', vocalIso: 'Vocal isolation', vocalSplit: 'Vocal / instrumental', pitch: 'Pitch', speed: 'Speed', aStart: 'Start', aEnd: 'End', applyAudio: 'Apply', audioProcessing: 'Processing audio…', instrumental: 'Instrumental', vocals: 'Vocals',
  },
  ru: {
    title: 'Хирургический редактор', subtitle: 'Нелинейный редактор — сшивайте разные клипы',
    drop: 'Перетащите или загрузите видео/фото', dropHint: 'Видео или изображение — до 35 файлов', pick: 'Выбрать файл',
    crop: 'Обрезка', color: 'Цветокоррекция', fade: 'Затухание', split: 'Разрез', mute: 'Заглушить', unmute: 'Включить звук', reset: 'Сброс',
    saturation: 'Насыщенность', contrast: 'Контраст', brightness: 'Яркость', temperature: 'Температура', fadeIn: 'Вход', fadeOut: 'Выход',
    maxReached: 'Максимум 35 файлов', max5: 'До 5 клипов в последовательности', cropHint: 'Проведите по кадру, чтобы задать область обрезки', sequence: 'Последовательность', seqDur: 'Длина', del: 'Удалить', moveL: 'Влево', moveR: 'Вправо', clipN: 'Клип',
    transition: 'Переход', tCut: 'Срез', tCross: 'Наплыв', tFade: 'Затемнение',
    textOverlay: 'Текст поверх', overlayPh: 'Заголовок / ник / водяной знак…', oSize: 'Размер', oColor: 'Цвет',
    aiStudio: 'AI фотостудия', removeBg: 'Удалить фон', upscale: 'Апскейл 4×', faceRestore: 'Восстановление лица', colorize: 'Колоризация', photoProcessing: 'Обработка фото…', insufficient: 'Недостаточно кредитов', notConfig: 'Инструмент ещё не настроен',
    exportSuccess: 'Экспорт успешен', share: 'Поделиться', linkCopied: 'Ссылка скопирована',
    exportVideo: 'Экспорт видео', exportPhoto: 'Сохранить фото', exporting: 'Обработка видео…', exportHint: 'Сделайте правку или добавьте второй клип',
    result: 'Результат', download: 'Скачать', done: 'Готово', failed: 'Не удалось', needClip: 'Сначала загрузите клип', close: 'Закрыть',
    aiRemove: 'AI-удаление объектов', brush: 'Кисть', drawMask: 'Нарисовать маску', clearMask: 'Очистить', remove: 'Удалить', paintFirst: 'Сначала закрасьте область', inpaintOff: 'Удаление объектов ещё не настроено', aiPromptPh: 'Описание (необязательно)…',
    audioStudio: 'AI аудиостудия', vocalIso: 'Изоляция вокала', vocalSplit: 'Вокал / музыка', pitch: 'Тон', speed: 'Скорость', aStart: 'Начало', aEnd: 'Конец', applyAudio: 'Применить', audioProcessing: 'Обработка аудио…', instrumental: 'Инструментал', vocals: 'Вокал',
  },
};

interface Clip { id: string; file: File; url: string; kind: 'video' | 'image' | 'audio'; name: string; dur?: number; w?: number; h?: number; peaks?: number[] }
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

/** Decode an audio file into ~72 normalized amplitude peaks for the waveform visualizer (best-effort, off-thread). */
async function decodeAudioPeaks(file: File, buckets = 72): Promise<number[]> {
  try {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return [];
    const ctx = new AC();
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    const data = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / buckets));
    const peaks: number[] = [];
    for (let i = 0; i < buckets; i++) {
      let max = 0;
      for (let j = 0; j < block; j++) { const v = Math.abs(data[i * block + j] || 0); if (v > max) max = v; }
      peaks.push(max);
    }
    void ctx.close();
    const norm = Math.max(...peaks, 0.01);
    return peaks.map((p) => Math.max(0.04, p / norm));
  } catch { return []; }
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

function extFromUrl(url: string, fallback: string): string {
  const m = /\.([a-z0-9]{2,4})(?:\?|#|$)/i.exec(url);
  return m && m[1] ? m[1] : fallback;
}

/**
 * Force a real file download. A cross-origin `<a download>` is ignored by browsers (it navigates instead), so we
 * fetch the asset into a Blob and download THAT — the reliable path on mobile Safari/Chrome. Falls back to a direct
 * link if the fetch is CORS-blocked (rare — our storage + Replicate delivery allow GET).
 */
async function downloadAsset(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = obj; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(obj), 5000);
  } catch {
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
}

export default function SurgicalEditor({ locale, onExit, initialAsset }: { locale: string; onExit: () => void; initialAsset?: { url: string; kind: 'video' | 'image' | 'audio' } | null }) {
  const t = T[norm(locale)];
  const [clips, setClips] = useState<Clip[]>([]);
  const [active, setActive] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [photoDim, setPhotoDim] = useState<{ w: number; h: number } | null>(null);
  // Photo AI chaining: `originalPath` caches the uploaded source; `chainPath` is the latest AI result's storage
  // path — when set, the NEXT action runs on the result (transparent PNG → upscale → colorize…), not the original.
  const [originalPath, setOriginalPath] = useState<string | null>(null);
  const [chainPath, setChainPath] = useState<string | null>(null);

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
  const [result, setResult] = useState<{ url: string; kind: 'video' | 'image' | 'audio' } | null>(null);
  const [successAsset, setSuccessAsset] = useState<{ url: string; kind: 'video' | 'image' | 'audio' } | null>(null);
  const [secondaryAudio, setSecondaryAudio] = useState<string | null>(null); // splitter's instrumental stem
  const [toast, setToast] = useState<string | null>(null);

  // ── Audio Studio state ──
  const [audioDur, setAudioDur] = useState(0);
  const [audioCur, setAudioCur] = useState(0);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [pitch, setPitch] = useState(0);        // semitones, -12..12
  const [audioSpeed, setAudioSpeed] = useState(1); // 0.5..2
  const [aTrim, setATrim] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const painting = useRef(false);
  const clipsRef = useRef<Clip[]>([]);

  const clip = clips[active];
  const isPhoto = clip?.kind === 'image';
  const isAudio = clip?.kind === 'audio';
  const distinctClipIds = useMemo(() => Array.from(new Set(segments.map((s) => s.clipId))), [segments]);
  const videoClips = useMemo(() => clips.filter((c) => c.kind === 'video'), [clips]);

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => () => { clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url)); }, []);

  const flash = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600); }, []);

  const filenameFor = useCallback((url: string, kind: 'video' | 'image' | 'audio') => `myavatar-${Date.now()}.${extFromUrl(url, kind === 'video' ? 'mp4' : kind === 'audio' ? 'm4a' : 'png')}`, []);

  // On any successful export / AI photo action: keep the result for the viewport, open the success card, and
  // AUTO-DOWNLOAD the asset to the device immediately.
  const onAssetReady = useCallback((url: string, kind: 'video' | 'image' | 'audio') => {
    setResult({ url, kind });
    setSuccessAsset({ url, kind });
    void downloadAsset(url, filenameFor(url, kind));
  }, [filenameFor]);

  // Native share sheet (mobile) → clipboard-copy fallback (desktop / unsupported). A user cancel is a no-op.
  const shareAsset = useCallback(async (url: string) => {
    const nav = navigator as Navigator & { share?: (d: { url?: string; title?: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
      try { await nav.share({ url, title: 'MyAvatar' }); return; }
      catch (e) { if ((e as Error).name === 'AbortError') return; /* else fall through to copy */ }
    }
    try { await navigator.clipboard.writeText(url); flash(t.linkCopied); }
    catch { flash(t.failed); }
  }, [flash, t.linkCopied, t.failed]);

  // Switching the PREVIEW clip resets only preview-local UI (crop/mask/playhead) — the sequence + grade/fade
  // are the GLOBAL draft and persist across clips.
  useEffect(() => {
    setCrop(null); setCropOn(false); setMaskMode(false); setMaskPainted(false); setCurrent(0); setPhotoDim(null); setChainPath(null); setOriginalPath(null);
    setAudioDur(0); setAudioCur(0); setAudioPlaying(false); setPitch(0); setAudioSpeed(1); setATrim({ start: 0, end: 0 }); setSecondaryAudio(null);
  }, [active]);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const incoming: Clip[] = [];
    for (const f of Array.from(files)) {
      const kind: 'video' | 'image' | 'audio' | null = f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : f.type.startsWith('audio/') ? 'audio' : null;
      if (!kind) continue;
      incoming.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: f, url: URL.createObjectURL(f), kind, name: f.name });
    }
    if (!incoming.length) return;
    setClips((prev) => {
      if (prev.length + incoming.length > MAX_CLIPS) flash(t.maxReached);
      return [...prev, ...incoming].slice(0, MAX_CLIPS);
    });
    // Probe each new VIDEO + append it as a segment to the sequence (cap 5 distinct sources); decode AUDIO peaks.
    for (const c of incoming) {
      if (c.kind === 'audio') { void decodeAudioPeaks(c.file).then((peaks) => setClips((prev) => prev.map((x) => (x.id === c.id ? { ...x, peaks } : x)))); continue; }
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

  // ── "Open in Editor" bridge (Vector 1): a forwarded asset URL → fetch → File → clip, and jump to it. ──
  const loadedAssetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialAsset?.url || loadedAssetRef.current === initialAsset.url) return;
    loadedAssetRef.current = initialAsset.url;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(initialAsset.url, { credentials: 'omit' });
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        const kind = initialAsset.kind;
        const type = blob.type || (kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : 'image/png');
        const ext = kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'png';
        const file = new File([blob], `import-${Date.now()}.${ext}`, { type });
        if (cancelled) return;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const nclip: Clip = { id, file, url: URL.createObjectURL(file), kind, name: file.name };
        const idx = Math.min(clipsRef.current.length, MAX_CLIPS - 1);
        setClips((prev) => [...prev, nclip].slice(0, MAX_CLIPS));
        setActive(idx);
        if (kind === 'audio') void decodeAudioPeaks(file).then((peaks) => setClips((prev) => prev.map((x) => (x.id === id ? { ...x, peaks } : x))));
        else if (kind === 'video') void probeVideo(nclip.url).then(({ dur, w, h }) => {
          setClips((prev) => prev.map((x) => (x.id === id ? { ...x, dur, w, h } : x)));
          setSegments((prev) => (prev.some((s) => s.clipId === id) || new Set(prev.map((s) => s.clipId)).size >= MAX_SEQ_CLIPS ? prev : [...prev, { id: `seg-${id}`, clipId: id, start: 0, end: dur || 0, muted: false }]));
        });
      } catch { if (!cancelled) flash(t.failed); }
    })();
    return () => { cancelled = true; };
  }, [initialAsset, flash, t.failed]);

  const resetDraft = useCallback(() => {
    setGrade(NEUTRAL); setFade({ inSec: 0, outSec: 0 }); setCrop(null); setCropOn(false); setResult(null);
    setMaskMode(false); setMaskPainted(false); setPrompt(''); setChainPath(null); // revert photo chaining to the original
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
    setExporting(true); setExportPct(6); setResult(null); setSuccessAsset(null);
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
      if (j?.url) { setExportPct(100); onAssetReady(j.url, kind); flash(t.done); } else flash(t.failed);
    }
  }, [clip, hasMutations, exporting, clips, isPhoto, distinctClipIds, segments, grade, fade, sourceCrop, duration, flash, onAssetReady, t.needClip, t.failed, t.done]);

  // ── AI object removal (photo) ──
  const runInpaint = useCallback(async () => {
    if (!clip) return;
    const c = maskCanvasRef.current;
    if (!maskPainted || !c) { flash(t.paintFirst); return; }
    setExporting(true); setExportPct(25); setResult(null); setSuccessAsset(null);
    try {
      const maskUrl = c.toDataURL('image/png');
      const path = await uploadClip(clip.file);
      if (!path) { flash(t.failed); return; }
      const res = await fetch('/api/ai/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'inpaint', mediaUrl: path, maskUrl, prompt: prompt.trim() }) });
      const j = (await res.json().catch(() => null)) as { url?: string | null } | null;
      if (res.status === 503) flash(t.inpaintOff);
      else if (res.ok && j?.url) { onAssetReady(j.url, 'image'); flash(t.done); }
      else flash(t.failed);
    } catch { flash(t.failed); }
    finally { setExporting(false); setExportPct(0); }
  }, [clip, maskPainted, prompt, onAssetReady, flash, t.paintFirst, t.failed, t.done, t.inpaintOff]);

  // ── AI Photo Studio — remove_bg / upscale / face_restore / colorize via Replicate (billed server-side) ──
  const runPhotoAction = useCallback(async (action: 'remove_bg' | 'upscale' | 'face_restore' | 'colorize') => {
    if (!clip || exporting) return;
    setExporting(true); setExportPct(15); setSuccessAsset(null);
    const tick = window.setInterval(() => setExportPct((p) => (p < 90 ? p + Math.max(1, Math.round((90 - p) / 14)) : p)), 500);
    try {
      // CHAIN: run on the last AI result if present, else the cached original (upload once, then reuse).
      let src = chainPath;
      if (!src) {
        src = originalPath ?? await uploadClip(clip.file);
        if (src && !originalPath) setOriginalPath(src);
      }
      if (!src) { flash(t.failed); return; }
      const res = await fetch('/api/ai/edit-photo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action, mediaUrl: src }),
      });
      const j = (await res.json().catch(() => null)) as { url?: string | null; path?: string | null } | null;
      if (res.status === 402) flash(t.insufficient);
      else if (res.status === 503) flash(t.notConfig);
      else if (res.ok && j?.url) {
        setExportPct(100);
        if (j.path) setChainPath(j.path); // subsequent actions run on THIS result
        // Persist appears server-side; nudge any open Library panel to refetch immediately.
        try { window.dispatchEvent(new CustomEvent('myavatar:library-updated')); } catch { /* noop */ }
        onAssetReady(j.url, 'image');
        flash(t.done);
      } else flash(t.failed);
    } catch { flash(t.failed); }
    finally { window.clearInterval(tick); window.setTimeout(() => { setExporting(false); setExportPct(0); }, 400); }
  }, [clip, exporting, chainPath, originalPath, onAssetReady, flash, t.failed, t.done, t.insufficient, t.notConfig]);

  // ── Audio Studio: playback, generative separation (billed), deterministic process (free) ──
  const toggleAudioPlay = useCallback(() => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) { void a.play(); setAudioPlaying(true); } else { a.pause(); setAudioPlaying(false); }
  }, []);
  const seekAudio = useCallback((frac: number) => {
    const a = audioRef.current; if (!a || !audioDur) return;
    a.currentTime = Math.max(0, Math.min(audioDur, frac * audioDur)); setAudioCur(a.currentTime);
  }, [audioDur]);

  // Resolve the source once (upload original → cache), reusing the last AI result when chaining.
  const audioSource = useCallback(async (): Promise<string | null> => {
    if (chainPath) return chainPath;
    const src = originalPath ?? (clip ? await uploadClip(clip.file) : null);
    if (src && !originalPath) setOriginalPath(src);
    return src;
  }, [chainPath, originalPath, clip]);

  const runAudioAI = useCallback(async (action: 'vocal_isolation' | 'splitter') => {
    if (!clip || exporting) return;
    setExporting(true); setExportPct(12); setSuccessAsset(null); setSecondaryAudio(null);
    const tick = window.setInterval(() => setExportPct((p) => (p < 90 ? p + Math.max(1, Math.round((90 - p) / 16)) : p)), 600);
    try {
      const src = await audioSource();
      if (!src) { flash(t.failed); return; }
      const res = await fetch('/api/ai/edit-audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action, mediaUrl: src }) });
      const j = (await res.json().catch(() => null)) as { url?: string | null; path?: string | null; secondaryUrl?: string | null } | null;
      if (res.status === 402) flash(t.insufficient);
      else if (res.status === 503) flash(t.notConfig);
      else if (res.ok && j?.url) {
        setExportPct(100);
        if (j.path) setChainPath(j.path);
        if (j.secondaryUrl) setSecondaryAudio(j.secondaryUrl);
        try { window.dispatchEvent(new CustomEvent('myavatar:library-updated')); } catch { /* noop */ }
        onAssetReady(j.url, 'audio'); flash(t.done);
      } else flash(t.failed);
    } catch { flash(t.failed); }
    finally { window.clearInterval(tick); window.setTimeout(() => { setExporting(false); setExportPct(0); }, 400); }
  }, [clip, exporting, audioSource, onAssetReady, flash, t.failed, t.done, t.insufficient, t.notConfig]);

  const audioHasEdit = pitch !== 0 || Math.abs(audioSpeed - 1) > 0.01 || fade.inSec > 0 || fade.outSec > 0 || aTrim.end > aTrim.start + 0.05;
  const runAudioProcess = useCallback(async () => {
    if (!clip || exporting) return;
    if (!audioHasEdit) { flash(t.exportHint); return; }
    setExporting(true); setExportPct(15); setSuccessAsset(null); setSecondaryAudio(null);
    const tick = window.setInterval(() => setExportPct((p) => (p < 90 ? p + Math.max(1, Math.round((90 - p) / 12)) : p)), 350);
    try {
      const src = await audioSource();
      if (!src) { flash(t.failed); return; }
      const res = await fetch('/api/ai/edit-audio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'process', mediaUrl: src, semitones: pitch, speed: audioSpeed, trimStart: aTrim.start, trimEnd: aTrim.end, fadeInSec: fade.inSec, fadeOutSec: fade.outSec, durationSec: audioDur }),
      });
      const j = (await res.json().catch(() => null)) as { url?: string | null } | null;
      if (res.ok && j?.url) { setExportPct(100); onAssetReady(j.url, 'audio'); flash(t.done); } else flash(t.failed);
    } catch { flash(t.failed); }
    finally { window.clearInterval(tick); window.setTimeout(() => { setExporting(false); setExportPct(0); }, 400); }
  }, [clip, exporting, audioHasEdit, audioSource, pitch, audioSpeed, aTrim, fade, audioDur, onAssetReady, flash, t.failed, t.done, t.exportHint]);

  const filterCss = useMemo(() => gradeFilter(grade), [grade]);
  const progress = duration ? Math.min(1, current / duration) : 0;
  const audioProgress = audioDur ? Math.min(1, audioCur / audioDur) : 0;
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
          {clips.length > 0 && !isAudio && (
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
            <input type="file" accept="video/*,image/*,audio/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </label>
        ) : (
          <>
            {/* Clip strip */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {clips.map((c, i) => (
                <button key={c.id} type="button" onClick={() => setActive(i)}
                  className={`relative flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${i === active ? 'border-app-accent ring-1 ring-app-accent' : 'border-app-border/20'} bg-app-elevated`}>
                  {c.kind === 'image' ? <img src={c.url} alt="" className="h-full w-full object-cover" /> : c.kind === 'audio' ? <Music2 size={16} className="text-app-accent" /> : <Film size={16} className="text-app-muted" />}
                </button>
              ))}
              <label className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed border-app-border/25 text-app-muted hover:border-app-accent/40">
                <Upload size={15} /><input type="file" accept="video/*,image/*,audio/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              </label>
            </div>

            {isAudio ? (
            /* ── AI AUDIO STUDIO ── */
            <div className="space-y-4">
              {/* Waveform visualizer + transport */}
              <div className="rounded-xl border border-app-border/15 bg-gradient-to-b from-app-surface/70 to-app-bg/50 p-4">
                <audio ref={audioRef} src={result?.kind === 'audio' ? result.url : clip?.url} preload="metadata"
                  onLoadedMetadata={(e) => { const d = e.currentTarget.duration || 0; setAudioDur(d); setATrim((tr) => (tr.end > tr.start ? tr : { start: 0, end: d })); }}
                  onTimeUpdate={(e) => setAudioCur(e.currentTarget.currentTime)} onEnded={() => setAudioPlaying(false)} className="hidden" />
                <div className="mb-3 flex items-center gap-2.5">
                  <button type="button" onClick={toggleAudioPlay} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-accent text-app-bg shadow-lg">{audioPlaying ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}</button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-[12.5px] font-semibold"><Music2 size={13} className="shrink-0 text-app-accent" /><span className="truncate">{clip?.name}</span></div>
                    <div className="text-[10.5px] tabular-nums text-app-muted">{fmt(audioCur)} / {fmt(audioDur)}</div>
                  </div>
                </div>
                <div role="button" tabIndex={0} aria-label="seek"
                  onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekAudio((e.clientX - r.left) / r.width); }}
                  onKeyDown={(e) => { if (e.key === 'ArrowRight') seekAudio(Math.min(1, audioProgress + 0.05)); if (e.key === 'ArrowLeft') seekAudio(Math.max(0, audioProgress - 0.05)); }}
                  className="flex h-24 cursor-pointer items-center gap-[2px]">
                  {(clip?.peaks?.length ? clip.peaks : Array.from({ length: 56 }, () => 0.12)).map((p, i, arr) => {
                    const played = i / arr.length <= audioProgress;
                    return <span key={i} className={`flex-1 rounded-full ${played && audioPlaying ? 'animate-pulse' : ''}`} style={{ height: `${Math.max(6, p * 100)}%`, background: played ? 'rgb(34,211,238)' : 'rgba(148,163,184,0.32)', transition: 'background-color 120ms' }} />;
                  })}
                </div>
              </div>

              {/* AI separation (Demucs) — billed server-side, reserve-before-render */}
              <div className="space-y-2.5 rounded-xl border border-app-border/15 bg-app-surface/50 p-3.5">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-app-muted"><Sparkles size={12} className="text-app-accent" />{t.audioStudio}</span>
                <div className="grid grid-cols-2 gap-2">
                  <PhotoCard icon={<Mic size={16} />} label={t.vocalIso} cost={3} disabled={exporting} onClick={() => void runAudioAI('vocal_isolation')} />
                  <PhotoCard icon={<Waves size={16} />} label={t.vocalSplit} cost={4} disabled={exporting} onClick={() => void runAudioAI('splitter')} />
                </div>
              </div>

              {/* Deterministic process — pitch / speed / trim / fade (free) */}
              <div className="space-y-2.5 rounded-xl border border-app-border/15 bg-app-surface/50 p-3.5">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-app-muted">{t.applyAudio}</span>
                <Slider icon={<Music2 size={13} />} label={t.pitch} min={-12} max={12} value={pitch} onChange={setPitch} suffix=" st" />
                <Slider icon={<Gauge size={13} />} label={t.speed} min={0.5} max={2} step={0.05} value={audioSpeed} onChange={setAudioSpeed} suffix="×" />
                {audioDur > 0 && (
                  <>
                    <Slider label={t.aStart} min={0} max={Math.max(0.1, audioDur)} step={0.1} value={aTrim.start} onChange={(v) => setATrim((tr) => ({ ...tr, start: Math.min(v, tr.end - 0.1) }))} suffix="s" />
                    <Slider label={t.aEnd} min={0} max={Math.max(0.1, audioDur)} step={0.1} value={aTrim.end} onChange={(v) => setATrim((tr) => ({ ...tr, end: Math.max(v, tr.start + 0.1) }))} suffix="s" />
                  </>
                )}
                <Slider label={t.fadeIn} min={0} max={5} step={0.1} value={fade.inSec} onChange={(v) => setFade((f) => ({ ...f, inSec: v }))} suffix="s" />
                <Slider label={t.fadeOut} min={0} max={5} step={0.1} value={fade.outSec} onChange={(v) => setFade((f) => ({ ...f, outSec: v }))} suffix="s" />
                <button type="button" onClick={() => void runAudioProcess()} disabled={!audioHasEdit || exporting}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-app-accent px-3 py-2.5 text-[13px] font-bold text-app-bg transition-opacity hover:opacity-90 disabled:opacity-40">
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}{t.applyAudio}
                </button>
              </div>
            </div>
            ) : (<>
            {/* Preview stage */}
            <div ref={stageRef} onMouseDown={onStageDown} onMouseMove={onStageMove} onMouseUp={onStageUp} onMouseLeave={onStageUp}
              className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-black ${cropOn ? 'cursor-crosshair' : ''}`} style={{ minHeight: 220, maxHeight: 360 }}>
              {isPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img ref={imgRef} src={result?.kind === 'image' ? result.url : clip?.url} alt="" style={{ filter: filterCss, maxHeight: 360 }} className="h-auto max-w-full"
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

            {/* AI Photo Studio actions (PHOTO) — one-click Replicate transforms, billed server-side */}
            {isPhoto && (
              <div className="space-y-2.5 rounded-xl border border-app-border/15 bg-app-surface/50 p-3.5">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-app-muted"><Sparkles size={12} className="text-app-accent" />{t.aiStudio}</span>
                <div className="grid grid-cols-2 gap-2">
                  <PhotoCard icon={<Eraser size={16} />} label={t.removeBg} cost={2} disabled={exporting} onClick={() => void runPhotoAction('remove_bg')} />
                  <PhotoCard icon={<Maximize2 size={16} />} label={t.upscale} cost={5} disabled={exporting} onClick={() => void runPhotoAction('upscale')} />
                  <PhotoCard icon={<Smile size={16} />} label={t.faceRestore} cost={3} disabled={exporting} onClick={() => void runPhotoAction('face_restore')} />
                  <PhotoCard icon={<Palette size={16} />} label={t.colorize} cost={3} disabled={exporting} onClick={() => void runPhotoAction('colorize')} />
                </div>
              </div>
            )}

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
            </>)}

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
                  : result.kind === 'audio'
                  ? <audio src={result.url} controls className="w-full" />
                  : <video src={result.url} controls playsInline className="max-h-52 w-full rounded-lg bg-black" />}
                {secondaryAudio && (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-app-elevated/60 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-app-muted"><Waves size={12} className="text-app-accent" />{t.instrumental}</span>
                    <button type="button" onClick={() => void downloadAsset(secondaryAudio, filenameFor(secondaryAudio, 'audio'))} className="inline-flex items-center gap-1 rounded-md bg-app-bg/50 px-2.5 py-1 text-[11px] font-semibold text-app-text"><Download size={11} />{t.download}</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {(exporting || successAsset) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
          {exporting ? (
            <div className="w-full max-w-[340px] rounded-2xl border border-app-border/20 bg-app-surface p-6 text-center shadow-2xl">
              <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-app-accent/15"><Clapperboard size={22} className="text-app-accent" /></span>
              <div className="mb-3 text-[13.5px] font-semibold text-app-text">{isAudio ? t.audioProcessing : isPhoto ? t.photoProcessing : t.exporting}</div>
              <div className="h-2 overflow-hidden rounded-full bg-app-elevated"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${exportPct}%`, background: 'linear-gradient(90deg, rgb(34,211,238), rgb(6,182,212))' }} /></div>
              <div className="mt-2 text-[11px] tabular-nums text-app-muted">{exportPct}%</div>
            </div>
          ) : successAsset ? (
            <div className="w-full max-w-[360px] rounded-2xl border border-app-border/20 bg-app-surface p-5 shadow-2xl">
              <div className="mb-3 flex flex-col items-center text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15"><Check size={24} className="text-emerald-400" strokeWidth={3} /></span>
                <div className="text-[14px] font-bold text-app-text">{t.exportSuccess}</div>
              </div>
              {successAsset.kind === 'image'
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={successAsset.url} alt="" className="mb-3 max-h-48 w-full rounded-lg bg-black object-contain" />
                : successAsset.kind === 'audio'
                ? <div className="mb-3 rounded-lg bg-app-elevated/60 p-3"><div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-app-muted"><Music2 size={13} className="text-app-accent" />{t.vocals}</div><audio src={successAsset.url} controls className="w-full" />{secondaryAudio && <div className="mt-2 border-t border-app-border/15 pt-2"><div className="mb-1.5 flex items-center justify-between text-[11.5px] font-semibold text-app-muted"><span className="flex items-center gap-1.5"><Waves size={12} className="text-app-accent" />{t.instrumental}</span><button type="button" onClick={() => void downloadAsset(secondaryAudio, filenameFor(secondaryAudio, 'audio'))} className="inline-flex items-center gap-1 rounded-md bg-app-bg/50 px-2 py-0.5 text-[10.5px] text-app-text"><Download size={10} />{t.download}</button></div><audio src={secondaryAudio} controls className="w-full" /></div>}</div>
                : <video src={successAsset.url} controls playsInline className="mb-3 max-h-48 w-full rounded-lg bg-black" />}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void downloadAsset(successAsset.url, filenameFor(successAsset.url, successAsset.kind))}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-app-accent px-3 py-2.5 text-[13px] font-bold text-app-bg transition-opacity hover:opacity-90"><Download size={15} />{t.download}</button>
                <button type="button" onClick={() => void shareAsset(successAsset.url)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-app-elevated px-3 py-2.5 text-[13px] font-semibold text-app-text ring-1 ring-app-border/15 hover:bg-app-surface"><Share2 size={15} />{t.share}</button>
              </div>
              <button type="button" onClick={() => setSuccessAsset(null)} className="mt-2 w-full rounded-xl px-3 py-2 text-[12px] font-medium text-app-muted hover:text-app-text">{t.close}</button>
            </div>
          ) : null}
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

function PhotoCard({ icon, label, cost, onClick, disabled }: { icon: React.ReactNode; label: string; cost: number; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="flex min-h-[64px] flex-col items-start justify-between gap-2 rounded-xl border border-app-border/15 bg-app-elevated p-3 text-left transition-colors hover:border-app-accent/40 hover:bg-app-surface disabled:opacity-40">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-app-accent/15 text-app-accent">{icon}</span>
      <span className="flex w-full items-center justify-between gap-1.5">
        <span className="min-w-0 truncate text-[12px] font-semibold text-app-text">{label}</span>
        <span className="shrink-0 rounded-full bg-app-bg/60 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-app-muted">{cost}</span>
      </span>
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
