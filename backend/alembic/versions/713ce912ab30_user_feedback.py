"""Store text feedback separately from training records."""
from alembic import op
import sqlalchemy as sa

revision = "713ce912ab30"
down_revision = "3f90d5a9b8c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("user_feedback",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=False))
    op.create_index("ix_user_feedback_user_id", "user_feedback", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_feedback")
