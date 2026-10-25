from __future__ import annotations

from hashlib import sha256

from pydantic import ValidationError

from app.models import TopicPreset
from app.repositories import TopicPresetRepository, UserRepository
from app.repositories.custom_content import CustomContentRepository
from app.services.custom_content_policy import CustomContentError, MAX_CUSTOM_TOPICS
from app.schemas import CreateTopicRequest, TopicContext, TopicListItem
from app.schemas.topics import TopicTitleTranslation
from app.services.ai_adapter import AIServiceError, StructuredAIProvider


class TopicNotFoundError(LookupError):
    pass


class TopicService:
    def __init__(self, repository: TopicPresetRepository, ai: StructuredAIProvider) -> None:
        self.repository = repository
        self.ai = ai

    def list_presets(self) -> list[TopicListItem]:
        counts = self.repository.phrase_counts()
        custom_counts = CustomContentRepository(self.repository.session, self.repository.user_id).phrase_counts()
        return [
            TopicListItem(
                id=topic.id,
                title_ru=topic.title_ru,
                title_en=topic.title_en,
                description_ru=topic.description_ru,
                likely_intents=topic.intents_json,
                suggested_vocabulary=topic.vocabulary_json,
                is_custom=topic.is_custom,
                phrase_count=counts.get(topic.id, 0),
                custom_phrase_count=custom_counts.get(topic.id, 0),
            )
            for topic in self.repository.list_enabled()
        ]

    def create_custom(self, request: CreateTopicRequest) -> TopicListItem:
        title = " ".join(request.title_ru.split())
        topic_id = self._custom_id(title, self.repository.user_id)
        topic = self.repository.get_visible(topic_id)
        if topic is None:
            if CustomContentRepository(self.repository.session, self.repository.user_id).topic_count() >= MAX_CUSTOM_TOPICS:
                raise CustomContentError("custom_topic_limit")
            try:
                translated = TopicTitleTranslation.model_validate(self.ai.translate_topic_title(title))
            except (AIServiceError, ValidationError) as exc:
                raise CustomContentError("topic_translation_unavailable", status=503) from exc
            # The AI call happens before acquiring the account write lock.
            UserRepository(self.repository.session).lock(self.repository.user_id)
            topic = self.repository.get_visible(topic_id)
            if topic is not None:
                return self._list_item(topic)
            if CustomContentRepository(self.repository.session, self.repository.user_id).topic_count() >= MAX_CUSTOM_TOPICS:
                raise CustomContentError("custom_topic_limit")
            topic = self.repository.add(
                TopicPreset(
                    id=topic_id,
                    owner_user_id=self.repository.user_id,
                    title_ru=title if translated.source_language == "ru" else translated.translated_title,
                    title_en=translated.translated_title if translated.source_language == "ru" else title,
                    description_ru="Пользовательская тема без фраз.",
                    intents_json=[],
                    vocabulary_json=[],
                    is_custom=True,
                )
            )
        return self._list_item(topic)

    def _list_item(self, topic: TopicPreset) -> TopicListItem:
        return TopicListItem(
            id=topic.id,
            title_ru=topic.title_ru,
            title_en=topic.title_en,
            description_ru=topic.description_ru,
            likely_intents=topic.intents_json,
            suggested_vocabulary=topic.vocabulary_json,
            is_custom=topic.is_custom,
            phrase_count=self.repository.phrase_counts().get(topic.id, 0),
            custom_phrase_count=CustomContentRepository(self.repository.session, self.repository.user_id).phrase_count(topic.id),
        )

    def delete_custom(self, topic_id: str) -> None:
        UserRepository(self.repository.session).lock(self.repository.user_id)
        topic = self.repository.get_visible(topic_id)
        if topic is None or not topic.is_custom or topic.owner_user_id != self.repository.user_id:
            raise TopicNotFoundError(topic_id)
        CustomContentRepository(self.repository.session, self.repository.user_id).delete_topic(topic)

    def preset_context(self, topic_id: str) -> TopicContext:
        topic = self.repository.get_visible(topic_id)
        if topic is None or not topic.enabled:
            raise TopicNotFoundError(topic_id)
        return self._from_preset(topic)

    def normalize_custom(self, text: str) -> TopicContext:
        clean_text = " ".join(text.split())
        if self.ai.is_available:
            try:
                normalized = TopicContext.model_validate(self.ai.normalize_topic(clean_text))
                return normalized.model_copy(
                    update={
                        "id": self._custom_id(clean_text, self.repository.user_id),
                        "source": "custom",
                        "title_ru": clean_text[:160],
                        "target_level": "A2",
                    }
                )
            except AIServiceError:
                pass
        return self._fallback_custom(clean_text, self.repository.user_id)

    @staticmethod
    def general_context() -> TopicContext:
        return TopicContext(
            id="general",
            source="general",
            title_ru="Повседневные ситуации",
            description_ru="Общие разговорные ситуации уровня A2.",
            likely_intents=["попросить", "уточнить", "объяснить", "рассказать"],
            suggested_vocabulary=[],
            normalized_prompt_context="Повседневные бытовые ситуации; чередовать места, лица и коммуникативные намерения.",
        )

    @staticmethod
    def _from_preset(topic: TopicPreset) -> TopicContext:
        return TopicContext(
            id=topic.id,
            source="custom" if topic.is_custom else "preset",
            title_ru=topic.title_ru,
            title_en=topic.title_en,
            description_ru=topic.description_ru,
            likely_intents=topic.intents_json,
            suggested_vocabulary=topic.vocabulary_json,
            normalized_prompt_context=(
                f"Тема: {topic.title_ru}. {topic.description_ru} "
                f"Намерения: {', '.join(topic.intents_json)}. "
                f"Лексика-кандидаты: {', '.join(topic.vocabulary_json)}. Уровень A2."
            ),
        )

    @classmethod
    def _fallback_custom(cls, text: str, user_id: str) -> TopicContext:
        return TopicContext(
            id=cls._custom_id(text, user_id),
            source="custom",
            title_ru=text[:160],
            description_ru=f"Разговорная практика по теме: {text}",
            likely_intents=["объяснить ситуацию", "задать вопрос", "уточнить детали"],
            suggested_vocabulary=[],
            normalized_prompt_context=f"Пользовательская тема: {text}. Только частотная лексика уровня A2.",
        )

    @staticmethod
    def _custom_id(text: str, user_id: str) -> str:
        digest = sha256(f"{user_id}:{text.casefold()}".encode("utf-8")).hexdigest()[:12]
        return f"custom-{digest}"
