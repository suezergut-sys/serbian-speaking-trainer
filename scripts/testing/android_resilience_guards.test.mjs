import assert from 'node:assert/strict';
import test from 'node:test';
import { createRadioGuard, requireApkVersion, restoreMicrophonePermission } from '../../frontend/e2e/android-resilience-utils.mjs';

test('partial radio disable failure still restores both radios', async () => {
  const commands = [];
  const guard = createRadioGuard(async command => {
    commands.push(command);
    if (command === 'svc data disable') throw Error('Simulated second-command failure');
  }, '1', '1');
  await assert.rejects(guard.disable());
  await guard.restore();
  assert.deepEqual(commands, ['svc wifi disable', 'svc data disable', 'svc wifi enable', 'svc data enable']);
  await guard.restore();
  assert.equal(commands.length, 4);
});

test('restore attempts the second radio even if the first fails and permits retry', async () => {
  const commands = [];
  let fail = false;
  const guard = createRadioGuard(async command => {
    commands.push(command);
    if (fail && command === 'svc wifi enable') throw Error('Sensitive transport failure');
  }, '1', '0');
  await guard.disable();
  fail = true;
  await assert.rejects(guard.restore(), /could not be restored/);
  assert.equal(commands.at(-1), 'svc data disable');
  fail = false;
  await guard.restore();
  assert.deepEqual(commands.slice(-2), ['svc wifi enable', 'svc data disable']);
});

test('unknown initial radio state is rejected before shell calls', () => {
  assert.throws(() => createRadioGuard(() => assert.fail('unexpected command'), 'null', '1'));
});

test('installed version is verified rather than inferred', () => {
  assert.equal(requireApkVersion('versionName=1.16\n', '1.16'), '1.16');
  assert.throws(() => requireApkVersion('versionName=1.15\n', '1.16'));
  assert.throws(() => requireApkVersion('Unknown package', '1.16'));
});

test('permission cleanup attempts remaining commands and reports failure', async () => {
  const commands = [];
  await assert.rejects(restoreMicrophonePermission(async command => {
    commands.push(command);
    if (command.includes('clear-permission-flags')) throw Error('Transport failure');
  }, 'lab', { granted: true, userSet: true, userFixed: true }), /could not be restored/);
  assert.deepEqual(commands, [
    'pm clear-permission-flags lab android.permission.RECORD_AUDIO user-set user-fixed',
    'pm grant lab android.permission.RECORD_AUDIO',
    'pm set-permission-flags lab android.permission.RECORD_AUDIO user-set',
    'pm set-permission-flags lab android.permission.RECORD_AUDIO user-fixed',
  ]);
});
