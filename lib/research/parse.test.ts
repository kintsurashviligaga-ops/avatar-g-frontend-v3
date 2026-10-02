/** @jest-environment node */
/**
 * The tolerant Interactions reader against fixtures (lib/research/__fixtures__ — written from the API reference, not
 * captured live). Rules under test: the report is the LAST model_output text (never an intermediate note); sources come
 * from the annotations (deduplicated, http(s) only, titles tidied), with the older / Vertex / candidate shapes read too;
 * progress comes from the newest thought summary and the search calls; a malformed answer degrades, never throws.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveTitle, markdownLinkSources, normalizeStatus, parseInteraction, parseInteractionId } from './parse';

const fx = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, '__fixtures__', name), 'utf8'));

describe('parseInteraction — the steps shape (the current API)', () => {
  const p = parseInteraction(fx('interaction-completed-steps.json'));

  test('the report is the LAST model_output text, not the intermediate "I have gathered…" note', () => {
    expect(p.status).toBe('completed');
    expect(p.report.startsWith('# Georgian wine exports: market analysis')).toBe(true);
    expect(p.report).toContain('| Market A | 41% | up |');
    expect(p.report).not.toContain('I have gathered the sources');
  });

  test('sources: annotations deduplicated (fragment variants), http(s) only, titles tidied, files and places kept', () => {
    expect(p.sources.map((s) => s.url)).toEqual([
      'https://www.example-wine-agency.org/statistics/2025',
      'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbCdEf123',
      'https://news.example.com/qvevri-premium',
      'https://files.example.com/brief.pdf',
      'https://maps.example.com/p/123',
    ]);
    expect(p.sources[0]).toEqual({ url: 'https://www.example-wine-agency.org/statistics/2025', title: 'Export statistics 2025' });
    expect(p.sources[2]!.title).toBe('Qvevri wines climb');
    expect(p.sources[3]!.title).toBe('brief.pdf');
    expect(p.sources.some((s) => s.url.startsWith('javascript:'))).toBe(false);
  });

  test('progress, usage and dropped images', () => {
    expect(p.progress.searches).toBe(2);
    expect(p.progress.steps).toBe(6);
    expect(p.progress.lastQuery).toBe('wine export destinations national wine agency');
    expect(p.progress.summary).toBe('Writing the report Structure: summary, market table, risks, sources.');
    expect(p.usage).toMatchObject({ inputTokens: 251234, outputTokens: 59876, thoughtTokens: 4100, totalTokens: 316410, searches: 81, cachedTokens: 150000 });
    expect(p.imagesDropped).toBe(1);
    expect(p.id).toBe('v1_ChdkZWVwLXJlc2VhcmNoLWZpeHR1cmU');
    expect(p.error).toBeNull();
  });
});

describe('parseInteraction — running, failed, cancelled, incomplete', () => {
  test('in progress: no report yet, the newest thought summary and the search count', () => {
    const p = parseInteraction(fx('interaction-in-progress.json'));
    expect(p.status).toBe('in_progress');
    expect(p.report).toBe('');
    expect(p.progress.summary).toContain('Reading the agency');
    expect(p.progress.summary).not.toContain('**');
    expect(p.progress.searches).toBe(3);
    expect(p.progress.lastQuery).toBe('georgia wine exports by country 2025 customs');
    expect(p.progress.steps).toBe(6);
  });

  test('failed: the provider text is kept as an INTERNAL diagnostic only', () => {
    const p = parseInteraction(fx('interaction-failed.json'));
    expect(p.status).toBe('failed');
    expect(p.report).toBe('');
    expect(p.error).toContain('ResourceExhausted');
  });

  test('cancelled', () => {
    expect(parseInteraction(fx('interaction-cancelled.json')).status).toBe('cancelled');
  });

  test('incomplete: with no report it is empty; with a partial report the text is kept', () => {
    const empty = parseInteraction(fx('interaction-incomplete-empty.json'));
    expect(empty.status).toBe('incomplete');
    expect(empty.report).toBe('');
    const partial = parseInteraction(fx('interaction-incomplete-partial.json'));
    expect(partial.status).toBe('incomplete');
    expect(partial.report).toContain('# Partial report');
  });
});

describe('parseInteraction — the neighbouring shapes', () => {
  test('older `outputs`: the last text output is the report; its markdown link is the source', () => {
    const p = parseInteraction(fx('interaction-completed-outputs-legacy.json'));
    expect(p.status).toBe('completed');
    expect(p.report.startsWith('# Legacy shape report')).toBe(true);
    expect(p.sources).toEqual([{ url: 'https://example.com/legacy-source', title: 'Example source' }]);
  });

  test('Vertex: an operation wrapping the interaction, a `state` string, a `citations` list', () => {
    const p = parseInteraction(fx('interaction-completed-vertex.json'));
    expect(p.status).toBe('completed');
    expect(p.id).toBe('v-77');
    expect(p.report).toBe('# Vertex-wrapped report\n\nBody text.');
    expect(p.sources).toEqual([{ url: 'https://example.com/vertex-1', title: 'Vertex source one' }, { url: 'https://example.com/vertex-2' }]);
  });

  test('generateContent-style candidates with grounding chunks', () => {
    const p = parseInteraction(fx('interaction-completed-candidates.json'));
    expect(p.report).toBe('# Candidate-shaped report\n\nSecond part.');
    expect(p.sources.map((s) => s.url)).toEqual(['https://example.com/g1', 'https://example.com/g2']);
  });

  test('a top-level output_text / outputText is the last resort', () => {
    expect(parseInteraction({ status: 'completed', output_text: ' Plain text report ' }).report).toBe('Plain text report');
    expect(parseInteraction({ status: 'completed', outputText: 'Camel report' }).report).toBe('Camel report');
  });

  test('Georgian text survives untouched, with its source title', () => {
    const p = parseInteraction(fx('interaction-completed-georgian.json'));
    expect(p.report.startsWith('# ტესტ-ანგარიში: ღვინის ექსპორტი')).toBe(true);
    expect(p.sources).toEqual([{ url: 'https://example.org/ge/stats', title: 'ეროვნული ღვინის სააგენტო' }]);
  });
});

describe('parseInteraction — hostile and broken answers never throw', () => {
  test('the malformed fixture degrades to "nothing yet"', () => {
    const p = parseInteraction(fx('interaction-malformed.json'));
    expect(p.status).toBe('unknown');
    expect(p.report).toBe('');
    expect(p.sources).toEqual([]);
    expect(p.usage).toEqual({});
    expect(p.error).toBe('plain error text');
  });

  test.each([null, undefined, 42, 'x', [], [1, 2], true])('%p → an empty, unknown result', (v) => {
    const p = parseInteraction(v);
    expect(p).toMatchObject({ status: 'unknown', report: '', sources: [], id: null });
  });

  test('a huge link-free blob is scanned in bounded time', () => {
    const t0 = Date.now();
    markdownLinkSources(`${'['.repeat(200_000)}x`);
    markdownLinkSources(`[a](https://${'x'.repeat(5_000)}.com)`);
    expect(Date.now() - t0).toBeLessThan(1_000);
  });

  test('markdown link sources are capped, deduplicated and http(s) only', () => {
    const md = Array.from({ length: 300 }, (_, i) => `[t${i}](https://example.com/p/${i})`).join(' ') + ' [x](ftp://nope) [y](javascript:alert(1)) [dup](https://example.com/p/1)';
    const found = markdownLinkSources(md);
    expect(found).toHaveLength(120);
    expect(found.some((s) => !s.url.startsWith('https://'))).toBe(false);
  });
});

describe('normalizeStatus', () => {
  test.each([
    ['in_progress', 'in_progress'], ['IN_PROGRESS', 'in_progress'], ['queued', 'queued'], ['completed', 'completed'],
    ['SUCCEEDED', 'completed'], ['incomplete', 'incomplete'], ['budget_exceeded', 'incomplete'], ['failed', 'failed'],
    ['cancelled', 'cancelled'], ['canceled', 'cancelled'], ['requires_action', 'requires_action'], ['wat', 'unknown'], [undefined, 'unknown'],
  ])('%p → %p', (raw, want) => {
    expect(normalizeStatus(raw)).toBe(want);
  });
});

describe('parseInteractionId', () => {
  test('reads the id from a create answer, or a name', () => {
    expect(parseInteractionId(fx('interaction-create.json'))).toBe('v1_ChdkZWVwLXJlc2VhcmNoLWZpeHR1cmU');
    expect(parseInteractionId({ name: 'interactions/abc_123-XYZ' })).toBe('abc_123-XYZ');
  });
  test.each([null, {}, { id: '' }, { id: 'a b' }, { id: '../../x/y' }, { id: 'ab' }, { id: 5 }])('refuses %p', (v) => {
    expect(parseInteractionId(v)).toBeNull();
  });
});

describe('deriveTitle', () => {
  test('the first heading, markdown stripped', () => {
    expect(deriveTitle('# **Georgian** wine exports\n\nBody', 'q')).toBe('Georgian wine exports');
    expect(deriveTitle('Intro line\n\n## Second heading', 'q')).toBe('Second heading');
  });
  test('falls back to the first line, then to the question; always bounded', () => {
    expect(deriveTitle('Just a line of text', 'q')).toBe('Just a line of text');
    expect(deriveTitle('', 'What is the market?')).toBe('What is the market?');
    expect(deriveTitle(`# ${'x'.repeat(400)}`, 'q').length).toBeLessThanOrEqual(140);
  });
});
