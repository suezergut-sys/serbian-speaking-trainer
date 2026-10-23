from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.session import create_database_engine
from app.models import ReviewPhrase, TopicPreset, User
from app.repositories import TopicPresetRepository
from app.schemas import CreateReviewPhraseRequest, CreateTopicRequest, PhrasePreparation, PrepareReviewPhraseRequest
from app.services.custom_content_policy import CustomContentError
from app.services.review_service import ReviewService
from app.services.topic_service import TopicService
from tests.fakes import FakeAIProvider


@pytest.mark.parametrize("kind", ["topics", "phrases"])
def test_concurrent_requests_cannot_exceed_owner_quota(tmp_path, kind):
    engine = create_database_engine(f"sqlite+pysqlite:///{(tmp_path / 'race.db').as_posix()}")
    Base.metadata.create_all(engine)
    ai = FakeAIProvider(available=True, phrase_result=PhrasePreparation(intended_sr_variants=["Moja fraza."]))
    user_id = "race-user"
    with Session(engine) as db:
        db.add(User(id=user_id, email="race@example.invalid", role="user", access_tier="free"))
        db.commit()
        service = TopicService(TopicPresetRepository(db, user_id), ai)
        topic = service.create_custom(CreateTopicRequest(title_ru="Моя тема"))
        if kind == "topics":
            for i in range(3):
                service.create_custom(CreateTopicRequest(title_ru=f"Другая тема {i}"))
        else:
            db.add_all([ReviewPhrase(user_id=user_id, topic_id=topic.id, source_ru=f"Фраза {i}", source_normalized=f"фраза {i}", intended_sr_variants_json=["Moja fraza."]) for i in range(29)])
        receipts = [ReviewService(db, ai, user_id).prepare_phrase(PrepareReviewPhraseRequest(source_ru=f"Гонка номер {i}")) for i in range(2)]
        db.commit()
    barrier = Barrier(2)

    def create(index):
        with Session(engine) as db:
            barrier.wait(timeout=10)
            try:
                if kind == "topics":
                    TopicService(TopicPresetRepository(db, user_id), ai).create_custom(CreateTopicRequest(title_ru=f"Последняя тема {index}"))
                else:
                    ReviewService(db, ai, user_id).create_phrase(CreateReviewPhraseRequest(preparation_id=receipts[index].preparation_id, topic_id=topic.id))
                db.commit()
                return "ok"
            except CustomContentError as error:
                db.rollback()
                return error.code

    try:
        with ThreadPoolExecutor(max_workers=2) as workers:
            results = list(workers.map(create, range(2)))
        assert sorted(results) == sorted(["ok", "custom_topic_limit" if kind == "topics" else "custom_phrase_limit"])
        with Session(engine) as db:
            model = TopicPreset if kind == "topics" else ReviewPhrase
            assert db.scalar(select(func.count()).select_from(model)) == (5 if kind == "topics" else 30)
    finally:
        engine.dispose()
