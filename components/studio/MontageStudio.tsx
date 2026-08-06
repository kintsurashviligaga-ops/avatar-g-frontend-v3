'use client';

/**
 * components/studio/MontageStudio.tsx — the Montage surface.
 *
 * A REAL ROUTE, not a hash target. ServiceHub switches surface only on `hashchange`, and the sidebar
 * navigates with `router.push` — which fires neither `hashchange` nor `popstate` for a same-path hash
 * change — so a hash-based montage tile could not switch surface without a manual reload.
 *
 * The render is synchronous and can occupy a lambda for minutes, so the UI states that plainly rather
 * than showing a spinner that looks hung.
 *
 * i18n follows the studio-tree convention: a module-level COPY table, not a translation hook.
 */
import { useMemo, useState, useEffect } from 'react';
import { creditsUpdated } from '@/lib/billing/creditsUpdated';
import {
  MAX_SHOTS,
  MIN_SHOTS,
  MAX_TOTAL_SEC,
  timelineDuration,
  type MontageAspect,
  type MontageShot,
  type MontageTransition,
} from '@/lib/services/montage/montagePlan';
import {
  Row, Grid, Label, Field, Select, ToggleRow, PrimaryButton, SecondaryButton, IconButton,
  Note, Hint, Dropzone,
} from './ui/controls';
import { FIELD } from './ui/tokens';
import { ResultActions } from './ui/ResultActions';
import { GenerationProgress } from './ui/GenerationProgress';
import { useUpload } from './ui/useUpload';

type Lang = 'ka' | 'en' | 'ru';

const COPY = {
  ka: {
    title: 'მონტაჟის სტუდია',
    subtitle: 'რამდენიმე კადრი — ერთ დამონტაჟებულ ვიდეოდ',
    addVideo: '+ ვიდეო',
    addImage: '+ ფოტო',
    shot: 'კადრი',
    url: 'ბმული',
    from: 'დან',
    to: 'მდე',
    transition: 'გადასვლა',
    cut: 'მკვეთრი',
    crossfade: 'გადადნობა',
    fade: 'შავში',
    caption: 'წარწერა',
    mute: 'ხმის გარეშე',
    moveUp: 'ზემოთ', moveDown: 'ქვემოთ', removeShot: 'კადრის წაშლა',
    remove: 'წაშლა',
    up: 'აწევა',
    down: 'ჩამოწევა',
    aspect: 'ფორმატი',
    music: 'ფონური მუსიკა (არჩევითი)',
    picked: 'ფაილი არჩეულია', pick: 'აირჩიე ფაილი', pickHint: 'ან ჩასვი ბმული ქვემოთ',
    musicOnly: 'მხოლოდ მუსიკა (კადრების ხმის გარეშე)',
    total: 'ხანგრძლივობა',
    submit: 'მონტაჟის დაწყება',
    working: 'მიმდინარეობს…',
    warn: 'მონტაჟს რამდენიმე წუთი სჭირდება. არ დახუროთ ეს გვერდი.',
    needShots: `საჭიროა მინიმუმ ${MIN_SHOTS} კადრი`,
    tooLong: `მაქსიმუმ ${MAX_TOTAL_SEC} წამი`,
    maxShots: `მაქსიმუმ ${MAX_SHOTS} კადრი`,
    done: 'მზადაა',
    failed: 'მონტაჟი ვერ შესრულდა',
    noMusic: 'მუსიკა ვერ დაედო — ვიდეო მზადაა მის გარეშე',
  },
  en: {
    title: 'Montage Studio',
    subtitle: 'Several shots, cut into one edited video',
    addVideo: '+ Video',
    addImage: '+ Photo',
    shot: 'Shot',
    url: 'URL',
    from: 'From',
    to: 'To',
    transition: 'Transition',
    cut: 'Cut',
    crossfade: 'Crossfade',
    fade: 'Through black',
    caption: 'Caption',
    mute: 'Mute',
    moveUp: 'Move up', moveDown: 'Move down', removeShot: 'Remove shot',
    remove: 'Remove',
    up: 'Up',
    down: 'Down',
    aspect: 'Aspect',
    music: 'Music bed (optional)',
    picked: 'File selected', pick: 'Choose a file', pickHint: 'or paste a link below',
    musicOnly: 'Music only (drop clip audio)',
    total: 'Duration',
    submit: 'Start montage',
    working: 'Editing…',
    warn: 'This takes a few minutes. Keep this tab open.',
    needShots: `At least ${MIN_SHOTS} shots`,
    tooLong: `${MAX_TOTAL_SEC}s maximum`,
    maxShots: `${MAX_SHOTS} shots maximum`,
    done: 'Ready',
    failed: 'Montage failed',
    noMusic: 'The music bed could not be added — the video is ready without it',
  },
  ru: {
    title: 'Студия монтажа',
    subtitle: 'Несколько кадров — в одно смонтированное видео',
    addVideo: '+ Видео',
    addImage: '+ Фото',
    shot: 'Кадр',
    url: 'Ссылка',
    from: 'От',
    to: 'До',
    transition: 'Переход',
    cut: 'Резкий',
    crossfade: 'Наплыв',
    fade: 'Через чёрное',
    caption: 'Подпись',
    mute: 'Без звука',
    moveUp: 'Вверх', moveDown: 'Вниз', removeShot: 'Удалить кадр',
    remove: 'Удалить',
    up: 'Вверх',
    down: 'Вниз',
    aspect: 'Формат',
    music: 'Фоновая музыка (необязательно)',
    picked: 'Файл выбран', pick: 'Выберите файл', pickHint: 'или вставьте ссылку ниже',
    musicOnly: 'Только музыка (без звука кадров)',
    total: 'Длительность',
    submit: 'Начать монтаж',
    working: 'Монтируем…',
    warn: 'Это займёт несколько минут. Не закрывайте вкладку.',
    needShots: `Минимум ${MIN_SHOTS} кадра`,
    tooLong: `Максимум ${MAX_TOTAL_SEC} секунд`,
    maxShots: `Максимум ${MAX_SHOTS} кадров`,
    done: 'Готово',
    failed: 'Монтаж не удался',
    noMusic: 'Музыку добавить не удалось — видео готово без неё',
  },
} satisfies Record<Lang, Record<string, string>>;

