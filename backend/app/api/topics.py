from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.repositories import TopicPresetRepository
from app.schemas import CreateTopicRequest, NormalizeTopicRequest, TopicContext, TopicListItem
from app.services.ai_adapter import StructuredAIProvider, get_ai_provider
from app.services.topic_service import TopicService, TopicNotFoundError
from app.api.dependencies import get_current_user
from app.models import User

router = APIRouter(prefix="/topics", tags=["topics"])


@router.delete("/{topic_id}", status_code=204)
def delete_topic(
    topic_id: str,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> None:
    try:
        TopicService(TopicPresetRepository(db, user.id), ai).delete_custom(topic_id)
    except TopicNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Topic not found") from exc


@router.get("", response_model=list[TopicListItem])
def list_topics(
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> list[TopicListItem]:
    return TopicService(TopicPresetRepository(db, user.id), ai).list_presets()


@router.post("", response_model=TopicListItem, status_code=status.HTTP_201_CREATED)
def create_topic(
    request: CreateTopicRequest,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> TopicListItem:
    return TopicService(TopicPresetRepository(db, user.id), ai).create_custom(request)


@router.post("/normalize", response_model=TopicContext)
def normalize_topic(
    request: NormalizeTopicRequest,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> TopicContext:
    return TopicService(TopicPresetRepository(db, user.id), ai).normalize_custom(request.text)
