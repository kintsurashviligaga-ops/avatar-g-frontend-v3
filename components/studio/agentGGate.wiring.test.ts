/**
 * Pins WHERE Agent G's gate sits in OmniStudio.send(). The bug it guards: in Image / Music / Video mode every message was
 * handed straight to the tool ("აქ ხარ?" started a paid render). The gate only protects the user if it runs BEFORE the first
 * branch that spends — so its position is part of the contract, and a refactor that moves it down must fail here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');
const sendBody = src.slice(src.indexOf('const send = useCallback(async (opts?:'), src.indexOf('// ── VIDEO REMIX — edit an uploaded video via /api/video/remix'));
const at = (needle: string): number => sendBody.indexOf(needle);

describe('the gate runs before anything that spends', () => {
  test('it exists, and it classifies first', () => {
    expect(at('classifyFocusInput({ text, mode: gateMode')).toBeGreaterThan(0);
  });
  test.each([
    ['the image render', "if (effMode === 'image' && text &&"],
    ['the music render', "if (effMode === 'music' && (text ||"],
    ['the chat-mode autonomous dispatch', 'if (chatLane && opts?.confirmed) {'],
    ['the film storyboard', "if (effMode === 'video' && (text ||"],
    ['the avatar render', "if (effMode === 'lipsync')"],
  ])('before %s', (_what, needle) => {
    expect(at(needle)).toBeGreaterThan(0);
    expect(at('classifyFocusInput({ text, mode: gateMode')).toBeLessThan(at(needle));
  });
  test('Image / Video / Music / Avatar are gated, and only when there are words', () => {
    expect(sendBody).toContain("effMode === 'image' || effMode === 'video' || effMode === 'music' ? effMode");
    expect(sendBody).toContain(": effMode === 'lipsync' ? 'avatar' : null;");
    expect(sendBody).toContain('const gateMode: GateMode | null = focusGateMode ?? chatOrder;');
    expect(sendBody).toMatch(/if \(gateMode && text && !opts\?\.confirmed\)/);
  });
  test('plain chat: an order to make an image or a track goes through Agent G too — and its dispatch runs only once confirmed', () => {
    const order = sendBody.slice(at('const chatOrder: GateMode | null'), at('const gateMode: GateMode | null = focusGateMode ?? chatOrder;'));
    expect(order).toContain("lane === 'image_generation'");
    expect(order).toContain("lane === 'music_generation'");
    expect(order).toContain('detectStudioIntent(text)'); // a studio request only opens its panel — never gated into a render
    expect(at('const chatOrder: GateMode | null')).toBeLessThan(at('classifyFocusInput({ text, mode: gateMode'));
    expect(sendBody).toContain('if (chatLane && opts?.confirmed) {');
  });
});

describe('what the gate does with each verdict', () => {
  test('talk goes to the chat stream — never to a tool, never charged', () => {
    const chat = sendBody.slice(at("verdict.kind === 'chat'"), at("verdict.kind === 'clarify' || verdict.kind === 'confirm'"));
    expect(chat).toContain('await streamChat([...messages, chatTurn])');
    expect(chat).not.toMatch(/runImageJob|runImageBatch|runMusicJob|createStoryboard|\/api\/video|nanobanana/);
  });
  test('a card makes NO request: it only posts Agent G\'s message', () => {
    const card = sendBody.slice(at("verdict.kind === 'clarify' || verdict.kind === 'confirm'"), at("gatePendingRef.current = null;\n      setGateFrom(null);\n      if (promptText !== text)"));
    expect(card).toContain('gateMessage(');
    expect(card).not.toMatch(/fetch\(|runImageJob|runMusicJob|createStoryboard/);
  });
  test('only a decision lets a prompt through: a confirmed card, or the panel\'s own Generate button', () => {
    expect(src).toContain("void send({ promptOverride: card.prompt, confirmed: true, ...(card.madeIn === 'chat' ? { target: card.target } : {}) });");
    expect(src).toContain('onGenerate={() => runTool(true)}');
    expect(src).toContain('onGenerate: () => runTool(true),');
    expect(src).toContain('void send({ promptOverride: prompt, explicit: true })');
  });
  test('the composer\'s own buttons never count as explicit (a click event is not `true`)', () => {
    expect(src).not.toMatch(/onClick=\{runTool\}/);
    expect(src).toContain('void send(explicitFlag === true ? { explicit: true } : undefined);');
  });
});
