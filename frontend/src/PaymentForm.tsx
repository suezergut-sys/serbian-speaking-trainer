import { useEffect, useRef, useState } from "react";
import { getLanguage, t } from "./i18n";
import { paymentRequest, type Country, type Payment, type PaymentOptions } from "./api/payments";
import { countryLabels, methodLabels, statusLabels } from "./paymentLabels";
import sbp from "./assets/payments/sbp.svg";
import alta from "./assets/payments/alta.png";
import paypal from "./assets/payments/paypal.svg";

const logos = { sbp, alta, paypal };
const descriptions = { sbp: "Перевод по номеру телефона", alta: "Банковский перевод", paypal: "Оплата через PayPal" };

function CopyValue({ label, value }: { label: string; value: string }) {
  const [message, setMessage] = useState("");
  return <div className="payment-value"><span>{t(label)}</span><strong>{value}</strong>
    <button type="button" aria-label={`${t("Копировать")}: ${t(label)}`} onClick={() => {
      navigator.clipboard?.writeText(value).then(() => setMessage("Скопировано")).catch(() => setMessage("Не удалось скопировать. Выделите и скопируйте текст вручную."));
      if (!navigator.clipboard) setMessage("Не удалось скопировать. Выделите и скопируйте текст вручную.");
    }}>{t("Копировать")}</button><small role="status">{t(message)}</small></div>;
}

