import type { CurrentUser } from "./types/auth";
import type { SerbianAlphabet } from "./serbianScript";

export function SettingsView({ alphabet, onAlphabetChange, account, onSignOut }: {
  account?: CurrentUser;
  onSignOut?: () => void;
  alphabet: SerbianAlphabet;
  onAlphabetChange: (alphabet: SerbianAlphabet) => void;
}) {
  return <main className="settings-page">
    <h1>Настройки</h1>
    <fieldset className="alphabet-settings panel">
      <legend>Алфавит сербского языка</legend>
      <p>Выберите, как показывать сербские фразы, переводы слов и результаты проверки.</p>
      <label><input type="radio" name="serbian-alphabet" value="latin" checked={alphabet === "latin"} onChange={() => onAlphabetChange("latin")} /> Латиница <span>Želim da otvorim račun.</span></label>
      <label><input type="radio" name="serbian-alphabet" value="cyrillic" checked={alphabet === "cyrillic"} onChange={() => onAlphabetChange("cyrillic")} /> Кириллица <span>Желим да отворим рачун.</span></label>
    </fieldset>
    {account && <section className="settings-profile panel" aria-label="Профиль">
      <div className="profile"><span className="avatar">{account.display_name?.slice(0, 1).toLocaleUpperCase() || "A"}</span>
        <span className="profile__copy"><strong>{account.display_name || account.email}</strong><small>{account.daily_usage.limit === null ? `${account.daily_usage.used} фраз · без лимита` : `${account.daily_usage.remaining} из ${account.daily_usage.limit} фраз осталось`}</small></span>
      </div>
      <button className="sign-out-button" type="button" onClick={onSignOut}>Выйти</button>
    </section>}

  </main>;
}
