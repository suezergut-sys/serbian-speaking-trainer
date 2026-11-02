import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Screenshots are owner-provided originals; tests must never regenerate these assets.
for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile', 'narrow', 'android']) {
  test(`landing ${language} ${layout}`, async ({ page }) => {
    await page.setViewportSize({ width: layout === 'desktop' ? 1440 : layout === 'narrow' ? 320 : 393, height: 900 });
    await page.addInitScript(({ language, layout }) => { if (!localStorage.getItem('serbotalk.interface-language')) localStorage.setItem('serbotalk.interface-language', language); if (layout === 'android') window.CapacitorCustomPlatform = { name: 'android' }; }, { language, layout });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', () => { throw new Error('Landing must not call the API'); });
    await page.goto(process.env.LANDING_PAGE_PATH ?? '/landing.html');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(language === 'en' ? 'Now speak them.' : 'Пора заговорить.');
    for (const img of await page.locator('.landing-phone img').all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate(el => el.complete && el.naturalWidth === 1280 && el.naturalHeight === 2772)).toBe(true);
    }
    await expect(page.locator('.landing-store__logo')).toHaveCount(2);
    const playLinks = page.getByRole('link', { name: language === 'ru' ? 'Google Play Открытое тестирование' : 'Google Play Open testing', exact: true });
    await expect(playLinks).toHaveCount(2);
    for (const link of await playLinks.all()) {
      await expect(link).toHaveAttribute('href', 'https://play.google.com/apps/testing/com.serbiantalk.trainer');
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    await expect(page.getByText(language === 'ru' ? 'Присоединитесь к открытому тестированию, затем установите приложение из Google Play.' : 'Join the open test, then install the app from Google Play.', { exact: true })).toBeVisible();
    for (const logo of await page.locator('.landing-store__logo').all()) {
      await expect.poll(() => logo.evaluate(el => el.complete && el.naturalWidth === 520 && el.naturalHeight === 582)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.landing-phone--hero img')).toHaveAttribute('src', `/landing/screens/phone/${language}-statistics.jpg`);
    await expect(page.locator('.landing-phone--hero')).toHaveCSS('transform', 'none');
    await expect(page.locator('.landing-calendar, .landing-speech, .landing-orbit')).toHaveCount(0);
    await expect(page.locator('.landing-ribbon, .landing-screenshot-note')).toHaveCount(0);
    await expect(page.locator('.landing-header')).toBeInViewport();
    expect(Math.abs((await page.locator('.landing-header').boundingBox()).y)).toBeLessThan(1);
    await page.getByRole('link', { name: language === 'ru' ? 'Заглянуть внутрь' : 'Take a look inside', exact: true }).click();
    const header = await page.locator('.landing-header').boundingBox();
    const howHeading = await page.locator('#how .landing-section-heading').boundingBox();
    expect(howHeading.y).toBeGreaterThanOrEqual(header.y + header.height);
    if (layout === 'desktop') {
      for (const width of [800, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const boxes = await page.locator('.landing-steps .landing-phone').evaluateAll(elements => elements.map(el => { const rect = el.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom }; }));
        expect(Math.max(...boxes.map(box => box.top)) - Math.min(...boxes.map(box => box.top))).toBeLessThan(1);
        expect(Math.max(...boxes.map(box => box.bottom)) - Math.min(...boxes.map(box => box.bottom))).toBeLessThan(1);
      }
      // Text growth must expand the shared rows instead of shifting one phone.
      await page.locator('.landing-steps article > p').first().evaluate(el => { el.textContent = `${el.textContent} `.repeat(5); });
      const tops = await page.locator('.landing-steps .landing-phone').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().top));
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1);
      await page.reload();
    }
    await mkdir('../artifacts/landing', { recursive: true });
    await page.screenshot({ path: `../artifacts/landing/${language}-${layout}.png`, fullPage: true });
    await page.getByRole('button', { name: language === 'ru' ? 'EN' : 'RU', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(language === 'ru' ? 'Now speak them.' : 'Пора заговорить.');
    await expect(page.locator('.landing-phone--hero img')).toHaveAttribute('src', `/landing/screens/phone/${language === 'ru' ? 'en' : 'ru'}-statistics.jpg`);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', language === 'ru' ? 'en' : 'ru');
    expect(errors).toEqual([]);
  });
}
