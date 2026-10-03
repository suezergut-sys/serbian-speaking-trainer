import { expect, test } from '@playwright/test';

for (const native of [false, true]) {
  test(`${native ? 'Android layout' : 'web'} browses past weeks and stops at the current week`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-01-05T12:00:00Z'));
    if (native) {
      await page.setViewportSize({ width: 393, height: 851 });
      await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    }
    const months = [];
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
    if (url.pathname === "/api/statistics/phrases") {
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({total:0,page:1,page_size:"10",total_pages:0,groups:[]})});
      return;
    }
      let body;
      if (url.pathname === '/api/auth/me') body = { id:'week-user', email:'learner@example.invalid', display_name:'Ученик', avatar_url:null, role:'user', access_tier:'free', registered_at:'2025-12-01T00:00:00Z', last_active_at:'2026-01-05T00:00:00Z', daily_usage:{used:0,limit:10,remaining:10,resets_at:'2026-01-06T00:00:00Z'} };
      else if (url.pathname === '/api/topics') body = [];
      else if (url.pathname === '/api/review-phrases/summary') body = {phrase_count:0};
      else if (url.pathname === '/api/statistics/monthly') {
        const month = url.searchParams.get('month');
        months.push(month);
        body = {month,active_days:0,total_phrases:0,total_translations:0,correct_translations:0,mastered_phrases:0,days:[]};
      } else throw new Error(`Unexpected fixture route ${url.pathname}`);
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto('/privacy');
    await page.evaluate(() => localStorage.setItem('sb-e2e-auth-auth-token', JSON.stringify({ access_token:'e2e-local-only',refresh_token:'e2e-local-only',token_type:'bearer',expires_in:31536000,expires_at:4102444800,user:{id:'week-user',aud:'authenticated',role:'authenticated',email:'learner@example.invalid',app_metadata:{},user_metadata:{},created_at:'2025-12-01T00:00:00Z'} })));
    await page.goto('/');
    await page.getByRole('button',{name:'Статистика',exact:true}).click();
    const navigation = page.getByRole('navigation',{name:'Выбор недели'});
    await expect(navigation).toHaveText('‹Неделя · 5 янв. — 11 янв.');
    await expect(page.getByRole('button',{name:'Следующая неделя'})).toHaveCount(0);
    const previous = page.getByRole('button', {name:'Предыдущая неделя'});
    await expect(previous).toHaveCSS('background-color', 'rgba(17, 52, 91, 0.38)');
    await expect(previous).toHaveCSS('color', 'rgb(141, 188, 232)');
    await expect(previous).toHaveCSS('border-radius', '10px');
    await page.getByRole('button',{name:'Предыдущая неделя'}).click();
    await expect(navigation).toContainText('Неделя · 29 дек. — 4 янв.');
    await expect(page.getByLabel('Итоги недели')).toBeVisible();
    expect(months).toContain('2025-12');
    await page.getByRole('button',{name:'Следующая неделя'}).click();
    await expect(navigation).toContainText('Неделя · 5 янв. — 11 янв.');
    await expect(page.getByRole('button',{name:'Следующая неделя'})).toHaveCount(0);
    const bounds = await navigation.evaluate(element => {
      const row=element.getBoundingClientRect(), label=element.querySelector('strong').getBoundingClientRect();
      return Math.abs((row.left+row.right)/2-(label.left+label.right)/2);
    });
    expect(bounds).toBeLessThan(1);
    const cards = page.locator('.statistics-summary > div');
    await expect(cards).toHaveCount(3);
    const boxes = await cards.evaluateAll(elements => elements.map(element => ({top: element.getBoundingClientRect().top, left: element.getBoundingClientRect().left})));
    expect(boxes[0].top).toBe(boxes[1].top);
    expect(boxes[1].top).toBe(boxes[2].top);
    expect(boxes[0].left).toBeLessThan(boxes[1].left);
    expect(boxes[1].left).toBeLessThan(boxes[2].left);
    await expect(page.getByRole('heading', {name:'Статистика'})).toHaveCount(0);
    await expect(page.locator('.statistics-page').getByRole('button', {name:'Выйти'})).toHaveCount(0);
    await page.getByRole('button', {name:'Настройки',exact:true}).click();
    await expect(page.getByRole('region', {name:'Профиль'})).toBeVisible();
    await expect(page.getByRole('button', {name:'Выйти'})).toBeVisible();
    await expect(page.getByLabel('Адрес общего backend')).toHaveCount(0);
  });
}
