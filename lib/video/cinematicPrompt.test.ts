/** @jest-environment node */
import {
  expandCinematicPrompt, deterministicCinematicPrompt, sanitizeCinematicOutput, looksEnriched,
  CINEMATIC_SYSTEM, type LlmFn,
} from './cinematicPrompt';

const RAW = 'a lion in the desert at sunrise';

describe('deterministicCinematicPrompt', () => {
  it('appends curated cinematic descriptors and enriches a bare prompt', () => {
    const out = deterministicCinematicPrompt(RAW);
    expect(out.startsWith(RAW)).toBe(true);
    expect(out).toMatch(/cinematic/i);
    expect(out).toMatch(/lens|dolly|depth of field/i);
    expect(out.length).toBeGreaterThan(RAW.length);
  });
  it('passes empty through and does not double-dress an already-cinematic prompt', () => {
    expect(deterministicCinematicPrompt('')).toBe('');
    const already = 'wide cinematic dolly shot, anamorphic lens, dramatic lighting of a castle';
    expect(deterministicCinematicPrompt(already)).toBe(already);
  });
});

describe('looksEnriched / sanitizeCinematicOutput', () => {
  it('detects cinematic dressing', () => {
    expect(looksEnriched('cinematic wide shot, anamorphic lens')).toBe(true);
    expect(looksEnriched('a dog running')).toBe(false);
  });
  it('strips preamble, quotes, markdown and collapses whitespace', () => {
    expect(sanitizeCinematicOutput('Here is the prompt: "A cinematic\n  wide shot"')).toBe('A cinematic wide shot');
    expect(sanitizeCinematicOutput('**Prompt:** `slow dolly push-in`')).toBe('slow dolly push-in');
    expect(sanitizeCinematicOutput(null)).toBe('');
    expect(sanitizeCinematicOutput('   ')).toBe('');
  });
});

describe('expandCinematicPrompt', () => {
  const enriched = `${RAW}, wide cinematic establishing shot, slow dolly push-in, anamorphic lens, golden-hour rim lighting, epic mood`;

  it('returns the sanitized LLM enrichment when the model responds', async () => {
    const llm: LlmFn = async (o) => {
      expect(o.system).toBe(CINEMATIC_SYSTEM);
      expect(o.user).toBe(RAW);
      return `"${enriched}"`; // model wrapped it in quotes
    };
    expect(await expandCinematicPrompt(RAW, llm)).toBe(enriched);
  });

  it('falls back to the deterministic string when the LLM returns null (unavailable)', async () => {
    const llm: LlmFn = async () => null;
    const out = await expandCinematicPrompt(RAW, llm);
    expect(out).toBe(deterministicCinematicPrompt(RAW));
    expect(out).toMatch(/cinematic/i);
  });

  it('falls back to deterministic when the LLM THROWS (endpoint error)', async () => {
    const llm: LlmFn = async () => { throw new Error('endpoint 503'); };
    expect(await expandCinematicPrompt(RAW, llm)).toBe(deterministicCinematicPrompt(RAW));
  });

  it('rejects a non-substantive (shorter) LLM output and uses the deterministic fallback', async () => {
    const llm: LlmFn = async () => 'a lion'; // shorter than input → treated as a miss
    expect(await expandCinematicPrompt(RAW, llm)).toBe(deterministicCinematicPrompt(RAW));
  });

  it('passes empty input through without calling the LLM', async () => {
    let called = false;
    const llm: LlmFn = async () => { called = true; return 'x'; };
    expect(await expandCinematicPrompt('   ', llm)).toBe('');
    expect(called).toBe(false);
  });

  it('is idempotent — an already-enriched prompt is returned unchanged without an LLM call', async () => {
    let called = false;
    const llm: LlmFn = async () => { called = true; return 'x'; };
    const already = 'a castle, wide cinematic dolly shot, anamorphic lens, dramatic lighting';
    expect(await expandCinematicPrompt(already, llm)).toBe(already);
    expect(called).toBe(false);
  });
});
