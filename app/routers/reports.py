from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.deps import get_current_user          # из прошлой инструкции, шаг 2
from app.models import User
from app.report_schemas import (ReportRequestSchema, ReportResponse,
                                ReportComparisonRequestSchema, ReportComparisonSchema)
from app.services.report_repository import get_report_from_db
from app.services.comparison_repository import get_report_comparison_from_db

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.post("", response_model=ReportResponse)
def report(p: ReportRequestSchema, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return get_report_from_db(db, user.id, p.project_ids or None,
                                  p.period_start, p.period_end, p.method)
    except ValueError as e:
        raise HTTPException(422, str(e))

@router.post("/comparison", response_model=ReportComparisonSchema)
def comparison(p: ReportComparisonRequestSchema, user: User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    try:
        return get_report_comparison_from_db(db, user.id, p.project_ids or None,
            p.current_period_start, p.current_period_end,
            p.previous_period_start, p.previous_period_end, p.method)
    except ValueError as e:
        raise HTTPException(422, str(e))