"""Compare isolated review-list/counter API work; use no real auth, AI or user data."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import statistics
import sys
from time import perf_counter
from datetime import datetime, timedelta, timezone

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "artifacts" / "testlab"
FIXTURE = {
    "version": "review-catalog-v1", "active": 100, "due": 2, "other_active": 10,
    "future": 1, "undated_mastered": 1, "clock": "2026-09-30T12:00:00+00:00",
    "created": "2026-09-01T00:00:00+00:00", "topics": ["shared-a", "shared-b", "owned", "foreign", None],
    "user": "20000000-0000-0000-0000-000000000001", "other": "20000000-0000-0000-0000-000000000002",
    "source_template": "Синтетическая фраза {index}.", "answer": "Sintetička rečenica.",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", type=Path, default=ROOT / "backend")
    parser.add_argument("--label", choices=["before", "after"], required=True)
    parser.add_argument("--compare-to", type=Path)
    parser.add_argument("--warmups", type=int, default=3)
    parser.add_argument("--runs", type=int, default=20)
    args = parser.parse_args()
    backend = args.backend.resolve()
    if not backend.is_relative_to(ROOT) or not (backend / "app/main.py").is_file():
        raise ValueError("Backend snapshot must be inside this checkout")
    if not 1 <= args.warmups <= 10 or not 2 <= args.runs <= 100:
        raise ValueError("Invalid bounded sample size")
    digest = hashlib.sha256(json.dumps(FIXTURE, sort_keys=True).encode()).hexdigest()
    before = None
    if args.label == "after":
        if not args.compare_to or not args.compare_to.resolve().is_relative_to(ARTIFACTS.resolve()):
            raise ValueError("After requires a before report inside testlab artifacts")
        before = json.loads(args.compare_to.read_text(encoding="utf-8"))
        if (before["label"], before["fixture_hash"], before["runs"], before["warmups"]) != (
            "before", digest, args.runs, args.warmups,
        ):
            raise ValueError("Before/after fixtures and sample parameters must match")
    directory = ARTIFACTS / "review-catalog" / f"{args.label}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}"
    directory.mkdir(parents=True, exist_ok=False)
    os.environ.update(APP_ENV="testlab", OPENAI_API_KEY="", SUPABASE_URL="", SUPABASE_PUBLISHABLE_KEY="",
                      ADMIN_EMAILS="", DATABASE_URL=f"sqlite:///{(directory / 'unused.sqlite').as_posix()}")
    sys.path.insert(0, str(backend))
    from fastapi import Depends
    from fastapi.testclient import TestClient
    from sqlalchemy import event
    from sqlalchemy.orm import Session
    from app.api.dependencies import get_current_user
    from app.db.base import Base
    from app.db.session import create_database_engine, get_db
    from app.main import app
    from app.models import ReviewPhrase, TopicPreset, User
    from app.services.ai_adapter import get_ai_provider
    from app.services import review_service

    fixed_now = datetime.fromisoformat(FIXTURE["clock"])
    created = datetime.fromisoformat(FIXTURE["created"])

    class FixedClock(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed_now.astimezone(tz) if tz else fixed_now.replace(tzinfo=None)

    review_service.datetime = FixedClock
    engine = create_database_engine(f"sqlite:///{(directory / 'fixture.sqlite').as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        for user_id in [FIXTURE["user"], FIXTURE["other"]]:
            db.add(User(id=user_id, email=f"{user_id}@example.invalid"))
        db.flush()
        for topic in FIXTURE["topics"][:-1]:
            owner = FIXTURE["user"] if topic == "owned" else FIXTURE["other"] if topic == "foreign" else None
            db.add(TopicPreset(id=topic, title_ru=f"Synthetic {topic}", description_ru="Synthetic fixture", owner_user_id=owner))
        db.flush()
        statuses = ["active"] * FIXTURE["active"] + ["due"] * FIXTURE["due"] + ["future", "undated_mastered"]
        for index, status in enumerate(statuses + ["other"] * FIXTURE["other_active"]):
            source = FIXTURE["source_template"].format(index=index)
            db.add(ReviewPhrase(
                id=f"review-{index:04}", user_id=FIXTURE["other"] if status == "other" else FIXTURE["user"],
                source_ru=source, source_normalized=source, intended_sr_variants_json=[FIXTURE["answer"]],
                topic_id=FIXTURE["topics"][index % len(FIXTURE["topics"])],
                status="active" if status in {"active", "other"} else "mastered",
                next_review_at=(fixed_now - timedelta(days=1) if status == "due" else
                                fixed_now + timedelta(days=1) if status == "future" else None),
                created_at=created, updated_at=created + timedelta(seconds=index),
            ))
        db.commit()

    counters = {"sql": 0, "orm_objects": 0}
    event.listen(engine, "before_cursor_execute", lambda *_: counters.__setitem__("sql", counters["sql"] + 1))

    def db_override():
        with Session(engine, expire_on_commit=False) as db:
            event.listen(db, "loaded_as_persistent", lambda *_: counters.__setitem__("orm_objects", counters["orm_objects"] + 1))
            yield db
            db.commit()

    def user_override(db=Depends(get_db)):
        return db.get(User, FIXTURE["user"])

    class DisabledAI:
        is_available = False

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_user] = user_override
    app.dependency_overrides[get_ai_provider] = lambda: DisabledAI()
    scenarios = {}
    try:
        with TestClient(app) as client:
            for name, route in [
                ("legacy_list", "/api/review-phrases"),
                ("home_counter", "/api/review-phrases/summary" if args.label == "after" else "/api/review-phrases"),
            ]:
                samples = []
                payload_hash = None
                for index in range(args.warmups + args.runs):
                    counters.update(sql=0, orm_objects=0)
                    started = perf_counter()
                    response = client.get(route)
                    elapsed = (perf_counter() - started) * 1000
                    if response.status_code != 200:
                        raise RuntimeError(f"Expected 200 from synthetic {name}, got {response.status_code}")
                    body = response.json()
                    count = len(body) if isinstance(body, list) else body["phrase_count"]
                    if count != FIXTURE["active"] + FIXTURE["due"]:
                        raise RuntimeError("Review counter changed learning eligibility")
                    current_hash = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                    if payload_hash and payload_hash != current_hash:
                        raise RuntimeError("Synthetic response changed between samples")
                    payload_hash = current_hash
                    if index >= args.warmups:
                        samples.append({"wall_ms": round(elapsed, 2), "response_bytes": len(response.content), **counters})
                ordered = sorted(item["wall_ms"] for item in samples)
                scenarios[name] = {
                    "route": route, "p50_ms": round(statistics.median(ordered), 2),
                    "p95_ms": ordered[math.ceil(0.95 * len(ordered)) - 1],
                    "sql_counts": sorted({item["sql"] for item in samples}),
                    "orm_objects": sorted({item["orm_objects"] for item in samples}),
                    "response_bytes": sorted({item["response_bytes"] for item in samples}),
                    "payload_hash": payload_hash, "phrase_count": count, "samples": samples,
                }
        if before and before["scenarios"]["legacy_list"]["payload_hash"] != scenarios["legacy_list"]["payload_hash"]:
            raise RuntimeError("Legacy review response differs from baseline")
        report = {
            "label": args.label, "fixture_hash": digest, "warmups": args.warmups, "runs": args.runs,
            "environment": "Windows; fresh synthetic SQLite; TestClient; mocked identity and AI; fixed UTC clock",
            "scenarios": scenarios,
        }
        output = directory / "report.json"
        output.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps({"artifact": str(output), **{key: value for key, value in report.items() if key != "scenarios"},
                          "scenarios": {name: {key: value for key, value in item.items() if key != "samples"} for name, item in scenarios.items()}}))
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


if __name__ == "__main__":
    main()
