from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models import Exercise, ReviewPhrase, TopicPreset, User
from app.repositories import ReviewPhraseRepository


class SourceVersionRepository:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.phrases = ReviewPhraseRepository(db, user_id)

    def exercise_phrase(self, exercise: Exercise) -> ReviewPhrase | None:
        phrase_id = exercise.generation_meta_json.get('review_phrase_id')
        return self.phrases.get_owned(phrase_id) if phrase_id else None

    def cache(self, exercise: Exercise, phrase: ReviewPhrase | None, payload: dict) -> None:
        exercise.target_hints_json = {**exercise.target_hints_json, 'source_versions': payload}
        if phrase is not None and phrase.source_ru == exercise.source_ru and next(iter(phrase.intended_sr_variants_json), '') == payload['canonical_sr']:
            phrase.source_versions_json = payload
        self.db.flush()

    def personal_phrases(self, owner_email: str | None = None) -> list[ReviewPhrase]:
        query = select(ReviewPhrase).join(TopicPreset, TopicPreset.id == ReviewPhrase.topic_id).where(
            TopicPreset.is_custom.is_(True), ReviewPhrase.topic_phrase_id.is_(None), TopicPreset.owner_user_id == ReviewPhrase.user_id)
        if owner_email:
            query = query.join(User, User.id == ReviewPhrase.user_id).where(func.lower(User.email) == owner_email.casefold())
        return list(self.db.scalars(query.order_by(ReviewPhrase.id)))

    def save_phrase(self, phrase: ReviewPhrase, payload: dict) -> None:
        self.db.refresh(phrase)
        if phrase.source_ru != payload['source'] or next(iter(phrase.intended_sr_variants_json), '') != payload['canonical_sr']:
            raise RuntimeError('Phrase changed during translation; retry without overwriting it')
        phrase.source_versions_json = payload
        self.db.flush()
