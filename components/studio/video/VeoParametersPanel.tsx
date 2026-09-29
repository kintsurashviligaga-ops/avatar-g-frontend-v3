'use client';

/**
 * The video tool's Google Veo controls (docs/VEO_ENGINE.md §2) — every control here maps to something Veo or the
 * edit actually does, and nothing else is offered:
 *
 *   Scenes & camera  one card per 8 s clip: camera move · shot size · angle · lens · speed, compiled into the
 *                    clip's prompt as cinematographer's language (Veo 3.x has no documented camera parameter), and
 *                    the JOIN to the next scene — a cut / crossfade / dissolve / fade through black made in the
 *                    edit, because Veo has no transition parameter at all
 *   Identity         how the photos condition Veo: the storyboard frame each clip animates FROM (instances.image),
 *                    or up to 3 asset references Veo keeps the person from (instances.referenceImages)
 *   Sound            Veo's own audio (dialogue, effects, ambience) — switchable on Vertex AI only
 *   Advanced         negative prompt · one seed for every scene · Google's prompt rewriting (Vertex only)
 *
 * Format, length and quality live in the panel's Essentials card; the words of each scene in the scene slots.
 * State is lib/video/veoPlan — this component only renders it and dispatches.
 */
import { useEffect, useState } from 'react';
import { CAMERA_ANGLES, CAMERA_MOVES, LENS_LOOKS, SHOT_SIZES, type CinematographyOption } from '@/lib/veo/cinematography';
import type { CameraSpec, Transition } from '@/lib/veo/types';
import { hasCustomCamera, planNotices, type VeoPlan, type VeoPlanAction } from '@/lib/video/veoPlan';
import { Chip, Disclosure, Hint, Note, Select, TextArea, ToggleRow } from '../ui/controls';

type Locale = 'ka' | 'en' | 'ru';

/** GET /api/video/engine — what the live Veo route honours. */
export interface VeoEngineInfo {
  transport: 'vertex' | 'gemini' | null;
  googleOnly: boolean;
  audioToggle: boolean;
  enhancePrompt: boolean;
  nativeCameraControl: boolean;
}

/** Read once per mount; null until it answers (the panel then assumes the Gemini API — the stricter contract). */
export function useVeoEngineInfo(): VeoEngineInfo | null {
  const [info, setInfo] = useState<VeoEngineInfo | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/video/engine', { credentials: 'include', signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (j && typeof j === 'object' && 'transport' in j) setInfo(j as VeoEngineInfo);
      })
      .catch(() => { /* offline / aborted → keep the conservative default */ });
    return () => ac.abort();
  }, []);
  return info;
}

const tr = (locale: Locale, ka: string, en: string, ru: string): string => (locale === 'en' ? en : locale === 'ru' ? ru : ka);
/** cinematography options carry ka + en; Russian reads the English term (they are film-craft terms). */
const optLabel = <T extends string>(o: CinematographyOption<T>, locale: Locale): string => (locale === 'ka' ? o.ka : o.en);

const TRANSITIONS: ReadonlyArray<{ id: Transition; glyph: string; ka: string; en: string; ru: string }> = [
  { id: 'cut', glyph: '▮', ka: 'ჭრა', en: 'Cut', ru: 'Склейка' },
  { id: 'crossfade', glyph: '⤫', ka: 'გადადნობა', en: 'Crossfade', ru: 'Наплыв' },
  { id: 'dissolve', glyph: '◈', ka: 'დაშლა', en: 'Dissolve', ru: 'Растворение' },
  { id: 'fade_black', glyph: '◐', ka: 'შავში', en: 'Fade to black', ru: 'В затемнение' },
];

/** A move with no motion has no speed to set. */
const hasSpeed = (move: CameraSpec['move']) => move !== 'auto' && move !== 'static';

