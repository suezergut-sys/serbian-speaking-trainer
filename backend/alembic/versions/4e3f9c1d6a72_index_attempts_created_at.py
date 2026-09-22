"""index attempt creation time for monthly statistics

Revision ID: 4e3f9c1d6a72
Revises: 8d2fd4189f3a
Create Date: 2026-09-17 15:00:00
"""
from typing import Sequence, Union

from alembic import op


revision: str = "4e3f9c1d6a72"
down_revision: Union[str, None] = "8d2fd4189f3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(op.f("ix_attempts_created_at"), "attempts", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_attempts_created_at"), table_name="attempts")
