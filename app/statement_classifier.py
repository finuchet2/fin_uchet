import json
import os
from typing import Any
from urllib import request as url_request
from urllib.error import HTTPError, URLError

from sqlalchemy.orm import Session

from app.models import (
    Category,
    CategoryType,
    ImportBatch,
    ImportedTransaction,
    TransactionRule,
    TransactionSuggestion,
)

OPERATION_TYPES: list[str] = [
    "income",
    "expense",
    "transfer",
    "supplier_refund",
    "customer_refund",
    "bank_fee",
    "tax_payment",
    "loan_received",
    "loan_repayment",
    "cash_withdrawal",
    "undefined",
]

DEFAULT_RULES: list[dict[str, Any]] = [
    {
        "keywords": ["яндекс плюс", "подписк", "сервис"],
        "counterparties": ["яндекс"],
        "operation_type": "expense",
        "category_name": "Подписки и сервисы",
        "business_status": "undefined",
        "confidence": 0.85,
        "reason": "Совпадение со справочником правил по ключевому слову или контрагенту.",
    },
    {
        "keywords": ["ростелеком", "интернет", "связь"],
        "counterparties": ["ростелеком"],
        "operation_type": "expense",
        "category_name": "Интернет и связь",
        "business_status": "business",
        "confidence": 0.88,
        "reason": "Совпадение со справочником правил по связи/интернету.",
    },
    {
        "keywords": [
            "комиссия банка",
            "комиссия за обслуживание",
            "обслуживание счёта",
            "обслуживание счета",
        ],
        "counterparties": [],
        "operation_type": "bank_fee",
        "category_name": "Банковские комиссии",
        "business_status": "business",
        "confidence": 0.92,
        "reason": "Определено по правилу банковской комиссии.",
    },
    {
        "keywords": ["аренда помещения", "аренда"],
        "counterparties": [],
        "operation_type": "expense",
        "category_name": "Аренда",
        "business_status": "business",
        "confidence": 0.86,
        "reason": "Совпадение со справочником правил по аренде.",
    },
    {
        "keywords": ["упаковочные материалы", "упаковк"],
        "counterparties": [],
        "operation_type": "expense",
        "category_name": "Упаковка",
        "business_status": "undefined",
        "confidence": 0.85,
        "reason": "Совпадение со справочником правил по упаковке.",
    },
]


def _norm(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().lower().split())


def resolve_category_id(
    db: Session,
    category_name: str | None,
    operation_type: str | None,
    user_id: int | None = None,
) -> int | None:
    if not category_name:
        return None

    clean_name = " ".join(str(category_name).strip().split())
    if not clean_name:
        return None

    if clean_name.isdigit():
        return int(clean_name)

    query = db.query(Category)
    if user_id is not None:
        query = query.filter((Category.user_id == user_id) | (Category.user_id.is_(None)))

    existing = (
        query.filter(Category.name.ilike(clean_name))
        .order_by(Category.id.asc())
        .first()
    )
    if existing is not None:
        return int(existing.id)

    op = (operation_type or "").strip().lower()
    cat_type = (
        CategoryType.INCOME
        if op in {"income", "supplier_refund", "loan_received"}
        else CategoryType.EXPENSE
    )

    new_category = Category(
        user_id=user_id,
        name=clean_name,
        type=cat_type,
        is_system=False,
        is_active=True,
    )
    db.add(new_category)
    db.flush()
    return int(new_category.id)


