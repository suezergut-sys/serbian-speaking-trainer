"""Pair monthly statistics ORM baseline and column projection on one synthetic SQLite fixture."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import statistics
import sys
from time import perf_counter

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
FIXTURE = {"attempts": 800, "mastered": 150, "other_attempts": 40, "other_mastered": 20,
           "month": "2026-09", "utc_offset_minutes": 180}
USER_ID = "30000000-0000-0000-0000-000000000001"
OTHER_ID = "30000000-0000-0000-0000-000000000002"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--warmups", type=int, default=3)
    parser.add_argument("--runs", type=int, default=20)
    args = parser.parse_args()
    if not 0 <= args.warmups <= 10 or not 2 <= args.runs <= 100:
        raise ValueError("Sample counts must be bounded")

    os.environ.update(APP_ENV="testlab", OPENAI_API_KEY="", SUPABASE_URL="",
                      SUPABASE_PUBLISHABLE_KEY="", ADMIN_EMAILS="", DATABASE_URL="sqlite:///:memory:")
    sys.path.insert(0, str(BACKEND))

    from fastapi.testclient import TestClient
    from sqlalchemy import event, select
    from sqlalchemy.orm import Session
    from app.api.dependencies import get_current_user
    from app.db.base import Base
    from app.db.session import create_database_engine, get_db
    from app.main import app
    from app.models import Attempt, Exercise, ReviewPhrase, TrainingSession, User
    from app.repositories.training import AttemptRepository, ReviewPhraseRepository
    from app.services.ai_adapter import get_ai_provider
    from tests.fakes import FakeAIProvider

    engine = create_database_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        users = [User(id=USER_ID, email="benchmark@example.invalid"),
                 User(id=OTHER_ID, email="benchmark-other@example.invalid")]
        db.add_all(users)
        db.flush()
        exercises = []
        for user in users:
            training_session = TrainingSession(user_id=user.id, normalized_topic_json={})
            db.add(training_session)
            db.flush()
            exercise = Exercise(session_id=training_session.id, source_ru="Синтетическая фраза")
            db.add(exercise)
            db.flush()
            exercises.append(exercise)
        for user_index, count in enumerate((FIXTURE["attempts"], FIXTURE["other_attempts"])):
            for index in range(count):
                db.add(Attempt(
                    exercise_id=exercises[user_index].id,
                    transcript_sr="Synthetic transcript, no recorded audio",
                    analysis_json={"synthetic": "x" * 300}, timings_json={"duration_ms": 2500},
                    overall_score=0.95 if index % 3 == 0 else 0.7,
                    created_at=datetime(2026, 9, index % 28 + 1, 12, tzinfo=timezone.utc),
                ))
        for user_index, count in enumerate((FIXTURE["mastered"], FIXTURE["other_mastered"])):
            for index in range(count):
                db.add(ReviewPhrase(
                    user_id=users[user_index].id, source_ru=f"Synthetic phrase {index}",
                    source_normalized=f"synthetic {index}", status="mastered",
                    intended_sr_variants_json=["Sintetička rečenica"],
                    mastered_at=datetime(2026, 9, index % 28 + 1, 12, tzinfo=timezone.utc),
                ))
        db.commit()
    current_user = User(id=USER_ID, email="benchmark@example.invalid")

    def legacy_attempts(self, start, end):
        statement = (
            select(Attempt)
            .join(Exercise, Exercise.id == Attempt.exercise_id)
            .join(TrainingSession, TrainingSession.id == Exercise.session_id)
            .where(TrainingSession.user_id == self.user_id, Attempt.created_at >= start, Attempt.created_at < end)
            .order_by(Attempt.created_at)
        )
        return list(self.session.scalars(statement))

    def legacy_mastered(self, start, end):
        statement = (
            select(ReviewPhrase)
            .where(ReviewPhrase.user_id == self.user_id,
                   ReviewPhrase.mastered_at >= start, ReviewPhrase.mastered_at < end)
            .order_by(ReviewPhrase.mastered_at)
        )
        return [phrase.mastered_at for phrase in self.session.scalars(statement)]

    projected_attempts = AttemptRepository.list_created_between
    projected_mastered = ReviewPhraseRepository.list_mastered_between
    counters = {"sql_count": 0, "sql_text_bytes": 0, "orm_rows": Counter()}

    def capture_sql(_connection, _cursor, statement, _parameters, _context, _executemany):
        counters["sql_count"] += 1
        counters["sql_text_bytes"] += len(statement.encode("utf-8"))

    event.listen(engine, "before_cursor_execute", capture_sql)

    def db_override():
        with Session(engine) as db:
            event.listen(db, "loaded_as_persistent",
                         lambda _session, instance: counters["orm_rows"].update([type(instance).__name__]))
            yield db

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_ai_provider] = lambda: FakeAIProvider()
    samples = {"legacy_orm": [], "column_projection": []}
    payload_hashes = set()
    url = f"/api/statistics/monthly?month={FIXTURE['month']}&utc_offset_minutes={FIXTURE['utc_offset_minutes']}"
    try:
        with TestClient(app) as client:
            for index in range(args.warmups + args.runs):
                for label in (("legacy_orm", "column_projection") if index % 2 == 0 else
                              ("column_projection", "legacy_orm")):
                    AttemptRepository.list_created_between = legacy_attempts if label == "legacy_orm" else projected_attempts
                    ReviewPhraseRepository.list_mastered_between = legacy_mastered if label == "legacy_orm" else projected_mastered
                    counters.update(sql_count=0, sql_text_bytes=0, orm_rows=Counter())
                    started = perf_counter()
                    response = client.get(url)
                    wall_ms = (perf_counter() - started) * 1000
                    if response.status_code != 200:
                        raise RuntimeError(f"Statistics request failed: {response.status_code}")
                    body = response.json()
                    if body["total_phrases"] != FIXTURE["attempts"] or body["mastered_phrases"] != FIXTURE["mastered"]:
                        raise RuntimeError("Statistics lost tenant isolation or fixture rows")
                    payload_hashes.add(hashlib.sha256(response.content).hexdigest())
                    if index >= args.warmups:
                        samples[label].append({
                            "wall_ms": round(wall_ms, 3), "sql_count": counters["sql_count"],
                            "sql_text_bytes": counters["sql_text_bytes"],
                            "orm_rows": dict(counters["orm_rows"]),
                            "request_url_bytes": len(str(response.request.url).encode("utf-8")),
                            "response_bytes": len(response.content),
                        })
    finally:
        AttemptRepository.list_created_between = projected_attempts
        ReviewPhraseRepository.list_mastered_between = projected_mastered
        app.dependency_overrides.clear()
        engine.dispose()

    if len(payload_hashes) != 1:
        raise RuntimeError("Legacy and projected HTTP responses differ")
    summary = {}
    for label, rows in samples.items():
        elapsed = sorted(row["wall_ms"] for row in rows)
        stable = {}
        for key in ("sql_count", "sql_text_bytes", "orm_rows", "request_url_bytes", "response_bytes"):
            values = {json.dumps(row[key], sort_keys=True) for row in rows}
            if len(values) != 1:
                raise RuntimeError(f"{key} changed between {label} samples")
            stable[key] = json.loads(next(iter(values)))
        summary[label] = {
            "p50_ms": round(statistics.median(elapsed), 3),
            "p95_ms": elapsed[math.ceil(0.95 * len(elapsed)) - 1],
            **stable,
        }
    print(json.dumps({
        "fixture": FIXTURE, "warmups": args.warmups, "runs_per_variant": args.runs,
        "payload_sha256": next(iter(payload_hashes)),
        "measurement": "SQLite in-memory, paired alternating order; SQL text bytes exclude bound parameters and protocol overhead; ORM rows count loaded entities",
        "summary": summary,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
