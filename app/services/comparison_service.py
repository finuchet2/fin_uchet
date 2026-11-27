
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from app.services.report_service import Report


Trend = Literal["UP", "DOWN", "UNCHANGED"]


@dataclass
class ComparisonMetric:
    current: Decimal
    previous: Decimal
    difference: Decimal
    percent_change: Decimal | None
    trend: Trend


@dataclass
class ReportComparison:
    income: ComparisonMetric
    expense: ComparisonMetric
    tax: ComparisonMetric
    net: ComparisonMetric


def compare_metric(
    current: Decimal,
    previous: Decimal,
) -> ComparisonMetric:
    """
    Сравнивает один финансовый показатель двух периодов.
    """

    difference = current - previous

    if previous == 0:
        percent_change = (
            Decimal("0.00") if current == 0 else None
        )
    else:
        percent_change = (
            difference / abs(previous) * Decimal("100")
        ).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

    if difference > 0:
        trend: Trend = "UP"
    elif difference < 0:
        trend = "DOWN"
    else:
        trend = "UNCHANGED"

    return ComparisonMetric(
        current=current,
        previous=previous,
        difference=difference,
        percent_change=percent_change,
        trend=trend,
    )


def compare_reports(
    current_report: Report,
    previous_report: Report,
) -> ReportComparison:
    """
    Сравнивает финансовые показатели текущего
    и предыдущего отчётных периодов.
    """

    return ReportComparison(
        income=compare_metric(
            current_report.income,
            previous_report.income,
        ),
        expense=compare_metric(
            current_report.expense,
            previous_report.expense,
        ),
        tax=compare_metric(
            current_report.tax,
            previous_report.tax,
        ),
        net=compare_metric(
            current_report.net,
            previous_report.net,
        ),
    )
