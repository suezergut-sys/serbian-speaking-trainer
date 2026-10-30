"""android_account_premium

Revision ID: 8fd7172bc955
Revises: 7db9f01a2201
Create Date: 2026-10-30 14:09:31.762432
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8fd7172bc955'
down_revision: Union[str, None] = '7db9f01a2201'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("android_premium_granted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table("deleted_account_markers",
        sa.Column("identity_hash", sa.String(64), primary_key=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_deleted_account_markers_expires_at", "deleted_account_markers", ["expires_at"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE deleted_account_markers ENABLE ROW LEVEL SECURITY")
        op.execute("REVOKE ALL ON deleted_account_markers FROM PUBLIC")
        for role in ("anon", "authenticated"):
            if op.get_bind().scalar(sa.text("SELECT 1 FROM pg_roles WHERE rolname=:name"), {"name": role}):
                op.execute(f"REVOKE ALL ON deleted_account_markers FROM {role}")


def downgrade() -> None:
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM deleted_account_markers WHERE expires_at > CURRENT_TIMESTAMP")):
        raise RuntimeError("Cannot remove active deleted-account token guards")
    op.drop_index("ix_deleted_account_markers_expires_at", table_name="deleted_account_markers")
    op.drop_table("deleted_account_markers")
    # Premium itself remains active when rolling back provenance support.
    op.drop_column("users", "android_premium_granted_at")
