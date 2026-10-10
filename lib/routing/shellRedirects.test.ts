/**
 * @jest-environment node
 *
 * One primary workspace (Master Task §19): /{lang}/hub and /{lang}/workspace were app shells beside the studio, with
 * hard-coded stats (§27). Their URLs land in the studio, and their pages are gone so nothing can render them again.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

type Redirect = { source: string; destination: string; permanent: boolean };

describe('the old app shells land in the studio', () => {
  test.each(['hub', 'hub/:path*', 'workspace', 'workspace/:path*'])('/{lang}/%s → /{lang}/dashboard (307)', async (from) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require('../../next.config.js') as { redirects: () => Promise<Redirect[]> };
    const rules = await config.redirects();
    const rule = rules.find((r) => r.source === `/:locale(ka|en|ru)/${from}`);
    expect(rule).toEqual({ source: `/:locale(ka|en|ru)/${from}`, destination: '/:locale/dashboard', permanent: false });
  });

  test('their pages and the fake-stat dashboards are deleted', () => {
    const root = join(__dirname, '..', '..');
    for (const p of [
      'app/[locale]/hub/page.tsx',
      'app/[locale]/workspace/page.tsx',
      'components/hub/panels/DashboardPanel.tsx',
      'components/workspace/WorkspaceDashboard.tsx',
    ]) expect(existsSync(join(root, p))).toBe(false);
  });
});

describe('three orphan pages over tables Production does not have are retired (owner, 2026-10-09)', () => {
  test.each([
    ['services/workflow', '/:locale/dashboard'],
    ['services/workflow/:path*', '/:locale/dashboard'],
    ['account/invoices', '/:locale/account/billing'],
    ['account/invoices/:path*', '/:locale/account/billing'],
    ['admin/disputes', '/:locale/admin'],
  ])('/{lang}/%s → %s (307)', async (from, to) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require('../../next.config.js') as { redirects: () => Promise<Redirect[]> };
    const rule = (await config.redirects()).find((r) => r.source === `/:locale(ka|en|ru)/${from}`);
    expect(rule).toEqual({ source: `/:locale(ka|en|ru)/${from}`, destination: to, permanent: false });
  });

  test('their pages are deleted', () => {
    const root = join(__dirname, '..', '..');
    for (const p of [
      'app/[locale]/services/workflow/page.tsx',
      'app/[locale]/account/invoices/page.tsx',
      'app/[locale]/admin/disputes/page.tsx',
    ]) expect(existsSync(join(root, p))).toBe(false);
  });
});
