import type { Page } from '@playwright/test';

/**
 * The chat uploads a picked video / audio AT ONCE (components/studio/ui/useUpload): /api/upload/sign hands out a signed
 * URL, the browser PUTs the bytes there with progress, and /api/upload/verify reads the stored bytes before the tile says
 * Ready. In a spec all three are mocked: nothing leaves the browser. A sign mock adds `signedUrl: SIGNED_UPLOAD_URL`.
 */
export const SIGNED_UPLOAD_URL = 'https://e2e-storage.supabase.co/storage/v1/object/upload/sign/uploads/e2e?token=t';

export async function mockStoredUpload(page: Page, verify: { ok: boolean; status?: number } = { ok: true }): Promise<void> {
  await page.route('https://e2e-storage.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"uploads/e2e"}' }));
  await page.route('**/api/upload/verify', (r) => r.fulfill({
    status: verify.status ?? (verify.ok ? 200 : 422),
    contentType: 'application/json',
    body: JSON.stringify(verify.ok ? { ok: true } : { ok: false, error: 'content' }),
  }));
}
