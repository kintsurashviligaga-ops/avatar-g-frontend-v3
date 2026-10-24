/**
 * Phase 2 PR 7 (GG's plan of 2026-10-23; MASTER TASK v3.1 §3.1). Pins what tests/one-primary.spec.ts measures in a
 * browser, and the two panels the plan takes off the screen:
 *
 *   one primary   the composer's run button and the chat's send are marked `data-primary="send"` (GenerateButton marks
 *                 the panel's Create), and the composer draws no Send beside a desktop panel that holds the description.
 *   Motion        its panel ran Kling through Replicate, which MASTER TASK v3.1 withdraws: no import, no tab, and the
 *                 catalog service is hidden, so no menu, search or Agent G route opens it.
 *   LiveAvatar    the voice button opens Gemini Live's selfie avatar, then the plain voice chat; the LiveAvatar/LiveKit tier
 *                 that was tried first is no longer mounted (its component stays, unused, as the plan says).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getService, resolveService, searchServices } from '@/lib/catalog/services';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const studio = read('components/studio/OmniStudio.tsx');
const chrome = read('components/studio/ChatChrome.tsx');

describe('one primary action', () => {
  test('the composer\'s run button and the chat\'s send are the "send" primaries', () => {
    expect(studio).toMatch(/data-testid="run-button" data-price=\{composerQuote \?\? undefined\} data-live-guard="spend" data-primary="send"/);
    expect(studio).toMatch(/onClick=\{\(\) => runTool\(\)\} aria-label=\{runLabel\} title=\{runLabel\} data-primary="send"/);
    expect(studio.match(/data-primary="send"/g)).toHaveLength(2);
  });

  test('no Send beside a desktop panel that holds the description, and none for a tool that runs from its panel', () => {
    expect(studio).toContain('{canRun && !composerRunAside && (');
    expect(studio).toContain("const composerRunAside = composerTextHidden && isDesktop;");
    expect(studio).toMatch(/activeTool === 'vfx' \|\| shootActive \|\| mode === 'surgical' \? false/);
  });
});

describe('Motion transfer is hidden', () => {
  test('the studio neither imports its panel nor keeps the avatar tab that held it', () => {
    expect(studio).not.toMatch(/import\(['"][^'"]*MotionControlPanel['"]\)/);
    expect(studio).not.toMatch(/<MotionControlPanel\b/);
    expect(studio).not.toMatch(/\blipTab\b|\bsetLipTab\b/);
    expect(studio).toContain("case 'motion': break;");
    expect(studio).not.toMatch(/activeTool === 'motion'/);
  });

  test('the catalog keeps the id but offers it nowhere', () => {
    expect(getService('video.motion')?.status).toBe('hidden');
    for (const t of ['motion transfer', 'Motion transfer', 'მოძრაობის გადატანა', 'перенос движения']) {
      expect(resolveService(t)?.id).not.toBe('video.motion');
      expect(searchServices(t).map((s) => s.id)).not.toContain('video.motion');
    }
  });
});

describe('the voice button opens the selfie avatar', () => {
  test('no LiveAvatar tier is left in the shell; the component stays unmounted', () => {
    expect(existsSync(join(process.cwd(), 'components/voice/LiveAvatarRealtime.tsx'))).toBe(true);
    // The comment that says why it is gone names the flag and the file; no code imports, renders or reads them.
    expect(chrome).not.toMatch(/import\([^)]*LiveAvatarRealtime|from ['"][^'"]*LiveAvatarRealtime|<LiveAvatarRealtime\b/);
    expect(chrome).not.toMatch(/process\.env\.NEXT_PUBLIC_LIVEAVATAR_ENABLED|liveAvatarUnavailable/);
  });

  test('Gemini Live first, the plain voice chat when it is unavailable', () => {
    const at = chrome.indexOf('GEMINI_LIVE_ENABLED && liveUid && !liveUnavailable');
    expect(at).toBeGreaterThan(0);
    const block = chrome.slice(at, at + 900);
    expect(block.indexOf('<GeminiLiveConversation')).toBeGreaterThan(0);
    expect(block.indexOf('<VoiceConversation')).toBeGreaterThan(block.indexOf('<GeminiLiveConversation'));
  });
});
