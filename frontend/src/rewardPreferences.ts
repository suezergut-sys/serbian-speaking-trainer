import { useSyncExternalStore } from "react";

export type RewardPreference = "sounds" | "animations";
const listeners = new Set<() => void>();
const memory = new Map<string, boolean>();
const key = (preference: RewardPreference) => `serbotalk.rewards.${preference}`;

export function readRewardPreference(preference: RewardPreference): boolean {
  if (memory.has(preference)) return memory.get(preference)!;
  try { return localStorage.getItem(key(preference)) !== "false"; }
  catch { return memory.get(preference) ?? true; }
}

export function setRewardPreference(preference: RewardPreference, enabled: boolean) {
  try { localStorage.setItem(key(preference), String(enabled)); memory.delete(preference); }
  catch { memory.set(preference, enabled); }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}

export function useRewardPreference(preference: RewardPreference) {
  return useSyncExternalStore(subscribe, () => readRewardPreference(preference), () => true);
}
