/** @jest-environment node */
/**
 * Phase 8.11 zero-error pass: a caught error becomes a line written for the reader, never the browser's „Failed to
 * fetch", a stack fragment or a provider's English prose in a Georgian bubble.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeServiceError, userFacingMessage, UserFacingError } from './serviceError';

const FB = 'FALLBACK';

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('a dropped connection says so, in the reader\'s language (Chrome, Safari, Firefox wording)', () => {
  for (const raw of [new TypeError('Failed to fetch'), new TypeError('Load failed'), new TypeError('NetworkError when attempting to fetch resource.'), 'net::ERR_INTERNET_DISCONNECTED']) {
    expect(userFacingMessage(raw, 'ka', FB)).toBe('კავშირი გაწყდა. შეამოწმე ინტერნეტი და სცადე ხელახლა.');
  }
  expect(userFacingMessage(new TypeError('Failed to fetch'), 'en', FB)).toBe('The connection dropped. Check your internet and try again.');
  expect(userFacingMessage(new TypeError('Failed to fetch'), 'ru', FB)).toMatch(/^Связь прервалась/);
  // the same mapping now holds for the older helper too
  expect(describeServiceError('Failed to fetch', 'ka', FB)).toMatch(/^კავშირი გაწყდა/);
});

test('our own lines are kept: a UserFacingError in any language, or a line already in the reader\'s script', () => {
  expect(userFacingMessage(new UserFacingError('The video could not be made. You were not charged.'), 'en', FB)).toBe('The video could not be made. You were not charged.');
  expect(userFacingMessage(new Error('ვიდეო ვერ შეიქმნა. თანხა დაგიბრუნდა.'), 'ka', FB)).toBe('ვიდეო ვერ შეიქმნა. თანხა დაგიბრუნდა.');
  expect(userFacingMessage(new Error('Видео не создано.'), 'ru', FB)).toBe('Видео не создано.');
});

test('known codes are mapped; everything else falls back and is never echoed', () => {
  expect(userFacingMessage(new Error('insufficient_credits'), 'ka', FB)).toMatch(/კრედიტი არ გყოფნის/);
  expect(userFacingMessage(new Error('rate_limited: 429'), 'en', FB)).toMatch(/Too many requests|too many/i);
  for (const raw of [new Error("Cannot read properties of undefined (reading 'url')"), new Error('Unexpected token < in JSON at position 0'), new Error('INTERNAL: upstream 500'), {}, null, undefined, '']) {
    expect(userFacingMessage(raw, 'ka', FB)).toBe(FB);
  }
  // an English sentence is not "already in the reader's script" for a Georgian reader
  expect(userFacingMessage(new Error('Model returned no candidates'), 'ka', FB)).toBe(FB);
});

test('guard: the surfaces fixed in 8.11 never print a raw error message again', () => {
  const files = [
    'components/studio/OmniStudio.tsx',
    'components/voice/LiveAvatarEnroll.tsx',
    'components/dashboard/command-center/CommandCenter.tsx',
    'components/services/UnifiedServiceLayout.tsx',
    'components/service-chat/ServiceChatShell.tsx',
    'components/onboarding/OnboardingWizard.tsx',
    'components/service/SmartIntakeForm.tsx',
  ];
  for (const f of files) {
    const src = readFileSync(join(process.cwd(), f), 'utf8');
    expect({ f, raw: /(?:set\w+\(|text:\s*`?[^`\n]*|error:\s*|errorMessage:\s*|content:\s*`?[^`\n]*)\$?\{?\s*(?:e|err) instanceof Error \? (?:e|err)\.message/.test(src) }).toEqual({ f, raw: false });
    expect({ f, raw: /`Error: \$\{/.test(src) }).toEqual({ f, raw: false });
  }
});
