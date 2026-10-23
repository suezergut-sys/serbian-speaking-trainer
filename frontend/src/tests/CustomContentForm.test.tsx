import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomContentForm } from "../CustomContentForm";
import { setLanguage } from "../i18n";
import { addReviewPhrase, createTopic, prepareReviewPhrase } from "../api/training";

vi.mock("../api/training", async importOriginal => ({ ...await importOriginal<typeof import("../api/training")>(), addReviewPhrase: vi.fn(), createTopic: vi.fn(), prepareReviewPhrase: vi.fn() }));
const topic = { id: "custom-1", title_ru: "Своя тема", description_ru: "", likely_intents: [], suggested_vocabulary: [], is_custom: true, phrase_count: 0 };
const prepared = { preparation_id: "receipt-1", source_ru: "Мне нужно позвонить хозяину.", canonical_sr: "Moram da pozovem vlasnika.", intended_sr_variants: ["Moram da pozovem vlasnika."], word_hints: [] };
afterEach(() => { cleanup(); vi.resetAllMocks(); setLanguage("ru"); });

describe("administrator custom content", () => {
  it.each(["ru", "en"] as const)("prepares, previews and saves into the chosen topic (%s)", async language => {
    setLanguage(language);
    vi.mocked(prepareReviewPhrase).mockResolvedValue(prepared);
    const saved = vi.fn();
    render(<CustomContentForm mode="phrase" topics={[topic]} alphabet="latin" onTopicCreated={vi.fn()} onPhraseSaved={saved} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: prepared.source_ru } });
    fireEvent.click(screen.getByRole("button", { name: language === "ru" ? "Подготовить перевод" : "Prepare translation" }));
    expect(await screen.findByText(prepared.canonical_sr)).toBeInTheDocument();
    expect(addReviewPhrase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: language === "ru" ? "Сохранить фразу" : "Save phrase" }));
    await screen.findByText(language === "ru" ? "Фраза сохранена." : "Phrase saved.");
    expect(addReviewPhrase).toHaveBeenCalledWith(prepared, topic.id);
    expect(saved).toHaveBeenCalledOnce();
  });

  it("invalidates a prepared translation after editing and preserves the draft after failure", async () => {
    vi.mocked(prepareReviewPhrase).mockResolvedValueOnce(prepared).mockRejectedValueOnce(new Error("offline"));
    render(<CustomContentForm mode="phrase" topics={[topic]} alphabet="latin" onTopicCreated={vi.fn()} onPhraseSaved={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: prepared.source_ru } });
    fireEvent.click(screen.getByText("Подготовить перевод"));
    await screen.findByText(prepared.canonical_sr);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Я задержусь на десять минут." } });
    expect(screen.queryByText(prepared.canonical_sr)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Подготовить перевод"));
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox")).toHaveValue("Я задержусь на десять минут.");
    expect(addReviewPhrase).not.toHaveBeenCalled();
  });

  it("retains the translation and topic when saving fails and allows retry", async () => {
    vi.mocked(prepareReviewPhrase).mockResolvedValue(prepared);
    vi.mocked(addReviewPhrase).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({} as never);
    render(<CustomContentForm mode="phrase" topics={[topic]} alphabet="latin" onTopicCreated={vi.fn()} onPhraseSaved={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: prepared.source_ru } });
    fireEvent.click(screen.getByText("Подготовить перевод"));
    await screen.findByText(prepared.canonical_sr);
    fireEvent.click(screen.getByText("Сохранить фразу"));
    await screen.findByRole("alert");
    expect(screen.getByRole("combobox")).toHaveValue(topic.id);
    expect(screen.getByText(prepared.canonical_sr)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Сохранить фразу"));
    await screen.findByText("Фраза сохранена.");
    expect(prepareReviewPhrase).toHaveBeenCalledOnce();
  });

  it("blocks whitespace and duplicate submissions while saving a topic", async () => {
    let finish!: (value: typeof topic) => void;
    vi.mocked(createTopic).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const created = vi.fn();
    render(<CustomContentForm mode="topic" topics={[]} alphabet="latin" onTopicCreated={created} onPhraseSaved={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    expect(screen.getByText("Сохранить тему")).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Своя   тема  " } });
    fireEvent.click(screen.getByText("Сохранить тему"));
    expect(screen.getByText("Сохраняем…")).toBeDisabled();
    expect(screen.getByText("Закрыть")).toBeDisabled();
    finish(topic);
    await screen.findByText("Тема сохранена.");
    expect(createTopic).toHaveBeenCalledExactlyOnceWith("Своя тема");
    expect(created).toHaveBeenCalledWith(topic);
  });
  it.each(["ru", "en"] as const)("blocks sixteen words and shows the word limit (%s)", language => {
    setLanguage(language);
    render(<CustomContentForm mode="phrase" topics={[topic]} alphabet="latin" onTopicCreated={vi.fn()} onPhraseSaved={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: Array(16).fill("слово").join(" ") } });
    expect(screen.getByRole("alert")).toHaveTextContent(language === "ru" ? "не более 15 слов" : "no more than 15 words");
    expect(screen.getByRole("button", { name: language === "ru" ? "Подготовить перевод" : "Prepare translation" })).toBeDisabled();
    expect(prepareReviewPhrase).not.toHaveBeenCalled();
  });

  it.each([["topic", "ru"], ["phrase", "ru"], ["topic", "en"], ["phrase", "en"]] as const)("offers deletion when the %s limit is reached (%s)", (mode, language) => {
    setLanguage(language);
    const manage = vi.fn();
    const topics = Array.from({ length: 5 }, (_, index) => ({ ...topic, id: `topic-${index}`, custom_phrase_count: 30 }));
    render(<CustomContentForm mode={mode} topics={topics} alphabet="latin" onTopicCreated={vi.fn()} onPhraseSaved={vi.fn()} onClose={vi.fn()} onManage={manage} />);
    expect(screen.getByRole("alert")).toHaveTextContent(language === "ru" ? mode === "topic" ? "5 пользовательских тем" : "30 фраз в теме" : mode === "topic" ? "5 custom topics" : "30 phrases");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Новый текст" } });
    expect(screen.getByRole("button", { name: language === "ru" ? mode === "topic" ? "Сохранить тему" : "Подготовить перевод" : mode === "topic" ? "Save topic" : "Prepare translation" })).toBeDisabled();
    fireEvent.click(screen.getByText(language === "ru" ? "Удалить свои фразы или темы" : "Delete your phrases or topics"));
    expect(manage).toHaveBeenCalledOnce();
  });

  it("offers creating a topic when only presets exist", () => {
    render(<CustomContentForm mode="phrase" topics={[{ ...topic, is_custom: false }]} alphabet="latin" onTopicCreated={vi.fn()} onPhraseSaved={vi.fn()} onClose={vi.fn()} onCreateTopic={vi.fn()} />);
    expect(screen.getByText("Сначала создайте свою тему для фраз.")).toBeInTheDocument();
    expect(screen.getByText("Подготовить перевод")).toBeDisabled();
    expect(screen.getByText("Создать свою тему")).toBeInTheDocument();
  });

});
