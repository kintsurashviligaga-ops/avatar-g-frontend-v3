import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`chat modes ${width}px: menu choice persists, sends only the mode and names the actual answering model`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:welcomed', '1');
      localStorage.setItem('myavatar:tour-seen', '1');
    });
    const requests: Array<Record<string, unknown>> = [];
    const mutations: string[] = [];
    await page.route('**/api/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (path === '/api/chat/gemini' && req.method() === 'POST') {
        const body = req.postDataJSON();
        requests.push(body);
        // Include a future model: its label should follow the same provider-free style as known models.
        const model = body.mode === 'lite' ? 'gemini-4.0-flash-lite' : 'gemini-2.5-flash';
        const frames = [{ meta: { provider: 'gemini', model, mode: body.mode, fallback: true } }, { text: `Reply for ${body.mode}.` }, '[DONE]'];
        await route.fulfill({ contentType: 'text/event-stream', body: frames.map(f => `data: ${typeof f === 'string' ? f : JSON.stringify(f)}\n\n`).join('') });
      } else {
        if (req.method() === 'POST' && !/^\/api\/(presence|log-error|analytics\/track)\b/.test(path)) mutations.push(path);
        await route.fulfill({ json: {} });
      }
    });
    await page.goto('/en/dashboard?tool=chat');
    await expect(page.locator('html')).toHaveAttribute('data-authed', '0');
    const switcher = page.getByTestId('model-switcher').filter({ visible: true }).first();
    for (const [mode, label] of [['pro', '3.1 Pro'], ['thinking', '3.8 Flash Thinking'], ['lite', '3.1 Flash-Lite'], ['fast', '3.8 Flash']] as const) {
      await switcher.click();
      const choice = page.getByRole('menuitemradio').filter({ has: page.getByText(label, { exact: true }) }).first();
      await expect(choice).toBeEnabled();
      await choice.click();
      await expect(switcher).toContainText(label);
      await page.reload();
      await expect(switcher).toContainText(label);
      const composer = page.getByTestId('composer-input');
      await composer.fill(`Hello in ${mode} mode.`);
      const before = requests.length;
      await composer.press('Control+Enter');
      await expect.poll(() => requests.length).toBe(before + 1);
      expect(requests.at(-1)).toMatchObject({ protocol: 2, mode });
      for (const key of ['model', 'modelId', 'tier']) expect(requests.at(-1)).not.toHaveProperty(key);
      await expect(page.getByText(`Reply for ${mode}.`, { exact: true })).toBeVisible();
      const badge = page.getByTestId('reply-model').last();
      const answered = mode === 'lite' ? '4.0 Flash-Lite' : mode === 'thinking' ? '2.5 Flash Thinking' : '2.5 Flash';
      await expect(badge).toHaveText(answered);
      await expect(badge).toHaveAttribute('title', answered);
    }
    expect(mutations).toEqual([]);
    await page.screenshot({ path: info.outputPath('model-modes.png') });
  });
}
