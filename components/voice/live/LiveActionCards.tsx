'use client';

/**
 * LiveActionCards — the Live screen's "what the agent just did" strip (voice-to-action, docs/voice/LIVE_ACTIONS.md):
 * one card per action, newest first, at most three — „ვიდეოს პრომპტი მოვამზადე“ with the prompt under it and an Open
 * button that ends the call and puts the prepared studio (or the code canvas) in front of the user.
 *
 * ⚠️ ONE ANNOUNCEMENT PER NEW ACTION, NOT A LIVE LIST. The cards hold buttons; a live region around them would re-read
 * every card (and its buttons) on each change, and a cancellation would announce the OLDER card as if it were new. A
 * separate visually-hidden role="status" line speaks only a card that was not seen before, and it is mounted for the
 * whole call (with no cards) because a live region inserted together with its text is often not announced at all.
 * Motion: Framer Motion springs the cards in and out; under prefers-reduced-motion they simply appear (DESIGN.md: the
 * Live screen keeps exactly one moving glow). Georgian never below 16 px / 1.6; every target ≥ 44 px.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Code2, Copy } from 'lucide-react';

import { TOOL_META } from '@/lib/studio/tools';
import type { LiveStudioTool } from '@/lib/voice/liveTools';

import { LIVE_ACTION_CARDS_MAX, type LiveActionCard, type LiveCardAction } from './liveActions';

type Locale = 'ka' | 'en' | 'ru';

interface ActionStrings {
  region: string;
  prepared: Record<LiveStudioTool, string>;
  opened: Record<LiveStudioTool, string>;
  code: string;
  codeOnScreen: string;
  notStarted: string;
  open: string;
  /** Accessible names of Open — each CONTAINS the visible `open` word (WCAG 2.5.3). */
  openStudioLabel: string;
  openCodeLabel: string;
  copy: string;
  copied: string;
  seconds: string;
}

export const LIVE_ACTION_STRINGS: Record<Locale, ActionStrings> = {
  ka: {
    region: 'მოქმედებები',
    prepared: {
      video: 'ვიდეოს პრომპტი მოვამზადე',
      image: 'სურათის პრომპტი მოვამზადე',
      music: 'მუსიკის პრომპტი მოვამზადე',
      avatar: 'ავატარის პრომპტი მოვამზადე',
    },
    opened: {
      video: 'ვიდეოს სტუდია გავხსენი',
      image: 'სურათის სტუდია გავხსენი',
      music: 'მუსიკის სტუდია გავხსენი',
      avatar: 'ავატარის სტუდია გავხსენი',
    },
    code: 'კოდი',
    codeOnScreen: 'კოდი ეკრანზეა',
    notStarted: 'ჯერ არ დაწყებულა — სტუდიაში შენ გაუშვებ.',
    open: 'გახსნა',
    openStudioLabel: 'სტუდიაში გახსნა და ზარის დასრულება',
    openCodeLabel: 'კოდის გახსნა და ზარის დასრულება',
    copy: 'კოდის კოპირება',
    copied: 'დაკოპირდა',
    seconds: 'წმ',
  },
  en: {
    region: 'Actions',
    prepared: {
      video: 'Prepared a video prompt',
      image: 'Prepared an image prompt',
      music: 'Prepared a music prompt',
      avatar: 'Prepared an avatar prompt',
    },
    opened: {
      video: 'Opened the Video studio',
      image: 'Opened the Image studio',
      music: 'Opened the Music studio',
      avatar: 'Opened the Avatar studio',
    },
    code: 'Code',
    codeOnScreen: 'Code on screen',
    notStarted: 'Not started — you run it from the studio.',
    open: 'Open',
    openStudioLabel: 'Open in the studio and end the call',
    openCodeLabel: 'Open the code and end the call',
    copy: 'Copy code',
    copied: 'Copied',
    seconds: 's',
  },
  ru: {
    region: 'Действия',
    prepared: {
      video: 'Промпт для видео готов',
      image: 'Промпт для изображения готов',
      music: 'Промпт для музыки готов',
      avatar: 'Промпт для аватара готов',
    },
    opened: {
      video: 'Открыта студия видео',
      image: 'Открыта студия изображений',
      music: 'Открыта студия музыки',
      avatar: 'Открыта студия аватаров',
    },
    code: 'Код',
    codeOnScreen: 'Код на экране',
    notStarted: 'Не запущено — запустите в студии.',
    open: 'Открыть',
    openStudioLabel: 'Открыть в студии и завершить звонок',
    openCodeLabel: 'Открыть код и завершить звонок',
    copy: 'Скопировать код',
    copied: 'Скопировано',
    seconds: 'с',
  },
};

const stringsFor = (locale: Locale): ActionStrings => LIVE_ACTION_STRINGS[locale] ?? LIVE_ACTION_STRINGS.ka;

