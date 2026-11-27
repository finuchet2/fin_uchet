
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import Transaction, Category, BusinessProject
from app.services.report_service import (
    AccountingMethod,
    Report,
    ReportRow,
    calculate_percentage,
)


def get_report_from_db(
    db: Session,
    user_id: int,
    project_ids: list[int] | None,
    period_start: date,
    period_end: date,
    method: AccountingMethod,
) -> Report:
    """Получает агрегированные данные и формирует финансовый отчёт."""

    if method not in ("PNL", "CASH_FLOW"):
        raise ValueError("Неизвестный метод учёта")

    if period_start > period_end:
        raise ValueError(
            "Начало периода не может быть позже его окончания"
        )

    if project_ids == []:
        return Report(
            income=Decimal("0.00"),
            expense=Decimal("0.00"),
            tax=Decimal("0.00"),
            net=Decimal("0.00"),
            income_percentage=Decimal("0.00"),
            expense_percentage=Decimal("0.00"),
            tax_percentage=Decimal("0.00"),
            net_percentage=Decimal("0.00"),
            income_rows=[],
            expense_rows=[],
            tax_rows=[],
            count=0,
        )

    totals = {
        "INCOME": Decimal("0.00"),
        "EXPENSE": Decimal("0.00"),
        "TAX": Decimal("0.00"),
    }

    rows_by_type = {
        "INCOME": [],
        "EXPENSE": [],
        "TAX": [],
    }

    date_column = (
        Transaction.date_period
        if method == "PNL"
        else Transaction.date_fact
    )

    query = (
        db.query(
            Transaction.type,
            Category.id,
            Category.name,
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("operations_count"),
        )
        .join(
            Category,
            Transaction.category_id == Category.id,
        )
        .join(
            BusinessProject,
            Transaction.project_id == BusinessProject.id,
        )
        .filter(
            Transaction.user_id == user_id,
            BusinessProject.user_id == user_id,
            Category.is_active.is_(True),
            or_(
                Category.user_id.is_(None),
                Category.user_id == user_id,
            ),
            date_column >= period_start,
            date_column <= period_end,
        )
    )

    if project_ids is not None:
        query = query.filter(
            Transaction.project_id.in_(project_ids)
        )

    results = (
        query
        .group_by(
            Transaction.type,
            Category.id,
            Category.name,
        )
        .all()
    )

    count = 0

    for (
        transaction_type,
        category_id,
        category_name,
        total,
        operations_count,
    ) in results:
        type_value = getattr(
            transaction_type,
            "value",
            transaction_type,
        )

        amount = Decimal(total or 0).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

        totals[type_value] += amount
        count += operations_count

        rows_by_type[type_value].append(
            (category_id, category_name, amount)
        )

    income = totals["INCOME"]
    expense = totals["EXPENSE"]
    tax = totals["TAX"]
    net = income - expense - tax

    def make_rows(transaction_type: str) -> list[ReportRow]:
        rows = []

        for category_id, category_name, amount in rows_by_type[
            transaction_type
        ]:
            rows.append(
                ReportRow(
                    id=category_id,
                    name=category_name,
                    amount=amount,
                    percentage=calculate_percentage(amount, income),
                )
            )

        return sorted(
            rows,
            key=lambda row: row.amount,
            reverse=True,
        )

    return Report(
        income=income,
        expense=expense,
        tax=tax,
        net=net,
        income_percentage=calculate_percentage(income, income),
        expense_percentage=calculate_percentage(expense, income),
        tax_percentage=calculate_percentage(tax, income),
        net_percentage=calculate_percentage(net, income),
        income_rows=make_rows("INCOME"),
        expense_rows=make_rows("EXPENSE"),
        tax_rows=make_rows("TAX"),
        count=count,
    )
