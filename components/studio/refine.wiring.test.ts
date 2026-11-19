/** @jest-environment node */
/**
 * „უკეთესად გააკეთე" after a delivered 4 s film started a different film (GG, Production 2026-10-17 07:39Z): the two words
 * were planned as a brief of their own. OmniStudio is too large to mount, so these pin the wiring in its source; the
 * browser run is tests/agent-g-refine-avatar.spec.ts.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');
const send = src.slice(src.indexOf('const send = useCallback(async'), src.indexOf("if (effMode === 'lipsync') {"));

describe('refine wiring', () => {
  it('every delivered film keeps its brief, length, frame and references — one clip or many', () => {
    expect(src).toContain("const filmSpec: FilmRefineSpec = { prompt: filmPrompt, refs: refs.filter((r) => /^https?:\\/\\//i.test(r)), orientation, seconds: videoDuration, musicVideo: videoMode === 'musicvideo' };");
    expect(src).toContain('...remixCarry, filmSpec }');
  });
  it('is read before the yes, Agent G’s turn and the focus gate, so none of them plans the words as a new brief', () => {
    const at = send.indexOf('const refine = text && !opts?.confirmed');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(send.indexOf('isConsentToStart(text) && consentRef.current(text)'));
    expect(at).toBeLessThan(send.indexOf('agentTurnRef.current(text, viaVoice)'));
    expect(at).toBeLessThan(send.indexOf('classifyFocusInput({ text, mode: gateMode'));
  });
  it('a clip is asked again from its own words, improved, with its photos, length and frame; nothing renders before Create', () => {
    // GG 2026-10-25 16:10Z: a video is ONE clip; „make it better" is a new clip card, never a storyboard planned again.
    expect(send).toContain('const prompt = improvedBrief(clipAgain.prompt, refine.change, locale);');
    expect(send).toContain('await proposeClip({ prompt, photos: clipAgain.photos, userText: text, seconds: clipAgain.seconds, aspect: clipAgain.aspect, viaVoice });');
    // A film made before the clip is asked again as one 8 s clip from its brief.
    expect(send).toMatch(/last\.clipSpec \?\? \(last\.filmSpec \? \{[\s\S]*?seconds: 8,/);
    const branch = send.slice(send.indexOf('if (clipAgain) {'), send.indexOf("const imageSpec = last?.imageUrl && last.regen?.kind === 'image' ? last.regen : null;"));
    expect(branch).not.toMatch(/createStoryboard|setVideoDuration|fetch\(/);
  });
  it('a picture and an avatar get Agent G’s card at their price', () => {
    expect(send).toContain("const imageSpec = last?.imageUrl && last.regen?.kind === 'image' ? last.regen : null;");
    expect(send).toContain("kind: 'confirm', target: 'image', prompt, credits, single: true, aspect: imageSpec.aspect,");
    expect(send).toContain("kind: 'confirm', target: 'avatar', prompt: spec.prompt, credits: door.credits, aspect: spec.aspect,");
  });
});
