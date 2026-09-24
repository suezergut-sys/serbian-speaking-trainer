import type { SerbianAlphabet } from "./serbianScript";

export function SettingsView({ alphabet, onAlphabetChange }: {
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
  </main>;
}
