import test from 'node:test';
import assert from 'node:assert/strict';
import { androidMetricTarget } from '../../frontend/e2e/android-fixture-metrics.mjs';
test('proxy runs do not overwrite or aggregate with direct Android evidence by default', () => {
  const direct = androidMetricTarget(false, {}), proxy = androidMetricTarget(true, {});
  assert.notEqual(direct.platform, proxy.platform);
  assert.notEqual(direct.label, proxy.label);
  assert.deepEqual(direct, {platform:'android-webview',label:'local-android'});
});
test('explicit physical-device sample labels remain separate from default proxy output', () => {
  const selected = androidMetricTarget(true, {TESTLAB_METRICS_PLATFORM:'android-physical-host-proxy',TESTLAB_METRICS_LABEL:'phone-sample-1'});
  assert.deepEqual(selected,{platform:'android-physical-host-proxy',label:'phone-sample-1'});
});