function CameraFields({ camera, onChange, locale, idPrefix }: {
  camera: CameraSpec;
  onChange: (patch: Partial<CameraSpec>) => void;
  locale: Locale;
  idPrefix: string;
}) {
  const fields: Array<{ key: 'move' | 'shot' | 'angle' | 'lens'; label: string; options: readonly CinematographyOption<string>[] }> = [
    { key: 'move', label: tr(locale, 'მოძრაობა', 'Move', 'Движение'), options: CAMERA_MOVES },
    { key: 'shot', label: tr(locale, 'კადრი', 'Shot', 'План'), options: SHOT_SIZES },
    { key: 'angle', label: tr(locale, 'რაკურსი', 'Angle', 'Ракурс'), options: CAMERA_ANGLES },
    { key: 'lens', label: tr(locale, 'ობიექტივი', 'Lens', 'Объектив'), options: LENS_LOOKS },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f) => (
          <label key={f.key} htmlFor={`${idPrefix}-${f.key}`} className="min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-app-muted">{f.label}</span>
            <Select id={`${idPrefix}-${f.key}`} value={camera[f.key]}
              onChange={(e) => onChange({ [f.key]: e.target.value } as Partial<CameraSpec>)}>
              {f.options.map((o) => <option key={o.id} value={o.id}>{optLabel(o, locale)}</option>)}
            </Select>
          </label>
        ))}
      </div>
      {hasSpeed(camera.move) && (
        <label className="flex min-h-[44px] items-center gap-2">
          <span className="whitespace-nowrap text-[11px] text-app-muted">{tr(locale, 'სიჩქარე', 'Speed', 'Скорость')}</span>
          <input type="range" min={1} max={10} step={1} value={camera.intensity}
            onChange={(e) => onChange({ intensity: Number(e.target.value) })}
            className="h-1.5 flex-1 cursor-pointer accent-app-accent" aria-label={tr(locale, 'კამერის სიჩქარე', 'Camera speed', 'Скорость камеры')} />
          <span className="w-9 text-right text-[10.5px] tabular-nums text-app-text">{camera.intensity}/10</span>
        </label>
      )}
    </div>
  );
}

/** `value` null = the joins differ, so no single chip is "the" choice. */
function TransitionChips({ value, onChange, locale }: { value: Transition | null; onChange: (t: Transition) => void; locale: Locale }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TRANSITIONS.map((t) => (
        <Chip key={t.id} active={value === t.id} onClick={() => onChange(t.id)}>
          <span aria-hidden className="mr-1">{t.glyph}</span>{tr(locale, t.ka, t.en, t.ru)}
        </Chip>
      ))}
    </div>
  );
}

/** "Push in · Close-up" — the part of a camera the user actually set, for a closed card's readout. */
function cameraSummary(camera: CameraSpec, locale: Locale): string {
  const parts: string[] = [];
  const pick = <T extends string>(list: readonly CinematographyOption<T>[], id: T) => {
    if (id === 'auto') return;
    const o = list.find((x) => x.id === id);
    if (o) parts.push(optLabel(o, locale));
  };
  pick(CAMERA_MOVES, camera.move);
  pick(SHOT_SIZES, camera.shot);
  pick(CAMERA_ANGLES, camera.angle);
  pick(LENS_LOOKS, camera.lens);
  return parts.join(' · ');
}

export interface VeoParametersPanelProps {
  plan: VeoPlan;
  dispatch: (action: VeoPlanAction) => void;
  locale: Locale;
  engine: VeoEngineInfo | null;
  /** The words of each scene (the scene slots above), shown on its card so the camera is set against the action. */
  sceneTexts: readonly string[];
  /** Mirror of the whole-film transition for the legacy stitch field (renderFilm's `transition`). */
  onTransitionAll?: (t: Transition) => void;
}

