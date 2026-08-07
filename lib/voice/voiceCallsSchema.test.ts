/** @jest-environment node */
/**
 * The voice-call log the webhook has always written to.
 *
 * ⚠️ THE TABLE DOES NOT EXIST AND THE CODE HAS ALWAYS ASSUMED IT DID. lib/voice/repository.ts touches
 * `voice_calls` from five places, and the dev server logs `voice.repository.insert_failed: Could not find
 * the table` on every call. So every voice call ever placed went unrecorded — no transcript, no duration,
 * no credit accounting — and the webhook's four retries each failed the same way, quietly.
 *
 * These assert the invariants that make the table safe to switch on, because the ones that matter cannot
 * be added later without a backfill and a billing argument.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '..', '..', 'supabase/migrations/20260807b_voice_calls.sql'), 'utf8');
const repo = readFileSync(join(__dirname, 'repository.ts'), 'utf8');

describe('voice_calls migration', () => {
  it('makes vapi_call_id UNIQUE — the billing guarantee', () => {
    // Vapi retries webhooks and the route itself retries four times. Without this one call becomes
    // several rows, each carrying its own credits_used, and the user pays per delivery attempt.
    expect(sql).toMatch(/vapi_call_id\s+text UNIQUE/);
  });

  it('does NOT constrain status', () => {
    // It comes from the provider. A strict list turns a status Vapi adds later into a LOST call record,
    // and for an append-only sink refusing the row is worse than storing a string we do not recognise.
    expect(sql).not.toMatch(/status[\s\S]{0,60}CHECK \(status IN/);
  });

  it('DOES constrain direction', () => {
    // Unlike status, this is derived by our own code from a closed set.
    expect(sql).toMatch(/CHECK \(direction IN \('inbound','outbound','web','unknown'\)\)/);
  });

  it('leaves user_id nullable', () => {
    // An inbound call from a number belonging to nobody is still a call; NOT NULL would make the webhook
    // fail closed and drop exactly the records worth having.
    expect(sql).not.toMatch(/user_id\s+uuid NOT NULL/);
  });

  it('refuses negative durations and charges', () => {
    expect(sql).toMatch(/duration_seconds[\s\S]{0,60}CHECK \(duration_seconds >= 0\)/);
    expect(sql).toMatch(/credits_used[\s\S]{0,60}CHECK \(credits_used >= 0\)/);
  });

  it('keeps transcripts off the client', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toMatch(/REVOKE ALL ON public\.voice_calls FROM anon, authenticated/);
  });

  it('verifies itself when applied', () => {
    expect(sql).toContain('VERIFY OK');
  });
});

describe('the migration matches what the code writes', () => {
  it('covers every column the repository inserts', () => {
    // A column the code writes and the table lacks is an insert that fails at runtime — which is the
    // whole reason this table was missing in the first place.
    const insert = repo.slice(repo.indexOf(".from('voice_calls')"));
    const columns = [...insert.slice(0, 900).matchAll(/^\s{6}(\w+):/gm)].map((m) => m[1]!);
    expect(columns.length).toBeGreaterThan(8);
    for (const c of columns) expect(sql).toContain(c);
  });
});
