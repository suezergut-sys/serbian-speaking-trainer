export function requireApkVersion(details, expected) {
  const actual = details.match(/versionName=(\S+)/)?.[1];
  if (!actual || actual !== expected) throw Error('Installed lab APK version does not match the expected version');
  return actual;
}

export function createRadioGuard(shell, wifi, data) {
  if (![wifi, data].every(value => ['0', '1'].includes(value))) throw Error('Unknown Android radio state');
  let needsRestore = false;
  return {
    async disable() {
      // Reserve cleanup before the first mutation, including a failure of the second command.
      needsRestore = true;
      await shell('svc wifi disable');
      await shell('svc data disable');
    },
    async restore() {
      if (!needsRestore) return;
      let failed = false;
      for (const command of [`svc wifi ${wifi === '0' ? 'disable' : 'enable'}`, `svc data ${data === '0' ? 'disable' : 'enable'}`]) {
        try { await shell(command); } catch { failed = true; }
      }
      if (failed) throw Error('Android radios could not be restored; check device network state');
      needsRestore = false;
    },
  };
}

export async function restoreMicrophonePermission(shell, pkg, original) {
  const commands = [
    `pm clear-permission-flags ${pkg} android.permission.RECORD_AUDIO user-set user-fixed`,
    `pm ${original.granted ? 'grant' : 'revoke'} ${pkg} android.permission.RECORD_AUDIO`,
    ...[['user-set', original.userSet], ['user-fixed', original.userFixed]]
      .filter(([, enabled]) => enabled)
      .map(([flag]) => `pm set-permission-flags ${pkg} android.permission.RECORD_AUDIO ${flag}`),
  ];
  let failed = false;
  for (const command of commands) {
    try { await shell(command); } catch { failed = true; }
  }
  if (failed) throw Error('Android microphone permission could not be restored; check device permission state');
}
