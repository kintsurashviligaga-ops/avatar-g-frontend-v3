import { stopPremium } from '@/lib/audio/premium-tts';
import { MIC_RELEASE_EVENT } from '@/lib/voice/micBus';
import { SPEECH_CLIENT_DEADLINE_MS } from '@/lib/speech/deadline';

export type ReaderStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'completed' | 'error';
export interface ReaderSnapshot { status: ReaderStatus; chunk: number; total: number; speed: number; error?: string }
export interface ReaderDeps {
  synthesize: (text: string, signal: AbortSignal) => Promise<string>;
  audio: () => HTMLAudioElement;
  revoke: (url: string) => void;
  liveActive: () => boolean;
}
export function faithfulChunks(text: string): string[] {
  const points = Array.from(text);
  const chunks: string[] = [];
  for (let i = 0; i < points.length; i += 600) chunks.push(points.slice(i, i + 600).join(''));
  return chunks;
}
let stopActive: (() => void) | null = null;
/** Explicit reader only. Stop aborts pending synthesis and every stale continuation is fenced. */
export function createReadAloud(deps: ReaderDeps, changed: (s: ReaderSnapshot) => void) {
  let epoch = 0, controller: AbortController | null = null, audio: HTMLAudioElement | null = null, url: string | null = null;
  let releaseWait: (() => void) | null = null;
  let finishChunk: ((ok: boolean) => void) | null = null;
  let state: ReaderSnapshot = { status: 'idle', chunk: 0, total: 0, speed: 1 };
  const publish = (next: Partial<ReaderSnapshot>) => { state = { ...state, ...next }; changed({ ...state }); };
  const stop = () => {
    epoch++; controller?.abort(); controller = null;
    finishChunk?.(false); finishChunk = null;
    releaseWait?.(); releaseWait = null;
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio = null; }
    if (url) { deps.revoke(url); url = null; }
    if (stopActive === stop) stopActive = null;
    if (typeof window !== 'undefined') window.removeEventListener(MIC_RELEASE_EVENT, stop);
    publish({ status: 'idle', chunk: 0, total: 0, error: undefined });
  };
  const play = async (text: string) => {
    if (deps.liveActive()) { publish({ status: 'error', error: 'live_call_active' }); return; }
    stopActive?.(); stop(); stopPremium();
    if (!text.trim() || text.length > 200_000) { publish({ status: 'error', error: 'invalid_text' }); return; }
    stopActive = stop;
    if (typeof window !== 'undefined') window.addEventListener(MIC_RELEASE_EVENT, stop);
    const mine = epoch, stale = () => mine !== epoch;
    controller = new AbortController();
    const signal = controller.signal;
    const chunks = faithfulChunks(text);
    const element = deps.audio(); audio = element;
    // Prime the same element in the user's gesture. This is silence, never generated content.
    element.src = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA==';
    void element.play().catch(() => {});
    publish({ status: 'loading', total: chunks.length, chunk: 0, error: undefined });
    try {
      for (let i = 0; i < chunks.length; i++) {
        if (stale()) return;
        const nextUrl = await deps.synthesize(chunks[i]!, signal);
        if (stale()) { deps.revoke(nextUrl); return; }
        url = nextUrl;
        if (state.status === 'paused') await new Promise<void>(resolve => { releaseWait = resolve; });
        if (stale()) return;
        element.src = nextUrl; element.playbackRate = state.speed;
        const finished = new Promise<boolean>(resolve => { finishChunk = resolve; element.onended = () => resolve(true); element.onerror = () => resolve(false); });
        publish({ status: 'playing', chunk: i + 1 });
        await element.play();
        const ok = await finished;
        finishChunk = null;
        if (stale()) return;
        deps.revoke(nextUrl); url = null;
        if (!ok) throw new Error('playback_failed');
        if (state.status !== 'paused') publish({ status: 'loading' });
      }
      publish({ status: 'completed' });
    } catch {
      if (!stale()) { stop(); publish({ status: 'error', error: 'read_failed' }); }
    } finally {
      if (!stale()) {
        if (url) { deps.revoke(url); url = null; }
        if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio = null; }
        if (stopActive === stop) stopActive = null;
        if (typeof window !== 'undefined') window.removeEventListener(MIC_RELEASE_EVENT, stop);
        controller = null;
      }
    }
  };
  return {
    play, stop, dispose: stop, snapshot: () => ({ ...state }),
    pause: () => { if (state.status === 'playing' || state.status === 'loading') { audio?.pause(); publish({ status: 'paused' }); } },
    resume: async () => {
      if (state.status !== 'paused') return;
      if (releaseWait) { const release = releaseWait; releaseWait = null; publish({ status: 'loading' }); release(); }
      else if (finishChunk && audio) { publish({ status: 'playing' }); try { await audio.play(); } catch { stop(); publish({ status: 'error', error: 'playback_blocked' }); } }
      else publish({ status: 'loading' });
    },
    setSpeed: (speed: number) => { if (!Number.isFinite(speed)) return; const next = Math.max(0.5, Math.min(2, speed)); if (audio) audio.playbackRate = next; publish({ speed: next }); },
  };
}
export function browserReaderDeps(locale: 'ka' | 'en' | 'ru'): ReaderDeps {
  return {
    audio: () => new Audio(), revoke: url => URL.revokeObjectURL(url),
    liveActive: () => document.documentElement.dataset.liveCall === '1',
    synthesize: async (text, outerSignal) => {
      const controller = new AbortController(), abort = () => controller.abort();
      if (outerSignal.aborted) controller.abort();
      outerSignal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, SPEECH_CLIENT_DEADLINE_MS); // the shared ceiling (lib/speech/deadline)
      try {
        const res = await fetch('/api/tts/gemini', { method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, locale }), signal: controller.signal });
        if (!res.ok) throw new Error('tts_failed');
        const blob = await res.blob();
        if (!blob.size || controller.signal.aborted) throw new Error('tts_empty');
        return URL.createObjectURL(blob);
      } finally { clearTimeout(timer); outerSignal.removeEventListener('abort', abort); }
    },
  };
}
