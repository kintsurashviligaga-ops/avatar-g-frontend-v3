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

  it('refunds a leg that was debited and produced nothing', () => {
    expect(src).toContain('creditWalletGel');
    expect(src).toMatch(/musicDebited && !musicWorkId/);
    expect(src).toMatch(/videoDebited && !videoTaskRef/);
  });

  it('never refunds an anonymous caller', () => {
    // Anonymous requests are not billed through this wallet at all.
    expect(src).toMatch(/const realUser = Boolean\(input\.userId && input\.userId !== 'anonymous'\)/);
  });

  it('uses a distinct :refund ref so a retry cannot over-credit', () => {
    expect(src).toMatch(/\$\{compositeId\}:\$\{leg\}:refund/);
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

  it('keeps the per-leg :refund ref', () => {
    expect(src).toMatch(/\$\{compositeId\}:clip:\$\{c\.ordinal\}:refund/);
  });
});
