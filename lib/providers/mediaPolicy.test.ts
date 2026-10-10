/** @jest-environment node */
/**
 * MEDIA_GOOGLE_ONLY — the opt-in switch that keeps every user-facing media tool on Google / ElevenLabs.
 *
 * Pinned here: off by default (Production unchanged until the owner flips it), the refusal shape and its three
 * languages, and that every entry GATED_ENTRIES lists really calls the guard, so the list cannot drift from the code.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GATED_ENTRIES, GOOGLE_ONLY_CODE, googleOnlyMessage, isMediaGoogleOnly, refuseOutsideEngine } from './mediaPolicy';

const ROOT = join(__dirname, '..', '..');
const req = (cookie?: string) =>
  new Request('https://myavatar.ge/api/x', { method: 'POST', headers: cookie ? { cookie } : {} });

describe('the switch', () => {
  it('is OFF unless set to a truthy value', () => {
    expect(isMediaGoogleOnly({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isMediaGoogleOnly({ MEDIA_GOOGLE_ONLY: '' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isMediaGoogleOnly({ MEDIA_GOOGLE_ONLY: '0' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isMediaGoogleOnly({ MEDIA_GOOGLE_ONLY: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isMediaGoogleOnly({ MEDIA_GOOGLE_ONLY: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isMediaGoogleOnly({ MEDIA_GOOGLE_ONLY: 'true' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('off → no refusal: the route runs as it does today', () => {
    expect(refuseOutsideEngine(req(), {} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('on → 503 google_only, with every field the studio readers look at', async () => {
    const res = refuseOutsideEngine(req('NEXT_LOCALE=en'), { MEDIA_GOOGLE_ONLY: '1' } as NodeJS.ProcessEnv);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    const body = await res!.json();
    expect(body).toEqual({
      success: false,
      url: null,
      jobId: null,
      code: GOOGLE_ONLY_CODE,
      error: GOOGLE_ONLY_CODE,
      message: googleOnlyMessage('en'),
    });
    expect(body.message).toMatch(/not charged/);
  });

  it('speaks the visitor language from NEXT_LOCALE, Georgian by default', async () => {
    const on = { MEDIA_GOOGLE_ONLY: 'true' } as NodeJS.ProcessEnv;
    expect((await refuseOutsideEngine(req('NEXT_LOCALE=ru'), on)!.json()).message).toBe(googleOnlyMessage('ru'));
    expect((await refuseOutsideEngine(req(), on)!.json()).message).toBe(googleOnlyMessage('ka'));
    expect((await refuseOutsideEngine(null, on)!.json()).message).toBe(googleOnlyMessage('ka'));
    expect(new Set([googleOnlyMessage('ka'), googleOnlyMessage('en'), googleOnlyMessage('ru')]).size).toBe(3);
  });
});

describe('GATED_ENTRIES is the switch documentation and matches the code', () => {
  it('lists each file once', () => {
    const files = GATED_ENTRIES.map((e) => e.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it.each(GATED_ENTRIES.map((e) => [e.file]))('%s calls the guard', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    expect(src).toMatch(/refuseOutsideEngine\(|isMediaGoogleOnly\(/);
  });
});
