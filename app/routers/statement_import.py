import datetime
from decimal import Decimal
from typing import Literal
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.deps import get_current_user
from app.models import User, BusinessProject, Category, ImportBatch, ImportedTransaction, Transaction, TransactionRule, TransactionSuggestion, TransactionType
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
    business_status: Literal["business", "personal", "undefined", "BUSINESS", "PERSONAL", "UNKNOWN"] | None = None
    user_decision: Literal["approved", "rejected", "needs_review"] | None = None
    status: str | None = None
    category_name: str | None = None
    project_name: str | None = None
    paid_by_personal_funds: bool | None = None
    duplicate_resolved: Literal["kept", "skipped"] | None = None

class ConfirmBatchRequest(BaseModel):
    transaction_ids: list[int] | None = None
    confirmed_ids: list[int] | None = None
    excluded_ids: list[int] | None = None
    corrections: list[dict] | None = None

def owned_batch(db: Session, batch_id: int, user_id: int):
    batch = db.query(ImportBatch).filter_by(id=batch_id, user_id=user_id).first()
    if not batch: raise HTTPException(404, "Загрузка выписки не найдена")
    return batch

@router.post("/upload")
async def upload_statement(file: UploadFile = File(...), account_id: str | None = Form(default=None),
                           account_type: str = Form(default="business"),
                           period_start: str | None = Form(default=None), period_end: str | None = Form(default=None),
                           default_currency: str = Form(default="RUB"), db: Session = Depends(get_db),
                           user: User = Depends(get_current_user)):
    raw = await file.read()
    if not raw: raise HTTPException(400, "Загруженный файл пуст")
    try:
        parsed = parse_and_validate_statement(raw, file.filename or "", account_id, default_currency)
        saved = save_import_batch_to_staging(db, parsed, file.filename or "statement", account_id, user.id)
        batch = owned_batch(db, int(saved["batch_id"]), user.id)
        preview = get_batch_preview(batch.id, db, user)
        code_map = {"income": "BUSINESS_INCOME", "expense": "BUSINESS_EXPENSE", "transfer": "INTERNAL_TRANSFER",
                    "supplier_refund": "SUPPLIER_REFUND", "customer_refund": "CUSTOMER_REFUND", "bank_fee": "BANK_FEE",
                    "tax_payment": "TAX_PAYMENT", "cash_withdrawal": "CASH_WITHDRAWAL", "loan_received": "LOAN_RECEIPT",
                    "loan_repayment": "LOAN_REPAYMENT"}
        transactions = []
        for tx in preview["transactions"]:
            sug = tx.get("suggestion") or {}
            op = (sug.get("operation_type") or tx.get("operation_type") or "undefined").lower()
            cat_name = sug.get("category_id")
            proj_name = sug.get("project_id")
            if cat_name and str(cat_name).isdigit():
                cat = db.query(Category).filter_by(id=int(cat_name)).first()
                cat_name = cat.name if cat else cat_name
            if proj_name and str(proj_name).isdigit():
                proj = db.query(BusinessProject).filter_by(id=int(proj_name), user_id=user.id).first()
                proj_name = proj.name if proj else proj_name
            d = tx.get("transaction_date")
            transactions.append({
                "id": str(tx["id"]), "import_batch_id": str(batch.id), "account_id": tx.get("account_id") or account_id or "default",
                "external_id": tx.get("external_id"), "duplicate_hash": tx.get("duplicate_hash") or "", "transaction_date": d.isoformat() if d else "",
                "date_period": tx.get("date_period").isoformat() if tx.get("date_period") else None,
                "counterparty": tx.get("counterparty") or "", "description": tx.get("description") or "",
                "amount": abs(float(tx.get("amount") or 0)), "currency": tx.get("currency") or default_currency,
                "direction": "credit" if (tx.get("direction") or "").lower() in {"income", "credit"} else "debit",
                "operation_type": code_map.get(op, "UNDEFINED"), "category_name": cat_name,
                "project_name": proj_name,
                "business_status": {"business":"BUSINESS", "personal":"PERSONAL"}.get(sug.get("business_status"), "UNKNOWN"),
                "suggestions": ({
                    "type": {"value": code_map.get(op, "UNDEFINED"), "confidence": float(sug.get("confidence") or 0) * 100, "reason": sug.get("reason") or "Определено классификатором", "source": "rule"},
                    **({"category": {"value": str(cat_name), "confidence": float(sug.get("confidence") or 0) * 100, "reason": sug.get("reason") or "Подбор категории", "source": "rule"}} if cat_name else {}),
                    **({"project": {"value": str(proj_name), "confidence": float(sug.get("confidence") or 0) * 100, "reason": sug.get("reason") or "Подбор проекта", "source": "rule"}} if proj_name else {}),
                    "ownership": {"value": {"business":"BUSINESS", "personal":"PERSONAL"}.get(sug.get("business_status"), "UNKNOWN"), "confidence": float(sug.get("confidence") or 0) * 100, "reason": sug.get("reason") or "Классификация назначения", "source": "rule"},
                } if sug else {}),
                "duplicate": ({"kind": "exact" if tx.get("is_duplicate") == "exact" else "possible",
                    "source": tx.get("duplicate_source") or "in_file",
                    "reason": "Найдено совпадение с ранее загруженной операцией"} if tx.get("is_duplicate") in {"exact", "possible"} else None),
                "missing_fields": [],
                "review_reasons": [tx["validation_error"]] if tx.get("validation_error") else [],
                "status": "excluded" if tx.get("status") in {"invalid", "excluded", "duplicate"} else "review",
                "imported_to_ledger": False,
            })
        return {"id": str(batch.id), "file_name": batch.filename, "file_size": len(raw),
                "file_format": batch.file_format, "account_id": account_id or "default",
                "account_name": account_id or "Банковский счёт", "account_type": account_type,
                "period_start": batch.period_start.isoformat() if batch.period_start else (period_start or ""),
                "period_end": batch.period_end.isoformat() if batch.period_end else (period_end or ""),
                "uploaded_at": batch.created_at.isoformat(), "transactions": transactions}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

