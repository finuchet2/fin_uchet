
from datetime import date

from sqlalchemy.orm import Session

from app.services.report_repository import get_report_from_db
from app.services.comparison_service import (
    ReportComparison,
    compare_reports,
)
from app.services.report_service import AccountingMethod


def get_report_comparison_from_db(
    db: Session,
    user_id: int,
    project_ids: list[int] | None,
    current_period_start: date,
    current_period_end: date,
    previous_period_start: date,
    previous_period_end: date,
    method: AccountingMethod,
) -> ReportComparison:
    """
    Получает отчёты за два периода из БД
    и сравнивает их финансовые показатели.
    """

    current_report = get_report_from_db(
        db=db,
        user_id=user_id,
        project_ids=project_ids,
        period_start=current_period_start,
        period_end=current_period_end,
        method=method,
    )

    previous_report = get_report_from_db(
        db=db,
        user_id=user_id,
        project_ids=project_ids,
        period_start=previous_period_start,
        period_end=previous_period_end,
        method=method,
    )

    return compare_reports(
        current_report=current_report,
        previous_report=previous_report,
    )
