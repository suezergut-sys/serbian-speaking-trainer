"""add spaced repetition state to review phrases

Revision ID: d71c40a9f23b
Revises: b81d2e4f6a90
Create Date: 2026-09-20 12:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d71c40a9f23b"
down_revision: Union[str, None] = "b81d2e4f6a90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table(
        "review_phrases",
        table_args=(sa.CheckConstraint("best_score >= 0 AND best_score <= 1"),),
    ) as batch_op:
        batch_op.add_column(sa.Column("topic_id", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("topic_phrase_id", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("incorrect_attempts", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("learning_errors", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("difficulty", sa.String(length=12), nullable=True))
        batch_op.add_column(sa.Column("mastery_count", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("interval_days", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_foreign_key(
            "fk_review_phrases_topic_id", "topic_presets", ["topic_id"], ["id"], ondelete="SET NULL"
        )
        batch_op.create_foreign_key(
            "fk_review_phrases_topic_phrase_id", "topic_phrases", ["topic_phrase_id"], ["id"], ondelete="SET NULL"
        )
        batch_op.create_index(op.f("ix_review_phrases_topic_id"), ["topic_id"], unique=False)
        batch_op.create_index(op.f("ix_review_phrases_topic_phrase_id"), ["topic_phrase_id"], unique=False)
        batch_op.create_index(op.f("ix_review_phrases_next_review_at"), ["next_review_at"], unique=False)

    op.execute(
        """
        UPDATE review_phrases
        SET topic_phrase_id = (
            SELECT topic_phrases.id FROM topic_phrases
            WHERE topic_phrases.source_ru = review_phrases.source_ru LIMIT 1
        )
        """
    )
    op.execute(
        """
        UPDATE review_phrases
        SET topic_id = (
            SELECT topic_phrases.topic_id FROM topic_phrases
            WHERE topic_phrases.id = review_phrases.topic_phrase_id
        )
        WHERE topic_phrase_id IS NOT NULL
        """
    )
    next_review_expression = (
        "datetime(mastered_at, '+7 days')"
        if op.get_bind().dialect.name == "sqlite"
        else "mastered_at + INTERVAL '7 days'"
    )
    op.execute(
        f"""
        UPDATE review_phrases
        SET difficulty = 'medium', mastery_count = 1, interval_days = 7,
            next_review_at = {next_review_expression}
        WHERE status = 'mastered' AND mastered_at IS NOT NULL
        """
    )


def downgrade() -> None:
    with op.batch_alter_table(
        "review_phrases",
        table_args=(sa.CheckConstraint("best_score >= 0 AND best_score <= 1"),),
    ) as batch_op:
        batch_op.drop_index(op.f("ix_review_phrases_next_review_at"))
        batch_op.drop_index(op.f("ix_review_phrases_topic_phrase_id"))
        batch_op.drop_index(op.f("ix_review_phrases_topic_id"))
        batch_op.drop_constraint("fk_review_phrases_topic_phrase_id", type_="foreignkey")
        batch_op.drop_constraint("fk_review_phrases_topic_id", type_="foreignkey")
        batch_op.drop_column("next_review_at")
        batch_op.drop_column("interval_days")
        batch_op.drop_column("mastery_count")
        batch_op.drop_column("difficulty")
        batch_op.drop_column("learning_errors")
        batch_op.drop_column("incorrect_attempts")
        batch_op.drop_column("topic_phrase_id")
        batch_op.drop_column("topic_id")
