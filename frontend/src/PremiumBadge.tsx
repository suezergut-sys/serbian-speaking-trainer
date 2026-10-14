import { t } from "./i18n";
/** Shared marker for features reserved for the paid version. */
export function PremiumBadge() {
  return <svg className="premium-badge" role="img" aria-label={t("Премиум")} width="24" height="24" viewBox="0 0 24 24">
    <path d="M12 1.5 21 6.75v10.5L12 22.5 3 17.25V6.75Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="m6.5 8.5 3 2.5L12 7l2.5 4 3-2.5-1 7h-9Z" fill="currentColor" />
    <path d="M8 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}
