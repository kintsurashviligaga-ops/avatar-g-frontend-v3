/** @jest-environment node */
/** Phase 8.1: the v8 pricing page shows the engine's numbers and only user-facing actions. */
import { renderToStaticMarkup } from 'react-dom/server';
import { PricingV8 } from './PricingV8';
import { priceOf } from '@/lib/billing/margin/catalog';

describe('PricingV8', () => {
  test('English: plans with “what you get”, top-ups, per-action credits from the price list, no-hidden-fees block', () => {
    const html = renderToStaticMarkup(<PricingV8 locale="en" />);
    expect(html).toContain('129 ₾');
    expect(html).toContain('✦ 1,550');
    expect(html).toContain('>23</span> 8 s videos (720p)'); // Pro
    expect(html).toContain(`✦ ${priceOf('video.omni.720p.8s').credits}`);
    expect(html).toContain('Top up credits');
    expect(html).toContain('No hidden fees');
    expect(html).not.toContain('chat.message'); // internal rows stay internal
  });

  test('Georgian copy on the ka page', () => {
    const html = renderToStaticMarkup(<PricingV8 locale="ka" />);
    expect(html).toContain('დამალული საფასურის გარეშე');
    expect(html).toContain('/თვე');
  });
});
