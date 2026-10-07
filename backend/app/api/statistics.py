from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import MonthlyStatisticsResponse, PhraseStatisticsResponse
from app.schemas.statistics import PhraseStatisticsTopic
from app.services.statistics_service import StatisticsService
from app.api.dependencies import get_current_user
from app.models import User

router = APIRouter(prefix="/statistics", tags=["statistics"])


@router.get("/monthly", response_model=MonthlyStatisticsResponse)
def monthly_statistics(
    month: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    utc_offset_minutes: int = Query(default=0, ge=-840, le=840),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MonthlyStatisticsResponse:
    return StatisticsService(db, user.id).monthly(month, utc_offset_minutes)


@router.get("/phrases", response_model=PhraseStatisticsResponse)
def phrase_statistics(
    page: int = Query(default=1, ge=1),
    page_size: str = Query(default="10", pattern=r"^(10|50|all)$"),
    topic_id: str | None = Query(default=None, min_length=1, max_length=36),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PhraseStatisticsResponse:
    return StatisticsService(db, user.id).phrases(page=page, page_size=page_size, topic_id=topic_id)


@router.get("/phrase-topics", response_model=list[PhraseStatisticsTopic])
def phrase_topics(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[PhraseStatisticsTopic]:
    return StatisticsService(db, user.id).phrase_topics()