/** The card's headline: what the agent did. For code, the code's own title. */
export function liveActionTitle(action: LiveCardAction, locale: Locale = 'ka'): string {
  const t = stringsFor(locale);
  if (action.type === 'prepare_generation') return t.prepared[action.tool];
  if (action.type === 'open_studio') return t.opened[action.tool];
  return action.title;
}

/** The second line: the requested settings then the prompt („9:16 · 24 წმ · კინემატოგრაფიული · …“), or „კოდი · python“. */
export function liveActionDetail(action: LiveCardAction, locale: Locale = 'ka'): string {
  const t = stringsFor(locale);
  if (action.type === 'show_code') return `${t.code} · ${action.language}`;
  if (action.type === 'open_studio') return '';
  return [
    action.aspectRatio ?? '',
    action.durationSec !== undefined ? `${action.durationSec} ${t.seconds}` : '',
    action.style ?? '',
    action.prompt.replace(/\s+/g, ' '),
  ].filter(Boolean).join(' · ');
}

/** What a screen reader hears once, when a card arrives. */
export function liveActionAnnouncement(action: LiveCardAction, locale: Locale = 'ka'): string {
  const t = stringsFor(locale);
  if (action.type === 'show_code') return `${t.codeOnScreen}: ${action.title}`;
  if (action.type === 'prepare_generation') return `${t.prepared[action.tool]}. ${t.notStarted}`;
  return t.opened[action.tool];
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* in-app WebViews often refuse the async clipboard — fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

const ROUND = 'flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors duration-200 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60';

function ActionCardView({ card, locale, onOpen }: { card: LiveActionCard; locale: Locale; onOpen: (card: LiveActionCard) => void }) {
  const t = stringsFor(locale);
  const a = card.action;
  const quiet = locale === 'ka' ? 'text-[16px] leading-[1.6]' : 'text-[15px] leading-6';
  const Icon = a.type === 'show_code' ? Code2 : TOOL_META[a.tool].Icon;
  const detail = liveActionDetail(a, locale);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const code = a.type === 'show_code' ? a.code : '';
  const onCopy = useCallback(() => {
    void copyToClipboard(code).then((ok) => {
      if (!ok) return;
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div
      data-testid="live-action-card"
      data-action={a.type}
      className="flex items-center gap-3 rounded-2xl bg-white/[0.08] py-2.5 pl-3 pr-2.5 ring-1 ring-white/10 backdrop-blur-md"
    >
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-app-accent">
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold text-app-text ${quiet}`}>{liveActionTitle(a, locale)}</p>
        {detail && <p className={`truncate text-app-muted ${quiet}`}>{detail}</p>}
      </div>
      {a.type === 'show_code' && (
        <button type="button" onClick={onCopy} aria-label={copied ? t.copied : t.copy} className={`${ROUND} text-app-text hover:bg-white/10`}>
          {copied ? <Check size={18} aria-hidden className="text-app-accent" /> : <Copy size={18} aria-hidden />}
        </button>
      )}
      <button
        type="button"
        onClick={() => onOpen(card)}
        aria-label={a.type === 'show_code' ? t.openCodeLabel : t.openStudioLabel}
        className={`inline-flex h-11 min-w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-full bg-app-text px-4 ${quiet} font-semibold text-app-bg transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60`}
      >
        {t.open}
      </button>
    </div>
  );
}

export interface LiveActionCardsProps {
  /** Newest first; only the first LIVE_ACTION_CARDS_MAX are shown. */
  cards: readonly LiveActionCard[];
  locale?: Locale;
  /** Open: the host ends the call and brings the studio / canvas to the front. */
  onOpen: (card: LiveActionCard) => void;
  className?: string;
}

export default function LiveActionCards({ cards, locale = 'ka', onOpen, className = '' }: LiveActionCardsProps) {
  const t = stringsFor(locale);
  const reduced = useReducedMotion() ?? false;
  const visible = cards.slice(0, LIVE_ACTION_CARDS_MAX);

  // Announce a card only the first time it is the newest one (see the header).
  const seenRef = useRef<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    const newest = cards[0];
    if (!newest || seenRef.current.has(newest.id)) return;
    for (const c of cards.slice(0, LIVE_ACTION_CARDS_MAX)) seenRef.current.add(c.id);
    setAnnouncement(liveActionAnnouncement(newest.action, locale));
  }, [cards, locale]);

  return (
    <section aria-label={t.region} className={className}>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
      {/* Centred while it fits, a horizontal scroller (never a page scroll) on a narrow phone. Always mounted, so the
          last card can animate OUT; `empty:hidden` once it has. */}
      <ul className="mx-auto flex w-max max-w-full snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] empty:hidden">
        <AnimatePresence initial={false}>
          {visible.map((card) => (
            <motion.li
              key={card.id}
              layout={!reduced}
              initial={reduced ? false : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }}
              className="w-[min(20rem,calc(100vw-2rem))] shrink-0 snap-start"
            >
              <ActionCardView card={card} locale={locale} onOpen={onOpen} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
