/** @jest-environment node */
import { parseShots, spent, substitute, STOP_AT_USD, JOB_CAP_USD, type Manifest } from './hf-art-pack';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const md = (blocks: string[]) => blocks.map((b) => `text\n\`\`\`json shot\n${b}\n\`\`\`\n`).join('\n');

describe('the art pack reads its shots from the committed prompt file, nothing else', () => {
  test('parses json shot blocks in order and ignores other code blocks', () => {
    const shots = parseShots(`${md(['{"id":"A1","title":"hero","endpoint":"e/1","input":{"prompt":"p"}}'])}\n\`\`\`json\n{"not":"a shot"}\n\`\`\`\n${md(['{"id":"A2","title":"crop","endpoint":"e/2","input":{"prompt":"q"},"needs":["A1"]}'])}`);
    expect(shots.map((s) => s.id)).toEqual(['A1', 'A2']);
    expect(shots[1]!.needs).toEqual(['A1']);
  });
  test('refuses duplicates and incomplete blocks', () => {
    expect(() => parseShots(md(['{"id":"A1","title":"x","endpoint":"e","input":{}}', '{"id":"A1","title":"y","endpoint":"e","input":{}}']))).toThrow(/duplicate/);
    expect(() => parseShots(md(['{"id":"A1","title":"x","input":{}}']))).toThrow(/missing/);
  });
  test('the committed spec parses, and every shot keeps text out of the picture', () => {
    const shots = parseShots(readFileSync(join(process.cwd(), 'scripts/hf-art-pack.md'), 'utf8'));
    expect(shots.length).toBeGreaterThanOrEqual(8);
    for (const s of shots) {
      const p = JSON.stringify(s.input).toLowerCase();
      if (s.input.prompt) expect(p).toMatch(/no text/);
    }
  });
});

describe('references and money', () => {
  const m: Manifest = {
    job: 't', capUsd: JOB_CAP_USD, stopAtUsd: STOP_AT_USD, spentUsd: 0, selected: { A1: { url: 'https://cdn.x/a1.png', file: 'raw/A1-1-0.png', attempt: 1 } },
    attempts: [
      { shot: 'A1', attempt: 1, endpoint: 'e', input: {}, requestId: 'r1', usd: 0.03, listUsd: 0.05, status: 'completed', outputs: [], at: '' },
      { shot: 'A2', attempt: 1, endpoint: 'e', input: {}, requestId: 'unknown', usd: 0.02, listUsd: null, status: 'submit_unknown', outputs: [], at: '' },
      { shot: 'A3', attempt: 1, endpoint: 'e', input: {}, requestId: null, usd: 0.5, listUsd: null, status: 'refused', outputs: [], at: '' },
    ],
  };
  test('{{A1}} becomes the selected output URL, deep inside the input', () => {
    expect(substitute({ image_reference: { url: '{{A1}}' }, list: ['{{A1}}'] }, m.selected)).toEqual({ image_reference: { url: 'https://cdn.x/a1.png' }, list: ['https://cdn.x/a1.png'] });
    expect(() => substitute('{{A9}}', m.selected)).toThrow(/no selected output/);
  });
  test('spend counts every SUBMITTED attempt — an ambiguous one too — and never a refused one', () => {
    expect(spent(m)).toBe(0.05);
  });
  test('the stop line sits under the job cap', () => {
    expect(STOP_AT_USD).toBeLessThan(JOB_CAP_USD);
    expect(JOB_CAP_USD).toBe(7);
  });
});
