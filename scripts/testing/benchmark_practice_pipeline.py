"""Offline practice API timings: isolated SQLite, synthetic bytes, no external IO.

Run with .venv/Scripts/python scripts/testing/benchmark_practice_pipeline.py.
Provider delay is a controlled experiment, never a measurement of OpenAI latency.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
from pathlib import Path
import statistics
import sys
from time import perf_counter, sleep
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", type=Path, default=ROOT / "backend")
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument("--warmups", type=int, default=3)
    parser.add_argument("--provider-delay-ms", type=int, default=100)
    args = parser.parse_args()
    if not 2 <= args.runs <= 100 or not 0 <= args.warmups <= 10 or not 0 <= args.provider_delay_ms <= 1000:
        parser.error("Use runs 2..100, warmups 0..10, provider delay 0..1000 ms")
    backend = args.backend.resolve()
    if not backend.is_relative_to(ROOT) or not (backend / "app/main.py").is_file():
        parser.error("Backend must be a checkout/snapshot inside this workspace")
    out = ROOT / "artifacts/testlab/practice-pipeline" / str(uuid4())
    out.mkdir(parents=True)
    os.environ.update(APP_ENV="testlab", DATABASE_URL=f"sqlite:///{(out / 'fixture.sqlite').as_posix()}",
                      OPENAI_API_KEY="", SUPABASE_URL="", SUPABASE_PUBLISHABLE_KEY="",
                      TELEGRAM_BOT_TOKEN="", TELEGRAM_CHAT_ID="", ADMIN_EMAILS="")
    sys.path.insert(0, str(backend))
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session
    from app.api.dependencies import get_current_user
    from app.db.base import Base
    from app.db.seed import seed_catalog
    from app.db.session import create_database_engine, get_db
    from app.main import app
    from app.models import Exercise, User
    from app.request_metrics import measure_ai_call
    from app.schemas import AnswerAnalysis, TranscriptionResponse
    from app.schemas.transcriptions import TranscriptionAssistanceAnalysis
    from app.services.ai_adapter import get_ai_provider
    from app.services.transcription_adapter import get_transcription_provider
    from app.services.transcription_assistance_adapter import get_transcription_assistance_provider

    # Fail closed if any unexpected code tries to access an external provider.
    import socket
    original_connect = socket.socket.connect
    def deny_network(sock, address):
        # Windows asyncio implements its wake-up pipe using a loopback socketpair.
        if isinstance(address, tuple) and address[0] in {"127.0.0.1", "::1"}:
            return original_connect(sock, address)
        raise AssertionError("External network is forbidden in this benchmark")
    socket.socket.connect = deny_network

    class Providers:
        is_available = True
        text = ""
        calls = 0

        def wait(self):
            self.calls += 1
            with measure_ai_call():
                sleep(args.provider_delay_ms / 1000)

        def transcribe(self, **_kwargs):
            self.wait()
            return TranscriptionResponse(text=self.text)

        def analyze(self, **_kwargs):
            self.wait()
            return TranscriptionAssistanceAnalysis(acceptable_variant=True, candidates=[])

        def analyze_answer(self, **kwargs):
            self.wait()
            return AnswerAnalysis(verdict="correct", semantic_score=1, grammar_score=1,
                lexical_score=1, naturalness_score=1, fluency_score=1,
                corrected_sr=kwargs["canonical_sr"], short_feedback_ru="Synthetic feedback.",
                detailed_feedback_ru="Synthetic feedback.")

        def __getattr__(self, name):
            raise AssertionError(f"Unexpected AI operation: {name}")

    provider = Providers()
    samples = {}
    engine = create_database_engine()
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user_id = str(uuid4())
        db.add(User(id=user_id, email="benchmark@example.invalid", role="user", access_tier="premium"))
        seed_catalog(db)
        db.commit()

    def database():
        with Session(engine, expire_on_commit=False) as db:
            try:
                yield db
                db.commit()
            except Exception:
                db.rollback()
                raise

    def identity():
        with Session(engine) as db:
            return db.get(User, user_id)

    app.dependency_overrides.update({get_db: database, get_current_user: identity,
        get_ai_provider: lambda: provider, get_transcription_provider: lambda: provider,
        get_transcription_assistance_provider: lambda: provider})

    def request(client, name, method, path, expected, measured, **kwargs):
        calls = provider.calls
        start = perf_counter()
        response = client.request(method, path, **kwargs)
        elapsed = (perf_counter() - start) * 1000
        if response.status_code != expected:
            raise AssertionError(f"{name}: HTTP {response.status_code}")
        timing = {}
        for entry in response.headers["Server-Timing"].split(","):
            key, val = entry.strip().split(";", 1)
            timing[key] = float(val.split("=", 1)[1].strip('"'))
        assert int(timing["ai_calls"]) == provider.calls - calls
        if measured:
            samples.setdefault(name, []).append({"wall_ms": elapsed, **timing})
        return response.json(), elapsed

    try:
        with TestClient(app) as client:
            for index in range(-args.warmups, args.runs):
                # Alternate order to reduce drift bias. Each case starts a fresh session.
                cases = [(False, True), (True, True), (False, False), (True, False)]
                if index % 2:
                    cases.reverse()
                for assistance, exact in cases:
                    # Keep mastery/history identical across cases and avoid exhausting the catalog.
                    user_id = str(uuid4())
                    with Session(engine) as db:
                        db.add(User(id=user_id, email=f"{user_id}@example.invalid", role="user", access_tier="premium"))
                        db.commit()
                    random.seed(12345 + index)
                    measured = index >= 0
                    label = f"{'exact' if exact else 'alternative'}_assist_{'on' if assistance else 'off'}"
                    started, _ = request(client, "start_catalog", "POST", "/api/sessions/start", 201,
                        measured, json={"topic_id": "cafe", "length": 10})
                    exercise_id = started["exercise"]["id"]
                    with Session(engine) as db:
                        canonical = db.get(Exercise, exercise_id).target_hints_json["canonical_sr"]
                    provider.text = canonical if exact else canonical.rstrip(".!?") + " molim."
                    _, transcription_ms = request(client, label + "/transcription", "POST", "/api/transcriptions", 200,
                        measured, data={"exercise_id": exercise_id, "assistance_enabled": str(assistance).lower()},
                        files={"audio": ("synthetic.webm", b"synthetic-not-real-audio", "audio/webm")})
                    _, check_ms = request(client, label + "/check", "POST", "/api/attempts", 201, measured,
                        json={"exercise_id": exercise_id, "transcript_sr": provider.text, "client_request_id": str(uuid4())})
                    request(client, "next_catalog", "POST", f"/api/sessions/{started['session']['id']}/next-exercise", 201,
                        measured, json={"client_request_id": str(uuid4())})
                    if measured:
                        samples.setdefault(label + "/transcription_plus_check", []).append({"wall_ms": transcription_ms + check_ms})
    finally:
        app.dependency_overrides.clear()
        engine.dispose()

    summaries = {}
    for name, rows in samples.items():
        summaries[name] = {}
        for field in rows[0]:
            values = sorted(row[field] for row in rows)
            summaries[name][field] = {"n": len(values), "p50": round(statistics.median(values), 2),
                                     "p95": round(values[math.ceil(.95 * len(values)) - 1], 2)}
    report = {"scope": "Offline TestClient + file SQLite. Auth identity mocked; no browser/network/cold start. "
                        "Alternative AI result is synthetic, not an accuracy evaluation. No audio saved.",
              "parameters": {**vars(args), "backend": str(backend)}, "summaries": summaries, "samples": samples}
    path = out / "report.json"
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"report": str(path), "wall_ms": {k: v["wall_ms"] for k, v in summaries.items()}}, indent=2))


if __name__ == "__main__":
    main()
