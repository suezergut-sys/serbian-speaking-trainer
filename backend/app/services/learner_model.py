from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import LearnerSkill, Skill
from app.repositories import LearnerSkillRepository, SkillRepository
from app.schemas import AnswerAnalysis, LearnerSkillUpdate


@dataclass(frozen=True)
class MasteryResult:
    mastery: float
    state: str
    performance: float


def update_mastery(
    *,
    old_mastery: float,
    correctness: float,
    confidence: float,
    fluency: float,
    naturalness: float,
    context_novelty: float,
    issue_penalty: float,
    consolidating_threshold: float,
    mastered_threshold: float,
) -> MasteryResult:
    """Pure, bounded and deliberately explainable mastery update."""
    values = (old_mastery, correctness, confidence, fluency, naturalness, context_novelty, issue_penalty)
    old, correct, conf, fluent, natural, novelty, penalty = (max(0.0, min(1.0, value)) for value in values)
    confidence_adjusted_correctness = 0.5 + (correct - 0.5) * conf
    performance = (
        0.55 * confidence_adjusted_correctness
        + 0.20 * fluent
        + 0.15 * natural
        + 0.10 * novelty
        - 0.15 * penalty
    )
    performance = max(0.0, min(1.0, performance))
    mastery = old * 0.75 + performance * 0.25
    if penalty >= 0.7:
        mastery -= 0.04
    if old >= mastered_threshold and performance < 0.5:
        mastery = max(mastery, old - 0.08)
    mastery = round(max(0.0, min(1.0, mastery)), 4)
    if mastery >= mastered_threshold:
        state = "MASTERED"
    elif mastery >= consolidating_threshold:
        state = "CONSOLIDATING"
    else:
        state = "LEARNING"
    return MasteryResult(mastery=mastery, state=state, performance=round(performance, 4))


class LearnerModelService:
    RESULT_CORRECTNESS = {"strong": 1.0, "weak": 0.55, "failed": 0.1}

    def __init__(self, db: Session, user_id: str, settings: Settings | None = None) -> None:
        self.user_id = user_id
        self.learner_skills = LearnerSkillRepository(db, user_id)
        self.skills = SkillRepository(db)
        self.settings = settings or get_settings()

    def update_from_analysis(
        self,
        analysis: AnswerAnalysis,
        *,
        context_novelty: float,
        now: datetime | None = None,
    ) -> list[LearnerSkillUpdate]:
        current_time = now or datetime.now(timezone.utc)
        issues_by_key: dict[str, float] = {}
        for issue in analysis.issues:
            weighted = issue.severity * issue.confidence
            issues_by_key[issue.skill_key] = max(issues_by_key.get(issue.skill_key, 0.0), weighted)

        updates: list[LearnerSkillUpdate] = []
        for demonstrated in analysis.demonstrated_skills:
            skill = self.skills.get_by_key(demonstrated.skill_key)
            if skill is None:
                continue
            learner = self.learner_skills.get_for_skill(skill.id)
            if learner is None:
                learner = self.learner_skills.add(LearnerSkill(user_id=self.user_id, skill_id=skill.id))
            result = update_mastery(
                old_mastery=learner.mastery,
                correctness=self.RESULT_CORRECTNESS[demonstrated.result],
                confidence=demonstrated.confidence,
                fluency=analysis.fluency_score,
                naturalness=analysis.naturalness_score,
                context_novelty=context_novelty,
                issue_penalty=issues_by_key.get(demonstrated.skill_key, 0.0),
                consolidating_threshold=self.settings.mastery_consolidating_threshold,
                mastered_threshold=self.settings.mastery_mastered_threshold,
            )
            learner.mastery = result.mastery
            learner.state = result.state
            learner.attempts += 1
            learner.successes += int(demonstrated.result == "strong" and demonstrated.confidence >= 0.6)
            learner.hesitations += int(analysis.fluency_score < self.settings.mastery_consolidating_threshold)
            learner.streak = learner.streak + 1 if demonstrated.result == "strong" else 0
            learner.last_seen_at = current_time
            learner.next_review_at = current_time + self._review_interval(learner, demonstrated.result)
            updates.append(self._snapshot(skill, learner))
        return updates

    @staticmethod
    def _review_interval(learner: LearnerSkill, result: str) -> timedelta:
        if result == "failed":
            return timedelta(days=1)
        if learner.state == "MASTERED":
            return timedelta(days=14 + min(learner.streak, 6) * 3)
        if learner.state == "CONSOLIDATING":
            return timedelta(days=5 + min(learner.streak, 4))
        return timedelta(days=2)

    @staticmethod
    def _snapshot(skill: Skill, learner: LearnerSkill) -> LearnerSkillUpdate:
        assert learner.next_review_at is not None
        return LearnerSkillUpdate(
            skill_key=skill.key,
            title_ru=skill.title_ru,
            mastery=learner.mastery,
            state=learner.state,
            attempts=learner.attempts,
            next_review_at=learner.next_review_at,
        )
