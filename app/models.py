import datetime
import enum
from sqlalchemy import (
    Boolean,
    Column,
    DECIMAL,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    TIMESTAMP,
    Text,
    text,
)
from sqlalchemy.orm import relationship
from app.database import Base


class CategoryType(str, enum.Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    email = Column(String(255), unique=True, index=True, nullable=True)
    phone = Column(String(20), unique=True, index=True, nullable=True)
    yandex_id = Column(String(255), unique=True, nullable=True)
    vk_id = Column(String(255), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=True)
    created_at = Column(
        TIMESTAMP, server_default=text("CURRENT_TIMESTAMP"), nullable=False
    )


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, nullable=True, index=True)
    account_id = Column(String(255), nullable=True)
    filename = Column(String(255), nullable=False)
    file_format = Column(String(20), nullable=False)
    status = Column(String(50), default="uploaded", nullable=False)
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    transactions = relationship(
        "ImportedTransaction", back_populates="batch", cascade="all, delete-orphan"
    )


class ImportedTransaction(Base):
    __tablename__ = "imported_transactions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    import_batch_id = Column(
        Integer, ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False
    )
    account_id = Column(String(255), nullable=True)
    external_id = Column(String(255), nullable=True)
    transaction_date = Column(Date, nullable=True)
    date_fact = Column(Date, nullable=True)
    date_period = Column(Date, nullable=True)
    amount = Column(Float, nullable=True)
    direction = Column(String(50), nullable=True)
    currency = Column(String(20), nullable=True)
    description = Column(Text, nullable=True)
    counterparty = Column(String(255), nullable=True)
    operation_type = Column(String(100), nullable=True)
    status = Column(String(50), default="pending", nullable=False)
    validation_error = Column(Text, nullable=True)
    duplicate_hash = Column(String(255), index=True, nullable=True)
    is_duplicate = Column(String(50), default="none", nullable=False)
    confirmed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    batch = relationship("ImportBatch", back_populates="transactions")
    suggestions = relationship(
        "TransactionSuggestion",
        back_populates="imported_transaction",
        cascade="all, delete-orphan",
    )


class TransactionSuggestion(Base):
    __tablename__ = "transaction_suggestions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    imported_transaction_id = Column(
        Integer,
        ForeignKey("imported_transactions.id", ondelete="CASCADE"),
        nullable=False,
    )
    operation_type = Column(String(100), nullable=True)
    category_id = Column(String(255), nullable=True)
    project_id = Column(String(255), nullable=True)
    business_status = Column(String(50), nullable=True)
    confidence = Column(Float, nullable=True)
    reason = Column(Text, nullable=True)
    user_decision = Column(String(50), nullable=True)
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )

    imported_transaction = relationship(
        "ImportedTransaction", back_populates="suggestions"
    )


class TransactionRule(Base):
    __tablename__ = "transaction_rules"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, nullable=True, index=True)
    keyword = Column(String(255), nullable=True)
    counterparty = Column(String(255), nullable=True)
    operation_type = Column(String(100), nullable=True)
    category_name = Column(String(255), nullable=True)
    project_name = Column(String(255), nullable=True)
    business_status = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class BusinessProject(Base):
    __tablename__ = "business_projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    type = Column(Enum(CategoryType), nullable=False)
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)


class IncomeTransaction(Base):
    __tablename__ = "income_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(Integer, ForeignKey("business_projects.id", ondelete="RESTRICT"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    amount = Column(DECIMAL(15, 2), nullable=False)
    date_fact = Column(Date, nullable=False)
    date_period = Column(Date, nullable=False)
    comment = Column(Text, nullable=True)
    attachment_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ExpenseTransaction(Base):
    __tablename__ = "expense_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(Integer, ForeignKey("business_projects.id", ondelete="RESTRICT"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    amount = Column(DECIMAL(15, 2), nullable=False)
    date_fact = Column(Date, nullable=False)
    date_period = Column(Date, nullable=False)
    comment = Column(Text, nullable=True)
    attachment_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
