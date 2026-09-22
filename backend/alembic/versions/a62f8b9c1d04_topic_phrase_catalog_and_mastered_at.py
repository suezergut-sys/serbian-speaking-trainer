"""persist preset topic phrases and mastery dates

Revision ID: a62f8b9c1d04
Revises: 4e3f9c1d6a72
Create Date: 2026-09-18 12:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a62f8b9c1d04"
down_revision: Union[str, None] = "4e3f9c1d6a72"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "topic_phrases",
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("topic_id", sa.String(length=80), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("source_ru", sa.Text(), nullable=False),
        sa.Column("canonical_sr", sa.Text(), nullable=False),
        sa.Column("targeted_skill_keys_json", sa.JSON(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.CheckConstraint("position >= 1 AND position <= 20"),
        sa.ForeignKeyConstraint(["topic_id"], ["topic_presets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("topic_id", "position", name="uq_topic_phrases_topic_position"),
    )
    op.create_index(op.f("ix_topic_phrases_topic_id"), "topic_phrases", ["topic_id"], unique=False)
    with op.batch_alter_table("review_phrases") as batch_op:
        batch_op.add_column(sa.Column("mastered_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index(op.f("ix_review_phrases_mastered_at"), ["mastered_at"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("review_phrases") as batch_op:
        batch_op.drop_index(op.f("ix_review_phrases_mastered_at"))
        batch_op.drop_column("mastered_at")
    op.drop_index(op.f("ix_topic_phrases_topic_id"), table_name="topic_phrases")
    op.drop_table("topic_phrases")
