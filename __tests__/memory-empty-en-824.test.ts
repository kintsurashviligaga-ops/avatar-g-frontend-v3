/**
 * Phase 8.24: the Memory page's English empty text was the literal source string '{T.empty![lang]}'.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

it('MemoryPanel has no JSX expression stuck inside a label string', () => {
  const src = readFileSync(join(__dirname, '..', 'components', 'memory', 'MemoryPanel.tsx'), 'utf8');
  expect(src).not.toMatch(/'\{T\.[a-zA-Z]+!?\[lang\]\}'/);
  expect(src).toContain('Nothing remembered yet.');
});
