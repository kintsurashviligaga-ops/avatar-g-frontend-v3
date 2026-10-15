'use client';

/** One sanctioned Gemini TTS playback. Epochs prevent stale requests from playing after Stop. */
import { MIC_RELEASE_EVENT } from '@/lib/voice/micBus';

let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let request: AbortController | null = null;
let epoch = 0;
let releaseListener: (() => void) | null = null;

export function stopPremium(): void {
  epoch += 1;
  request?.abort(); request = null;
  try { current?.pause(); } catch { /* unavailable media API */ }
  if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }
  current = null;
  if (releaseListener && typeof window !== 'undefined') window.removeEventListener(MIC_RELEASE_EVENT, releaseListener);
  releaseListener = null;
}

/** Explicit TTS helper, not an automatic transcript reader. No alternate provider fallback. */
export async function speakPremium(text: string, locale: 'ka' | 'en' | 'ru' = 'ka'): Promise<HTMLAudioElement | null> {
  stopPremium();
  const mine = epoch;
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 800);
  if (!clean) return null;
  const controller = new AbortController();
  request = controller;
  const timer = setTimeout(() => { if (mine === epoch) stopPremium(); }, 30_000);
  releaseListener = () => stopPremium();
  if (typeof window !== 'undefined') window.addEventListener(MIC_RELEASE_EVENT, releaseListener);
  try {
    const res = await fetch('/api/tts/gemini', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean, locale }), signal: controller.signal,
    });
    if (!res.ok || mine !== epoch) return null;
    const blob = await res.blob();
    if (!blob.size || mine !== epoch) return null;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    current = audio; currentUrl = url;
    audio.onended = () => { if (mine === epoch) stopPremium(); };
    audio.onerror = () => { if (mine === epoch) stopPremium(); };
    await audio.play();
    if (mine !== epoch) { audio.pause(); return null; }
    return audio;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (mine === epoch) {
      request = null;
      if (!current || current.paused) stopPremium();
    }
  }
}
