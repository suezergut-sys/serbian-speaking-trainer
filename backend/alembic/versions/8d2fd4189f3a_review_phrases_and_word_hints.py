"""review phrases and word hints

Revision ID: 8d2fd4189f3a
Revises: cce3be23d8fe
Create Date: 2026-09-17 13:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8d2fd4189f3a"
down_revision: Union[str, None] = "cce3be23d8fe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("attempts") as batch_op:
        batch_op.add_column(sa.Column("hinted_words_json", sa.JSON(), nullable=False, server_default="[]"))

    op.create_table(
        "review_phrases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_ru", sa.Text(), nullable=False),
        sa.Column("source_normalized", sa.String(length=280), nullable=False),
        sa.Column("intended_sr_variants_json", sa.JSON(), nullable=False),
        sa.Column("word_hints_json", sa.JSON(), nullable=False),
        sa.Column("targeted_skill_keys_json", sa.JSON(), nullable=False),
        sa.Column("best_score", sa.Float(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("perfect_streak", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("best_score >= 0 AND best_score <= 1"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_review_phrases_source_normalized"), "review_phrases", ["source_normalized"], unique=True)
    op.create_index(op.f("ix_review_phrases_status"), "review_phrases", ["status"], unique=False)

    op.create_table(
        "word_learning_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_ru", sa.String(length=120), nullable=False),
        sa.Column("source_normalized", sa.String(length=120), nullable=False),
        sa.Column("translation_sr", sa.String(length=240), nullable=False),
        sa.Column("hint_count", sa.Integer(), nullable=False),
        sa.Column("mastery", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("mastery >= 0 AND mastery <= 1"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_word_learning_items_source_normalized"), "word_learning_items", ["source_normalized"], unique=True)
    op.create_index(op.f("ix_word_learning_items_status"), "word_learning_items", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_word_learning_items_status"), table_name="word_learning_items")
    op.drop_index(op.f("ix_word_learning_items_source_normalized"), table_name="word_learning_items")
    op.drop_table("word_learning_items")
    op.drop_index(op.f("ix_review_phrases_status"), table_name="review_phrases")
    op.drop_index(op.f("ix_review_phrases_source_normalized"), table_name="review_phrases")
    op.drop_table("review_phrases")
    with op.batch_alter_table("attempts") as batch_op:
        batch_op.drop_column("hinted_words_json")
