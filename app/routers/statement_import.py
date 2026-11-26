import datetime
from typing import Literal
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    BusinessProject,
    ExpenseTransaction,
    ImportBatch,
    ImportedTransaction,
    IncomeTransaction,
    TransactionRule,
    TransactionSuggestion,
)
from app.statement_classifier import resolve_category_id
from app.statement_importer import parse_and_validate_statement
from app.statement_storage import save_import_batch_to_staging

router = APIRouter(prefix="/api/import", tags=["statement-import"])


class TransactionUpdateRequest(BaseModel):
    transaction_date: datetime.date | None = None
    date_fact: datetime.date | None = None
    date_period: datetime.date | None = None
    amount: float | None = None
    direction: str | None = None
    currency: str | None = None
    description: str | None = None
    counterparty: str | None = None
    operation_type: str | None = None
    category_id: int | str | None = None
    project_id: int | str | None = None
    business_status: Literal["business", "personal", "undefined"] | None = None
    user_decision: Literal["approved", "rejected", "needs_review"] | None = None
    status: str | None = None


class ConfirmBatchRequest(BaseModel):
    transaction_ids: list[int] | None = None


@router.post("/upload")
async def upload_statement(
    file: UploadFile = File(...),
    account_id: str | None = Form(default=None),
    default_currency: str = Form(default="RUB"),
    user_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
):
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Загруженный файл пуст.")

    try:
        parsed = parse_and_validate_statement(
            file_bytes=file_bytes,
            filename=file.filename or "",
            default_account_id=account_id,
            default_currency=default_currency,
        )
        return save_import_batch_to_staging(
            db=db,
            parsed_result=parsed,
            filename=file.filename or "statement",
            account_id=account_id,
            user_id=user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/batches/{batch_id}")
def get_batch_preview(batch_id: int, db: Session = Depends(get_db)):
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Загрузка выписки не найдена.")

    items = (
        db.query(ImportedTransaction)
        .filter(ImportedTransaction.import_batch_id == batch_id)
        .order_by(ImportedTransaction.id.asc())
        .all()
    )

    result_items = []
    for tx in items:
        sug = db.query(TransactionSuggestion).filter(TransactionSuggestion.imported_transaction_id == tx.id).first()
        result_items.append({
            "id": tx.id,
            "account_id": tx.account_id,
            "external_id": tx.external_id,
            "transaction_date": tx.transaction_date,
            "date_fact": tx.date_fact,
            "date_period": tx.date_period,
            "amount": tx.amount,
            "direction": tx.direction,
            "currency": tx.currency,
            "description": tx.description,
            "counterparty": tx.counterparty,
            "operation_type": tx.operation_type,
            "status": tx.status,
            "validation_error": tx.validation_error,
            "is_duplicate": tx.is_duplicate,
            "confirmed_at": tx.confirmed_at,
            "suggestion": {
                "id": sug.id,
                "operation_type": sug.operation_type,
                "category_id": sug.category_id,
                "project_id": sug.project_id,
                "business_status": sug.business_status,
                "confidence": sug.confidence,
                "reason": sug.reason,
                "user_decision": sug.user_decision,
            } if sug else None,
        })

    return {
        "batch_id": batch.id,
        "user_id": batch.user_id,
        "account_id": batch.account_id,
        "filename": batch.filename,
        "file_format": batch.file_format,
        "status": batch.status,
        "period_start": batch.period_start,
        "period_end": batch.period_end,
        "created_at": batch.created_at,
        "transactions": result_items,
    }


@router.patch("/transactions/{transaction_id}")
def update_imported_transaction(transaction_id: int, payload: TransactionUpdateRequest, db: Session = Depends(get_db)):
    tx = db.query(ImportedTransaction).filter(ImportedTransaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Операция не найдена.")

    batch = db.query(ImportBatch).filter(ImportBatch.id == tx.import_batch_id).first()
    sug = db.query(TransactionSuggestion).filter(TransactionSuggestion.imported_transaction_id == tx.id).first()
    if not sug:
        sug = TransactionSuggestion(imported_transaction_id=tx.id)
        db.add(sug)

    prev_cat, prev_proj = sug.category_id, sug.project_id

    if payload.transaction_date is not None:
        tx.transaction_date = payload.transaction_date
        if payload.date_fact is None:
            tx.date_fact = payload.transaction_date
        if payload.date_period is None:
            tx.date_period = payload.transaction_date
    if payload.date_fact is not None:
        tx.date_fact = payload.date_fact
    if payload.date_period is not None:
        tx.date_period = payload.date_period
    if payload.amount is not None:
        tx.amount = payload.amount
    if payload.direction is not None:
        tx.direction = payload.direction
    if payload.currency is not None:
        tx.currency = payload.currency
    if payload.description is not None:
        tx.description = payload.description
    if payload.counterparty is not None:
        tx.counterparty = payload.counterparty
    if payload.operation_type is not None:
        tx.operation_type = payload.operation_type
        sug.operation_type = payload.operation_type
    if payload.category_id is not None:
        resolved_id = resolve_category_id(
            db=db,
            category_ref=str(payload.category_id),
            operation_type=sug.operation_type or tx.operation_type,
            user_id=batch.user_id if batch else None,
        )
        sug.category_id = str(resolved_id) if resolved_id is not None else None
    if payload.project_id is not None:
        sug.project_id = str(payload.project_id)
    if payload.business_status is not None:
        sug.business_status = payload.business_status
    if payload.user_decision is not None:
        sug.user_decision = payload.user_decision
        if payload.user_decision == "rejected":
            tx.status = "excluded"
    if payload.status is not None:
        tx.status = payload.status

    if (payload.category_id is not None and sug.category_id != prev_cat) or (payload.project_id is not None and sug.project_id != prev_proj):
        db.add(TransactionRule(
            user_id=batch.user_id if batch else None,
            keyword=tx.description,
            counterparty=tx.counterparty,
            operation_type=tx.operation_type,
            category_ref=sug.category_id,
            project_name=sug.project_id,
            business_status=sug.business_status,
        ))

    db.commit()
    db.refresh(tx)
    db.refresh(sug)

    return {
        "id": tx.id,
        "status": tx.status,
        "transaction_date": tx.transaction_date,
        "date_fact": tx.date_fact,
        "date_period": tx.date_period,
        "amount": tx.amount,
        "direction": tx.direction,
        "currency": tx.currency,
        "description": tx.description,
        "counterparty": tx.counterparty,
        "operation_type": tx.operation_type,
        "suggestion": {
            "category_id": sug.category_id,
            "project_id": sug.project_id,
            "business_status": sug.business_status,
            "user_decision": sug.user_decision,
        },
    }


@router.post("/batches/{batch_id}/confirm")
def confirm_import_batch(batch_id: int, payload: ConfirmBatchRequest | None = None, db: Session = Depends(get_db)):
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Загрузка выписки не найдена.")

    query = db.query(ImportedTransaction).filter(ImportedTransaction.import_batch_id == batch_id)
    if payload and payload.transaction_ids:
        query = query.filter(ImportedTransaction.id.in_(payload.transaction_ids))

    items = query.all()
    now = datetime.datetime.utcnow()
    confirmed_count = 0
    skipped_count = 0

    for tx in items:
        if tx.status in ("invalid", "excluded", "duplicate"):
            skipped_count += 1
            continue

        tx.status = "confirmed"
        tx.confirmed_at = now
        confirmed_count += 1

        suggestion = db.query(TransactionSuggestion).filter(TransactionSuggestion.imported_transaction_id == tx.id).first()
        if suggestion:
            suggestion.user_decision = "approved"

        cat_id: int | None = None
        if suggestion and suggestion.category_id is not None:
            try:
                cat_id = int(str(suggestion.category_id).strip())
            except ValueError:
                cat_id = None

        proj_id: int | None = None
        if suggestion and suggestion.project_id is not None:
            try:
                candidate_proj_id = int(str(suggestion.project_id).strip())
                if db.query(BusinessProject.id).filter(BusinessProject.id == candidate_proj_id).first() is not None:
                    proj_id = candidate_proj_id
            except ValueError:
                proj_id = None

        fact_dt = tx.date_fact or tx.transaction_date
        period_dt = tx.date_period or fact_dt
        op_type = (suggestion.operation_type if suggestion and suggestion.operation_type else tx.operation_type) or ""
        amt_val = float(tx.amount or 0.0)
        comment_text = tx.description or tx.counterparty

        if fact_dt is not None and period_dt is not None and op_type != "transfer":
            if op_type in {"income", "supplier_refund", "loan_received"} or (not op_type and tx.direction == "income"):
                db.add(
                    IncomeTransaction(
                        user_id=batch.user_id,
                        project_id=proj_id,
                        category_id=cat_id,
                        amount=amt_val,
                        date_fact=fact_dt,
                        date_period=period_dt,
                        comment=comment_text,
                        attachment_url=None,
                    )
                )
            elif op_type in {"expense", "customer_refund", "bank_fee", "tax_payment", "loan_repayment", "cash_withdrawal"} or (not op_type and tx.direction == "expense"):
                db.add(
                    ExpenseTransaction(
                        user_id=batch.user_id,
                        project_id=proj_id,
                        category_id=cat_id,
                        amount=amt_val,
                        date_fact=fact_dt,
                        date_period=period_dt,
                        comment=comment_text,
                        attachment_url=None,
                    )
                )

    batch.status = "confirmed"
    db.commit()
    return {
        "batch_id": batch.id,
        "status": batch.status,
        "confirmed_count": confirmed_count,
        "skipped_count": skipped_count,
    }