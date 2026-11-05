"""Add password reset tokens

Revision ID: a3f1c9d2b7e4
Revises: 255ebc974c16
Create Date: 2026-11-06 02:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f1c9d2b7e4'
down_revision: Union[str, Sequence[str], None] = '255ebc974c16'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'password_reset_tokens',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_password_reset_tokens_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_password_reset_tokens'),
        sa.UniqueConstraint('token_hash', name='uq_password_reset_tokens_token_hash'),
    )
    op.create_index('ix_password_reset_tokens_user_id', 'password_reset_tokens', ['user_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('password_reset_tokens')