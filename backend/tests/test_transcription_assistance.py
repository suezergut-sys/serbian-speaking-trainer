from uuid import uuid4
import pytest
from sqlalchemy import select
from app.main import app
from app.models import Exercise, LearnerSkill, ReviewPhrase, TranscriptionReceipt, User
from app.services.transcription_adapter import get_transcription_provider
from app.services.transcription_assistance import apply_changes, propose
from tests.fakes import FakeTranscriptionProvider
from tests.test_transcriptions_api import _create_exercise


@pytest.mark.parametrize("raw,variants,expected", [
    ("Ja sam allergičan.", ["Ja sam alergičan."], [("alergičan", "applied")]),
    ("Čemu?", ["Čemu?"], []),
    ("Cemu?", ["Čemu?"], [("Čemu", "suggested")]),
    ("Ćemu?", ["Čemu?"], [("Čemu", "suggested")]),
    ("Idemo kući.", ["Idemo kuće."], [("kuće", "suggested")]),
    ("Nisam alergican.", ["Ja sam alergičan."], []),
    ("Kupujem 12 stvari.", ["Kupujem 13 stvari."], []),
    ("12 Cemu?", ["13 Čemu?"], []),
    ("Cemu?", ["Čemu?", "Ćemu?"], []),
    ("Idemo kući.", ["Idemo kući.", "Idemo kuće."], []),
    ("Anna vidi lletnju kuću.", ["Ana vidi letnju kuću."], []),
])
def test_bounded_rules(raw, variants, expected):
    changes = propose(raw, variants)
    assert [(c.replacement, c.action) for c in changes] == expected
    for c in changes:
        assert raw[c.start:c.end] == c.original


def test_offsets_after_emoji_and_bounded_edit_count():
    raw = "🙂 allergičan allergična allergično allergičan"
    changes = propose(raw, [])
    assert len(changes) == 3
    assert apply_changes(raw, changes, {0, 1, 2}) == "🙂 alergičan alergična alergično allergičan"


def test_opt_in_and_server_validated_scoring(api_client, db_session):
    exercise_id = _create_exercise(api_client)
    exercise = db_session.get(Exercise, exercise_id)
    exercise.target_hints_json = {**exercise.target_hints_json, "canonical_sr": "Čemu?", "intended_sr_variants": ["Čemu?"]}
    db_session.commit()
    app.dependency_overrides[get_transcription_provider] = lambda: FakeTranscriptionProvider(text="Cemu?")
    def transcribe(enabled=None):
        data = {"exercise_id": exercise_id}
        if enabled is not None: data["assistance_enabled"] = str(enabled).lower()
        return api_client.post("/api/transcriptions", data=data, files={"audio": ("speech.webm", b"synthetic", "audio/webm")})
    assert transcribe().json() == {"text": "Cemu?"}
    assert list(db_session.scalars(select(TranscriptionReceipt))) == []
    result = transcribe(True).json()
    assert result["text"] == result["raw_text"] == "Cemu?"
    assert len(result["changes"]) == 1
    request = {"exercise_id": exercise_id, "transcript_sr": "Čemu?", "transcription_id": result["transcription_id"],
               "accepted_transcription_changes": [0], "client_request_id": str(uuid4())}
    response = api_client.post("/api/attempts", json=request)
    assert response.status_code == 201, response.text
    assert response.json()["transcription_assisted"] is True
    assert response.json()["learner_updates"] == []
    assert list(db_session.scalars(select(LearnerSkill))) == []
    phrase = db_session.scalar(select(ReviewPhrase))
    assert phrase.perfect_streak == 0 and phrase.mastery_count == 0 and phrase.learning_errors == 0
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
