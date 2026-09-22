"""store word hints with preset topic phrases

Revision ID: b81d2e4f6a90
Revises: a62f8b9c1d04
Create Date: 2026-09-19 09:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b81d2e4f6a90"
down_revision: Union[str, None] = "a62f8b9c1d04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("topic_phrases") as batch_op:
        batch_op.add_column(sa.Column("word_hints_json", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    with op.batch_alter_table("topic_phrases") as batch_op:
        batch_op.drop_column("word_hints_json")
