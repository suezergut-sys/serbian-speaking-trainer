"""bilingual custom topic titles

Revision ID: 6ccb82f56983
Revises: a910bc57d302
Create Date: 2026-10-25 12:48:56.564980
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '6ccb82f56983'
down_revision: Union[str, None] = 'a910bc57d302'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("topic_presets", sa.Column("title_en", sa.String(160), nullable=True))


def downgrade() -> None:
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM topic_presets WHERE title_en IS NOT NULL")):
        raise RuntimeError("Cannot discard saved topic title translations; export them before downgrade")
    op.drop_column("topic_presets", "title_en")