const ASPECTS: MontageAspect[] = ['16:9', '9:16', '1:1'];

interface Result {
  videoUrl: string;
  durationSec: number;
  shots: number;
  warnings?: { musicRequestedButMissing?: boolean };
}

let uid = 0;
type Row = MontageShot & { key: number };

const newRow = (kind: 'video' | 'image'): Row => ({
  key: (uid += 1),
  url: '',
  kind,
  startSec: 0,
  endSec: kind === 'image' ? 3 : 5,
  muted: kind === 'image',
  transition: 'cut',
});

export function MontageStudio({ locale }: { locale: string }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [rows, setRows] = useState<Row[]>(() => [newRow('video'), newRow('video')]);
  const [aspect, setAspect] = useState<MontageAspect>('16:9');
  const [musicUrl, setMusicUrl] = useState('');
  const [musicOnly, setMusicOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const { upload: uploadFile, busy: uploading, error: uploadError } = useUpload(locale);
  // ⚠️ A 1px INDETERMINATE BAR IS NOT PROGRESS. This render is measured in MINUTES, and against that a
  // bar with one static label is indistinguishable from a hang — so the reasonable response, reload or
  // press it again, either loses the render or pays for a second one. The shared card shows the stage,
  // the elapsed clock and a realistic remaining estimate, the same as every other service.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 500);
    return () => window.clearInterval(id);
  }, [busy]);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Reuses the SAME pure function the server bills and encodes against, so the number shown here is the
  // number ffmpeg will produce — not an approximation that drifts from it.
  const total = useMemo(() => timelineDuration(rows), [rows]);

  const filled = rows.filter((r) => r.url.trim());
  const canSubmit = !busy && filled.length >= MIN_SHOTS && filled.length === rows.length && total <= MAX_TOTAL_SEC;

  function patch(key: number, next: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...next } : r)));
  }

  function move(key: number, dir: -1 | 1) {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= rs.length) return rs;
      const out = [...rs];
      const a = out[i];
      const b = out[j];
      if (!a || !b) return rs;
      out[i] = b;
      out[j] = a;
      return out;
    });
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v2/montage/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Strip the client-only React key before it reaches the validator.
          shots: rows.map(({ key: _key, ...shot }) => shot),
          aspect,
          ...(musicUrl.trim() ? { musicUrl: musicUrl.trim() } : {}),
          musicOnly,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError([t.failed, j?.step, j?.message].filter(Boolean).join(' · '));
        return;
      }
      creditsUpdated(); // the montage rendered and billed — refresh the header pill
      setResult(j as Result);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="min-h-screen bg-app-surface px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-semibold text-app-text">{t.title}</h1>
        <p className="mt-1 text-sm text-app-muted">{t.subtitle}</p>

        <div className="mt-8 space-y-4">
          {rows.map((row, i) => (
            <div key={row.key} className="rounded-2xl border border-app-border/15 bg-app-elevated/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-app-text">
                  {t.shot} {i + 1} · {row.kind === 'image' ? '🖼' : '🎬'}
                </span>
                <div className="flex gap-1">
                  <IconButton label={t.moveUp} onClick={() => move(row.key, -1)} disabled={i === 0}>↑</IconButton>
                  <IconButton label={t.moveDown} onClick={() => move(row.key, 1)} disabled={i === rows.length - 1}>↓</IconButton>
                  <IconButton
                    label={t.removeShot}
                    onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                    disabled={rows.length <= MIN_SHOTS}
                  >
                    ✕
                  </IconButton>
                </div>
              </div>

              {/* ⚠️ EVERY ROW ASKED FOR A TYPED https URL, AND A MONTAGE IS MADE OF THE USER'S OWN
                  FOOTAGE — which lives in a camera roll, not on a server they control. On a phone this
                  studio could not be used at all, while the in-chat panel drove the same route with a
                  real picker. The URL field stays for a link to something already online; both write the
                  same row. */}
              <Dropzone
                id={`mtg-${row.key}`}
                accept={row.kind === 'image' ? 'image/*' : 'video/*'}
                disabled={busy || uploading}
                filled={Boolean(row.url)}
                title={row.url ? t.picked : t.pick}
                hint={t.pickHint}
                onFiles={(files) => {
                  const f = files[0];
                  if (!f) return;
                  void (async () => { const path = await uploadFile(f); if (path) patch(row.key, { url: path }); })();
                }}
              />
              <input
                type="url"
                value={row.url}
                onChange={(e) => patch(row.key, { url: e.target.value })}
                placeholder={`https://…/${row.kind === 'image' ? 'photo.jpg' : 'clip.mp4'}`}
                className={FIELD}
              />

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {row.kind === 'video' && (
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-app-muted">{t.from}</span>
                    <input
                      type="number" min={0} step={0.1} value={row.startSec}
                      onChange={(e) => patch(row.key, { startSec: Math.max(0, Number(e.target.value) || 0) })}
                      className={FIELD}
                    />
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-[11px] text-app-muted">{row.kind === 'image' ? t.total : t.to}</span>
                  <input
                    type="number" min={0.4} step={0.1}
                    value={row.kind === 'image' ? row.endSec - row.startSec : row.endSec}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      patch(row.key, row.kind === 'image' ? { startSec: 0, endSec: Math.max(0.4, v) } : { endSec: v });
                    }}
                    className={FIELD}
                  />
                </label>
                {i > 0 && (
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-app-muted">{t.transition}</span>
                    <Select
                      value={row.transition}
                      onChange={(e) => patch(row.key, { transition: e.target.value as MontageTransition })}
                    >
                      <option value="cut">{t.cut}</option>
                      <option value="crossfade">{t.crossfade}</option>
                      <option value="fade">{t.fade}</option>
                    </Select>
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-[11px] text-app-muted">{t.caption}</span>
                  <input
                    type="text" value={row.caption ?? ''} maxLength={120}
                    onChange={(e) => patch(row.key, { caption: e.target.value })}
                    className={FIELD}
                  />
                </label>
              </div>

              {row.kind === 'video' && (
                <div className="mt-2">
                  <ToggleRow on={row.muted} onChange={(v) => patch(row.key, { muted: v })} label={t.mute} />
                </div>
              )}
            </div>
          ))}

          <Row>
            <SecondaryButton onClick={() => setRows((rs) => [...rs, newRow('video')])} disabled={rows.length >= MAX_SHOTS}>
              {t.addVideo}
            </SecondaryButton>
            <SecondaryButton onClick={() => setRows((rs) => [...rs, newRow('image')])} disabled={rows.length >= MAX_SHOTS}>
              {t.addImage}
            </SecondaryButton>
            {rows.length >= MAX_SHOTS && <Hint>{t.maxShots}</Hint>}
          </Row>
        </div>

        <div className="mt-6 space-y-4 rounded-2xl border border-app-border/15 bg-app-elevated/40 p-5">
          <Grid cols={2}>
            <div className="min-w-0">
              <Label>{t.aspect}</Label>
              <Select value={aspect} onChange={(e) => setAspect(e.target.value as MontageAspect)}>
                {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </div>
            <div className="flex min-w-0 items-end pb-1 text-[11px] text-app-muted">
              {t.total}: <span className={`ml-1 font-semibold ${total > MAX_TOTAL_SEC ? 'text-red-400' : 'text-app-text'}`}>{total.toFixed(1)}s</span>
              {total > MAX_TOTAL_SEC && <span className="ml-2 text-red-400">{t.tooLong}</span>}
            </div>
          </Grid>

          <div className="min-w-0">
            <Label>{t.music}</Label>
            <Dropzone
              id="mtg-music"
              accept="audio/*"
              disabled={busy || uploading}
              filled={Boolean(musicUrl)}
              title={musicUrl ? t.picked : t.pick}
              hint={t.pickHint}
              onFiles={(files) => {
                const f = files[0];
                if (!f) return;
                void (async () => { const path = await uploadFile(f); if (path) setMusicUrl(path); })();
              }}
            />
            <Field type="url" inputMode="url" value={musicUrl} onChange={(e) => setMusicUrl(e.target.value)} placeholder="https://…/track.mp3" />
          </div>
          {musicUrl.trim() && <ToggleRow on={musicOnly} onChange={setMusicOnly} label={t.musicOnly} />}

          <PrimaryButton onClick={submit} loading={busy} full disabled={!canSubmit}>
            {busy ? t.working : t.submit}
          </PrimaryButton>
          {busy && (
            <>
              <GenerationProgress kind="montage" elapsed={elapsed} locale={(locale === 'en' || locale === 'ru' ? locale : 'ka')} />
              <p className="text-center text-[11px] text-app-muted">{t.warn}</p>
            </>
          )}
          {!busy && filled.length !== rows.length && <div className="text-center"><Hint>{t.needShots}</Hint></div>}
          {/* ⚠️ A FAILURE WAS A DEAD END. The error rendered alone, with no control beside it, so the user
              had to work out for themselves that the primary button doubles as the retry and that their
              inputs had survived. Everything the run needs is still in component state, so retrying is
              one call — it just was never offered. */}
          {/* An upload failure is its own thing — the render never started, so it must not be dressed
              up as a failed montage with a retry beside it. useUpload already localizes this. */}
          {uploadError && <Note tone="error">{uploadError}</Note>}
          {error && (
            <div className="space-y-2">
              <Note tone="error">{error}</Note>
              <SecondaryButton onClick={submit} disabled={busy}>
                {locale === 'en' ? 'Try again' : locale === 'ru' ? 'Попробовать снова' : 'ხელახლა ცდა'}
              </SecondaryButton>
            </div>
          )}
        </div>

        {result && (
          <div className="mt-6 space-y-3 rounded-2xl border border-app-border/15 bg-app-elevated/40 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-app-text">{t.done}</span>
              <span className="text-xs text-app-muted">{result.shots} · {result.durationSec.toFixed(1)}s</span>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={result.videoUrl} controls className="w-full rounded-xl" />
            {/* ⚠️ WAS `<a href={url} download>`, WHICH DOES NOT DOWNLOAD. A browser ignores the `download`
            attribute on a CROSS-ORIGIN href, and every one of these is a signed storage link — so the tap
            navigated away from the app to the raw file instead of saving it. ResultActions fetches the
            bytes into a Blob, offers the iOS share sheet (the only route to Photos), and files the asset
            into the Library, which several services never did server-side. */}
            <ResultActions url={result.videoUrl} kind="film" locale={(locale === 'en' || locale === 'ru' ? locale : 'ka')} />
            {result.warnings?.musicRequestedButMissing && (
              <p className="text-xs text-amber-400">{t.noMusic}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
