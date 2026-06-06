'use client';

/**
 * OmniStudio (Service Hub — Card B). Google Gemini multimodal assistant.
 *
 * A continuous conversational grid wired to POST /api/chat/gemini (the funded
 * Gemini key; streams `data: {"text"}` deltas). Three input modes, per the
 * blueprint: a live MIC node (records a clip → /api/voice/transcribe → drops the
 * text into the prompt), an asset attachment broker (images sent natively as
 * Gemini image parts), and the director's text box. Strict skin — black · white ·
 * #00D2FF. Fail-soft throughout.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Mic, Square, Paperclip, X, Loader2, Sparkles } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<Lang, {
  title: string; subtitle: string; placeholder: string; empty: string; thinking: string; recording: string; micHint: string;
}> = {
  ka: {
    title: 'Google Omni სტუდია', subtitle: 'ინტელექტუალური მულტიმოდალური ასისტენტი (Gemini)',
    placeholder: 'დაწერე, ჩაწერე ხმა, ან მიამაგრე სურათი…', empty: 'ჰკითხე ნებისმიერი რამ — ტექსტი, ხმა ან სურათი. Gemini გაანალიზებს და გიპასუხებს.',
    thinking: 'ფიქრობს…', recording: 'იწერება…', micHint: 'ხმის ჩაწერა',
  },
  en: {
    title: 'Google Omni Studio', subtitle: 'Intelligent multimodal assistant (Gemini)',
    placeholder: 'Type, record your voice, or attach an image…', empty: 'Ask anything — text, voice or image. Gemini analyzes and responds.',
    thinking: 'Thinking…', recording: 'Recording…', micHint: 'Record voice',
  },
  ru: {
    title: 'Google Omni студия', subtitle: 'Интеллектуальный мультимодальный ассистент (Gemini)',
    placeholder: 'Напишите, запишите голос или прикрепите изображение…', empty: 'Спросите что угодно — текст, голос или изображение. Gemini анализирует и отвечает.',
    thinking: 'Думает…', recording: 'Запись…', micHint: 'Записать голос',
  },
};

interface Msg { role: 'user' | 'assistant'; text: string; image?: string }

export default function OmniStudio({ locale = 'ka' }: { locale?: Lang }) {
  const t = COPY[locale] ?? COPY.ka;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<string | null>(null); // image data URL
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  const lang = locale === 'en' ? 'en-US' : locale === 'ru' ? 'ru-RU' : 'ka-GE';

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !attachment) || busy) return;
    const userMsg: Msg = { role: 'user', text, ...(attachment ? { image: attachment } : {}) };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', text: '' }]);
    setInput(''); setAttachment(null); setBusy(true);

    // Build the Gemini payload: text-only → string content; with an image →
    // native multimodal parts (the route maps {type:'image'} → a Gemini image).
    const payload = history.map((m) => {
      if (m.image) {
        return { role: m.role, content: [
          ...(m.text ? [{ type: 'text', text: m.text }] : []),
          { type: 'image', image: m.image },
        ] };
      }
      return { role: m.role, content: m.text };
    });

    try {
      const res = await fetch('/api/chat/gemini', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }), credentials: 'include',
      });
      if (!res.ok || !res.body) throw new Error('stream failed');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const m = line.match(/^data:\s*(.+)$/s);
          if (!m) continue;
          try {
            const j = JSON.parse(m[1]!) as { text?: string };
            if (j.text) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === 'assistant') next[next.length - 1] = { ...last, text: last.text + j.text };
                return next;
              });
            }
          } catch { /* ignore non-JSON keepalive lines */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant' && !last.text) next[next.length - 1] = { ...last, text: '⚠️' };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }, [input, attachment, busy, messages]);

  const toggleMic = useCallback(async () => {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        setRecording(false);
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const fd = new FormData();
        fd.append('audio', blob, 'clip.webm');
        fd.append('language', lang);
        try {
          const r = await fetch('/api/voice/transcribe', { method: 'POST', body: fd });
          const j = (await r.json().catch(() => ({}))) as { text?: string };
          if (j.text) setInput((v) => (v ? `${v} ${j.text}` : j.text!));
        } catch { /* fail-soft */ }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }, [recording, lang]);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 py-4">
      <header className="mb-3 shrink-0">
        <h1 className="text-lg font-bold tracking-tight text-white">{t.title}</h1>
        <p className="mt-0.5 text-[13px] text-neutral-500">{t.subtitle}</p>
      </header>

      <div ref={feedRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00D2FF]/10 text-[#00D2FF]"><Sparkles size={22} /></span>
            <p className="max-w-sm text-sm text-neutral-500">{t.empty}</p>
          </div>
        ) : messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
              m.role === 'user' ? 'bg-[#00D2FF]/15 text-white ring-1 ring-[#00D2FF]/30' : 'bg-white/[0.04] text-neutral-200 ring-1 ring-white/10'
            }`}>
              {m.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image} alt="attachment" className="mb-2 max-h-48 rounded-lg" />
              )}
              {m.text || (busy && m.role === 'assistant' && i === messages.length - 1
                ? <span className="inline-flex items-center gap-1.5 text-neutral-500"><Loader2 size={13} className="animate-spin" /> {t.thinking}</span>
                : null)}
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="shrink-0 rounded-2xl border border-white/10 bg-black p-2">
        {attachment && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-[#00D2FF]/30 bg-[#00D2FF]/5 p-1 pr-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachment} alt="" className="h-10 w-10 rounded object-cover" />
            <button type="button" onClick={() => setAttachment(null)} className="text-neutral-400 hover:text-white"><X size={14} /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]; if (!f) return;
            const r = new FileReader(); r.onload = () => setAttachment(String(r.result)); r.readAsDataURL(f);
          }} />
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="attach"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-white/5 hover:text-white">
            <Paperclip size={18} />
          </button>
          <button type="button" onClick={() => void toggleMic()} aria-label={t.micHint}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
              recording ? 'animate-pulse bg-red-500/15 text-red-400' : 'text-neutral-400 hover:bg-white/5 hover:text-white'
            }`}>
            {recording ? <Square size={16} /> : <Mic size={18} />}
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            rows={1}
            placeholder={recording ? t.recording : t.placeholder}
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl bg-white/[0.04] px-3 py-2.5 text-[14px] text-white placeholder:text-neutral-600 outline-none focus:ring-1 focus:ring-[#00D2FF]/40"
          />
          <button type="button" onClick={() => void send()} disabled={busy || (!input.trim() && !attachment)} aria-label="send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#00D2FF] to-[#0085FF] text-black transition-all hover:brightness-110 disabled:opacity-40">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
