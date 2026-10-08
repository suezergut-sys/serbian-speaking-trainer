from uuid import uuid4
import pytest
from sqlalchemy import select
from app.main import app
from app.models import Exercise, LearnerSkill, ReviewPhrase, TranscriptionReceipt, User
from app.services.transcription_adapter import get_transcription_provider
from app.services.transcription_assistance import apply_changes, validate_analysis
from app.services.transcription_assistance_adapter import get_transcription_assistance_provider
from app.schemas.transcriptions import TranscriptionAssistanceAnalysis, TranscriptionCandidate
from app.services.ai_adapter import AIServiceError
from tests.fakes import FakeTranscriptionProvider, FakeTranscriptionAssistanceProvider
from tests.test_transcriptions_api import _create_exercise


def candidate(original, replacement, **kwargs):
    return TranscriptionCandidate(original=original, replacement=replacement,
        occurrence_index=kwargs.pop("occurrence_index", 0), kind="phonetic_ambiguity",
        plausible_stt_error=kwargs.pop("plausible_stt_error", True),
        preserves_meaning=kwargs.pop("preserves_meaning", True),
        explanation_ru="Возможно искажение близкого звука при распознавании.", **kwargs)


def analysis(*candidates, acceptable_variant=False):
    return TranscriptionAssistanceAnalysis(acceptable_variant=acceptable_variant, candidates=list(candidates))


@pytest.mark.parametrize("original,replacement", [
    ("Allergičen", "Alergičan"), ("Zdrastveno", "Zdravstveno"),
    ("osigurranje", "osiguranje"), ("racun", "račun"), ("Ćemu", "Čemu"),
    ("neznam", "ne znam"), ("bankovna", "bankovnom"),
])
def test_general_similarity_validates_model_proposals_without_dictionary(original, replacement):
    raw = f"🙂 {original} danas."
    changes = validate_analysis(raw, ["Drugačija formulacija."], analysis(candidate(original, replacement)))
    assert len(changes) == 1 and changes[0].action == "suggested"
    assert changes[0].similarity is not None
    assert raw[changes[0].start:changes[0].end] == original
    assert apply_changes(raw, changes, {0}) == f"🙂 {replacement} danas."


def test_all_candidates_are_kept_with_repeated_words_and_unicode_offsets():
    raw = "🙂 racun racun racun racun racun"
    changes = validate_analysis(raw, [], analysis(*(candidate("racun", "račun", occurrence_index=i) for i in range(5))))
    assert len(changes) == 5
    assert apply_changes(raw, changes, set(range(5))) == "🙂 račun račun račun račun račun"


@pytest.mark.parametrize("proposal", [
    candidate("kafa", "kapa", plausible_stt_error=False),
    candidate("kafa", "kapa", preserves_meaning=False),
    candidate("kafa", "čaj"), candidate("kafa", "kafa 2"),
    candidate("12", "13"), candidate("nije", "je"), candidate("u", "i"),
    candidate("ne znam", "znam"), candidate("kafa", "καφα"),
])
def test_similarity_alone_cannot_hide_errors_or_change_numbers_negation(proposal):
    assert validate_analysis(proposal.original, [], analysis(proposal)) == []


def test_valid_alternate_or_exact_match_is_not_forced_to_canonical():
    proposal = candidate("kući", "kuće")
    assert validate_analysis("Idemo kući.", ["Idemo kući."], analysis(proposal)) == []
    assert validate_analysis("Idemo kući.", ["Vraćamo se kući."], analysis(proposal, acceptable_variant=True)) == []


@pytest.mark.parametrize("raw,proposals", [
    ("racun", [candidate("račun", "racun")]),
    ("racun", [candidate("racun", "račun", occurrence_index=1)]),
    ("racun", [candidate("rac", "rač")]),
    ("racun", [candidate("racun", "račun"), candidate("racun", "račun")]),
])
def test_invalid_model_spans_and_overlaps_are_rejected(raw, proposals):
    with pytest.raises(ValueError):
        validate_analysis(raw, [], analysis(*proposals))