@router.get("/batches/{batch_id}")
def get_batch_preview(batch_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    batch = owned_batch(db, batch_id, user.id)
    items = db.query(ImportedTransaction).filter_by(import_batch_id=batch_id).order_by(ImportedTransaction.id).all()
    result = []
    for tx in items:
        sug = db.query(TransactionSuggestion).filter_by(imported_transaction_id=tx.id).first()
        result.append({
            "id": tx.id, "account_id": tx.account_id, "external_id": tx.external_id,
            "transaction_date": tx.transaction_date, "date_fact": tx.date_fact, "date_period": tx.date_period,
            "amount": float(tx.amount) if tx.amount is not None else None, "direction": tx.direction,
            "currency": tx.currency, "description": tx.description, "counterparty": tx.counterparty,
            "operation_type": tx.operation_type, "status": tx.status, "validation_error": tx.validation_error,
            "is_duplicate": tx.is_duplicate, "duplicate_hash": tx.duplicate_hash,
            "duplicate_source": tx.duplicate_source,
            "suggestion": ({"id": sug.id, "operation_type": sug.operation_type, "category_id": sug.category_id,
                "project_id": sug.project_id, "business_status": sug.business_status, "confidence": sug.confidence,
                "reason": sug.reason, "user_decision": sug.user_decision} if sug else None)
        })
    return {"batch_id": batch.id, "user_id": batch.user_id, "account_id": batch.account_id, "filename": batch.filename,
            "file_format": batch.file_format, "status": batch.status, "period_start": batch.period_start,
            "period_end": batch.period_end, "created_at": batch.created_at, "transactions": result}

@router.patch("/transactions/{transaction_id}")
def update_imported_transaction(transaction_id: int, payload: TransactionUpdateRequest,
                                db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tx = db.query(ImportedTransaction).join(ImportBatch).filter(
        ImportedTransaction.id == transaction_id, ImportBatch.user_id == user.id).first()
    if not tx: raise HTTPException(404, "Операция импорта не найдена")
    batch = db.query(ImportBatch).filter_by(id=tx.import_batch_id).first()
    sug = db.query(TransactionSuggestion).filter_by(imported_transaction_id=tx.id).first()
    if not sug:
        sug = TransactionSuggestion(imported_transaction_id=tx.id); db.add(sug)
    old_category, old_project = sug.category_id, sug.project_id
    if payload.transaction_date is not None:
        tx.transaction_date = payload.transaction_date
        if payload.date_fact is None: tx.date_fact = payload.transaction_date
        if payload.date_period is None: tx.date_period = payload.transaction_date
    for key in ("date_fact", "date_period", "amount", "direction", "currency", "description", "counterparty", "status"):
        value = getattr(payload, key)
        if value is not None: setattr(tx, key, value)
    if payload.operation_type is not None:
        code_to_type = {"BUSINESS_INCOME":"income", "BUSINESS_EXPENSE":"expense", "PERSONAL_EXPENSE":"expense",
            "INTERNAL_TRANSFER":"transfer", "SUPPLIER_REFUND":"supplier_refund", "CUSTOMER_REFUND":"customer_refund",
            "BANK_FEE":"bank_fee", "TAX_PAYMENT":"tax_payment", "CASH_WITHDRAWAL":"cash_withdrawal",
            "LOAN_RECEIPT":"loan_received", "LOAN_REPAYMENT":"loan_repayment", "UNDEFINED":"undefined"}
        normalized_type = code_to_type.get(payload.operation_type, payload.operation_type.lower())
        tx.operation_type = normalized_type; sug.operation_type = normalized_type
    if payload.category_id is not None: sug.category_id = str(payload.category_id)
    if payload.category_name is not None: sug.category_id = payload.category_name
    if payload.project_id is not None: sug.project_id = str(payload.project_id)
    if payload.project_name is not None: sug.project_id = payload.project_name
    if payload.business_status is not None: sug.business_status = payload.business_status.lower() if payload.business_status in {"BUSINESS", "PERSONAL", "UNKNOWN"} else payload.business_status
    if payload.duplicate_resolved == "skipped":
        tx.status = "excluded"
    elif payload.duplicate_resolved == "kept" and tx.status in {"duplicate", "possible_duplicate"}:
        tx.status = "pending_review"
    if payload.user_decision is not None:
        sug.user_decision = payload.user_decision
        if payload.user_decision == "rejected": tx.status = "excluded"
    if (sug.category_id != old_category or sug.project_id != old_project) and (sug.category_id or sug.project_id):
        db.add(TransactionRule(user_id=user.id, keyword=tx.description, counterparty=tx.counterparty,
            operation_type=sug.operation_type or tx.operation_type, category_name=sug.category_id,
            project_name=sug.project_id, business_status=sug.business_status))
    db.commit(); db.refresh(tx)
    return {"id": tx.id, "status": tx.status, "transaction_date": tx.transaction_date,
            "date_fact": tx.date_fact, "date_period": tx.date_period, "amount": float(tx.amount) if tx.amount is not None else None,
            "direction": tx.direction, "currency": tx.currency, "description": tx.description,
            "counterparty": tx.counterparty, "operation_type": tx.operation_type,
            "suggestion": {"category_id": sug.category_id, "project_id": sug.project_id,
                           "business_status": sug.business_status, "user_decision": sug.user_decision}}

@router.post("/batches/{batch_id}/confirm")
def confirm_import_batch(batch_id: int, payload: ConfirmBatchRequest | None = None,
                         db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    batch = owned_batch(db, batch_id, user.id)
    query = db.query(ImportedTransaction).filter_by(import_batch_id=batch_id)
    selected_ids = (payload.confirmed_ids if payload and payload.confirmed_ids is not None else None)
    if selected_ids is None and payload and payload.transaction_ids is not None:
        selected_ids = payload.transaction_ids
    if selected_ids is not None: query = query.filter(ImportedTransaction.id.in_(selected_ids))
    if payload and payload.excluded_ids:
        db.query(ImportedTransaction).filter(ImportedTransaction.import_batch_id == batch_id,
            ImportedTransaction.id.in_(payload.excluded_ids)).update({ImportedTransaction.status: "excluded"}, synchronize_session=False)
    confirmed = skipped = imported_to_ledger = 0
    for tx in query.all():
        if tx.status in {"invalid", "excluded", "duplicate", "possible_duplicate", "confirmed"}:
            skipped += 1; continue
        sug = db.query(TransactionSuggestion).filter_by(imported_transaction_id=tx.id).first()
        op = ((sug.operation_type if sug else None) or tx.operation_type or "").lower()
        op = {"business_income":"income", "business_expense":"expense", "personal_expense":"expense",
              "internal_transfer":"transfer", "supplier_refund":"supplier_refund", "customer_refund":"customer_refund",
              "bank_fee":"bank_fee", "tax_payment":"tax_payment", "cash_withdrawal":"cash_withdrawal",
              "loan_receipt":"loan_received", "loan_repayment":"loan_repayment"}.get(op, op)
        if op == "transfer":
            tx.status = "confirmed"; tx.confirmed_at = datetime.datetime.now(datetime.timezone.utc); confirmed += 1
            continue
        if op in {"income", "supplier_refund", "loan_received"} or (not op and tx.direction == "income"):
            kind = TransactionType.INCOME
        elif op == "tax_payment":
            kind = TransactionType.TAX
        elif op in {"expense", "customer_refund", "bank_fee", "loan_repayment", "cash_withdrawal"} or (not op and tx.direction == "expense"):
            kind = TransactionType.EXPENSE
        else:
            skipped += 1; continue
        cat_id = None
        if sug and sug.category_id:
            cat_id = resolve_category_id(db, str(sug.category_id), op, user.id)
        if not cat_id:
            skipped += 1; continue
        category = db.query(Category).filter(Category.id == cat_id, Category.type == kind,
            ((Category.user_id == user.id) | (Category.user_id.is_(None)))).first()
        if not category:
            skipped += 1; continue
        project_id = None
        if sug and sug.project_id:
            try: project_id = int(str(sug.project_id))
            except ValueError:
                project = db.query(BusinessProject).filter_by(user_id=user.id, name=str(sug.project_id)).first()
                project_id = project.id if project else None
        if not project_id or not db.query(BusinessProject.id).filter_by(id=project_id, user_id=user.id).first():
            skipped += 1; continue
        fact = tx.date_fact or tx.transaction_date
        period = tx.date_period or fact
        if fact is None or period is None or tx.amount is None or Decimal(str(tx.amount)) <= 0:
            skipped += 1; continue
        db.add(Transaction(user_id=user.id, project_id=project_id, category_id=cat_id, type=kind,
            amount=Decimal(str(tx.amount)).copy_abs(), date_fact=fact, date_period=period,
            comment=(tx.description or tx.counterparty or "")[:255] or None))
        tx.status = "confirmed"; tx.confirmed_at = datetime.datetime.now(datetime.timezone.utc)
        if sug: sug.user_decision = "approved"
        confirmed += 1; imported_to_ledger += 1
    batch.status = "confirmed"
    db.commit()
    return {"batch_id": batch.id, "status": batch.status, "confirmed_count": confirmed,
            "imported_to_ledger": imported_to_ledger, "confirmed_non_reportable": max(0, confirmed-imported_to_ledger),
            "skipped_duplicates": skipped, "unclassified_count": skipped, "pending_review_count": 0,
            "excluded_count": len(payload.excluded_ids or []) if payload else 0,
            "saved_corrections_count": 0, "skipped_count": skipped}


@router.patch("/batches/{batch_id}/transactions/{transaction_id}")
def update_batch_transaction(batch_id: int, transaction_id: int, payload: TransactionUpdateRequest,
                             db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    owned_batch(db, batch_id, user.id)
    return update_imported_transaction(transaction_id, payload, db, user)

class BulkUpdateRequest(TransactionUpdateRequest):
    transaction_ids: list[int]

@router.post("/batches/{batch_id}/transactions/bulk")
def bulk_update_batch_transactions(batch_id: int, payload: BulkUpdateRequest,
                                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    owned_batch(db, batch_id, user.id)
    patch = TransactionUpdateRequest(**payload.model_dump(exclude={"transaction_ids"}))
    updated = 0
    for transaction_id in payload.transaction_ids:
        tx = db.query(ImportedTransaction).join(ImportBatch).filter(
            ImportedTransaction.id == transaction_id, ImportedTransaction.import_batch_id == batch_id, ImportBatch.user_id == user.id).first()
        if tx is None: continue
        sug = db.query(TransactionSuggestion).filter_by(imported_transaction_id=tx.id).first()
        if sug is None:
            sug = TransactionSuggestion(imported_transaction_id=tx.id); db.add(sug)
        # The UI first marks rows as confirmed, then calls the final batch endpoint.
        # Keep them staged until that final endpoint writes to transactions.
        if patch.status == "confirmed":
            sug.user_decision = "approved"
        elif patch.status is not None:
            tx.status = "excluded" if patch.status == "excluded" else "pending_review"
        if patch.operation_type is not None:
            code_to_type = {"BUSINESS_INCOME":"income", "BUSINESS_EXPENSE":"expense", "PERSONAL_EXPENSE":"expense",
                "INTERNAL_TRANSFER":"transfer", "SUPPLIER_REFUND":"supplier_refund", "CUSTOMER_REFUND":"customer_refund",
                "BANK_FEE":"bank_fee", "TAX_PAYMENT":"tax_payment", "CASH_WITHDRAWAL":"cash_withdrawal",
                "LOAN_RECEIPT":"loan_received", "LOAN_REPAYMENT":"loan_repayment", "UNDEFINED":"undefined"}
            sug.operation_type = code_to_type.get(patch.operation_type, patch.operation_type.lower())
            tx.operation_type = sug.operation_type
        if patch.category_name is not None: sug.category_id = patch.category_name
        if patch.project_name is not None: sug.project_id = patch.project_name
        if patch.business_status is not None:
            sug.business_status = {"BUSINESS":"business", "PERSONAL":"personal", "UNKNOWN":"undefined"}.get(patch.business_status, patch.business_status)
        if patch.duplicate_resolved == "kept" and tx.status in {"duplicate", "possible_duplicate"}:
            tx.status = "pending_review"
        if patch.duplicate_resolved == "skipped": tx.status = "excluded"
        if patch.user_decision is not None: sug.user_decision = patch.user_decision
        updated += 1
    db.commit()
    return {"updated_count": updated}
