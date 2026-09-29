/** @jest-environment node */
/**
 * Structural guards on the two composite refund paths.
 *
 * ⚠️ THESE ARE SOURCE ASSERTIONS, NOT BEHAVIOURAL PROOF, and that is worth being honest about.
 * handleMusicVideoComposite and buildFilmComposite are both several hundred lines behind a dozen provider
 * imports; a faithful behavioural harness for them is its own piece of work. What these catch is the
 * specific way each bug came back into existence — a refund deleted, or a guard narrowed — which is how
 * both of them arrived in the first place.
 *
 * What they guard:
 *   · musicVideoComposite had NO refund of any kind. Both legs are debited by withTrace the moment the
 *     inner call resolves, then mapped to null when nothing came back, and the user was told the video
 *     was "skipped" while still paying for it.
 *   · filmComposite refunded only when NOTHING queued (`if (!anyClip)`), so a film where three clips
 *     came back and two were billed-and-failed kept the money for the two that produced nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

describe('music-video composite', () => {
  const src = read('lib/chat/musicVideoComposite.ts');

  it('records whether each leg was ACTUALLY debited', () => {
    // Refunding on a null result alone would credit users who were never charged: a leg is also null
    // when the provider is unconfigured (the traced call never ran) and when it threw (withTrace marks
    // the trace failed and issues no debit).
    expect(src).toContain('musicDebited = true');
    expect(src).toContain('videoDebited = true');
  });

  it('refunds a leg that was debited and produced nothing — what the LEDGER took, never a forecast', () => {
    // credit_wallet_gel converts GEL ×10 into credits: refunding a 2 ₾ forecast paid back 20 credits for a debit
    // that (debit_wallet_gel being undefined on the production database) never happened. refundDebitByRef pays
    // back exactly the net debit under the leg's own ref.
    expect(src).toContain('refundDebitByRef');
    expect(src).not.toMatch(/creditWalletGel\(/);
    expect(src).toMatch(/musicDebited && !musicWorkId/);
    expect(src).toMatch(/videoDebited && !videoTaskRef/);
  });

  it('never refunds an anonymous caller', () => {
    // Anonymous requests are not billed through this wallet at all.
    expect(src).toMatch(/const realUser = Boolean\(input\.userId && input\.userId !== 'anonymous'\)/);
  });

  it('refunds under the leg\'s own debit ref (refundDebitByRef appends the idempotent :refund)', () => {
    expect(src).toMatch(/refundDebitByRef\(input\.userId as string, `\$\{compositeId\}:\$\{leg\}`\)/);
    expect(src).toContain('deductRef: `${compositeId}:music`');
    expect(src).toContain('deductRef: `${compositeId}:video`');
  });
});

describe('film composite', () => {
  const src = read('lib/chat/filmComposite.ts');

  it('refunds billed legs that produced nothing even when siblings succeeded', () => {
    // The regression is subtle: narrowing this back to the !anyClip branch restores the leak silently.
    expect(src).toMatch(/clips\.filter\(\(c\) => c\.debited && c\.status !== 'queued'\)/);
    expect(src).toContain('if (strandedLegs.length) await rollbackFilmDebits(strandedLegs)');
  });

  it('still refunds everything when no clip queued at all', () => {
    expect(src).toContain('await rollbackFilmDebits(clips)');
  });

  it('refunds each leg under its own debit ref, from the ledger — never the GEL forecast', () => {
    expect(src).toMatch(/refundDebitByRef\(input\.userId as string, `\$\{compositeId\}:clip:\$\{c\.ordinal\}`\)/);
    expect(src).toContain('deductRef: `${compositeId}:clip:${scene.ordinal}`');
    expect(src).not.toMatch(/creditWalletGel\(/); // (a comment may still name it; a CALL may not)
  });
});

describe('film dispatch acceptance', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'lib/chat/filmComposite.ts'), 'utf8');

  it('does not file a terminally-failed dispatch as queued', () => {
    // ⚠️ A REFERENCE IS NOT AN ACCEPTANCE. The check used to be `if (taskRef)` alone, so a dispatch that
    // handed back an id while reporting failure was filed as `queued` — the leg kept its charge, it
    // counted toward `anyClip` and so suppressed the rollback for its siblings, and the poller waited on
    // a job that was already dead. ServiceManager's own retry loop refuses the same shape.
    expect(src).toContain('if (taskRef && !dispatchDead)');
    expect(src).toMatch(/dispatched\.success === false/);
    expect(src).toMatch(/dispatched\.predictionStatus === 'failed'/);
  });

  it('treats canceled and error as dead too', () => {
    expect(src).toMatch(/predictionStatus === 'canceled'/);
    expect(src).toMatch(/predictionStatus === 'error'/);
  });
});
