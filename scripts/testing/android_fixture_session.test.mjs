import test from 'node:test';
import assert from 'node:assert/strict';
import { resetAndroidFixtureSession } from '../../frontend/e2e/android-fixture-session.mjs';

test('production package cannot be reset even on the localhost asset origin', async () => {
  let touched = false;
  await assert.rejects(resetAndroidFixtureSession({ url: () => 'https://localhost/', evaluate: async () => { touched = true; } }, { pkg: () => 'com.serbiantalk.trainer' }), /dedicated lab/);
  assert.equal(touched, false);
});
test('lab reset rejects cloud and lookalike asset origins before storage access', async () => {
  for (const url of ['https://serbian-speaking-trainer.vercel.app/', 'https://localhost.example/', 'http://localhost:8765/', 'file:///testlab.html']) {
    let touched = false;
    await assert.rejects(resetAndroidFixtureSession({ url: () => url, evaluate: async () => { touched = true; } }, { pkg: () => 'com.serbiantalk.trainer.testlab' }), /asset origin/);
    assert.equal(touched, false);
  }
});
test('verified lab reset clears fixture browser state and preserves the asset scheme', async () => {
  const previousLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  try {
    for (const scheme of ['http', 'https']) {
      const events = [];
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { clear: () => events.push('local') } });
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { clear: () => events.push('session') } });
      await resetAndroidFixtureSession({ url: () => `${scheme}://localhost/?perf`, evaluate: async fn => fn(), goto: async url => events.push(url) }, { pkg: () => 'com.serbiantalk.trainer.testlab' });
      assert.deepEqual(events, ['local', 'session', `${scheme}://localhost/testlab.html`]);
    }
  } finally {
    if (previousLocal) Object.defineProperty(globalThis, 'localStorage', previousLocal); else delete globalThis.localStorage;
    if (previousSession) Object.defineProperty(globalThis, 'sessionStorage', previousSession); else delete globalThis.sessionStorage;
  }
});
