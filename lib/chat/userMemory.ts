import 'server-only';

/**
 * VECTOR 3 — cross-chat persistent user memory.
 *
 * A tiny, FAIL-OPEN layer over the `user_profile_metadata` table (migration 007). It:
 *   1. reads a user's stored facts and formats them into a system-prompt preamble, so
 *      Agent G "remembers" the user across every separate chat session;
 *   2. conservatively EXTRACTS explicit personal facts (weight / height / age / a custom
 *      companion name) from a user turn and upserts them.
 *
 * Every DB touch is wrapped so that BEFORE the migration runs (table absent) or without a
 * signed-in user, all functions no-op cleanly — the chat keeps working, and the moment the
 * table exists the memory springs to life. The client is passed in loosely-typed (`unknown`)
 * so referencing a table that isn't in the generated Database types never breaks typecheck.
 */

export interface ProfileFact {
  key: string;
  value: string;
  category: string;
}

// Minimal structural view of the Supabase query builder we use — lets us accept the route's
// typed client (as `unknown`) without pulling the not-yet-generated table into the types.
interface SbFilter {
  eq: (col: string, val: string) => SbFilter;
  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
}
interface SbBuilder {
  select: (cols: string) => SbFilter;
  upsert: (rows: unknown, opts?: { onConflict?: string }) => Promise<{ error: unknown }>;
}
interface SupabaseLike {
  from: (table: string) => SbBuilder;
}

const TABLE = 'user_profile_metadata';
const MAX_FACTS = 64;

function asClient(client: unknown): SupabaseLike | null {
  if (client && typeof (client as { from?: unknown }).from === 'function') return client as SupabaseLike;
  return null;
}

/** Read a user's stored facts. FAIL-OPEN: returns [] on no client / no user / absent table / any error. */
export async function getUserProfileFacts(client: unknown, userId: string | null | undefined): Promise<ProfileFact[]> {
  const sb = asClient(client);
  if (!sb || !userId) return [];
  try {
    const { data, error } = await sb.from(TABLE).select('key, value, category').eq('user_id', userId).limit(MAX_FACTS);
    if (error || !Array.isArray(data)) return [];
    return (data as Array<Record<string, unknown>>)
      .map((r) => ({ key: String(r.key ?? ''), value: String(r.value ?? ''), category: String(r.category ?? 'general') }))
      .filter((f) => f.key && f.value);
  } catch {
    return [];
  }
}

/** Format stored facts into a compact system-prompt preamble, or null when there's nothing to inject. */
export function buildProfilePreamble(facts: ProfileFact[]): string | null {
  if (!facts.length) return null;
  const botName = facts.find((f) => f.key === 'preferred_bot_name');
  const bio = facts.filter((f) => f.key !== 'preferred_bot_name');
  const parts: string[] = [];
  if (bio.length) {
    parts.push('USER PROFILE (persistent memory — the user shared these earlier; remember them across ALL chats and use them naturally when relevant): '
      + bio.map((f) => `${f.key}: ${f.value}`).join('; ') + '.');
  }
  if (botName) {
    parts.push(`The user prefers to call you "${botName.value}" — answer to that name.`);
  }
  return parts.length ? parts.join(' ') : null;
}

/** Clamp + sanitize a numeric fact to a sane range; null if out of range / not a number. */
function numInRange(raw: string, min: number, max: number): string | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= min && n <= max ? String(n) : null;
}

/**
 * Conservatively extract explicit personal facts from ONE user message. Pure + deterministic → unit-testable.
 * Deliberately narrow (only clear, self-declared statements) so it never stores noise. Handles en / ka / ru.
 */
export function extractProfileFacts(text: string): ProfileFact[] {
  const out = new Map<string, ProfileFact>();
  const t = (text || '').slice(0, 2000);
  const put = (key: string, value: string, category: string) => { if (value) out.set(key, { key, value, category }); };

  // Weight (kg) — "I weigh 80kg", "my weight is 80", "ჩემი წონა 80", "мой вес 80". English triggers are \b-anchored
  // so a substring inside another word (e.g. "average"/"install") can never mint a bogus fact.
  const weight = t.match(/(?:\bweigh(?:t)?(?:\s+is)?|წონა(?:ა)?|\bвес)\D{0,6}(\d{2,3})\s*(?:kg|kgs|kilos?|კგ|кг)?/i)
    ?? t.match(/(\d{2,3})\s*(?:kg|კგ|кг)/i);
  if (weight?.[1]) { const v = numInRange(weight[1], 30, 400); if (v) put('weight', `${v} kg`, 'personal_bio'); }

  // Height (cm) — "I'm 180cm", "my height is 180", "სიმაღლე 180", "рост 180"
  const height = t.match(/(?:\bheight(?:\s+is)?|\btall\b|სიმაღლ[ეი]|\bрост)\D{0,6}(\d{2,3})\s*(?:cm|სმ|см)?/i)
    ?? t.match(/(\d{3})\s*(?:cm|სმ|см)/i);
  if (height?.[1]) { const v = numInRange(height[1], 100, 260); if (v) put('height', `${v} cm`, 'personal_bio'); }

  // Age — "I'm 25 years old", "my age is 25", "25 წლის ვარ", "мне 25 лет"
  const age = t.match(/(?:\bage(?:\s+is)?|\byears?\s*old|ასაკ[ია]?|\bмне\b)\D{0,6}(\d{1,3})/i)
    ?? t.match(/(\d{1,3})\s*(?:years?\s*old|წლის|лет|года?)/i);
  if (age?.[1]) { const v = numInRange(age[1], 5, 120); if (v) put('age', v, 'personal_bio'); }

  // Companion / bot name override — "call you Jarvis", "your name is Jarvis", "დაგარქმევ Jarvis"
  const bot = t.match(/(?:call you|name you|your name is|rename you to|i(?:'|’)?ll call you|დაგარქმევ|დაგიძახებ|зовут тебя|буду звать тебя)\s+["“']?([A-Za-zႠ-ჿ][\wႠ-ჿ-]{1,20})/i);
  if (bot?.[1]) {
    const name = bot[1].replace(/["“'.,!?]+$/, '');
    // Don't capture stop-words that follow the trigger phrase but aren't a name.
    if (name && !/^(me|you|it|that|this|the|a|an)$/i.test(name)) put('preferred_bot_name', name, 'preferred_bot_name');
  }

  return [...out.values()];
}

/** Upsert facts for a user. FAIL-OPEN: no-ops on no client / no user / no facts / absent table / any error. */
export async function saveUserProfileFacts(client: unknown, userId: string | null | undefined, facts: ProfileFact[]): Promise<void> {
  const sb = asClient(client);
  if (!sb || !userId || !facts.length) return;
  try {
    const now = new Date().toISOString();
    await sb.from(TABLE).upsert(
      facts.map((f) => ({ user_id: userId, key: f.key, value: f.value, category: f.category, updated_at: now })),
      { onConflict: 'user_id,key' },
    );
  } catch {
    // fail-open — memory is best-effort and must never break the chat
  }
}
