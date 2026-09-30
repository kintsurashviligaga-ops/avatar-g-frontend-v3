'use client';

/**
 * LiveCaptions — the rolling transcript of a Live call: the last few lines, newest at the bottom, the user's words
 * dimmer and smaller than the model's (as in Gemini Live: the answer is the thing you read). Georgian keeps the
 * product's 16 px floor and 1.6 line-height for its tall script; the model's line is 20 px in every language.
 *
 * Accessibility: the region is a polite live log, but only FINAL lines are exposed to assistive tech. Pending lines
 * change several times a second while the words stream in; announcing each revision would read every sentence to a
 * screen-reader user three times over. A line becomes readable the moment its turn closes.
 */
import type { LiveCaption } from './useGeminiLiveSession';

type Locale = 'ka' | 'en' | 'ru';

const T: Record<Locale, { region: string; you: string; assistant: string }> = {
  ka: { region: 'საუბრის ტექსტი', you: 'შენ', assistant: 'MyAvatar' },
  en: { region: 'Conversation captions', you: 'You', assistant: 'MyAvatar' },
  ru: { region: 'Субтитры разговора', you: 'Вы', assistant: 'MyAvatar' },
};

/** Long answers show their newest words: the caption is a live strip, not the archive (the chat thread is). */
const MAX_LINE_CHARS = 220;

export function tailText(text: string, max = MAX_LINE_CHARS): string {
  if (text.length <= max) return text;
  const cut = text.slice(text.length - max);
  const space = cut.indexOf(' ');
  return `…${space > 0 && space < 40 ? cut.slice(space + 1) : cut}`;
}

export interface LiveCaptionsProps {
  captions: readonly LiveCaption[];
  locale?: Locale;
  /** How many lines stay on screen. */
  maxItems?: number;
  className?: string;
}

export default function LiveCaptions({ captions, locale = 'ka', maxItems = 3, className = '' }: LiveCaptionsProps) {
  const t = T[locale] ?? T.ka;
  const shown = captions.slice(-Math.max(1, maxItems));
  return (
    <div
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label={t.region}
      className={`flex w-full max-w-xl flex-col justify-end gap-2 px-6 text-center ${className}`}
    >
      {shown.map((c) => (
        <p
          key={c.id}
          aria-hidden={c.final ? undefined : true}
          data-role={c.role}
          data-final={c.final ? '1' : '0'}
          className={
            c.role === 'user'
              ? `${locale === 'ka' ? 'text-[16px]' : 'text-[15px]'} leading-[1.6] text-app-muted`
              : `text-[20px] font-medium leading-[1.6] text-app-text ${c.final ? '' : 'opacity-90'}`
          }
        >
          <span className="sr-only">{c.role === 'user' ? t.you : t.assistant}: </span>
          {tailText(c.text)}
        </p>
      ))}
    </div>
  );
}
