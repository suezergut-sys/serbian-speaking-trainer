"""Explicit maintainer audit, never run by tests or on application requests.

Uses configured adapter/model with bounded timeout/retry. Checkpoints are private;
only preset hints may be exported into tracked source files.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import sys
from pprint import pformat

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import get_settings
from app.db.topic_phrases import TOPIC_PHRASES
from app.db.topic_phrases_en import TOPIC_PHRASES_EN
from app.services.ai_adapter import OpenAIStructuredProvider
from app.services.hint_alignment import aligned_word_hints


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manual", type=Path)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--export", action="store_true")
    args = parser.parse_args()
    folder = ROOT / "artifacts/context-hints"
    folder.mkdir(parents=True, exist_ok=True)
    checkpoint = folder / "prepared.json"
    results = json.loads(checkpoint.read_text(encoding="utf-8")) if checkpoint.exists() else {}
    jobs = [{"key": f"{p.id}:{lang}", "source": p.source_ru if lang == "ru" else TOPIC_PHRASES_EN[p.source_ru],
             "canonical": p.canonical_sr} for p in TOPIC_PHRASES for lang in ("ru", "en")]
    if args.manual:
        jobs.extend({"key": f"manual:{p['id']}", "source": p["source_ru"],
                     "canonical": p["intended_sr_variants_json"][0]}
                    for p in json.loads(args.manual.read_text(encoding="utf-8")))
    def prepare(job):
        provider = OpenAIStructuredProvider(get_settings())
        result = provider.prepare_phrase(source_ru=job["source"], canonical_sr=job["canonical"])
        hints = aligned_word_hints(job["source"], job["canonical"], [h.model_dump() for h in result.word_hints])
        if not hints:
            raise RuntimeError("No aligned hints")
        return {**job, "hints": hints}
    pending = [job for job in jobs if job["key"] not in results]
    if args.limit:
        pending = pending[:args.limit]
    failures = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(prepare, job): job["key"] for job in pending}
        for future in as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception as exc:
                failures.append(key)
                print(f"FAILED {key}: {type(exc).__name__}", flush=True)
            checkpoint.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"Prepared {len(results)}/{len(jobs)}: {key}", flush=True)
    if failures:
        raise SystemExit(f"Incomplete audit: {len(failures)} failures; rerun resumes checkpoint")
    if args.export:
        if any(job["key"] not in results for job in jobs):
            raise SystemExit("Refusing partial export")
        for job in jobs:
            row = results[job["key"]]
            if row["source"] != job["source"] or row["canonical"] != job["canonical"]:
                raise SystemExit("Checkpoint does not match current source/canonical")
            row["hints"] = aligned_word_hints(row["source"], row["canonical"], row["hints"])
            if not row["hints"]:
                raise SystemExit("Refusing empty dictionary")
        checkpoint.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        ru = {p.id: results[f"{p.id}:ru"]["hints"] for p in TOPIC_PHRASES}
        en = {TOPIC_PHRASES_EN[p.source_ru]: {h["word_ru"]: h["translation_sr"] for h in results[f"{p.id}:en"]["hints"]} for p in TOPIC_PHRASES}
        for name, variable, data in [("topic_phrase_hints.py", "TOPIC_PHRASE_HINTS", ru),
                                     ("topic_phrase_hints_en.py", "ENGLISH_WORD_HINTS", en)]:
            (ROOT / "backend/app/db" / name).write_text(
                '"""Audited short canonical fragments; regenerate with scripts/audit_context_hints.py."""\n\n'
                + variable + " = " + pformat(data, width=110, sort_dicts=False) + "\n", encoding="utf-8")
        from app.db.misc_phrases import MISC_PHRASES
        for p in MISC_PHRASES:
            p["hints_ru"] = {h["word_ru"]: h["translation_sr"] for h in ru[p["id"]]}
            p["hints_en"] = en[p["source_en"]]
        (ROOT / "backend/app/db/misc_phrases.py").write_text(
            '"""Curated everyday Serbian phrases with short canonical hints."""\n\nMISC_PHRASES = '
            + pformat(MISC_PHRASES, width=110, sort_dicts=False) + "\n", encoding="utf-8")
        frontend = ROOT / "frontend/src/locales/phrases.en.json"
        phrases = json.loads(frontend.read_text(encoding="utf-8"))
        for p in phrases:
            p["word_hints"] = {key: {"translation_sr": value} for key, value in en[p["source_en"]].items()}
        frontend.write_text(json.dumps(phrases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Exported 210 RU + 210 EN preset dictionaries; private rows remain in artifacts.")


if __name__ == "__main__":
    main()
