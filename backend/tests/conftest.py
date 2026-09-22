import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.seed import seed_catalog
from app.db.session import get_db
from app.db.session import create_database_engine
from app.main import app
from app.services.ai_adapter import get_ai_provider
from app.services.transcription_adapter import get_transcription_provider
from tests.fakes import FakeAIProvider, FakeTranscriptionProvider


@pytest.fixture
def db_session() -> Session:
    engine = create_database_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
        session.rollback()
    engine.dispose()


@pytest.fixture
def api_client(db_session: Session) -> TestClient:
    seed_catalog(db_session)
    db_session.commit()
    offline_ai = FakeAIProvider()

    def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_ai_provider] = lambda: offline_ai
    app.dependency_overrides[get_transcription_provider] = lambda: FakeTranscriptionProvider(available=False)
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
