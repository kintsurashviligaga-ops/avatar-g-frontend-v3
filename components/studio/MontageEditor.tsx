'use client';

/**
 * components/studio/MontageEditor.tsx — the Montage timeline, built like an editor rather than a form.
 *
 * WHAT WAS WRONG WITH THE FORM IT REPLACES: it asked for `https://…/clip.mp4` in a text field and for the
 * in/out points as bare numbers. A user has FILES, not URLs, and cannot know a clip's length before
 * trimming it. Every other service here offers visual presets and cards; this one offered arithmetic.
 *
 * WHAT MAKES THIS AN EDITOR:
 *  · drop files (or click) → uploaded through /api/upload → real hosted url, no typing
 *  · the true duration is read off the decoded video, so the trim range has real bounds
 *  · each clip is a CARD with its own frame preview, a dual-handle trim range, mute and caption
 *  · transitions are pills BETWEEN cards, where the cut actually happens
 *  · a proportional timeline strip shows the edit, so shot lengths are visible rather than inferred
 *
 * Everything still funnels into the exact same MontageShot[] the API validates, so no server change.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_SHOTS,
  MIN_SHOTS,
  MAX_SHOT_SEC,
  MIN_SHOT_SEC,
  MAX_TOTAL_SEC,
  timelineDuration,
  shotDuration,
  type MontageAspect,
  type MontageShot,
  type MontageTransition,
} from '@/lib/services/montage/montagePlan';

type Lang = 'ka' | 'en' | 'ru';

const COPY = {
  ka: {
    drop: 'დაამატე ვიდეო ან ფოტო', or: 'შეეხე ასარჩევად', browse: 'ან ჩააგდე ფაილი',
    uploading: 'იტვირთება…', uploadFailed: 'ატვირთვა ვერ მოხერხდა', authNeeded: 'ჯერ შედი სისტემაში',
    empty: 'დაამატე მინიმუმ ორი კადრი',
    trim: 'მოჭრა', caption: 'წარწერა', captionPh: 'ტექსტი კადრზე…',
    cut: 'მკვეთრი', crossfade: 'გადადნობა', fade: 'შავში',
    total: 'ჯამი', tooLong: 'ლიმიტი გადაცილებულია',
    aspect: 'ფორმატი', music: 'ფონური მუსიკა', musicOnly: 'მხოლოდ მუსიკა',
    addMusic: '+ მუსიკა', mute: 'ხმა', tooMany: 'მაქსიმუმ ' + MAX_SHOTS + ' კადრი',
    fullEditor: 'სრული რედაქტორი →',
  },
  en: {
    drop: 'Add a video or photo', or: 'Tap to choose', browse: 'or drop a file here',
    uploading: 'Uploading…', uploadFailed: 'Upload failed', authNeeded: 'Sign in first',
    empty: 'Add at least two shots',
    trim: 'Trim', caption: 'Caption', captionPh: 'Text on this shot…',
    cut: 'Cut', crossfade: 'Crossfade', fade: 'Through black',
    total: 'Total', tooLong: 'Over the limit',
    aspect: 'Aspect', music: 'Background music', musicOnly: 'Music only',
    addMusic: '+ Music', mute: 'Sound', tooMany: `Maximum ${MAX_SHOTS} shots`,
    fullEditor: 'Full editor →',
  },
  ru: {
    drop: 'Добавьте видео или фото', or: 'Нажмите, чтобы выбрать', browse: 'или перетащите файл',
    uploading: 'Загрузка…', uploadFailed: 'Не удалось загрузить', authNeeded: 'Сначала войдите',
    empty: 'Добавьте минимум два кадра',
    trim: 'Обрезка', caption: 'Подпись', captionPh: 'Текст на кадре…',
    cut: 'Резкий', crossfade: 'Наплыв', fade: 'Через чёрное',
    total: 'Итого', tooLong: 'Превышен лимит',
    aspect: 'Формат', music: 'Фоновая музыка', musicOnly: 'Только музыка',
    addMusic: '+ Музыка', mute: 'Звук', tooMany: `Максимум ${MAX_SHOTS} кадров`,
    fullEditor: 'Полный редактор →',
  },
} satisfies Record<Lang, Record<string, string>>;

/** A shot plus the client-only bits: a stable key and the source's true length. */
export interface EditorClip extends MontageShot {
  uid: number;
  /** Real duration read off the decoded media. 0 until known. */
  sourceSec: number;
  /** Local object URL for the preview, so the card shows a frame instead of a filename. */
  previewUrl?: string;
}

