import { afterEach, expect, it, vi } from "vitest";
import { RewardAudio } from "../rewardAudio";
import { setRewardPreference } from "../rewardPreferences";

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it("decodes a bundled WAV, unlocks on gesture and plays without any fetch", async () => {
  const start = vi.fn(), stop = vi.fn(), resume = vi.fn(async () => {});
  const decode = vi.fn(async (bytes: ArrayBuffer) => {
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    return {} as AudioBuffer;
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("AudioContext", class {
    state = "running"; resume = resume; decodeAudioData = decode;
    createBufferSource = () => ({ connect: vi.fn(), start, stop });
    close = vi.fn(async () => {});
  });
  const audio = new RewardAudio();
  audio.prepare();
  expect(resume).toHaveBeenCalledOnce();
  await audio.play();
  expect(start).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
  setRewardPreference("sounds", false);
  await audio.play();
  expect(start).toHaveBeenCalledOnce();
  audio.dispose();
  expect(stop).toHaveBeenCalledOnce();
});

it("safely ignores unavailable audio", async () => {
  vi.stubGlobal("AudioContext", undefined);
  const audio = new RewardAudio();
  expect(() => audio.prepare()).not.toThrow();
  await expect(audio.play()).resolves.toBeUndefined();
  audio.dispose();
});
