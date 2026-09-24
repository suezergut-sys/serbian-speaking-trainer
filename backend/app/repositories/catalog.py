from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models import LearnerSkill, Skill, TopicPhrase, TopicPreset
from app.repositories.base import Repository

DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"


class SkillRepository(Repository[Skill]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, Skill)

    def get_by_key(self, key: str) -> Skill | None:
        return self.session.scalar(select(Skill).where(Skill.key == key))

    def list_for_training(self, user_id: str, *, limit: int = 500) -> list[Skill]:
        statement = (
            select(Skill)
            .options(joinedload(Skill.learner_states.and_(LearnerSkill.user_id == user_id)))
            .limit(limit)
            .execution_options(populate_existing=True)
        )
        return list(self.session.scalars(statement).unique())


class LearnerSkillRepository(Repository[LearnerSkill]):
    def __init__(self, session: Session, user_id: str = DEFAULT_USER_ID) -> None:
        super().__init__(session, LearnerSkill)
        self.user_id = user_id

    def get_for_skill(self, skill_id: str) -> LearnerSkill | None:
        return self.session.get(LearnerSkill, (self.user_id, skill_id))


class TopicPresetRepository(Repository[TopicPreset]):
    def __init__(self, session: Session, user_id: str = DEFAULT_USER_ID) -> None:
        super().__init__(session, TopicPreset)
        self.user_id = user_id

    def get_visible(self, topic_id: str) -> TopicPreset | None:
        return self.session.scalar(select(TopicPreset).where(
            TopicPreset.id == topic_id,
            or_(TopicPreset.owner_user_id.is_(None), TopicPreset.owner_user_id == self.user_id),
        ))

    def list_enabled(self) -> list[TopicPreset]:
        statement = select(TopicPreset).where(
            TopicPreset.enabled.is_(True),
            or_(TopicPreset.owner_user_id.is_(None), TopicPreset.owner_user_id == self.user_id),
        ).order_by(TopicPreset.title_ru)
        return list(self.session.scalars(statement))

    def phrase_counts(self) -> dict[str, int]:
        from app.models import ReviewPhrase

        catalog = select(TopicPhrase.topic_id, func.count(TopicPhrase.id)).where(TopicPhrase.enabled.is_(True)).group_by(TopicPhrase.topic_id)
        custom = select(ReviewPhrase.topic_id, func.count(ReviewPhrase.id)).where(
            ReviewPhrase.user_id == self.user_id,
            ReviewPhrase.topic_id.is_not(None),
        ).group_by(ReviewPhrase.topic_id)
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