let uid = 0;
export const newClip = (over: Partial<EditorClip> = {}): EditorClip => ({
  uid: (uid += 1), url: '', kind: 'video', startSec: 0, endSec: 5, muted: false, transition: 'cut',
  sourceSec: 0, ...over,
});

/** Read a media file's true duration in the browser, so the trim range has real bounds. */
function probeDuration(file: File, isImage: boolean): Promise<{ sec: number; objectUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  if (isImage) return Promise.resolve({ sec: 0, objectUrl });
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    // Never hang the UI on a file the browser cannot decode.
    const done = (sec: number) => resolve({ sec: Number.isFinite(sec) && sec > 0 ? sec : 0, objectUrl });
    v.onloadedmetadata = () => done(v.duration);
    v.onerror = () => done(0);
    setTimeout(() => done(v.duration), 4000);
    v.src = objectUrl;
  });
}

const ASPECTS: Array<{ id: MontageAspect; w: number; h: number }> = [
  { id: '16:9', w: 22, h: 13 },
  { id: '9:16', w: 13, h: 22 },
  { id: '1:1', w: 18, h: 18 },
];

const TRANSITIONS: Array<{ id: MontageTransition; glyph: string; key: 'cut' | 'crossfade' | 'fade' }> = [
  { id: 'cut', glyph: '⎸', key: 'cut' },
  { id: 'crossfade', glyph: '⧓', key: 'crossfade' },
  { id: 'fade', glyph: '◐', key: 'fade' },
];

