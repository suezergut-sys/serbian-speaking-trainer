from app.services.learner_model import update_mastery


def test_repeated_strong_performance_reaches_mastered() -> None:
    mastery = 0.0
    result = None
    for _ in range(10):
        result = update_mastery(
            old_mastery=mastery,
            correctness=1.0,
            confidence=0.95,
            fluency=0.95,
            naturalness=0.95,
            context_novelty=1.0,
            issue_penalty=0.0,
            consolidating_threshold=0.65,
            mastered_threshold=0.85,
        )
        mastery = result.mastery

    assert result is not None
    assert result.state == "MASTERED"
    assert result.mastery >= 0.85


def test_single_severe_error_does_not_destroy_mastered_skill() -> None:
    result = update_mastery(
        old_mastery=0.92,
        correctness=0.1,
        confidence=0.95,
        fluency=0.4,
        naturalness=0.3,
        context_novelty=0.8,
        issue_penalty=0.9,
        consolidating_threshold=0.65,
        mastered_threshold=0.85,
    )

    assert result.mastery >= 0.84
    assert result.state in {"CONSOLIDATING", "MASTERED"}


def test_mastery_update_is_bounded_for_extreme_inputs() -> None:
    result = update_mastery(
        old_mastery=4,
        correctness=-2,
        confidence=3,
        fluency=-1,
        naturalness=8,
        context_novelty=2,
        issue_penalty=5,
        consolidating_threshold=0.65,
        mastered_threshold=0.85,
    )

    assert 0 <= result.mastery <= 1
    assert 0 <= result.performance <= 1
