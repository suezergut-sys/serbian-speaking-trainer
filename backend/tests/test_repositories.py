from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.models import Attempt, ErrorEvent, Exercise, LearnerSkill, Skill, TopicPreset, TrainingSession, User
from app.repositories import Repository, SkillRepository, TopicPresetRepository


def test_catalog_crud(db_session: Session) -> None:
    skills = SkillRepository(db_session)
    topics = TopicPresetRepository(db_session)
    skill = skills.add(Skill(key="grammar.test", category="grammar", title_ru="Тест", explanation_ru="Описание", difficulty=0.4))
    topic = topics.add(TopicPreset(id="test-topic", title_ru="Тема", description_ru="Описание", intents_json=[], vocabulary_json=[]))

    assert skills.get(skill.id) is skill
    assert skills.get_by_key("grammar.test") is skill
    assert topics.get("test-topic") is topic
    assert topics.list_enabled() == [topic]

    topics.delete(topic)
    assert topics.get("test-topic") is None


def test_training_skills_load_only_current_user_state(db_session: Session) -> None:
    other_id = "00000000-0000-0000-0000-000000000002"
    skill = Skill(key="grammar.filtered", category="grammar", title_ru="Тест", explanation_ru="Описание", difficulty=0.4)
    db_session.add_all([skill, User(id=other_id, email="other@example.com", role="user", access_tier="free")])
    db_session.flush()
    db_session.add_all([
        LearnerSkill(skill_id=skill.id, mastery=0.2),
        LearnerSkill(user_id=other_id, skill_id=skill.id, mastery=0.8),
    ])
    db_session.flush()

    repository = SkillRepository(db_session)
    current = repository.list_for_training("00000000-0000-0000-0000-000000000001")
    assert [state.mastery for state in current[0].learner_states] == [0.2]

    other = repository.list_for_training(other_id)
    assert [state.mastery for state in other[0].learner_states] == [0.8]


def test_training_graph_crud_and_cascade(db_session: Session) -> None:
    skill = Skill(key="intent.test", category="communicative_intent", title_ru="Тест", explanation_ru="Описание", difficulty=0.3)
    topic = TopicPreset(id="topic", title_ru="Тема", description_ru="Описание", intents_json=[], vocabulary_json=[])
    db_session.add_all([skill, topic])
    db_session.flush()

    training = Repository(db_session, TrainingSession).add(
        TrainingSession(topic_id=topic.id, normalized_topic_json={"source": "preset"})
    )
    exercise = Repository(db_session, Exercise).add(
        Exercise(session_id=training.id, source_ru="Можно оплатить картой?")
    )
    attempt = Repository(db_session, Attempt).add(
        Attempt(exercise_id=exercise.id, transcript_sr="Da li mogu da platim karticom?", overall_score=0.9)
    )
    learner = Repository(db_session, LearnerSkill).add(LearnerSkill(skill_id=skill.id, mastery=0.4))
    error = Repository(db_session, ErrorEvent).add(
        ErrorEvent(attempt_id=attempt.id, skill_id=skill.id, type="fluency", severity=0.2, confidence=0.8)
    )

    assert Repository(db_session, TrainingSession).get(training.id) is training
    assert Repository(db_session, Exercise).get(exercise.id) is exercise
    assert Repository(db_session, Attempt).get(attempt.id) is attempt
    assert db_session.get(LearnerSkill, (learner.user_id, skill.id)) is learner
    assert Repository(db_session, ErrorEvent).get(error.id) is error

    Repository(db_session, TrainingSession).delete(training)
    assert Repository(db_session, Exercise).get(exercise.id) is None
    assert Repository(db_session, Attempt).get(attempt.id) is None
    assert Repository(db_session, ErrorEvent).get(error.id) is None


def test_schema_has_no_audio_storage_columns(db_session: Session) -> None:
    forbidden_fragments = {"audio", "blob", "recording", "file_path"}
    inspector = inspect(db_session.bind)

    for table_name in inspector.get_table_names():
        column_names = {column["name"].lower() for column in inspector.get_columns(table_name)}
        assert all(fragment not in name for name in column_names for fragment in forbidden_fragments)
