"""Compare local testlab backend timings from the same SQLite fixture snapshot.

Run once on the original backend, restore the same isolated SQLite snapshot,
then run again on the changed backend with --label after --compare-to BEFORE.json.
The script never resets a database and writes numeric measurements only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
import statistics
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

import httpx

from testlab import ARTIFACTS, AUTH_PORT, API_PORT, BACKEND, load_credentials, ensure_local_configuration


AUTH_URL = f"http://127.0.0.1:{AUTH_PORT}"
API_URL = f"http://127.0.0.1:{API_PORT}"
DATABASE_URL = "sqlite:///../artifacts/testlab/testlab.sqlite3"
DATABASE_PATH = ARTIFACTS / "testlab.sqlite3"
TABLES = (
    "users", "topic_presets", "topic_phrases", "skills", "learner_skills",
    "attempts", "review_phrases", "training_sessions", "exercises",
)
FIELDS = ("wall_ms", "total_ms", "auth_ms", "user_sync_ms", "db_ms", "db_queries", "ai_ms", "ai_calls", "response_bytes")


def fixture_snapshot() -> dict[str, object]:
    """Hash logical SQLite contents without exporting any row or user text."""
    if not DATABASE_PATH.is_file():
        raise RuntimeError("The isolated testlab database is missing")
    with sqlite3.connect(f"file:{DATABASE_PATH.resolve().as_posix()}?mode=ro", uri=True) as db:
        db.execute("PRAGMA query_only=ON")
        counts = {table: int(db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]) for table in TABLES}
        digest = hashlib.sha256()
        for statement in db.iterdump():
            digest.update(statement.encode("utf-8"))
            digest.update(b"\n")
    return {"row_counts": counts, "logical_sha256": digest.hexdigest()}


def parse_server_timing(header: str) -> dict[str, float | int]:
    values: dict[str, float | int] = {}
    for metric in header.split(","):
        name, separator, raw = metric.strip().partition(";")
        if not separator:
            continue
        if raw.startswith("dur="):
            values[f"{name}_ms"] = float(raw.removeprefix("dur="))
        elif raw.startswith("desc="):
            values[name] = int(raw.removeprefix("desc=").strip('"'))
    expected = set(FIELDS) - {"wall_ms", "response_bytes"}
    if not expected <= values.keys():
        raise RuntimeError("The backend did not return the required numeric Server-Timing fields")
    return values


def summary(samples: list[dict[str, float | int]]) -> dict[str, dict[str, float | int]]:
    result: dict[str, dict[str, float | int]] = {}
    for field in FIELDS:
        ordered = sorted(sample[field] for sample in samples)
        result[field] = {
            "min": ordered[0],
            "p50": round(statistics.median(ordered), 2),
            "p95": ordered[math.ceil(0.95 * len(ordered)) - 1],
            "max": ordered[-1],
        }
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", choices=("before", "after"), required=True)
    parser.add_argument("--compare-to", type=Path, help="Before JSON under artifacts/testlab; required for after")
    parser.add_argument("--month", default=datetime.now(timezone.utc).strftime("%Y-%m"))
    parser.add_argument("--warmups", type=int, default=3)
    parser.add_argument("--runs", type=int, default=20)
    args = parser.parse_args()
    if args.warmups < 1 or args.runs < 2:
        parser.error("At least one warmup and two measured runs are required")
    if args.label == "after" and args.compare_to is None:
        parser.error("--compare-to is required for after")
    try:
        datetime.strptime(args.month, "%Y-%m")
    except ValueError:
        parser.error("--month must be YYYY-MM")
    return args


def main() -> None:
    args = parse_args()
    ensure_local_configuration(AUTH_URL, DATABASE_URL)
    if (BACKEND / "../artifacts/testlab/testlab.sqlite3").resolve() != DATABASE_PATH.resolve():
        raise RuntimeError("Unexpected testlab database path")

    initial_fixture = fixture_snapshot()
    comparison = None
    if args.compare_to is not None:
        comparison_path = args.compare_to.resolve()
        if not comparison_path.is_relative_to(ARTIFACTS.resolve()):
            raise ValueError("Comparison file must be under artifacts/testlab")
        comparison = json.loads(comparison_path.read_text(encoding="utf-8"))
        if comparison.get("label") != "before":
            raise ValueError("Comparison artifact must be a before run")
        if comparison.get("fixture_before") != initial_fixture:
            raise ValueError("SQLite contents differ from the before run; restore its fixture snapshot")
        if (comparison.get("month"), comparison.get("warmups"), comparison.get("runs")) != (
            args.month, args.warmups, args.runs,
        ):
            raise ValueError("Month, warmups, and runs must match the before run")

    credentials = load_credentials()
    scenarios = (
        ("topics", "GET", "/api/topics", None, 200),
        ("start", "POST", "/api/sessions/start", {"topic_id": "cafe", "length": 10}, 201),
        ("monthly", "GET", f"/api/statistics/monthly?month={args.month}&utc_offset_minutes=180", None, 200),
    )
    results: dict[str, object] = {}
    with httpx.Client(timeout=10) as client:
        auth = client.post(
            f"{AUTH_URL}/auth/v1/token?grant_type=password",
            json={"email": credentials.email, "password": credentials.password},
        )
        if auth.status_code != 200:
            raise RuntimeError(f"Local testlab authentication failed with status {auth.status_code}")
        token = auth.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        for name, method, path, body, expected_status in scenarios:
            samples: list[dict[str, float | int]] = []
            for index in range(args.warmups + args.runs):
                started = perf_counter()
                response = client.request(method, API_URL + path, headers=headers, json=body)
                wall_ms = round((perf_counter() - started) * 1000, 2)
                if response.status_code != expected_status:
                    raise RuntimeError(f"{name} returned status {response.status_code}")
                timing = parse_server_timing(response.headers.get("Server-Timing", ""))
                if timing["ai_calls"] != 0:
                    raise RuntimeError("Benchmark unexpectedly reached an AI provider")
                if index >= args.warmups:
                    samples.append({"wall_ms": wall_ms, "response_bytes": len(response.content), **timing})
            results[name] = {"method": method, "path": path, "status": expected_status,
                             "summary": summary(samples), "samples": samples}

    report = {
        "label": args.label,
        "captured_at_utc": datetime.now(timezone.utc).isoformat(),
        "environment": "Windows localhost, isolated SQLite testlab, local auth fixture, fake AI provider, serial requests",
        "month": args.month,
        "warmups": args.warmups,
        "runs": args.runs,
        "fixture_before": initial_fixture,
        "fixture_after": fixture_snapshot(),
        "metric_scope": "wall includes local client/network; total is backend HTTP; db is SQL cursor execution; ai is OpenAI SDK time",
        "scenarios": results,
    }
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    output = ARTIFACTS / f"backend-{args.label}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"artifact": str(output), "summaries": {name: data["summary"] for name, data in results.items()}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
