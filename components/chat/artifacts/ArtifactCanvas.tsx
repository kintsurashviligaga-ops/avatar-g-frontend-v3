'use client';

/**
 * components/chat/artifacts/ArtifactCanvas.tsx — the chat's code canvas (Gemini Canvas / Claude Artifacts parity).
 *
 * Desktop (≥ 1024 px, the dashboard's `lg`): a right-hand panel, 45 % of the studio row, next to the chat column.
 * It is a plain flex item, so the host mounts it as a sibling of its chat column and needs no wrapper. Phone: a
 * bottom sheet (modal dialog: focus trap, Escape, focus returns to the button that opened it).
 *
 * Header: title, language, version switcher, Copy, Download (the language's own extension and MIME), Close.
 * Tabs: Code (highlighted, always) and Preview (html / svg ONLY — `previewDocument.ts` is the security boundary).
 *
 * It opens from two places, both through the store's one validator:
 *   · a finished code block's "Open in canvas" / "Preview" button (MarkdownView's CodeBlock, only while a canvas is
 *     mounted — `registerHost`);
 *   · the `myavatar:open-artifact` window event (openArtifactEvent.ts), e.g. from the Live voice tools.
 *
 * ⚠️ MOTION IS TRANSFORM + OPACITY ONLY, AND NONE UNDER prefers-reduced-motion. Animating the panel's width would
 * re-lay-out the whole chat column every frame on a long thread. With reduced motion every transition is 0 s.
 *
 * ⚠️ THE PREVIEW IS WHITE PAPER, NOT A THEME SURFACE. A generated page assumes a browser's default white canvas and
 * black text; on the app's black surface an unstyled page is black-on-black. That one `bg-white` is deliberate.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Copy, Download, X } from 'lucide-react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { HighlightedCode, copyText } from '@/components/chat/MarkdownView';
import { ARTIFACT_LANGUAGES, artifactFileName, isPreviewable } from './artifactSpec';
import { selectCurrentVersions, useArtifactStore, type Artifact, type ArtifactTab } from './artifactStore';
import { OPEN_ARTIFACT_EVENT, validateOpenArtifactDetail } from './openArtifactEvent';
import { PREVIEW_SANDBOX, buildPreviewDocument } from './previewDocument';

type CanvasLocale = 'ka' | 'en' | 'ru';

interface CanvasLabels {
  canvas: string;
  views: string;
  code: string;
  preview: string;
  copy: string;
  copied: string;
  download: string;
  close: string;
  prevVersion: string;
  nextVersion: string;
  version: (n: number, of: number) => string;
  offline: string;
  navBlocked: string;
  stopped: string;
}

const LABELS: Record<CanvasLocale, CanvasLabels> = {
  ka: {
    canvas: 'კანვასი',
    views: 'ხედი',
    code: 'კოდი',
    preview: 'გადახედვა',
    copy: 'კოპირება',
    copied: 'დაკოპირდა',
    download: 'ჩამოტვირთვა',
    close: 'დახურვა',
    prevVersion: 'წინა ვერსია',
    nextVersion: 'შემდეგი ვერსია',
    version: (n, of) => `ვერსია ${n} / ${of}`,
    offline: 'გადახედვა ქსელის გარეშე მუშაობს: გარე სკრიპტები და მოთხოვნები დაბლოკილია.',
    navBlocked: 'გვერდმა გადახედვიდან გასვლა სცადა — საწყისი ვერსია დაბრუნდა.',
    stopped: 'გადახედვა შეჩერდა: გვერდი გასვლას ცდილობს. კოდი „კოდი“ ჩანართშია.',
  },
  en: {
    canvas: 'Canvas',
    views: 'View',
    code: 'Code',
    preview: 'Preview',
    copy: 'Copy',
    copied: 'Copied',
    download: 'Download',
    close: 'Close',
    prevVersion: 'Previous version',
    nextVersion: 'Next version',
    version: (n, of) => `Version ${n} of ${of}`,
    offline: 'Preview runs offline: external scripts and requests are blocked.',
    navBlocked: 'The page tried to leave the preview — it was put back.',
    stopped: 'Preview stopped: the page keeps navigating away. The code is in the Code tab.',
  },
  ru: {
    canvas: 'Холст',
    views: 'Вид',
    code: 'Код',
    preview: 'Просмотр',
    copy: 'Копировать',
    copied: 'Скопировано',
    download: 'Скачать',
    close: 'Закрыть',
    prevVersion: 'Предыдущая версия',
    nextVersion: 'Следующая версия',
    version: (n, of) => `Версия ${n} из ${of}`,
    offline: 'Просмотр работает без сети: внешние скрипты и запросы заблокированы.',
    navBlocked: 'Страница попыталась уйти из просмотра — она возвращена.',
    stopped: 'Просмотр остановлен: страница продолжает уходить. Код — во вкладке «Код».',
  },
};

/** The dashboard's `lg`, the same query OmniStudio uses for its own desktop layout. */
export const DESKTOP_QUERY = '(min-width: 1024px)';
/** How many self-navigations the preview puts back before it gives up (a page that reloads itself forever). */
export const MAX_PREVIEW_RESETS = 3;

