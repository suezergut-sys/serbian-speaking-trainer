import { useEffect, useRef, useState } from "react";
import type { Attempt } from "./types/training";
import { readRewardPreference, useRewardPreference } from "./rewardPreferences";
import { RewardAudio } from "./rewardAudio";

export type Reward = { id: string; kind: "perfect" | "twenty" };

export function useRewards() {
  const [reward, setReward] = useState<Reward>();
  const audio = useRef<RewardAudio | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seen = useRef(new Set<string>());
  const sounds = useRewardPreference("sounds");

  useEffect(() => () => { clearTimeout(timer.current); audio.current?.dispose(); }, []);
  useEffect(() => { if (!sounds) audio.current?.stop(); }, [sounds]);

  function prepareReward() {
    if (!readRewardPreference("sounds")) return;
    audio.current ??= new RewardAudio();
    audio.current.prepare();
  }

  function celebrate(completed: Attempt) {
    if (seen.current.has(completed.id)) return;
    seen.current.add(completed.id);
    const perfect = completed.overall_score === 1;
    const twenty = completed.daily_usage?.used === 20;
    if (perfect && readRewardPreference("sounds")) void audio.current?.play();
    if ((!perfect && !twenty) || !readRewardPreference("animations")) return;
    clearTimeout(timer.current);
    setReward({ id: completed.id, kind: twenty ? "twenty" : "perfect" });
    timer.current = setTimeout(() => setReward(undefined), 2000);
  }

  return { reward, prepareReward, celebrate };
}
