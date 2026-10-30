import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const manifest = readFileSync(
  resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml"),
  "utf-8",
);
const androidBuild = readFileSync(
  resolve(process.cwd(), "android/app/build.gradle"),
  "utf-8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf-8"),
) as { version: string };

describe("Android microphone permissions", () => {
  it("declares every permission requested by Capacitor for WebView audio capture", () => {
    expect(manifest).toContain("android.permission.RECORD_AUDIO");
    expect(manifest).toContain("android.permission.MODIFY_AUDIO_SETTINGS");
  });
});

describe("Android release metadata", () => {
  it("keeps the 1.43 product version and required APK filename aligned", () => {
    expect(packageJson.version).toBe("1.43.0");
    expect(androidBuild).toContain("versionCode 53");
    expect(androidBuild).toContain('versionName "1.43"');
    expect(androidBuild).toContain('outputFileName = "SerboTalk-andorid16-1.43.apk"');
  });
});
