"""add custom empty topics and seed miscellaneous

Revision ID: e4b7a2c9d105
Revises: d71c40a9f23b
Create Date: 2026-09-20 16:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4b7a2c9d105"
down_revision: Union[str, None] = "d71c40a9f23b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("topic_presets") as batch_op:
        batch_op.add_column(sa.Column("is_custom", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute(
        """
        INSERT INTO topic_presets
            (id, title_ru, description_ru, intents_json, vocabulary_json, enabled, is_custom)
        SELECT
            'misc', 'Разное', 'Пустая тема для пользовательских фраз.', '[]', '[]', 1, 0
        WHERE NOT EXISTS (SELECT 1 FROM topic_presets WHERE id = 'misc')
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM topic_presets WHERE id = 'misc'")
    with op.batch_alter_table("topic_presets") as batch_op:
        batch_op.drop_column("is_custom")
