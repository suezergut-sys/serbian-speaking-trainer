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
    topic_presets = sa.table(
        "topic_presets",
        sa.column("id", sa.String()),
        sa.column("title_ru", sa.String()),
        sa.column("description_ru", sa.Text()),
        sa.column("intents_json", sa.JSON()),
        sa.column("vocabulary_json", sa.JSON()),
        sa.column("enabled", sa.Boolean()),
        sa.column("is_custom", sa.Boolean()),
    )
    connection = op.get_bind()
    exists = connection.scalar(sa.select(sa.literal(True)).where(sa.exists().where(topic_presets.c.id == "misc")))
    if not exists:
        connection.execute(
            topic_presets.insert().values(
                id="misc",
                title_ru="Разное",
                description_ru="Пустая тема для пользовательских фраз.",
                intents_json=[],
                vocabulary_json=[],
                enabled=True,
                is_custom=False,
            )
        )


def downgrade() -> None:
    op.execute("DELETE FROM topic_presets WHERE id = 'misc'")
    with op.batch_alter_table("topic_presets") as batch_op:
        batch_op.drop_column("is_custom")
