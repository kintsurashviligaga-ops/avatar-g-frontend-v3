/**
 * Phase 8.24 (white-glove visual audit) guards. Source checks, like ui-polish-815: each pins a defect that was found
 * on screen so it cannot come back unnoticed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Phase 8.24 visual polish', () => {
  it.each(['components/agent/AutoTaskCard.tsx', 'components/agent/PlanStartCard.tsx'])(
    '%s draws its text with the theme tokens, so it stays readable in the light theme',
    (file) => {
      const src = read(file);
      expect(src).not.toMatch(/rgba\(255,\s*255,\s*255/);
      expect(src).not.toContain('#7c3aed'); // the off-brand violet gradient
      expect(src).toContain('ag-card-btn');
    },
  );

  it('toasts use the brand faces (Georgian included) and the theme tokens, and clear the phone composer', () => {
    const src = read('components/providers/AppProviders.tsx');
    expect(src).not.toContain('var(--font-body');
    expect(src).toContain('var(--font-georgian)');
    expect(src).toContain('rgb(var(--app-elevated)');
    expect(src).toMatch(/mobileOffset=\{\{ bottom: 'calc\(96px/);
  });

  it('globals.css has the disabled cursor, the hover lift scoped to service surfaces and a reduced-motion-safe shimmer', () => {
    const css = read('app/globals.css');
    expect(css).toMatch(/button:disabled,\s*\[role='button'\]\[aria-disabled='true'\]\s*\{\s*cursor: not-allowed;/);
    expect(css).toContain('[data-ui-surface] button:not(:disabled):hover');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.ag-shimmer::after \{ animation: none;/);
  });
});
