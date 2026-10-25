from calendar import monthrange
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.schemas.statistics import PhraseStatisticsTopic

from app.repositories import AttemptRepository, ReviewPhraseRepository
from app.schemas import (
    DailyPhraseCount,
    MonthlyStatisticsResponse,
    PhraseStatisticsGroup,
    PhraseStatisticsItem,
    PhraseStatisticsResponse,
)


class StatisticsService:
    def __init__(self, db: Session, user_id: str) -> None:
        self.attempts = AttemptRepository(db, user_id)
        self.review_phrases = ReviewPhraseRepository(db, user_id)

    def monthly(self, month: str, utc_offset_minutes: int) -> MonthlyStatisticsResponse:
        year, month_number = (int(part) for part in month.split("-"))
        local_timezone = timezone(timedelta(minutes=utc_offset_minutes))
        local_start = datetime(year, month_number, 1, tzinfo=local_timezone)
        if month_number == 12:
            local_end = datetime(year + 1, 1, 1, tzinfo=local_timezone)
        else:
            local_end = datetime(year, month_number + 1, 1, tzinfo=local_timezone)

        day_count = monthrange(year, month_number)[1]
        counts = [0] * day_count
        correct_counts = [0] * day_count
        mastered_counts = [0] * day_count
        for attempt in self.attempts.list_created_between(
            local_start.astimezone(timezone.utc),
            local_end.astimezone(timezone.utc),
        ):
            created_at = attempt.created_at
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            local_day = created_at.astimezone(local_timezone).day
            counts[local_day - 1] += 1
            if attempt.overall_score is not None and attempt.overall_score >= 0.95:
                correct_counts[local_day - 1] += 1

        for mastered_at in self.review_phrases.list_mastered_between(
            local_start.astimezone(timezone.utc),
            local_end.astimezone(timezone.utc),
        ):
            if mastered_at.tzinfo is None:
                mastered_at = mastered_at.replace(tzinfo=timezone.utc)
            local_day = mastered_at.astimezone(local_timezone).day
            mastered_counts[local_day - 1] += 1

        days = [
            DailyPhraseCount(
                date=local_start.date().replace(day=day),
                phrase_count=count,
                translation_count=count,
                correct_translation_count=correct_counts[day - 1],
                mastered_phrase_count=mastered_counts[day - 1],
            )
            for day, count in enumerate(counts, start=1)
        ]
        return MonthlyStatisticsResponse(
            month=month,
            active_days=sum(count > 0 for count in counts),
            total_phrases=sum(counts),
            total_translations=sum(counts),
            correct_translations=sum(correct_counts),
            mastered_phrases=sum(mastered_counts),
            days=days,
        )

    def phrase_topics(self) -> list[PhraseStatisticsTopic]:
        return [PhraseStatisticsTopic(topic_id=topic_id, topic_title=title, topic_title_en=title_en, phrase_count=count)
                for topic_id, title, title_en, count in self.review_phrases.statistics_topics()]

    def phrases(self, *, page: int, page_size: str, topic_id: str | None = None) -> PhraseStatisticsResponse:
        total = self.review_phrases.count_for_statistics(topic_id)
        numeric_page_size = None if page_size == "all" else int(page_size)
        total_pages = 1 if numeric_page_size is None else max(1, (total + numeric_page_size - 1) // numeric_page_size)
        normalized_page = min(page, total_pages)
        offset = 0 if numeric_page_size is None else (normalized_page - 1) * numeric_page_size
        rows = self.review_phrases.list_for_statistics(limit=numeric_page_size, offset=offset, topic_id=topic_id)

        groups: list[PhraseStatisticsGroup] = []
        group_by_key: dict[tuple[str | None, str], PhraseStatisticsGroup] = {}
        for phrase, topic_title, title_en in rows:
            key = (phrase.topic_id, topic_title)
            group = group_by_key.get(key)
            if group is None:
                group = PhraseStatisticsGroup(topic_id=phrase.topic_id, topic_title=topic_title, topic_title_en=title_en, phrases=[])
                group_by_key[key] = group
                groups.append(group)
            group.phrases.append(
                PhraseStatisticsItem(
                    id=phrase.id,
                    source_ru=phrase.source_ru,
                    target_sr=next(iter(phrase.intended_sr_variants_json), "—"),
                    attempts=phrase.attempts,
                    status="mastered" if phrase.status == "mastered" else "learning",
                    difficulty=phrase.difficulty,
                    next_review_at=phrase.next_review_at if phrase.status == "mastered" else None,
                )
            )
        return PhraseStatisticsResponse(
            total=total,
            page=normalized_page,
            page_size=page_size,
            total_pages=total_pages,
            groups=groups,
        )
