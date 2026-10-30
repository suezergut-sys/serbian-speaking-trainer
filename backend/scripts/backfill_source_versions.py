"""Prepare bilingual versions of existing personal phrases; dry run by default."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file')
    parser.add_argument('--owner-email')
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    if args.env_file:
        from dotenv import load_dotenv
        load_dotenv(args.env_file, override=True)
    from sqlalchemy.orm import Session
    from app.db.session import engine
    from app.repositories.source_versions import SourceVersionRepository
    from app.services.ai_adapter import get_ai_provider
    from app.services.source_versions import read_versions, preparation_versions, version_payload, SourceLanguageUnavailableError

    with Session(engine) as db:
        repo = SourceVersionRepository(db, '')
        phrases = repo.personal_phrases(args.owner_email)
        pending = [phrase for phrase in phrases if read_versions(phrase.source_versions_json or {}, phrase.source_ru, next(iter(phrase.intended_sr_variants_json), '')) is None]
        print(f'Personal phrases: {len(phrases)}; missing bilingual versions: {len(pending)}; execute: {args.execute}')
        if not args.execute:
            return
        ai = get_ai_provider()
        for index, phrase in enumerate(pending, 1):
            source, canonical = phrase.source_ru, next(iter(phrase.intended_sr_variants_json), '')
            try:
                result = preparation_versions(ai, source, canonical)
                repo.save_phrase(phrase, version_payload(source, canonical, result.source_versions))
                db.commit()
            except SourceLanguageUnavailableError:
                db.rollback()
                raise SystemExit(f'Validated translation unavailable at item {index}; completed items are preserved; safe to retry') from None
            print(f'Prepared {index}/{len(pending)}; original, Serbian variants and learning progress preserved')


if __name__ == '__main__':
    main()
