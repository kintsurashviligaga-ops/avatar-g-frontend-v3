/**
 * Tell the app shell that a spend just landed, so the header balance re-reads.
 *
 * ⚠️ SIX STUDIOS SPENT CREDITS AND NONE OF THEM SAID SO. ChatChrome only refreshes the balance pill on
 * mount, on auth change, and when it hears `myavatar:credits-updated`. OmniStudio fires that from its
 * `notifyCredit` helper — but DubbingStudio, LipsyncStudio, Model3dStudio, SlidesStudio, MontageStudio
 * and MusicStudio each call their paid endpoint directly and never fired it. Use one of those services
 * and the number in the header does not move, so the product looks like it is generating for free —
 * reported as "credits are spent incorrectly / it shows credits that do not exist".
 *
 * The deduction itself was never broken. I verified `deduct_credits` against the live database: 50 → 25
 * on a 25-credit charge, a replayed idempotency ref does not double-charge, and an overspend is refused
 * with the balance untouched. The money was right; only the number on screen was stale.
 *
 * ⚠️ CALL THIS AFTER EVERY PAID GENERATION, on success. It is a fire-and-forget DOM event: no await, no
 * failure path, and safe to call from anywhere including a non-DOM test environment.
 */
export function creditsUpdated(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event('myavatar:credits-updated'));
  } catch {
    /* non-DOM environment — nothing to notify */
  }
}

export const CREDITS_UPDATED_EVENT = 'myavatar:credits-updated';
