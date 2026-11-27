'use client';

import { Sparkles } from 'lucide-react';

/**
 * AiContentBadge — the visible "AI-generated" label on a finished result (EU AI Act Art. 50, GG 2026-11-27).
 *
 * The machine-readable layer (SynthID from Google's models, and IPTC/XMP metadata written at upload) travels with
 * the file; this is the human-readable layer next to it, on every image, video, music and avatar result.
 *
 * - `generated`: we made it ("AI-generated").
 * - `edited`: an AI edit of something else ("Edited with AI").
 * - `likeness`: it shows a person's face or likeness ("AI-generated, not a real recording", Art. 50(4) deepfake
 *   disclosure). Always shown in full, never shortened to an icon.
 *
 * OFF FOR THE PUBLIC SITE (GG 2026-11-27): myavatar.ge shows clean results, like Google AI Studio / Gemini. Compliance
 * there is the invisible layer only (SynthID + IPTC/XMP metadata). This badge is an opt-in for a deployment whose client
 * legally demands visible labels: it renders only when NEXT_PUBLIC_AI_LABELS is exactly "1". Unset, "true", "on" or
 * anything else keeps it off, so a typo can never switch it on. It never touches the file itself.
 */
export type AiLabelKind = 'generated' | 'edited' | 'likeness';
type Lang = 'ka' | 'en' | 'ru';

export const AI_LABEL_COPY: Record<Lang, Record<AiLabelKind, string>> = {
  ka: { generated: 'AI-ით შექმნილი', edited: 'AI-ით დამუშავებული', likeness: 'AI-ით შექმნილი — არ არის რეალური ჩანაწერი' },
  en: { generated: 'AI-generated', edited: 'Edited with AI', likeness: 'AI-generated — not a real recording' },
  ru: { generated: 'Создано ИИ', edited: 'Обработано ИИ', likeness: 'Создано ИИ — не реальная запись' },
};

/**
 * Strictly opt-in: exactly "1" and nothing else. Inlined at build time (Next replaces `process.env.NEXT_PUBLIC_*`
 * literally, so it must be read by its full name).
 */
export function aiLabelsOn(value: string | undefined = process.env.NEXT_PUBLIC_AI_LABELS): boolean {
  return value === '1';
}

export function aiLabelText(kind: AiLabelKind, locale: string | undefined): string {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  return AI_LABEL_COPY[lang][kind];
}

/**
 * Whether a delivered chat clip shows a person's face or likeness, so it carries the deepfake label (Art. 50(4)):
 * a talking avatar (Veo avatar / lip-sync) or a clip made from photos the user gave (usually a real face).
 */
export function showsLikeness(m: { genKind?: string; avatarSpec?: unknown; clipSpec?: { photos?: readonly string[] } }): boolean {
  return m.genKind === 'lipsync' || !!m.avatarSpec || (m.clipSpec?.photos?.length ?? 0) > 0;
}

export function AiContentBadge({
  kind = 'generated', locale, placement = 'top-left', inline = false, className = '',
}: {
  kind?: AiLabelKind;
  locale?: string;
  /** Corner of the media it sits on. Ignored when `inline`. */
  placement?: 'top-left' | 'top-right' | 'bottom-left';
  /** In the flow (e.g. under an audio row) instead of over the media. */
  inline?: boolean;
  className?: string;
}) {
  if (!aiLabelsOn()) return null;
  const text = aiLabelText(kind, locale);
  const corner = placement === 'top-right' ? 'right-2 top-2' : placement === 'bottom-left' ? 'bottom-2 left-2' : 'left-2 top-2';
  const pos = inline ? 'inline-flex' : `pointer-events-none absolute z-10 ${corner} inline-flex`;
  const tone = kind === 'likeness' ? 'bg-amber-500/90 text-black' : 'bg-black/60 text-white';
  return (
    <span
      data-testid="ai-content-badge"
      data-ai-label={kind}
      role="note"
      aria-label={text}
      className={`${pos} max-w-[calc(100%-1rem)] items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-white/15 backdrop-blur-sm ${tone} ${className}`}
    >
      <Sparkles size={11} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}
