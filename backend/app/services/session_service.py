from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import TrainingSession
from app.repositories import AttemptRepository, ReviewPhraseRepository, TopicPresetRepository, TrainingSessionRepository
from app.schemas import CreateSessionRequest, CreateTopicRequest, SessionResponse, TopicContext
from app.services.ai_adapter import StructuredAIProvider
from app.services.review_service import ReviewQueueEmptyError
from app.services.topic_service import TopicNotFoundError, TopicService


class SessionNotFoundError(LookupError):
    pass


class SessionCompletedError(RuntimeError):
    pass


class SessionPendingError(RuntimeError):
    pass


class SessionUnavailableError(RuntimeError):
    pass


class SessionService:
    def __init__(self, db: Session, ai: StructuredAIProvider, user_id: str) -> None:
        self.user_id = user_id
        self.repository = TrainingSessionRepository(db, user_id)
        self.attempts = AttemptRepository(db, user_id)
        self.topic_service = TopicService(TopicPresetRepository(db, user_id), ai)
        self.review_phrases = ReviewPhraseRepository(db, user_id)

    def create(self, request: CreateSessionRequest) -> SessionResponse:
        review_phrase = None
        stored_topic_id = request.topic_id
        if request.review_mode:
            self.review_phrases.activate_due(datetime.now(timezone.utc))
            if not self.review_phrases.list_active(limit=1):
                raise ReviewQueueEmptyError
            topic = TopicContext(
                id="review-phrases",
                source="custom",
                title_ru="Фразы для повторения",
                description_ru="Случайная карусель фраз до устойчивого результата.",
                normalized_prompt_context="Карусель активных фраз для повторения.",
            )
        elif request.review_phrase_id:
            self.review_phrases.activate_due(datetime.now(timezone.utc))
            review_phrase = self.review_phrases.get_owned(request.review_phrase_id)
            if review_phrase is None or review_phrase.status != "active":
                raise TopicNotFoundError(request.review_phrase_id)
            topic = TopicContext(
                id="review-phrases",
                source="custom",
                title_ru="Фразы для повторения",
                description_ru="Повторение фразы до устойчивого результата.",
                normalized_prompt_context=f"Точная фраза для повторения: {review_phrase.source_ru}",
            )
        elif request.topic_id:
            topic = self.topic_service.preset_context(request.topic_id)
        elif request.custom_topic_text:
            created_topic = self.topic_service.create_custom(CreateTopicRequest(title_ru=request.custom_topic_text))
            stored_topic_id = created_topic.id
            topic = self.topic_service.preset_context(created_topic.id)
        else:
            topic = self.topic_service.general_context()

        entity = self.repository.add(
            TrainingSession(
                user_id=self.user_id,
                topic_id=stored_topic_id,
                custom_topic_text=request.custom_topic_text,
                normalized_topic_json={
                    "topic": topic.model_dump(),
                    "session_length": request.length,
                    "review_carousel": request.review_mode,
                    "review_phrase": {
                        "id": review_phrase.id,
                        "source_ru": review_phrase.source_ru,
                        "intended_sr_variants": review_phrase.intended_sr_variants_json,
                        "word_hints": review_phrase.word_hints_json,
                        "targeted_skill_keys": review_phrase.targeted_skill_keys_json,
                        "topic_id": review_phrase.topic_id,
                        "topic_phrase_id": review_phrase.topic_phrase_id,
                    } if review_phrase else None,
                },
            )
        )
        return self._response(entity, completed_count=0)

    def get(self, session_id: str) -> SessionResponse:
        entity = self.repository.get_owned(session_id)
        if entity is None:
            raise SessionNotFoundError(session_id)
        return self._response(entity)

    @staticmethod
    def topic_snapshot(entity: TrainingSession) -> TopicContext:
        payload = entity.normalized_topic_json
        topic_payload = payload.get("topic", payload)
        return TopicContext.model_validate(topic_payload)

    def _response(self, entity: TrainingSession, *, completed_count: int | None = None) -> SessionResponse:
        return SessionResponse(
            id=entity.id,
            status=entity.status,
            level=entity.level,
            started_at=entity.started_at,
            requested_length=int(entity.normalized_topic_json.get("session_length", 20)),
            completed_count=(
                self.attempts.count_checked_exercises(entity.id)
                if completed_count is None else completed_count
            ),
            topic=self.topic_snapshot(entity),
        )
