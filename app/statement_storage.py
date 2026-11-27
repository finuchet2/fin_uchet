import hashlib
from typing import Any
from sqlalchemy.orm import Session

from app.models import (
    ImportBatch,
    ImportedTransaction,
    TransactionSuggestion,
)
from app.statement_classifier import build_suggestion_for_record


def _norm_text(val: Any) -> str:
    if val is None:
        return ""
    return " ".join(str(val).strip().lower().split())


def _norm_amount(val: Any) -> str:
    if val is None:
        return ""
    try:
        return f"{float(val):.2f}"
    except (TypeError, ValueError):
        return str(val).strip()


def _norm_date(val: Any) -> str:
    if val is None:
        return ""
    return str(val).strip()


def build_exact_hash(record: dict[str, Any]) -> str:
    external_id = _norm_text(record.get("external_id"))
    if external_id:
        payload = f"ext:{_norm_text(record.get('account_id'))}:{external_id}"
    else:
        payload = "|".join(
            [
                _norm_text(record.get("account_id")),
                _norm_date(record.get("transaction_date")),
                _norm_amount(record.get("amount")),
                _norm_text(record.get("currency")),
                _norm_text(record.get("counterparty")),
                _norm_text(record.get("description")),
            ]
        )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build_partial_hash(record: dict[str, Any]) -> str:
    payload = "|".join(
        [
            _norm_date(record.get("transaction_date")),
            _norm_amount(record.get("amount")),
            _norm_text(record.get("currency")),
            _norm_text(record.get("counterparty")) or _norm_text(record.get("description")),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def check_duplicate_status(
    db: Session,
    record: dict[str, Any],
    user_id: int | None = None,
    current_batch_id: int | None = None,
) -> tuple[str, str, str | None]:
    exact_hash = build_exact_hash(record)
    partial_hash = build_partial_hash(record)
    query = db.query(ImportedTransaction).join(
        ImportBatch, ImportedTransaction.import_batch_id == ImportBatch.id
    )
    if user_id is not None:
        query = query.filter(ImportBatch.user_id == user_id)
    # Compare rows from this file and previously confirmed imports only.
    eligible = []
    if current_batch_id is not None:
        eligible.append(ImportedTransaction.import_batch_id == current_batch_id)
    eligible.append(ImportedTransaction.status == "confirmed")
    from sqlalchemy import or_
    query = query.filter(or_(*eligible))

    exact_match = query.filter(ImportedTransaction.duplicate_hash == exact_hash).first()
    if exact_match is not None:
        source = "in_file" if exact_match.import_batch_id == current_batch_id else "in_ledger"
        return "exact", exact_hash, source

    partial_candidates = query.filter(
        ImportedTransaction.transaction_date == record.get("transaction_date"),
        ImportedTransaction.amount == record.get("amount"),
    ).all()
    for candidate in partial_candidates:
        same_account = _norm_text(candidate.account_id) == _norm_text(record.get("account_id"))
        same_currency = _norm_text(candidate.currency) == _norm_text(record.get("currency"))
        same_counterparty = _norm_text(candidate.counterparty) == _norm_text(record.get("counterparty"))
        same_description = _norm_text(candidate.description) == _norm_text(record.get("description"))
        if same_currency and (same_account or same_counterparty or same_description):
            source = "in_file" if candidate.import_batch_id == current_batch_id else "in_ledger"
            return "possible", partial_hash, source
    return "none", exact_hash, None


def save_import_batch_to_staging(
    db: Session,
    parsed_result: dict[str, Any],
    filename: str,
    account_id: str | None = None,
    user_id: int | None = None,
) -> dict[str, Any]:
    batch = ImportBatch(
        user_id=user_id,
        account_id=account_id,
        filename=filename,
        file_format=parsed_result["file_format"],
        status="staged",
        period_start=parsed_result.get("period_start"),
        period_end=parsed_result.get("period_end"),
    )
    db.add(batch)
    db.flush()

    exact_duplicates_count = 0
    possible_duplicates_count = 0
    created_items: list[dict[str, Any]] = []

    for rec in parsed_result["records"]:
        if rec["is_valid"]:
            dup_status, dup_hash, dup_source = check_duplicate_status(db, rec, user_id=user_id, current_batch_id=batch.id)
            if dup_status == "exact":
                exact_duplicates_count += 1
                row_status = "duplicate"
            elif dup_status == "possible":
                possible_duplicates_count += 1
                row_status = "possible_duplicate"
            else:
                row_status = "pending_review"
        else:
            dup_status = "none"
            dup_hash = build_exact_hash(rec)
            dup_source = None
            row_status = "invalid"

        sug_data = build_suggestion_for_record(db, rec, user_id=user_id)
        final_op_type = sug_data.get("operation_type") or rec.get("direction")

        imported_tx = ImportedTransaction(
            import_batch_id=batch.id,
            account_id=rec.get("account_id") or account_id,
            external_id=rec.get("external_id"),
            transaction_date=rec.get("transaction_date"),
            date_fact=rec.get("date_fact"),
            date_period=rec.get("date_period"),
            amount=rec.get("amount"),
            direction=rec.get("direction"),
            currency=rec.get("currency"),
            description=rec.get("description"),
            counterparty=rec.get("counterparty"),
            operation_type=final_op_type,
            status=row_status,
            validation_error=rec.get("validation_error"),
            duplicate_hash=dup_hash,
            duplicate_source=dup_source,
            is_duplicate=dup_status,
        )
        db.add(imported_tx)
        db.flush()

        reason_parts = [p for p in [sug_data.get("reason"), rec.get("validation_error")] if p]
        final_reason = "; ".join(reason_parts) if reason_parts else None

        suggestion = TransactionSuggestion(
            imported_transaction_id=imported_tx.id,
            operation_type=final_op_type,
            category_id=sug_data.get("category_id"),
            project_id=sug_data.get("project_id"),
            business_status=sug_data.get("business_status") or "undefined",
            confidence=sug_data.get("confidence"),
            reason=final_reason,
            user_decision=None,
        )
        db.add(suggestion)

        created_items.append(
            {
                "imported_transaction_id": imported_tx.id,
                "status": imported_tx.status,
                "is_duplicate": imported_tx.is_duplicate,
                "validation_error": imported_tx.validation_error,
                "suggestion": {
                    "operation_type": suggestion.operation_type,
                    "category_id": suggestion.category_id,
                    "project_id": suggestion.project_id,
                    "business_status": suggestion.business_status,
                    "confidence": suggestion.confidence,
                    "reason": suggestion.reason,
                },
            }
        )

    db.commit()
    db.refresh(batch)

    return {
        "batch_id": batch.id,
        "filename": batch.filename,
        "file_format": batch.file_format,
        "status": batch.status,
        "total_rows": parsed_result["total_rows"],
        "valid_rows": parsed_result["valid_rows"],
        "invalid_rows": parsed_result["invalid_rows"],
        "exact_duplicates": exact_duplicates_count,
        "possible_duplicates": possible_duplicates_count,
        "transactions": created_items,
    }