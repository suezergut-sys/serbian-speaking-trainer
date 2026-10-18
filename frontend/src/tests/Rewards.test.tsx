import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRewards } from "../useRewards";
import { RewardOverlay } from "../RewardOverlay";
import { SettingsView } from "../SettingsView";
import { setLanguage } from "../i18n";
import { readRewardPreference, setRewardPreference } from "../rewardPreferences";
import type { Attempt } from "../types/training";

const audio = vi.hoisted(() => ({ prepare: vi.fn(), play: vi.fn(), stop: vi.fn(), dispose: vi.fn() }));
vi.mock("../rewardAudio", () => ({ RewardAudio: class {
  prepare = audio.prepare; play = audio.play; stop = audio.stop; dispose = audio.dispose;
} }));
const attempt = (score: number, used: number, id = "attempt-1") => ({ id, overall_score: score, daily_usage: { used } }) as Attempt;
afterEach(() => { cleanup(); localStorage.clear(); setLanguage("ru"); vi.useRealTimers(); vi.clearAllMocks(); });

it("rings only for exact 100%, deduplicates results and removes the reward after 2 seconds", () => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(useRewards);
  act(() => { result.current.prepareReward(); result.current.celebrate(attempt(.999, 19, "a0")); });
  expect(audio.prepare).toHaveBeenCalledOnce();
  expect(audio.play).not.toHaveBeenCalled();
  expect(result.current.reward).toBeUndefined();
  act(() => result.current.celebrate(attempt(1, 19)));
  expect(audio.play).toHaveBeenCalledOnce();
  expect(result.current.reward?.kind).toBe("perfect");
  act(() => { result.current.celebrate(attempt(1, 19)); vi.advanceTimersByTime(1999); });
  expect(audio.play).toHaveBeenCalledOnce();
  expect(result.current.reward).toBeDefined();
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.reward).toBeUndefined();
  unmount();
  expect(audio.dispose).toHaveBeenCalledOnce();
});

it("celebrates the daily twentieth check regardless of score and cleans up on unmount", () => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(useRewards);
  act(() => result.current.celebrate(attempt(.7, 20)));
  expect(result.current.reward?.kind).toBe("twenty");
  expect(audio.play).not.toHaveBeenCalled();
  act(() => result.current.celebrate(attempt(.7, 21, "a2")));
  expect(result.current.reward?.id).toBe("attempt-1");
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["sounds", "animations"] as const)("disables %s independently", preference => {
  setRewardPreference(preference, false);
  const { result } = renderHook(useRewards);
  act(() => { result.current.prepareReward(); result.current.celebrate(attempt(1, 20)); });
  expect(audio.play.mock.calls.length).toBe(preference === "sounds" ? 0 : 1);
  expect(Boolean(result.current.reward)).toBe(preference === "sounds");
});

it.each(["ru", "en"] as const)("renders localized rewards and persists independent switches in %s", language => {
  setLanguage(language);
  const en = language === "en";
  const view = render(<><SettingsView alphabet="latin" onAlphabetChange={() => {}} /><RewardOverlay reward={{ id: "a1", kind: "twenty" }} /></>);
  expect(screen.getByRole("status")).toHaveTextContent(en ? "20 repetitions today!" : "20 повторений за день!");
  expect(document.querySelectorAll(".reward-confetti i")).toHaveLength(32);
  fireEvent.click(screen.getByRole("switch", { name: en ? "Success animations" : "Анимации успеха" }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(readRewardPreference("sounds")).toBe(true);
  fireEvent.click(screen.getByRole("switch", { name: en ? "Success sounds" : "Звуки успеха" }));
  expect(localStorage.getItem("serbotalk.rewards.sounds")).toBe("false");
  view.unmount();
  render(<SettingsView alphabet="latin" onAlphabetChange={() => {}} />);
  expect(screen.getByRole("switch", { name: en ? "Success animations" : "Анимации успеха" })).not.toBeChecked();
  expect(screen.getByRole("switch", { name: en ? "Success sounds" : "Звуки успеха" })).not.toBeChecked();
});

it("keeps perfect feedback inside its practice panel and the daily milestone on the screen", () => {
  const view = render(<section data-testid="practice"><RewardOverlay reward={{ id: "a1", kind: "perfect" }} /></section>);
  expect(screen.getByTestId("practice").querySelector(".reward-overlay--perfect")).toBeInTheDocument();
  view.rerender(<section data-testid="practice"><RewardOverlay reward={{ id: "a2", kind: "twenty" }} /></section>);
  expect(screen.getByTestId("practice").querySelector(".reward-overlay")).toBeNull();
  expect(document.body.querySelector(".reward-overlay--twenty")).toBeInTheDocument();
});
