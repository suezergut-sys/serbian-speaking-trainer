"""Allow preset topics with more than twenty phrases.

Revision ID: 3f90d5a9b8c3
Revises: 2e89c4f8a7b2
"""
from alembic import op
import sqlalchemy as sa

revision = "3f90d5a9b8c3"
down_revision = "2e89c4f8a7b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    checks = sa.inspect(op.get_bind()).get_check_constraints("topic_phrases")
    old = next(check for check in checks if "position" in check["sqltext"] and "20" in check["sqltext"])
    # Original SQLite constraint is unnamed; PostgreSQL supplies its own name.
    with op.batch_alter_table("topic_phrases", naming_convention={"ck": "ck_%(table_name)s_position"}) as batch:
        batch.drop_constraint(old["name"] or "ck_topic_phrases_position", type_="check")
        batch.create_check_constraint("ck_topic_phrases_position_positive", "position >= 1")


def downgrade() -> None:
    if op.get_bind().scalar(sa.text("SELECT COUNT(*) FROM topic_phrases WHERE position > 20")):
        raise RuntimeError("Cannot restore the 20-phrase limit while positions above 20 exist; migrate those catalog rows explicitly first. No learner data was deleted.")
    with op.batch_alter_table("topic_phrases") as batch:
        batch.drop_constraint("ck_topic_phrases_position_positive", type_="check")
        batch.create_check_constraint("ck_topic_phrases_position_legacy", "position >= 1 AND position <= 20")
