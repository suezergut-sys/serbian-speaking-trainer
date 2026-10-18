import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { t } from "./i18n";
import { useRewardPreference } from "./rewardPreferences";
import type { Reward } from "./useRewards";

export function RewardOverlay({ reward }: { reward?: Reward }) {
  const enabled = useRewardPreference("animations");
  if (!reward || !enabled) return null;
  const twenty = reward.kind === "twenty";
  return createPortal(<div key={reward.id} className={`reward-overlay reward-overlay--${reward.kind}`}>
    <div className="reward-panel" role="status">
      <strong className="reward-medal">{twenty ? "20" : <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>}</strong>
      <span>{t(twenty ? "20 повторений за день!" : "Идеально!")}</span>
    </div>
    {twenty && <div className="reward-confetti" aria-hidden="true">{Array.from({ length: 32 }, (_, index) => {
      const angle = index * Math.PI * 2 / 32;
      return <i key={index} style={{ "--x": `${Math.cos(angle) * (170 + index % 4 * 20)}px`, "--y": `${Math.sin(angle) * (155 + index % 5 * 18)}px`, "--spin": `${index % 2 ? 540 : -540}deg`, "--confetti-color": `var(--${["gold", "cyan", "blue-bright", "text"][index % 4]})` } as CSSProperties} />;
    })}</div>}
  </div>, document.body);
}
