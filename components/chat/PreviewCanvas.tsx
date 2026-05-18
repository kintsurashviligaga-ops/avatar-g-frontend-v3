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
import { Share2, Download, ExternalLink, Code2, Eye, Sparkles, X } from 'lucide-react';

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

export default function PreviewCanvas({ media, locale, onClear }: PreviewCanvasProps) {
  const t = COPY[locale];
  return (
    <aside className="hidden lg:flex flex-col h-full w-[40%] min-w-[400px] border-l border-white/[0.06] bg-black">
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
              <div className="relative mb-5">
                <div
                  className="w-28 h-28 rounded-full opacity-25"
                  style={{
                    background: 'radial-gradient(circle at 50% 40%, rgba(167,139,250,0.6) 0%, rgba(167,139,250,0.05) 55%, transparent 75%)',
                    filter: 'blur(8px)',
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles size={32} className="text-violet-200/55" />
                </div>
              </div>
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
      <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.02]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={prompt} className="w-full h-auto block" />
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3"
    >
      <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-black">
        <video
          ref={vidRef}
          src={url}
          poster={poster}
          autoPlay muted loop playsInline preload="metadata"
          onError={() => setErrored(true)}
          className="w-full h-auto block"
        />
        {errored && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center bg-black/60 text-rose-300 text-[13px]">
            <div>
              {t.open}: <a href={url} target="_blank" rel="noopener noreferrer" className="underline">{t.open}</a>
            </div>
          </div>
        )}
      </div>
      {prompt && <p className="text-[12px] text-white/50 italic px-1 line-clamp-3">{prompt}</p>}
      <ShareRow url={url} t={t} />
    </motion.div>
  );
}

// ─── Audio ────────────────────────────────────────────────────────────────────

function AudioPanel({ url, prompt, t }: { url: string; prompt: string; t: Strings }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3"
    >
      <div className="rounded-2xl border border-violet-400/20 bg-gradient-to-b from-violet-500/[0.06] to-violet-500/[0.02] p-6 flex items-center justify-center min-h-[220px]">
        <audio src={url} controls className="w-full max-w-[360px]" />
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
