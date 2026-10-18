/** @jest-environment node */
/**
 * Live Voice → a PAID render. GG 2026-10-18 (card „ხმით დაიწყოს") superseded the final-release §8.D button-only rule: the
 * user's OWN spoken yes starts it, after the 3 s cancelable countdown and once the server recorded that yes (fireRun in
 * components/voice/live/liveActions). OmniStudio's `liveRunRef` is the one place that happens, so it is pinned on the
 * source: nothing runs without the user's transcript (`said`), and nothing runs when the screen changed after the price
 * was told (the fingerprint), or while something else is generating.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');
/** Source without comments: the fix's own explanation quotes the call it replaced. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

/** The body of `liveRunRef.current = (detail) => { … };` as written in OmniStudio. */
const handler = (() => {
  const at = src.indexOf('liveRunRef.current = (detail: LiveRunDetail): boolean => {');
  const end = src.indexOf('\n  };\n', at);
  return at >= 0 && end > at ? code(src.slice(at, end)) : '';
})();

describe('a Live call starts a paid render only on the user\'s own told-price yes', () => {
  test('the handler is found', () => {
    expect(handler.length).toBeGreaterThan(200);
  });

  test('no transcript yes → nothing runs (the model\'s word never gets here)', () => {
    const guard = handler.indexOf("if (!said || !target");
    expect(guard).toBeGreaterThan(0);
    expect(handler.indexOf('runTool(')).toBeGreaterThan(guard);
    expect(handler.indexOf('consentRef.current(')).toBeGreaterThan(guard);
  });

  test('a studio render runs only after the busy and changed-since-price checks', () => {
    const run = handler.lastIndexOf("runTool(true, 'voice')");
    expect(run).toBeGreaterThan(0);
    const before = handler.slice(0, run);
    expect(before.lastIndexOf("refuse('changed'")).toBeGreaterThan(before.lastIndexOf("refuse('busy'"));
    expect(before.lastIndexOf("refuse('nothing_prepared'")).toBeGreaterThan(0);
  });

  test('a chat offer (Agent G\'s card or the storyboard) checks the fingerprint before its button\'s path', () => {
    const offer = handler.indexOf('liveChatOffer()');
    const fp = handler.indexOf('liveOfferFp(offer)', offer);
    expect(offer).toBeGreaterThan(0);
    expect(handler.indexOf('storyboardGenerateRef.current?.()', offer)).toBeGreaterThan(fp);
    expect(handler.indexOf('consentRef.current(said)', offer)).toBeGreaterThan(fp);
  });

  test("Agent G's free plans take the spoken yes, with the words recorded on the run", () => {
    expect(handler).toMatch(/channel: 'voice-transcript', said/);
    expect(handler).toMatch(/confirmAgentMontage\(plan\.id, approval\)/);
  });
});