@pytest.mark.parametrize("raw, canonical, accepted", [
    ("Cemu?", "Čemu?", "Čemu?"),
    ("Allergičen sam na neke antibiotike.", "Imam alergiju na neke antibiotike.", "Alergičan sam na neke antibiotike."),
])
def test_opt_in_and_server_validated_scoring(api_client, db_session, raw, canonical, accepted):
    exercise_id = _create_exercise(api_client)
    exercise = db_session.get(Exercise, exercise_id)
    exercise.target_hints_json = {**exercise.target_hints_json, "canonical_sr": canonical, "intended_sr_variants": [canonical, accepted]}
    db_session.commit()
    app.dependency_overrides[get_transcription_provider] = lambda: FakeTranscriptionProvider(text=raw)
    original, replacement = raw.split()[0].rstrip("?"), accepted.split()[0].rstrip("?")
    provider = FakeTranscriptionAssistanceProvider(result=analysis(candidate(original, replacement)))
    app.dependency_overrides[get_transcription_assistance_provider] = lambda: provider
    def transcribe(enabled=None):
        data = {"exercise_id": exercise_id}
        if enabled is not None: data["assistance_enabled"] = str(enabled).lower()
        return api_client.post("/api/transcriptions", data=data, files={"audio": ("speech.webm", b"synthetic", "audio/webm")})
    assert transcribe().json() == {"text": raw}
    assert list(db_session.scalars(select(TranscriptionReceipt))) == []
    assert provider.calls == []
    result = transcribe(True).json()
    assert result["text"] == result["raw_text"] == raw
    assert len(result["changes"]) == 1
    assert result["assistance_status"] == "analyzed"
    assert provider.calls[0]["canonical_sr"] == canonical
    assert provider.calls[0]["raw_text"] == raw
    assert "audio" not in provider.calls[0]
    request = {"exercise_id": exercise_id, "transcript_sr": accepted, "transcription_id": result["transcription_id"],
               "accepted_transcription_changes": [0], "client_request_id": str(uuid4())}
    response = api_client.post("/api/attempts", json=request)
    assert response.status_code == 201, response.text
    assert response.json()["transcription_assisted"] is True
    assert response.json()["learner_updates"]
    assert all(skill.successes == 1 for skill in db_session.scalars(select(LearnerSkill)))
    phrase = db_session.scalar(select(ReviewPhrase))
    assert phrase.perfect_streak == 1 and phrase.mastery_count == 0 and phrase.learning_errors == 0
    assert api_client.post("/api/attempts", json=request).json() == response.json()
    invalid = {**request, "client_request_id": str(uuid4()), "accepted_transcription_changes": [8]}
    assert api_client.post("/api/attempts", json=invalid).status_code == 422
    assert api_client.post("/api/attempts", json={**invalid, "transcription_id": str(uuid4())}).status_code == 422
    receipt = db_session.get(TranscriptionReceipt, result["transcription_id"])
    db_session.add(User(id=str(uuid4()), email="other@example.com"))
    db_session.flush()
    other = db_session.scalar(select(User).where(User.email == "other@example.com"))
    receipt.user_id = other.id
    db_session.commit()
    assert api_client.post("/api/attempts", json={**request, "client_request_id": str(uuid4())}).status_code == 422


@pytest.mark.parametrize("provider", [
    FakeTranscriptionAssistanceProvider(available=False),
    FakeTranscriptionAssistanceProvider(error=AIServiceError("safe failure")),
    FakeTranscriptionAssistanceProvider(result={"free_text": "untrusted"}),
    FakeTranscriptionAssistanceProvider(result=analysis(candidate("absent", "abc"))),
])
def test_assistance_failure_keeps_transcription_and_reports_unavailable(api_client, db_session, provider):
    exercise_id = _create_exercise(api_client)
    app.dependency_overrides[get_transcription_provider] = lambda: FakeTranscriptionProvider(text="Moj odgovor.")
    app.dependency_overrides[get_transcription_assistance_provider] = lambda: provider
    response = api_client.post("/api/transcriptions", data={"exercise_id": exercise_id, "assistance_enabled": "true"},
        files={"audio": ("speech.webm", b"synthetic", "audio/webm")})
    assert response.status_code == 200
    assert response.json() == {"text": "Moj odgovor.", "raw_text": "Moj odgovor.", "assistance_status": "unavailable"}
    assert list(db_session.scalars(select(TranscriptionReceipt))) == []


def test_every_enabled_transcription_is_analyzed_even_exact_and_alternate_answers(api_client, db_session):
    exercise_id = _create_exercise(api_client)
    exercise = db_session.get(Exercise, exercise_id)
    exercise.target_hints_json = {"canonical_sr": "Želim da otvorim račun.", "intended_sr_variants": ["Hoću da otvorim račun."]}
    db_session.commit()
    provider = FakeTranscriptionAssistanceProvider(result=analysis(acceptable_variant=True))
    app.dependency_overrides[get_transcription_assistance_provider] = lambda: provider
    for text in ["Želim da otvorim račun.", "Hoću da otvorim račun."]:
        app.dependency_overrides[get_transcription_provider] = lambda: FakeTranscriptionProvider(text=text)
        response = api_client.post("/api/transcriptions", data={"exercise_id": exercise_id, "assistance_enabled": "true"},
            files={"audio": ("speech.webm", b"synthetic", "audio/webm")})
        assert response.status_code == 200
        assert response.json()["changes"] == []
        assert response.json()["assistance_status"] == "analyzed"
        assert provider.calls[-1]["raw_text"] == text
    assert len(provider.calls) == 2


