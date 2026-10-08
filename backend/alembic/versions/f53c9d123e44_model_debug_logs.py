"""Private administrator model diagnostics with deletion fencing."""
from alembic import op
import sqlalchemy as sa

revision = "f53c9d123e44"
down_revision = "f42b8c012d33"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("model_debug_settings",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("generation", sa.Integer(), nullable=False, server_default="0"))
    op.create_table("model_debug_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("operation", sa.String(100), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_ms", sa.Float(), nullable=False),
        sa.Column("request_json", sa.JSON(), nullable=False),
        sa.Column("response_json", sa.JSON(), nullable=True),
        sa.Column("error_json", sa.JSON(), nullable=True))
    op.create_index("ix_model_debug_logs_user_id", "model_debug_logs", ["user_id"])
    if op.get_bind().dialect.name == "postgresql":
        for table in ("model_debug_settings", "model_debug_logs"):
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
            op.execute(f"REVOKE ALL ON TABLE {table} FROM PUBLIC")
            # Works outside Supabase too, where these roles may not exist.
            op.execute(f"""DO $$ BEGIN
                IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
                    REVOKE ALL ON TABLE {table} FROM anon;
                END IF;
                IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
                    REVOKE ALL ON TABLE {table} FROM authenticated;
                END IF;
            END $$""")


def downgrade():
    op.drop_index("ix_model_debug_logs_user_id", table_name="model_debug_logs")
    op.drop_table("model_debug_logs")
    op.drop_table("model_debug_settings")
