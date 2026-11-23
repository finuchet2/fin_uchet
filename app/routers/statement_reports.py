import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import ImportBatch, ImportedTransaction, TransactionSuggestion

router = APIRouter(prefix="/api/import", tags=["statement-import"])


@router.get("/reports/summary")
def get_confirmed_reports_summary(
    period_start: datetime.date | None = None,
    period_end: datetime.date | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(ImportedTransaction, TransactionSuggestion)
        .outerjoin(TransactionSuggestion, TransactionSuggestion.imported_transaction_id == ImportedTransaction.id)
        .filter(ImportedTransaction.status == "confirmed")
    )
    if user_id is not None:
        query = query.join(ImportBatch, ImportedTransaction.import_batch_id == ImportBatch.id).filter(ImportBatch.user_id == user_id)

    cf_inc = cf_exp = pnl_inc = pnl_exp = 0.0
    by_biz = {"business": 0.0, "personal": 0.0, "undefined": 0.0}
    included_ids = []

    for tx, sug in query.all():
        amt = float(tx.amount or 0.0)
        op = (sug.operation_type if sug and sug.operation_type else tx.operation_type) or ""
        biz = sug.business_status if sug and sug.business_status else "undefined"

        in_cf = tx.date_fact is not None and (not period_start or tx.date_fact >= period_start) and (not period_end or tx.date_fact <= period_end)
        in_pnl = tx.date_period is not None and (not period_start or tx.date_period >= period_start) and (not period_end or tx.date_period <= period_end)

        if op != "transfer":
            if in_cf:
                if op in {"income", "supplier_refund", "loan_received"} or tx.direction == "income":
                    cf_inc += amt
                else:
                    cf_exp += amt
            if in_pnl:
                if op in {"income", "supplier_refund"} or tx.direction == "income":
                    pnl_inc += amt
                else:
                    pnl_exp += amt

        if in_cf or in_pnl:
            by_biz[biz] = by_biz.get(biz, 0.0) + amt
            included_ids.append(tx.id)

    return {
        "only_confirmed_included": True,
        "confirmed_transactions_count": len(included_ids),
        "included_transaction_ids": included_ids,
        "cash_flow": {"income": round(cf_inc, 2), "expense": round(cf_exp, 2), "net": round(cf_inc - cf_exp, 2)},
        "pnl": {"income": round(pnl_inc, 2), "expense": round(pnl_exp, 2), "result": round(pnl_inc - pnl_exp, 2)},
        "by_business_status": {k: round(v, 2) for k, v in by_biz.items()},
    }
