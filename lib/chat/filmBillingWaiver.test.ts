/** @jest-environment node */
/**
 * The one-time assemble waiver must survive a failed render.
 *
 * ⚠️ IT WAS SPENT UP FRONT AND NEVER RETURNED. consumeFilmBilling() burns the token's single billing skip
 * before the stitch so a replay cannot reuse it — right — but no failure path undid it. A film whose
 * stitch then died left the marker spent, so the retry the user was invited to make was charged
 * ASSEMBLE_COST (20 credits) for a film the product had told them was free. The user paid for the outage.
 */
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => null }));

// eslint-disable-next-line import/first
import { consumeFilmBilling, restoreFilmBilling, getFilmStatus, recordFreeFilmWaiver } from './filmStatusStore';

const TOKEN = 'film:test-token';

describe('restoreFilmBilling', () => {
  it('hands the waiver back after a failed assemble', async () => {
    await recordFreeFilmWaiver(TOKEN, 'user-1');
    expect((await getFilmStatus(TOKEN))?.billingConsumed).toBe(false);

    await consumeFilmBilling(TOKEN);
    expect((await getFilmStatus(TOKEN))?.billingConsumed).toBe(true);

    await restoreFilmBilling(TOKEN);
    // Without this the next attempt is billed 20 credits for the same free film.
    expect((await getFilmStatus(TOKEN))?.billingConsumed).toBe(false);
  });

  it('keeps the evidence of the upstream payment intact', async () => {
    // Restoring must NOT invent freeFilmWaived / payerUid — those are what prove the film was already
    // paid for, so a token that never was cannot be turned into a waiver here.
    await recordFreeFilmWaiver(TOKEN, 'user-1');
    await consumeFilmBilling(TOKEN);
    await restoreFilmBilling(TOKEN);
    const after = await getFilmStatus(TOKEN);
    expect(after?.freeFilmWaived).toBe(true);
    expect(after?.payerUid).toBe('user-1');
  });

  it('does nothing for a token that was never consumed', async () => {
    await recordFreeFilmWaiver(TOKEN, 'user-1');
    await restoreFilmBilling(TOKEN);
    expect((await getFilmStatus(TOKEN))?.billingConsumed).toBe(false);
  });

  it('does nothing for an unknown token', async () => {
    await expect(restoreFilmBilling('film:does-not-exist')).resolves.toBeUndefined();
  });
});

describe('the assemble route returns it on the failure path', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', '..', 'app/api/video/assemble/route.ts'), 'utf8',
  ) as string;

  it('restores BEFORE the skipBilling early return', () => {
    // skipBilling is TRUE in exactly the case that spent the waiver, so a restore placed after that
    // early return would never run — which is how this stayed broken.
    const compensate = src.slice(src.indexOf('compensate: async (_r, ctx) =>'));
    const restoreAt = compensate.indexOf('restoreFilmBilling');
    const returnAt = compensate.indexOf('if (skipBilling || uid === null) return;');
    expect(restoreAt).toBeGreaterThan(-1);
    expect(restoreAt).toBeLessThan(returnAt);
  });
});
