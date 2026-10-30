from collections.abc import Callable

from app.schemas import AnswerAnalysis, ExerciseGenerationResult, PhrasePreparation, TopicContext, TranscriptionResponse
from app.schemas.topics import TopicTitleTranslation
from app.schemas.transcriptions import TranscriptionAssistanceAnalysis


class FakeAIProvider:
    def __init__(
        self,
        *,
        available: bool = False,
        topic_result: TopicContext | None = None,
        exercise_factory: Callable[[int], ExerciseGenerationResult] | None = None,
        analysis_result: AnswerAnalysis | None = None,
        phrase_result: PhrasePreparation | None = None,
    ) -> None:
        self._available = available
        self.topic_result = topic_result
        self.exercise_factory = exercise_factory
        self.analysis_result = analysis_result
        self.phrase_result = phrase_result
        self.exercise_calls = 0
        self.analysis_calls = 0

    @property
    def is_available(self) -> bool:
        return self._available

    def translate_topic_title(self, text: str) -> TopicTitleTranslation:
        return TopicTitleTranslation(source_language="ru", translated_title="Custom topic")

    def normalize_topic(self, text: str) -> TopicContext:
        if self.topic_result is None:
            raise AssertionError("Unexpected normalize_topic call")
        return self.topic_result

    def generate_exercise(self, **_kwargs) -> ExerciseGenerationResult:
        self.exercise_calls += 1
        if self.exercise_factory is None:
            raise AssertionError("Unexpected generate_exercise call")
        return self.exercise_factory(self.exercise_calls)

    def analyze_answer(self, **_kwargs) -> AnswerAnalysis:
        self.analysis_calls += 1
        if self.analysis_result is None:
            raise AssertionError("Unexpected analyze_answer call")
        return self.analysis_result

    def prepare_phrase(self, **_kwargs) -> PhrasePreparation:
        from app.schemas.exercises import SourceVersions
        source = _kwargs['source_ru']
        result = self.phrase_result or PhrasePreparation(intended_sr_variants=[_kwargs.get('canonical_sr') or 'Moja fraza.'])
        if result.source_versions is not None:
            return result
        ru = any('а' <= ch.lower() <= 'я' or ch.lower() == 'ё' for ch in source)
        return result.model_copy(update={'source_versions': SourceVersions(
            ru=source if ru else 'Мне нужен билет.', en='A prepared personal phrase.' if ru else source,
            hints_ru=result.word_hints if ru else [], hints_en=[] if ru else result.word_hints)})


class FakeTranscriptionProvider:
    def __init__(self, *, available: bool = True, text: str = "Želim da otvorim račun.") -> None:
        self._available = available
        self.text = text
        self.calls: list[dict[str, object]] = []

    @property
    def is_available(self) -> bool:
        return self._available

    def transcribe(self, *, audio: bytes, filename: str, content_type: str) -> TranscriptionResponse:
        self.calls.append({"audio": audio, "filename": filename, "content_type": content_type})
        return TranscriptionResponse(text=self.text)


class FakeTranscriptionAssistanceProvider:
    def __init__(self, *, available: bool = True, result: TranscriptionAssistanceAnalysis | None = None,
                 error: Exception | None = None) -> None:
        self.is_available = available
        self.result = result or TranscriptionAssistanceAnalysis(acceptable_variant=False, candidates=[])
        self.error = error
        self.calls: list[dict] = []

    def analyze(self, **kwargs) -> TranscriptionAssistanceAnalysis:
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.result


def create_custom_phrase(client, body):
    """Exercise the real server-owned prepare/save API with a synthetic model."""
    from app.main import app
    from app.services.ai_adapter import get_ai_provider
    topic_id = body.get("topic_id")
    if topic_id is None:
        topic_id = client.post("/api/topics", json={"title_ru": "Личные фразы"}).json()["id"]
    previous = app.dependency_overrides[get_ai_provider]
    app.dependency_overrides[get_ai_provider] = lambda: FakeAIProvider(
        available=True, phrase_result=PhrasePreparation(intended_sr_variants=[body["canonical_sr"]], word_hints=[]),
    )
    try:
        prepared = client.post("/api/review-phrases/prepare", json={"source_ru": body["source_ru"]})
        assert prepared.status_code == 200, prepared.json()
        return client.post("/api/review-phrases", json={"preparation_id": prepared.json()["preparation_id"], "topic_id": topic_id})
    finally:
        app.dependency_overrides[get_ai_provider] = previous
