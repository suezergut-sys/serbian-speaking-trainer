"""Store the shared opt-in assistance preference on the user profile."""
from alembic import op
import sqlalchemy as sa

revision = "f42b8c012d33"
down_revision = "f31a7b901c22"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("assistance_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    # Native DROP COLUMN preserves dependent training history in SQLite 3.35+.
    # Rebuilding users with batch_alter_table would trigger ON DELETE CASCADE.
    op.drop_column("users", "assistance_enabled")