@pytest.mark.parametrize("count", [2, 5])
@pytest.mark.parametrize("assisted", [False, True])
def test_multiple_suggestions_earn_normal_mastery_and_review_interval(api_client, db_session, count, assisted):
    canonical = " ".join(["račun"] * count)
    raw = " ".join(["racun"] * count)
    source = "Проверка нескольких искажений распознавания."
    app.dependency_overrides[get_transcription_provider] = lambda: FakeTranscriptionProvider(text=raw)
    app.dependency_overrides[get_transcription_assistance_provider] = lambda: FakeTranscriptionAssistanceProvider(
        result=analysis(*(candidate("racun", "račun", occurrence_index=i) for i in range(count))))
    target_meta = None
    for streak in range(1, 4):
        exercise_id = _create_exercise(api_client)
        exercise = db_session.get(Exercise, exercise_id)
        exercise.source_ru = source
        exercise.target_hints_json = {"canonical_sr": canonical, "intended_sr_variants": []}
        if target_meta is None:
            target_meta = exercise.generation_meta_json
        exercise.generation_meta_json = target_meta
        db_session.commit()
        request = {"exercise_id": exercise_id, "transcript_sr": canonical, "client_request_id": str(uuid4())}
        if assisted:
            result = api_client.post("/api/transcriptions", data={"exercise_id": exercise_id, "assistance_enabled": "true"},
                files={"audio": ("speech.webm", b"synthetic", "audio/webm")}).json()
            assert len(result["changes"]) == count
            request.update(transcription_id=result["transcription_id"], accepted_transcription_changes=list(range(count)))
        response = api_client.post("/api/attempts", json=request)
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["transcription_assisted"] is assisted
        assert body["overall_score"] == 1.0 and body["hint_penalty"] == 0
        assert body["learner_updates"]
        phrase = db_session.scalar(select(ReviewPhrase).where(ReviewPhrase.source_ru == source))
        assert phrase.perfect_streak == streak and phrase.attempts == streak
        assert phrase.learning_errors == 0 and phrase.best_score == 1.0
        assert api_client.post("/api/attempts", json=request).json() == body
        assert phrase.attempts == streak
    assert phrase.status == "mastered" and phrase.mastery_count == 1
    assert phrase.interval_days == 3 and phrase.next_review_at is not None
    skills = list(db_session.scalars(select(LearnerSkill)))
    assert skills and all(s.successes == 3 and s.streak == 3 and s.mastery > 0 for s in skills)


def test_accepting_stt_suggestion_does_not_hide_an_unrelated_answer_error(api_client, db_session):
    from app.schemas import AnswerAnalysis
    from app.services.ai_adapter import get_ai_provider
    from tests.fakes import FakeAIProvider

    exercise_id = _create_exercise(api_client)
    exercise = db_session.get(Exercise, exercise_id)
    exercise.target_hints_json = {"canonical_sr": "Čemu danas?", "intended_sr_variants": []}
    key = exercise.generation_meta_json["targeted_skill_keys"][0]
    db_session.commit()
    app.dependency_overrides[get_transcription_provider] = lambda: FakeTranscriptionProvider(text="Cemu sutra?")
    app.dependency_overrides[get_transcription_assistance_provider] = lambda: FakeTranscriptionAssistanceProvider(
        result=analysis(candidate("Cemu", "Čemu")))
    ai = FakeAIProvider(available=True, analysis_result=AnswerAnalysis(
        verdict="needs_work", semantic_score=0.3, grammar_score=0.5, lexical_score=0.3,
        naturalness_score=0.5, fluency_score=1, corrected_sr="Čemu danas?",
        short_feedback_ru="Изменён смысл.", detailed_feedback_ru="Сказано завтра вместо сегодня.",
        issues=[{"type": "meaning", "skill_key": key, "severity": 0.8, "confidence": 1,
                 "evidence": "sutra", "correction": "danas"}],
        demonstrated_skills=[{"skill_key": key, "result": "failed", "confidence": 1}],
    ))
    app.dependency_overrides[get_ai_provider] = lambda: ai
    result = api_client.post("/api/transcriptions", data={"exercise_id": exercise_id, "assistance_enabled": "true"},
        files={"audio": ("speech.webm", b"synthetic", "audio/webm")}).json()
    response = api_client.post("/api/attempts", json={"exercise_id": exercise_id, "transcript_sr": "Čemu sutra?",
        "transcription_id": result["transcription_id"], "accepted_transcription_changes": [0]})
    assert response.status_code == 201, response.text
    assert response.json()["transcription_assisted"] is True
    assert response.json()["overall_score"] < 0.95
    phrase = db_session.scalar(select(ReviewPhrase))
    assert phrase.learning_errors == 1 and phrase.perfect_streak == 0
    assert ai.analysis_calls == 1
