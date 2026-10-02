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
  });
}
