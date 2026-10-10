'use client';

/**
 * MusicVideoLook — the music video's look, shown under the Video panel's Film | Music video switch while Music video is
 * picked: a GENRE (Blues · Hip-Hop · Pop · Cinematic) and a LIGHT (Golden hour · Cinematic · Moody · Melancholic).
 *
 * These are the presets the retired Music Video director had (lib/chat/musicVideoPresets). Its other two rows, shot size
 * and camera move, are not repeated here: the Video panel's own camera controls (Advanced → camera) already set them for
 * every scene, and two camera controls that disagree would be worse than one.
 *
 * Nothing is picked by default, and a picked chip is cleared by tapping it again. A pick only adds its words to the film's
 * brief (composeMusicVideoPrompt); it changes no price, length or format.
 */
import { MV_GENRES, MV_LIGHTING, mvLabel } from '@/lib/chat/musicVideoPresets';

export interface MusicVideoLookValue {
  genre: string | null;
  lighting: string | null;
}

const COPY = {
  title: { ka: 'კლიპის სტილი', en: 'Clip look', ru: 'Стиль клипа' },
  genre: { ka: 'ჟანრი', en: 'Genre', ru: 'Жанр' },
  light: { ka: 'შუქი', en: 'Light', ru: 'Свет' },
} as const;

function tx(entry: { ka: string; en: string; ru: string }, locale: string): string {
  return locale === 'en' ? entry.en : locale === 'ru' ? entry.ru : entry.ka;
}

function Row({ label, items, value, onPick, testId, locale }: {
  label: string;
  items: readonly { id: string; labelKa: string; labelEn: string; labelRu: string }[];
  value: string | null;
  onPick: (id: string | null) => void;
  testId: string;
  locale: string;
}) {
  return (
    <div role="group" aria-label={label} data-testid={testId} className="flex min-w-0 items-start gap-2">
      <span className="w-12 shrink-0 pt-1.5 text-[11.5px] font-medium text-app-muted">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {items.map((it) => {
          const on = it.id === value;
          return (
            <button
              key={it.id}
              type="button"
              aria-pressed={on}
              data-testid={`${testId}-${it.id}`}
              onClick={() => onPick(on ? null : it.id)}
              className={[
                'inline-flex min-h-[32px] items-center rounded-full px-3 text-[12.5px] font-medium ring-1 transition-colors',
                on ? 'bg-app-accent/15 text-app-accent ring-app-accent/40' : 'bg-app-elevated text-app-text ring-app-border/15 hover:bg-app-elevated/70',
              ].join(' ')}
            >
              {mvLabel(it, locale)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MusicVideoLook({ locale, value, onChange }: {
  locale: string;
  value: MusicVideoLookValue;
  onChange: (next: MusicVideoLookValue) => void;
}) {
  return (
    <div data-testid="mv-look" className="space-y-2 rounded-2xl bg-app-elevated/40 p-2.5 ring-1 ring-app-border/10">
      <div className="text-[12px] font-semibold text-app-text">{tx(COPY.title, locale)}</div>
      <Row label={tx(COPY.genre, locale)} items={MV_GENRES} value={value.genre} testId="mv-genre" locale={locale}
        onPick={(genre) => onChange({ ...value, genre })} />
      <Row label={tx(COPY.light, locale)} items={MV_LIGHTING} value={value.lighting} testId="mv-light" locale={locale}
        onPick={(lighting) => onChange({ ...value, lighting })} />
    </div>
  );
}
