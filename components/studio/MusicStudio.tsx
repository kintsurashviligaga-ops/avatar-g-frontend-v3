'use client';

/**
 * MusicStudio — the modern, dedicated music generator at /studio/music.
 *
 * Replaces the old generic AgentShell music page. Three things it adds that the
 * founder asked for:
 *   1. An in-app VOICE RECORDER (mic) — capture ≥15s of your voice with a live
 *      level meter + timer, or upload a file, then have the song SUNG IN YOUR
 *      VOICE (zero-shot vocal clone via /api/ai/music → MiniMax music-01).
 *   2. A Cover/My-voice flow so an uploaded track can be remixed OR used as a
 *      voice reference.
 *   3. A POLISHED custom player (album art, play/pause, scrub, time, download)
 *      instead of the raw <audio controls> element.
 *
 * All generation goes through the existing, verified /api/ai/music endpoint
 * (compose · cover · voiceReference). Palette: navy glass + cyan accent.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Music2, Mic, Square, Upload, Play, Pause, Download,
  Loader2, Sparkles, Trash2, AlertCircle, Wand2, Film, Image as ImageIcon,
} from 'lucide-react';
import { CreditBadge } from '@/components/ui/CreditBadge';
import { VoiceTrainer } from '@/components/voice/VoiceTrainer';

// ─── i18n ───────────────────────────────────────────────────────────────────
type Lang = 'ka' | 'en' | 'ru';
const STR = {
  ka: {
    back: 'უკან', title: 'მუსიკის სტუდია', subtitle: 'შექმენი მუსიკა — შენი ხმითაც',
    promptLabel: 'აღწერე მუსიკა', promptPh: 'მაგ: ამაღელვებელი კინემატოგრაფიული პოპ, 120 BPM, ქართული პოლიფონიის ელფერით',
    genre: 'ჟანრი', instrumental: 'ინსტრუმენტალი', vocals: 'ვოკალით',
    lyricsPh: 'ლირიკა — შენი ტექსტი (ცარიელი = ავტომატური)',
    voiceTitle: 'შენი ხმა', voiceHint: 'ჩაიწერე ან ატვირთე ≥15წმ ხმა — სიმღერა შენი ვოკალით შეიქმნება',
    record: 'ჩაწერა', stop: 'გაჩერება', upload: 'ატვირთვა', remove: 'წაშლა',
    useVoice: '🎤 ჩემი ხმით', useCover: '🎵 ქავერი',
    voiceLyricsPh: 'ლირიკა — რას იმღერებს შენი ხმა',
    needLonger: 'საჭიროა ≥15 წამი', recording: 'მიმდინარეობს ჩაწერა',
    generate: 'შექმნა', generating: 'იქმნება…', failed: 'ვერ შეიქმნა, სცადე თავიდან',
    micDenied: 'მიკროფონზე წვდომა ვერ მოხერხდა', tooBig: 'ფაილი დიდია — ჩაწერე უფრო მოკლე (≤60წმ)',
    result: 'შენი ტრეკი', download: 'ჩამოტვირთვა', newTrack: 'ახალი ტრეკი',
    myVoiceOff: 'იმღერე ჩემი ნავარჯიში ხმით', myVoiceOn: 'ჩემი ნავარჯიში ხმით ✓',
    makeVideo: 'გადააქციე ვიდეოდ — დაამატე ფოტო', addPhoto: 'ფოტოს ატვირთვა', changePhoto: 'ფოტოს შეცვლა',
    createVideo: 'ვიდეოს შექმნა', creatingVideo: 'ვიდეო იქმნება…', videoFailed: 'ვიდეო ვერ შეიქმნა, სცადე თავიდან', downloadVideo: 'ვიდეოს ჩამოტვირთვა',
  },
  en: {
    back: 'Back', title: 'Music Studio', subtitle: 'Create music — even in your own voice',
    promptLabel: 'Describe the music', promptPh: 'e.g. uplifting cinematic pop, 120 BPM, with a hint of Georgian polyphony',
    genre: 'Genre', instrumental: 'Instrumental', vocals: 'Vocals',
    lyricsPh: 'Lyrics — your words (empty = auto-written)',
    voiceTitle: 'Your voice', voiceHint: 'Record or upload ≥15s of voice — the song is sung in your voice',
    record: 'Record', stop: 'Stop', upload: 'Upload', remove: 'Remove',
    useVoice: '🎤 My voice', useCover: '🎵 Cover',
    voiceLyricsPh: 'Lyrics — what your voice will sing',
    needLonger: 'Need ≥15 seconds', recording: 'Recording',
    generate: 'Create', generating: 'Creating…', failed: 'Failed — try again',
    micDenied: 'Could not access the microphone', tooBig: 'File too large — record shorter (≤60s)',
    result: 'Your track', download: 'Download', newTrack: 'New track',
    myVoiceOff: 'Sing with my trained voice', myVoiceOn: 'My trained voice ✓',
    makeVideo: 'Turn it into a video — add a photo', addPhoto: 'Upload a photo', changePhoto: 'Change photo',
    createVideo: 'Create music video', creatingVideo: 'Rendering video…', videoFailed: 'Video failed — try again', downloadVideo: 'Download video',
  },
  ru: {
    back: 'Назад', title: 'Музыкальная студия', subtitle: 'Создавайте музыку — даже своим голосом',
    promptLabel: 'Опишите музыку', promptPh: 'напр.: воодушевляющий кинематографичный поп, 120 BPM',
    genre: 'Жанр', instrumental: 'Инструментал', vocals: 'Вокал',
    lyricsPh: 'Текст — ваши слова (пусто = авто)',
    voiceTitle: 'Ваш голос', voiceHint: 'Запишите или загрузите ≥15с голоса — песня будет спета вашим голосом',
    record: 'Запись', stop: 'Стоп', upload: 'Загрузить', remove: 'Удалить',
    useVoice: '🎤 Мой голос', useCover: '🎵 Кавер',
    voiceLyricsPh: 'Текст — что споёт ваш голос',
    needLonger: 'Нужно ≥15 секунд', recording: 'Идёт запись',
    generate: 'Создать', generating: 'Создаётся…', failed: 'Не удалось — попробуйте снова',
    micDenied: 'Нет доступа к микрофону', tooBig: 'Файл слишком большой — запишите короче (≤60с)',
    result: 'Ваш трек', download: 'Скачать', newTrack: 'Новый трек',
    myVoiceOff: 'Спеть моим обученным голосом', myVoiceOn: 'Мой обученный голос ✓',
    makeVideo: 'Сделайте видео — добавьте фото', addPhoto: 'Загрузить фото', changePhoto: 'Заменить фото',
    createVideo: 'Создать видео', creatingVideo: 'Видео создаётся…', videoFailed: 'Не удалось создать видео', downloadVideo: 'Скачать видео',
  },
} satisfies Record<Lang, Record<string, string>>;
type MusicT = (typeof STR)['ka'];

const GENRES = ['cinematic', 'pop', 'electronic', 'hip-hop', 'rock', 'lo-fi', 'ambient', 'folk', 'jazz'];
const MAX_REC_SEC = 60;
const MIN_REC_SEC = 15;

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// ─── Polished custom audio player ─────────────────────────────────────────────
function TrackPlayer({ url, coverUrl, t }: { url: string; coverUrl?: string; t: MusicT }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  const toggle = useCallback(() => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) { void a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  }, []);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const a = ref.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = frac * dur;
    setCur(a.currentTime);
  }, [dur]);

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(155deg,rgba(12,22,46,0.9),rgba(7,14,32,0.85))] shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
      <div className="flex flex-col items-stretch gap-4 p-4 sm:flex-row sm:items-center">
        {/* Album art */}
        <div className="relative mx-auto aspect-square w-40 shrink-0 overflow-hidden rounded-xl sm:mx-0 sm:w-24">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="cover" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500/30 to-blue-700/30">
              <Music2 className="text-white/70" size={32} />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.4)] transition-transform hover:scale-105 active:scale-95"
              aria-label={playing ? 'pause' : 'play'}
            >
              {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{t.result}</div>
              <div className="text-xs text-white/40">{fmtTime(cur)} / {fmtTime(dur)}</div>
            </div>
            <a
              href={url}
              download="myavatar-track.mp3"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={t.download}
            >
              <Download size={17} />
            </a>
          </div>

          {/* Scrubber */}
          <div
            onClick={seek}
            className="group relative h-2 cursor-pointer rounded-full bg-white/10"
            role="slider"
            aria-valuemin={0}
            aria-valuenow={Math.round(cur)}
            aria-valuemax={Math.round(dur)}
            tabIndex={0}
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-cyan-400" style={{ width: `${pct}%` }} />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
              style={{ left: `calc(${pct}% - 7px)` }}
            />
          </div>
        </div>
      </div>

      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function MusicStudio() {
  const params = useParams();
  const lang: Lang = (['ka', 'en', 'ru'].includes(String(params?.locale)) ? String(params?.locale) : 'ka') as Lang;
  const t = STR[lang];

  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState('cinematic');
  const [instrumental, setInstrumental] = useState(true);
  const [lyrics, setLyrics] = useState('');

  // Voice reference (record or upload) + what to do with it
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voicePreview, setVoicePreview] = useState('');
  const [voiceMode, setVoiceMode] = useState<'voice' | 'cover'>('voice');
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [level, setLevel] = useState(0);

  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ url: string; coverUrl?: string } | null>(null);
  const [error, setError] = useState('');
  // Trained-voice (RVC) state — set by the VoiceTrainer once a model is ready.
  const [hasTrainedVoice, setHasTrainedVoice] = useState(false);
  const [useMyVoice, setUseMyVoice] = useState(false);

  // DAY-4 — photo-to-music-video (isolated to this studio; pairs a still image with the generated track).
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoResult, setVideoResult] = useState<{ url: string; durationSec?: number | null } | null>(null);
  const [videoError, setVideoError] = useState('');
  const photoRef = useRef<HTMLInputElement | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasVoice = !!voiceBlob;
  const isVoiceClone = hasVoice && voiceMode === 'voice';

  // Elapsed timer while generating
  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(id);
  }, [busy]);

  const stopMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (acRef.current) { void acRef.current.close().catch(() => {}); acRef.current = null; }
    setLevel(0);
  }, []);

  const stopRecording = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    stopMeter();
    setRecording(false);
  }, [stopMeter]);

  const startRecording = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Live level meter (modern touch) — RMS of the analyser, animated.
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ac = new AC();
        acRef.current = ac;
        const src = ac.createMediaStreamSource(stream);
        const an = ac.createAnalyser();
        an.fftSize = 256;
        src.connect(an);
        const data = new Uint8Array(an.frequencyBinCount);
        const tick = () => {
          an.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) { const v = data[i] ?? 0; sum += v * v; }
          setLevel(Math.min(1, Math.sqrt(sum / data.length) / 90));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch { /* meter is optional */ }

      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
      let mime = '';
      for (const c of candidates) { try { if (MediaRecorder.isTypeSupported(c)) { mime = c; break; } } catch { /* noop */ } }
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const type = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        setVoiceBlob(blob);
        setVoicePreview((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(blob); });
        setVoiceMode('voice');
      };
      recRef.current = rec;
      rec.start();
      setRecSec(0);
      setRecording(true);
      recTimerRef.current = setInterval(() => {
        setRecSec((s) => {
          const n = s + 1;
          if (n >= MAX_REC_SEC) stopRecording();
          return n;
        });
      }, 1000);
    } catch {
      setError(t.micDenied);
      setRecording(false);
    }
  }, [stopRecording, t.micDenied]);

  const onPickFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    setVoiceBlob(f);
    setVoicePreview((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(f); });
    setVoiceMode('voice');
  }, []);

  const clearVoice = useCallback(() => {
    setVoiceBlob(null);
    setVoicePreview((p) => { if (p) URL.revokeObjectURL(p); return ''; });
    setRecSec(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    stopRecording();
    if (voicePreview) URL.revokeObjectURL(voicePreview);
  }, [stopRecording, voicePreview]);

  const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

  // DAY-4 photo-to-music-video — pick a still, then multiplex it with the generated track server-side.
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);
  const onPickPhoto = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/') || f.size > 8 * 1024 * 1024) { setVideoError(t.videoFailed); return; }
    setPhotoBlob(f);
    setPhotoPreview((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(f); });
    setVideoError('');
    setVideoResult(null);
  }, [t.videoFailed]);
  const makeVideo = useCallback(async () => {
    if (!result?.url || !photoBlob || videoBusy) return;
    setVideoBusy(true); setVideoError('');
    try {
      const imageDataUrl = await blobToDataUrl(photoBlob);
      const res = await fetch('/api/music/video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ imageDataUrl, audioUrl: result.url }),
      });
      const j = (await res.json().catch(() => null)) as { url?: string; durationSec?: number | null } | null;
      if (res.ok && j?.url) setVideoResult({ url: j.url, durationSec: j.durationSec ?? null });
      else setVideoError(t.videoFailed);
    } catch { setVideoError(t.videoFailed); }
    finally { setVideoBusy(false); }
  }, [result, photoBlob, videoBusy, t.videoFailed]);

  const canGenerate = prompt.trim().length > 0 && !busy && !recording
    && !(isVoiceClone && recSec > 0 && recSec < MIN_REC_SEC);

  const generate = useCallback(async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError(''); setResult(null);
    try {
      let voiceRef = '';
      if (hasVoice && voiceBlob) {
        const dataUrl = await blobToDataUrl(voiceBlob);
        if (dataUrl.length > 5_500_000) { setError(t.tooBig); setBusy(false); return; }
        voiceRef = dataUrl;
      }
      const body: Record<string, unknown> = { prompt: prompt.trim(), style: genre };
      if (useMyVoice && hasTrainedVoice) {
        // Faithful: sing with the user's TRAINED voice model (no upload needed).
        body.useMyVoice = true;
        if (lyrics.trim()) body.lyrics = lyrics.trim();
      } else if (isVoiceClone) {
        body.voiceReference = voiceRef;
        if (lyrics.trim()) body.lyrics = lyrics.trim();
      } else if (hasVoice) {
        body.audioReference = voiceRef;
      } else {
        body.instrumental = instrumental;
        if (!instrumental && lyrics.trim()) body.lyrics = lyrics.trim();
      }
      const res = await fetch('/api/ai/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; coverUrl?: string; error?: string };
      if (j.success && j.url) setResult({ url: j.url, ...(j.coverUrl ? { coverUrl: j.coverUrl } : {}) });
      else setError(j.error || t.failed);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }, [prompt, busy, hasVoice, voiceBlob, isVoiceClone, lyrics, genre, instrumental, useMyVoice, hasTrainedVoice, t.failed, t.tooBig]);

  const showLyrics = (!instrumental && !hasVoice) || isVoiceClone || (useMyVoice && hasTrainedVoice);

  return (
    <div className="min-h-screen bg-transparent text-white">
      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-8 pb-28 sm:px-6 sm:pt-12">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href={`/${lang}/dashboard`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/60 transition-colors hover:bg-white/10 hover:text-white" aria-label={t.back}>
              <ArrowLeft size={18} />
            </Link>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-[0_0_22px_rgba(34,211,238,0.3)]">
              <Music2 size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">{t.title}</h1>
              <p className="text-xs text-white/45">{t.subtitle}</p>
            </div>
          </div>
          <CreditBadge />
        </div>

        {/* Composer */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="space-y-5 rounded-2xl border border-white/10 bg-[linear-gradient(155deg,rgba(12,22,46,0.85),rgba(7,14,32,0.78))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.4)]">
          {/* Prompt */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-white/50">{t.promptLabel}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder={t.promptPh}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-cyan-400/50"
            />
          </div>

          {/* Genre */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-white/50">{t.genre}</label>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <button key={g} type="button" onClick={() => setGenre(g)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${genre === g ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200' : 'border-white/10 text-white/60 hover:bg-white/5'}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Instrumental / Vocals — only when no voice reference is attached */}
          {!hasVoice && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setInstrumental(true)}
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${instrumental ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200' : 'border-white/10 text-white/60 hover:bg-white/5'}`}>
                {t.instrumental}
              </button>
              <button type="button" onClick={() => setInstrumental(false)}
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${!instrumental ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200' : 'border-white/10 text-white/60 hover:bg-white/5'}`}>
                {t.vocals}
              </button>
            </div>
          )}

          {/* ── Voice section (the headline feature) ───────────────────────── */}
          <div className="space-y-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
            <div className="flex items-center gap-2">
              <Mic size={15} className="text-cyan-300" />
              <span className="text-sm font-semibold text-white">{t.voiceTitle}</span>
            </div>

            {!hasVoice && (
              <>
                <p className="text-xs leading-relaxed text-white/45">{t.voiceHint}</p>
                <div className="flex items-center gap-3">
                  {!recording ? (
                    <button type="button" onClick={startRecording}
                      className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-95">
                      <Mic size={16} /> {t.record}
                    </button>
                  ) : (
                    <button type="button" onClick={stopRecording}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950">
                      <Square size={14} fill="currentColor" /> {t.stop}
                    </button>
                  )}
                  <span className="text-white/20">·</span>
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/5">
                    <Upload size={15} /> {t.upload}
                  </button>
                  <input ref={fileRef} type="file" accept="audio/*" onChange={onPickFile} className="hidden" />
                </div>

                {/* Live recorder: timer + level meter */}
                {recording && (
                  <div className="flex items-center gap-3 rounded-lg bg-black/30 px-3 py-2">
                    <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                    <span className="font-mono text-sm tabular-nums text-white">{fmtTime(recSec)}</span>
                    <div className="flex flex-1 items-center gap-0.5">
                      {Array.from({ length: 16 }).map((_, i) => {
                        const active = level * 16 > i;
                        return <span key={i} className={`h-4 flex-1 rounded-sm transition-all ${active ? 'bg-cyan-400' : 'bg-white/10'}`} style={{ height: active ? `${8 + Math.random() * 12}px` : '6px' }} />;
                      })}
                    </div>
                    <span className={`text-[11px] font-medium ${recSec >= MIN_REC_SEC ? 'text-cyan-300' : 'text-white/40'}`}>
                      {recSec >= MIN_REC_SEC ? '✓' : t.needLonger}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Captured voice: preview + mode toggle + remove */}
            {hasVoice && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <audio src={voicePreview} controls className="h-9 min-w-0 flex-1" />
                  <button type="button" onClick={clearVoice} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/50 transition-colors hover:bg-red-500/15 hover:text-red-300" aria-label={t.remove}>
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setVoiceMode('voice')}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${voiceMode === 'voice' ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200' : 'border-white/10 text-white/55 hover:bg-white/5'}`}>
                    {t.useVoice}
                  </button>
                  <button type="button" onClick={() => setVoiceMode('cover')}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${voiceMode === 'cover' ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200' : 'border-white/10 text-white/55 hover:bg-white/5'}`}>
                    {t.useCover}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Faithful "my voice": train a personal RVC model, then sing with it. */}
          <VoiceTrainer lang={lang} onReady={setHasTrainedVoice} />
          {hasTrainedVoice && (
            <button type="button" onClick={() => setUseMyVoice((v) => !v)}
              className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${useMyVoice ? 'border-cyan-400/70 bg-cyan-400/20 text-cyan-100' : 'border-white/10 text-white/60 hover:bg-white/5'}`}>
              🎤 {useMyVoice ? t.myVoiceOn : t.myVoiceOff}
            </button>
          )}

          {/* Lyrics (vocals or voice-clone) */}
          <AnimatePresence>
            {showLyrics && (
              <motion.textarea
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                rows={3}
                placeholder={isVoiceClone ? t.voiceLyricsPh : t.lyricsPh}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-cyan-400/50"
              />
            )}
          </AnimatePresence>

          {/* Generate */}
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3.5 text-sm font-bold text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.35)] transition-all hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <><Loader2 size={17} className="animate-spin" /> {t.generating} {elapsed > 0 && `${elapsed}s`}</>
              : isVoiceClone ? <><Wand2 size={17} /> {t.useVoice}</>
              : <><Sparkles size={17} /> {t.generate}</>}
          </button>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <AlertCircle size={16} /> {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <TrackPlayer url={result.url} coverUrl={result.coverUrl} t={t} />

              {/* DAY-4 — Photo → Music Video (isolated to this studio). Pair a still with the track → MP4. */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                <div className="mb-2.5 flex items-center gap-2 text-[12.5px] font-semibold text-white/80">
                  <Film size={15} className="text-app-accent" /> {t.makeVideo}
                </div>
                <input ref={photoRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickPhoto} className="hidden" />

                {videoResult ? (
                  <div className="space-y-2">
                    <video src={videoResult.url} controls playsInline className="w-full rounded-xl bg-black" />
                    <a href={videoResult.url} download="myavatar-music-video.mp4" target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-app-accent px-4 py-2 text-[13px] font-semibold text-black transition hover:opacity-90">
                      <Download size={15} /> {t.downloadVideo}
                    </a>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <button type="button" onClick={() => photoRef.current?.click()} disabled={videoBusy}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2 text-[12.5px] font-semibold text-white/85 transition hover:bg-white/[0.08] disabled:opacity-50">
                        {photoPreview
                          ? <><img src={photoPreview} alt="" className="h-6 w-6 rounded object-cover" /> {t.changePhoto}</>
                          : <><ImageIcon size={15} /> {t.addPhoto}</>}
                      </button>
                      <button type="button" onClick={makeVideo} disabled={!photoBlob || videoBusy}
                        className="inline-flex items-center gap-2 rounded-lg bg-app-accent px-4 py-2 text-[12.5px] font-semibold text-black transition hover:opacity-90 disabled:opacity-40">
                        {videoBusy ? <><Loader2 size={15} className="animate-spin" /> {t.creatingVideo}</> : <><Film size={15} /> {t.createVideo}</>}
                      </button>
                    </div>
                    {videoError && <p className="flex items-center gap-1.5 text-[11.5px] text-rose-400"><AlertCircle size={13} /> {videoError}</p>}
                  </div>
                )}
              </div>

              <button type="button" onClick={() => { setResult(null); setVideoResult(null); setPhotoBlob(null); setPhotoPreview((p) => { if (p) URL.revokeObjectURL(p); return ''; }); }} className="mx-auto block text-xs text-white/40 transition-colors hover:text-white/70">
                {t.newTrack}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default MusicStudio;
