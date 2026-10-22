/** @jest-environment node */
/**
 * The refusal for a media tool with no Google engine (MASTER TASK v3.1, audit F-04).
 *
 * Pinned here: it always refuses, whatever MEDIA_GOOGLE_ONLY or OUTSIDE_ENGINES_APPROVED say (the old re-open rule), the
 * refusal shape and its three languages, and that every entry GATED_ENTRIES lists really calls the guard, so the list
 * cannot drift from the code.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as policy from './mediaPolicy';
import { GATED_ENTRIES, GOOGLE_ONLY_CODE, googleOnlyMessage, refuseOutsideEngine } from './mediaPolicy';

const ROOT = join(__dirname, '..', '..');
const req = (cookie?: string) =>
  new Request('https://myavatar.ge/api/x', { method: 'POST', headers: cookie ? { cookie } : {} });
const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; });

describe('the refusal', () => {
  it.each([
    {},
    { MEDIA_GOOGLE_ONLY: '1' },
    { MEDIA_GOOGLE_ONLY: '0' },
    { MEDIA_GOOGLE_ONLY: 'off', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-14-test' },
    { MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-heygen' },
  ])('refuses whatever the env says (%o)', (env) => {
    delete process.env.MEDIA_GOOGLE_ONLY;
    delete process.env.OUTSIDE_ENGINES_APPROVED;
    Object.assign(process.env, env);
    expect(refuseOutsideEngine(req()).status).toBe(503);
  });

  it('no longer exports the switch', () => {
    expect('isMediaGoogleOnly' in policy).toBe(false);
  });

  it('503 google_only, with every field the studio readers look at', async () => {
    const res = refuseOutsideEngine(req('NEXT_LOCALE=en'));
    expect(res.status).toBe(503);
    const body = await res.json();
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
    expect((await refuseOutsideEngine(req('NEXT_LOCALE=ru')).json()).message).toBe(googleOnlyMessage('ru'));
    expect((await refuseOutsideEngine(req()).json()).message).toBe(googleOnlyMessage('ka'));
    expect((await refuseOutsideEngine(null).json()).message).toBe(googleOnlyMessage('ka'));
    expect(new Set([googleOnlyMessage('ka'), googleOnlyMessage('en'), googleOnlyMessage('ru')]).size).toBe(3);
  });
});

describe('GATED_ENTRIES documents every refusing entry and matches the code', () => {
  it('lists each file once', () => {
    const files = GATED_ENTRIES.map((e) => e.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it.each(GATED_ENTRIES.map((e) => [e.file]))('%s calls the guard', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    expect(src).toMatch(/refuseOutsideEngine\(/);
  });
});
