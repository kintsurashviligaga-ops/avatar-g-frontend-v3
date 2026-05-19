'use client';

/**
 * PreviewCanvas — desktop-only right panel that mirrors the latest
 * generated media at full canvas size. Lives next to MyAvatarChat
 * under the One Window principle.
 *
 *   ┌──────────────── desktop ────────────────┐
 *   │  Chat (60%)     │  PreviewCanvas (40%)  │
 *   │   ...           │  ┌──────────────────┐ │
 *   │                 │  │ media + share UI │ │
 *   │                 │  └──────────────────┘ │
 *   └─────────────────────────────────────────┘
 *
 * On screens <1024px this component is not rendered; the chat keeps
 * showing inline media via InlineMedia. The two preview surfaces
 * intentionally coexist so the mobile UX stays identical.
 *
 * Media kinds:
 *   - image: motion-fade <img> with click-to-fullscreen
 *   - video: native <video> with autoplay+loop, poster fallback
 *   - audio: large play button + waveform
 *   - code:  sandboxed <iframe srcDoc> with Preview/Code tabs
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Download, ExternalLink, Code2, Eye, Sparkles, X, Twitter, Facebook, Send as TelegramSend, MessageCircle, Copy as CopyIcon, Check, Play, Pause, Volume2, VolumeX } from 'lucide-react';

export interface PreviewMedia {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'code';
  url?: string;
  html?: string;
  language?: string;
  poster?: string;
  prompt?: string;
}

interface PreviewCanvasProps {
  media: PreviewMedia | null;
  locale: 'ka' | 'en' | 'ru';
  onClear?: () => void;
  variant?: 'desktop' | 'mobile';
}

type Strings = {
  empty_title: string;
  empty_subtitle: string;
  share: string;
  download: string;
  open: string;
  code: string;
  preview: string;
  clear: string;
  code_label: string;
};

const COPY: Record<'ka' | 'en' | 'ru', Strings> = {
  ka: {
    empty_title:    'შენი ნამუშევარი აქ გამოჩნდება',
    empty_subtitle: 'შექმენი რამე ჩატის მხრიდან — სურათი, ვიდეო, აპლიკაცია — და მაშინვე ნახავ აქ სრულ ხედში.',
    share:          'გაზიარება',
    download:       'ჩამოტვირთვა',
    open:           'გახსნა',
    code:           'კოდი',
    preview:        'პრევიუ',
    clear:          'გასუფთავება',
    code_label:     'აპლიკაცია',
  },
  en: {
    empty_title:    'Your creation will appear here',
    empty_subtitle: 'Generate something from the chat side — image, video, app — and you\'ll see it here in full.',
    share:          'Share',
    download:       'Download',
    open:           'Open',
    code:           'Code',
    preview:        'Preview',
    clear:          'Clear',
    code_label:     'App',
  },
  ru: {
    empty_title:    'Ваша работа появится здесь',
    empty_subtitle: 'Создайте что-нибудь из чата — изображение, видео, приложение — и сразу увидите здесь в полный размер.',
    share:          'Поделиться',
    download:       'Скачать',
    open:           'Открыть',
    code:           'Код',
    preview:        'Превью',
    clear:          'Очистить',
    code_label:     'Приложение',
  },
};

export default function PreviewCanvas({ media, locale, onClear, variant = 'desktop' }: PreviewCanvasProps) {
  const t = COPY[locale];
  const containerCls = variant === 'mobile'
    ? 'flex flex-col h-full w-full bg-black'
    : 'hidden lg:flex flex-col h-full w-[40%] min-w-[400px] border-l border-white/[0.06] bg-black';
  return (
    <aside className={containerCls}>
      <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-violet-300/80" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/55">
            {locale === 'ka' ? 'პრევიუ' : locale === 'ru' ? 'Превью' : 'Preview'}
          </span>
        </div>
        {media && onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label={t.clear}
            className="h-7 w-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-white/45 hover:text-white transition"
          >
            <X size={14} />
          </button>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <AnimatePresence mode="wait">
          {!media ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col items-center justify-center text-center"
            >
              <Sparkles size={32} className="text-white/30 mb-5" />
              <h3 className="text-[18px] font-semibold text-white/85 mb-2">{t.empty_title}</h3>
              <p className="text-[13px] text-white/45 max-w-[320px] leading-relaxed">{t.empty_subtitle}</p>
            </motion.div>
          ) : media.kind === 'code' && media.html ? (
            <CodePanel key={`code-${media.id}`} html={media.html} language={media.language} t={t} />
          ) : media.kind === 'image' && media.url ? (
            <ImagePanel key={`img-${media.id}`} url={media.url} prompt={media.prompt ?? ''} t={t} />
          ) : media.kind === 'video' && media.url ? (
            <VideoPanel key={`vid-${media.id}`} url={media.url} poster={media.poster} prompt={media.prompt ?? ''} t={t} />
          ) : media.kind === 'audio' && media.url ? (
            <AudioPanel key={`aud-${media.id}`} url={media.url} prompt={media.prompt ?? ''} t={t} />
          ) : null}
        </AnimatePresence>
      </div>
    </aside>
  );
}

// ─── Image ────────────────────────────────────────────────────────────────────

function ImagePanel({ url, prompt, t }: { url: string; prompt: string; t: Strings }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3"
    >
      <div className="relative group rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.02]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={prompt} className="w-full h-auto block" />
        <SocialShareOverlay url={url} prompt={prompt} />
      </div>
      {prompt && <p className="text-[12px] text-white/50 italic px-1 line-clamp-3">{prompt}</p>}
      <ShareRow url={url} t={t} />
    </motion.div>
  );
}

// ─── Video ────────────────────────────────────────────────────────────────────

function VideoPanel({ url, poster, prompt, t }: { url: string; poster?: string; prompt: string; t: Strings }) {
  const vidRef = useRef<HTMLVideoElement>(null);
  const [errored, setErrored] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    const onTime = () => setCurrent(v.currentTime);
    const onLoad = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onLoad);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onLoad);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, []);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = vidRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    v.currentTime = Math.max(0, Math.min(duration, pct * duration));
  };

  const togglePlay = () => {
    const v = vidRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };

  const toggleMute = () => {
    const v = vidRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const progress = duration > 0 ? current / duration : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3"
    >
      <div className="relative group rounded-2xl overflow-hidden border border-white/[0.08] bg-black">
        <video
          ref={vidRef}
          src={url}
          poster={poster}
          autoPlay muted loop playsInline preload="metadata"
          onError={() => setErrored(true)}
          className="w-full h-auto block"
        />
        {!errored && <SocialShareOverlay url={url} prompt={prompt} />}
        {errored && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center bg-black/60 text-rose-300 text-[13px]">
            <div>
              {t.open}: <a href={url} target="_blank" rel="noopener noreferrer" className="underline">{t.open}</a>
            </div>
          </div>
        )}
        {!errored && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent p-2.5 pt-6 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
            <div onClick={seek} role="slider" aria-label="Scrub" aria-valuenow={Math.round(progress * 100)}
              className="h-1 w-full rounded-full bg-white/15 cursor-pointer mb-2 relative">
              <div className="absolute top-0 left-0 h-full rounded-full bg-violet-300" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button type="button" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}
                  className="h-7 w-7 rounded-full bg-black/55 hover:bg-black/80 flex items-center justify-center text-white">
                  {playing ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}
                  className="h-7 w-7 rounded-full bg-black/55 hover:bg-black/80 flex items-center justify-center text-white">
                  {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
              </div>
              <span className="text-[10px] text-white/65 font-mono tabular-nums">{fmtTime(current)} / {fmtTime(duration)}</span>
            </div>
          </div>
        )}
      </div>
      {prompt && <p className="text-[12px] text-white/50 italic px-1 line-clamp-3">{prompt}</p>}
      <ShareRow url={url} t={t} />
    </motion.div>
  );
}

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ─── Audio ────────────────────────────────────────────────────────────────────

function AudioPanel({ url, prompt, t }: { url: string; prompt: string; t: Strings }) {
  const audRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onLoad = () => setDuration(a.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onLoad);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onLoad);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    a.currentTime = Math.max(0, Math.min(duration, pct * duration));
  };

  const bars = Array.from({ length: 48 }, (_, i) => 0.3 + ((Math.sin(i * 1.7) + 1) / 2) * 0.7);
  const progress = duration > 0 ? current / duration : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3"
    >
      <div className="relative rounded-2xl border border-violet-400/20 bg-gradient-to-b from-violet-500/[0.10] to-violet-500/[0.02] p-6 min-h-[220px] flex flex-col justify-center">
        <audio ref={audRef} src={url} preload="metadata" />
        <SocialShareOverlay url={url} prompt={prompt} />
        <div className="flex items-center gap-4">
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}
            className="h-12 w-12 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-white flex items-center justify-center shadow-[0_0_24px_rgba(139,92,246,0.4)] hover:scale-105 transition flex-shrink-0">
            {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
          <div className="flex-1 min-w-0">
            <div onClick={seek} role="slider" aria-label="Scrub" aria-valuenow={Math.round(progress * 100)}
              className="flex items-center gap-[2px] h-10 cursor-pointer">
              {bars.map((h, i) => {
                const active = i / bars.length < progress;
                return (
                  <span key={i} className="flex-1 min-w-[2px] rounded-full transition-colors"
                    style={{ height: `${Math.round(h * 100)}%`, background: active ? 'linear-gradient(180deg,#a855f7,#6d28d9)' : 'rgba(255,255,255,0.18)' }} />
                );
              })}
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-white/55 font-mono tabular-nums">
              <span>{fmtTime(current)}</span>
              <span>{fmtTime(duration)}</span>
            </div>
          </div>
        </div>
      </div>
      {prompt && <p className="text-[12px] text-white/50 italic px-1 line-clamp-3">{prompt}</p>}
      <ShareRow url={url} t={t} />
    </motion.div>
  );
}

// ─── Code / HTML app sandbox ─────────────────────────────────────────────────

function CodePanel({ html, language, t }: { html: string; language?: string; t: Strings }) {
  const [view, setView] = useState<'preview' | 'code'>('preview');
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3 h-full flex flex-col"
    >
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden flex flex-col flex-1 min-h-[420px]">
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/[0.06] bg-black/40">
          <Tab active={view === 'preview'} onClick={() => setView('preview')}>
            <Eye size={11} />{t.preview}
          </Tab>
          <Tab active={view === 'code'} onClick={() => setView('code')}>
            <Code2 size={11} />{t.code}
          </Tab>
          {language && (
            <span className="ml-auto px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">
              {language}
            </span>
          )}
        </div>
        <div className="flex-1 min-h-0">
          {view === 'preview' ? (
            <iframe
              title="App preview"
              srcDoc={html}
              sandbox="allow-scripts allow-same-origin"
              className="w-full h-full border-0 bg-white block"
            />
          ) : (
            <pre className="w-full h-full overflow-auto p-4 text-[12px] leading-[1.55] text-zinc-100 font-mono bg-black/60">
              <code>{html}</code>
            </pre>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => downloadHtml(html, 'app.html')}
        className="inline-flex items-center justify-center gap-2 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white text-[12px] font-medium border border-white/[0.08] transition"
      >
        <Download size={13} />
        {t.download}
      </button>
    </motion.div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
        active
          ? 'bg-violet-500/15 text-violet-200 border border-violet-400/30'
          : 'text-white/50 hover:text-white/80 border border-transparent'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Social-share overlay (on top of media, per One Window brief) ────────────

function SocialShareOverlay({ url, prompt }: { url: string; prompt: string }) {
  const [copied, setCopied] = useState(false);
  const txt = encodeURIComponent(prompt ? `${prompt.slice(0, 120)} — myavatar.ge` : 'Made with myavatar.ge');
  const enc = encodeURIComponent(url);
  const links: Array<{ key: string; href: string; label: string; Icon: typeof Twitter }> = [
    { key: 'x',  href: `https://twitter.com/intent/tweet?url=${enc}&text=${txt}`,         label: 'X',         Icon: Twitter },
    { key: 'fb', href: `https://www.facebook.com/sharer/sharer.php?u=${enc}`,             label: 'Facebook',  Icon: Facebook },
    { key: 'wa', href: `https://wa.me/?text=${txt}%20${enc}`,                              label: 'WhatsApp',  Icon: MessageCircle },
    { key: 'tg', href: `https://t.me/share/url?url=${enc}&text=${txt}`,                   label: 'Telegram',  Icon: TelegramSend },
  ];
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  };
  return (
    <div className="absolute top-2 right-2 z-[2] flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-md border border-white/[0.10] p-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
      {links.map(l => (
        <a
          key={l.key}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Share to ${l.label}`}
          className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-white/[0.10] text-white/85 hover:text-white transition"
        >
          <l.Icon size={13} />
        </a>
      ))}
      <button
        type="button"
        onClick={copyUrl}
        aria-label="Copy link"
        className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-white/[0.10] text-white/85 hover:text-white transition"
      >
        {copied ? <Check size={13} className="text-emerald-300" /> : <CopyIcon size={13} />}
      </button>
    </div>
  );
}

// ─── Share row ────────────────────────────────────────────────────────────────

function ShareRow({ url, t }: { url: string; t: Strings }) {
  const onShare = async () => {
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ url }); return; } catch { /* fall through */ }
    }
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
  };
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onShare}
        className="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-full bg-white text-black text-[12px] font-semibold hover:bg-white/90 transition"
      >
        <Share2 size={13} />
        {t.share}
      </button>
      <a
        href={url}
        download
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white text-[12px] font-medium border border-white/[0.08] transition"
      >
        <Download size={13} />
        {t.download}
      </a>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white/85 border border-white/[0.08] transition"
        aria-label={t.open}
      >
        <ExternalLink size={13} />
      </a>
    </div>
  );
}

function downloadHtml(html: string, filename: string) {
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch { /* ignore */ }
}
