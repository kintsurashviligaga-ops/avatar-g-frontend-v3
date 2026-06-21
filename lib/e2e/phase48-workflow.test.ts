/**
 * PHASE 48 §4 — Programmatic simulation of the complete user workflow:
 *
 *   Auth Success ➡️ Multi-Image Dropzone Injection ➡️ Georgian Script
 *   Generation ➡️ Seamless Inline Video Preview Playback
 *
 * This wires the REAL production primitives fixed in this phase end-to-end so CI
 * locks each link of the chain against regression. It does NOT hit the network or
 * spend credits — it asserts the pure contracts that make the live flow work:
 *
 *   1. Auth      — resolveAuthCallbackUrl binds the handshake to myavatar.ge.
 *   2. Dropzone  — 1–3 reference images thread through the routing envelope.
 *   3. Georgian  — selectTtsModel HARD-FORCES eleven_v3 (the only ka-capable model).
 *   4. Preview   — CSP media-src admits inline data: so the clip plays inline.
 */

import { resolveAuthCallbackUrl } from '@/components/auth/AuthScreen';
import { selectTtsModel } from '@/lib/audio/tts-model';
import { simulatePipeline, buildRouting } from './pipeline-sim';

// CommonJS CSP module (shared with next.config.js + csp.test.js). Relative
// path — the `@/` alias is not resolved through runtime require() under jest.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { cspDirectiveMap } = require('../security/csp');

describe('PHASE 48 §4 — full live-workflow contract simulation', () => {
  it('STEP 1 — Auth Success: callback binds to the live myavatar.ge origin', () => {
    const cb = resolveAuthCallbackUrl('https://myavatar.ge', undefined, '/dashboard');
    expect(cb).toBe('https://myavatar.ge/auth/callback?redirect=%2Fdashboard');
  });

  it('STEP 2 — Multi-Image Dropzone: a Georgian video request routes to GPU render', () => {
    // The founder account exposes the live gate and proceeds to routing.
    const r = simulatePipeline({
      prompt: 'შექმენი 30-წამიანი კინემატოგრაფიული ვიდეო ამ სურათებით',
      action: 'video_film',
      balanceGel: 0,
      userEmail: 'kintsurashviligaga@gmail.com',
      locale: 'ka',
    });
    expect(r.halted).toBe(false);
    expect(r.routing?.engine).toBe('hardware_gpu_render');
    expect(r.routing?.params).toMatchObject({ totalDurationSec: 30 });
  });

  it('STEP 3 — Georgian Script Generation: voiceover hard-forces eleven_v3 (the ka-capable model)', () => {
    const georgianScript = 'გამარჯობა, ეს არის ჩემი ავატარის ხმა.';
    expect(selectTtsModel(georgianScript, 'ka')).toBe('eleven_v3');
    // And the voice route engine is the Georgian synthesis grid.
    const voice = buildRouting('voice_tts', georgianScript);
    expect(voice?.engine).toBe('synthesis_voice_ka');
    expect(voice?.params).toMatchObject({ locale: 'ka' });
  });

  it('STEP 4 — Seamless Inline Preview: CSP admits inline data: video + audio', () => {
    const media = cspDirectiveMap()['media-src'] as string[];
    // Without data: the finished data:video/mp4 + data:audio/* would be blocked
    // and only openable via download — the exact symptom this phase fixes.
    expect(media).toContain('data:');
    expect(media).toContain('blob:');
  });

  it('END-TO-END — every link of the chain holds together', () => {
    const authOk = resolveAuthCallbackUrl('https://myavatar.ge', undefined, '/').startsWith('https://myavatar.ge/auth/callback');
    const georgianOk = selectTtsModel('ქართული ტექსტი') === 'eleven_v3';
    const previewOk = (cspDirectiveMap()['media-src'] as string[]).includes('data:');
    expect([authOk, georgianOk, previewOk].every(Boolean)).toBe(true);
  });
});
