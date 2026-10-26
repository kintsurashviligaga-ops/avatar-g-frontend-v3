'use client';

/**
 * ClipCreatePanel — the video tool's settings for ONE clip, like Gemini's Veo (GG 2026-10-25 16:10Z). It replaces the film
 * panel (Film | Music video, sound, music, narrator, subtitles, lip-sync, a soundtrack): GG asked for none of those
 * switches („ყველაფერი პრომპტიდან უნდა გამომდინარეობდეს") and for no music video at all.
 *
 *   header → Length 4 · 6 · 8 · 10 s (8 by default) → Format 9:16 · 16:9 → Quality → Photos (up to 3)
 *
 * Quality is said as a resolution and pixels with its price. 4 / 6 / 8 s are Veo 3.1 at its tier (Lite · Fast · Veo 3.1);
 * 10 s — or any length whose words have a character speak Georgian (GG's card 2026-10-26 10:55Z) — is Gemini Omni Flash at
 * 720p or 1080p (GG's card 16:51Z). Two or three photos are Veo's reference images, which
 * render 8 s only and not on Lite. The prompt is typed in the chat box; its Send opens the clip's card with the price.
 *
 * ⚠️ EVERY PRICE HERE IS lib/video/directClip.directClipCredits, the function POST /api/video/clip charges by.
 */
import { ImagePlus, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { VideoQuality } from '@/lib/credits/videoPricing';
import {
  DIRECT_CLIP_MAX_PHOTOS, directClipCredits, directClipEngine, directClipQualityLabel, directClipTierAllowed,
  type DirectClipAspect, type DirectClipResolution, type DirectClipSeconds, type DirectClipSpeech,
} from '@/lib/video/directClip';
import { clipEngineLabel, clipLengthsFor, clipPhotoNote, clipResolutionBlurb, clipTierBlurb } from '@/components/studio/clip/clipOrder';
import { CARD, VideoCreateHeader } from './videoCreateParts';
import { VIDEO_COPY, vc } from './videoCreateCopy';

export interface ClipCreatePanelProps {
  locale: string;
  /** What the panel sits in: the phone's sheet (a Done button) or the desktop column. */
  surface: 'sheet' | 'panel';
  toolName: string;
  onSwitchTool: () => void;
  onClose: () => void;
  seconds: DirectClipSeconds;
  onSeconds: (s: DirectClipSeconds) => void;
  aspect: DirectClipAspect;
  onAspect: (a: DirectClipAspect) => void;
  tier: VideoQuality;
  onTier: (t: VideoQuality) => void;
  /** An Omni clip's resolution (10 s, or a Georgian line at any length). */
  resolution: DirectClipResolution;
  /** 'ka' when the words in the chat box have a character speak Georgian: the clip is Omni's at every length. */
  speech?: DirectClipSpeech;
  onResolution: (r: DirectClipResolution) => void;
  /** The clip's photos. Without onAdd / onRemove they are a waiting card's own (shown, not changed here). */
  photos: { images: readonly string[]; onAdd?: () => void; onRemove?: (index: number) => void };
  /** The Veo tiers this deployment cannot render (GET /api/video/engine): shown as unavailable, never picked. */
  closedTiers?: readonly VideoQuality[];
}

const TIERS: readonly VideoQuality[] = ['lite', 'fast', 'standard'];

function words(locale: string) {
  const en = locale === 'en', ru = locale === 'ru';
  return {
    length: en ? 'Length' : ru ? 'Длина' : 'სიგრძე',
    format: en ? 'Format' : ru ? 'Формат' : 'ფორმატი',
    quality: en ? 'Quality' : ru ? 'Качество' : 'ხარისხი',
    sec: (s: number) => (en ? `${s} s` : ru ? `${s} с` : `${s} წმ`),
    vertical: en ? 'vertical' : ru ? 'вертикально' : 'ვერტიკალური',
    landscape: en ? 'landscape' : ru ? 'горизонтально' : 'ჰორიზონტალური',
    sound: en ? 'Sound and speech follow your prompt.' : ru ? 'Звук и речь — по вашему описанию.' : 'ხმა და საუბარი შენი აღწერიდან მოდის.',
    refsOnly8: en ? 'With 2–3 photos the clip is 8 s.' : ru ? 'С 2–3 фото клип длится 8 с.' : '2–3 ფოტოთი კლიპი 8 წამიანია.',
    remove: en ? 'Remove photo' : ru ? 'Удалить фото' : 'ფოტოს წაშლა',
    add: en ? 'Add a photo' : ru ? 'Добавить фото' : 'ფოტოს დამატება',
  };
}

function Chips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-3.5 py-2">
      <p className="mb-1.5 text-[14px] font-medium leading-tight text-app-text">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>{children}</div>
    </div>
  );
}

function Chip({ on, disabled, onClick, children, testId }: { on: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; testId: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on} data-testid={testId}
      className={`inline-flex min-h-[40px] items-center rounded-full px-3.5 text-[13px] font-medium tabular-nums transition-colors disabled:opacity-40 ${on
        ? 'bg-app-text text-app-bg'
        : 'border border-app-border/30 text-app-text hover:bg-app-bg/60'}`}>
      {children}
    </button>
  );
}

