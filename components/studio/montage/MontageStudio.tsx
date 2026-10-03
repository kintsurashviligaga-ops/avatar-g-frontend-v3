'use client';

/**
 * components/studio/montage/MontageStudio.tsx — Montage, built like CapCut.
 *
 * PHONE                                   DESKTOP (≥ 1024 px)
 *   ✕  Montage          9:16  [Export]      ✕  Montage                         9:16  [Export]
 *   ┌──────── preview ────────┐            ┌ media ┐┌──────── preview ───────┐┌ tools ─┐
 *   │                         │            │device ││                        ││ Music  │
 *   └─────────────────────────┘            │mine   ││                        ││ Text … │
 *   0:03 / 0:15      ▶      ↶ ↷            └───────┘└────────────────────────┘└────────┘
 *   ┃ timeline (playhead centred) ┃          split · delete · copy …   0:03 / 0:15 ▶ ↶ ↷ − +
 *   Edit  Music  Text  Filters  Colour  Format  ┃ timeline ┃
 *
 * WHAT IT IS FOR, and nothing past it: put clips (and photos) in order, cut them, set where they start and
 * end, a transition on a cut, text on a clip, one song under it all, one look, and the format of the place it
 * will be posted. Everything here is something /api/v2/montage/render really renders — no control that only
 * changes the preview. Exporting costs no credits (the pipeline is local ffmpeg; see montagePlan).
 *
 * Files upload the moment they are added (browser → storage, never through a function body), so by the time
 * the edit is done they are there. Export is blocked, with the reason on screen, until they are.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Copy as CopyIcon, Film, Loader2, Minus, Music2, Palette, Pause, Play, Plus,
  Ratio, Redo2, RotateCcw, Scissors, SlidersHorizontal, Timer, Trash2, Type, Undo2, Volume2, VolumeX, X,
} from 'lucide-react';
import { isMontageAspect, type MontageAspect, type MontageCaptionPos, type MontageGrade, type MontageTransition } from '@/lib/services/montage/montagePlan';
import { useJobQueue } from '@/store/useJobQueue';
import { describeServiceError } from '../ui/serviceError';
import { uploadErrorText, uploadFileToStorage } from '../ui/useUpload';
import { montageCopy, langOf, type Copy } from './copy';
import { ExportView, type ExportState } from './ExportView';
import { MediaPicker } from './MediaPicker';
import { decodePeaks, extractFrames, fmtSec, fmtTime, kindOfFile, probeDuration } from './media';
import {
  AdjustPanel, AspectChoice, DurationPanel, FiltersPanel, FormatPanel, MusicPanel, TextPanel, TransitionPanel,
} from './panels';
import { Preview } from './Preview';
import {
  HISTORY_CAP, MAX_SHOTS, MAX_SHOT_SEC, NEUTRAL_GRADE, blockers as blockersOf, buildRenderBody, canSplit, clipAt, clipDuration,
  clipForSource, commit, duplicateClip, emptyEdit, insertClips, layout, moveClip, musicSpanSec, musicStartMax, newId, redo,
  removeClip, removeMusic, replacePresent, setCaption, setMusic, setMusicStart, setPhotoDuration, setTransition,
  setTransitionAll, splitClip, startHistory, toggleMute, totalSec as totalOf, trimClip, undo, type Blocker, type Edit,
  type History, type MediaSource,
} from './project';
import { Timeline, type TimelineHandle } from './Timeline';
import { useLibrary, isVideoItem, type LibraryItem } from './useLibrary';
import { usePlayer, type PlayerClip } from './usePlayer';
import { listenForMontageCommands, type MontageCommandHost } from './voiceCommands';

interface Tool { id: string; label: string; Icon: typeof Film; run: () => void; disabled?: boolean }

type Panel = 'music' | 'text' | 'filters' | 'adjust' | 'format' | 'transition' | 'duration' | 'media';

export interface MontageStudioProps {
  locale: string;
  onExit: () => void;
  /** Clips to open with — a video sent here from the chat („Open in editor"), or the attachments of a request. */
  initialMedia?: { url: string; kind: 'video' | 'image'; name?: string }[];
  /**
   * A song to open with — e.g. one the Music tool just made — as the music bed, starting `startSec` into it (default
   * 0; clamped to the track once its length is known). An https URL is used as it is; a data:/blob: URL is uploaded
   * like a picked file, and Export waits for it like any other source.
   */
  initialMusic?: { url: string; name?: string; startSec?: number };
  /** The format to start in. With `initialMedia` the format choice is skipped: the editor opens on the clips. */
  initialAspect?: MontageAspect;
  /** Called once with the finished video, so it lands in the conversation too (and survives closing this). */
  onDelivered?: (videoUrl: string, aspect: MontageAspect) => void;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const MIN_PX = 12;
const MAX_PX = 240;

