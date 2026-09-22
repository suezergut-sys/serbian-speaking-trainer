from collections import Counter
from datetime import datetime, timezone

from app.models import Exercise, Skill
from app.schemas import TopicContext


class Scheduler:
    """Deterministic target selection with learner weakness and spaced review."""

    CATEGORY_WEIGHT = {
        "construction": 0.65,
        "grammar": 0.6,
        "communicative_intent": 0.55,
        "vocabulary": 0.45,
        "fluency": 0.15,
        "pronunciation": 0.1,
    }

    def select_target_skills(
        self,
        skills: list[Skill],
        topic: TopicContext,
        recent_exercises: list[Exercise],
        *,
        user_id: str,
        limit: int = 2,
    ) -> list[Skill]:
        recently_used = Counter(
            skill_id
            for exercise in recent_exercises
            for skill_id in exercise.targeted_skill_ids
        )
        topic_terms = " ".join([topic.title_ru, *topic.suggested_vocabulary]).casefold()
        now = datetime.now(timezone.utc)

        def score(skill: Skill) -> tuple[float, str]:
            theme_bonus = 0.7 if skill.title_ru.casefold() in topic_terms else 0.0
            level_fit = 0.25 - abs(skill.difficulty - 0.5) * 0.25
            recent_penalty = recently_used[skill.id] * 0.8
            weakness_weight = 0.15
            recent_error_weight = 0.0
            due_review_weight = 0.0
            mastered_penalty = 0.0
            learner = next((state for state in skill.learner_states if state.user_id == user_id), None)
            if learner is not None:
                weakness_weight = (1 - learner.mastery) * 1.1
                if learner.attempts:
                    recent_error_weight = (1 - learner.successes / learner.attempts) * 1.2
                if learner.next_review_at is not None:
                    review_at = learner.next_review_at
                    if review_at.tzinfo is None:
                        review_at = review_at.replace(tzinfo=timezone.utc)
                    due_review_weight = 0.8 if review_at <= now else 0.0
                mastered_penalty = 0.5 if learner.state == "MASTERED" else 0.0
            value = (
                self.CATEGORY_WEIGHT.get(skill.category, 0.2)
                + theme_bonus
                + level_fit
                + weakness_weight
                + recent_error_weight
                + due_review_weight
                - recent_penalty
                - mastered_penalty
            )
            return value, skill.key

        ranked = sorted(skills, key=score, reverse=True)
        selected: list[Skill] = []
        used_categories: set[str] = set()
        for skill in ranked:
            if skill.category in used_categories and len(selected) < limit - 1:
                continue
            selected.append(skill)
            used_categories.add(skill.category)
            if len(selected) == limit:
                break
        return selected
