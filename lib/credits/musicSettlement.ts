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

/** The share of a tier's length a delivered track must reach to be billed at that tier. */
export const MUSIC_TIER_TOLERANCE = 0.9;

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

  // A track within 10 % of a tier counts as that tier: Lyria 3 Pro lands a little under the length it is asked for
  // (Production 2026-10-18: 58.1 s for 60 s, 87.6 s for 90 s), and a 1.5 s margin refunded both as a whole tier short.
  // Only a genuinely shorter track settles down: a ~30 s clip never reaches 54 s.
  const deliveredTier = musicTierFor(actualSec / MUSIC_TIER_TOLERANCE);
  if (deliveredTier >= billedTier) return { settledSec: billedTier, overcharged: false };
  return { settledSec: deliveredTier, overcharged: true };
}
