"""db hardening

Revision ID: a975a94b76fa
Revises: a3f1c9d2b7e4
Create Date: 2026-11-06 12:40:18.817007

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a975a94b76fa'
down_revision: Union[str, Sequence[str], None] = 'a3f1c9d2b7e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
        # --- Шаг 1: FK проекта без RESTRICT ---
    op.drop_constraint('fk_transactions_project_id_business_projects', 'transactions', type_='foreignkey')
    op.create_foreign_key(
        'fk_transactions_project_id_business_projects',
        'transactions', 'business_projects',
        ['project_id'], ['id'],
    )
        # --- Шаг 2: email в нижнем регистре ---
    op.execute("UPDATE users SET email = lower(email) WHERE email IS NOT NULL")
    op.create_check_constraint(
        'ck_users_email_lowercase', 'users',
        'email IS NULL OR email = lower(email)',
    )

        # --- Шаг 4: составной FK проекта ---
    op.create_unique_constraint('uq_business_projects_id_user_id', 'business_projects', ['id', 'user_id'])
    op.drop_constraint('fk_transactions_project_id_business_projects', 'transactions', type_='foreignkey')
    op.create_foreign_key(
        'fk_transactions_project_id_user_id_business_projects',
        'transactions', 'business_projects',
        ['project_id', 'user_id'], ['id', 'user_id'],
    )

        # --- Шаг 5: уникальность названий категорий без учёта регистра ---
    op.drop_constraint('uq_categories_user_id_name_type', 'categories', type_='unique')
    op.drop_index('uq_categories_system_name_type', table_name='categories')
    op.create_index(
        'uq_categories_user_lower_name_type', 'categories',
        ['user_id', sa.text('lower(name)'), 'type'],
        unique=True, postgresql_where=sa.text('user_id IS NOT NULL'),
    )
    op.create_index(
        'uq_categories_system_lower_name_type', 'categories',
        [sa.text('lower(name)'), 'type'],
        unique=True, postgresql_where=sa.text('user_id IS NULL'),
    )

def downgrade() -> None:
    """Downgrade schema."""
        # --- Шаг 1 (откат) ---
    op.drop_constraint('fk_transactions_project_id_business_projects', 'transactions', type_='foreignkey')
    op.create_foreign_key(
        'fk_transactions_project_id_business_projects',
        'transactions', 'business_projects',
        ['project_id'], ['id'], ondelete='RESTRICT',
    )
        # --- Шаг 2 (откат) ---
    op.drop_constraint('ck_users_email_lowercase', 'users', type_='check')

        # --- Шаг 4 (откат) ---
    op.drop_constraint('fk_transactions_project_id_user_id_business_projects', 'transactions', type_='foreignkey')
    op.drop_constraint('uq_business_projects_id_user_id', 'business_projects', type_='unique')
    op.create_foreign_key(
        'fk_transactions_project_id_business_projects',
        'transactions', 'business_projects',
        ['project_id'], ['id'],
    )

        # --- Шаг 5 (откат) ---
    op.drop_index('uq_categories_system_lower_name_type', table_name='categories')
    op.drop_index('uq_categories_user_lower_name_type', table_name='categories')
    op.create_unique_constraint('uq_categories_user_id_name_type', 'categories', ['user_id', 'name', 'type'])
    op.create_index(
        'uq_categories_system_name_type', 'categories', ['name', 'type'],
        unique=True, postgresql_where=sa.text('user_id IS NULL'),
    )
    