"""Initial schema creation

Revision ID: 255ebc974c16
Revises:
Create Date: 2026-10-18 14:46:54.635802

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '255ebc974c16'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# create_type=False: тип создаём и удаляем вручную, один раз для двух таблиц
transaction_type = postgresql.ENUM('INCOME', 'EXPENSE', 'TAX', name='transaction_type', create_type=False)

# Системные категории (как в интерфейсе: App.tsx -> initialLiveCategories)
SYSTEM_CATEGORIES = [
    ('Аренда', 'EXPENSE'),
    ('Коммуналка', 'EXPENSE'),
    ('Интернет', 'EXPENSE'),
    ('Продажи', 'INCOME'),
    ('Авансы', 'INCOME'),
    ('Прочие поступления', 'INCOME'),
    ('УСН 6%', 'TAX'),
    ('УСН 15%', 'TAX'),
    ('Страховые взносы', 'TAX'),
    ('НДФЛ', 'TAX'),
    ('Транспортный налог', 'TAX'),
]


def upgrade() -> None:
    """Upgrade schema."""
    postgresql.ENUM('INCOME', 'EXPENSE', 'TAX', name='transaction_type').create(op.get_bind(), checkfirst=True)

    # --- users ---
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=100), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('yandex_id', sa.String(length=255), nullable=True),
        sa.Column('vk_id', sa.String(length=255), nullable=True),
        sa.Column('password_hash', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint(
            'email IS NOT NULL OR phone IS NOT NULL OR yandex_id IS NOT NULL OR vk_id IS NOT NULL',
            name='ck_users_has_login_method',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_users'),
        sa.UniqueConstraint('yandex_id', name='uq_users_yandex_id'),
        sa.UniqueConstraint('vk_id', name='uq_users_vk_id'),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_phone', 'users', ['phone'], unique=True)

    # --- business_projects ---
    op.create_table(
        'business_projects',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=60), nullable=False),
        sa.Column('description', sa.String(length=120), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('char_length(name) BETWEEN 2 AND 60', name='ck_business_projects_name_length'),
        sa.CheckConstraint(
            'description IS NULL OR char_length(description) <= 120',
            name='ck_business_projects_description_length',
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_business_projects_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_business_projects'),
        sa.UniqueConstraint('user_id', 'name', name='uq_business_projects_user_id_name'),
    )
    op.create_index('ix_business_projects_user_id', 'business_projects', ['user_id'])

    # --- categories ---
    op.create_table(
        'categories',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=48), nullable=False),
        sa.Column('type', transaction_type, nullable=False),
        sa.Column('is_system', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.CheckConstraint('char_length(name) BETWEEN 2 AND 48', name='ck_categories_name_length'),
        sa.CheckConstraint(
            '(is_system AND user_id IS NULL) OR (NOT is_system AND user_id IS NOT NULL)',
            name='ck_categories_system_has_no_owner',
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_categories_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_categories'),
        sa.UniqueConstraint('user_id', 'name', 'type', name='uq_categories_user_id_name_type'),
        sa.UniqueConstraint('id', 'type', name='uq_categories_id_type'),
    )
    op.create_index('ix_categories_user_id', 'categories', ['user_id'])
    op.create_index(
        'uq_categories_system_name_type',
        'categories',
        ['name', 'type'],
        unique=True,
        postgresql_where=sa.text('user_id IS NULL'),
    )

    # --- transactions ---
    op.create_table(
        'transactions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('type', transaction_type, nullable=False),
        sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('date_fact', sa.Date(), nullable=False),
        sa.Column('date_period', sa.Date(), nullable=False),
        sa.Column('comment', sa.String(length=255), nullable=True),
        sa.Column('attachment_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('amount > 0', name='ck_transactions_amount_positive'),
        sa.CheckConstraint('amount < 1000000000000', name='ck_transactions_amount_max'),
        sa.CheckConstraint('comment IS NULL OR char_length(comment) <= 255', name='ck_transactions_comment_length'),
        sa.ForeignKeyConstraint(
            ['category_id', 'type'],
            ['categories.id', 'categories.type'],
            name='fk_transactions_category_id_type_categories',
        ),
        sa.ForeignKeyConstraint(['project_id'], ['business_projects.id'], name='fk_transactions_project_id_business_projects', ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_transactions_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_transactions'),
    )
    op.create_index('ix_transactions_project_id', 'transactions', ['project_id'])
    op.create_index('ix_transactions_category_id', 'transactions', ['category_id'])
    op.create_index('ix_transactions_user_id_date_period', 'transactions', ['user_id', 'date_period'])
    op.create_index('ix_transactions_user_id_date_fact', 'transactions', ['user_id', 'date_fact'])

    # --- системные категории ---
    categories = sa.table(
        'categories',
        sa.column('name', sa.String),
        sa.column('type', transaction_type),
        sa.column('is_system', sa.Boolean),
        sa.column('is_active', sa.Boolean),
    )
    op.bulk_insert(
        categories,
        [{'name': n, 'type': t, 'is_system': True, 'is_active': True} for n, t in SYSTEM_CATEGORIES],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('transactions')
    op.drop_table('categories')
    op.drop_table('business_projects')
    op.drop_table('users')
    postgresql.ENUM(name='transaction_type').drop(op.get_bind(), checkfirst=True)