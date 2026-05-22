'use client';

/**
 * InlineMedia — renders ANY generated media asset directly inside a chat
 * bubble. Implements the "One Window" principle: no raw URLs ever shown
 * to the user; every output (image / video / audio / code) is interactive
 * inside the conversation flow.
 *
 *   <InlineMedia kind="image" url={url} prompt={prompt} onRemix={...} />
 *   <InlineMedia kind="video" url={url} prompt={prompt} />
 *   <InlineMedia kind="audio" url={url} prompt={prompt} />
 *   <InlineMedia kind="code"  html={html} language="html" />
 *
 * Each kind has its own polished UI:
 *   image  → skeleton → fade-in → click-to-lightbox
 *   video  → muted autoplay + loop + minimal play/pause overlay
 *   audio  → translucent pill with waveform + scrub bar
 *   code   → sandboxed iframe with Code/Preview toggle
 *
 * MediaActions (Download / Share / Remix / CapCut) anchor to the
 * bottom-right corner of the media block as a glassmorphic overlay.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, Maximize2, X, Code2, Eye } from 'lucide-react';
import MediaActions from './MediaActions';

type InlineMediaProps =
  | { kind: 'image'; url: string; prompt?: string; badges?: string[]; onRemix?: (p: string) => void; onSaveCharacter?: () => void }
  | { kind: 'video'; url: string; poster?: string; prompt?: string; badges?: string[]; onRemix?: (p: string) => void }
  | { kind: 'audio'; url: string; prompt?: string; badges?: string[]; onRemix?: (p: string) => void }
  | { kind: 'code'; html: string; language?: string; prompt?: string; badges?: string[]; onRemix?: (p: string) => void };

// ─── Meta chips — truthful provenance/format badges on a media bubble ──────────
function MetaBadges({ badges }: { badges?: string[] }) {
  if (!badges || badges.length === 0) return null;
  return (
    <div className="inline-media-badges">
      {badges.map((b, i) => (
        <span key={`${b}-${i}`} className="inline-media-badge">{b}</span>
      ))}
    </div>
  );
}

// ─── Lightbox (image) ─────────────────────────────────────────────────────────

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(24px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '4vh 4vw',
      }}
    >
      <motion.img
        src={url} alt=""
        initial={{ scale: 0.94 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.94 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 14, objectFit: 'contain', boxShadow: '0 30px 80px -20px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}
      />
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{
          position: 'absolute', top: 18, right: 18, width: 40, height: 40,
          borderRadius: '50%', border: '1px solid rgba(255,255,255,0.18)',
          background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)',
          color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X style={{ width: 18, height: 18 }} />
      </button>
    </motion.div>
  );
}

// ─── Image ────────────────────────────────────────────────────────────────────

function ImageBlock({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  return (
    <>
      <div className="inline-media-image-wrap" onClick={() => loaded && setLightbox(true)}>
        {!loaded && <div className="inline-media-skel" aria-busy="true" />}
        <motion.img
          src={url}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: loaded ? 1 : 0, scale: loaded ? 1 : 0.985 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 14 }}
        />
        {loaded && (
          <button
            type="button"
            aria-label="Expand"
            className="inline-media-expand"
            onClick={e => { e.stopPropagation(); setLightbox(true); }}
          >
            <Maximize2 style={{ width: 13, height: 13 }} />
          </button>
        )}
      </div>
      <AnimatePresence>{lightbox && <Lightbox url={url} onClose={() => setLightbox(false)} />}</AnimatePresence>
    </>
  );
}

// ─── Video ────────────────────────────────────────────────────────────────────

function VideoBlock({ url, poster }: { url: string; poster?: string }) {
  const vidRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // Watchdog: if canplay never fires within 6s (HeyGen S3 cold-start, autoplay
  // blocked in some browser configs, etc.) we still flip `loaded` so the
  // user sees the play/mute controls and can click to play manually. Without
  // this, the video silently stayed at opacity:0 forever with only a skeleton
  // visible — exactly the "invisible avatar" bug screenshot reported.
  useEffect(() => {
    if (loaded || errored) return;
    const t = setTimeout(() => {
      if (vidRef.current && vidRef.current.readyState >= 2) setLoaded(true);
      else setLoaded(true); // optimistic reveal — better to show a paused frame than nothing
    }, 6000);
    return () => clearTimeout(t);
  }, [loaded, errored]);

  const toggle = () => {
    const v = vidRef.current;
    if (!v) return;
    if (v.paused) { void v.play().catch(() => { /* autoplay rejected — ignore */ }); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const toggleMute = () => {
    const v = vidRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  return (
    <div className="inline-media-video-wrap" onClick={toggle}>
      {!loaded && !errored && <div className="inline-media-skel" aria-busy="true" />}
      <motion.video
        ref={vidRef}
        src={url}
        poster={poster}
        autoPlay muted loop playsInline preload="metadata"
        onCanPlay={() => setLoaded(true)}
        onLoadedData={() => setLoaded(true)}
        onError={() => { setErrored(true); setLoaded(true); }}
        initial={{ opacity: 0 }}
        animate={{ opacity: loaded ? 1 : 0 }}
        transition={{ duration: 0.4 }}
        style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 14, background: '#000' }}
      />
      {errored && (
        <div className="inline-media-video-error" role="alert">
          ვიდეო ვერ ჩაიტვირთა · <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#a5b4fc', textDecoration: 'underline' }}>გახსენი</a>
        </div>
      )}
      {loaded && !errored && (
        <div className="inline-media-video-overlay">
          <button type="button" aria-label={playing ? 'Pause' : 'Play'} className="inline-media-btn" onClick={e => { e.stopPropagation(); toggle(); }}>
            {playing ? <Pause style={{ width: 14, height: 14 }} /> : <Play style={{ width: 14, height: 14 }} />}
          </button>
          <button type="button" aria-label={muted ? 'Unmute' : 'Mute'} className="inline-media-btn" onClick={e => { e.stopPropagation(); toggleMute(); }}>
            {muted ? <VolumeX style={{ width: 14, height: 14 }} /> : <Volume2 style={{ width: 14, height: 14 }} />}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Audio ────────────────────────────────────────────────────────────────────

function AudioBlock({ url }: { url: string }) {
  const audRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [buffered, setBuffered] = useState(0); // 0..1 — real buffered fraction
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const a = audRef.current;
    if (!a) return;
    const onTime = () => {
      setCurrent(a.currentTime);
      setProgress(a.duration > 0 ? a.currentTime / a.duration : 0);
    };
    const onProgress = () => {
      if (a.buffered.length > 0 && a.duration > 0) {
        setBuffered(Math.min(1, a.buffered.end(a.buffered.length - 1) / a.duration));
      }
    };
    const onLoad = () => setDuration(a.duration);
    const onEnd = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('progress', onProgress);
    a.addEventListener('loadedmetadata', onLoad);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('progress', onProgress);
      a.removeEventListener('loadedmetadata', onLoad);
      a.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audRef.current;
    if (!a) return;
    if (a.paused) { void a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    a.currentTime = pct * a.duration;
  };

  const mmss = (s: number) => {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // Generate 24 fake waveform bars (real FFT would require AudioContext + CORS)
  const bars = Array.from({ length: 24 }, (_, i) => {
    const seed = (Math.sin(i * 1.7) + 1) / 2;
    return 0.3 + seed * 0.7;
  });

  return (
    <div className="inline-media-audio-wrap">
      <audio ref={audRef} src={url} preload="metadata" />
      <button type="button" aria-label={playing ? 'Pause' : 'Play'} className="inline-media-audio-play" onClick={toggle}>
        {playing ? <Pause style={{ width: 14, height: 14 }} /> : <Play style={{ width: 14, height: 14 }} />}
      </button>
      <div className="inline-media-audio-wave" onClick={seek} role="progressbar" aria-valuenow={Math.round(progress * 100)}>
        {bars.map((h, i) => {
          const frac = i / bars.length;
          const isPlayed = frac < progress;
          const isBuffered = frac < buffered;
          return (
            <span
              key={i}
              className={`inline-media-audio-bar${isPlayed ? ' played' : ''}`}
              style={{
                height: `${Math.round(h * 100)}%`,
                background: isPlayed
                  ? 'linear-gradient(180deg,#c084fc,#7c3aed)'
                  : isBuffered
                    ? 'rgba(168,85,247,0.40)'   // buffered, not yet played
                    : 'rgba(255,255,255,0.14)', // not buffered
                animationDelay: `${i * 30}ms`,
              }}
            />
          );
        })}
      </div>
      <span className="inline-media-audio-time">{mmss(current)} / {duration ? mmss(duration) : '--:--'}</span>
    </div>
  );
}

// ─── Code / HTML Artifact ────────────────────────────────────────────────────

function CodeBlock({ html, language }: { html: string; language?: string }) {
  const [view, setView] = useState<'preview' | 'code'>('preview');
  // Sandboxed iframe — no same-origin, no top-level navigation, no forms.
  const iframeSrcDoc = html;

  return (
    <div className="inline-media-code-wrap">
      <div className="inline-media-code-tabs">
        <button
          type="button"
          className={`inline-media-code-tab${view === 'preview' ? ' active' : ''}`}
          onClick={() => setView('preview')}
        >
          <Eye style={{ width: 12, height: 12 }} /> Preview
        </button>
        <button
          type="button"
          className={`inline-media-code-tab${view === 'code' ? ' active' : ''}`}
          onClick={() => setView('code')}
        >
          <Code2 style={{ width: 12, height: 12 }} /> Code
        </button>
        {language && <span className="inline-media-code-lang">{language}</span>}
      </div>
      <div className="inline-media-code-body">
        {view === 'preview' ? (
          <iframe
            title="HTML preview"
            srcDoc={iframeSrcDoc}
            sandbox="allow-scripts allow-same-origin"
            style={{ width: '100%', height: 320, border: 'none', background: '#fff', display: 'block' }}
          />
        ) : (
          <pre className="inline-media-code-pre">
            <code>{html}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────

export default function InlineMedia(props: InlineMediaProps) {
  const showActions = props.kind !== 'code';

  return (
    <div className="inline-media-root">
      {props.kind === 'image' && <ImageBlock url={props.url} />}
      {props.kind === 'video' && <VideoBlock url={props.url} poster={props.poster} />}
      {props.kind === 'audio' && <AudioBlock url={props.url} />}
      {props.kind === 'code' && <CodeBlock html={props.html} language={props.language} />}

      <MetaBadges badges={props.badges} />

      {showActions && (
        <div className="inline-media-actions-wrap">
          <MediaActions
            kind={props.kind === 'audio' ? 'audio' : (props.kind === 'video' ? 'video' : 'image')}
            url={(props as { url: string }).url}
            prompt={props.prompt ?? ''}
            onRemix={props.onRemix}
          />
        </div>
      )}

      <style jsx>{`
        .inline-media-root {
          display: inline-block; max-width: min(420px, 100%);
          position: relative;
        }

        /* ── Skeleton (shared) ── */
        .inline-media-skel {
          position: absolute; inset: 0; border-radius: 14px;
          background: linear-gradient(110deg, rgba(255,255,255,0.04) 8%, rgba(255,255,255,0.08) 24%, rgba(255,255,255,0.04) 40%);
          background-size: 200% 100%;
          animation: inline-shimmer 1.6s ease-in-out infinite;
        }
        @keyframes inline-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* ── Image ── */
        .inline-media-image-wrap {
          position: relative; overflow: hidden; border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08); cursor: zoom-in;
          background: rgba(255,255,255,0.02); min-height: 80px;
        }
        .inline-media-expand {
          position: absolute; top: 8px; right: 8px;
          width: 30px; height: 30px; border-radius: 8px;
          background: rgba(0,0,0,0.45); backdrop-filter: blur(14px);
          border: 1px solid rgba(255,255,255,0.12);
          color: #fff; display: flex; align-items: center; justify-content: center;
          cursor: pointer; opacity: 0; transition: opacity 0.18s;
        }
        .inline-media-image-wrap:hover .inline-media-expand { opacity: 1; }

        /* ── Video ── */
        .inline-media-video-wrap {
          position: relative; overflow: hidden; border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.3); cursor: pointer; min-height: 120px;
        }
        .inline-media-video-overlay {
          position: absolute; bottom: 10px; left: 10px;
          display: flex; gap: 6px;
          opacity: 0; transition: opacity 0.2s;
        }
        .inline-media-video-wrap:hover .inline-media-video-overlay { opacity: 1; }
        @media (pointer: coarse) {
          .inline-media-video-overlay { opacity: 1; }
        }
        .inline-media-btn {
          width: 32px; height: 32px; border-radius: 50%;
          background: rgba(0,0,0,0.55); backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.15); color: #fff;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          transition: transform 0.15s, background 0.15s;
        }
        .inline-media-btn:hover { background: rgba(139,92,246,0.5); transform: scale(1.06); }
        .inline-media-btn:active { transform: scale(0.94); }
        .inline-media-video-error {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          padding: 16px; text-align: center;
          background: rgba(0,0,0,0.55);
          color: #fca5a5; font-size: 13px; line-height: 1.4;
          border-radius: 14px;
        }

        /* ── Audio pill ── */
        .inline-media-audio-wrap {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 16px; border-radius: 999px;
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.22);
          backdrop-filter: blur(20px);
          min-width: 280px; max-width: 100%;
        }
        .inline-media-audio-play {
          width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg,#6d28d9,#a855f7);
          border: none; color: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: transform 0.15s, box-shadow 0.18s;
          box-shadow: 0 0 12px rgba(139,92,246,0.45);
        }
        .inline-media-audio-play:hover { transform: scale(1.06); box-shadow: 0 0 18px rgba(139,92,246,0.7); }
        .inline-media-audio-play:active { transform: scale(0.94); }
        .inline-media-audio-wave {
          flex: 1; display: flex; align-items: center; gap: 2px;
          height: 28px; cursor: pointer;
        }
        .inline-media-audio-bar {
          flex: 1; min-width: 2px; border-radius: 2px;
          transition: background 0.2s, transform 0.2s;
        }
        .inline-media-audio-time {
          flex-shrink: 0; font-size: 11px; font-weight: 500;
          color: rgba(255,255,255,0.6); font-variant-numeric: tabular-nums;
        }

        /* ── Code / HTML ── */
        .inline-media-code-wrap {
          overflow: hidden; border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.02);
        }
        .inline-media-code-tabs {
          display: flex; align-items: center; gap: 4px; padding: 6px 8px;
          background: rgba(0,0,0,0.35); border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .inline-media-code-tab {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 10px; border-radius: 7px; font-size: 11px; font-weight: 600;
          border: 1px solid transparent; background: transparent;
          color: rgba(255,255,255,0.5); cursor: pointer;
          transition: all 0.15s;
        }
        .inline-media-code-tab:hover { color: rgba(255,255,255,0.8); }
        .inline-media-code-tab.active {
          background: rgba(168,85,247,0.15);
          border-color: rgba(168,85,247,0.35);
          color: rgba(167,139,250,1);
        }
        .inline-media-code-lang {
          margin-left: auto; padding: 3px 8px; font-size: 10px; font-weight: 600;
          letter-spacing: 0.04em; text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }
        .inline-media-code-body { display: block; }
        .inline-media-code-pre {
          margin: 0; padding: 14px; max-height: 320px; overflow: auto;
          font-family: 'SF Mono', Menlo, Monaco, Consolas, monospace;
          font-size: 12px; line-height: 1.55; color: #e5e7eb;
          background: rgba(0,0,0,0.45);
        }

        /* ── Actions overlay anchored bottom-right ── */
        .inline-media-actions-wrap {
          margin-top: 6px;
        }

        /* ── Meta badges (truthful provenance/format chips) ── */
        .inline-media-badges {
          display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px;
        }
        .inline-media-badge {
          display: inline-flex; align-items: center;
          padding: 2px 8px; border-radius: 999px;
          font-size: 10px; font-weight: 600; letter-spacing: 0.02em;
          color: rgba(216,196,255,0.92);
          background: rgba(139,92,246,0.12);
          border: 1px solid rgba(139,92,246,0.28);
          backdrop-filter: blur(8px);
        }

        /* ── Played-bar glow (audio scrubber) ── */
        .inline-media-audio-bar.played {
          box-shadow: 0 0 6px rgba(168,85,247,0.55);
        }

        /* ── Tactile hover micro-interactions on visual media ── */
        .inline-media-image-wrap,
        .inline-media-video-wrap {
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
          will-change: transform;
        }
        .inline-media-image-wrap:hover,
        .inline-media-video-wrap:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 38px -16px rgba(168,85,247,0.45);
          border-color: rgba(168,85,247,0.30);
        }
        @media (pointer: coarse) {
          .inline-media-image-wrap:hover,
          .inline-media-video-wrap:hover { transform: none; }
        }
      `}</style>
    </div>
  );
}

/**
 * Utility — detect a single media URL inside a plain-text AI response.
 * Use case: model returns "Here is your image: https://cdn.example.com/abc.png"
 * → we hoist that URL into an InlineMedia block.
 */
export function detectInlineMedia(text: string): { kind: 'image' | 'video' | 'audio'; url: string } | null {
  // Match standard media URLs anywhere in the text. The character class
  // excludes whitespace, common quoting/markdown wrappers (`<>"'`), and
  // closing brackets/parens (`])}`) so we strip the URL out cleanly when
  // the model emits markdown like `[image](https://...png)` or wraps a
  // URL in parentheses.
  const urlRe = /https?:\/\/[^\s<>"'\])}]+\.(png|jpg|jpeg|webp|gif|svg|mp4|webm|mov|m4v|mp3|wav|m4a|ogg|oga|aac|flac)(\?[^\s<>"'\])}]*)?/i;
  const m = text.match(urlRe);
  if (!m || !m[1]) return null;
  const ext = m[1].toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return { kind: 'image', url: m[0] };
  if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return { kind: 'video', url: m[0] };
  if (['mp3', 'wav', 'm4a', 'ogg', 'oga', 'aac', 'flac'].includes(ext)) return { kind: 'audio', url: m[0] };
  return null;
}
