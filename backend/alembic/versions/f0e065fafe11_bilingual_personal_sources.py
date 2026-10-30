"""bilingual_personal_sources

Revision ID: f0e065fafe11
Revises: 8fd7172bc955
Create Date: 2026-10-30 19:24:42.566027
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f0e065fafe11'
down_revision: Union[str, None] = '8fd7172bc955'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("review_phrases", sa.Column("source_versions_json", sa.JSON(), nullable=False, server_default='{}'))


def downgrade() -> None:
    op.drop_column("review_phrases", "source_versions_json")
