"""Add statement import staging tables.

Revision ID: b71c2d8e4f90
Revises: a975a94b76fa
"""
from alembic import op
import sqlalchemy as sa

revision = "b71c2d8e4f90"
down_revision = "a975a94b76fa"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        "import_batches",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.String(255), nullable=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_format", sa.String(20), nullable=False),
        sa.Column("status", sa.String(50), server_default="uploaded", nullable=False),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_import_batches_user_id", "import_batches", ["user_id"])
    op.create_table(
        "imported_transactions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("import_batch_id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.String(255), nullable=True),
        sa.Column("external_id", sa.String(255), nullable=True),
        sa.Column("transaction_date", sa.Date(), nullable=True),
        sa.Column("date_fact", sa.Date(), nullable=True),
        sa.Column("date_period", sa.Date(), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("direction", sa.String(50), nullable=True),
        sa.Column("currency", sa.String(20), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("counterparty", sa.String(255), nullable=True),
        sa.Column("operation_type", sa.String(100), nullable=True),
        sa.Column("status", sa.String(50), server_default="pending_review", nullable=False),
        sa.Column("validation_error", sa.Text(), nullable=True),
        sa.Column("duplicate_hash", sa.String(64), nullable=True),
        sa.Column("duplicate_source", sa.String(20), nullable=True),
        sa.Column("is_duplicate", sa.String(50), server_default="none", nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["import_batch_id"], ["import_batches.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_imported_transactions_import_batch_id", "imported_transactions", ["import_batch_id"])
    op.create_index("ix_imported_transactions_duplicate_hash", "imported_transactions", ["duplicate_hash"])
    op.create_table(
        "transaction_suggestions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("imported_transaction_id", sa.Integer(), nullable=False),
        sa.Column("operation_type", sa.String(100), nullable=True),
        sa.Column("category_id", sa.String(255), nullable=True),
        sa.Column("project_id", sa.String(255), nullable=True),
        sa.Column("business_status", sa.String(50), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("user_decision", sa.String(50), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["imported_transaction_id"], ["imported_transactions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("imported_transaction_id", name="uq_transaction_suggestions_imported_transaction_id"),
    )
    op.create_table(
        "transaction_rules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("keyword", sa.String(255), nullable=True),
        sa.Column("counterparty", sa.String(255), nullable=True),
        sa.Column("operation_type", sa.String(100), nullable=True),
        sa.Column("category_name", sa.String(255), nullable=True),
        sa.Column("project_name", sa.String(255), nullable=True),
        sa.Column("business_status", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_transaction_rules_user_id", "transaction_rules", ["user_id"])

def downgrade() -> None:
    op.drop_table("transaction_rules")
    op.drop_table("transaction_suggestions")
    op.drop_index("ix_imported_transactions_duplicate_hash", table_name="imported_transactions")
    op.drop_index("ix_imported_transactions_import_batch_id", table_name="imported_transactions")
    op.drop_table("imported_transactions")
    op.drop_index("ix_import_batches_user_id", table_name="import_batches")
    op.drop_table("import_batches")
