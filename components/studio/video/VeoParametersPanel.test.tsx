import { render, screen } from '@testing-library/react';
import { initialVeoPlan, veoPlanReducer } from '@/lib/video/veoPlan';
import { VeoParametersPanel } from './VeoParametersPanel';

/**
 * The "Scenes & camera" drawer's collapsed summary says how long each scene really is. Found in the paid Production
 * run of 2026-10-15: a 4 s film rendered as ONE 4 s Veo clip (the dispatch carried clipSec 4, the MP4 was 4.01 s),
 * while the drawer still read "1 × 8s" from a hard-coded 8.
 */
function summaryFor(lengthSec: number): string {
  const plan = veoPlanReducer(initialVeoPlan(), { type: 'length', lengthSec });
  const { unmount } = render(<VeoParametersPanel plan={plan} dispatch={() => undefined} locale="en" engine={null} sceneTexts={[]} />);
  const text = screen.getByRole('button', { name: /Scenes & camera/ }).textContent ?? '';
  unmount();
  return text;
}

describe('VeoParametersPanel — scene length in the Scenes & camera summary', () => {
  it.each([
    [4, '1 × 4s'],
    [6, '1 × 6s'],
    [8, '1 × 8s'],
    [24, '3 × 8s'],
  ])('a %i s film reads "%s"', (lengthSec, expected) => {
    expect(summaryFor(lengthSec)).toContain(expected);
  });
});
