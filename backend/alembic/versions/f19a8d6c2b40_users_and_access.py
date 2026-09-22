"""add users, ownership and access fields

Revision ID: f19a8d6c2b40
Revises: e4b7a2c9d105
"""

from collections.abc import Sequence
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision: str = "f19a8d6c2b40"
down_revision: str | None = "e4b7a2c9d105"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LEGACY_USER_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=200), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="user"),
        sa.Column("access_tier", sa.String(length=40), nullable=False, server_default="free"),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
        sa.CheckConstraint("access_tier IN ('free', 'premium')", name="ck_users_access_tier"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_role"), "users", ["role"], unique=False)
    op.create_index(op.f("ix_users_access_tier"), "users", ["access_tier"], unique=False)
    op.create_index(op.f("ix_users_last_active_at"), "users", ["last_active_at"], unique=False)

    now = datetime.now(timezone.utc)
    users = sa.table(
        "users",
        sa.column("id", sa.String), sa.column("email", sa.String),
        sa.column("display_name", sa.String), sa.column("role", sa.String),
        sa.column("access_tier", sa.String), sa.column("registered_at", sa.DateTime),
        sa.column("last_active_at", sa.DateTime),
    )
    op.bulk_insert(users, [{
        "id": LEGACY_USER_ID,
        "email": "legacy@local.invalid",
        "display_name": "Legacy local data",
        "role": "user",
        "access_tier": "free",
        "registered_at": now,
        "last_active_at": now,
    }])

    with op.batch_alter_table("training_sessions") as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.String(length=36), nullable=True))
        batch_op.create_foreign_key("fk_training_sessions_user_id", "users", ["user_id"], ["id"], ondelete="CASCADE")
        batch_op.create_index(op.f("ix_training_sessions_user_id"), ["user_id"], unique=False)
    op.execute(sa.text("UPDATE training_sessions SET user_id = :legacy").bindparams(legacy=LEGACY_USER_ID))
    with op.batch_alter_table("training_sessions") as batch_op:
        batch_op.alter_column("user_id", existing_type=sa.String(length=36), nullable=False)

    with op.batch_alter_table("topic_presets") as batch_op:
        batch_op.add_column(sa.Column("owner_user_id", sa.String(length=36), nullable=True))
        batch_op.create_foreign_key("fk_topic_presets_owner_user_id", "users", ["owner_user_id"], ["id"], ondelete="CASCADE")
        batch_op.create_index(op.f("ix_topic_presets_owner_user_id"), ["owner_user_id"], unique=False)
    op.execute(sa.text("UPDATE topic_presets SET owner_user_id = :legacy WHERE is_custom = true").bindparams(legacy=LEGACY_USER_ID))

    for table_name, source_index, unique_name in (
        ("review_phrases", "ix_review_phrases_source_normalized", "uq_review_phrases_user_source"),
        ("word_learning_items", "ix_word_learning_items_source_normalized", "uq_word_learning_user_source"),
    ):
        check = (
            sa.CheckConstraint("best_score >= 0 AND best_score <= 1")
            if table_name == "review_phrases"
            else sa.CheckConstraint("mastery >= 0 AND mastery <= 1")
        )
        with op.batch_alter_table(table_name, table_args=(check,)) as batch_op:
            batch_op.add_column(sa.Column("user_id", sa.String(length=36), nullable=True))
            batch_op.drop_index(source_index)
            batch_op.create_index(source_index, ["source_normalized"], unique=False)
            batch_op.create_foreign_key(f"fk_{table_name}_user_id", "users", ["user_id"], ["id"], ondelete="CASCADE")
            batch_op.create_index(op.f(f"ix_{table_name}_user_id"), ["user_id"], unique=False)
            batch_op.create_unique_constraint(unique_name, ["user_id", "source_normalized"])
        op.execute(sa.text(f"UPDATE {table_name} SET user_id = :legacy").bindparams(legacy=LEGACY_USER_ID))
        with op.batch_alter_table(table_name, table_args=(check,)) as batch_op:
            batch_op.alter_column("user_id", existing_type=sa.String(length=36), nullable=False)

    op.create_table(
        "learner_skills_v2",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("skill_id", sa.String(length=36), nullable=False),
        sa.Column("mastery", sa.Float(), nullable=False),
        sa.Column("state", sa.String(length=20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("successes", sa.Integer(), nullable=False),
        sa.Column("hesitations", sa.Integer(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("streak", sa.Integer(), nullable=False),
        sa.CheckConstraint("mastery >= 0 AND mastery <= 1"),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "skill_id"),
    )
    op.execute(sa.text(
        "INSERT INTO learner_skills_v2 (user_id, skill_id, mastery, state, attempts, successes, hesitations, last_seen_at, next_review_at, streak) "
        "SELECT :legacy, skill_id, mastery, state, attempts, successes, hesitations, last_seen_at, next_review_at, streak FROM learner_skills"
    ).bindparams(legacy=LEGACY_USER_ID))
    op.drop_table("learner_skills")
    op.rename_table("learner_skills_v2", "learner_skills")


def downgrade() -> None:
    real_user_count = op.get_bind().scalar(
        sa.text("SELECT COUNT(*) FROM users WHERE id <> :legacy").bindparams(legacy=LEGACY_USER_ID)
    )
    if real_user_count:
        raise RuntimeError("Cannot downgrade user ownership while registered users exist")
    op.create_table(
        "learner_skills_v1",
        sa.Column("skill_id", sa.String(length=36), nullable=False),
        sa.Column("mastery", sa.Float(), nullable=False),
        sa.Column("state", sa.String(length=20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("successes", sa.Integer(), nullable=False),
        sa.Column("hesitations", sa.Integer(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("streak", sa.Integer(), nullable=False),
        sa.CheckConstraint("mastery >= 0 AND mastery <= 1"),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("skill_id"),
    )
    op.execute(sa.text(
        "INSERT INTO learner_skills_v1 SELECT skill_id, mastery, state, attempts, successes, hesitations, last_seen_at, next_review_at, streak "
        "FROM learner_skills WHERE user_id = :legacy"
    ).bindparams(legacy=LEGACY_USER_ID))
    op.drop_table("learner_skills")
    op.rename_table("learner_skills_v1", "learner_skills")

    for table_name, source_index, unique_name in (
        ("word_learning_items", "ix_word_learning_items_source_normalized", "uq_word_learning_user_source"),
        ("review_phrases", "ix_review_phrases_source_normalized", "uq_review_phrases_user_source"),
    ):
        check = (
            sa.CheckConstraint("best_score >= 0 AND best_score <= 1")
            if table_name == "review_phrases"
            else sa.CheckConstraint("mastery >= 0 AND mastery <= 1")
        )
        with op.batch_alter_table(table_name, table_args=(check,)) as batch_op:
            batch_op.drop_constraint(unique_name, type_="unique")
            batch_op.drop_index(op.f(f"ix_{table_name}_user_id"))
            batch_op.drop_constraint(f"fk_{table_name}_user_id", type_="foreignkey")
            batch_op.drop_index(source_index)
            batch_op.create_index(source_index, ["source_normalized"], unique=True)
            batch_op.drop_column("user_id")

    with op.batch_alter_table("topic_presets") as batch_op:
        batch_op.drop_index(op.f("ix_topic_presets_owner_user_id"))
        batch_op.drop_constraint("fk_topic_presets_owner_user_id", type_="foreignkey")
        batch_op.drop_column("owner_user_id")
    with op.batch_alter_table("training_sessions") as batch_op:
        batch_op.drop_index(op.f("ix_training_sessions_user_id"))
        batch_op.drop_constraint("fk_training_sessions_user_id", type_="foreignkey")
        batch_op.drop_column("user_id")

    op.drop_index(op.f("ix_users_last_active_at"), table_name="users")
    op.drop_index(op.f("ix_users_access_tier"), table_name="users")
    op.drop_index(op.f("ix_users_role"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
