import { SettingsIcon } from "./SettingsIcon";
import { t, useLanguage, setLanguage } from "./i18n";
import type { CurrentUser } from "./types/auth";
import type { SerbianAlphabet } from "./serbianScript";
import { ModelDebugSettings } from "./ModelDebugSettings";
import { TranscriptionModelSettings } from "./TranscriptionModelSettings";
import { version } from "../package.json";
import { FeedbackSettings } from "./FeedbackSettings";
import { ShareAppSettings } from "./ShareAppSettings";
import { setRewardPreference, useRewardPreference } from "./rewardPreferences";

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
  const sounds = useRewardPreference("sounds");
  const animations = useRewardPreference("animations");
  return <main className="settings-page">
    <header className="settings-heading"><h1>{t("Настройки")}</h1><span className="settings-version" aria-label={t("Версия приложения")}>v.{t(version.split(".").slice(0, 2).join("."))}</span></header>
    <fieldset className="alphabet-settings language-settings settings-section">
      <legend>{t("Язык интерфейса и исходных фраз")}</legend>
      <div className="settings-card-grid">
        <label className="settings-card settings-choice"><SettingsIcon name="ru" /><strong>Русский</strong><input type="radio" name="interface-language" value="ru" checked={language === "ru"} onChange={() => setLanguage("ru")} /><span className="settings-choice__check" aria-hidden="true">✓</span></label>
        <label className="settings-card settings-choice"><SettingsIcon name="en" /><strong>English</strong><input type="radio" name="interface-language" value="en" checked={language === "en"} onChange={() => setLanguage("en")} /><span className="settings-choice__check" aria-hidden="true">✓</span></label>
      </div>
    </fieldset>
    <fieldset className="alphabet-settings settings-section">
      <legend>{t("Алфавит сербского языка")}</legend>
      <p>{t("Выберите, как показывать сербские фразы, переводы слов и результаты проверки.")}</p>
      <div className="settings-card-grid">
        <label className="settings-card settings-choice"><SettingsIcon name="latin" /><span className="settings-card__copy"><strong>{t("Латиница")}</strong><small>Želim da otvorim račun.</small></span><input type="radio" name="serbian-alphabet" value="latin" checked={alphabet === "latin"} onChange={() => onAlphabetChange("latin")} /><span className="settings-choice__check" aria-hidden="true">✓</span></label>
        <label className="settings-card settings-choice"><SettingsIcon name="cyrillic" /><span className="settings-card__copy"><strong>{t("Кириллица")}</strong><small>Желим да отворим рачун.</small></span><input type="radio" name="serbian-alphabet" value="cyrillic" checked={alphabet === "cyrillic"} onChange={() => onAlphabetChange("cyrillic")} /><span className="settings-choice__check" aria-hidden="true">✓</span></label>
      </div>
    </fieldset>
    <section className="assistance-settings settings-section settings-card" aria-label={t("Мягкие подсказки при распознавании")}>
      <SettingsIcon name="hints" />
      <div className="settings-card__copy">
        <label className="settings-toggle"><strong>{t("Мягкие подсказки при распознавании")}</strong><input type="checkbox" role="switch" disabled={assistanceSaving} checked={assistanceEnabled} onChange={event => onAssistanceChange?.(event.target.checked)} /></label>
        <p>{t("Сравнивать каждую расшифровку с эталоном и допустимыми переводами, предлагая близкие варианты возможных искажений распознавания. Все изменения применяются только после вашего подтверждения.")}</p>
        {assistanceSaving && <p role="status">{t("Сохраняем настройку…")}</p>}
        {assistanceError && <p role="alert">{t(assistanceError)}</p>}
      </div>
    </section>
    <fieldset className="alphabet-settings reward-settings settings-section">
      <legend>{t("Награды за успехи")}</legend>
      <p>{t("Звоночек за 100% и золотая награда за 20 повторений за день. Настройки сохраняются на этом устройстве.")}</p>
      <div className="settings-card-grid">
        <label className="settings-card settings-toggle settings-reward"><SettingsIcon name="bell" /><strong>{t("Звуки успеха")}</strong><input type="checkbox" role="switch" checked={sounds} onChange={event => setRewardPreference("sounds", event.target.checked)} /></label>
        <label className="settings-card settings-toggle settings-reward"><SettingsIcon name="celebrate" /><strong>{t("Анимации успеха")}</strong><input type="checkbox" role="switch" checked={animations} onChange={event => setRewardPreference("animations", event.target.checked)} /></label>
      </div>
    </fieldset>
    <ShareAppSettings />
    <FeedbackSettings />
    {account?.role === "admin" && account.can_debug_models && <div className="settings-admin-grid settings-card-grid"><TranscriptionModelSettings key={`transcription-${account.id}`} /><ModelDebugSettings key={account.id} /></div>}
    {account && <><section className="settings-profile panel" aria-labelledby="settings-account-title">
      <h2 id="settings-account-title">{t("Аккаунт")}</h2>
      <div className="settings-profile__details">
      <div className="profile"><span className="avatar">{account.display_name?.slice(0, 1).toLocaleUpperCase() || "A"}</span>
        <span className="profile__copy"><strong>{account.display_name || account.email}</strong>{account.display_name && <span className="settings-profile__email">{account.email}</span>}<small>{t(account.daily_usage.limit === null ? `${account.daily_usage.used} фраз · без лимита` : `${account.daily_usage.remaining} из ${account.daily_usage.limit} фраз осталось`)}</small></span>
      </div>
      <button className="sign-out-button" type="button" onClick={onSignOut}>{t("Выйти")}</button>
      </div>
    </section>
    <section className="settings-deletion panel" aria-labelledby="settings-deletion-title">
      <h2 id="settings-deletion-title">{t("Удаление аккаунта")}</h2>
      <a className="account-deletion-link" href="/delete-account">{t("Запросить удаление аккаунта и данных")}</a>
    </section></>}

  </main>;
}
