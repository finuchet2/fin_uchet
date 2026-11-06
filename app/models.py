import enum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import declarative_base

# Единые имена ограничений: Alembic генерирует стабильные миграции
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

Base = declarative_base(metadata=MetaData(naming_convention=NAMING_CONVENTION))


class TransactionType(str, enum.Enum):
    """Тип категории и операции. Совпадает с TransactionType на фронтенде."""
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    TAX = "TAX"


# Один ENUM в БД используется и в categories, и в transactions
transaction_type_enum = Enum(TransactionType, name="transaction_type")


# 1. Пользователи
class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "email IS NOT NULL OR phone IS NOT NULL OR yandex_id IS NOT NULL OR vk_id IS NOT NULL",
            name="has_login_method",
        ),
        CheckConstraint("email IS NULL OR email = lower(email)", name="email_lowercase"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=True)
    phone = Column(String(20), unique=True, index=True, nullable=True)
    yandex_id = Column(String(255), unique=True, nullable=True)
    vk_id = Column(String(255), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# 2. Проекты
class BusinessProject(Base):
    __tablename__ = "business_projects"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_business_projects_user_id_name"),
        UniqueConstraint("id", "user_id", name="uq_business_projects_id_user_id"),
        CheckConstraint("char_length(name) BETWEEN 2 AND 60", name="name_length"),
        CheckConstraint("description IS NULL OR char_length(description) <= 120", name="description_length"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(60), nullable=False)
    description = Column(String(120), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# 3. Категории (user_id IS NULL -> системная категория, общая для всех)
class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        Index(
            "uq_categories_user_lower_name_type",
            "user_id", text("lower(name)"), "type",
            unique=True,
            postgresql_where=text("user_id IS NOT NULL"),
        ),
        Index(
            "uq_categories_system_lower_name_type",
            text("lower(name)"), "type",
            unique=True,
            postgresql_where=text("user_id IS NULL"),
        ),
        # Цель составного внешнего ключа из transactions (category_id, type)
        UniqueConstraint("id", "type", name="uq_categories_id_type"),
        CheckConstraint("char_length(name) BETWEEN 2 AND 48", name="name_length"),
        CheckConstraint(
            "(is_system AND user_id IS NULL) OR (NOT is_system AND user_id IS NOT NULL)",
            name="system_has_no_owner",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(48), nullable=False)
    type = Column(transaction_type_enum, nullable=False)
    is_system = Column(Boolean, nullable=False, server_default=text("false"))
    is_active = Column(Boolean, nullable=False, server_default=text("true"))


# 4. Операции (доходы, расходы и налоги в одной таблице)
class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        # Тип операции обязан совпадать с типом её категории
        ForeignKeyConstraint(
            ["category_id", "type"],
            ["categories.id", "categories.type"],
            name="fk_transactions_category_id_type_categories",
        ),
        ForeignKeyConstraint(
        ["project_id", "user_id"],
        ["business_projects.id", "business_projects.user_id"],
        name="fk_transactions_project_id_user_id_business_projects",
        ),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("amount < 1000000000000", name="amount_max"),  # 12 цифр до запятой
        CheckConstraint("comment IS NULL OR char_length(comment) <= 255", name="comment_length"),
        # Основные запросы: отчёты по периоду начисления и кассовым методом
        Index("ix_transactions_user_id_date_period", "user_id", "date_period"),
        Index("ix_transactions_user_id_date_fact", "user_id", "date_fact"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(Integer, nullable=False, index=True)
    category_id = Column(Integer, nullable=False, index=True)
    type = Column(transaction_type_enum, nullable=False)

    # Сумма всегда положительная, знак определяется типом операции
    amount = Column(Numeric(14, 2), nullable=False)

    date_fact = Column(Date, nullable=False)    # когда деньги реально пришли/ушли (кассовый метод)
    date_period = Column(Date, nullable=False)  # к какому периоду относится (метод начисления)

    comment = Column(String(255), nullable=True)
    attachment_url = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)  # NULL -> токен ещё не использован
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    