def detect_operation_type(record: dict[str, Any]) -> tuple[str | None, float, str]:
    text_blob = f"{_norm(record.get('description'))} {_norm(record.get('counterparty'))}".strip()
    direction = _norm(record.get("direction"))

    if any(
        k in text_blob
        for k in (
            "перевод между своими",
            "между своими счетами",
            "перевод на свой счёт",
            "перевод на свой счет",
        )
    ):
        return "transfer", 0.92, "Определён перевод между собственными счетами."
    if any(k in text_blob for k in ("возврат от поставщика", "возврат оплаты")):
        return "supplier_refund", 0.88, "Определён возврат от поставщика."
    if any(k in text_blob for k in ("возврат покупателю", "возврат клиенту")):
        return "customer_refund", 0.88, "Определён возврат покупателю."
    if any(k in text_blob for k in ("комиссия", "обслуживание счёта", "обслуживание счета")):
        return "bank_fee", 0.90, "Определена банковская комиссия."
    if any(k in text_blob for k in ("налог", "налоговый", "фнс", "усн", "ндфл")):
        return "tax_payment", 0.88, "Определён налоговый платёж."
    if any(k in text_blob for k in ("снятие наличных", "наличные")):
        return "cash_withdrawal", 0.88, "Определено снятие наличных."
    if "погашение кредита" in text_blob:
        return "loan_repayment", 0.88, "Определено погашение кредита."
    if "кредит" in text_blob and direction == "income":
        return "loan_received", 0.86, "Определено получение кредита."

    if direction == "income":
        return "income", 0.80, "Тип определён по направлению поступления/дохода."
    if direction == "expense":
        return "expense", 0.80, "Тип определён по направлению списания/расхода."

    return None, 0.0, "Не удалось определить"


def match_rules(
    db: Session,
    record: dict[str, Any],
    user_id: int | None = None,
) -> dict[str, Any] | None:
    desc = _norm(record.get("description"))
    cp = _norm(record.get("counterparty"))
    haystack = f"{desc} {cp}".strip()

    query = db.query(TransactionRule)
    if user_id is not None:
        query = query.filter((TransactionRule.user_id == user_id) | (TransactionRule.user_id.is_(None)))
    db_rules = query.all()

    for rule in db_rules:
        kw = _norm(rule.keyword)
        rcp = _norm(rule.counterparty)
        kw_match = bool(kw and kw in haystack)
        cp_match = bool(rcp and rcp in haystack)
        if kw_match or cp_match:
            return {
                "operation_type": rule.operation_type,
                "category_id": rule.category_name,
                "project_id": rule.project_name,
                "business_status": rule.business_status or "undefined",
                "confidence": 0.90,
                "reason": "Совпадение с сохранённым правилом пользователя или справочника.",
            }

    for item in DEFAULT_RULES:
        kw_hit = any(k in haystack for k in item["keywords"])
        cp_hit = any(c in haystack for c in item["counterparties"])
        if kw_hit or cp_hit:
            return {
                "operation_type": item["operation_type"],
                "category_id": item["category_name"],
                "project_id": None,
                "business_status": item["business_status"],
                "confidence": item["confidence"],
                "reason": item["reason"],
            }

    return None


def match_user_history(
    db: Session,
    record: dict[str, Any],
    user_id: int | None = None,
) -> dict[str, Any] | None:
    cp = _norm(record.get("counterparty"))
    desc = _norm(record.get("description"))
    if not cp and not desc:
        return None

    query = (
        db.query(ImportedTransaction, TransactionSuggestion)
        .join(
            TransactionSuggestion,
            TransactionSuggestion.imported_transaction_id == ImportedTransaction.id,
        )
        .join(ImportBatch, ImportedTransaction.import_batch_id == ImportBatch.id)
        .filter(ImportedTransaction.status == "confirmed")
    )
    if user_id is not None:
        query = query.filter(ImportBatch.user_id == user_id)

    rows = query.order_by(ImportedTransaction.id.desc()).all()
    for tx, sug in rows:
        tx_cp = _norm(tx.counterparty)
        tx_desc = _norm(tx.description)
        matched = False
        if cp and tx_cp and cp == tx_cp:
            matched = True
        elif desc and tx_desc and desc == tx_desc:
            matched = True

        if matched and (sug.category_id or sug.project_id or sug.business_status):
            return {
                "operation_type": sug.operation_type or tx.operation_type,
                "category_id": sug.category_id,
                "project_id": sug.project_id,
                "business_status": sug.business_status or "undefined",
                "confidence": 0.86,
                "reason": "Найдено совпадение по ранее подтверждённой операции пользователя.",
            }

    return None


