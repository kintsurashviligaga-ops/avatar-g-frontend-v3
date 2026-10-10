/**
 * @jest-environment jsdom
 *
 * The loading loop on the loading cards: the poster first, the clip only where motion is welcome (never under
 * reduced motion or Save-Data), muted and inline so a phone plays it, and invisible to assistive tech. The cards
 * draw it only while a job waits or runs.
 */
import { render } from '@testing-library/react';
import { LOADING_LOOP_POSTER, LOADING_LOOP_SRC, LOADING_LOOP_WEBM, LoadingLoop, loopAllowed } from './LoadingLoop';
import { GenerationProgress } from './GenerationProgress';
import { ResultCard } from './ResultCard';

const mm = (reduce: boolean) => ({ matchMedia: (q: string) => ({ matches: reduce && q.includes('reduce') }) }) as unknown as Window;
const setMotion = (reduce: boolean) => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: mm(reduce).matchMedia });
};

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
  delete (navigator as { connection?: unknown }).connection;
});

test('allowed unless the device asks for less motion or less data', () => {
  expect(loopAllowed(mm(false), {} as Navigator)).toBe(true);
  expect(loopAllowed(mm(true), {} as Navigator)).toBe(false);
  expect(loopAllowed(mm(false), { connection: { saveData: true } } as unknown as Navigator)).toBe(false);
  expect(loopAllowed(undefined, undefined)).toBe(false);
});

test('the poster first; then the clip, muted, looping, inline and hidden from assistive tech', () => {
  setMotion(false);
  const { container } = render(<div className="relative"><LoadingLoop /></div>);
  expect(container.querySelector('img')?.getAttribute('src')).toBe(LOADING_LOOP_POSTER);
  const v = container.querySelector('video') as HTMLVideoElement;
  // VP9 first (smaller), H.264 for every browser without it.
  expect([...v.querySelectorAll('source')].map((s) => s.getAttribute('src'))).toEqual([LOADING_LOOP_WEBM, LOADING_LOOP_SRC]);
  expect(v.muted).toBe(true);
  expect(v.loop).toBe(true);
  expect(v.hasAttribute('playsinline')).toBe(true);
  expect(v.getAttribute('aria-hidden')).toBe('true');
  expect(container.querySelector('img')?.getAttribute('aria-hidden')).toBe('true');
});

test('reduced motion or Save-Data: the poster only, and the clip is never requested', () => {
  setMotion(true);
  const reduced = render(<LoadingLoop />);
  expect(reduced.container.querySelector('video')).toBeNull();
  expect(reduced.container.querySelector('img')).not.toBeNull();
  setMotion(false);
  Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
  expect(render(<LoadingLoop />).container.querySelector('video')).toBeNull();
});

test('the cards draw it only while a job waits or runs; the tray rows stay still', () => {
  setMotion(false);
  const loop = (c: HTMLElement) => c.querySelector('[data-testid="loading-loop"]');
  expect(loop(render(<GenerationProgress kind="image" locale="en" elapsed={3} />).container)).not.toBeNull();
  expect(loop(render(<GenerationProgress kind="image" locale="en" elapsed={0} state="queued" />).container)).not.toBeNull();
  expect(loop(render(<GenerationProgress kind="image" locale="en" elapsed={3} compact />).container)).toBeNull();
  for (const state of ['done', 'failed', 'canceled'] as const) {
    expect(loop(render(<GenerationProgress kind="image" locale="en" elapsed={3} state={state} />).container)).toBeNull();
  }
  for (const state of ['queued', 'rendering', 'finalizing'] as const) {
    expect(loop(render(<ResultCard kind="video" aspect="16:9" state={state} locale="en" />).container)).not.toBeNull();
  }
  expect(loop(render(<ResultCard kind="image" aspect="1:1" state="error" locale="en" error="x" />).container)).toBeNull();
  expect(loop(render(<ResultCard kind="image" aspect="1:1" state="ready" locale="en" media={{ type: 'image', url: 'https://x.test/a.png' }} />).container)).toBeNull();
});
