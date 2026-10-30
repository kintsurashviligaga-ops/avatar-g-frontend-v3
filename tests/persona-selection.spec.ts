import { test, expect } from '@playwright/test';

const custom = {
  id: 'custom:planning',
  name: { ka: 'ჩემი დამგეგმავი', en: 'My custom planning specialist with a deliberately long descriptive name', ru: 'Мой планировщик' },
  icon: '✨', tagline: { ka: 'დაგეგმვა', en: 'Planning help', ru: 'Планирование' },
  directive: 'Answer briefly and ask for the next planning step.', tone: 'professional', preferredServices: ['chat'], custom: true,
};

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  for (const choice of [{ id: 'film-director', name: 'Director', custom: false }, { id: custom.id, name: custom.name.en, custom: true }]) {
    test(`persona ${choice.id} ${viewport.width}px: named selection, reload, request payload and clearing`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((definition) => {
        localStorage.setItem('myavatar-cookie-consent', 'necessary');
        localStorage.setItem('myavatar:welcomed', '1');
        localStorage.setItem('myavatar:tour-seen', '1');
        localStorage.setItem('myavatar:personas:custom', JSON.stringify([definition]));
      }, custom);
      const requests: Array<Record<string, unknown>> = [];
      const mutations: string[] = [];
      await page.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === '/api/chat/gemini' && request.method() === 'POST') {
          requests.push(request.postDataJSON());
          await route.fulfill({ contentType: 'text/event-stream', body: `data: {"text":"A short planning answer."}\n\ndata: [DONE]\n\n` });
        } else {
          if (request.method() === 'POST' && !/^\/api\/(presence|log-error|analytics\/track)\b/.test(path)) mutations.push(path);
          await route.fulfill({ json: {} });
        }
      });
      await page.goto('/en/dashboard?tool=chat');
      await expect(page.locator('html')).toHaveAttribute('data-authed', '0');
      const switcher = page.getByTestId('model-switcher').filter({ visible: true }).first();
      await switcher.click();
      await page.getByRole('menuitem', { name: /^Persona/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Persona', exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button').filter({ hasText: choice.name }).click();
      await expect(dialog).toHaveCount(0);
      const chip = page.getByTestId('persona-chip');
      await expect(chip).toContainText(choice.name);
      await expect(chip.getByRole('button', { name: `Persona: ${choice.name}`, exact: true })).toBeVisible();
      await expect.poll(() => chip.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })).toBe(true);
      await page.screenshot({ path: info.outputPath('persona-chip.png') });
      await page.reload();
      await expect(chip).toContainText(choice.name);
      await switcher.click();
      await expect(page.getByRole('menuitem', { name: /^Persona/ })).toContainText(choice.name);
      await page.keyboard.press('Escape');
      const composer = page.getByTestId('composer-input');
      await composer.fill('Say hello in one short sentence.');
      await composer.press('Control+Enter');
      await expect.poll(() => requests.length).toBe(1);
      expect(requests[0]).toMatchObject({ personaId: choice.id, language: 'en' });
      if (choice.custom) expect(requests[0]!.customPersona).toEqual(custom);
      else expect(requests[0]).not.toHaveProperty('customPersona');
      await expect(page.getByTestId('run-button')).toBeHidden();
      await chip.getByRole('button', { name: 'Stop using this persona', exact: true }).click();
      await expect(chip).toHaveCount(0);
      await composer.fill('Hello again.');
      await composer.press('Control+Enter');
      await expect.poll(() => requests.length).toBe(2);
      expect(requests[1]).not.toHaveProperty('personaId');
      expect(requests[1]).not.toHaveProperty('customPersona');
      expect(mutations).toEqual([]);
    });
  }
}
