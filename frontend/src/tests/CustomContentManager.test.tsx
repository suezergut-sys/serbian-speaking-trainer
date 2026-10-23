import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomContentManager } from "../CustomContentManager";
import { deleteCustomPhrase, deleteCustomTopic, fetchCustomPhrases } from "../api/training";
import { setLanguage } from "../i18n";

vi.mock("../api/training", () => ({ deleteCustomPhrase: vi.fn(), deleteCustomTopic: vi.fn(), fetchCustomPhrases: vi.fn() }));
const topic = { id: "custom-1", title_ru: "Моя тема", description_ru: "", is_custom: true, phrase_count: 1, custom_phrase_count: 1, likely_intents: [], suggested_vocabulary: [] };
const phrase = { id: "p1", topic_id: topic.id, topic_title: topic.title_ru, source_ru: "Я скоро вернусь.", canonical_sr: "Uskoro se vraćam.", best_score: 1, attempts: 3, perfect_streak: 3, status: "mastered", created_at: "2026-10-23" };
afterEach(() => { cleanup(); vi.resetAllMocks(); setLanguage("ru"); });

describe("custom content deletion", () => {
  it.each(["ru", "en"] as const)("requires confirmation and removes all topic phrases (%s)", async language => {
    setLanguage(language);
    vi.mocked(fetchCustomPhrases).mockResolvedValue([phrase]);
    const changed = vi.fn();
    render(<CustomContentManager topics={[topic]} alphabet="latin" onDeleted={changed} onClose={vi.fn()} />);
    await screen.findByText(phrase.source_ru);
    fireEvent.click(screen.getByRole("button", { name: language === "ru" ? "Удалить тему" : "Delete topic" }));
    expect(deleteCustomTopic).not.toHaveBeenCalled();
    expect(screen.getByText(language === "ru" ? "Удалить тему и все её фразы?" : "Delete the topic and all its phrases?")).toBeInTheDocument();
    fireEvent.click(screen.getByText(language === "ru" ? "Подтвердить удаление" : "Confirm deletion"));
    await screen.findByText(language === "ru" ? "Тема и все её фразы удалены." : "The topic and all its phrases have been deleted.");
    expect(deleteCustomTopic).toHaveBeenCalledExactlyOnceWith(topic.id);
    expect(screen.queryByText(phrase.source_ru)).not.toBeInTheDocument();
    expect(changed).toHaveBeenCalledWith(topic.id);
  });

  it("keeps a phrase on failure, allows cancellation and retries deletion", async () => {
    vi.mocked(fetchCustomPhrases).mockResolvedValue([phrase]);
    vi.mocked(deleteCustomPhrase).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(<CustomContentManager topics={[topic]} alphabet="latin" onDeleted={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText(phrase.source_ru);
    fireEvent.click(screen.getByText("Удалить фразу"));
    fireEvent.click(screen.getByText("Отмена"));
    expect(deleteCustomPhrase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Удалить фразу"));
    fireEvent.click(screen.getByText("Подтвердить удаление"));
    await screen.findByRole("alert");
    expect(screen.getAllByText(phrase.source_ru)).toHaveLength(2);
    fireEvent.click(screen.getByText("Подтвердить удаление"));
    await screen.findByText("Фраза удалена.");
    expect(screen.queryByText(phrase.source_ru)).not.toBeInTheDocument();
  });
});
