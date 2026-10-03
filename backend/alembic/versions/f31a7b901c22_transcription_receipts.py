"""Text-only receipts for opt-in transcription assistance."""
from alembic import op
import sqlalchemy as sa

revision = "f31a7b901c22"
down_revision = "e926b83f4d10"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("transcription_receipts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exercise_id", sa.String(36), sa.ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("changes_json", sa.JSON(), nullable=False),
        sa.Column("policy_version", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_transcription_receipts_user_id", "transcription_receipts", ["user_id"])
    op.create_index("ix_transcription_receipts_exercise_id", "transcription_receipts", ["exercise_id"])
    if op.get_bind().dialect.name == "postgresql":
        # Backend-only text: no browser/Data API policies. The established
        # backend owner role accesses this table through authenticated services.
        op.execute("ALTER TABLE transcription_receipts ENABLE ROW LEVEL SECURITY")
        op.execute("REVOKE ALL ON transcription_receipts FROM PUBLIC")
        for role in ("anon", "authenticated"):
            if op.get_bind().execute(sa.text("SELECT 1 FROM pg_roles WHERE rolname = :role"), {"role": role}).scalar():
                op.execute(f"REVOKE ALL ON transcription_receipts FROM {role}")


def downgrade():
    op.drop_table("transcription_receipts")
