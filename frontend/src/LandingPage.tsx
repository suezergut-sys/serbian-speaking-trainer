import { useEffect } from "react";
import { getLanguage, setLanguage, t, useLanguage } from "./i18n";
import logo from "./assets/app-logo.png";
import { LandingLogin } from "./LandingLogin";
import "./styles.css";
import "./landing.css";

const screenshots = [
  { id: "topics", number: "01", title: "Выберите свою ситуацию", text: "Кафе, банк, врач или работа. Тренируйте фразы, которые пригодятся в обычной жизни.", alt: "SerboTalk: выбор темы" },
  { id: "practice", number: "02", title: "Скажите это по-сербски", text: "Соберите фразу сами и произнесите вслух. Если слово забылось, воспользуйтесь подсказкой.", alt: "SerboTalk: разговорная тренировка" },
  { id: "feedback", number: "03", title: "Разберите и повторите", text: "Посмотрите разбор ответа и вернитесь к фразам, которым нужно ещё немного практики.", alt: "SerboTalk: разбор ответа" },
];

function AppLink({ compact = false }: { compact?: boolean }) {
  return <a className={`landing-cta${compact ? " landing-cta--small" : ""}`} href="#sign-in">{t(compact ? "Открыть приложение" : "Начать говорить")} <span aria-hidden="true">↗</span></a>;
}

export function LandingPage() {
  const language = useLanguage();
  useEffect(() => {
    document.documentElement.lang = getLanguage();
    document.title = t("SerboTalk — начните говорить по-сербски");
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("SerboTalk — тренируйте разговорный сербский на простых бытовых фразах. Для тех, кто уже знает слова и хочет начать говорить."));
  }, [language]);
  return <div className="landing" id="top">
    <a className="landing-skip" href="#main">{t("Перейти к содержанию")}</a>
    <header className="landing-header landing-wrap">
      <a href="#top" className="landing-brand" aria-label="SerboTalk"><img src={logo} alt="" width="38" height="38" /><span>Serbo<span>Talk</span><small>{t("Сербский. Своими словами.")}</small></span></a>
      <nav aria-label={t("Навигация по лендингу")}><a href="#story">{t("Идея")}</a><a href="#how">{t("Как это работает")}</a></nav>
      <div className="landing-languages" role="group" aria-label={t("Язык страницы")}><button type="button" lang="ru" aria-pressed={language === "ru"} onClick={() => setLanguage("ru")}>RU</button><button type="button" lang="en" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button></div>
      <AppLink compact />
    </header>
    <main id="main">
      <section className="landing-hero landing-wrap">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow"><span />{t("ОТ ЗНАКОМЫХ СЛОВ — К ЖИВОЙ РЕЧИ")}</p>
          <h1>{t("Вы уже знаете слова.")}<br /><span>{t("Пора заговорить.")}</span></h1>
          <p className="landing-lead">{t("Сербский для повседневной жизни. Простые фразы, ваш голос и практика, которая помогает словам складываться в речь.")}</p>
          <div className="landing-actions"><AppLink /><a className="landing-store" href="#get-app"><img className="landing-store__logo" src="/landing/google-play.png" alt="" width="26" height="29" /><span>Google Play<small>{t("Скоро")}</small></span></a></div>
          <p className="landing-hero-note">{t("Для уровня A1–A2 · В браузере и на Android")}</p>
          <a className="landing-explore" href="#how">{t("Заглянуть внутрь")} <span aria-hidden="true">↓</span></a>
        </div>
        <div className="landing-hero-visual">
          <div className="landing-phone landing-phone--hero"><img src={`/landing/screens/phone/${language}-statistics.jpg`} alt={t("SerboTalk: статистика занятий")} width="1280" height="2772" fetchPriority="high" /></div>
        </div>
      </section>
      <section id="story" className="landing-story landing-wrap">
        <div><p className="landing-eyebrow">{t("ПОЧЕМУ ПОЯВИЛСЯ SERBOTALK")}</p><h2>{t("Знать слово — ещё не значит")} <em>{t("уметь его сказать.")}</em></h2><div className="landing-author"><img src={logo} width="42" height="42" alt="" /><span>{t("От создателя SerboTalk")}<small>{t("Приложение, рождённое из простой идеи")}</small></span></div></div>
        <div className="landing-story-text"><p>{t("Я создал SerboTalk, потому что учить слова по карточкам или в приложениях вроде Duolingo — это прежде всего пополнять словарный запас. А чтобы начать разговаривать, нужно открывать рот и говорить: самому подбирать слова и складывать их во фразы.")}</p><p>{t("Так родилась идея простого, лёгкого приложения для практики большого количества несложных бытовых фраз. Достаточно словарного запаса уровня A1–A2, чтобы начать тренировать именно говорение: самостоятельно произносить слова и целые предложения.")}</p><blockquote>{t("Мне хотелось создать короткий путь от «я знаю эти слова» к «я могу это сказать» — и помочь быстрее освоиться с сербским в жизни.")}</blockquote></div>
      </section>
      <section id="how" className="landing-how landing-wrap"><div className="landing-section-heading"><div><p className="landing-eyebrow">{t("МЕНЬШЕ ТЕОРИИ. БОЛЬШЕ ВАШЕГО ГОЛОСА.")}</p><h2>{t("Ваш следующий разговор")}<br /><em>{t("начинается здесь.")}</em></h2></div><p>{t("Одна бытовая ситуация. Одна фраза за другой. Практика в вашем темпе.")}</p></div>
        <div className="landing-steps">{screenshots.map(item => <article key={item.id}><div className="landing-step-title"><span>{item.number}</span><h3>{t(item.title)}</h3></div><p>{t(item.text)}</p><div className="landing-phone"><img src={`/landing/screens/phone/${language}-${item.id}.jpg`} alt={t(item.alt)} width="1280" height="2772" loading="lazy" /></div></article>)}</div>
      </section>
      <section id="get-app" className="landing-bottom landing-wrap"><span className="landing-eyebrow">{t("НЕБОЛЬШАЯ ПРАКТИКА. НАСТОЯЩИЙ РАЗГОВОР.")}</span><h2>{t("Дайте словам")} <em>{t("свой голос.")}</em></h2><p>{t("Начните с простой фразы. Например, с кофе.")}</p><LandingLogin /><div className="landing-actions"><div className="landing-store landing-store--pending" role="note"><img className="landing-store__logo" src="/landing/google-play.png" alt="" width="26" height="29" /><span>Google Play<small>{t("Ссылка появится после публикации")}</small></span></div></div></section>
    </main>
    <footer className="landing-footer landing-wrap"><a className="landing-brand" href="#top">Serbo<span>Talk</span></a><span>{t("Сербский. Своими словами.")}</span><div><a href="/privacy" target="_blank" rel="noopener noreferrer">{t("Конфиденциальность")}</a><a href="/terms" target="_blank" rel="noopener noreferrer">{t("Условия использования")}</a></div></footer>
  </div>;
}
