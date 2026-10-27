import { useRef, useState } from "react";
import { Browser } from "@capacitor/browser";
import { t } from "./i18n";
import { publicAppUrl } from "./ShareAppSettings";

const premiumSiteUrl = new URL("/app?from=android&next=premium", publicAppUrl).href;

export function AndroidPremiumPayment() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const opening = useRef(false);

  async function openSite() {
    if (opening.current) return;
    opening.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await Browser.open({ url: premiumSiteUrl });
    } catch {
      setFailed(true);
    } finally {
      opening.current = false;
      setBusy(false);
    }
  }

  return <>
    <button type="button" disabled={busy} aria-busy={busy} onClick={() => void openSite()}>
      {busy ? t("Открываем сайт…") : t("КУПИТЬ НА САЙТЕ")}
    </button>
    {failed && <p role="alert">{t("Не удалось открыть сайт. Попробуйте ещё раз.")}</p>}
  </>;
}
