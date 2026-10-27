"""Dry-run by default. Apply a reviewed private manifest, saving rollback evidence."""
import argparse
from collections import Counter
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy.orm import Session
from app.config import get_settings
from app.db.session import create_database_engine
from app.services.hint_repair import HintRepair, repair_hint_snapshots


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path, help="Private reviewed audit checkpoint")
    parser.add_argument("--journal", type=Path, required=True, help="New ignored artifacts/*.json path")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    journal = args.journal.resolve()
    if not journal.is_relative_to(ROOT / "artifacts") or journal.exists():
        raise SystemExit("Journal must be a new private file under artifacts/")
    data = json.loads(args.manifest.read_text(encoding="utf-8"))
    personal = {key.removeprefix("manual:"): HintRepair.model_validate({
        field: row[field] for field in ("source", "canonical", "hints")})
        for key, row in data.items() if key.startswith("manual:")}
    engine = create_database_engine(get_settings().database_url)
    try:
        with Session(engine) as db:
            changes = repair_hint_snapshots(db, personal, apply=args.apply)
            journal.parent.mkdir(parents=True, exist_ok=True)
            journal.write_text(json.dumps(changes, ensure_ascii=False, indent=2), encoding="utf-8")
            if args.apply:
                db.commit()
            else:
                db.rollback()
        print(json.dumps({"applied": args.apply, "changes": dict(Counter(c["table"] for c in changes))}))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
