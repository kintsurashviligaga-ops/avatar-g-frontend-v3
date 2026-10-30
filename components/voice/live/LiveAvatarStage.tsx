'use client';

/**
 * The talking avatar of a Live call (lib/voice/liveAvatar): the ONE <video> it plays in, the player that feeds it
 * (lib/voice/fmp4Player), and the slot that shows it on the full screen or as a small picture beside the docked bar.
 *
 * ⚠️ ONE ELEMENT FOR THE WHOLE CALL. The avatar's voice is inside its video, and the full screen and the docked bar are
 * different trees: a <video> per view would stop the sound at every dock/undock. The element is created once here and
 * MOVED between slots inside one React commit (the old slot's cleanup and the new slot's layout effect run in the same
 * task), so it keeps playing.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { AvatarAudioOutput } from '@/lib/voice/avatarAudio';
import { Fmp4Player, defaultPlayerDeps, type AvatarPlayerState } from '@/lib/voice/fmp4Player';

type Locale = 'ka' | 'en' | 'ru';

export const LIVE_AVATAR_STRINGS: Record<Locale, {
  toggle: string;
  turnOn: string;
  turnOff: string;
  starting: string;
  capped: string;
  dailyLimit: string;
  disabled: string;
  unsupported: string;
  openCall: string;
}> = {
  ka: {
    toggle: 'ავატარი',
    turnOn: 'ჩართე მოლაპარაკე ავატარი',
    turnOff: 'ავატარი ჩართულია — გამორთე',
    starting: 'ავატარი ირთვება…',
    capped: 'ავატარის 5 წუთი ამოიწურა, ზარი ხმით გრძელდება',
    dailyLimit: 'დღევანდელი ავატარის ლიმიტი ამოიწურა, ზარი ხმითაა',
    disabled: 'ავატარი ახლა გამორთულია, ზარი ხმითაა',
    unsupported: 'ეს ბრაუზერი ავატარს ვერ აჩვენებს, ზარი ხმით გრძელდება',
    openCall: 'ზარის გაშლა',
  },
  en: {
    toggle: 'Avatar',
    turnOn: 'Turn on the talking avatar',
    turnOff: 'Avatar on — turn it off',
    starting: 'Starting the avatar…',
    capped: 'The avatar’s 5 minutes are up; the call goes on by voice',
    dailyLimit: 'Today’s avatar limit is used up; this call is voice only',
    disabled: 'The avatar is off right now; this call is voice only',
    unsupported: 'This browser can’t show the avatar; the call goes on by voice',
    openCall: 'Open the call',
  },
  ru: {
    toggle: 'Аватар',
    turnOn: 'Включить говорящий аватар',
    turnOff: 'Аватар включён — выключить',
    starting: 'Аватар запускается…',
    capped: '5 минут аватара истекли, звонок продолжается голосом',
    dailyLimit: 'Дневной лимит аватара исчерпан, звонок только голосом',
    disabled: 'Аватар сейчас отключён, звонок только голосом',
    unsupported: 'Этот браузер не может показать аватар, звонок продолжается голосом',
    openCall: 'Развернуть звонок',
  },
};

export interface LiveAvatarPlayer {
  /** The call's avatar element (null before mount / without a DOM). */
  video: HTMLVideoElement | null;
  state: AvatarPlayerState;
  push: (data: string) => void;
  jumpToLive: () => void;
  /** Inside a tap: sound on (the 'muted' fallback's "tap for sound"). */
  unlock: () => void;
  /** Inside the tap that turns the avatar on: lets this element play with sound later (iPhone). */
  prime: () => void;
  reset: () => void;
}

function createAvatarVideo(): HTMLVideoElement {
  const v = document.createElement('video');
  v.className = 'h-full w-full object-cover';
  v.setAttribute('playsinline', '');
  v.setAttribute('data-testid', 'live-avatar-video');
  v.setAttribute('aria-hidden', 'true'); // the captions carry the words; the picture is decoration
  return v;
}

/** `audioOutput`: the call's speaker path (useGeminiLiveSession().audioOutput); the voice then plays through it where
 *  the browser decodes the codec, as loud as a voice call (lib/voice/avatarAudio). Read at each session's start. */
export function useLiveAvatarPlayer(audioOutput?: () => AvatarAudioOutput | null): LiveAvatarPlayer {
  const [video] = useState<HTMLVideoElement | null>(() => (typeof document === 'undefined' ? null : createAvatarVideo()));
  const [state, setState] = useState<AvatarPlayerState>('idle');
  const playerRef = useRef<Fmp4Player | null>(null);
  const audioOutputRef = useRef(audioOutput);
  audioOutputRef.current = audioOutput;

  useEffect(() => {
    if (!video) return;
    const player = new Fmp4Player(video, setState, defaultPlayerDeps(), { audioOutput: () => audioOutputRef.current?.() ?? null });
    playerRef.current = player;
    return () => {
      player.destroy();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [video]);

  const push = useCallback((data: string) => { playerRef.current?.push(data); }, []);
  const jumpToLive = useCallback(() => { playerRef.current?.jumpToLive(); }, []);
  const unlock = useCallback(() => { playerRef.current?.unlock(); }, []);
  const reset = useCallback(() => { playerRef.current?.reset(); }, []);
  const prime = useCallback(() => {
    if (!video || playerRef.current?.current === 'playing') return;
    video.muted = false;
    try { void video.play()?.catch(() => {}); } catch { /* nothing to play yet: the tap still counts */ }
  }, [video]);

  return { video, state, push, jumpToLive, unlock, prime, reset };
}

/** Shows the call's avatar element here (it moves, it is never cloned). */
export function LiveAvatarSlot({ video, className }: { video: HTMLVideoElement; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.appendChild(video);
    // Some engines pause a media element that left the document; it was playing, so carry on (no-op otherwise).
    if (video.paused && video.src) { try { void video.play()?.catch(() => {}); } catch { /* noop */ } }
    return () => { if (video.parentNode === host) host.removeChild(video); };
  }, [video]);
  return <div ref={hostRef} data-testid="live-avatar-slot" className={className} />;
}

const CAPTION_FADE = 'linear-gradient(to bottom, transparent 0, #000 1.25rem)';

/**
 * The avatar's words over its video. ⚠️ GG 2026-10-25 18:17Z: the text covered the face while it was being written. The
 * face fills the top of the portrait frame, so the words stay in a low band: 2 lines at most on a short phone, 3 from 780 px
 * tall, the newest at the bottom (a column that overflows at its top), the older ones fading out, on a dark frosted card.
 */
export function LiveAvatarCaption({ text, hidden }: { text: string; hidden?: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const p = textRef.current;
    // Overflow at the START of a flex column is not scrollable, so scrollHeight cannot tell: compare the text itself.
    if (box && p) setClipped(p.offsetHeight > box.clientHeight + 1);
  }, [text]);
  return (
    <div className="rounded-2xl bg-black/45 px-4 py-2.5 shadow-lg ring-1 ring-white/10 backdrop-blur-md">
      <div ref={boxRef} data-testid="live-avatar-caption" data-clipped={clipped ? '' : undefined}
        className="flex max-h-[3.5rem] flex-col justify-end overflow-hidden [@media(min-height:780px)]:max-h-[5.25rem]"
        style={clipped ? { WebkitMaskImage: CAPTION_FADE, maskImage: CAPTION_FADE } : undefined}>
        <p ref={textRef} aria-hidden={hidden || undefined} className="shrink-0 text-[18px] font-semibold leading-7 tracking-tight text-white">{text}</p>
      </div>
    </div>
  );
}
