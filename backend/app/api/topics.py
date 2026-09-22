from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.repositories import TopicPresetRepository
from app.schemas import CreateTopicRequest, NormalizeTopicRequest, TopicContext, TopicListItem
from app.services.ai_adapter import StructuredAIProvider, get_ai_provider
from app.services.topic_service import TopicService

router = APIRouter(prefix="/topics", tags=["topics"])


@router.get("", response_model=list[TopicListItem])
def list_topics(
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
) -> list[TopicListItem]:
    return TopicService(TopicPresetRepository(db), ai).list_presets()


@router.post("", response_model=TopicListItem, status_code=status.HTTP_201_CREATED)
def create_topic(
    request: CreateTopicRequest,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
) -> TopicListItem:
    return TopicService(TopicPresetRepository(db), ai).create_custom(request)


@router.post("/normalize", response_model=TopicContext)
def normalize_topic(
    request: NormalizeTopicRequest,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
) -> TopicContext:
    return TopicService(TopicPresetRepository(db), ai).normalize_custom(request.text)
