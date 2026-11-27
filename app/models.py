"""Единая SQLAlchemy-модель Finzentra: финансовый реестр + staging импорта."""
import enum
from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime, Enum, Float,
    ForeignKey, ForeignKeyConstraint, Index, Integer, MetaData, Numeric,
    String, Text, UniqueConstraint, func, text,
)
from sqlalchemy.orm import declarative_base, relationship

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}
Base = declarative_base(metadata=MetaData(naming_convention=NAMING_CONVENTION))

class TransactionType(str, enum.Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    TAX = "TAX"

# Обратная совместимость для классификатора из ветки импорта.
CategoryType = TransactionType
transaction_type_enum = Enum(TransactionType, name="transaction_type")

class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email IS NOT NULL OR phone IS NOT NULL OR yandex_id IS NOT NULL OR vk_id IS NOT NULL", name="has_login_method"),
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

class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        Index("uq_categories_user_project_lower_name_type", "user_id", "project_id", text("lower(name)"), "type", unique=True, postgresql_where=text("user_id IS NOT NULL AND project_id IS NOT NULL")),
        Index("uq_categories_user_global_lower_name_type", "user_id", text("lower(name)"), "type", unique=True, postgresql_where=text("user_id IS NOT NULL AND project_id IS NULL")),
        Index("uq_categories_system_lower_name_type", text("lower(name)"), "type", unique=True, postgresql_where=text("user_id IS NULL")),
        UniqueConstraint("id", "type", name="uq_categories_id_type"),
        CheckConstraint("char_length(name) BETWEEN 2 AND 48", name="name_length"),
        CheckConstraint("(is_system AND user_id IS NULL) OR (NOT is_system AND user_id IS NOT NULL)", name="system_has_no_owner"),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("business_projects.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(48), nullable=False)
    type = Column(transaction_type_enum, nullable=False)
    is_system = Column(Boolean, nullable=False, server_default=text("false"))
    is_active = Column(Boolean, nullable=False, server_default=text("true"))

class CategoryPreference(Base):
    """User-specific visibility settings for shared system categories."""
    __tablename__ = "category_preferences"
    __table_args__ = (UniqueConstraint("user_id", "category_id", name="uq_category_preferences_user_category"),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, server_default=text("true"))

class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        ForeignKeyConstraint(["category_id", "type"], ["categories.id", "categories.type"], name="fk_transactions_category_id_type_categories"),
        ForeignKeyConstraint(["project_id", "user_id"], ["business_projects.id", "business_projects.user_id"], name="fk_transactions_project_id_user_id_business_projects"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("amount < 1000000000000", name="amount_max"),
        CheckConstraint("comment IS NULL OR char_length(comment) <= 255", name="comment_length"),
        Index("ix_transactions_user_id_date_period", "user_id", "date_period"),
        Index("ix_transactions_user_id_date_fact", "user_id", "date_fact"),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(Integer, nullable=False, index=True)
    category_id = Column(Integer, nullable=False, index=True)
    type = Column(transaction_type_enum, nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    date_fact = Column(Date, nullable=False)
    date_period = Column(Date, nullable=False)
    comment = Column(String(255), nullable=True)
    attachment_url = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

# Таблицы ниже — временная зона импорта. Они не заменяют transactions.
class ImportBatch(Base):
    __tablename__ = "import_batches"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id = Column(String(255), nullable=True)
    filename = Column(String(255), nullable=False)
    file_format = Column(String(20), nullable=False)
    status = Column(String(50), nullable=False, server_default="uploaded")
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    transactions = relationship("ImportedTransaction", back_populates="batch", cascade="all, delete-orphan")

class ImportedTransaction(Base):
    __tablename__ = "imported_transactions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    import_batch_id = Column(Integer, ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id = Column(String(255), nullable=True)
    external_id = Column(String(255), nullable=True)
    transaction_date = Column(Date, nullable=True)
    date_fact = Column(Date, nullable=True)
    date_period = Column(Date, nullable=True)
    amount = Column(Numeric(14, 2), nullable=True)
    direction = Column(String(50), nullable=True)
    currency = Column(String(20), nullable=True)
    description = Column(Text, nullable=True)
    counterparty = Column(String(255), nullable=True)
    operation_type = Column(String(100), nullable=True)
    status = Column(String(50), nullable=False, server_default="pending_review")
    validation_error = Column(Text, nullable=True)
    duplicate_hash = Column(String(64), nullable=True, index=True)
    duplicate_source = Column(String(20), nullable=True)
    is_duplicate = Column(String(50), nullable=False, server_default="none")
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    batch = relationship("ImportBatch", back_populates="transactions")
    suggestions = relationship("TransactionSuggestion", back_populates="imported_transaction", cascade="all, delete-orphan")

class TransactionSuggestion(Base):
    __tablename__ = "transaction_suggestions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    imported_transaction_id = Column(Integer, ForeignKey("imported_transactions.id", ondelete="CASCADE"), nullable=False, unique=True)
    operation_type = Column(String(100), nullable=True)
    category_id = Column(String(255), nullable=True)
    project_id = Column(String(255), nullable=True)
    business_status = Column(String(50), nullable=True)
    confidence = Column(Float, nullable=True)
    reason = Column(Text, nullable=True)
    user_decision = Column(String(50), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    imported_transaction = relationship("ImportedTransaction", back_populates="suggestions")

class TransactionRule(Base):
    __tablename__ = "transaction_rules"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    keyword = Column(String(255), nullable=True)
    counterparty = Column(String(255), nullable=True)
    operation_type = Column(String(100), nullable=True)
    category_name = Column(String(255), nullable=True)
    project_name = Column(String(255), nullable=True)
    business_status = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
