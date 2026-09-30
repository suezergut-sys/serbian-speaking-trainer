"""Measure a local writer while synthetic analysis waits; never use an external DB/AI."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
from threading import Event
from time import perf_counter

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "artifacts" / "testlab"
FIXTURE = {"version": "attempt-lock-v2", "user": "10000000-0000-0000-0000-000000000001",
           "session": "10000000-0000-0000-0000-000000000002", "exercise": "10000000-0000-0000-0000-000000000003",
           "request": "10000000-0000-0000-0000-000000000004", "length": 10,
           "source": "Я говорю медленно.", "answer": "Govorim polako.", "daily_limit": 10}


def local_backend(value: str) -> Path:
    path = Path(value).resolve()
    if not path.is_relative_to(ROOT) or not (path / "app" / "services" / "attempt_service.py").is_file():
        raise ValueError("Backend must be a checkout/snapshot inside this workspace")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", default=str(ROOT / "backend"))
    parser.add_argument("--label", choices=["before", "after"], required=True)
    parser.add_argument("--compare-to", type=Path)
    parser.add_argument("--warmups", type=int, default=3)
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument("--mock-wait-ms", type=int, default=1000)
    args = parser.parse_args()
    if not 1 <= args.runs <= 100 or not 0 <= args.warmups <= 10 or not 100 <= args.mock_wait_ms <= 5000:
        raise ValueError("Invalid bounded sample parameters")
    fixture_hash = hashlib.sha256(json.dumps(FIXTURE, sort_keys=True).encode()).hexdigest()
    if args.label == "after":
        if not args.compare_to or not args.compare_to.resolve().is_relative_to(ARTIFACTS.resolve()):
            raise ValueError("After requires a before report under artifacts/testlab")
        before = json.loads(args.compare_to.read_text(encoding="utf-8"))
        if (before["label"], before["fixture_hash"], before["runs"], before["warmups"], before["mock_wait_ms"]) != (
                "before", fixture_hash, args.runs, args.warmups, args.mock_wait_ms):
            raise ValueError("Before/after parameters and fixtures must match")
    backend = local_backend(args.backend)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    directory = ARTIFACTS / "attempt-lock" / f"{args.label}-{stamp}"
    directory.mkdir(parents=True, exist_ok=False)
    os.environ.update(APP_ENV="testlab", DATABASE_URL=f"sqlite:///{(directory / 'unused.sqlite').as_posix()}",
                      OPENAI_API_KEY="", SUPABASE_URL="", SUPABASE_PUBLISHABLE_KEY="", ADMIN_EMAILS="",
                      FREE_DAILY_PHRASE_LIMIT=str(FIXTURE["daily_limit"]))
    sys.path.insert(0, str(backend))
    from sqlalchemy import func, select
    from sqlalchemy.orm import Session
    from app.db.base import Base
    from app.db.session import create_database_engine
    from app.models import Attempt, Exercise, TrainingSession, User
    from app.repositories.users import UserRepository
    from app.schemas import AnswerAnalysis, CreateAttemptRequest
    from app.services.attempt_service import AttemptService

    samples = []
    for index in range(args.warmups + args.runs):
        engine = create_database_engine(f"sqlite:///{(directory / f'run-{index}.sqlite').as_posix()}")
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            db.add(User(id=FIXTURE["user"], email="benchmark@example.invalid", role="user", access_tier="free"))
            db.flush()
            db.add(TrainingSession(id=FIXTURE["session"], user_id=FIXTURE["user"], normalized_topic_json={"session_length": FIXTURE["length"]}))
            db.flush()
            db.add(Exercise(id=FIXTURE["exercise"], session_id=FIXTURE["session"], source_ru=FIXTURE["source"],
                            target_hints_json={}, generation_meta_json={}))
            db.commit()
        entered = Event()
        release = Event()
        state = {}

        class WaitingAI:
            is_available = True

            def __init__(self, db):
                self.db = db

            def analyze_answer(self, **_kwargs):
                state["transaction_open_during_ai"] = self.db.in_transaction()
                entered.set()
                if not release.wait(10):
                    raise RuntimeError("Synthetic analysis release timed out")
                return AnswerAnalysis(verdict="correct", semantic_score=1, grammar_score=1, lexical_score=1,
                                      naturalness_score=1, fluency_score=1, corrected_sr=FIXTURE["answer"],
                                      short_feedback_ru="Синтетическая проверка.", detailed_feedback_ru="Синтетическая проверка.")

        def analyze():
            with Session(engine, expire_on_commit=False) as db:
                user = db.get(User, FIXTURE["user"])
                result = AttemptService(db, WaitingAI(db), user).create(CreateAttemptRequest(
                    exercise_id=FIXTURE["exercise"], client_request_id=FIXTURE["request"], transcript_sr=FIXTURE["answer"]))
                db.commit()
                return result.id

        def write():
            started = perf_counter()
            with Session(engine, expire_on_commit=False) as db:
                UserRepository(db).lock(FIXTURE["user"])
                db.commit()
            return (perf_counter() - started) * 1000

        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                attempt = pool.submit(analyze)
                if not entered.wait(10):
                    attempt.result(timeout=1)
                    raise RuntimeError("Synthetic AI was not reached")
                writer = pool.submit(write)
                # Keep analysis paused for the configured window; observe a real independent writer.
                release.wait(args.mock_wait_ms / 1000)
                state["writer_finished_during_ai"] = writer.done()
                release.set()
                writer_ms = writer.result(timeout=10)
                attempt.result(timeout=10)
            with Session(engine) as db:
                count = db.scalar(select(func.count()).select_from(Attempt))
                if count != 1:
                    raise RuntimeError("Unexpected saved attempt count")
            if index >= args.warmups:
                samples.append({"writer_ms": round(writer_ms, 2), **state})
        finally:
            release.set()
            engine.dispose()
    ordered = sorted(item["writer_ms"] for item in samples)
    report = {"label": args.label, "fixture_hash": fixture_hash, "runs": args.runs, "warmups": args.warmups,
              "mock_wait_ms": args.mock_wait_ms, "environment": "Windows, fresh file SQLite per run, synthetic AI, two threads",
              "writer_p50_ms": ordered[(len(ordered) + 1) // 2 - 1],
              "writer_p95_ms": ordered[(95 * len(ordered) + 99) // 100 - 1],
              "writer_finished_during_ai": sum(item["writer_finished_during_ai"] for item in samples),
              "open_transactions_during_ai": sum(item["transaction_open_during_ai"] for item in samples), "samples": samples}
    output = directory / "report.json"
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"artifact": str(output), **{key: value for key, value in report.items() if key != "samples"}}))


if __name__ == "__main__":
    main()
