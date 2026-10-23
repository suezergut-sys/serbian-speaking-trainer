"""Server-owned canonical phrase preparation, owner-scoped and expiring.

Revision ID: a910bc57d302
Revises: 84bc27e9a101
"""
from alembic import op
import sqlalchemy as sa

revision = "a910bc57d302"
down_revision = "84bc27e9a101"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "phrase_preparation_receipts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_ru", sa.Text(), nullable=False),
        sa.Column("preparation_json", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("saved_phrase_id", sa.String(36), nullable=True),
        sa.Column("saved_topic_id", sa.String(80), nullable=True),
    )
    op.create_index("ix_phrase_preparation_receipts_user_id", "phrase_preparation_receipts", ["user_id"])
    op.create_index("ix_phrase_preparation_receipts_expires_at", "phrase_preparation_receipts", ["expires_at"])


def downgrade():
    op.drop_table("phrase_preparation_receipts")
