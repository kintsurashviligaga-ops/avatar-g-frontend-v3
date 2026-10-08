/** @jest-environment node */
/**
 * lib/agent-g-orchestrator — Agent G's prompt on the older routes (/api/chat's fallback, /api/chat/stream,
 * /api/agent-g/chat, Telegram) is the studio chat's platform prompt, not the old text.
 * Pinned: same prompt as lib/chat/platformPrompt for the locale and search flag; the old prompt's false claims are gone
 * (vendor names §A removes, invented services, three different service counts); the date is per call.
 */
import { agentGSystemPrompt } from './agent-g-orchestrator';
import { buildPlatformPrompt } from '@/lib/chat/platformPrompt';

const now = new Date('2026-10-08T19:00:00Z');

it('is the platform prompt, per locale and per search flag', () => {
  for (const locale of ['ka', 'en', 'ru'] as const) {
    for (const googleSearch of [true, false]) {
      expect(agentGSystemPrompt({ locale, googleSearch, now })).toBe(buildPlatformPrompt({ locale, googleSearch, now }));
    }
  }
  // An unknown or missing locale is Georgian, the product's default.
  expect(agentGSystemPrompt({ locale: 'de', googleSearch: false, now })).toBe(buildPlatformPrompt({ locale: 'ka', googleSearch: false, now }));
  expect(agentGSystemPrompt({ locale: null, googleSearch: false, now })).toBe(buildPlatformPrompt({ locale: 'ka', googleSearch: false, now }));
});

it('no longer makes the old claims', () => {
  const p = agentGSystemPrompt({ locale: 'ka', googleSearch: false, now });
  for (const gone of ['HeyGen', 'Udio', 'Replicate', 'LTX', 'FLUX', 'WorldLabs', 'NanoBanana', 'Game Creator', 'Tourism', '14 AI', '13 creative']) {
    expect(p).not.toContain(gone);
  }
});

it('says when it cannot search, and carries the date of the call', () => {
  expect(agentGSystemPrompt({ locale: 'en', googleSearch: false, now })).toContain('You cannot search the web');
  expect(agentGSystemPrompt({ locale: 'en', googleSearch: false, now })).toContain('8 October 2026');
  expect(agentGSystemPrompt({ locale: 'en', googleSearch: false, now: new Date('2026-10-09T21:00:00Z') })).toContain('10 October 2026');
});
