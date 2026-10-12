"""temporary_debug_audio

Revision ID: 2e89c4f8a7b2
Revises: f53c9d123e44
Create Date: 2026-10-12 17:19:31.781643
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '2e89c4f8a7b2'
down_revision: Union[str, None] = 'f53c9d123e44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('model_debug_logs', sa.Column('audio_payload', sa.LargeBinary(), nullable=True))
    op.add_column('model_debug_logs', sa.Column('audio_content_type', sa.String(100), nullable=True))
    op.add_column('model_debug_logs', sa.Column('audio_expires_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('model_debug_logs') as batch:
        batch.drop_column('audio_expires_at')
        batch.drop_column('audio_content_type')
        batch.drop_column('audio_payload')

