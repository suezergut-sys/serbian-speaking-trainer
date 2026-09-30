"""Add leased attempt reservations without changing saved attempt history.

Revision ID: e926b83f4d10
Revises: c7d91a2e5b60
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e926b83f4d10"
down_revision: str | None = "c7d91a2e5b60"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("attempt_requests") as batch:
        batch.add_column(sa.Column("exercise_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("reserved_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("fencing_token", sa.Integer(), nullable=False, server_default="1"))
        batch.create_foreign_key("fk_attempt_requests_exercise_id", "exercises", ["exercise_id"], ["id"], ondelete="CASCADE")


def downgrade() -> None:
    with op.batch_alter_table("attempt_requests") as batch:
        batch.drop_constraint("fk_attempt_requests_exercise_id", type_="foreignkey")
        batch.drop_column("fencing_token")
        batch.drop_column("lease_expires_at")
        batch.drop_column("reserved_at")
        batch.drop_column("exercise_id")
