/** @jest-environment node */
/**
 * A service failure must never show the user a machine code or English provider prose.
 *
 * ⚠️ `setError(j.error || t.failed)` WAS THE PATTERN. LipsyncStudio had been hardened against exactly
 * this on its START path and then printed the raw string anyway on its POLL path twenty lines below;
 * MusicStudio never had the guard at all. So a Georgian panel could display `duplicate_request`, or a
 * sentence written for an American developer, as if it were user-facing copy.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describeServiceError, describeGenerationFailure } from './serviceError';

const KA_FALLBACK = 'ვერ მოხერხდა';

describe('describeServiceError', () => {
  it('translates the codes users actually hit', () => {
    expect(describeServiceError('insufficient_credits', 'ka', KA_FALLBACK)).toContain('კრედიტი');
    expect(describeServiceError('duplicate_request', 'ka', KA_FALLBACK)).toContain('უკვე');
    expect(describeServiceError('provider_not_configured', 'ka', KA_FALLBACK)).toContain('გამორთულია');
  });

  it('finds a known failure inside a longer provider sentence', () => {
    // Providers rarely return a bare code — it arrives wrapped in prose.
    expect(describeServiceError('Error: you do not have enough credits to run this', 'en', 'x'))
      .toContain('Top up');
    expect(describeServiceError('429 Too Many Requests', 'en', 'x')).toContain('Wait a minute');
  });

  it('NEVER echoes an unrecognised string back at the user', () => {
    // The whole point. An unmapped string is a stack fragment or internal wording — showing it looks
    // like transparency and reads as a crash.
    const raw = 'TypeError: Cannot read properties of undefined (reading \'clip\')';
    expect(describeServiceError(raw, 'ka', KA_FALLBACK)).toBe(KA_FALLBACK);
  });

  it('falls back on empty, null and non-string input', () => {
    expect(describeServiceError('', 'ka', KA_FALLBACK)).toBe(KA_FALLBACK);
    expect(describeServiceError(null, 'ka', KA_FALLBACK)).toBe(KA_FALLBACK);
    expect(describeServiceError({ code: 5 }, 'ka', KA_FALLBACK)).toBe(KA_FALLBACK);
  });

  it('speaks every studio saga code in all three languages, Georgian by default', () => {
    // lib/studio/saga.ts → /api/estimate, /api/generate. Each one says what happened AND what to do next.
    const codes = ['price_changed', 'confirmation_required', 'model_unavailable', 'content_rejected', 'generation_failed',
      'invalid_input', 'provider_unavailable', 'billing_unavailable', 'cannot_cancel', 'not_configured'];
    for (const code of codes) {
      const ka = describeServiceError(code, 'ka', KA_FALLBACK);
      expect(ka).not.toBe(KA_FALLBACK);
      expect(ka).toMatch(/[Ⴀ-ჿ]/);
      expect(describeServiceError(code, 'en', 'x')).not.toBe('x');
      expect(describeServiceError(code, 'ru', 'x')).toMatch(/[Ѐ-ӿ]/);
    }
  });

  it('matches the studio codes whole — a longer string that merely contains one is not claimed', () => {
    expect(describeServiceError('xyz_price_changed_log', 'en', 'fallback')).toBe('fallback');
  });

  it('reads Georgian for any locale it does not ship', () => {
    expect(describeServiceError('rate_limited', 'de', 'x')).toBe(describeServiceError('rate_limited', 'ka', 'x'));
  });

  it('says what to do next, not just what broke', () => {
    // "Something went wrong" leaves the user nowhere to go.
    for (const code of ['insufficient_credits', 'timeout', 'too_large', 'unsupported_format']) {
      expect(describeServiceError(code, 'en', 'x')).toMatch(/try|top up|wait|sign in/i);
    }
  });
});

describe('no surface pastes a raw server string any more', () => {
  const dir = join(__dirname, '..');
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
  /** Comments stripped — each fix quotes the pattern it removed, and would otherwise match itself. */
  const codeOf = (f: string) =>
    readFileSync(join(dir, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

  it('has no [t.failed, j.step, j.message].join left', () => {
    // ⚠️ THE SHAPE THIS REPLACED produced "ვერ მოხერხდა · stitch · Request failed with status 502" —
    // three registers in one line, none of them telling the user what to do. The step was never
    // user-facing value either: the progress card names the stage in Georgian while the run happens.
    const offenders = files.filter((f) => /\[t\.failed,\s*j\??\.step/.test(codeOf(f)));
    expect(offenders).toEqual([]);
  });

  it('has no `${t.failed} · ${j.message}` left', () => {
    const offenders = files.filter((f) => /\$\{t\.failed\}\s*·\s*\$\{j\.message\}/.test(codeOf(f)));
    expect(offenders).toEqual([]);
  });

  it('the product chat shows no raw server string in a bubble or tile', () => {
    // ⚠️ OmniStudio IS the product. Its image bubble printed `j.message || j.error`, its image TILE the
    // same, and the music bubble printed `j.error` verbatim on an insufficient-credits refusal — so the
    // most-used screen in the app was the one still speaking English provider prose. The comment above
    // the image site was even right that a vague message is worse than useless; it just reached for the
    // server's words to be specific.
    const omni = readFileSync(join(dir, 'OmniStudio.tsx'), 'utf8');
    expect(omni).not.toMatch(/updateBubble\([^)]*\$\{[^}]*j\.(error|message)[^}]*\}/);
    expect(omni).not.toMatch(/error: j\.message \|\| j\.error/);
    expect(omni).toContain('describeServiceError');
  });

  it('routes setError through the mapper wherever a server string is involved', () => {
    // A bare `setError(j.error || t.failed)` is the original defect in its smallest form.
    const offenders = files.filter((f) => /setError\((?:p?j)\.(error|message)\s*\|\|/.test(codeOf(f)));
    expect(offenders).toEqual([]);
  });
});

