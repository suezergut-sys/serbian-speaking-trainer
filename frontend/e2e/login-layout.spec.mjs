import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

for (const layout of ['desktop', 'mobile', 'narrow', 'android']) {
  test(`stable login flags ${layout}`, async ({ page }) => {
    await page.setViewportSize({ width: layout === 'desktop' ? 1366 : layout === 'narrow' ? 320 : 393, height: 900 });
    if (layout === 'android') await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    await page.goto('/');
    const ru = page.locator('.login-language').first();
    const en = page.locator('.login-language').last();
    await expect(ru).toHaveAttribute('aria-pressed', 'true');
    const box = await ru.boundingBox();
    expect(box.width).toBe(box.height);
    const measure = () => page.locator('.auth-card').evaluate(el => {
      const selectors = ['h1', 'p.login-copy', '.google-sign-in', '.review-login summary', '.auth-legal'];
      return [el, ...selectors.map(selector => el.querySelector(selector))].map(node => {
        const r = node.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      });
    });
    const russian = await measure();
    await expect(page.locator('.review-login summary')).toHaveText('Вход для проверки');
    await expect(ru).toHaveCSS('border-color', 'rgb(242, 189, 90)');
    await en.click();
    await expect(en).toHaveAttribute('aria-pressed', 'true');
    await expect(ru).toHaveAttribute('aria-pressed', 'false');
    await expect(en).toHaveCSS('border-color', 'rgb(242, 189, 90)');
    await expect(page.locator('.review-login summary')).toHaveText('Review access');
    expect(await measure()).toEqual(russian);
    await expect(page.locator('.review-login summary')).toHaveCSS('text-align', 'center');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('../artifacts/login-flags', { recursive: true });
    await page.screenshot({ path: `../artifacts/login-flags/en-${layout}.png` });
    await page.reload();
    await expect(en).toHaveAttribute('aria-pressed', 'true');
    await ru.click();
    expect(await measure()).toEqual(russian);
    await page.screenshot({ path: `../artifacts/login-flags/ru-${layout}.png` });
    await page.locator('.review-login summary').click();
    await expect(page.getByLabel('Пароль', { exact: true })).toBeVisible();
    await en.click();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  });
}
