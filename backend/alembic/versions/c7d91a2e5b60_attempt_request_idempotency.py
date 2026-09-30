"""Store idempotent attempt responses by user and client request ID.

Revision ID: c7d91a2e5b60
Revises: f19a8d6c2b40
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c7d91a2e5b60"
down_revision: str | None = "f19a8d6c2b40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Do not rebuild this parent table: SQLite ON DELETE CASCADE would erase attempts.
    op.add_column("exercises", sa.Column("client_request_id", sa.String(length=36), nullable=True))
    op.create_index("uq_exercises_session_request", "exercises", ["session_id", "client_request_id"], unique=True)
    op.create_table(
        "attempt_requests",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("client_request_id", sa.String(length=36), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("attempt_id", sa.String(length=36), nullable=True),
        sa.Column("response_json", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["attempt_id"], ["attempts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "client_request_id"),
    )


def downgrade() -> None:
    op.drop_table("attempt_requests")
    op.drop_index("uq_exercises_session_request", table_name="exercises")
    op.drop_column("exercises", "client_request_id")