/** One quality row: what it renders at, its engine, its price (or why it cannot be picked); the picked one is marked. */
function QualityRow({ on, disabled, onClick, title, sub, credits, unavailable, testId }: {
  on: boolean; disabled?: boolean; onClick: () => void; title: string; sub: string; credits: number; unavailable?: string; testId: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} disabled={disabled} data-testid={testId} data-price={credits}
      className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-2 text-left transition-colors disabled:opacity-40 ${on ? 'bg-app-bg ring-1 ring-app-accent/50' : 'hover:bg-app-bg/50'}`}>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium leading-tight text-app-text">{title}</span>
        <span className="mt-0.5 block text-[11.5px] leading-tight text-app-muted tabular-nums">{sub}</span>
      </span>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-app-text">{unavailable ?? `✦ ${credits}`}</span>
    </button>
  );
}

export function ClipCreatePanel(p: ClipCreatePanelProps) {
  const { locale, seconds, aspect, tier, resolution } = p;
  const w = words(locale);
  const photos = p.photos.images.length;
  const lengths = clipLengthsFor(photos);
  const note = clipPhotoNote(photos, locale);
  const full = photos >= DIRECT_CLIP_MAX_PHOTOS;

  return (
    <div data-testid="clip-create-panel" className="space-y-3">
      <VideoCreateHeader locale={locale} title={p.toolName} onSwitchTool={p.onSwitchTool} onClose={p.onClose} />

      <div className={`${CARD} divide-y divide-app-border/10 py-1`}>
        <Chips label={w.length}>
          {([4, 6, 8, 10] as const).map((s) => (
            <Chip key={s} on={seconds === s} disabled={!lengths.includes(s)} onClick={() => p.onSeconds(s)} testId={`clip-panel-len-${s}`}>{w.sec(s)}</Chip>
          ))}
        </Chips>
        <Chips label={w.format}>
          {(['9:16', '16:9'] as const).map((a) => (
            <Chip key={a} on={aspect === a} onClick={() => p.onAspect(a)} testId={`clip-panel-aspect-${a.replace(':', 'x')}`}>
              {a} <span className="ml-1 text-[11.5px] opacity-70">{a === '9:16' ? w.vertical : w.landscape}</span>
            </Chip>
          ))}
        </Chips>
        <div className="space-y-1 px-2 py-2" role="radiogroup" aria-label={w.quality}>
          <p className="px-1.5 pb-0.5 text-[14px] font-medium leading-tight text-app-text">{w.quality}</p>
          {directClipEngine(seconds, p.speech) === 'omni'
            ? (['720p', '1080p'] as const).map((r) => (
              <QualityRow key={r} on={resolution === r} onClick={() => p.onResolution(r)} testId={`clip-panel-res-${r}`}
                title={directClipQualityLabel(aspect, seconds, r, p.speech)} sub={`${clipResolutionBlurb(r, locale)} ${clipEngineLabel({ seconds, tier, speech: p.speech })}.`}
                credits={directClipCredits({ seconds, tier, photos, resolution: r, speech: p.speech })} />
            ))
            : TIERS.map((t) => {
              const closed = p.closedTiers?.includes(t) ?? false;
              return (
                <QualityRow key={t} on={tier === t} disabled={closed || !directClipTierAllowed(t, photos)} onClick={() => p.onTier(t)} testId={`clip-panel-tier-${t}`}
                  title={clipEngineLabel({ seconds, tier: t })} sub={`${clipTierBlurb(t, locale)} ${directClipQualityLabel(aspect, seconds)}.`}
                  credits={directClipCredits({ seconds, tier: t, photos })} {...(closed ? { unavailable: vc(VIDEO_COPY.tierUnavailable, locale) } : {})} />
              );
            })}
        </div>
        <div data-testid="clip-panel-photos" className="px-3.5 py-2">
          <p className="text-[14px] font-medium leading-tight text-app-text">
            {vc(VIDEO_COPY.photos, locale)} <span className="text-[11.5px] font-normal text-app-muted">· {vc(VIDEO_COPY.photosOptional, locale)} · {photos}/{DIRECT_CLIP_MAX_PHOTOS}</span>
          </p>
          <ul className="mt-2 flex flex-wrap items-center gap-2">
            {p.photos.images.map((src, i) => (
              <li key={`${i}-${src.slice(-12)}`} className="relative h-11 w-11 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL the user just picked */}
                <img src={src} alt="" className="h-full w-full rounded-xl object-cover ring-1 ring-app-border/20" />
                {p.photos.onRemove && <button type="button" onClick={() => p.photos.onRemove?.(i)} aria-label={`${w.remove} ${i + 1}`}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-app-surface text-app-muted shadow ring-1 ring-app-border/20 hover:text-app-text before:absolute before:-inset-3 before:content-['']">
                  <X size={11} aria-hidden="true" />
                </button>}
              </li>
            ))}
            {p.photos.onAdd && <li>
              <button type="button" onClick={p.photos.onAdd} disabled={full} aria-label={w.add} title={w.add} data-testid="clip-panel-add-photo"
                className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed border-app-border/35 bg-app-bg/40 text-app-text/80 transition-colors hover:bg-app-bg/70 disabled:cursor-not-allowed disabled:opacity-40">
                <ImagePlus size={18} aria-hidden="true" />
              </button>
            </li>}
          </ul>
          {note && <p className="mt-1.5 text-[11.5px] leading-snug text-app-muted">{note}{photos >= 2 ? ` ${w.refsOnly8}` : ''}</p>}
        </div>
      </div>

      <p className="px-1 text-[12px] leading-snug text-app-muted">{w.sound}</p>
      <p data-testid="video-prompt-hint" className="px-1 text-[12.5px] leading-snug text-app-muted">{vc(VIDEO_COPY.promptInChat, locale)}</p>
      {p.surface === 'sheet' && (
        <button type="button" onClick={p.onClose} data-testid="video-settings-done"
          className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-app-elevated px-5 text-[15px] font-semibold text-app-text ring-1 ring-app-border/15 transition-colors hover:bg-app-elevated/70">
          {vc(VIDEO_COPY.done, locale)}
        </button>
      )}
    </div>
  );
}
