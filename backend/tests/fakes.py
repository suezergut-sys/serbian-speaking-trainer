from collections.abc import Callable

from app.schemas import AnswerAnalysis, ExerciseGenerationResult, PhrasePreparation, TopicContext, TranscriptionResponse


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
        if self.phrase_result is None:
            raise AssertionError("Unexpected prepare_phrase call")
        return self.phrase_result


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
