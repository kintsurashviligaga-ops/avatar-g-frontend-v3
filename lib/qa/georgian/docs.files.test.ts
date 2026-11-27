/** @jest-environment node */
/** The reviewer files in docs/v5.1-phase8 match the code. `WRITE_KA_QA=1 npx jest lib/qa/georgian/docs.files` rewrites them. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusMarkdown, rubricMarkdown, scoresheetCsv } from './docs';

const DIR = join(process.cwd(), 'docs', 'v5.1-phase8');
const FILES: Record<string, () => string> = {
  '01-corpus.md': corpusMarkdown,
  '02-rubric.md': rubricMarkdown,
  'scoresheet.csv': scoresheetCsv,
};

test.each(Object.keys(FILES))('%s is current', (name) => {
  const path = join(DIR, name);
  const want = FILES[name]();
  if (process.env.WRITE_KA_QA === '1') writeFileSync(path, want);
  expect(existsSync(path)).toBe(true);
  expect(readFileSync(path, 'utf8')).toBe(want);
});
