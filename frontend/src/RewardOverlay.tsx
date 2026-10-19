import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { t } from "./i18n";
import { useRewardPreference } from "./rewardPreferences";
import type { Reward } from "./useRewards";

export function RewardOverlay({ reward }: { reward?: Reward }) {
  const enabled = useRewardPreference("animations");
  if (!reward || !enabled) return null;
  const twenty = reward.kind === "twenty";
  const start = reward.kind === "start";
  const overlay = <div key={`${reward.id}-${reward.kind}`} className={`reward-overlay reward-overlay--${reward.kind}${twenty ? "" : " reward-overlay--phrase"}`}>
    <div className="reward-panel" role="status">
      <strong className="reward-medal">{twenty ? "20" : start ? <svg aria-hidden="true" width="48" height="48" viewBox="0 0 48 48"><path fill="currentColor" d="m5 23 7-7 10 10L37 9l7 7-22 25Z" /></svg> : <><span className="reward-percent">100%</span><span className="reward-verdict">{t("Верно")}</span></>}</strong>
      {(twenty || start) && <span>{t(twenty ? "20 повторений за день!" : "Успешный старт!")}</span>}
    </div>
    {twenty && <div className="reward-confetti" aria-hidden="true">{Array.from({ length: 32 }, (_, index) => {
      const angle = index * Math.PI * 2 / 32;
      return <i key={index} style={{ "--x": `${Math.cos(angle) * (170 + index % 4 * 20)}px`, "--y": `${Math.sin(angle) * (155 + index % 5 * 18)}px`, "--spin": `${index % 2 ? 540 : -540}deg`, "--confetti-color": `var(--${["gold", "cyan", "blue-bright", "text"][index % 4]})` } as CSSProperties} />;
    })}</div>}
  </div>;
  return twenty ? createPortal(overlay, document.body) : overlay;
}
