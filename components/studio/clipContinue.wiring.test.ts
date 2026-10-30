/** @jest-environment node */
/**
 * „გააგრძელე …" in the Video tool made a different clip (GG, Production 2026-10-26 18:22Z „გაგრძელებამ სულ სხვა ვიდეო
 * გააკეთა"): the tool's Send is always explicit (runComposer → runTool(true)), and the continue check skipped explicit sends,
 * so the words became a new 4 s clip at ✦28. OmniStudio is too large to mount, so these pin the wiring in its source; the
 * order itself is lib-tested in clip/editOrder.test.ts (clipToContinue).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');
const send = src.slice(src.indexOf('const send = useCallback(async'), src.indexOf("if (effMode === 'lipsync') {"));

describe('clip continue wiring', () => {
  const at = send.indexOf("&& omniEditOpFromWords(text) === 'extend') {");
  const gate = send.slice(send.lastIndexOf('if (text', at), at);

  it('the Video tool’s explicit Send still reads „გააგრძელე" as continuing the thread’s clip', () => {
    expect(at).toBeGreaterThan(0);
    expect(gate).not.toContain('opts?.explicit');
    // A card's own confirm and a Live call's words are still not read as continuing.
    expect(gate).toContain('!opts?.confirmed');
    expect(gate).toContain('!opts?.fromLive');
    expect(send).toContain("const clip = clipToContinue(messages, mode === 'video' ? 'thread' : 'last');");
  });

  it('opens the edit card (the price on its Create) before any new clip card', () => {
    const branch = send.slice(at, send.indexOf('const refine = text && !opts?.confirmed'));
    expect(branch).toContain('from: clip.from');
    expect(branch).toMatch(/proposeEdit\(/);
    expect(branch).not.toMatch(/proposeClip\(|fetch\(/);
    expect(at).toBeLessThan(send.indexOf('await proposeClip('));
  });

  it('the composer’s Send carries the extend’s price, not a new clip’s', () => {
    expect(src).toContain("&& !!input.trim() && omniEditOpFromWords(input) === 'extend' ? clipToContinue(messages, 'thread') : null;");
    const quote = src.slice(src.indexOf('const composerQuote ='), src.indexOf('const runComposer = () => {'));
    const extend = quote.indexOf("omniEditCredits({ op: 'extend', inputSec: composerContinue.seconds, resolution: clipResolution })");
    expect(extend).toBeGreaterThan(0);
    expect(extend).toBeLessThan(quote.indexOf('directClipCredits('));
  });
});
