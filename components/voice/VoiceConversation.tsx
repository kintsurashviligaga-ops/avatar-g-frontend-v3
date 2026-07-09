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
      fd.append('audio', audio, 'speech.webm');
      fd.append('language', lang === 'en' ? 'en-US' : lang === 'ru' ? 'ru-RU' : 'ka-GE');
      const sr = await fetch('/api/voice/transcribe', { method: 'POST', body: fd, credentials: 'include' });
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
      });
      const cj = (await cr.json().catch(() => null)) as { reply?: string } | null;
      const answer = (cj?.reply || '').trim();
      if (!aliveRef.current) return;
      if (!answer) throw new Error('no reply');
      setReply(answer);
      historyRef.current = [...historyRef.current, { role: 'assistant' as const, content: answer }].slice(-12);

      // 3) TTS → play (the route streams internally; we play the delivered audio)
      setStatus('speaking');
      const tr = await fetch('/api/elevenlabs/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ text: answer, locale: lang }),
      });
      if (!tr.ok) throw new Error('tts failed');
      const blob = await tr.blob();
      if (!aliveRef.current) return;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = URL.createObjectURL(blob);
      const el = audioRef.current ?? new Audio();
      audioRef.current = el;
      el.src = audioUrlRef.current;
      el.onended = () => { if (aliveRef.current) setStatus('idle'); };
      await el.play().catch(() => { if (aliveRef.current) setStatus('idle'); });
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
