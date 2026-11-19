/** @jest-environment node */
/**
 * GG's iPhone, Production 2026-10-16: Agent G agreed an image prompt, the user said "კარგია", and the reply claimed the
 * system was "already processing" — nothing ran; and with the image sheet open, the chat bar and a docked Live call stacked
 * into "two screens". OmniStudio is ~12,000 lines behind dozens of providers, so the wiring is pinned on its source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');
const css = readFileSync(join(__dirname, '../../app/globals.css'), 'utf8');

test('a yes to Agent G\'s own quoted offer starts it only at its real price; otherwise its priced card comes first', () => {
  // GG 2026-10-16 18:21Z: once Agent G has clarified and the user agrees, generation starts (it used to always stop at a card).
  const hook = src.indexOf('isConsentToStart(text) && consentRef.current(text)');
  expect(hook).toBeGreaterThan(0);
  expect(hook).toBeLessThan(src.indexOf('const gateMode: GateMode | null = focusGateMode ?? chatOrder;'));
  expect(src.slice(hook - 120, hook)).toContain('!opts?.fromLive'); // words from the Live call never start spending
  const block = src.slice(src.indexOf('const offer = offeredPrompt(last.text, here);'), src.indexOf('agentTurnRef.current = (text: string, viaVoice: boolean): boolean => {'));
  expect(block.length).toBeGreaterThan(0);
  // A film opens its storyboard (its own priced approval); a picture or a track starts only when the reply quoted the real price.
  expect(block).toContain("if (offer.mode === 'video' || offer.credits === credits) {");
  expect(block).toMatch(/kind: 'confirm', target: offer\.mode, prompt: offer\.prompt, credits/);
  expect(block).toContain('if (guestStop()) return true;');
});

test('the chat bar stays while a tool\'s settings are open (they sit above it), and the layer stops under a docked call', () => {
  expect(src).toMatch(/data-testid="composer-bar" className=\{imageWorkspace \? 'hidden'/);
  expect(src).toMatch(/"studio-sheet sheet-rise relative flex min-h-0/);
  expect(css).toMatch(/html\[data-live-docked\] \.studio-sheet \{ max-height: calc\(100svh - var\(--live-dock-h\) - 12px\) !important; \}/);
});
