from sqlalchemy.orm import Session

from app.models import TrainingSession
from app.db.seed import seed_catalog
from app.repositories import TopicPresetRepository
from app.repositories.catalog import TopicPhraseRepository
from app.schemas import ExerciseGenerationResult, TopicContext
from app.services.exercise_generator import ExerciseGenerator
from app.services.topic_service import TopicService
from tests.fakes import FakeAIProvider


def test_preset_topic_uses_persistent_catalog_without_ai_call(db_session: Session) -> None:
    seed_catalog(db_session)
    topic = TopicContext(
        id="bank",
        source="preset",
        title_ru="Банк",
        description_ru="Счёт, карта, документы и комиссии.",
        normalized_prompt_context="Банк; A2.",
    )
    training = TrainingSession(topic_id="bank", normalized_topic_json={"topic": topic.model_dump()})
    db_session.add(training)
    db_session.flush()
    ai = FakeAIProvider(available=True)

    exercise = ExerciseGenerator(db_session, ai).generate_next(training.id)

    assert exercise.source_ru in {phrase.source_ru for phrase in TopicPhraseRepository(db_session).list_for_topic("bank")}
    assert ai.exercise_calls == 0


def test_ai_topic_result_is_revalidated_and_identity_is_controlled(db_session: Session) -> None:
    ai = FakeAIProvider(
        available=True,
        topic_result=TopicContext(
            id="model-chosen-id",
            source="general",
            title_ru="Model title",
            description_ru="Бытовой разговор с арендодателем.",
            likely_intents=["сообщить о поломке"],
            suggested_vocabulary=["stanodavac", "popravka"],
            normalized_prompt_context="Аренда; сообщить о бытовой поломке; A2.",
        ),
    )
    service = TopicService(TopicPresetRepository(db_session), ai)

    result = service.normalize_custom("Сломалась стиральная машина")

    assert result.id.startswith("custom-")
    assert result.source == "custom"
    assert result.title_ru == "Сломалась стиральная машина"
    assert result.suggested_vocabulary == ["stanodavac", "popravka"]


def test_generator_retries_one_similar_ai_result(db_session: Session) -> None:
    topic = TopicContext(
        id="general",
        source="general",
        title_ru="Повседневные ситуации",
        description_ru="Общие ситуации.",
        normalized_prompt_context="Повседневная практика A2.",
    )
    training = TrainingSession(
        normalized_topic_json={"topic": topic.model_dump(), "session_length": 20},
    )
    db_session.add(training)
    db_session.flush()

    def result(call: int) -> ExerciseGenerationResult:
        source = "Можно оплатить картой?" if call <= 2 else "Когда открывается ближайший магазин?"
        return ExerciseGenerationResult(
            source_ru=source,
            topic_fit="Повседневная ситуация.",
            intended_sr_variants=["Mogu li da platim karticom?"],
            targeted_skills=["unknown.skill"],
            difficulty=0.4,
            novelty_signature=f"ai:{call}",
        )

    ai = FakeAIProvider(available=True, exercise_factory=result)
    generator = ExerciseGenerator(db_session, ai)
    first = generator.generate_next(training.id)
    assert first.source_ru == "Можно оплатить картой?"

    second = generator.generate_next(training.id)

    assert second.source_ru == "Когда открывается ближайший магазин?"
    assert ai.exercise_calls == 3
    assert "unknown.skill" not in second.targeted_skills


def test_generator_rejects_latin_letters_in_russian_source(db_session: Session) -> None:
    topic = TopicContext(
        id="general",
        source="general",
        title_ru="Повседневные ситуации",
        description_ru="Общие ситуации.",
        normalized_prompt_context="Повседневная практика A2.",
    )
    training = TrainingSession(normalized_topic_json={"topic": topic.model_dump(), "session_length": 10})
    db_session.add(training)
    db_session.flush()

    def result(call: int) -> ExerciseGenerationResult:
        return ExerciseGenerationResult(
            source_ru="Нужна popravka в ванной." if call == 1 else "Нужно починить кран в ванной.",
            topic_fit="Бытовая ситуация.",
            intended_sr_variants=["Treba popraviti slavinu u kupatilu."],
            difficulty=0.4,
            novelty_signature=f"mixed:{call}",
        )

    ai = FakeAIProvider(available=True, exercise_factory=result)
    exercise = ExerciseGenerator(db_session, ai).generate_next(training.id)

    assert exercise.source_ru == "Нужно починить кран в ванной."
    assert ai.exercise_calls == 2
