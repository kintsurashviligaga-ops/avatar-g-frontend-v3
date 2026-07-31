/**
 * Settle a music charge against the track that was ACTUALLY delivered.
 *
 * ⚠️ WHY THIS EXISTS. Music is billed by duration — 30s / 60s / 90s are three different prices — and the
 * charge is reserved UP FRONT from the duration the user picked. But the primary engine does not accept a
 * length at all: Lyria is steered entirely through its prompt string, its Interactions API has no duration
 * field, and its result is uploaded untrimmed. The sibling engines (Udio, ElevenLabs, MusicGen) all trim
 * or request the requested length; Lyria simply returns whatever it returns, typically a short clip.
 *
 * So picking "Full song" charged the 90s tier — 12 credits against 5, a 2.4× premium — and returned the
 * same short clip the 30s setting produces. The result card even badges the engine honestly as "Lyria",
 * so the user could see they had paid the long tier for a short track.
 *
 * The length cannot be forced on the engine, so the CHARGE is corrected instead: the delivered track is
 * measured and anything paid above its real tier is refunded. Reserve-then-settle, the same shape the
 * render sagas here already use.
 *
 * Pure on purpose — no ffmpeg, no ledger, no Supabase — so the arithmetic can be tested on its own.
 */

/** Tier boundaries, mirroring creditCostFor('music', { seconds }). */
export const MUSIC_TIER_SEC = [30, 60, 90] as const;

/**
 * Which billing tier a real duration falls into. A track is never billed BELOW the shortest tier — 30s is
 * the floor price, not a pro-rata rate.
 */
export function musicTierFor(actualSec: number): number {
  if (!Number.isFinite(actualSec) || actualSec <= 0) return 30;
  if (actualSec >= 90) return 90;
  if (actualSec >= 60) return 60;
  return 30;
}

export interface MusicSettlement {
  /** Seconds the charge should have been based on. */
  settledSec: number;
  /** True when the delivered track is a whole tier shorter than what was paid for. */
  overcharged: boolean;
}

/**
 * Compare what was billed against what landed.
 *
 * `actualSec <= 0` means the measurement itself failed (no ffmpeg, an unreadable container). That is NOT
 * treated as a short track: refunding on a failed measurement would hand out credits for a full-length
 * song whose bytes we simply could not read. Unmeasured keeps the original charge.
 */
export function settleMusicCharge(billedSec: number, actualSec: number): MusicSettlement {
  const billedTier = musicTierFor(billedSec);
  if (!Number.isFinite(actualSec) || actualSec <= 0) return { settledSec: billedTier, overcharged: false };

  // A small tolerance so a 89.6s "90 second" render is not demoted a whole tier over an encoder rounding
  // difference. Only a genuinely shorter track settles down.
  const deliveredTier = musicTierFor(actualSec + 1.5);
  if (deliveredTier >= billedTier) return { settledSec: billedTier, overcharged: false };
  return { settledSec: deliveredTier, overcharged: true };
}
