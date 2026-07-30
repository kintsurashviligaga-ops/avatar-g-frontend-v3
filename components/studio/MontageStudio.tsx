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
import { useMemo, useState } from 'react';
import {
  MAX_SHOTS,
  MIN_SHOTS,
  MAX_TOTAL_SEC,
  timelineDuration,
  type MontageAspect,
  type MontageShot,
  type MontageTransition,
} from '@/lib/services/montage/montagePlan';

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
    remove: 'წაშლა',
    up: 'აწევა',
    down: 'ჩამოწევა',
    aspect: 'ფორმატი',
    music: 'ფონური მუსიკა (არჩევითი)',
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
    remove: 'Remove',
    up: 'Up',
    down: 'Down',
    aspect: 'Aspect',
    music: 'Music bed (optional)',
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
    remove: 'Удалить',
    up: 'Вверх',
    down: 'Вниз',
    aspect: 'Формат',
    music: 'Фоновая музыка (необязательно)',
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
      setResult(j as Result);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-lg bg-app-elevated border border-app-border/15 px-2.5 py-2 text-sm !text-app-text outline-none focus:border-app-accent/50 transition-colors';
  const chip = 'rounded-lg border border-app-border/15 px-2.5 py-1 text-xs text-app-muted hover:text-app-text hover:border-app-accent/40 transition-colors disabled:opacity-30';

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
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => move(row.key, -1)} disabled={i === 0} className={chip}>↑</button>
                  <button type="button" onClick={() => move(row.key, 1)} disabled={i === rows.length - 1} className={chip}>↓</button>
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                    disabled={rows.length <= MIN_SHOTS}
                    className={chip}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <input
                type="url"
                value={row.url}
                onChange={(e) => patch(row.key, { url: e.target.value })}
                placeholder={`https://…/${row.kind === 'image' ? 'photo.jpg' : 'clip.mp4'}`}
                className={field}
              />

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {row.kind === 'video' && (
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-app-muted">{t.from}</span>
                    <input
                      type="number" min={0} step={0.1} value={row.startSec}
                      onChange={(e) => patch(row.key, { startSec: Math.max(0, Number(e.target.value) || 0) })}
                      className={field}
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
                    className={field}
                  />
                </label>
                {i > 0 && (
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-app-muted">{t.transition}</span>
                    <select
                      value={row.transition}
                      onChange={(e) => patch(row.key, { transition: e.target.value as MontageTransition })}
                      className={field}
                    >
                      <option value="cut">{t.cut}</option>
                      <option value="crossfade">{t.crossfade}</option>
                      <option value="fade">{t.fade}</option>
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-[11px] text-app-muted">{t.caption}</span>
                  <input
                    type="text" value={row.caption ?? ''} maxLength={120}
                    onChange={(e) => patch(row.key, { caption: e.target.value })}
                    className={field}
                  />
                </label>
              </div>

              {row.kind === 'video' && (
                <label className="mt-3 flex items-center gap-2 text-xs text-app-text">
                  <input type="checkbox" checked={row.muted} onChange={(e) => patch(row.key, { muted: e.target.checked })} />
                  {t.mute}
                </label>
              )}
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setRows((rs) => [...rs, newRow('video')])} disabled={rows.length >= MAX_SHOTS} className={chip}>
              {t.addVideo}
            </button>
            <button type="button" onClick={() => setRows((rs) => [...rs, newRow('image')])} disabled={rows.length >= MAX_SHOTS} className={chip}>
              {t.addImage}
            </button>
            {rows.length >= MAX_SHOTS && <span className="self-center text-xs text-app-muted">{t.maxShots}</span>}
          </div>
        </div>

        <div className="mt-6 space-y-4 rounded-2xl border border-app-border/15 bg-app-elevated/40 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.aspect}</span>
              <select value={aspect} onChange={(e) => setAspect(e.target.value as MontageAspect)} className={field}>
                {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <div className="text-xs text-app-muted">
              {t.total}: <span className={total > MAX_TOTAL_SEC ? 'text-red-400' : 'text-app-text'}>{total.toFixed(1)}s</span>
              {total > MAX_TOTAL_SEC && <span className="ml-2 text-red-400">{t.tooLong}</span>}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.music}</span>
            <input type="url" value={musicUrl} onChange={(e) => setMusicUrl(e.target.value)} placeholder="https://…/track.mp3" className={field} />
          </label>
          {musicUrl.trim() && (
            <label className="flex items-center gap-2 text-sm text-app-text">
              <input type="checkbox" checked={musicOnly} onChange={(e) => setMusicOnly(e.target.checked)} />
              {t.musicOnly}
            </label>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="w-full rounded-xl bg-app-accent px-4 py-3 text-sm font-semibold text-app-bg transition-opacity disabled:opacity-40"
          >
            {busy ? t.working : t.submit}
          </button>
          {busy && <p className="text-center text-xs text-app-muted">{t.warn}</p>}
          {!busy && filled.length !== rows.length && <p className="text-center text-xs text-app-muted">{t.needShots}</p>}
          {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
        </div>

        {result && (
          <div className="mt-6 space-y-3 rounded-2xl border border-app-border/15 bg-app-elevated/40 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-app-text">{t.done}</span>
              <span className="text-xs text-app-muted">{result.shots} · {result.durationSec.toFixed(1)}s</span>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={result.videoUrl} controls className="w-full rounded-xl" />
            <a href={result.videoUrl} download className="inline-block text-xs text-app-accent hover:underline">MP4</a>
            {result.warnings?.musicRequestedButMissing && (
              <p className="text-xs text-amber-400">{t.noMusic}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
