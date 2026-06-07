'use client';

/**
 * OmniStudio (Service Hub — Card B). MyAvatar Smart Assistant (multimodal).
 *
 * A continuous conversational grid wired to POST /api/chat/gemini (the funded
 * Gemini key; streams `data: {"text"}` deltas). Three input modes, per the
 * blueprint: a live MIC node (records a clip → /api/voice/transcribe → drops the
 * text into the prompt), an asset attachment broker (images sent natively as
 * Gemini image parts), and the director's text box. Strict skin — black · white ·
 * #00D2FF. Fail-soft throughout.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Mic, Square, Paperclip, X, Loader2, Sparkles, Film, Music2, FileText, Image as ImageIcon, Download, MessageSquare, Wand2 } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<Lang, {
  title: string; subtitle: string; placeholder: string; empty: string; thinking: string; recording: string; micHint: string;
  modeChat: string; modeImage: string; imgPlaceholder: string; generatingImage: string; imageFailed: string; imgDownload: string;
  magicHint: string;
}> = {
  ka: {
    title: 'ჭკვიანი ასისტენტი', subtitle: 'ინტელექტუალური მულტიმოდალური ასისტენტი',
    placeholder: 'დაწერე, ჩაწერე ხმა, ან მიამაგრე სურათი…', empty: 'ჰკითხე ნებისმიერი რამ — ტექსტი, ხმა ან სურათი. ასისტენტი გაანალიზებს და გიპასუხებს.',
    thinking: 'ფიქრობს…', recording: 'იწერება…', micHint: 'ხმის ჩაწერა',
    modeChat: 'პასუხი', modeImage: 'სურათი', imgPlaceholder: 'აღწერე სურათი, რომ დაგიხატო…',
    generatingImage: 'სურათი იქმნება…', imageFailed: 'სურათის გენერაცია ვერ მოხერხდა. სცადე თავიდან.', imgDownload: 'ჩამოტვირთვა',
    magicHint: 'AI-ით პრომპტის გაუმჯობესება',
  },
  en: {
    title: 'Smart Assistant', subtitle: 'Intelligent multimodal assistant',
    placeholder: 'Type, record your voice, or attach an image…', empty: 'Ask anything — text, voice or image. The assistant analyzes and responds.',
    thinking: 'Thinking…', recording: 'Recording…', micHint: 'Record voice',
    modeChat: 'Answer', modeImage: 'Image', imgPlaceholder: 'Describe an image to generate…',
    generatingImage: 'Generating image…', imageFailed: 'Image generation failed. Try again.', imgDownload: 'Download',
    magicHint: 'Enhance prompt with AI',
  },
  ru: {
    title: 'Умный ассистент', subtitle: 'Интеллектуальный мультимодальный ассистент',
    placeholder: 'Напишите, запишите голос или прикрепите изображение…', empty: 'Спросите что угодно — текст, голос или изображение. Ассистент анализирует и отвечает.',
    thinking: 'Думает…', recording: 'Запись…', micHint: 'Записать голос',
    modeChat: 'Ответ', modeImage: 'Изображение', imgPlaceholder: 'Опишите изображение для генерации…',
    generatingImage: 'Генерирую изображение…', imageFailed: 'Не удалось сгенерировать изображение. Попробуйте снова.', imgDownload: 'Скачать',
    magicHint: 'Улучшить промпт с AI',
  },
};

interface Media { dataUrl: string; mimeType: string }
interface Msg { role: 'user' | 'assistant'; text: string; media?: Media; imageUrl?: string }

const isImage = (m: string) => m.startsWith('image/');
const isAudio = (m: string) => m.startsWith('audio/');
const isVideo = (m: string) => m.startsWith('video/');

export default function OmniStudio({ locale = 'ka' }: { locale?: Lang }) {
  const t = COPY[locale] ?? COPY.ka;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<Media | null>(null); // image / audio / video / pdf
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  // Composer mode: 'chat' → Gemini multimodal answer; 'image' → NanoBanana image
  // GENERATION (the prompt becomes a brand-new image rendered in the feed).
  const [mode, setMode] = useState<'chat' | 'image'>('chat');
  // Full-screen image lightbox — holds the URL of the tapped picture (generated or
  // attached). null = closed. Tap a chat image to open; backdrop / X / Esc closes.
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Magic Wand — true while the prompt is being AI-enhanced in place.
  const [enhancing, setEnhancing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  // Close the full-screen lightbox on Escape (desktop affordance; the backdrop tap
  // and the X button cover touch).
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const lang = locale === 'en' ? 'en-US' : locale === 'ru' ? 'ru-RU' : 'ka-GE';

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !attachment) || busy) return;

    // ── IMAGE GENERATION (NanoBanana) ──────────────────────────────────────────
    // In image mode the typed prompt becomes a brand-new image: POST it to
    // /api/nanobanana/image and render the returned URL as an assistant image
    // bubble. Text prompt is required; fail-soft to a clean retry notice.
    if (mode === 'image' && text) {
      setMessages((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: '' }]);
      setInput(''); setBusy(true);
      try {
        const res = await fetch('/api/nanobanana/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, quality: 'high', aspectRatio: '1:1' }),
          credentials: 'include',
        });
        const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string };
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            next[next.length - 1] =
              j.success && j.url
                ? { role: 'assistant', text: '', imageUrl: j.url }
                : { role: 'assistant', text: `⚠️ ${t.imageFailed}` };
          }
          return next;
        });
      } catch {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.imageFailed}` };
          return next;
        });
      } finally {
        setBusy(false);
      }
      return;
    }

    const userMsg: Msg = { role: 'user', text, ...(attachment ? { media: attachment } : {}) };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', text: '' }]);
    setInput(''); setAttachment(null); setBusy(true);

    // Build the Gemini payload: text-only → string content; with media → native
    // multimodal parts. Images map to a {type:'image'} part; audio / video / pdf
    // map to a {type:'file'} part that the route forwards to Gemini as inline_data
    // (Priority 2 — full native audio + video understanding).
    const payload = history.map((m) => {
      if (m.media) {
        const mediaPart = isImage(m.media.mimeType)
          ? { type: 'image', image: m.media.dataUrl }
          : { type: 'file', data: m.media.dataUrl, mimeType: m.media.mimeType };
        return { role: m.role, content: [
          ...(m.text ? [{ type: 'text', text: m.text }] : []),
          mediaPart,
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
  }, [input, attachment, busy, messages, mode, t.imageFailed]);

  // Magic Wand — rewrite the current textarea prompt into an AI-optimized version
  // IN PLACE (Section 7 / 8A). Fail-soft: the endpoint returns the original prompt
  // on any miss, so the composer is never blanked.
  const magicEnhance = useCallback(async () => {
    const text = input.trim();
    if (!text || enhancing || busy) return;
    setEnhancing(true);
    try {
      const res = await fetch('/api/ai/magic-wand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
        credentials: 'include',
      });
      const j = (await res.json().catch(() => ({}))) as { enhanced?: string };
      if (j.enhanced && j.enhanced.trim()) setInput(j.enhanced.trim());
    } catch {
      /* fail-soft — keep the original prompt */
    } finally {
      setEnhancing(false);
    }
  }, [input, enhancing, busy]);

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
    <div
      className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 pt-4"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
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
              {m.media && (
                isImage(m.media.mimeType) ? (
                  <button type="button" onClick={() => setLightbox(m.media!.dataUrl)} className="mb-2 block cursor-zoom-in" aria-label="open fullscreen">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.media.dataUrl} alt="attachment" className="max-h-48 rounded-lg" />
                  </button>
                ) : isVideo(m.media.mimeType) ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={m.media.dataUrl} controls className="mb-2 max-h-48 rounded-lg" />
                ) : isAudio(m.media.mimeType) ? (
                  <audio src={m.media.dataUrl} controls className="mb-2 w-full" />
                ) : (
                  <span className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1 text-[11px] text-neutral-400"><FileText size={12} /> document</span>
                )
              )}
              {m.imageUrl && (
                <div className="space-y-1.5">
                  <button type="button" onClick={() => setLightbox(m.imageUrl!)} className="block w-full cursor-zoom-in" aria-label="open fullscreen">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.imageUrl} alt="generated" className="max-h-80 w-full rounded-lg object-contain transition-opacity hover:opacity-90" />
                  </button>
                  <a
                    href={m.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#00D2FF] hover:underline"
                  >
                    <Download size={11} /> {t.imgDownload}
                  </a>
                </div>
              )}
              {m.text || (busy && m.role === 'assistant' && i === messages.length - 1
                ? <span className="inline-flex items-center gap-1.5 text-neutral-500"><Loader2 size={13} className="animate-spin" /> {mode === 'image' ? t.generatingImage : t.thinking}</span>
                : null)}
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="shrink-0 rounded-2xl border border-white/10 bg-black p-2">
        {/* Mode toggle — Chat (multimodal answer) vs Image (NanoBanana generation). */}
        <div className="mb-2 inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5 text-[12px] font-medium">
          <button
            type="button"
            onClick={() => setMode('chat')}
            aria-pressed={mode === 'chat'}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${mode === 'chat' ? 'bg-[#00D2FF]/15 text-[#00D2FF]' : 'text-neutral-400 hover:text-white'}`}
          >
            <MessageSquare size={13} /> {t.modeChat}
          </button>
          <button
            type="button"
            onClick={() => setMode('image')}
            aria-pressed={mode === 'image'}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${mode === 'image' ? 'bg-[#00D2FF]/15 text-[#00D2FF]' : 'text-neutral-400 hover:text-white'}`}
          >
            <ImageIcon size={13} /> {t.modeImage}
          </button>
        </div>
        {attachment && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-[#00D2FF]/30 bg-[#00D2FF]/5 p-1 pr-2">
            {isImage(attachment.mimeType) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={attachment.dataUrl} alt="" className="h-10 w-10 rounded object-cover" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded bg-black text-[#00D2FF]">
                {isVideo(attachment.mimeType) ? <Film size={16} /> : isAudio(attachment.mimeType) ? <Music2 size={16} /> : <FileText size={16} />}
              </span>
            )}
            <button type="button" onClick={() => setAttachment(null)} className="text-neutral-400 hover:text-white"><X size={14} /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*,audio/*,video/*,application/pdf" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]; if (!f) return;
            const r = new FileReader(); r.onload = () => setAttachment({ dataUrl: String(r.result), mimeType: f.type || 'application/octet-stream' }); r.readAsDataURL(f);
          }} />
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="attach"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-white/5 hover:text-white">
            <Paperclip size={18} />
          </button>
          <button type="button" onClick={() => void toggleMic()} aria-label={t.micHint}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
              recording ? 'animate-pulse bg-red-500/15 text-red-400' : 'text-neutral-400 hover:bg-white/5 hover:text-white'
            }`}>
            {recording ? <Square size={16} /> : <Mic size={18} />}
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            rows={1}
            disabled={enhancing}
            placeholder={recording ? t.recording : mode === 'image' ? t.imgPlaceholder : t.placeholder}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl bg-white/[0.04] px-3 py-3 text-[16px] text-white placeholder:text-neutral-600 outline-none focus:ring-1 focus:ring-[#00D2FF]/40 disabled:opacity-60"
          />
          {/* Magic Wand — one-tap AI prompt enhancement, in place. */}
          <button
            type="button"
            onClick={() => void magicEnhance()}
            disabled={enhancing || busy || !input.trim()}
            aria-label={t.magicHint}
            title={t.magicHint}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-white/5 hover:text-[#00D2FF] disabled:opacity-40"
          >
            {enhancing ? <Loader2 size={18} className="animate-spin text-[#00D2FF]" /> : <Wand2 size={18} />}
          </button>
          <button type="button" onClick={() => void send()} disabled={busy || (!input.trim() && !attachment)} aria-label="send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#00D2FF] to-[#0085FF] text-black transition-all hover:brightness-110 disabled:opacity-40">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>

      {/* Full-screen image lightbox — tap any chat image to open it edge-to-edge.
          Backdrop tap / the X button / Esc all close it; the picture itself swallows
          the click so it stays open while you inspect it. */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="close"
            className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            <X size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="fullscreen"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[96vw] rounded-lg object-contain"
          />
          <a
            href={lightbox}
            target="_blank"
            rel="noopener noreferrer"
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 mx-auto inline-flex w-fit items-center gap-1.5 rounded-lg border border-[#00D2FF]/30 bg-[#00D2FF]/10 px-3 py-1.5 text-[13px] font-semibold text-[#00D2FF] backdrop-blur"
            style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <Download size={14} /> {t.imgDownload}
          </a>
        </div>
      )}
    </div>
  );
}
