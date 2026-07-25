'use client';

/**
 * LiveAvatarRealtime — the PREMIUM voice tier: a real, photorealistic, lip-synced talking avatar streamed
 * over LiveKit from LiveAvatar (liveavatar.com). It mints a session via /api/avatar/live/session, connects
 * to the returned LiveKit room, renders the avatar's video+audio full-screen, and publishes the user's mic
 * so the avatar can hear and respond (LiveAvatar runs its own STT→LLM→TTS→lip-sync agent in the room).
 *
 * GRACEFUL DEGRADATION IS THE CONTRACT: the mint 502/503s until LIVEAVATAR_API_KEY is set AND the account is
 * funded. On ANY failure — mint error, connect error, no video, or a disconnect before going live — it calls
 * onUnavailable(), and the parent (ChatChrome) falls back to the audio-reactive selfie avatar
 * (GeminiLiveConversation). So this NEVER breaks voice mode; it simply lights up automatically once funded.
 */
import { Loader2, Mic, MicOff, PhoneOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type Status = 'connecting' | 'live' | 'closed';

interface Props {
  locale?: 'ka' | 'en' | 'ru';
  onClose: () => void;
  /** Called when LiveAvatar is unavailable (unfunded/unconfigured/connect failure) → parent falls back. */
  onUnavailable?: () => void;
}

const T = {
  ka: { title: 'ცოცხალი ავატარი', connecting: 'ვუკავშირდები შენს ავატარს…', live: 'ცოცხალი', closed: 'სესია დასრულდა' },
  en: { title: 'Live Avatar', connecting: 'Connecting to your avatar…', live: 'Live', closed: 'Session ended' },
  ru: { title: 'Живой аватар', connecting: 'Подключаюсь к вашему аватару…', live: 'В эфире', closed: 'Сессия завершена' },
};

export default function LiveAvatarRealtime({ locale = 'ka', onClose, onUnavailable }: Props) {
  const t = T[locale] ?? T.ka;
  const [status, setStatus] = useState<Status>('connecting');
  const [micMuted, setMicMuted] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioBinRef = useRef<HTMLDivElement | null>(null);
  // Loosely typed to avoid a hard type-dependency at module scope; livekit-client is dynamically imported.
  const roomRef = useRef<import('livekit-client').Room | null>(null);
  // onUnavailable must fire at most once, and never after we've gone live.
  const bailedRef = useRef(false);
  const liveRef = useRef(false);

  const bail = useCallback(() => {
    if (bailedRef.current || liveRef.current) return;
    bailedRef.current = true;
    try { void roomRef.current?.disconnect(); } catch { /* noop */ }
    roomRef.current = null;
    onUnavailable?.();
  }, [onUnavailable]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1) Mint a LiveAvatar session. Bounded so an unfunded account fails FAST to the fallback.
        const res = await fetch('/api/avatar/live/session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: '{}', signal: AbortSignal.timeout(12_000),
        }).catch(() => null);
        const j = (await res?.json().catch(() => ({}))) as { ok?: boolean; livekitUrl?: string; livekitToken?: string };
        if (cancelled) return;
        if (!res || !res.ok || !j.ok || !j.livekitUrl || !j.livekitToken) { bail(); return; }

        // 2) Connect to the LiveKit room (SDK loaded lazily so it never weighs on the common fallback path).
        const { Room, RoomEvent, Track } = await import('livekit-client');
        if (cancelled) return;
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Video && videoRef.current) {
            track.attach(videoRef.current);
            liveRef.current = true;
            if (!cancelled) setStatus('live');
          } else if (track.kind === Track.Kind.Audio) {
            const el = track.attach(); // autoplay audio element — must be in the DOM to play
            el.autoplay = true;
            audioBinRef.current?.appendChild(el);
          }
        });
        room.on(RoomEvent.Disconnected, () => {
          if (liveRef.current) { if (!cancelled) setStatus('closed'); }
          else bail(); // dropped before we ever saw the avatar → fall back
        });

        await room.connect(j.livekitUrl, j.livekitToken);
        if (cancelled) { void room.disconnect(); return; }
        // Publish the mic so the avatar hears the user (LiveAvatar's agent does STT→LLM→TTS→lip-sync).
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        if (!cancelled) bail();
      }
    })();
    return () => {
      cancelled = true;
      try { void roomRef.current?.disconnect(); } catch { /* noop */ }
      roomRef.current = null;
    };
  }, [bail]);

  const toggleMute = useCallback(() => {
    setMicMuted((m) => {
      const next = !m;
      try { void roomRef.current?.localParticipant.setMicrophoneEnabled(!next); } catch { /* noop */ }
      return next;
    });
  }, []);

  const endCall = useCallback(() => {
    try { void roomRef.current?.disconnect(); } catch { /* noop */ }
    roomRef.current = null;
    onClose();
  }, [onClose]);

  const label = status === 'connecting' ? t.connecting : status === 'closed' ? t.closed : t.live;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-app-bg/95 backdrop-blur-md ag-no-drag" role="dialog" aria-label={t.title}>
      {/* Full-screen avatar video (the real lip-synced stream). */}
      <video ref={videoRef} autoPlay playsInline className={status === 'live' ? 'absolute inset-0 z-0 h-full w-full object-cover' : 'hidden'} />
      {status === 'live' && <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/20 via-transparent to-black/70" />}
      {/* Hidden bin that holds the attached audio element(s) so they play. */}
      <div ref={audioBinRef} className="hidden" aria-hidden />

      <span className="relative z-10 mb-6 text-[12px] font-semibold uppercase tracking-wider text-app-muted">{t.title}</span>

      {status === 'connecting' && (
        <div className="relative z-10 mb-6 flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-app-accent" size={40} />
        </div>
      )}

      <span className="relative z-10 mb-1 text-[14px] font-medium text-app-text">{label}</span>

      {/* Control bar */}
      <div className="fixed bottom-0 left-0 right-0 flex items-center justify-center gap-4 border-t border-white/10 bg-black/40 px-6 py-4 backdrop-blur-xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        <button type="button" onClick={toggleMute} aria-label="mute"
          className={`flex h-12 w-12 touch-manipulation items-center justify-center rounded-full transition ${micMuted ? 'bg-app-danger/20 text-app-danger' : 'bg-white/[0.08] text-app-text hover:bg-white/[0.14]'}`}>
          {micMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button type="button" onClick={endCall} aria-label="end call"
          className="flex h-14 w-14 touch-manipulation items-center justify-center rounded-full bg-app-danger text-white shadow-lg transition hover:brightness-110">
          <PhoneOff size={22} />
        </button>
      </div>
    </div>
  );
}
