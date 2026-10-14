import { t, useLanguage, setLanguage } from "./i18n";
import type { CurrentUser } from "./types/auth";
import type { SerbianAlphabet } from "./serbianScript";
import { ModelDebugSettings } from "./ModelDebugSettings";
import { version } from "../package.json";

export function SettingsView({ alphabet, onAlphabetChange, account, onSignOut, assistanceEnabled = false, assistanceSaving = false, assistanceError, onAssistanceChange }: {
  assistanceEnabled?: boolean;
  assistanceSaving?: boolean;
  assistanceError?: string;
  onAssistanceChange?: (enabled: boolean) => void;
  account?: CurrentUser;
  onSignOut?: () => void;
  alphabet: SerbianAlphabet;
  onAlphabetChange: (alphabet: SerbianAlphabet) => void;
}) {
  const language = useLanguage();
  return <main className="settings-page">
    <header className="settings-heading"><h1>{t("Настройки")}</h1><span className="settings-version" aria-label={t("Версия приложения")}>v.{t(version.split(".").slice(0, 2).join("."))}</span></header>
    <fieldset className="alphabet-settings panel language-settings">
      <legend>{language === "en" ? "Interface and source language" : "Язык интерфейса и исходных фраз"}</legend>
      <label><input type="radio" name="interface-language" value="ru" checked={language === "ru"} onChange={() => setLanguage("ru")} /> Русский</label>
      <label><input type="radio" name="interface-language" value="en" checked={language === "en"} onChange={() => setLanguage("en")} /> English</label>
    </fieldset>
    <fieldset className="alphabet-settings panel">
      <legend>{t("Алфавит сербского языка")}</legend>
      <p>{t("Выберите, как показывать сербские фразы, переводы слов и результаты проверки.")}</p>
      <label><input type="radio" name="serbian-alphabet" value="latin" checked={alphabet === "latin"} onChange={() => onAlphabetChange("latin")} />{t(" Латиница ")}<span>Želim da otvorim račun.</span></label>
      <label><input type="radio" name="serbian-alphabet" value="cyrillic" checked={alphabet === "cyrillic"} onChange={() => onAlphabetChange("cyrillic")} />{t(" Кириллица ")}<span>{t("Желим да отворим рачун.")}</span></label>
    </fieldset>
    <section className="assistance-settings panel">
      <label><input type="checkbox" role="switch" disabled={assistanceSaving} checked={assistanceEnabled} onChange={event => onAssistanceChange?.(event.target.checked)} />{t(" Мягкие подсказки при распознавании")}</label>
      <p>{t("Сравнивать каждую расшифровку с эталоном и допустимыми переводами, предлагая близкие варианты возможных искажений распознавания. Все изменения применяются только после вашего подтверждения.")}</p>
      <small>{t("По умолчанию выключено. Выбор сохраняется в профиле и синхронизируется между веб-версией и Android. Настройка применяется к следующей записи.")}</small>
      {assistanceSaving && <p role="status">{t("Сохраняем настройку…")}</p>}
      {assistanceError && <p role="alert">{t(assistanceError)}</p>}
    </section>
    {account?.role === "admin" && account.can_debug_models && <ModelDebugSettings key={account.id} />}
    {account && <section className="settings-profile panel" aria-label={t("Профиль")}>
      <div className="profile"><span className="avatar">{account.display_name?.slice(0, 1).toLocaleUpperCase() || "A"}</span>
        <span className="profile__copy"><strong>{account.display_name || account.email}</strong><small>{t(account.daily_usage.limit === null ? `${account.daily_usage.used} фраз · без лимита` : `${account.daily_usage.remaining} из ${account.daily_usage.limit} фраз осталось`)}</small></span>
      </div>
      <button className="sign-out-button" type="button" onClick={onSignOut}>{t("Выйти")}</button>
      <a className="account-deletion-link" href="/delete-account">{t("Запросить удаление аккаунта и данных")}</a>
    </section>}

  </main>;
}
