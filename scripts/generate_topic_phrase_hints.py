"""One-time maintainer tool for refreshing persistent preset word hints."""

from __future__ import annotations

import re
import sys
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from pprint import pformat


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402
from app.db.topic_phrases import TOPIC_PHRASES  # noqa: E402
from app.services.ai_adapter import AIServiceError, OpenAIStructuredProvider  # noqa: E402


OUTPUT = BACKEND_ROOT / "app" / "db" / "topic_phrase_hints.py"
CHECKPOINT = BACKEND_ROOT / "data" / "topic_phrase_hints.checkpoint.json"
CURATED_OVERRIDES = {
    ("cafe-01", "меню"): "jelovnik",
    ("rent-02", "составляет"): "je",
    ("rent-02", "плата"): "kirija",
    ("vacation-12", "гостинице"): "hotel",
}


def normalize(value: str) -> str:
    return re.sub(r"[^а-яёa-z0-9]+", " ", value.casefold()).strip()


def prepare(item) -> tuple[str, list[dict[str, str]]]:
    source_words = {normalize(word) for word in re.findall(r"[А-Яа-яЁё]+", item.source_ru)}
    last_missing: set[str] = set()
    for _attempt in range(2):
        result = OpenAIStructuredProvider(get_settings()).prepare_phrase(
            source_ru=item.source_ru,
            canonical_sr=item.canonical_sr,
        )
        hints = [hint.model_dump() for hint in result.word_hints]
        existing_words = {hint["word_ru"].casefold() for hint in hints}
        for (phrase_id, word_ru), translation_sr in CURATED_OVERRIDES.items():
            if phrase_id == item.id and word_ru not in existing_words:
                hints.append({"word_ru": word_ru, "translation_sr": translation_sr})
        hinted_words = {
            normalize(word)
            for hint in hints
            for word in re.findall(r"[А-Яа-яЁё]+", hint["word_ru"])
        }
        last_missing = source_words - hinted_words
        if not last_missing:
            for hint in hints:
                override = CURATED_OVERRIDES.get((item.id, hint["word_ru"].casefold()))
                if override:
                    hint["translation_sr"] = override
            return item.id, hints
    raise AIServiceError(f"Missing hints for {item.id}: {sorted(last_missing)}")


def main() -> None:
    settings = get_settings()
    if not settings.openai_api_key or not settings.openai_text_model:
        raise SystemExit("OPENAI_API_KEY and OPENAI_TEXT_MODEL are required")

    generated: dict[str, list[dict[str, str]]] = (
        json.loads(CHECKPOINT.read_text(encoding="utf-8")) if CHECKPOINT.exists() else {}
    )
    pending = [item for item in TOPIC_PHRASES if item.id not in generated]
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(prepare, item): item.id for item in pending}
        for index, future in enumerate(as_completed(futures), start=1):
            phrase_id, hints = future.result()
            generated[phrase_id] = hints
            CHECKPOINT.parent.mkdir(parents=True, exist_ok=True)
            CHECKPOINT.write_text(json.dumps(generated, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[{len(generated)}/{len(TOPIC_PHRASES)}] {phrase_id}", flush=True)

    content = (
        '"""Generated persistent word hints for preset topic phrases."""\n\n'
        f"TOPIC_PHRASE_HINTS = {pformat(generated, width=120, sort_dicts=True)}\n"
    )
    OUTPUT.write_text(content, encoding="utf-8")
    if CHECKPOINT.exists():
        CHECKPOINT.unlink()
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