function useMedia(query: string): boolean {
  const [d, setD] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setD(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return d;
}

function blockerText(b: Blocker, t: Copy, authFailed = false): string {
  switch (b.kind) {
    case 'empty': return t.needClip;
    case 'uploading': return `${t.waitUploads} · ${b.count}`;
    // Signed out is the commonest cause, and „delete it and add it again" would not help: say what will.
    case 'failed': return authFailed ? t.signInToUpload : `${b.count} ${t.failedFiles}`;
    case 'tooLong': return t.tooLongTotal;
    case 'musicUploading': return t.musicUploading;
    case 'musicFailed': return t.musicFailed;
  }
}

function ToolButton({ label, Icon, run, disabled, testId, active }: {
  label: string; Icon: typeof Film; run: () => void; disabled?: boolean; testId: string; active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={run}
      disabled={disabled}
      data-testid={testId}
      aria-pressed={active}
      className={cx(
        'flex min-h-[56px] min-w-[60px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:opacity-35',
        active ? 'text-app-accent' : 'text-app-text hover:bg-app-elevated',
      )}
    >
      <Icon size={20} aria-hidden="true" />
      <span className="max-w-[72px] truncate">{label}</span>
    </button>
  );
}

export default function MontageStudio({ locale, onExit, initialMedia, initialMusic, initialAspect, onDelivered }: MontageStudioProps) {
  const t = useMemo(() => montageCopy(locale), [locale]);
  const lang = langOf(locale);
  // ≥ 1024: the tools move into a right column. ≥ 1280: the media gets its own left column too — below that, beside
  // the app's sidebar, three columns would leave the preview a sliver, so „+" opens the media in the tools column.
  const desktop = useMedia('(min-width: 1024px)');
  const wide = useMedia('(min-width: 1280px)');

  const [sources, setSources] = useState<Record<string, MediaSource>>({});
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const [hist, setHist] = useState<History>(() => startHistory(emptyEdit(isMontageAspect(initialAspect) ? initialAspect : '9:16')));
  // Opening on clips in a known format („put the song on the video we made"): no format question while they land.
  const [seeding, setSeeding] = useState(() => Boolean(initialMedia?.length) && isMontageAspect(initialAspect));
  const edit = hist.present;
  const editRef = useRef(edit);
  editRef.current = edit;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [panelClipId, setPanelClipId] = useState<string | null>(null);
  const [pxPerSec, setPxPerSec] = useState(56);
  const [thumbs, setThumbs] = useState<Record<string, string[]>>({});
  const [peaks, setPeaks] = useState<Record<string, number[]>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [exp, setExp] = useState<ExportState | null>(null);
  const [exportedOnce, setExportedOnce] = useState(false);
  const [askLeave, setAskLeave] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const musicFileRef = useRef<HTMLInputElement | null>(null);
  const timelineRef = useRef<TimelineHandle | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);
  const filesById = useRef(new Map<string, File>());
  /** blob: URLs the HOST handed in (initialMusic) — theirs to revoke, never ours. */
  const foreignUrls = useRef(new Set<string>());
  /** True from the first statement of an export to its last — read synchronously by the voice commands. */
  const exportingRef = useRef(false);

  const flash = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((cur) => (cur === m ? null : cur)), 3200);
  }, []);

  // ── HISTORY: every edit goes through `apply`. Slider drags and typing coalesce into ONE undo step. ─────
  const lastStep = useRef<{ key: string; at: number } | null>(null);
  const apply = useCallback((fn: (e: Edit) => Edit, coalesce?: string) => {
    setHist((h) => {
      const next = fn(h.present);
      if (next === h.present) return h;
      const now = Date.now();
      const last = lastStep.current;
      if (coalesce && last && last.key === coalesce && now - last.at < 900) {
        lastStep.current = { key: coalesce, at: now };
        return replacePresent(h, next);
      }
      lastStep.current = coalesce ? { key: coalesce, at: now } : null;
      return commit(h, next);
    });
  }, []);
  /** The edit as it was when a trim handle went down — the drag's single undo step. */
  const trimStart = useRef<Edit | null>(null);

  // ── Derived timeline ───────────────────────────────────────────────────────────────────────────────
  const placed = useMemo(() => layout(edit.clips), [edit.clips]);
  const total = useMemo(() => totalOf(edit.clips), [edit.clips]);
  const music = edit.musicId ? sources[edit.musicId] ?? null : null;
  const blockers = useMemo(() => blockersOf(edit, sources), [edit, sources]);
  const authFailed = useMemo(() => Object.values(sources).some((s) => s.status === 'error' && s.errorKind === 'auth'), [sources]);
  const empty = edit.clips.length === 0;

  const playerClips = useMemo<PlayerClip[]>(() => edit.clips.map((c, i) => {
    const src = sources[c.sourceId];
    const pl = placed[i]!;
    return {
      id: c.id,
      kind: src?.kind === 'image' ? 'image' : 'video',
      url: src?.previewUrl ?? '',
      t0: pl.t0,
      t1: pl.t1,
      start: src?.kind === 'image' ? 0 : c.startSec,
      end: src?.kind === 'image' ? clipDuration(c) : c.endSec,
      muted: c.muted,
    };
  }), [edit.clips, placed, sources]);

  const onFrame = useCallback((tm: number) => {
    timelineRef.current?.scrollToTime(tm);
    if (timeLabelRef.current) timeLabelRef.current.textContent = `${fmtTime(tm)} / ${fmtTime(totalOf(editRef.current.clips))}`;
  }, []);

  const player = usePlayer({
    clips: playerClips,
    totalSec: total,
    musicUrl: music?.previewUrl ?? null,
    musicOffsetSec: music ? edit.musicStartSec : 0,
    originalSound: edit.originalSound,
    onFrame,
  });
  const { pause, seek, toggle, timeRef } = player;

  // Keep the label honest when the edit's length changes without the clock moving.
  useEffect(() => { onFrame(timeRef.current); }, [total, onFrame, timeRef]);
  // A new zoom level moves the content under the playhead: put the current time back under it.
  useEffect(() => { timelineRef.current?.scrollToTime(timeRef.current); }, [pxPerSec, timeRef, empty, desktop]);

  // ── Filmstrips and the waveform, best effort, one source at a time ────────────────────────────────────
  const frameQueue = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const s of Object.values(sources)) {
      if (s.kind !== 'video' || s.durationSec <= 0 || thumbs[s.id] || frameQueue.current.has(s.id)) continue;
      frameQueue.current.add(s.id);
      const count = Math.max(4, Math.min(16, Math.ceil(s.durationSec / 2)));
      void extractFrames(s.previewUrl, s.durationSec, count).then((frames) => {
        setThumbs((cur) => ({ ...cur, [s.id]: frames }));
      });
    }
  }, [sources, thumbs]);
  useEffect(() => {
    if (!music || peaks[music.id]) return;
    let alive = true;
    void decodePeaks(music.previewUrl).then((pk) => { if (alive) setPeaks((cur) => ({ ...cur, [music.id]: pk })); });
    return () => { alive = false; };
  }, [music, peaks]);

  // ── Uploads ────────────────────────────────────────────────────────────────────────────────────────
  const patchSource = useCallback((id: string, patch: Partial<MediaSource>) => {
    setSources((cur) => (cur[id] ? { ...cur, [id]: { ...cur[id]!, ...patch } } : cur));
  }, []);
  const uploadQueue = useRef<string[]>([]);
  const uploading = useRef(0);
  const pump = useCallback(() => {
    while (uploading.current < 2 && uploadQueue.current.length) {
      const id = uploadQueue.current.shift()!;
      const file = filesById.current.get(id);
      if (!file) continue;
      uploading.current += 1;
      void uploadFileToStorage(file).then((res) => {
        if ('path' in res) patchSource(id, { status: 'ready', ref: res.path, error: undefined, errorKind: undefined });
        else patchSource(id, { status: 'error', error: uploadErrorText(res.error, locale, file.name), errorKind: res.error });
      }).finally(() => { uploading.current -= 1; pump(); });
    }
  }, [locale, patchSource]);
  const enqueueUpload = useCallback((id: string, file: File) => {
    filesById.current.set(id, file);
    uploadQueue.current.push(id);
    pump();
  }, [pump]);
  /** Try a failed upload again — after signing in, or once the network is back. The file is still in memory. */
  const retryUpload = useCallback((id: string) => {
    const file = filesById.current.get(id);
    if (!file) return;
    patchSource(id, { status: 'uploading', error: undefined, errorKind: undefined });
    uploadQueue.current.push(id);
    pump();
  }, [patchSource, pump]);

  /** Local files → sources (uploading) → clips at the end of the timeline. */
  const addFiles = useCallback(async (list: File[]) => {
    const media = list.filter((f) => { const k = kindOfFile(f); return k === 'video' || k === 'image'; });
    if (!media.length) { if (list.length) flash(t.notMedia); return; }
    const room = MAX_SHOTS - editRef.current.clips.length;
    if (room <= 0) { flash(t.tooMany); return; }
    if (media.length > room) flash(t.tooMany);
    const take = media.slice(0, room);
    const made = await Promise.all(take.map(async (f): Promise<MediaSource> => {
      const kind = kindOfFile(f) === 'image' ? 'image' : 'video';
      const previewUrl = URL.createObjectURL(f);
      const durationSec = kind === 'video' ? await probeDuration(previewUrl, 'video', 8000) : 0;
      return { id: newId('src'), kind, name: f.name, previewUrl, ref: null, status: 'uploading', durationSec };
    }));
    setSources((cur) => ({ ...cur, ...Object.fromEntries(made.map((s) => [s.id, s])) }));
    if (made.some((s) => s.kind === 'video' && s.durationSec > MAX_SHOT_SEC)) flash(t.firstMinute);
    const wasEmpty = editRef.current.clips.length === 0;
    apply((e) => insertClips(e, made.map(clipForSource)).edit);
    made.forEach((s, i) => enqueueUpload(s.id, take[i]!));
    setPanel(null);
    if (wasEmpty) window.setTimeout(() => seek(0), 0);
  }, [apply, enqueueUpload, flash, seek, t]);

  /** Library items are already hosted: they become ready sources straight away. */
  const addLibrary = useCallback(async (items: LibraryItem[]) => {
    const room = MAX_SHOTS - editRef.current.clips.length;
    if (room <= 0) { flash(t.tooMany); return; }
    if (items.length > room) flash(t.tooMany);
    const take = items.slice(0, room);
    const made = await Promise.all(take.map(async (it): Promise<MediaSource> => {
      const kind = isVideoItem(it) ? 'video' : 'image';
      const durationSec = kind === 'video' ? await probeDuration(it.url, 'video', 8000) : 0;
      return { id: newId('src'), kind, name: it.prompt?.slice(0, 40) || (kind === 'video' ? t.video : t.photo), previewUrl: it.url, ref: it.url, status: 'ready', durationSec };
    }));
    setSources((cur) => ({ ...cur, ...Object.fromEntries(made.map((s) => [s.id, s])) }));
    if (made.some((s) => s.kind === 'video' && s.durationSec > MAX_SHOT_SEC)) flash(t.firstMinute);
    const wasEmpty = editRef.current.clips.length === 0;
    apply((e) => insertClips(e, made.map(clipForSource)).edit);
    setPanel(null);
    if (wasEmpty) window.setTimeout(() => seek(0), 0);
  }, [apply, flash, seek, t]);

  // Opening with media (from the chat): hosted URLs are used as they are; data:/blob: are uploaded first.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !initialMedia?.length) return;
    seeded.current = true;
    void (async () => {
      const files: File[] = [];
      const hosted: LibraryItem[] = [];
      for (const m of initialMedia) {
        if (/^https?:\/\//i.test(m.url)) {
          hosted.push({ id: newId('lib'), kind: m.kind === 'video' ? 'film' : 'image', url: m.url, prompt: m.name ?? null, orientation: 'landscape', createdAt: '' });
          continue;
        }
        try {
          const blob = await (await fetch(m.url)).blob();
          const type = blob.type || (m.kind === 'video' ? 'video/mp4' : 'image/png');
          files.push(new File([blob], m.name || `clip.${m.kind === 'video' ? 'mp4' : 'png'}`, { type }));
        } catch { /* an unreadable attachment is skipped rather than blocking the rest */ }
      }
      try {
        if (hosted.length) await addLibrary(hosted);
        if (files.length) await addFiles(files);
      } finally {
        // Nothing usable landed → the start screen after all, in the format it was opened in.
        setSeeding(false);
      }
    })();
  }, [initialMedia, addFiles, addLibrary]);

  // FULL SCREEN, like CapCut: the editor's own bar (✕ · format · Export) is the only one — the shell's header hides
  // while it is open (globals.css `html[data-immersive]`).
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.immersive = 'montage';
    return () => { if (el.dataset.immersive === 'montage') delete el.dataset.immersive; };
  }, []);

  // Release blob: URLs when the editor goes away — the ones it made, not the ones it was handed.
  useEffect(() => () => {
    for (const s of Object.values(sourcesRef.current)) {
      if (s.previewUrl.startsWith('blob:') && !foreignUrls.current.has(s.previewUrl)) URL.revokeObjectURL(s.previewUrl);
    }
  }, []);

  // ── Music ──────────────────────────────────────────────────────────────────────────────────────────
  /** A new song under the edit — from its top, like CapCut (the last song's start meant nothing for this one). */
  const setMusicSource = useCallback((s: MediaSource) => {
    setSources((cur) => ({ ...cur, [s.id]: s }));
    apply((e) => setMusic(e, s.id, 0, s.durationSec));
  }, [apply]);
  const musicTrackSec = music?.durationSec ?? 0;
  /** The start from the panel: a slider drag (or a run of stepper taps) is ONE undo step. */
  const changeMusicStart = useCallback((sec: number) => {
    apply((e) => setMusicStart(e, sec, musicTrackSec), 'musicStart');
  }, [apply, musicTrackSec]);
  // A song whose length is learned AFTER its start was set (a seeded track still probing): keep the start inside it.
  useEffect(() => {
    if (!music || music.durationSec <= 0) return;
    setHist((h) => (h.present.musicId === music.id ? replacePresent(h, setMusicStart(h.present, h.present.musicStartSec, music.durationSec)) : h));
  }, [music]);
  const addMusicFile = useCallback(async (f: File) => {
    if (kindOfFile(f) !== 'audio') { flash(t.notAudio); return; }
    const previewUrl = URL.createObjectURL(f);
    const durationSec = await probeDuration(previewUrl, 'audio', 8000);
    const s: MediaSource = { id: newId('mus'), kind: 'audio', name: f.name.replace(/\.[a-z0-9]+$/i, ''), previewUrl, ref: null, status: 'uploading', durationSec };
    setMusicSource(s);
    enqueueUpload(s.id, f);
  }, [enqueueUpload, flash, setMusicSource, t]);
  const addMusicLibrary = useCallback(async (it: LibraryItem) => {
    const durationSec = await probeDuration(it.url, 'audio', 8000);
    setMusicSource({ id: newId('mus'), kind: 'audio', name: it.prompt?.slice(0, 48) || t.audio, previewUrl: it.url, ref: it.url, status: 'ready', durationSec });
  }, [setMusicSource, t]);

  // Opening with a song (a track the Music tool just made). It is registered AT ONCE — before anything is fetched or
  // probed — so Export can never run in the gap without it: a hosted URL is ready as it is; a data:/blob: one is
  // 'uploading' until the same upload queue a picked file goes through has stored it. Its length arrives later and the
  // effect above keeps the start inside it.
  const musicSeeded = useRef(false);
  useEffect(() => {
    if (musicSeeded.current || !initialMusic?.url) return;
    musicSeeded.current = true;
    const m = initialMusic;
    const hosted = /^https?:\/\//i.test(m.url);
    const id = newId('mus');
    const name = (m.name ?? '').trim().slice(0, 48) || t.audio;
    if (m.url.startsWith('blob:')) foreignUrls.current.add(m.url);
    setSources((cur) => ({
      ...cur,
      [id]: { id, kind: 'audio', name, previewUrl: m.url, ref: hosted ? m.url : null, status: hosted ? 'ready' : 'uploading', durationSec: 0 },
    }));
    const start = typeof m.startSec === 'number' && Number.isFinite(m.startSec) ? m.startSec : 0;
    apply((e) => setMusic(e, id, start, 0));
    void (async () => {
      if (!hosted) {
        try {
          const blob = await (await fetch(m.url)).blob();
          const type = blob.type || 'audio/mpeg';
          const ext = /wav/.test(type) ? 'wav' : /ogg/.test(type) ? 'ogg' : /mp4|m4a|aac/.test(type) ? 'm4a' : 'mp3';
          enqueueUpload(id, new File([blob], `${name}.${ext}`, { type }));
        } catch {
          patchSource(id, { status: 'error', error: t.failed, errorKind: 'fail' });
        }
      }
      const durationSec = await probeDuration(m.url, 'audio', 8000);
      if (durationSec > 0) patchSource(id, { durationSec });
    })();
  }, [initialMusic, apply, enqueueUpload, patchSource, t]);

  // ── Selection and the clip under the playhead ─────────────────────────────────────────────────────────
  const selected = selectedId ? edit.clips.find((c) => c.id === selectedId) ?? null : null;
  const selectedIndex = selected ? edit.clips.indexOf(selected) : -1;
  const selectedSrc = selected ? sources[selected.sourceId] : undefined;
  useEffect(() => { if (selectedId && !selected) setSelectedId(null); }, [selectedId, selected]);
  const clipUnderPlayhead = useCallback(() => {
    const at = clipAt(editRef.current.clips, timeRef.current);
    return at ? { clip: editRef.current.clips[at.index]!, ...at } : null;
  }, [timeRef]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setPanel((cur) => (cur === 'transition' || cur === 'text' || cur === 'duration' ? null : cur));
  }, []);

  const doSplit = useCallback(() => {
    pause();
    const at = clipUnderPlayhead();
    if (!at) return;
    const target = selected && selected.id !== at.clip.id ? null : at.clip;
    if (!target || !canSplit(target, at.local)) { flash(t.cantSplit); return; }
    if (editRef.current.clips.length >= MAX_SHOTS) { flash(t.tooMany); return; }
    // Computed HERE, not inside the state updater: the new clip's id is needed right away to select it, and an
    // updater runs later (and twice under Strict Mode, which would mint two different ids).
    const r = splitClip(editRef.current, target.id, at.local);
    if (!r.secondId) { flash(t.cantSplit); return; }
    lastStep.current = null;
    setHist((h) => commit(h, r.edit));
    setSelectedId(r.secondId);
  }, [clipUnderPlayhead, flash, pause, selected, t]);

  const doDelete = useCallback(() => {
    if (!selected) return;
    apply((e) => removeClip(e, selected.id));
    setSelectedId(null);
    setPanel(null);
  }, [apply, selected]);

  const openText = useCallback((clipId: string | null) => {
    const id = clipId ?? selected?.id ?? clipUnderPlayhead()?.clip.id ?? null;
    setPanelClipId(id);
    if (id) setSelectedId(id);
    setPanel('text');
  }, [clipUnderPlayhead, selected]);

  const openTransition = useCallback((clipId: string) => {
    pause();
    setPanelClipId(clipId);
    setPanel('transition');
  }, [pause]);

  // ── Export ─────────────────────────────────────────────────────────────────────────────────────────
  const claimInline = useJobQueue((s) => s.claimInline);
  const releaseInline = useJobQueue((s) => s.releaseInline);
  const claimed = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    // Set on EVERY mount: Strict Mode unmounts and remounts once in development, and a flag only ever cleared
    // would leave the editor believing it was gone — the finished render was then never shown.
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Closing mid-render HANDS the job to the tray instead of losing sight of it.
      if (claimed.current) releaseInline(claimed.current);
    };
  }, [releaseInline]);

  const runExport = useCallback(async () => {
    if (exportingRef.current || blockersOf(editRef.current, sourcesRef.current).length) return;
    exportingRef.current = true;
    pause();
    setSelectedId(null);
    setPanel(null);
    const clientJobId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : '';
    const body = buildRenderBody(editRef.current, sourcesRef.current);
    setExp({ phase: 'running', stage: null, pct: 3 });
    const stop = { done: false };
    if (clientJobId) {
      claimed.current = clientJobId;
      claimInline(clientJobId);
      void (async () => {
        while (!stop.done) {
          await new Promise((r) => setTimeout(r, 2500));
          if (stop.done || !mounted.current) return;
          const res = await fetch('/api/orchestrator/jobs?status=active&limit=20', { credentials: 'include' }).catch(() => null);
          const j = (await res?.json().catch(() => null)) as { jobs?: Array<Record<string, unknown>> } | null;
          const row = j?.jobs?.find((x) => x.id === clientJobId);
          if (!row || stop.done || !mounted.current) continue;
          const pct = Number(row.pct ?? 0);
          setExp((cur) => (cur?.phase === 'running'
            ? { phase: 'running', stage: String(row.current_stage ?? '') || cur.stage, pct: Number.isFinite(pct) && pct > cur.pct ? pct : cur.pct }
            : cur));
        }
      })();
    }
    try {
      const res = await fetch('/api/v2/montage/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(clientJobId ? { ...body, clientJobId } : body),
      });
      const j = (await res.json().catch(() => null)) as { videoUrl?: string; message?: string; step?: string; error?: string; warnings?: { musicRequestedButMissing?: boolean } } | null;
      if (res.ok && j?.videoUrl) {
        onDelivered?.(j.videoUrl, body.aspect as MontageAspect);
        if (mounted.current) {
          setExp({ phase: 'done', url: j.videoUrl, musicMissing: Boolean(j.warnings?.musicRequestedButMissing) });
          setExportedOnce(true);
        }
      } else if (mounted.current) {
        const message = res.status === 401 ? uploadErrorText('auth', locale) : describeServiceError(j?.message ?? j?.error ?? j?.step, lang, t.exportFailed);
        setExp({ phase: 'error', message });
      }
    } catch {
      if (mounted.current) setExp({ phase: 'error', message: t.exportFailed });
    } finally {
      stop.done = true;
      exportingRef.current = false;
      if (claimed.current) { releaseInline(claimed.current); claimed.current = null; }
    }
  }, [claimInline, lang, locale, onDelivered, pause, releaseInline, t]);

  // ── Voice: `myavatar:montage-command` (voiceCommands.ts) — export · set_music_start · state ──────────────────
  // The host object is rebuilt every render and read through a ref, so the one listener never holds a stale closure;
  // everything it reads is the refs, i.e. the edit as it is at the moment the event fires.
  const voiceHost = useRef<MontageCommandHost | null>(null);
  voiceHost.current = {
    edit: () => editRef.current,
    sources: () => sourcesRef.current,
    exporting: () => exportingRef.current,
    startExport: () => { void runExport(); },
    setMusicStart: (sec) => {
      const cur = editRef.current;
      const trackSec = (cur.musicId ? sourcesRef.current[cur.musicId]?.durationSec : 0) ?? 0;
      const next = setMusicStart(cur, sec, trackSec);
      if (next !== cur) {
        // Its own undo step — never folded into a slider drag that happened a moment ago.
        lastStep.current = null;
        setHist((h) => commit(h, setMusicStart(h.present, sec, trackSec)));
        editRef.current = next; // a second command in the same tick reads the start it just set
      }
      return next.musicStartSec;
    },
  };
  useEffect(() => listenForMontageCommands(() => voiceHost.current), []);

  // ── Leaving ────────────────────────────────────────────────────────────────────────────────────────
  const dirty = edit.clips.length > 0 && !exportedOnce;
  const requestExit = useCallback(() => {
    pause();
    if (dirty && exp?.phase !== 'running') setAskLeave(true);
    else onExit();
  }, [dirty, exp, onExit, pause]);

  // ── Keyboard (desktop): Space · ⌘Z / ⇧⌘Z · ⌘B split · Delete ────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (exp) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === ' ' && !mod && el?.tagName !== 'BUTTON') { e.preventDefault(); toggle(); return; }
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); setHist((h) => (e.shiftKey ? redo(h) : undo(h))); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); setHist(redo); return; }
      if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); doSplit(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); doDelete(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doDelete, doSplit, exp, selected, toggle]);

  const zoom = useCallback((f: number) => setPxPerSec((px) => Math.max(MIN_PX, Math.min(MAX_PX, px * f))), []);

  // ── Libraries (fetched only when a picker or the music panel is actually on screen) ──────────────────
  const visualLib = useLibrary('visual', empty || panel === 'media' || wide);
  const musicLib = useLibrary('music', panel === 'music');

  // ── Panels ─────────────────────────────────────────────────────────────────────────────────────────
  const closePanel = useCallback(() => setPanel(null), []);
  const panelClip = panelClipId ? edit.clips.find((c) => c.id === panelClipId) ?? null : null;
  const panelClipLabel = panelClip ? `${t.clipN} ${edit.clips.indexOf(panelClip) + 1}` : '';
  const posterFrame = (() => {
    const c = selected ?? edit.clips[player.clipIndex] ?? edit.clips[0];
    const s = c ? sources[c.sourceId] : undefined;
    if (!s) return null;
    return s.kind === 'image' ? s.previewUrl : thumbs[s.id]?.[0] ?? null;
  })();

  const panelBody = (() => {
    switch (panel) {
      case 'media':
        return (
          <div className="px-4 pb-4 pt-3" data-testid="montage-panel-media">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold">{t.addMedia}</h3>
              <button type="button" onClick={closePanel} aria-label={t.close} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-app-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <MediaPicker t={t} library={visualLib} onDevice={() => fileRef.current?.click()} onAdd={(it) => void addLibrary(it)} columns={desktop ? 3 : 4} />
          </div>
        );
      case 'music':
        return (
          <MusicPanel
            t={t}
            music={music}
            library={musicLib}
            originalSound={edit.originalSound}
            shorterThanEdit={!!music && music.durationSec > 0 && musicSpanSec(music.durationSec, edit.musicStartSec, total) + 0.5 < total}
            startSec={edit.musicStartSec}
            startMaxSec={musicStartMax(musicTrackSec)}
            editSec={total}
            peaks={music ? peaks[music.id] ?? [] : []}
            onStart={changeMusicStart}
            onUpload={() => musicFileRef.current?.click()}
            onPick={(it) => void addMusicLibrary(it)}
            onRemove={() => apply(removeMusic)}
            onToggleOriginal={() => apply((e) => ({ ...e, originalSound: !e.originalSound }))}
            onDone={closePanel}
          />
        );
      case 'text':
        return (
          <TextPanel
            t={t}
            hasClip={!!panelClip}
            clipLabel={panelClipLabel}
            text={panelClip?.caption ?? ''}
            pos={panelClip?.captionPos ?? 'bottom'}
            onText={(s) => panelClip && apply((e) => setCaption(e, panelClip.id, s), `caption:${panelClip.id}`)}
            onPos={(pos: MontageCaptionPos) => panelClip && apply((e) => setCaption(e, panelClip.id, panelClip.caption, pos))}
            onRemove={() => panelClip && apply((e) => setCaption(e, panelClip.id, ''))}
            onDone={closePanel}
          />
        );
      case 'filters':
        return (
          <FiltersPanel
            t={t}
            locale={locale}
            filterId={edit.filterId}
            poster={posterFrame}
            onPick={(id, grade) => apply((e) => ({ ...e, grade, filterId: id }))}
            onDone={closePanel}
          />
        );
      case 'adjust':
        return (
          <AdjustPanel
            t={t}
            grade={edit.grade}
            onChange={(g: MontageGrade) => apply((e) => ({ ...e, grade: g, filterId: 'custom' }), 'grade')}
            onReset={() => apply((e) => ({ ...e, grade: NEUTRAL_GRADE, filterId: 'original' }))}
            onDone={closePanel}
          />
        );
      case 'format':
        return <FormatPanel t={t} locale={locale} aspect={edit.aspect} onChange={(a: MontageAspect) => apply((e) => ({ ...e, aspect: a }))} onDone={closePanel} />;
      case 'transition':
        return panelClip ? (
          <TransitionPanel
            t={t}
            locale={locale}
            value={panelClip.transition}
            clipLabel={`${t.clipN} ${edit.clips.indexOf(panelClip)} → ${edit.clips.indexOf(panelClip) + 1}`}
            onChange={(v: MontageTransition) => apply((e) => setTransition(e, panelClip.id, v))}
            onApplyAll={() => apply((e) => setTransitionAll(e, panelClip.transition))}
            onDone={closePanel}
          />
        ) : null;
      case 'duration':
        return selected && selectedSrc?.kind === 'image' ? (
          <DurationPanel t={t} value={clipDuration(selected)} onChange={(v) => apply((e) => setPhotoDuration(e, selected.id, v), `dur:${selected.id}`)} onDone={closePanel} />
        ) : null;
      default:
        return null;
    }
  })();

  // ── Toolbars ───────────────────────────────────────────────────────────────────────────────────────
  const rootTools: Tool[] = [
    { id: 'edit', label: t.edit, Icon: Scissors, run: () => { pause(); const at = clipUnderPlayhead(); if (at) select(at.clip.id); } },
    { id: 'music', label: t.audio, Icon: Music2, run: () => setPanel('music') },
    { id: 'text', label: t.text, Icon: Type, run: () => openText(null) },
    { id: 'filters', label: t.filters, Icon: Palette, run: () => setPanel('filters') },
    { id: 'adjust', label: t.adjust, Icon: SlidersHorizontal, run: () => setPanel('adjust') },
    { id: 'format', label: t.format, Icon: Ratio, run: () => setPanel('format') },
  ];
  const clipTools: Tool[] = selected ? [
    ...(selectedSrc?.status === 'error' ? [{ id: 'retry', label: t.retry, Icon: RotateCcw, run: () => retryUpload(selectedSrc.id) }] : []),
    { id: 'split', label: t.split, Icon: Scissors, run: doSplit },
    { id: 'sound', label: selected.muted ? t.unmute : t.mute, Icon: selected.muted ? VolumeX : Volume2, run: () => apply((e) => toggleMute(e, selected.id)), disabled: selectedSrc?.kind === 'image' },
    { id: 'text', label: t.text, Icon: Type, run: () => openText(selected.id) },
    ...(selectedSrc?.kind === 'image' ? [{ id: 'duration', label: t.duration, Icon: Timer, run: () => setPanel('duration') as void }] : []),
    { id: 'duplicate', label: t.duplicate, Icon: CopyIcon, run: () => apply((e) => duplicateClip(e, selected.id)), disabled: edit.clips.length >= MAX_SHOTS },
    { id: 'left', label: t.moveLeft, Icon: ChevronLeft, run: () => apply((e) => moveClip(e, selected.id, -1)), disabled: selectedIndex <= 0 },
    { id: 'right', label: t.moveRight, Icon: ChevronRight, run: () => apply((e) => moveClip(e, selected.id, 1)), disabled: selectedIndex >= edit.clips.length - 1 },
    { id: 'delete', label: t.del, Icon: Trash2, run: doDelete },
  ] : [];


  const undoBtns = (
    <span className="flex items-center gap-0.5">
      <button type="button" onClick={() => setHist(undo)} disabled={!hist.past.length} aria-label={t.undo} data-testid="montage-undo" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-app-text hover:bg-app-elevated disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
        <Undo2 size={18} aria-hidden="true" />
      </button>
      <button type="button" onClick={() => setHist(redo)} disabled={!hist.future.length} aria-label={t.redo} data-testid="montage-redo" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-app-text hover:bg-app-elevated disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
        <Redo2 size={18} aria-hidden="true" />
      </button>
    </span>
  );

  const currentClip = playerClips[player.clipIndex] ?? null;
  const currentEditClip = edit.clips[player.clipIndex];
  const caption = currentEditClip && currentEditClip.caption.trim() ? { text: currentEditClip.caption, pos: currentEditClip.captionPos } : null;
  const exportBlocked = blockers.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col bg-black text-app-text" data-testid="montage-studio">
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="video/*,image/*,.mov,.mp4,.m4v,.webm,.heic"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="montage-file-input"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; void addFiles(fs); }}
      />
      <input
        ref={musicFileRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="montage-music-input"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addMusicFile(f); }}
      />

      {/* ── Header ── */}
      <header className="flex min-h-[56px] shrink-0 items-center gap-1 border-b border-app-border/10 px-2 sm:px-3" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <button type="button" onClick={requestExit} aria-label={t.close} data-testid="montage-close" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-app-text hover:bg-app-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
          <X size={20} aria-hidden="true" />
        </button>
        <h1 className="min-w-0 truncate text-[15px] font-semibold">{t.title}</h1>
        <span className="flex-1" />
        {!empty && !exp && (
          <button
            type="button"
            onClick={() => setPanel(panel === 'format' ? null : 'format')}
            aria-label={`${t.format}: ${edit.aspect}`}
            data-testid="montage-format-chip"
            className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-semibold tabular-nums text-app-text ring-1 ring-app-border/20 hover:ring-app-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
          >
            <Ratio size={14} aria-hidden="true" /> {edit.aspect}
          </button>
        )}
        {!exp && !empty && (
          <button
            type="button"
            onClick={() => void runExport()}
            disabled={exportBlocked}
            title={exportBlocked ? blockerText(blockers[0]!, t, authFailed) : `${t.export} · ${t.free}`}
            data-testid="montage-export-btn"
            className="ml-1 inline-flex h-9 items-center rounded-full bg-app-accent px-4 text-[13.5px] font-semibold text-black transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-40"
          >
            {t.export}
          </button>
        )}
      </header>

      {askLeave && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-app-border/10 bg-app-surface px-4 py-2" role="alertdialog" aria-label={t.leaveAsk} data-testid="montage-leave-ask">
          <p className="text-[13px]">{t.leaveAsk}</p>
          <span className="flex gap-1">
            <button type="button" onClick={() => setAskLeave(false)} className="min-h-[40px] rounded-full px-3 text-[13px] text-app-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">{t.stay}</button>
            <button type="button" onClick={onExit} data-testid="montage-leave-yes" className="min-h-[40px] rounded-full px-3 text-[13px] font-semibold text-app-text ring-1 ring-app-border/25 hover:ring-app-border/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">{t.leaveYes}</button>
          </span>
        </div>
      )}

      {/* A short status line while something holds the export back (uploads, a failed file) */}
      {!empty && !exp && exportBlocked && (
        <p className="flex shrink-0 items-center justify-center gap-1.5 px-4 py-1 text-[12px] text-app-muted" aria-live="polite" data-testid="montage-blocker">
          {(blockers[0]!.kind === 'uploading' || blockers[0]!.kind === 'musicUploading') && <Loader2 size={12} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
          {blockerText(blockers[0]!, t, authFailed)}
        </p>
      )}

      {exp ? (
        <ExportView
          t={t}
          locale={locale}
          aspect={edit.aspect}
          state={exp}
          onKeepEditing={() => setExp(null)}
          onBackToChat={onExit}
          onRetry={() => void runExport()}
        />
      ) : empty && seeding ? (
        // ── OPENING ON CLIPS IN A KNOWN FORMAT: nothing to choose, they are on their way ──
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-[13px] text-app-muted" role="status" data-testid="montage-opening">
          <Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> {t.opening}
        </div>
      ) : empty ? (
        // ── START: pick where it goes, then add footage ──
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="montage-start">
          <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-6">
            <h2 className="text-[22px] font-semibold leading-tight">{t.newProject}</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-app-muted">{t.startSub}</p>
            <h3 className="mb-2 mt-5 text-[12px] font-medium uppercase tracking-wide text-app-muted">{t.format}</h3>
            <AspectChoice locale={locale} value={edit.aspect} onChange={(a) => apply((e) => ({ ...e, aspect: a }))} label={t.format} size="lg" />
            <div className="mt-6">
              <MediaPicker t={t} library={visualLib} onDevice={() => fileRef.current?.click()} onAdd={(it) => void addLibrary(it)} columns={desktop ? 4 : 3} testId="montage-start-picker" />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Workspace ── */}
          <div className="flex min-h-0 flex-1">
            {wide && (
              <aside className="flex w-[268px] shrink-0 flex-col overflow-y-auto border-r border-app-border/10 p-3" aria-label={t.media} data-testid="montage-media-column">
                <MediaPicker t={t} library={visualLib} onDevice={() => fileRef.current?.click()} onAdd={(it) => void addLibrary(it)} columns={2} testId="montage-side-picker" />
              </aside>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1 px-3 pt-3">
                <Preview
                  aspect={edit.aspect}
                  grade={edit.grade}
                  clip={currentClip}
                  caption={caption}
                  videoA={player.videoA}
                  videoB={player.videoB}
                  activeSlot={player.activeSlot}
                  playing={player.playing}
                  onToggle={toggle}
                  playLabel={t.play}
                  pauseLabel={t.pause}
                />
                {toast && (
                  <p role="status" className="pointer-events-none absolute left-1/2 top-4 z-30 max-w-[86%] -translate-x-1/2 rounded-full bg-app-elevated/95 px-3.5 py-1.5 text-center text-[12.5px] text-app-text shadow-sm">
                    {toast}
                  </p>
                )}
                {music && <audio ref={player.audioRef} src={music.previewUrl} preload="auto" className="hidden" />}
              </div>
              {/* Transport */}
              <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-2 sm:px-3">
                <span ref={timeLabelRef} className="min-w-[96px] pl-1 text-[12.5px] tabular-nums text-app-muted" data-testid="montage-time">
                  {`${fmtTime(player.time)} / ${fmtTime(total)}`}
                </span>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={player.playing ? t.pause : t.play}
                  data-testid="montage-play"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-app-text hover:bg-app-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
                >
                  {player.playing ? <Pause size={22} aria-hidden="true" className="fill-current" /> : <Play size={22} aria-hidden="true" className="fill-current" />}
                </button>
                <span className="flex min-w-[96px] items-center justify-end">
                  {undoBtns}
                  {desktop && (
                    <>
                      <button type="button" onClick={() => zoom(1 / 1.25)} aria-label={t.zoomOut} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-app-muted hover:bg-app-elevated hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"><Minus size={16} aria-hidden="true" /></button>
                      <button type="button" onClick={() => zoom(1.25)} aria-label={t.zoomIn} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-app-muted hover:bg-app-elevated hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"><Plus size={16} aria-hidden="true" /></button>
                    </>
                  )}
                </span>
              </div>
            </div>
            {desktop && (
              <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-app-border/10" aria-label={t.tools} data-testid="montage-inspector">
                {panelBody ?? (
                  <div className="p-3">
                    {selected && (
                      <p className="mb-2 px-1 text-[12px] text-app-muted">
                        {t.clipN} {selectedIndex + 1} · {fmtSec(clipDuration(selected), t.sec)}
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-1" role="toolbar" aria-label={selected ? t.clipTools : t.tools}>
                      {(selected ? clipTools : rootTools.filter((r) => r.id !== 'edit')).map((tool) => (
                        <ToolButton key={tool.id} label={tool.label} Icon={tool.Icon} run={tool.run} disabled={tool.disabled} testId={`montage-tool-${tool.id}`} />
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            )}
          </div>

          {/* ── Timeline ── */}
          <div className="shrink-0 border-t border-app-border/10 bg-[#0a0a0c] pt-1.5">
            <Timeline
              ref={timelineRef}
              t={t}
              clips={edit.clips}
              placed={placed}
              totalSec={total}
              sources={sources}
              thumbs={thumbs}
              pxPerSec={pxPerSec}
              selectedId={selectedId}
              music={music ? { name: music.name, durationSec: music.durationSec, peaks: peaks[music.id] ?? [], status: music.status, startSec: edit.musicStartSec } : null}
              originalSound={edit.originalSound}
              compact={!desktop}
              onSeek={seek}
              onUserScrollStart={() => { if (player.playing) pause(); }}
              onSelect={select}
              onTrimBegin={() => {
                if (trimStart.current) return;
                pause();
                trimStart.current = editRef.current;
              }}
              onTrim={(id, edge, v) => setHist((h) => replacePresent(h, trimClip(h.present, id, edge, v, sourcesRef.current[h.present.clips.find((c) => c.id === id)?.sourceId ?? ''])))}
              onTrimEnd={() => {
                // ONE undo step per drag: the edit as it was when the finger went down. A tap that moved nothing adds none.
                const before = trimStart.current;
                trimStart.current = null;
                lastStep.current = null;
                if (before) setHist((h) => (h.present === before ? h : { past: [...h.past, before].slice(-HISTORY_CAP), present: h.present, future: [] }));
              }}
              onTransition={openTransition}
              onAddClip={() => { pause(); if (wide) fileRef.current?.click(); else setPanel('media'); }}
              onMusic={() => { pause(); setPanel('music'); }}
              onText={openText}
              onToggleOriginal={() => apply((e) => ({ ...e, originalSound: !e.originalSound }))}
              onZoom={zoom}
            />
          </div>

          {/* ── Phone: the drawer, or the toolbar ── */}
          {!desktop && (
            <div className="shrink-0 border-t border-app-border/10 bg-[#0a0a0c] pb-[env(safe-area-inset-bottom)]">
              {panelBody ? (
                <div className="max-h-[46vh] overflow-y-auto" data-testid="montage-drawer">{panelBody}</div>
              ) : (
                <div className="flex items-center gap-0.5 overflow-x-auto px-1.5 py-1 [scrollbar-width:none]" role="toolbar" aria-label={selected ? t.clipTools : t.tools} data-testid={selected ? 'montage-clip-toolbar' : 'montage-root-toolbar'}>
                  {selected && (
                    <button type="button" onClick={() => select(null)} aria-label={t.back} className="flex min-h-[56px] w-11 shrink-0 items-center justify-center rounded-xl text-app-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
                      <ChevronLeft size={22} aria-hidden="true" />
                    </button>
                  )}
                  {(selected ? clipTools : rootTools).map((tool) => (
                    <ToolButton key={tool.id} label={tool.label} Icon={tool.Icon} run={tool.run} disabled={tool.disabled} testId={`montage-tool-${tool.id}`} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