export function VeoParametersPanel({ plan, dispatch, locale, engine, sceneTexts, onTransitionAll }: VeoParametersPanelProps) {
  const audioToggle = engine?.audioToggle ?? false;
  const notices = planNotices(plan, { audioToggle });
  const scenes = plan.scenes;
  const customCamera = hasCustomCamera(plan);
  const joins = scenes.slice(0, -1).map((s) => s.transitionOut);
  const mixedJoins = new Set(joins).size > 1;
  const setTransitionAll = (t: Transition) => {
    dispatch({ type: 'transitionAll', transition: t });
    onTransitionAll?.(t);
  };
  const notice = (id: string) => notices.find((n) => n.id === id);
  const txt = (n: { ka: string; en: string; ru: string }) => tr(locale, n.ka, n.en, n.ru);
  const joinLabel = mixedJoins
    ? tr(locale, 'შერეული', 'mixed', 'разные')
    : (() => { const t = TRANSITIONS.find((x) => x.id === joins[0]); return t ? txt(t) : ''; })();
  const scenesSummary = [
    `${scenes.length} × 8${tr(locale, 'წმ', 's', 'с')}`,
    customCamera ? `${tr(locale, 'კამერა', 'camera', 'камера')} ✓` : '',
    scenes.length > 1 ? joinLabel : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-2" data-testid="veo-parameters">
      {notice('cropped') && <Note tone="info">{txt(notice('cropped')!)}</Note>}

      {/* ── SCENES & CAMERA ─────────────────────────────────────────────────────────────────────────── */}
      <Disclosure
        label={tr(locale, 'სცენები და კამერა', 'Scenes & camera', 'Сцены и камера')}
        summary={scenesSummary}
      >
        <Hint>{tr(locale,
          'კამერა კლიპის აღწერაში კინოოპერატორის ენით ჩაიწერება — Veo-ს ცალკე კამერის პარამეტრი არ აქვს. ავტომატური = რეჟისორი თავად ირჩევს.',
          'The camera is written into each clip as a cinematographer would say it — Veo has no separate camera parameter. Auto = the director chooses.',
          'Камера вписывается в описание клипа языком оператора — отдельного параметра камеры у Veo нет. Авто = выбирает режиссёр.')}</Hint>

        {scenes.length > 1 && (
          <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-bg/30 p-2.5">
            <span className="block text-[12px] font-semibold text-app-text">{tr(locale, 'ყველა სცენა', 'All scenes', 'Все сцены')}</span>
            <CameraFields idPrefix="veo-all" locale={locale} camera={plan.cameraDefault}
              onChange={(patch) => dispatch({ type: 'cameraAll', camera: patch })} />
            <span className="block pt-1 text-[11px] font-medium text-app-muted">{tr(locale, 'გადასვლა სცენებს შორის', 'Between scenes', 'Между сценами')}</span>
            <TransitionChips locale={locale} value={mixedJoins ? null : (joins[0] ?? plan.transitionDefault)} onChange={setTransitionAll} />
          </div>
        )}

        <ol className="space-y-2">
          {scenes.map((s, i) => {
            const words = (sceneTexts[i] ?? '').trim();
            const summary = cameraSummary(s.camera, locale);
            return (
              <li key={s.id} className="space-y-2">
                <div className="space-y-2 rounded-xl border border-app-border/15 bg-app-elevated/30 p-2.5">
                  <div className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="shrink-0 text-[12px] font-semibold text-app-text">{tr(locale, 'სცენა', 'Scene', 'Сцена')} {i + 1}</span>
                    {summary && <span className="min-w-0 truncate text-[10.5px] text-app-accent">{summary}</span>}
                  </div>
                  <p className="line-clamp-2 text-[11px] leading-snug text-app-muted">
                    {words || tr(locale, 'მოქმედებას რეჟისორი დაწერს ბრიფის მიხედვით.', 'The director writes the action from your brief.', 'Действие напишет режиссёр по брифу.')}
                  </p>
                  <CameraFields idPrefix={`veo-s${i}`} locale={locale} camera={s.camera}
                    onChange={(patch) => dispatch({ type: 'sceneCamera', index: i, camera: patch })} />
                </div>
                {i < scenes.length - 1 && (
                  <div className="flex min-w-0 flex-col gap-1 pl-3">
                    <span className="text-[10.5px] text-app-muted">{tr(locale, `სცენა ${i + 1} → ${i + 2}`, `Scene ${i + 1} → ${i + 2}`, `Сцена ${i + 1} → ${i + 2}`)}</span>
                    <TransitionChips locale={locale} value={s.transitionOut}
                      onChange={(t) => dispatch({ type: 'sceneTransition', index: i, transition: t })} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {scenes.length > 1 && (
          <Hint>{tr(locale,
            'ჭრა ფილმის სიგრძეს ზუსტად ინარჩუნებს; რბილი გადასვლა ყოველ შეერთებაზე ~1 წამს იკლებს.',
            'A cut keeps the film its exact length; each soft transition overlaps the clips by about a second.',
            'Склейка сохраняет точную длину; каждый мягкий переход съедает около секунды.')}</Hint>
        )}
      </Disclosure>

      {/* ── IDENTITY ────────────────────────────────────────────────────────────────────────────────── */}
      <Disclosure
        label={tr(locale, 'პერსონაჟის შენარჩუნება', 'Keeping the person', 'Сохранение персонажа')}
        summary={plan.referenceMode === 'reference' ? tr(locale, 'რეფერენსი', 'Reference', 'Референс') : tr(locale, 'პირველი კადრი', 'First frame', 'Первый кадр')}
      >
        <div className="grid grid-cols-1 gap-1.5">
          {([
            ['first_frame', tr(locale, 'პირველი კადრიდან', 'From the first frame', 'С первого кадра'),
              tr(locale, 'ყოველი კლიპი დამტკიცებული სტორიბორდის კადრიდან იწყება — კომპოზიცია ზუსტად ისეა, როგორც ნახე.', 'Each clip animates from its approved storyboard frame — the composition is exactly what you saw.', 'Каждый клип оживляет утверждённый кадр раскадровки — композиция ровно как на превью.')],
            ['reference', tr(locale, 'რეფერენს-ფოტოებით', 'From reference photos', 'По фото-референсам'),
              tr(locale, 'მაქს. 3 ფოტო — Veo ყოველ სცენას თავად აწყობს და ადამიანს ინარჩუნებს. 8 წმ კლიპები; „ეკონომზე“ მიუწვდომელია.', 'Up to 3 photos — Veo composes each scene itself and keeps the person. 8 s clips; not on Economy.', 'До 3 фото — Veo сам строит сцену и сохраняет человека. Клипы 8 с; не на «Эконом».')],
          ] as const).map(([id, label, sub]) => {
            const on = plan.referenceMode === id;
            return (
              <button key={id} type="button" aria-pressed={on} onClick={() => dispatch({ type: 'referenceMode', mode: id })}
                className={`flex min-h-[44px] min-w-0 flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition active:scale-[0.99] ${on ? 'border-app-accent/60 bg-app-accent/15 ring-1 ring-app-accent/30' : 'border-app-border/20 bg-app-bg/40 hover:bg-app-bg/60'}`}>
                <span className={`text-[12.5px] font-semibold ${on ? 'text-app-accent' : 'text-app-text'}`}>{label}</span>
                <span className="text-[10.5px] leading-snug text-app-muted">{sub}</span>
              </button>
            );
          })}
        </div>
        {notice('reference-no-frames') && <Note tone="info">{txt(notice('reference-no-frames')!)}</Note>}
      </Disclosure>

      {/* ── SOUND ───────────────────────────────────────────────────────────────────────────────────── */}
      <Disclosure
        label={tr(locale, 'Veo-ს ხმა', "Veo's sound", 'Звук Veo')}
        summary={plan.nativeAudio ? tr(locale, 'ჩართ.', 'On', 'Вкл') : tr(locale, 'გამორთ.', 'Off', 'Выкл')}
      >
        <ToggleRow on={plan.nativeAudio} onChange={(on) => dispatch({ type: 'nativeAudio', on })}
          label={tr(locale, 'Veo-მ თავად შექმნას ხმა', 'Veo renders its own sound', 'Veo создаёт свой звук')}
          hint={tr(locale, 'დიალოგი, ეფექტები, გარემოს ხმა — კლიპშივე. გამორთვა = მხოლოდ ვიდეო (იაფია), ხმას მონტაჟი დაადებს.', 'Dialogue, effects and ambience in the clip itself. Off = video only (cheaper); the edit adds the sound.', 'Диалог, эффекты и атмосфера прямо в клипе. Выкл = только видео (дешевле), звук добавит монтаж.')} />
        {notice('audio-fixed') && <Note tone="warn">{txt(notice('audio-fixed')!)}</Note>}
      </Disclosure>

      {/* ── ADVANCED ────────────────────────────────────────────────────────────────────────────────── */}
      <Disclosure
        label={tr(locale, 'დამატებითი', 'Advanced', 'Дополнительно')}
        badge={(plan.negativePrompt.trim() ? 1 : 0) + (plan.seedLock ? 0 : 1) + (plan.enhancePrompt ? 1 : 0) || undefined}
      >
        <label htmlFor="veo-negative" className="block min-w-0">
          <span className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium text-app-muted">{tr(locale, 'რა არ უნდა ჩანდეს', 'Keep out of the frame', 'Чего не должно быть в кадре')}</span>
            <span className="text-[10px] tabular-nums text-app-muted/60">{plan.negativePrompt.length}/800</span>
          </span>
          <TextArea id="veo-negative" rows={2} maxLength={800} value={plan.negativePrompt}
            onChange={(e) => dispatch({ type: 'negative', text: e.target.value })}
            placeholder={tr(locale, 'ტექსტი, წყლის ნიშანი, ზედმეტი თითები', 'text, watermark, extra fingers', 'текст, водяной знак, лишние пальцы')} />
        </label>
        <Hint>{tr(locale, 'ჩამოთვალე საგნები — „არა“-ს გარეშე.', 'List the things themselves — without “no”.', 'Перечислите сами предметы — без «не».')}</Hint>
        <ToggleRow on={plan.seedLock} onChange={(on) => dispatch({ type: 'seedLock', on })}
          label={tr(locale, 'ერთი seed ყველა სცენაზე', 'One seed for every scene', 'Один seed на все сцены')}
          hint={tr(locale, 'სცენებს შორის სტილი და პერსონაჟი უფრო მდგრადია.', 'Holds the look and the character steadier from scene to scene.', 'Стиль и персонаж стабильнее от сцены к сцене.')} />
        <ToggleRow on={plan.enhancePrompt} onChange={(on) => dispatch({ type: 'enhancePrompt', on })}
          disabled={!engine?.enhancePrompt}
          label={tr(locale, 'Google-მა გადაწეროს აღწერა', 'Let Google rewrite the prompt', 'Google переписывает описание')}
          hint={engine?.enhancePrompt
            ? tr(locale, 'ჩვენი რეჟისორი აღწერას უკვე წერს; ჩართვა seed-ის ეფექტს ასუსტებს.', 'Our director already writes the prompt; this weakens the seed lock.', 'Режиссёр уже пишет описание; включение ослабляет seed.')
            : tr(locale, 'ხელმისაწვდომია Vertex AI-ზე გადასვლის შემდეგ.', 'Available once rendering moves to Vertex AI.', 'Доступно после перехода на Vertex AI.')} />
      </Disclosure>
    </div>
  );
}