export function MontageEditor({
  locale,
  clips,
  setClips,
  aspect,
  setAspect,
  musicUrl,
  setMusicUrl,
  musicOnly,
  setMusicOnly,
  onOpenFullEditor,
}: {
  locale: string;
  clips: EditorClip[];
  setClips: (fn: (c: EditorClip[]) => EditorClip[]) => void;
  aspect: MontageAspect;
  setAspect: (a: MontageAspect) => void;
  musicUrl: string;
  setMusicUrl: (u: string) => void;
  musicOnly: boolean;
  setMusicOnly: (v: boolean) => void;
  /** Escalate into the full-screen clip editor (crop/grade/audio). */
  onOpenFullEditor?: () => void;
}) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const musicRef = useRef<HTMLInputElement>(null);

  // Object URLs leak if they outlive the component — but the cleanup must run ONLY on unmount. Keying
  // it on `clips` would revoke previews on every edit, blanking the thumbnails of clips still on screen,
  // so the live set is tracked in a ref and released once at the end.
  const liveUrls = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const c of clips) if (c.previewUrl) liveUrls.current.add(c.previewUrl);
  }, [clips]);
  useEffect(() => {
    const urls = liveUrls.current;
    return () => { for (const u of urls) URL.revokeObjectURL(u); };
  }, []);

  const patch = useCallback((uidKey: number, next: Partial<EditorClip>) => {
    setClips((cs) => cs.map((c) => (c.uid === uidKey ? { ...c, ...next } : c)));
  }, [setClips]);

  const upload = useCallback(async (file: File): Promise<string | null> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('read'));
      r.readAsDataURL(file);
    });
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, contentType: file.type }),
      credentials: 'include',
    });
    // /api/upload is auth-gated. A 401 surfaced as a generic failure would send the user hunting for a
    // problem with their file, so it gets its own message.
    if (res.status === 401) { setUploadError(t.authNeeded); return null; }
    const j = (await res.json().catch(() => ({}))) as { url?: string };
    return j.url?.startsWith('https://') ? j.url : null;
  }, [t]);

  const ingest = useCallback(async (files: FileList | File[]) => {
    setUploadError(null);
    const list = [...files].filter((f) => f.type.startsWith('video/') || f.type.startsWith('image/'));
    for (const file of list) {
      let overflow = false;
      setClips((cs) => { overflow = cs.length >= MAX_SHOTS; return cs; });
      if (overflow) { setUploadError(t.tooMany); break; }

      const isImage = file.type.startsWith('image/');
      setUploading((n) => n + 1);
      try {
        const { sec, objectUrl } = await probeDuration(file, isImage);
        const url = await upload(file);
        if (!url) { URL.revokeObjectURL(objectUrl); setUploadError((e) => e ?? t.uploadFailed); continue; }
        // A still gets the default beat; a clip opens fully trimmed-in but capped, so a 3-minute source
        // does not silently blow the whole montage budget on shot one.
        const end = isImage ? 3 : Math.min(sec > 0 ? sec : 5, MAX_SHOT_SEC);
        setClips((cs) => [...cs, newClip({
          url, kind: isImage ? 'image' : 'video', startSec: 0, endSec: end,
          muted: isImage, sourceSec: isImage ? 0 : sec, previewUrl: objectUrl,
        })]);
      } catch {
        setUploadError(t.uploadFailed);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }, [setClips, upload, t]);

  const total = timelineDuration(clips);
  const over = total > MAX_TOTAL_SEC;
  const filled = clips.filter((c) => c.url);

  const pill = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors';
  const iconBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-full border border-app-border/20 text-app-muted transition hover:border-app-accent/50 hover:text-app-accent active:scale-90 disabled:opacity-25';

  return (
    <div className="space-y-3">
      {/* ── TIMELINE STRIP — the edit at a glance. Widths are proportional to real shot length, so a
             three-second shot next to a fifteen-second one is visibly that. ───────────────────────── */}
      {filled.length > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium text-app-muted">{t.total}</span>
            <span className={`text-[11px] font-semibold ${over ? 'text-red-400' : 'text-app-text'}`}>
              {total.toFixed(1)}s {over && `· ${t.tooLong}`}
            </span>
          </div>
          <div className="flex h-8 gap-0.5 overflow-hidden rounded-lg bg-app-bg/40 p-0.5">
            {clips.map((c) => {
              const share = total > 0 ? (shotDuration(c) / total) * 100 : 100 / Math.max(1, clips.length);
              return (
                <div
                  key={c.uid}
                  style={{ width: `${Math.max(4, share)}%` }}
                  className="relative flex items-center justify-center overflow-hidden rounded bg-app-accent/25 text-[9px] font-semibold text-app-text"
                  title={`${shotDuration(c).toFixed(1)}s`}
                >
                  {c.kind === 'image' ? '🖼' : ''}{shotDuration(c).toFixed(1)}s
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CLIP CARDS ────────────────────────────────────────────────────────────────────────────── */}
      {clips.map((c, i) => (
        <div key={c.uid}>
          {/* Transitions live BETWEEN cards, which is where the cut happens. The first shot has no
              predecessor, so it has no transition row at all. */}
          {i > 0 && (
            <div className="my-1 flex items-center gap-1.5 pl-2">
              <span className="h-px flex-1 bg-app-border/15" />
              {TRANSITIONS.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => patch(c.uid, { transition: tr.id })}
                  className={`${pill} ${c.transition === tr.id
                    ? 'border-app-accent/60 bg-app-accent/15 text-app-accent'
                    : 'border-app-border/20 text-app-muted hover:border-app-accent/40'}`}
                >
                  <span aria-hidden>{tr.glyph}</span> {t[tr.key]}
                </button>
              ))}
              <span className="h-px flex-1 bg-app-border/15" />
            </div>
          )}

          <div className="rounded-xl border border-app-border/15 bg-app-elevated/50 p-2">
            <div className="flex gap-2.5">
              {/* Frame preview — a card, not a filename. */}
              <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-app-bg/60">
                {c.previewUrl && c.kind === 'video' && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={c.previewUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                )}
                {c.previewUrl && c.kind === 'image' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.previewUrl} alt="" className="h-full w-full object-cover" />
                )}
                <span className="absolute left-1 top-1 rounded bg-app-bg/80 px-1 text-[9px] font-bold text-app-accent">
                  {i + 1}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-1">
                  <span className="flex-1 truncate text-[11px] text-app-muted">
                    {shotDuration(c).toFixed(1)}s{c.sourceSec > 0 && ` / ${c.sourceSec.toFixed(1)}s`}
                  </span>
                  {c.kind === 'video' && (
                    <button type="button" onClick={() => patch(c.uid, { muted: !c.muted })}
                      title={t.mute} className={`${iconBtn} ${c.muted ? '' : 'text-app-accent border-app-accent/40'}`}>
                      {c.muted ? '🔇' : '🔊'}
                    </button>
                  )}
                  <button type="button" onClick={() => setClips((cs) => {
                    const j = i - 1; if (j < 0) return cs;
                    const out = [...cs]; const a = out[i]; const b = out[j];
                    if (!a || !b) return cs; out[i] = b; out[j] = a; return out;
                  })} disabled={i === 0} className={iconBtn}>↑</button>
                  <button type="button" onClick={() => setClips((cs) => {
                    const j = i + 1; if (j >= cs.length) return cs;
                    const out = [...cs]; const a = out[i]; const b = out[j];
                    if (!a || !b) return cs; out[i] = b; out[j] = a; return out;
                  })} disabled={i === clips.length - 1} className={iconBtn}>↓</button>
                  <button type="button" onClick={() => setClips((cs) => cs.filter((x) => x.uid !== c.uid))}
                    disabled={clips.length <= MIN_SHOTS} className={iconBtn}>✕</button>
                </div>

                {/* TRIM — sliders bounded by the clip's REAL length, which is only knowable because the
                    duration was probed on ingest. Numbers alone gave no sense of what was being cut. */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-[10px] text-app-muted">{t.trim}</span>
                    <input
                      type="range" min={0} max={Math.max(0.1, (c.sourceSec || MAX_SHOT_SEC) - MIN_SHOT_SEC)} step={0.1}
                      value={c.startSec}
                      onChange={(e) => {
                        const s = Number(e.target.value);
                        patch(c.uid, { startSec: s, endSec: Math.max(s + MIN_SHOT_SEC, c.endSec) });
                      }}
                      className="h-1 flex-1 accent-app-accent"
                      disabled={c.kind === 'image'}
                    />
                    <input
                      type="range" min={MIN_SHOT_SEC} max={c.sourceSec || MAX_SHOT_SEC} step={0.1}
                      value={c.endSec}
                      onChange={(e) => {
                        const en = Number(e.target.value);
                        patch(c.uid, { endSec: en, startSec: Math.min(c.startSec, en - MIN_SHOT_SEC) });
                      }}
                      className="h-1 flex-1 accent-app-accent"
                    />
                  </div>
                  <input
                    type="text" maxLength={120} value={c.caption ?? ''}
                    onChange={(e) => patch(c.uid, { caption: e.target.value })}
                    placeholder={t.captionPh}
                    className="w-full rounded-lg border border-app-border/15 bg-app-bg/40 px-2 py-1 text-[11px] !text-app-text outline-none focus:border-app-accent/50"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* ── DROP ZONE ─────────────────────────────────────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void ingest(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center transition-colors ${
          dragOver ? 'border-app-accent bg-app-accent/10' : 'border-app-border/25 hover:border-app-accent/50'
        }`}
      >
        <span className="text-[18px]" aria-hidden>⬆</span>
        <span className="text-[12px] font-medium text-app-text">
          {uploading > 0 ? `${t.uploading} (${uploading})` : t.drop}
        </span>
        <span className="text-[10px] text-app-muted">{t.or} · {t.browse}</span>
      </div>
      {/* The input is a SIBLING, never a child of the clickable zone. Nested, `fileRef.click()` fires a
          click that BUBBLES back into the zone's own onClick and calls click() again — re-entrancy that
          iOS Safari resolves by cancelling the picker outright, which is why choosing a file did nothing
          on a phone. */}
      <input
        ref={fileRef} type="file" accept="video/*,image/*" multiple className="hidden"
        onChange={(e) => { const f = e.target.files; e.currentTarget.value = ''; if (f) void ingest(f); }}
      />
      {uploadError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-400">{uploadError}</p>
      )}
      {filled.length < MIN_SHOTS && !uploading && (
        <p className="text-center text-[11px] text-app-muted">{t.empty}</p>
      )}

      {/* ── FORMAT + MUSIC — visual presets, matching the other services ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-medium text-app-muted">{t.aspect}</span>
        {ASPECTS.map((a) => (
          <button
            key={a.id} type="button" onClick={() => setAspect(a.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] transition-colors ${
              aspect === a.id ? 'border-app-accent/60 bg-app-accent/10 text-app-accent' : 'border-app-border/20 text-app-muted hover:border-app-accent/40'
            }`}
          >
            <span style={{ width: a.w, height: a.h }} className="rounded-sm border border-current" aria-hidden />
            {a.id}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => musicRef.current?.click()}
          className={`${pill} border-app-border/20 text-app-muted hover:border-app-accent/40`}>
          🎵 {musicUrl ? t.music : t.addMusic}
        </button>
        <input
          ref={musicRef} type="file" accept="audio/*" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]; e.currentTarget.value = '';
            if (!f) return;
            setUploading((n) => n + 1);
            try { const u = await upload(f); if (u) setMusicUrl(u); else setUploadError((x) => x ?? t.uploadFailed); }
            finally { setUploading((n) => n - 1); }
          }}
        />
        {onOpenFullEditor && (
          <button type="button" onClick={onOpenFullEditor}
            className={`${pill} ml-auto border-app-accent/40 text-app-accent hover:bg-app-accent/10`}>
            {t.fullEditor}
          </button>
        )}
        {musicUrl && (
          <>
            <button type="button" onClick={() => setMusicUrl('')} className={iconBtn}>✕</button>
            <label className="flex items-center gap-1.5 text-[11px] text-app-text">
              <input type="checkbox" checked={musicOnly} onChange={(e) => setMusicOnly(e.target.checked)} />
              {t.musicOnly}
            </label>
          </>
        )}
      </div>
    </div>
  );
}