describe('describeGenerationFailure — the refund notice is shown when, and only when, the server says it refunded', () => {
  // The launch directive's exact copy, in all three languages.
  const NOTICE = {
    ka: 'გენერაცია ვერ შესრულდა — კრედიტები დაგიბრუნდათ.',
    en: 'Generation failed — your credits were refunded.',
    ru: 'Не удалось сгенерировать — кредиты возвращены.',
  } as const;

  it('a failed body with refunded:true reads as ONE polite refund notice, in the user’s language', () => {
    for (const lang of ['ka', 'en', 'ru'] as const) {
      expect(describeGenerationFailure({ success: false, refunded: true, error: 'provider_unavailable', message: 'x' }, lang, 'fallback'))
        .toBe(NOTICE[lang]);
    }
    // A poll body (lipsync / presenter / motion) carries no `success` at all — the flag alone decides.
    expect(describeGenerationFailure({ done: true, error: 'render failed', refunded: true }, 'en', 'x')).toBe(NOTICE.en);
  });

  it('never claims a refund the server did not report', () => {
    expect(describeGenerationFailure({ success: false, refunded: false, error: 'music_failed' }, 'en', 'Music failed.')).toBe('Music failed.');
    expect(describeGenerationFailure({ success: false, error: 'image_failed' }, 'ka', KA_FALLBACK)).toBe(KA_FALLBACK);
    // A SUCCESS that settled part of its charge back (music: `refunded: true` beside the track) is not a failure.
    expect(describeGenerationFailure({ success: true, refunded: true }, 'en', 'x')).not.toBe(NOTICE.en);
  });

  it('reads the route’s machine code before its prose', () => {
    // 503 billing_unavailable arrives with a sentence the table does not know — the code still maps.
    const billing = { success: false, error: 'billing_unavailable', code: 'billing_unavailable', message: 'We could not reach billing — nothing was charged.' };
    expect(describeGenerationFailure(billing, 'en', 'x')).toBe(describeServiceError('billing_unavailable', 'en', 'y'));
    // 409 duplicate_request beside "This image is already being generated." (which no matcher knows).
    const dup = { success: false, error: 'duplicate_request', message: 'This image is already being generated.' };
    expect(describeGenerationFailure(dup, 'ka', KA_FALLBACK)).toContain('უკვე');
    // insufficient_credits rides in `code` beside a bilingual sentence.
    expect(describeGenerationFailure({ code: 'insufficient_credits', error: 'არასაკმარისი კრედიტი / Not enough credits' }, 'en', 'x')).toContain('Top up');
  });

  it('falls back like describeServiceError on anything unknown, and on junk input', () => {
    expect(describeGenerationFailure({ error: 'TypeError: x is undefined' }, 'ka', KA_FALLBACK)).toBe(KA_FALLBACK);
    expect(describeGenerationFailure(null, 'ka', KA_FALLBACK)).toBe(KA_FALLBACK);
    expect(describeGenerationFailure('oops', 'en', 'x')).toBe('x');
  });

  it('the product chat routes every image/music failure through it (so a server refund is actually shown)', () => {
    const omni = readFileSync(join(__dirname, '..', 'OmniStudio.tsx'), 'utf8');
    // runImageJob bubble, runImageBatch tile, runMusicJob bubble, and the image/music re-roll.
    expect(omni.match(/describeGenerationFailure\(j, locale, t\.imageFailed\)/g)?.length).toBe(2);
    expect(omni).toContain('describeGenerationFailure(j, locale, t.musicFailed)');
    expect(omni).toContain('describeGenerationFailure(j, locale, failMsg)');
  });
});
