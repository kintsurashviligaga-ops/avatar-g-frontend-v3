'use client';

/**
 * components/studio/MontageEditor.tsx — the Montage timeline, built like an editor rather than a form.
 *
 * WHAT WAS WRONG WITH THE FORM IT REPLACES: it asked for `https://…/clip.mp4` in a text field and for the
 * in/out points as bare numbers. A user has FILES, not URLs, and cannot know a clip's length before
 * trimming it. Every other service here offers visual presets and cards; this one offered arithmetic.
 *
 * WHAT MAKES THIS AN EDITOR:
 *  · drop files (or click) → uploaded browser-direct to storage, no typing and no 4.5MB body ceiling
 *  · the true duration is read off the decoded video, so the trim range has real bounds
 *  · each clip is a CARD with its own frame preview, a dual-handle trim range, mute and caption
 *  · transitions are pills BETWEEN cards, where the cut actually happens
 *  · a proportional timeline strip shows the edit, so shot lengths are visible rather than inferred
 *
 * Everything still funnels into the exact same MontageShot[] the API validates, so no server change.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/browser';
import { Chip, Row, IconButton, ToggleRow, Note, Hint, Label } from './ui/controls';
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
    notMedia: 'მხოლოდ ვიდეო ან ფოტო', pendingUpload: 'იტვირთება…',
    removeMusic: 'მუსიკის მოხსნა', musicOnlyHint: 'კადრების ორიგინალი ხმა ჩაიხშობა.',
    moveUp: 'ზემოთ', moveDown: 'ქვემოთ', removeShot: 'კადრის წაშლა',
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
    notMedia: 'Only video or photo files', pendingUpload: 'Uploading…',
    removeMusic: 'Remove music', musicOnlyHint: 'Mutes the original sound of every shot.',
    moveUp: 'Move up', moveDown: 'Move down', removeShot: 'Remove shot',
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
    notMedia: 'Только видео или фото', pendingUpload: 'Загрузка…',
    removeMusic: 'Убрать музыку', musicOnlyHint: 'Заглушает оригинальный звук всех кадров.',
    moveUp: 'Вверх', moveDown: 'Вниз', removeShot: 'Удалить кадр',
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
  // The CURRENT clip list, readable synchronously. `ingest` needs the live count to enforce MAX_SHOTS,
  // and reading it through a setState updater gave a stale answer (see the note on ingest).
  const clipsRef = useRef<EditorClip[]>(clips);
  useEffect(() => {
    clipsRef.current = clips;
    for (const c of clips) if (c.previewUrl) liveUrls.current.add(c.previewUrl);
  }, [clips]);
  useEffect(() => {
    const urls = liveUrls.current;
    return () => { for (const u of urls) URL.revokeObjectURL(u); };
  }, []);

  const patch = useCallback((uidKey: number, next: Partial<EditorClip>) => {
    setClips((cs) => cs.map((c) => (c.uid === uidKey ? { ...c, ...next } : c)));
  }, [setClips]);

  /**
   * Put one file in storage and return its object PATH.
   *
   * ⚠️ THE BUG THIS REPLACES — the reason adding a video "did nothing". The old version read the file
   * into a base64 data URL and POSTed it as JSON to /api/upload. A serverless function body is capped at
   * roughly 4.5 MB, so ANY real video — a few seconds off a phone camera is already 10–40 MB — was
   * rejected by the platform BEFORE the route ran (its own generous 60 MB check never got a say). The
   * response was not JSON, `j.url` was undefined, and the whole thing surfaced as one word: "Upload
   * failed". Photos usually squeaked under the cap, which is exactly why this looked like a video bug.
   *
   * The bytes now go browser → Supabase directly through a signed upload URL, so nothing but a tiny
   * handshake passes through the function and the size ceiling is storage's, not Vercel's. This is the
   * same transport the Surgical Editor and OmniStudio already use.
   *
   * Returns a discriminated result: the caller must be able to say WHY, and "sign in" and "too large"
   * are different sentences to a user staring at a file that will not attach.
   */
  const upload = useCallback(async (file: File): Promise<{ path: string } | { error: 'auth' | 'fail' }> => {
    try {
      const signRes = await fetch('/api/upload/sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ contentType: file.type || 'application/octet-stream' }),
      });
      if (signRes.status === 401) return { error: 'auth' };
      const sign = (await signRes.json().catch(() => ({}))) as { bucket?: string; path?: string; token?: string };
      if (!signRes.ok || !sign.path || !sign.token) return { error: 'fail' };
      const sb = createBrowserClient();
      const { error } = await sb.storage
        .from(sign.bucket || 'uploads')
        .uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type || 'application/octet-stream' });
      if (error) return { error: 'fail' };
      // The PATH, not a URL: the object cannot be signed for reading until its bytes have landed, so the
      // render route signs it server-side once it needs to fetch it.
      return { path: sign.path };
    } catch {
      return { error: 'fail' };
    }
  }, []);

  /**
   * Attach picked or dropped files.
   *
   * TWO THINGS THIS GETS RIGHT THAT THE OLD LOOP DID NOT:
   *
   * 1. THE CLIPS APPEAR IMMEDIATELY. Rows are inserted before a single byte is uploaded, then filled in
   *    as each upload lands. Previously a clip only entered the timeline AFTER its upload finished, and
   *    uploads ran strictly one after another — so picking six videos showed an empty editor for a long
   *    minute and looked exactly like a picker that had ignored the selection.
   *
   * 2. THE CAP IS COUNTED HONESTLY. The old code read the current length through `setClips(cs => {…})`,
   *    a state UPDATER — which React runs at render time, not on the spot — so the value it branched on
   *    was stale and the limit fired late or not at all. The live count comes from a ref now, and a file
   *    that does not fit is REPORTED rather than quietly discarded.
   */
  const ingest = useCallback(async (files: FileList | File[]) => {
    setUploadError(null);
    const all = [...files];
    const media = all.filter((f) => f.type.startsWith('video/') || f.type.startsWith('image/'));
    if (!media.length) { if (all.length) setUploadError(t.notMedia); return; }

    const room = Math.max(0, MAX_SHOTS - clipsRef.current.length);
    if (room === 0) { setUploadError(t.tooMany); return; }
    const accepted = media.slice(0, room);
    if (accepted.length < media.length) setUploadError(t.tooMany);

    // ── 1. Show them now. Probing is local and fast, so the row carries its real length from the start.
    const rows = await Promise.all(accepted.map(async (file) => {
      const isImage = file.type.startsWith('image/');
      const { sec, objectUrl } = await probeDuration(file, isImage);
      // A still gets the default beat; a clip opens fully trimmed-in but capped, so a 3-minute source
      // does not silently blow the whole montage budget on shot one.
      const end = isImage ? 3 : Math.min(sec > 0 ? sec : 5, MAX_SHOT_SEC);
      return {
        file,
        clip: newClip({
          url: '', kind: isImage ? 'image' : 'video', startSec: 0, endSec: end,
          muted: isImage, sourceSec: isImage ? 0 : sec, previewUrl: objectUrl,
        }),
      };
    }));
    setClips((cs) => [...cs, ...rows.map((r) => r.clip)]);

    // ── 2. Fill in the urls. Three at a time: a phone on mobile data chokes on six parallel uploads,
    //       and one at a time is the wait that made this feel broken.
    setUploading((n) => n + rows.length);
    let next = 0;
    let failed = 0;
    let authBlocked = false;
    await Promise.all(Array.from({ length: Math.min(3, rows.length) }, async () => {
      for (;;) {
        const i = next++;
        const row = rows[i];
        if (i >= rows.length || !row) return;
        const res = await upload(row.file);
        if ('error' in res) {
          if (res.error === 'auth') authBlocked = true; else failed += 1;
          // A row that will never render is removed rather than left as a silent blank in the timeline.
          setClips((cs) => cs.filter((c) => c.uid !== row.clip.uid));
          URL.revokeObjectURL(row.clip.previewUrl ?? '');
        } else {
          setClips((cs) => cs.map((c) => (c.uid === row.clip.uid ? { ...c, url: res.path } : c)));
        }
        setUploading((n) => n - 1);
      }
    }));
    if (authBlocked) setUploadError(t.authNeeded);
    else if (failed) setUploadError(`${t.uploadFailed} (${failed}/${rows.length})`);
  }, [setClips, upload, t]);

  const total = timelineDuration(clips);
  const over = total > MAX_TOTAL_SEC;
  const filled = clips.filter((c) => c.url);

  // The local `pill` (26px tall) and `iconBtn` (28px) are gone: both were under the 44px tap floor and
  // both had drifted from the same controls in every other panel. See components/studio/ui/tokens.

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
                <Chip key={tr.id} active={c.transition === tr.id} onClick={() => patch(c.uid, { transition: tr.id })}>
                  <span aria-hidden>{tr.glyph}</span> {t[tr.key]}
                </Chip>
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
                {/* The row exists from the moment the file is picked, so its bytes may still be in
                    flight. Saying so beats an identical-looking card that quietly cannot render. */}
                {!c.url && (
                  <span className="absolute inset-x-0 bottom-0 bg-app-bg/85 px-1 py-0.5 text-center text-[8.5px] font-medium text-app-accent">
                    {t.pendingUpload}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-1">
                  <span className="flex-1 truncate text-[11px] text-app-muted">
                    {shotDuration(c).toFixed(1)}s{c.sourceSec > 0 && ` / ${c.sourceSec.toFixed(1)}s`}
                  </span>
                  {c.kind === 'video' && (
                    <IconButton label={t.mute} onClick={() => patch(c.uid, { muted: !c.muted })}
                      className={c.muted ? '' : 'border-app-accent/40 text-app-accent'}>
                      {c.muted ? '🔇' : '🔊'}
                    </IconButton>
                  )}
                  <IconButton label={t.moveUp} onClick={() => setClips((cs) => {
                    const j = i - 1; if (j < 0) return cs;
                    const out = [...cs]; const a = out[i]; const b = out[j];
                    if (!a || !b) return cs; out[i] = b; out[j] = a; return out;
                  })} disabled={i === 0}>↑</IconButton>
                  <IconButton label={t.moveDown} onClick={() => setClips((cs) => {
                    const j = i + 1; if (j >= cs.length) return cs;
                    const out = [...cs]; const a = out[i]; const b = out[j];
                    if (!a || !b) return cs; out[i] = b; out[j] = a; return out;
                  })} disabled={i === clips.length - 1}>↓</IconButton>
                  <IconButton label={t.removeShot} onClick={() => setClips((cs) => cs.filter((x) => x.uid !== c.uid))}
                    disabled={clips.length <= MIN_SHOTS}>✕</IconButton>
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
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void ingest(Array.from(e.dataTransfer.files)); }}
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
      {/* Array.from BEFORE the reset: `e.target.files` is a LIVE FileList and `value = ''` empties it,
          so handing the list straight to `ingest` passed an already-emptied collection — the picker
          opened, files were chosen, and nothing at all happened. */}
      <input
        ref={fileRef} type="file" accept="video/*,image/*" multiple className="hidden"
        onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.currentTarget.value = ''; if (picked.length) void ingest(picked); }}
      />
      {uploadError && <Note tone="error">{uploadError}</Note>}
      {filled.length < MIN_SHOTS && !uploading && (
        <div className="text-center"><Hint>{t.empty}</Hint></div>
      )}

      {/* ── FORMAT + MUSIC — visual presets, matching the other services ──────────────────────────── */}
      <div className="min-w-0">
        <Label>{t.aspect}</Label>
        <Row>
          {ASPECTS.map((a) => (
            <Chip key={a.id} active={aspect === a.id} onClick={() => setAspect(a.id)}>
              <span style={{ width: a.w, height: a.h }} className="rounded-sm border border-current" aria-hidden />
              {a.id}
            </Chip>
          ))}
        </Row>
      </div>

      <Row>
        <Chip active={!!musicUrl} onClick={() => musicRef.current?.click()}>
          🎵 {musicUrl ? t.music : t.addMusic}
        </Chip>
        <input
          ref={musicRef} type="file" accept="audio/*" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]; e.currentTarget.value = '';
            if (!f) return;
            setUploading((n) => n + 1);
            try {
              const r = await upload(f);
              if ('path' in r) setMusicUrl(r.path);
              else setUploadError(r.error === 'auth' ? t.authNeeded : t.uploadFailed);
            } finally { setUploading((n) => n - 1); }
          }}
        />
        {onOpenFullEditor && (
          <Chip active onClick={onOpenFullEditor}>{t.fullEditor}</Chip>
        )}
        {musicUrl && <IconButton label={t.removeMusic} onClick={() => setMusicUrl('')}>✕</IconButton>}
      </Row>

      {/* Only meaningful once a bed exists, so it appears with it — a switch, not a 13px native
          checkbox that no other control in the app resembles. */}
      {musicUrl && <ToggleRow on={musicOnly} onChange={setMusicOnly} label={t.musicOnly} hint={t.musicOnlyHint} />}
    </div>
  );
}
