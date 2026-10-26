"""Manual Premium payment requests.

Revision ID: 7db9f01a2201
Revises: 6ccb82f56983
"""
from alembic import op
import sqlalchemy as sa

revision = "7db9f01a2201"
down_revision = "6ccb82f56983"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("premium_payment_id", sa.String(36), nullable=True))
    op.create_table("payment_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("active_user_id", sa.String(36), unique=True),
        sa.Column("country", sa.String(20), nullable=False),
        sa.Column("method", sa.String(20), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("activation", sa.JSON(), nullable=False),
        sa.Column("provisional_granted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("reported_amount", sa.String(20)),
        sa.Column("transaction_id", sa.String(200)),
        sa.Column("reviewed_by", sa.String(36)),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("country IN ('russia','serbia','other')", name="ck_payment_country"),
        sa.CheckConstraint("method IN ('sbp','alta','paypal')", name="ck_payment_method"),
        sa.CheckConstraint("status IN ('awaiting_payment','awaiting_review','confirmed','rejected','cancelled')", name="ck_payment_status"),
        sa.CheckConstraint("(status IN ('awaiting_payment','awaiting_review') AND active_user_id = user_id AND active_user_id IS NOT NULL) OR (status IN ('confirmed','rejected','cancelled') AND active_user_id IS NULL)", name="ck_payment_active"),
    )
    op.create_index("ix_payment_requests_user_id", "payment_requests", ["user_id"])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM payment_requests")) or op.get_bind().scalar(sa.text("SELECT count(*) FROM users WHERE premium_payment_id IS NOT NULL")):
        raise RuntimeError("Cannot discard payment records; export them before downgrade")
    op.drop_index("ix_payment_requests_user_id", table_name="payment_requests")
    op.drop_table("payment_requests")
    op.drop_column("users", "premium_payment_id")
