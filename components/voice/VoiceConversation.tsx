'use client';

/**
 * VoiceConversation — the real-time voice-interaction node (DAY-5 Task 1).
 *
 * A SELF-CONTAINED, ADDITIVE overlay: tap-to-talk captures Georgian speech (MediaRecorder / Web Audio),
 * transcribes it (/api/voice/transcribe), gets a short conversational reply (/api/voice/chat → live llmText),
 * and voices it via the existing ElevenLabs streaming TTS route (/api/elevenlabs/tts) — stability stays locked
 * at 0.48 (this component never sends voice settings; the TTS route owns them). Mounted as an opt-in mode from
 * the chat composer so the text chat is completely undisturbed. Fail-open at every leg (a miss → a friendly
 * retry state, never a hang).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Mic, Loader2, Volume2, AlertCircle } from 'lucide-react';
import { chunkForTts } from '@/lib/audio/ttsChunks';

type Lang = 'ka' | 'en' | 'ru';
type Status = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
interface Turn { role: 'user' | 'assistant'; content: string }

const COPY: Record<Lang, { title: string; tapToTalk: string; listening: string; thinking: string; speaking: string; micDenied: string; retry: string; you: string; assistant: string }> = {
  ka: { title: 'ხმოვანი საუბარი', tapToTalk: 'დააჭირე სალაპარაკოდ', listening: 'გისმენ…', thinking: 'ვფიქრობ…', speaking: 'ვპასუხობ…', micDenied: 'მიკროფონზე წვდომა ვერ მოხერხდა', retry: 'სცადე თავიდან', you: 'შენ', assistant: 'MyAvatar' },
  en: { title: 'Voice chat', tapToTalk: 'Tap to talk', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…', micDenied: "Couldn't access the microphone", retry: 'Try again', you: 'You', assistant: 'MyAvatar' },
  ru: { title: 'Голосовой чат', tapToTalk: 'Нажмите, чтобы говорить', listening: 'Слушаю…', thinking: 'Думаю…', speaking: 'Отвечаю…', micDenied: 'Нет доступа к микрофону', retry: 'Ещё раз', you: 'Вы', assistant: 'MyAvatar' },
};

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
    : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
}

export function VoiceConversation({ locale = 'ka', onClose }: { locale?: string; onClose: () => void }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string>('');
  const historyRef = useRef<Turn[]>([]);
  const aliveRef = useRef(true);

  useEffect(() => () => {
    aliveRef.current = false;
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioRef.current?.pause();
  }, []);

  // ── The loop: transcribe → chat → speak ────────────────────────────────────────────────────────────
  const runTurn = useCallback(async (audio: Blob) => {
    try {
      setStatus('thinking'); setError('');
      // 1) STT
      const fd = new FormData();
      // Label the upload with the extension that MATCHES the recorded container. iOS Safari
      // records audio/mp4, NOT webm — a wrong extension makes Whisper reject the audio (the real
      // cause of "the mic does nothing" on mobile). Mirrors the composer path's extFor mapping.
      const ext = /mp4/i.test(audio.type) ? 'mp4' : /aac/i.test(audio.type) ? 'm4a' : /mpeg|mp3/i.test(audio.type) ? 'mp3' : /wav/i.test(audio.type) ? 'wav' : 'webm';
      fd.append('audio', audio, `speech.${ext}`);
      fd.append('language', lang === 'en' ? 'en-US' : lang === 'ru' ? 'ru-RU' : 'ka-GE');
      // V4 — every leg carries a client timeout so a HALF-OPEN network drop can't hang the orb
      // in 'thinking'/'speaking' forever. Generous windows (transcribe chains Whisper polling).
      const sr = await fetch('/api/voice/transcribe', { method: 'POST', body: fd, credentials: 'include', signal: AbortSignal.timeout(30_000) });
      const sj = (await sr.json().catch(() => null)) as { text?: string } | null;
      const said = (sj?.text || '').trim();
      if (!aliveRef.current) return;
      if (!said) { setStatus('idle'); return; }
      setTranscript(said);
      historyRef.current = [...historyRef.current, { role: 'user' as const, content: said }].slice(-12);

      // 2) LLM reply
      const cr = await fetch('/api/voice/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ text: said, locale: lang, history: historyRef.current }),
        signal: AbortSignal.timeout(25_000),
      });
      const cj = (await cr.json().catch(() => null)) as { reply?: string } | null;
      const answer = (cj?.reply || '').trim();
      if (!aliveRef.current) return;
      if (!answer) throw new Error('no reply');
      setReply(answer);
      historyRef.current = [...historyRef.current, { role: 'assistant' as const, content: answer }].slice(-12);

      // 3) TTS → CHUNKED sequential playback. Sending the WHOLE reply as ONE TTS request could get
      //    truncated by the provider ("audio stops after a word or two"); splitting into sentences
      //    and synthesising + playing them back-to-back (pre-fetching the next while the current
      //    plays) means a truncated/failed chunk is SKIPPED, not fatal. Numeric normalization to
      //    Georgian words happens server-side in the TTS route. Per-chunk timeout keeps a stall bounded.
      setStatus('speaking');
      const chunks = chunkForTts(answer);
      if (!chunks.length) { if (aliveRef.current) setStatus('idle'); return; }
      const synthChunk = async (chunk: string): Promise<string | null> => {
        try {
          const res = await fetch('/api/elevenlabs/tts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ text: chunk, locale: lang }), signal: AbortSignal.timeout(20_000),
          });
          if (!res.ok) return null;
          return URL.createObjectURL(await res.blob());
        } catch { return null; }
      };
      const el = audioRef.current ?? new Audio();
      audioRef.current = el;
      let played = false;
      let nextUrl: Promise<string | null> = synthChunk(chunks[0]!);
      for (let idx = 0; idx < chunks.length; idx++) {
        const url = await nextUrl;
        if (!aliveRef.current) { if (url) URL.revokeObjectURL(url); return; }
        nextUrl = idx + 1 < chunks.length ? synthChunk(chunks[idx + 1]!) : Promise.resolve(null);
        if (!url) continue; // a chunk truncated/failed → skip it, keep reading the rest
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = url;
        el.src = url;
        const blocked = await new Promise<boolean>((resolve) => {
          // A mid-play STALL (buffer underrun / wedged decoder on a flaky mobile network AFTER
          // playback started) fires neither onended nor onerror, and play() already resolved — so
          // without a guard this await would PARK FOREVER and pin the orb in 'speaking'. This is the
          // one leg the 3 fetches' AbortSignal.timeout didn't cover. 45s > any real ~600-char chunk
          // (<30s of speech), so it only trips on a genuine wedge, then advances to the next chunk.
          let done = false;
          const finish = (b: boolean) => { if (done) return; done = true; clearTimeout(guard); resolve(b); };
          const guard = setTimeout(() => finish(false), 45_000);
          el.onended = () => finish(false);
          el.onerror = () => finish(false);
          el.play().then(() => { played = true; }).catch(() => finish(true)); // autoplay blocked
        });
        if (blocked || !aliveRef.current) break; // block/close → stop; the reply text stays on screen
      }
      // Never synthesised a single chunk at all → treat as a TTS miss (retry state); otherwise the
      // reply was voiced (or is on-screen after an autoplay block) → clean idle.
      if (!aliveRef.current) return;
      if (!played && chunks.length) { setStatus('error'); setError(t.retry); }
      else setStatus('idle');
    } catch {
      if (aliveRef.current) { setStatus('error'); setError(t.retry); }
    }
  }, [lang, t.retry]);

  const stopRecording = useCallback(() => {
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
        if (blob.size > 512) void runTurn(blob); else setStatus('idle');
      };
      recorderRef.current = rec;
      rec.start();
      setStatus('listening');
    } catch {
      // getUserMedia OR the MediaRecorder constructor can throw AFTER the stream is live (e.g. iOS Safari
      // rejects both mime types) — stop + null the stream so the mic can never stay hot on the error path.
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setStatus('error'); setError(t.micDenied);
    }
  }, [runTurn, t.micDenied]);

  const onMicTap = useCallback(() => {
    if (status === 'listening') stopRecording();
    else if (status === 'idle' || status === 'error') void startRecording();
    // 'thinking'/'speaking' → ignore taps until the turn completes
  }, [status, startRecording, stopRecording]);

  const label = status === 'listening' ? t.listening : status === 'thinking' ? t.thinking : status === 'speaking' ? t.speaking : t.tapToTalk;
  const busy = status === 'thinking' || status === 'speaking';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-app-bg/95 backdrop-blur-md ag-no-drag" role="dialog" aria-label={t.title}>
      <button type="button" onClick={onClose} aria-label="close" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-app-muted transition hover:bg-white/[0.12] hover:text-app-text" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
        <X size={18} />
      </button>

      <span className="mb-8 text-[12px] font-semibold uppercase tracking-wider text-app-muted">{t.title}</span>

      {/* Conversation echo */}
      <div className="mb-10 min-h-[84px] w-full max-w-md px-6 text-center">
        {transcript && <p className="mb-2 text-[13px] text-app-muted"><span className="font-semibold text-app-text/70">{t.you}:</span> {transcript}</p>}
        {reply && <p className="text-[15px] leading-relaxed text-app-text"><span className="font-semibold text-app-accent">{t.assistant}:</span> {reply}</p>}
        {error && <p className="mt-2 flex items-center justify-center gap-1.5 text-[12.5px] text-rose-400"><AlertCircle size={14} /> {error}</p>}
      </div>

      {/* Mic orb */}
      <button
        type="button"
        onClick={onMicTap}
        disabled={busy}
        aria-label={label}
        className={`relative flex h-24 w-24 items-center justify-center rounded-full transition-all disabled:cursor-default ${
          status === 'listening' ? 'bg-rose-500 text-white shadow-[0_0_50px_-6px_rgba(244,63,94,0.7)]'
            : busy ? 'bg-app-accent/20 text-app-accent'
              : 'bg-app-accent text-app-bg shadow-[0_10px_40px_-8px_rgba(0,210,255,0.55)] hover:scale-105'
        }`}
      >
        {status === 'listening' && <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" />}
        {status === 'thinking' ? <Loader2 size={30} className="animate-spin" />
          : status === 'speaking' ? <Volume2 size={30} className="animate-pulse" />
            : <Mic size={30} />}
      </button>
      <span className="mt-5 text-[13.5px] font-medium text-app-muted">{label}</span>
    </div>
  );
}

export default VoiceConversation;
