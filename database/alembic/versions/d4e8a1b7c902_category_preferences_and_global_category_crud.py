"""Persist per-user visibility for system categories.

Revision ID: d4e8a1b7c902
Revises: c82f4a91d6e3
"""
from alembic import op
import sqlalchemy as sa

revision = "d4e8a1b7c902"
down_revision = "c82f4a91d6e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "category_preferences",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.UniqueConstraint("user_id", "category_id", name="uq_category_preferences_user_category"),
    )
    op.create_index("ix_category_preferences_user_id", "category_preferences", ["user_id"])
    op.create_index("ix_category_preferences_category_id", "category_preferences", ["category_id"])


def downgrade() -> None:
    op.drop_index("ix_category_preferences_category_id", table_name="category_preferences")
    op.drop_index("ix_category_preferences_user_id", table_name="category_preferences")
    op.drop_table("category_preferences")
