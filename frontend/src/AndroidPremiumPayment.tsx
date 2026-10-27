import { useRef, useState } from "react";
import { Browser } from "@capacitor/browser";
import { t } from "./i18n";
import { publicAppUrl } from "./ShareAppSettings";

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
      await Browser.open({ url: publicAppUrl });
    } catch {
      setFailed(true);
    } finally {
      opening.current = false;
      setBusy(false);
    }
  }

  return <div className="premium-site-payment panel">
    <p>{t("Оплатить премиум вы можете на сайте")}</p>
    <button type="button" disabled={busy} aria-busy={busy} onClick={() => void openSite()}>
      {busy ? t("Открываем сайт…") : publicAppUrl}
    </button>
    {failed && <p role="alert">{t("Не удалось открыть сайт. Попробуйте ещё раз.")}</p>}
  </div>;
}