const EASE: [number, number, number, number] = [0.2, 0, 0, 1];

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener?.('change', onChange);
      return () => mql.removeEventListener?.('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** Saves the artifact's code as a file. The code as written — the preview's CSP wrapper is never part of it. */
function downloadArtifact(artifact: Artifact): void {
  const blob = new Blob([artifact.code], { type: ARTIFACT_LANGUAGES[artifact.language].mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = artifactFileName(artifact);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick of the clock, not synchronously: Safari starts the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ICON_BUTTON =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:pointer-events-none disabled:opacity-35 [@media(pointer:fine)]:h-9 [@media(pointer:fine)]:w-9';

/**
 * The sandboxed preview. ⚠️ ANY LOAD AFTER THE FIRST IS THE PAGE LEAVING OUR DOCUMENT (a link, `location = …`, a meta
 * refresh): neither the sandbox nor the CSP stops a frame navigating itself, and the page it lands on is not bound by
 * our CSP meta. So the frame is re-created from the original srcdoc, and after MAX_PREVIEW_RESETS it stops trying.
 */
function PreviewFrame({ srcDoc, title, labels }: { srcDoc: string; title: string; labels: CanvasLabels }) {
  const [frameKey, setFrameKey] = useState(0);
  const [resets, setResets] = useState(0);
  const loads = useRef(0);
  const stopped = resets > MAX_PREVIEW_RESETS;

  const onLoad = useCallback(() => {
    loads.current += 1;
    if (loads.current === 1) return; // our own srcdoc
    loads.current = 0;
    setResets((n) => n + 1);
    setFrameKey((k) => k + 1);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {stopped ? (
        <p role="status" className="m-4 rounded-2xl bg-app-elevated px-4 py-3 text-[14px] leading-[1.6] text-app-text">
          {labels.stopped}
        </p>
      ) : (
        <iframe
          key={frameKey}
          title={title}
          sandbox={PREVIEW_SANDBOX}
          srcDoc={srcDoc}
          referrerPolicy="no-referrer"
          onLoad={onLoad}
          data-artifact-preview=""
          className="min-h-0 w-full flex-1 border-0 bg-white"
        />
      )}
      <div className="shrink-0 space-y-1 border-t border-app-border/10 px-4 py-2 text-[12px] leading-[1.5] text-app-muted">
        {resets > 0 && !stopped && <p role="status">{labels.navBlocked}</p>}
        <p>{labels.offline}</p>
      </div>
    </div>
  );
}

function CanvasBody({ artifact, labels, headingId }: { artifact: Artifact; labels: CanvasLabels; headingId: string }) {
  const tab = useArtifactStore((s) => s.tab);
  const versionIndex = useArtifactStore((s) => s.versionIndex);
  const versions = useArtifactStore(selectCurrentVersions);
  const { setTab, selectVersion, close } = useArtifactStore.getState();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uid = useId();
  const previewable = isPreviewable(artifact.language);
  const shownTab: ArtifactTab = previewable ? tab : 'code';
  const srcDoc = useMemo(
    () => (shownTab === 'preview' ? buildPreviewDocument(artifact.language, artifact.code) : null),
    [shownTab, artifact.language, artifact.code],
  );
  const langLabel = ARTIFACT_LANGUAGES[artifact.language].label;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback(async () => {
    if (!(await copyText(artifact.code))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }, [artifact.code]);

  const tabs: ArtifactTab[] = previewable ? ['code', 'preview'] : ['code'];
  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = tabs[(tabs.indexOf(shownTab) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
    setTab(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 pl-4 pr-2 pt-2">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="truncate text-[15px] font-semibold leading-[1.4] text-app-text" title={artifact.title}>
            {artifact.title}
          </h2>
          {artifact.title !== langLabel && <p className="truncate text-[12px] leading-[1.4] text-app-muted">{langLabel}</p>}
        </div>
        {versions.length > 1 && (
          <div className="flex shrink-0 items-center" data-artifact-versions="">
            <button type="button" className={ICON_BUTTON} onClick={() => selectVersion(versionIndex - 1)} disabled={versionIndex === 0}
              aria-label={labels.prevVersion} title={labels.prevVersion}>
              <ChevronLeft size={18} aria-hidden />
            </button>
            <span className="min-w-[3ch] text-center text-[12px] tabular-nums text-app-muted" aria-label={labels.version(versionIndex + 1, versions.length)}>
              {versionIndex + 1}/{versions.length}
            </span>
            <button type="button" className={ICON_BUTTON} onClick={() => selectVersion(versionIndex + 1)} disabled={versionIndex >= versions.length - 1}
              aria-label={labels.nextVersion} title={labels.nextVersion}>
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
        )}
        <button type="button" className={ICON_BUTTON} onClick={copy} aria-label={copied ? labels.copied : labels.copy} title={labels.copy}>
          {copied ? <Check size={17} aria-hidden className="text-app-accent" /> : <Copy size={17} aria-hidden />}
        </button>
        <button type="button" className={ICON_BUTTON} onClick={() => downloadArtifact(artifact)} aria-label={labels.download} title={`${labels.download} · ${artifactFileName(artifact)}`}>
          <Download size={17} aria-hidden />
        </button>
        <button type="button" className={ICON_BUTTON} onClick={close} aria-label={labels.close} title={labels.close} data-artifact-close="">
          <X size={18} aria-hidden />
        </button>
      </div>

      <div role="tablist" aria-label={labels.views} onKeyDown={onTabKey} className="flex shrink-0 gap-1 border-b border-app-border/10 px-3 pb-2 pt-1">
        {tabs.map((t) => (
          <button
            key={t}
            id={`${uid}-tab-${t}`}
            type="button"
            role="tab"
            aria-selected={shownTab === t}
            aria-controls={`${uid}-panel`}
            tabIndex={shownTab === t ? 0 : -1}
            onClick={() => setTab(t)}
            className={`inline-flex h-11 items-center rounded-full px-4 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 [@media(pointer:fine)]:h-8 ${
              shownTab === t ? 'bg-app-elevated text-app-text' : 'text-app-muted hover:text-app-text'
            }`}
          >
            {t === 'code' ? labels.code : labels.preview}
          </button>
        ))}
      </div>

      <div
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${shownTab}`}
        // A scrollable region must be reachable by keyboard; the preview's iframe takes focus itself.
        tabIndex={srcDoc ? undefined : 0}
        className={`flex min-h-0 flex-1 flex-col ${srcDoc ? '' : 'overflow-auto overscroll-contain'}`}
      >
        {srcDoc ? (
          // Keyed by the document: another version is a fresh frame with a fresh navigation count.
          <PreviewFrame key={srcDoc} srcDoc={srcDoc} title={`${labels.preview}: ${artifact.title}`} labels={labels} />
        ) : (
          <HighlightedCode code={artifact.code} language={artifact.language} />
        )}
      </div>
    </>
  );
}

export interface ArtifactCanvasProps {
  locale?: CanvasLocale;
}

/** Mount once per chat surface. Renders nothing until an artifact is opened. */
export function ArtifactCanvas({ locale = 'ka' }: ArtifactCanvasProps) {
  const labels = LABELS[locale] ?? LABELS.ka;
  const open = useArtifactStore((s) => s.open);
  const current = useArtifactStore((s) => s.current);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const reduceMotion = useReducedMotion();
  const headingId = useId();
  const close = useCallback(() => useArtifactStore.getState().close(), []);
  const showing = open && current !== null;
  const sheetRef = useDialogA11y<HTMLDivElement>(showing && !isDesktop, close);

  // Registers this canvas (code blocks offer "Open in canvas" only while one is mounted) and owns the event contract.
  useEffect(() => {
    const unregister = useArtifactStore.getState().registerHost();
    const onOpen = (e: Event) => {
      const artifact = validateOpenArtifactDetail((e as CustomEvent<unknown>).detail);
      if (!artifact) {
        console.warn(`[artifacts] ${OPEN_ARTIFACT_EVENT} ignored: invalid detail (language off the allowlist, empty code or over 200 KB)`);
        return;
      }
      useArtifactStore.getState().openArtifact(artifact);
    };
    window.addEventListener(OPEN_ARTIFACT_EVENT, onOpen);
    return () => {
      window.removeEventListener(OPEN_ARTIFACT_EVENT, onOpen);
      unregister();
    };
  }, []);

  const fade = reduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE };
  const slide = reduceMotion ? { duration: 0 } : { duration: 0.26, ease: EASE };

  return (
    <AnimatePresence>
      {showing && isDesktop && (
        <motion.aside
          key="artifact-canvas-desktop"
          aria-labelledby={headingId}
          data-artifact-canvas="desktop"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
          transition={slide}
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            e.preventDefault();
            close();
          }}
          className="flex min-h-0 w-[45%] min-w-[320px] max-w-[880px] shrink-0 flex-col self-stretch border-l border-app-border/10 bg-app-surface"
        >
          <CanvasBody artifact={current} labels={labels} headingId={headingId} />
        </motion.aside>
      )}
      {showing && !isDesktop && (
        // z-[95]: the studio's sheet layer (OmniStudio's settings sheet) — over ChatChrome (≤ z-[86]), under its modals.
        <motion.div key="artifact-canvas-phone" data-artifact-canvas="phone" className="fixed inset-0 z-[95] flex items-end justify-center">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-black/55"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
          />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
            transition={slide}
            className="relative flex h-[88svh] w-full flex-col overflow-hidden rounded-t-[28px] border border-app-border/10 bg-app-surface shadow-[0_-12px_40px_rgba(0,0,0,0.35)]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="flex shrink-0 justify-center pt-2.5" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-app-border/25" />
            </div>
            <CanvasBody artifact={current} labels={labels} headingId={headingId} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ArtifactCanvas;
