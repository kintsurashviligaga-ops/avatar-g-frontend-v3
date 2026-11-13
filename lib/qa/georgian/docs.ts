/**
 * lib/qa/georgian/docs.ts — the reviewer-facing files for the Georgian QC corpus, generated from the code so they never
 * drift: docs/v5.1-phase8/01-corpus.md, 02-rubric.md and scoresheet.csv. Regenerate with
 * `WRITE_KA_QA=1 npx jest lib/qa/georgian/docs.files`.
 */
import { KA_QA_CORPUS } from './corpus';
import { CASE_PASS, CORPUS_CONDITIONAL, RUBRIC, RUBRIC_BY_ID } from './rubric';

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function corpusMarkdown(): string {
  const out: string[] = [
    '# v5.1 Phase 8: Georgian QC corpus',
    '',
    '> Generated from `lib/qa/georgian/corpus.ts`. Do not edit by hand.',
    '',
    `${KA_QA_CORPUS.length} cases. Every answer must be in Georgian. "Keep" items must survive into the answer or the brief sent to the model; ⚑ marks items that must survive letter for letter (losing or translating one is a critical failure).`,
    '',
  ];
  for (const c of KA_QA_CORPUS) {
    out.push(`## ${c.id} · ${c.service}`, '', `**Prompt:** ${c.prompt}`, '', `*${c.gloss}*`, '');
    if (c.attachments?.length) out.push(`- Attachments: ${c.attachments.join(', ')}`);
    if (c.route) out.push(`- Expected route: ${c.route.kind === 'control' ? `control: ${c.route.op}` : c.route.kind === 'talk' ? 'conversation' : `${c.route.kind}: ${c.route.capability}`}`);
    for (const k of c.keep ?? []) out.push(`- Keep${k.verbatim ? ' ⚑' : ''}: ${k.label} (${k.any.map((v) => `\`${v}\``).join(' / ')})`);
    if (c.mustAnswer) out.push(`- Must say: ${c.mustAnswer.label}`);
    if (c.sentences) out.push(`- Exactly ${c.sentences} sentences`);
    for (const n of c.never ?? []) out.push(`- Never (critical): ${n.label}`);
    if (c.simulateFailure) out.push('- Run with a simulated Google-side failure (D-15)');
    out.push(`- Dimensions: ${c.dims.map((d) => RUBRIC_BY_ID[d].name).join(', ')}`);
    for (const f of c.facts ?? []) out.push(`- Reference fact: ${f.fact} (source: ${f.source})`);
    if (c.reviewerNote) out.push(`- Reviewer: ${c.reviewerNote}`);
    out.push('');
  }
  return out.join('\n');
}

export function rubricMarkdown(): string {
  const out: string[] = [
    '# v5.1 Phase 8: Georgian scoring rubric',
    '',
    '> Generated from `lib/qa/georgian/rubric.ts`. Do not edit by hand.',
    '',
    'Each dimension is scored 0–4. A case is scored only on the dimensions it lists; the weighted score is out of 100 over those.',
    '',
    '| Dimension | Weight | Scored by | Critical failure |',
    '|---|---|---|---|',
    ...RUBRIC.map((d) => `| ${d.name} | ${d.weight} | ${d.scorer === 'both' ? 'code + reviewer (code can only fail it)' : d.scorer === 'auto' ? 'code' : 'native reviewer'} | ${esc(d.critical ?? '—')} |`),
    '',
    '## Anchors',
    '',
  ];
  for (const d of RUBRIC) {
    out.push(`### ${d.name}`, '');
    d.anchors.forEach((a, i) => out.push(`- **${4 - i}** — ${a}`));
    out.push('');
  }
  out.push(
    '## Verdicts (spec §33)',
    '',
    `- **Case:** FAIL on any critical failure; NOT_VERIFIED while any listed dimension is unscored; PASS at ${CASE_PASS}/100 or more; else FAIL.`,
    `- **Corpus:** FAIL if any case is critical; NOT_VERIFIED if any case is unverified; PASS if all pass; CONDITIONAL_PASS if at least ${Math.round(CORPUS_CONDITIONAL * 100)}% pass; else FAIL.`,
    '- Code alone can never produce PASS: every case has at least one dimension only a native reviewer can score.',
    '',
  );
  return out.join('\n');
}

/** One row per case × dimension, for native reviewers to fill in (score 0–4 and a note). */
export function scoresheetCsv(): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = ['case,service,prompt,dimension,scored_by,score_0_4,reviewer_note'];
  for (const c of KA_QA_CORPUS) {
    for (const d of c.dims) {
      const spec = RUBRIC_BY_ID[d];
      if (spec.scorer === 'auto') continue;
      rows.push([c.id, c.service, q(c.prompt), spec.name, spec.scorer, '', ''].join(','));
    }
  }
  return rows.join('\n') + '\n';
}
