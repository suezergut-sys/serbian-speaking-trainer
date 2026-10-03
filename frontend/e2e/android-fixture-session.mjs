export async function resetAndroidFixtureSession(page, webView) {
  if (webView.pkg() !== 'com.serbiantalk.trainer.testlab') throw Error('Fixture reset requires the dedicated lab package');
  const origin = new URL(page.url()).origin;
  if (!['http://localhost', 'https://localhost'].includes(origin)) throw Error('Fixture reset requires the local Android asset origin');
  // Clear only browser state in the verified lab WebView; never production app data.
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(origin + '/testlab.html');
}
