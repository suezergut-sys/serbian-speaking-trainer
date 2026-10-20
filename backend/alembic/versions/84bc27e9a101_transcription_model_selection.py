"""Persist the owner-scoped transcription experiment independently of debug mode."""
from alembic import op
import sqlalchemy as sa

revision = "84bc27e9a101"
down_revision = "713ce912ab30"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("model_debug_settings", sa.Column("transcription_model", sa.String(200), nullable=True))


def downgrade():
    op.drop_column("model_debug_settings", "transcription_model")