def classify_with_llm(record: dict[str, Any]) -> dict[str, Any] | None:
    api_url = os.getenv("LLM_API_URL")
    api_key = os.getenv("LLM_API_KEY")
    model_name = os.getenv("LLM_MODEL", "gpt-4o-mini")
    if not api_url or not api_key:
        return None

    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "operation_type": {"type": ["string", "null"]},
            "category_name": {"type": ["string", "null"]},
            "project_name": {"type": ["string", "null"]},
            "business_status": {
                "type": "string",
                "enum": ["business", "personal", "undefined"],
            },
            "confidence": {"type": "number"},
            "reason": {"type": "string"},
        },
        "required": [
            "operation_type",
            "category_name",
            "project_name",
            "business_status",
            "confidence",
            "reason",
        ],
    }

    prompt_payload = {
        "description": record.get("description"),
        "counterparty": record.get("counterparty"),
        "amount": record.get("amount"),
        "direction": record.get("direction"),
        "currency": record.get("currency"),
    }

    body = {
        "model": model_name,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Ты финансовый классификатор банковских операций. "
                    "Верни строго JSON по заданной схеме. Если данных недостаточно, укажи "
                    "operation_type=null, category_name=null, project_name=null, "
                    "business_status='undefined' и reason='Не удалось определить'."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(prompt_payload, ensure_ascii=False),
            },
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "tx_classification",
                "strict": True,
                "schema": schema,
            },
        },
        "temperature": 0.0,
    }

    try:
        req = url_request.Request(
            api_url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )
        with url_request.urlopen(req, timeout=8) as resp:
            raw_resp = json.loads(resp.read().decode("utf-8"))
            content = raw_resp["choices"]["message"]["content"]
            parsed = json.loads(content)
            op_type = parsed.get("operation_type")
            if op_type not in OPERATION_TYPES:
                op_type = None
            return {
                "operation_type": op_type,
                "category_id": parsed.get("category_name"),
                "project_id": parsed.get("project_name"),
                "business_status": parsed.get("business_status") or "undefined",
                "confidence": float(parsed.get("confidence", 0.5)),
                "reason": parsed.get("reason") or "Классифицировано с помощью LLM.",
            }
    except (URLError, HTTPError, KeyError, ValueError, TypeError, TimeoutError, Exception):
        return None


def build_suggestion_for_record(
    db: Session,
    record: dict[str, Any],
    user_id: int | None = None,
) -> dict[str, Any]:
    detected_op, op_conf, op_reason = detect_operation_type(record)
    hit = (
        match_rules(db, record, user_id=user_id)
        or match_user_history(db, record, user_id=user_id)
        or classify_with_llm(record)
    )

    if hit:
        op_type = hit.get("operation_type") or detected_op
        raw_cat = hit.get("category_id")
        resolved_category_id = resolve_category_id(
            db=db,
            category_name=raw_cat,
            operation_type=op_type,
            user_id=user_id,
        )
        reason_text = hit.get("reason") or ""
        if raw_cat and not str(raw_cat).isdigit():
            reason_text = f"{reason_text} (Категория: {raw_cat})".strip()
        return {
            "operation_type": op_type,
            "category_id": resolved_category_id,
            "project_id": hit.get("project_id"),
            "business_status": hit.get("business_status") or "undefined",
            "confidence": hit.get("confidence", 0.85),
            "reason": reason_text,
        }

    return {
        "operation_type": detected_op,
        "category_id": None,
        "project_id": None,
        "business_status": "undefined",
        "confidence": op_conf if detected_op else 0.0,
        "reason": op_reason if detected_op else "Не удалось определить",
    }