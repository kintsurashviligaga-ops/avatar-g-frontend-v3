/** @jest-environment node */
/**
 * The deterministic router (lib/agent/intent) against every labelled message (lib/agent/intentCorpus). This is the
 * baseline a model router must match before it takes over any lane: 100% here, and every miss is printed.
 */
import { classifyAgentIntent } from './intent';
import { INTENT_CORPUS, type CorpusCase } from './intentCorpus';

const verdict = (c: CorpusCase) => {
  const i = classifyAgentIntent({ text: c.text, attachments: c.attachments ?? [], mode: c.mode ?? 'chat', previous: c.previous ?? null, pending: c.pending ?? null });
  const e = c.expect;
  const got: Record<string, unknown> = { kind: i.kind };
  if (i.kind === 'control') got.op = i.op;
  if (i.kind === 'act' || i.kind === 'unavailable') got.capability = i.capability;
  if (i.kind === 'act' && e.kind === 'act' && e.missing) got.missing = i.missing;
  const want: Record<string, unknown> = { ...e };
  if (i.kind === 'act' && e.kind === 'act' && !e.missing && i.missing.length) got.missing = i.missing;
  return { got, want };
};

test('the corpus covers the 13 sentences, three languages and every reading', () => {
  expect(INTENT_CORPUS.filter((c) => c.source === 'master-task').length).toBeGreaterThanOrEqual(13);
  const kinds = new Set(INTENT_CORPUS.map((c) => c.expect.kind));
  for (const k of ['control', 'talk', 'question', 'feedback', 'act', 'chat']) expect(kinds.has(k as never)).toBe(true);
  expect(INTENT_CORPUS.some((c) => /[Ѐ-ӿ]/.test(c.text))).toBe(true);
  expect(INTENT_CORPUS.some((c) => /[Ⴀ-ჿ]/.test(c.text))).toBe(true);
});

test.each(INTENT_CORPUS.map((c) => [c.text, c] as const))('%s', (_t, c) => {
  const { got, want } = verdict(c);
  expect({ text: c.text, ...got }).toEqual({ text: c.text, ...want });
});
