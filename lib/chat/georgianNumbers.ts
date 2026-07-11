/**
 * georgianNumbers — spell Arabic digits as Georgian cardinal words for TTS.
 * ========================================================================
 *
 * WHY: ElevenLabs (and most TTS) read a bare "190" digit-by-digit in Georgian
 * ("ერთი ცხრა ნული" — one-nine-zero), which is wrong. This converts the number to
 * its proper spoken form ("ას ოთხმოცდაათი") BEFORE the text reaches the engine.
 *
 * Georgian numerals are VIGESIMAL (base-20): the tens are built on twenties —
 * 20 ოცი · 40 ორმოცი · 60 სამოცი · 80 ოთხმოცი — with an "-და-" (and) infix for the
 * intermediate values (90 = ოთხმოცდაათი = "four-twenties-and-ten"). Scope: 0–9999
 * (covers years, prices, credits, counts). Numbers ≥ 10000 or with decimals are left
 * as-is (rarer + inflection-heavy); the provider best-effort handles them.
 *
 * IMPORTANT: apply ONLY on Georgian text (the ka TTS path). Running it on en/ru would
 * corrupt those reads — use `containsGeorgian()` to gate. Pure + dependency-free + tested.
 */

// 0–19 (units + teens), directly indexed.
const UNITS = [
  'ნული', 'ერთი', 'ორი', 'სამი', 'ოთხი', 'ხუთი', 'ექვსი', 'შვიდი', 'რვა', 'ცხრა',
  'ათი', 'თერთმეტი', 'თორმეტი', 'ცამეტი', 'თოთხმეტი', 'თხუთმეტი', 'თექვსმეტი', 'ჩვიდმეტი', 'თვრამეტი', 'ცხრამეტი',
] as const;

// Vigesimal tens: pure form (exact multiple) + combining form (with a 1–19 remainder).
const VIG_PURE: Record<number, string> = { 20: 'ოცი', 40: 'ორმოცი', 60: 'სამოცი', 80: 'ოთხმოცი' };
const VIG_COMBINE: Record<number, string> = { 20: 'ოცდა', 40: 'ორმოცდა', 60: 'სამოცდა', 80: 'ოთხმოცდა' };

// Hundreds: pure form (exact N00) + combining form (with a remainder), indexed by the hundreds digit.
const HUND_PURE = ['', 'ასი', 'ორასი', 'სამასი', 'ოთხასი', 'ხუთასი', 'ექვსასი', 'შვიდასი', 'რვაასი', 'ცხრაასი'] as const;
const HUND_COMBINE = ['', 'ას', 'ორას', 'სამას', 'ოთხას', 'ხუთას', 'ექვსას', 'შვიდას', 'რვაას', 'ცხრაას'] as const;

/** True if the string contains any Georgian letter (U+10A0–U+10FF) — the gate for applying this. */
export function containsGeorgian(s: string): boolean {
  return /[Ⴀ-ჿ]/.test(s);
}

/** Internal recursive speller — assumes 0 ≤ n ≤ 9999 (the public API range-checks first). */
function spell(n: number): string {
  if (n < 20) return UNITS[n]!;
  if (n < 100) {
    const base = n >= 80 ? 80 : n >= 60 ? 60 : n >= 40 ? 40 : 20;
    const rem = n - base;
    return rem === 0 ? VIG_PURE[base]! : VIG_COMBINE[base]! + UNITS[rem]!;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    return rem === 0 ? HUND_PURE[h]! : `${HUND_COMBINE[h]!} ${spell(rem)}`;
  }
  // 1000–9999 — 1000 = "ათასი" (no "ერთი"); 2000+ = "<count> ათას(ი)".
  const t = Math.floor(n / 1000);
  const rem = n % 1000;
  const thousandWord = `${t === 1 ? '' : `${spell(t)} `}${rem === 0 ? 'ათასი' : 'ათას'}`;
  return rem === 0 ? thousandWord : `${thousandWord} ${spell(rem)}`;
}

/**
 * Spell an integer 0–9999 as Georgian words. Returns null for out-of-range / non-finite
 * (the caller then leaves the original digits untouched).
 */
export function spellGeorgianNumber(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return null;
  return spell(n);
}

/**
 * Replace standalone integer runs (0–9999) in a string with their spelled Georgian form.
 * Numbers outside the range are left as raw digits. Non-digit text is untouched.
 */
export function numbersToGeorgianWords(s: string): string {
  if (!s) return s;
  return s.replace(/\d+/g, (m) => {
    const n = Number(m);
    const spelled = spellGeorgianNumber(n);
    return spelled ?? m;
  });
}

/** Convenience: apply the conversion ONLY when the text is Georgian (safe no-op otherwise). */
export function normalizeGeorgianNumbersForSpeech(s: string): string {
  return containsGeorgian(s) ? numbersToGeorgianWords(s) : s;
}
