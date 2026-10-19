import { useEffect, useRef, useState } from "react";
import type { Attempt } from "./types/training";
import { readRewardPreference, useRewardPreference } from "./rewardPreferences";
import { RewardAudio } from "./rewardAudio";

export type Reward = { id: string; kind: "perfect" | "start" | "twenty" };

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
    const rewards: Reward[] = [];
    if (perfect && completed.first_success_today) rewards.push({ id: completed.id, kind: "start" });
    if (twenty) rewards.push({ id: completed.id, kind: "twenty" });
    else if (perfect && !completed.first_success_today) rewards.push({ id: completed.id, kind: "perfect" });
    function present(remaining: Reward[]) {
      setReward(remaining[0]);
      if (remaining.length) timer.current = setTimeout(() => present(remaining.slice(1)), 2000);
    }
    present(rewards);
  }

  return { reward, prepareReward, celebrate };
}
