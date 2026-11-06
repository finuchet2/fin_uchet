
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal


AccountingMethod = Literal["PNL", "CASH_FLOW"]
TransactionType = Literal["INCOME", "EXPENSE", "TAX"]


@dataclass
class ReportRow:
    id: str
    name: str
    amount: Decimal
    percentage: Decimal


@dataclass
class Report:
    income: Decimal
    expense: Decimal
    tax: Decimal
    net: Decimal

    income_percentage: Decimal
    expense_percentage: Decimal
    tax_percentage: Decimal
    net_percentage: Decimal

    income_rows: list[ReportRow]
    expense_rows: list[ReportRow]
    tax_rows: list[ReportRow]
    count: int


@dataclass
class CategoryData:
    id: str
    name: str
    type: TransactionType
    is_active: bool


@dataclass
class TransactionData:
    id: str
    project_id: str
    category_id: str
    type: TransactionType
    amount: Decimal
    date_fact: str
    date_period: str


def to_kopecks(amount: Decimal | int | float) -> int:
    """Переводит денежную сумму в целое количество копеек."""
    return int(
        (Decimal(str(amount)) * 100).quantize(
            Decimal("1"),
            rounding=ROUND_HALF_UP,
        )
    )


def from_kopecks(amount: int) -> Decimal:
    """Переводит копейки обратно в рубли."""
    return Decimal(amount) / Decimal(100)


def calculate_percentage(amount: Decimal, total_income: Decimal) -> Decimal:
    if total_income == 0:
        return Decimal("0")

    return (amount / total_income * Decimal("100")).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )


def parse_date(value: str | date) -> date:
    """Преобразует дату в единый формат для сравнения."""
    if isinstance(value, date):
        return value

    return date.fromisoformat(value[:10])


def build_report(
    transactions: list[TransactionData],
    categories: list[CategoryData],
    project_ids: list[str] | None,
    period_start: str | date,
    period_end: str | date,
    method: AccountingMethod,
) -> Report:
    """
    Формирует финансовый отчёт за выбранный период.

    PNL использует дату периода (date_period).
    CASH_FLOW использует фактическую дату (date_fact).
    """

    if method not in ("PNL", "CASH_FLOW"):
        raise ValueError("Неизвестный метод учёта")

    start = parse_date(period_start)
    end = parse_date(period_end)

    if start > end:
        raise ValueError("Начало периода не может быть позже его окончания")

    selected_projects = set(project_ids) if project_ids is not None else None

    active_categories = [
        category for category in categories
        if category.is_active
    ]

    active_category_ids = {
        category.id for category in active_categories
    }

    category_by_id = {
        category.id: category for category in active_categories
    }

    filtered_transactions = []

    for transaction in transactions:
        transaction_date = (
            transaction.date_period
            if method == "PNL"
            else transaction.date_fact
        )

        operation_date = parse_date(transaction_date)

        if (
            (selected_projects is None or transaction.project_id in selected_projects)
            and transaction.category_id in active_category_ids
            and start <= operation_date <= end
        ):
            filtered_transactions.append(transaction)

    totals = {
        "INCOME": 0,
        "EXPENSE": 0,
        "TAX": 0,
    }

    category_totals: dict[str, int] = {}

    for transaction in filtered_transactions:
        amount = to_kopecks(transaction.amount)

        totals[transaction.type] += amount

        category_totals[transaction.category_id] = (
            category_totals.get(transaction.category_id, 0) + amount
        )

    def rows_for(transaction_type: TransactionType) -> list[ReportRow]:
        rows = []

        for category in active_categories:
            if category.type != transaction_type:
                continue

            amount = category_totals.get(category.id, 0)

            if amount > 0:
                amount_decimal = from_kopecks(amount)
                rows.append(
                    ReportRow(
                        id=str(category.id),
                        name=category.name,
                        amount=amount_decimal,
                        percentage=calculate_percentage(amount_decimal, from_kopecks(income)),
                    )
                )

        return sorted(rows, key=lambda row: row.amount, reverse=True)

    income = totals["INCOME"]
    expense = totals["EXPENSE"]
    tax = totals["TAX"]

    income_decimal = from_kopecks(income)
    expense_decimal = from_kopecks(expense)
    tax_decimal = from_kopecks(tax)
    net_decimal = from_kopecks(income - expense - tax)

    return Report(
        income=income_decimal,
        expense=expense_decimal,
        tax=tax_decimal,
        net=net_decimal,

        income_percentage=calculate_percentage(income_decimal, income_decimal),
        expense_percentage=calculate_percentage(expense_decimal, income_decimal),
        tax_percentage=calculate_percentage(tax_decimal, income_decimal),
        net_percentage=calculate_percentage(net_decimal, income_decimal),

        income_rows=rows_for("INCOME"),
        expense_rows=rows_for("EXPENSE"),
        tax_rows=rows_for("TAX"),
        count=len(filtered_transactions),
    )
