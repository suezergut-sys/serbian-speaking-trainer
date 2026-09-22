from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import LearnerSkill, Skill, TopicPhrase, TopicPreset
from app.repositories.base import Repository


class SkillRepository(Repository[Skill]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, Skill)

    def get_by_key(self, key: str) -> Skill | None:
        return self.session.scalar(select(Skill).where(Skill.key == key))


class LearnerSkillRepository(Repository[LearnerSkill]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, LearnerSkill)


class TopicPresetRepository(Repository[TopicPreset]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, TopicPreset)

    def list_enabled(self) -> list[TopicPreset]:
        statement = select(TopicPreset).where(TopicPreset.enabled.is_(True)).order_by(TopicPreset.title_ru)
        return list(self.session.scalars(statement))

    def phrase_counts(self) -> dict[str, int]:
        from app.models import ReviewPhrase

        catalog = select(TopicPhrase.topic_id, func.count(TopicPhrase.id)).where(TopicPhrase.enabled.is_(True)).group_by(TopicPhrase.topic_id)
        custom = select(ReviewPhrase.topic_id, func.count(ReviewPhrase.id)).where(ReviewPhrase.topic_id.is_not(None)).group_by(ReviewPhrase.topic_id)
        counts: dict[str, int] = {}
        for topic_id, count in self.session.execute(catalog):
            counts[str(topic_id)] = int(count)
        for topic_id, count in self.session.execute(custom):
            counts[str(topic_id)] = counts.get(str(topic_id), 0) + int(count)
        return counts


class TopicPhraseRepository(Repository[TopicPhrase]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, TopicPhrase)

    def list_for_topic(self, topic_id: str) -> list[TopicPhrase]:
        statement = (
            select(TopicPhrase)
            .where(TopicPhrase.topic_id == topic_id, TopicPhrase.enabled.is_(True))
            .order_by(TopicPhrase.position)
        )
        return list(self.session.scalars(statement))