export function PaymentForm({ onClose, onGranted }: { onClose: () => void; onGranted?: () => Promise<void> }) {
  const [options, setOptions] = useState<PaymentOptions>();
  const [payment, setPayment] = useState<Payment>();
  const [country, setCountry] = useState<Country | "">("");
  const [altaCurrency, setAltaCurrency] = useState("EUR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [paidAt, setPaidAt] = useState("");
  const [amount, setAmount] = useState("");
  const [transaction, setTransaction] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const locked = useRef(false);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      paymentRequest<PaymentOptions>("/payments/options", "GET", undefined, controller.signal),
      paymentRequest<Payment[]>("/payments", "GET", undefined, controller.signal),
    ]).then(([config, payments]) => {
      if (controller.signal.aborted) return;
      setOptions(config); setError(false);
      const current = payments[0];
      setPayment(current);
      setCountry(current?.country ?? "");
      setAltaCurrency(current?.method === "alta" ? current.details.currency : config.methods.alta.currencies?.[0] ?? "EUR");
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [retry]);

  async function mutate(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(false);
    try { await action(); } catch { setError(true); }
    finally { locked.current = false; setBusy(false); }
  }
  const awaiting = payment?.status === "awaiting_payment";
  const reviewing = payment?.status === "awaiting_review";
  const canChoose = !reviewing && payment?.status !== "confirmed";
  const language = getLanguage();

  return <section className="payment-form panel" aria-labelledby="payment-title" aria-busy={busy}>
    <header><h2 id="payment-title" tabIndex={-1} ref={heading}>{t("Premium — бессрочный доступ")}</h2>
      <button type="button" disabled={busy} onClick={onClose}>{t("Закрыть")}</button></header>
    <p>{t("Однократный платёж 5 €")}</p>
    <p>{t("Без подписки и автоматических списаний.")}</p>
    <p>{t("Premium включается сразу после сообщения об оплате.")}</p>
    {options?.activation && <p>{options.activation[language]}</p>}
    {!options?.activation && options && <p role="status">{t("Условия активации ещё не настроены. Оплата пока недоступна.")}</p>}
    {error && <div role="alert"><p>{t("Не удалось выполнить действие. Обновите статус заявки перед повторной попыткой.")}</p>
      <button type="button" disabled={busy} onClick={() => setRetry(value => value + 1)}>{t("Обновить статус")}</button></div>}
    {!options && !error && <p role="status">{t("Загружаем способы оплаты…")}</p>}
    {options && <>
      <label>{t("Из какой страны вы платите?")}<select required value={country} disabled={busy || !canChoose} onChange={event => {
        const next = event.target.value as Country | "";
        void mutate(async () => {
          if (awaiting && payment) await paymentRequest(`/payments/${payment.id}/cancel`, "POST");
          setCountry(next); setPayment(undefined); setPaidAt(""); setAmount(""); setTransaction("");
          setAltaCurrency(options.methods.alta.currencies?.[0] ?? "EUR");
        });
      }}><option value="">{t("Выберите страну")}</option>{Object.entries(countryLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
      {country === "serbia" && canChoose && (options.methods.alta.currencies?.length ?? 0) > 1 && <label>{t("Валюта перевода ALTA")}
        <select value={altaCurrency} disabled={busy} onChange={event => {
          const currency = event.target.value;
          void mutate(async () => {
            if (awaiting && payment?.method === "alta") { await paymentRequest(`/payments/${payment.id}/cancel`, "POST"); setPayment(undefined); }
            setAltaCurrency(currency);
          });
        }}>{options.methods.alta.currencies!.map(currency => <option key={currency} value={currency}>{currency}</option>)}</select></label>}
      {country && canChoose && <div className="payment-methods">{options.countries[country].map(method => <div key={method}>
        <button type="button" className="payment-method" disabled={busy || !options.methods[method].available}
          aria-pressed={awaiting && payment?.method === method} onClick={() => void mutate(async () => {
            setPayment(await paymentRequest<Payment>("/payments", "POST", { country, method, ...(method === "alta" ? { currency: altaCurrency } : {}) }));
            setPaidAt(""); setAmount(""); setTransaction("");
          })}><span className="payment-logo"><img src={logos[method]} alt="" /></span><strong>{t(methodLabels[method])}</strong><span>{t(descriptions[method])}</span></button>
        {!options.methods[method].available && <small>{t("Способ недоступен: реквизиты или условия активации ещё не настроены.")}</small>}
      </div>)}</div>}
      <p className="payment-note">{t("PayPal доступен для выбора в любой стране. Возможность перевода определяется PayPal.")}</p>
    </>}
    {payment && <div className="payment-details" key={payment.id}>
      <p role="status"><strong>{t(statusLabels[payment.status])}</strong></p>
      <CopyValue label="Номер заявки" value={payment.id} />
      <p>{t(countryLabels[payment.country])} · {t(methodLabels[payment.method])}</p>
      {(awaiting || reviewing) && <>
        <p>{payment.activation[language]}</p>
        <CopyValue label="Сумма к оплате" value={`${payment.details.amount} ${payment.details.currency}`} />
        <CopyValue label="Получатель" value={payment.details.recipient} />
        {payment.details.phone && <CopyValue label="Телефон получателя" value={payment.details.phone} />}
        {payment.details.bank && <CopyValue label="Банк получателя" value={payment.details.bank} />}
        {payment.details.account && <CopyValue label="Номер счёта" value={payment.details.account} />}
        {payment.details.bank_details && <CopyValue label="Банковские реквизиты" value={payment.details.bank_details} />}
        {payment.method === "alta" && <CopyValue label="Назначение платежа" value={`Premium ${payment.id}`} />}
        {(payment.details.paypal || payment.details.paypal_url) && <CopyValue label="Получатель PayPal" value={payment.details.paypal || payment.details.paypal_url!} />}
        <p className="payment-instructions">{payment.details.instructions[language]}</p>
        {payment.method === "paypal" && <><p>{t("Оплачивайте покупку коммерческим платежом. Укажите номер заявки в комментарии, если PayPal его поддерживает.")}</p>
          <a href={payment.details.paypal_url || "https://www.paypal.com/"} target="_blank" rel="noopener noreferrer">{t("Перейти в PayPal")}</a></>}
      </>}
      {awaiting && <form onSubmit={event => { event.preventDefault(); void mutate(async () => {
        const updated = await paymentRequest<Payment>(`/payments/${payment.id}/report`, "POST", {
          paid_at: new Date(paidAt).toISOString(), amount, transaction_id: transaction.trim() || null,
        });
        setPayment(updated);
        if (onGranted) await onGranted();
      }); }}>
        <label>{t("Дата и примерное время оплаты (ваш часовой пояс)")}<input required type="datetime-local" value={paidAt} disabled={busy} onChange={event => setPaidAt(event.target.value)} /></label>
        <label>{t("Переведённая сумма")} ({payment.details.currency})<input required type="number" min="0.01" max="9999999999.99" step="0.01" inputMode="decimal" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} /></label>
        <label>{t("Идентификатор операции (необязательно)")}<input maxLength={200} value={transaction} disabled={busy} onChange={event => setTransaction(event.target.value)} /></label>
        <button type="submit" disabled={busy}>{t(busy ? "Отправляем…" : "Я оплатил")}</button>
        <button type="button" disabled={busy} onClick={() => void mutate(async () => setPayment(await paymentRequest<Payment>(`/payments/${payment.id}/cancel`, "POST")))}>{t("Отменить заявку")}</button>
      </form>}
      {reviewing && <p role="status">{t("Администратор проверит и подтвердит ваш платёж, а пока вы можете пользоваться всеми Premium-функциями без ограничений.")}</p>}
      {(payment.status === "confirmed" || (reviewing && payment.provisional_granted_at)) && <p>{t("Premium включён для вашего аккаунта. Обновите приложение, чтобы продолжить.")}</p>}
      <button type="button" disabled={busy} onClick={() => { if (payment.status === "confirmed" || (reviewing && payment.provisional_granted_at)) window.location.reload(); else setRetry(value => value + 1); }}>{t("Обновить статус")}</button>
    </div>}
  </section>;
}
