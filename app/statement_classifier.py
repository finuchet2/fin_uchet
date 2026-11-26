import json
import os
import re
import ssl
import time
import uuid
from typing import Any
from urllib import parse as url_parse
from urllib import request as url_request
from urllib.error import HTTPError, URLError

from sqlalchemy.orm import Session

from app.models import (
    BusinessProject,
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
        "keywords": ["ростелеком", "оплата интернета", "услуги связи", "связь в офисе"],
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

_GIGACHAT_TOKEN_CACHE: dict[str, Any] = {"token": None, "expires_at": 0}


def _norm(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().lower().split())


def _parse_int_id(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    raw = str(value).strip()
    if raw.isdigit():
        num = int(raw)
        return num if num > 0 else None
    return None


def ensure_default_categories(db: Session) -> None:
    if db.query(Category).count() >= 15:
        return
    for n in ['Аренда', 'Коммуналка', 'Интернет', 'Аренда помещения', 'Коммунальные услуги', 'Интернет и связь', 'Заработная плата', 'Хозяйственные товары', 'Расходные материалы', 'Ремонт и обслуживание', 'Прочие расходы', 'Закупка товаров', 'Комиссия маркетплейса', 'Логистика и доставка', 'Хранение товаров', 'Упаковка и расходные материалы', 'Реклама и продвижение', 'Возвраты и потери', 'Упаковка', 'Реклама', 'Банковские комиссии', 'Налоги', 'Подписки и сервисы', 'УСН 6%', 'УСН 15%', 'Страховые взносы', 'НДФЛ', 'Транспортный налог', 'Налоговые платежи', 'Прочие налоговые платежи']:
        if not db.query(Category).filter(Category.name == n).first():
            db.add(Category(user_id=None, name=n, type=CategoryType.EXPENSE, is_system=True, is_active=True))
    for n in ['Продажи', 'Авансы', 'Прочие поступления', 'Вознаграждение от маркетплейса', 'Дополнительные услуги', 'Прочие доходы', 'Продажа товаров', 'Возвраты и корректировки', 'Выручка']:
        if not db.query(Category).filter(Category.name == n).first():
            db.add(Category(user_id=None, name=n, type=CategoryType.INCOME, is_system=True, is_active=True))
    db.flush()


def get_user_context(db: Session, user_id: int | None = None) -> dict[str, list[dict[str, Any]]]:
    ensure_default_categories(db)
    projects_query = db.query(BusinessProject).filter(BusinessProject.is_active.is_(True))
    if user_id is not None:
        projects_query = projects_query.filter(BusinessProject.user_id == user_id)
    projects = projects_query.order_by(BusinessProject.id.asc()).all()

    categories_query = db.query(Category).filter(Category.is_active.is_(True))
    if user_id is not None:
        categories_query = categories_query.filter(
            (Category.user_id == user_id) | (Category.user_id.is_(None))
        )
    categories = categories_query.order_by(Category.id.asc()).all()

    return {
        "projects": [
            {
                "id": int(p.id),
                "name": p.name,
                "description": p.description,
            }
            for p in projects
        ],
        "categories": [
            {
                "id": int(c.id),
                "name": c.name,
                "type": c.type.value if hasattr(c.type, "value") else str(c.type),
            }
            for c in categories
        ],
    }


def resolve_project_id(
    db: Session,
    project_ref: Any,
    user_id: int | None = None,
) -> int | None:
    if project_ref is None:
        return None

    query = db.query(BusinessProject).filter(BusinessProject.is_active.is_(True))
    if user_id is not None:
        query = query.filter(BusinessProject.user_id == user_id)

    parsed_id = _parse_int_id(project_ref)
    if parsed_id is not None:
        project = query.filter(BusinessProject.id == parsed_id).first()
        return int(project.id) if project is not None else None

    clean_name = _norm(project_ref)
    if not clean_name:
        return None

    project = query.filter(BusinessProject.name.ilike(clean_name)).order_by(BusinessProject.id.asc()).first()
    return int(project.id) if project is not None else None


def resolve_category_id(
    db: Session,
    category_ref: Any,
    operation_type: str | None,
    user_id: int | None = None,
    create_if_missing: bool = True,
) -> int | None:
    if category_ref is None:
        return None

    query = db.query(Category).filter(Category.is_active.is_(True))
    if user_id is not None:
        query = query.filter((Category.user_id == user_id) | (Category.user_id.is_(None)))

    parsed_id = _parse_int_id(category_ref)
    if parsed_id is not None:
        by_id = query.filter(Category.id == parsed_id).first()
        if by_id is not None:
            return int(by_id.id)
        if not create_if_missing:
            return None

    clean_name = " ".join(str(category_ref).strip().split())
    if not clean_name:
        return None

    existing = (
        query.filter(Category.name.ilike(clean_name))
        .order_by(Category.id.asc())
        .first()
    )
    if existing is not None:
        return int(existing.id)

    if not create_if_missing:
        return None

    op = _norm(operation_type)
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


def match_rules(db: Session, record: dict[str, Any], user_id: int | None = None) -> dict[str, Any] | None:
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
                "category_ref": rule.category_name,
                "project_ref": rule.project_name,
                "business_status": rule.business_status or "undefined",
                "confidence": 0.90,
                "reason": "Совпадение с сохранённым правилом пользователя или справочника.",
            }

    for item in DEFAULT_RULES:
        kw_hit = any(k in haystack for k in item["keywords"])
        cp_hit = any(c in haystack for c in item["counterparties"])
        if (kw_hit or cp_hit) and not (item["operation_type"] == "expense" and _norm(record.get("direction")) == "income"):
            return {
                "operation_type": item["operation_type"],
                "category_ref": item["category_name"],
                "project_ref": None,
                "business_status": item["business_status"],
                "confidence": item["confidence"],
                "reason": item["reason"],
            }

    return None


def match_user_history(db: Session, record: dict[str, Any], user_id: int | None = None) -> dict[str, Any] | None:
    cp = _norm(record.get("counterparty"))
    desc = _norm(record.get("description"))
    if not cp and not desc:
        return None

    query = (
        db.query(ImportedTransaction, TransactionSuggestion)
        .join(TransactionSuggestion, TransactionSuggestion.imported_transaction_id == ImportedTransaction.id)
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
                "category_ref": sug.category_id,
                "project_ref": sug.project_id,
                "business_status": sug.business_status or "undefined",
                "confidence": 0.86,
                "reason": "Найдено совпадение по ранее подтверждённой операции пользователя.",
            }

    return None


def _extract_json_object(raw_text: str) -> dict[str, Any] | None:
    text = (raw_text or "").strip()
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        text = fenced.group(1).strip()
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except ValueError:
        return None


def _get_gigachat_access_token(auth_key: str, scope: str, ssl_ctx: ssl.SSLContext) -> str:
    now = int(time.time())
    if _GIGACHAT_TOKEN_CACHE["token"] and now < _GIGACHAT_TOKEN_CACHE["expires_at"] - 60:
        return _GIGACHAT_TOKEN_CACHE["token"]

    req = url_request.Request(
        "sberbank.ru",
        data=url_parse.urlencode({"scope": scope}).encode("utf-8"),
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "RqUID": str(uuid.uuid4()),
            "Authorization": f"Basic {auth_key}",
        },
        method="POST",
    )
    with url_request.urlopen(req, timeout=15, context=ssl_ctx) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    token = data["access_token"]
    _GIGACHAT_TOKEN_CACHE["token"] = token
    _GIGACHAT_TOKEN_CACHE["expires_at"] = int(data.get("expires_at", (now + 1500) * 1000)) // 1000
    return token


def _post_chat_completion(
    api_url: str,
    api_key: str,
    model_name: str,
    messages: list[dict[str, str]],
    use_json_schema: bool,
    schema: dict[str, Any],
    ssl_ctx: ssl.SSLContext | None = None,
) -> str | None:
    body: dict[str, Any] = {
        "model": model_name,
        "temperature": 0.1,
        "messages": messages,
    }
    if use_json_schema:
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": "transaction_classification",
                "strict": True,
                "schema": schema,
            },
        }

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    if "openrouter.ai" in api_url.lower():
        headers["HTTP-Referer"] = os.getenv("LLM_HTTP_REFERER", "https://localhost")
        headers["X-Title"] = os.getenv("LLM_APP_TITLE", "Bifintra")

    req = url_request.Request(
        api_url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    with url_request.urlopen(req, timeout=20, context=ssl_ctx) as resp:
        raw_data = json.loads(resp.read().decode("utf-8"))

    choices = raw_data.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, list):
        return "".join(
            part.get("text", "") for part in content if isinstance(part, dict)
        )
    return str(content) if content is not None else None


def classify_with_llm(
    record: dict[str, Any],
    user_context: dict[str, list[dict[str, Any]]] | None = None,
) -> dict[str, Any] | None:
    giga_key = (os.getenv("GIGACHAT_AUTH_KEY") or "").strip()
    api_url = (os.getenv("LLM_API_URL") or "").strip()
    api_key = (os.getenv("LLM_API_KEY") or "").strip()
    if not giga_key and (not api_url or not api_key):
        return None

    ssl_ctx = ssl._create_unverified_context()
    if giga_key:
        scope = (os.getenv("GIGACHAT_SCOPE") or "GIGACHAT_API_PERS").strip()
        model_name = (os.getenv("LLM_MODEL") or "GigaChat").strip()
        target_url = "sberbank.ru"
        try:
            bearer_token = _get_gigachat_access_token(giga_key, scope, ssl_ctx)
        except Exception:
            return None
        supports_schema = False
    else:
        model_name = (os.getenv("LLM_MODEL") or "openrouter/free").strip()
        target_url = api_url
        bearer_token = api_key
        supports_schema = True

    context = user_context or {"projects": [], "categories": []}
    schema: dict[str, Any] = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "operation_type": {"type": ["string", "null"]},
            "category_id": {"type": ["integer", "string", "null"]},
            "category_name": {"type": ["string", "null"]},
            "project_id": {"type": ["integer", "string", "null"]},
            "project_name": {"type": ["string", "null"]},
            "business_status": {"type": "string", "enum": ["business", "personal", "undefined"]},
            "confidence": {"type": "number"},
            "reason": {"type": "string"},
        },
        "required": [
            "operation_type",
            "category_id",
            "category_name",
            "project_id",
            "project_name",
            "business_status",
            "confidence",
            "reason",
        ],
    }

    prompt_payload = {
        "transaction": {
            "description": record.get("description"),
            "counterparty": record.get("counterparty"),
            "amount": record.get("amount"),
            "direction": record.get("direction"),
            "currency": record.get("currency"),
            "transaction_date": str(record.get("transaction_date")) if record.get("transaction_date") else None,
        },
        "available_projects": context.get("projects", []),
        "available_categories": context.get("categories", []),
        "allowed_operation_types": OPERATION_TYPES,
        "allowed_business_statuses": ["business", "personal", "undefined"],
    }

    messages = [
        {
            "role": "system",
            "content": (
                "Ты финансовый классификатор банковских операций. "
                "Выбирай project_id и category_id ТОЛЬКО из переданных available_projects и available_categories по их точному числовому id. "
                "Если ни один проект или категория не подходят достоверно, ставь для них null и не выдумывай несуществующие id. "
                "Если данных недостаточно или назначение не ясно, ставь business_status='undefined' и пиши 'Не удалось определить' в reason. "
                "Отвечай строго в формате JSON-объекта с полями: "
                '{"operation_type": str|null, "category_id": int|null, "category_name": str|null, '
                '"project_id": int|null, "project_name": str|null, "business_status": "business"|"personal"|"undefined", '
                '"confidence": float, "reason": str}.'
            ),
        },
        {"role": "user", "content": json.dumps(prompt_payload, ensure_ascii=False)},
    ]

    content: str | None = None
    try:
        content = _post_chat_completion(
            api_url=target_url,
            api_key=bearer_token,
            model_name=model_name,
            messages=messages,
            use_json_schema=supports_schema,
            schema=schema,
            ssl_ctx=ssl_ctx,
        )
    except HTTPError as exc:
        if exc.code in {400, 404, 415, 422} and supports_schema:
            try:
                content = _post_chat_completion(
                    api_url=target_url,
                    api_key=bearer_token,
                    model_name=model_name,
                    messages=messages,
                    use_json_schema=False,
                    schema=schema,
                    ssl_ctx=ssl_ctx,
                )
            except (URLError, HTTPError, TimeoutError, ValueError, KeyError, IndexError):
                return None
        else:
            return None
    except (URLError, TimeoutError, ValueError, KeyError, IndexError):
        return None

    parsed = _extract_json_object(content or "")
    if not parsed:
        return None

    op_type = parsed.get("operation_type")
    if op_type not in OPERATION_TYPES:
        op_type = None

    biz_status = parsed.get("business_status")
    if biz_status not in {"business", "personal", "undefined"}:
        biz_status = "undefined"

    conf = parsed.get("confidence")
    try:
        conf_val = float(conf) if conf is not None else 0.5
    except (TypeError, ValueError):
        conf_val = 0.5

    reason_text = str(parsed.get("reason") or "Не удалось определить").strip()
    if not reason_text:
        reason_text = "Не удалось определить"

    return {
        "operation_type": op_type,
        "category_ref": parsed.get("category_id") if parsed.get("category_id") is not None else parsed.get("category_name"),
        "project_ref": parsed.get("project_id") if parsed.get("project_id") is not None else parsed.get("project_name"),
        "business_status": biz_status,
        "confidence": max(0.0, min(1.0, conf_val)),
        "reason": reason_text,
    }


def build_suggestion_for_record(
    db: Session, record: dict[str, Any], user_id: int | None = None
) -> dict[str, Any]:
    user_context = get_user_context(db, user_id=user_id)
    op_type, op_conf, op_reason = detect_operation_type(record)

    rule_hit = match_rules(db, record, user_id=user_id)
    history_hit = match_user_history(db, record, user_id=user_id)

    category_ref: Any = None
    project_ref: Any = None
    create_category_if_missing = False
    business_status = "undefined"
    reasons: list[str] = []
    field_confidences: dict[str, float | None] = {
        "operation_type": op_conf if op_type else None,
        "category": None,
        "project": None,
        "business_status": None,
    }

    if op_type:
        reasons.append(op_reason)

    if rule_hit:
        if rule_hit.get("operation_type"):
            op_type = rule_hit["operation_type"]
            field_confidences["operation_type"] = rule_hit.get("confidence", 0.90)
        if rule_hit.get("category_ref") is not None:
            category_ref = rule_hit["category_ref"]
            create_category_if_missing = True
            field_confidences["category"] = rule_hit.get("confidence", 0.88)
        if rule_hit.get("project_ref") is not None:
            project_ref = rule_hit["project_ref"]
            field_confidences["project"] = rule_hit.get("confidence", 0.88)
        if rule_hit.get("business_status") in {"business", "personal"}:
            business_status = rule_hit["business_status"]
            field_confidences["business_status"] = rule_hit.get("confidence", 0.85)
        if rule_hit.get("reason"):
            reasons.append(rule_hit["reason"])

    if history_hit:
        if history_hit.get("operation_type") and not op_type:
            op_type = history_hit["operation_type"]
            field_confidences["operation_type"] = history_hit.get("confidence", 0.86)
        if history_hit.get("category_ref") is not None and category_ref is None:
            category_ref = history_hit["category_ref"]
            create_category_if_missing = True
            field_confidences["category"] = history_hit.get("confidence", 0.86)
        if history_hit.get("project_ref") is not None and project_ref is None:
            project_ref = history_hit["project_ref"]
            field_confidences["project"] = history_hit.get("confidence", 0.86)
        if history_hit.get("business_status") in {"business", "personal"} and business_status == "undefined":
            business_status = history_hit["business_status"]
            field_confidences["business_status"] = history_hit.get("confidence", 0.86)
        if history_hit.get("reason"):
            reasons.append(history_hit["reason"])

    if category_ref is None or project_ref is None or business_status == "undefined" or op_type is None:
        llm_hit = classify_with_llm(record, user_context=user_context)
        if llm_hit:
            if op_type is None and llm_hit.get("operation_type"):
                op_type = llm_hit["operation_type"]
                field_confidences["operation_type"] = llm_hit.get("confidence")
            if category_ref is None and llm_hit.get("category_ref") is not None:
                category_ref = llm_hit["category_ref"]
                create_category_if_missing = False
                field_confidences["category"] = llm_hit.get("confidence")
            if project_ref is None and llm_hit.get("project_ref") is not None:
                project_ref = llm_hit["project_ref"]
                field_confidences["project"] = llm_hit.get("confidence")
            if business_status == "undefined" and llm_hit.get("business_status") in {"business", "personal"}:
                business_status = llm_hit["business_status"]
                field_confidences["business_status"] = llm_hit.get("confidence")
            if llm_hit.get("reason"):
                reasons.append(llm_hit["reason"])

    resolved_cat_int = resolve_category_id(
        db=db,
        category_ref=category_ref,
        operation_type=op_type,
        user_id=user_id,
        create_if_missing=create_category_if_missing,
    )
    resolved_proj_int = resolve_project_id(
        db=db,
        project_ref=project_ref,
        user_id=user_id,
    )

    if resolved_cat_int is None:
        field_confidences["category"] = None
    if resolved_proj_int is None:
        field_confidences["project"] = None

    present_confs = [v for v in field_confidences.values() if v is not None]
    overall_confidence = round(sum(present_confs) / len(present_confs), 2) if present_confs else 0.0

    if not reasons:
        reasons.append("Не удалось определить")

    return {
        "operation_type": op_type or "undefined",
        "category_id": str(resolved_cat_int) if resolved_cat_int is not None else None,
        "project_id": str(resolved_proj_int) if resolved_proj_int is not None else None,
        "business_status": business_status,
        "confidence": overall_confidence,
        "field_confidences": field_confidences,
        "reason": " ".join(reasons),
        "user_decision": None,
    }

import ssl, time, uuid
from urllib import parse as url_parse

_GIGA_CACHE = {'token': None, 'exp': 0}

def _giga_token(auth_key, scope, ctx):
    now = int(time.time())
    if _GIGA_CACHE['token'] and now < _GIGA_CACHE['exp'] - 60:
        return _GIGA_CACHE['token']
    oauth_url = 'https' + '://ngw.devices.' + 'sberbank.ru:9443/api/v2/oauth'
    req = url_request.Request(oauth_url, data=url_parse.urlencode({'scope': scope}).encode(), headers={'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'RqUID': str(uuid.uuid4()), 'Authorization': 'Basic ' + auth_key}, method='POST')
    data = json.loads(url_request.urlopen(req, timeout=15, context=ctx).read().decode())
    _GIGA_CACHE['token'] = data['access_token']
    _GIGA_CACHE['exp'] = int(data.get('expires_at', (now + 1500) * 1000)) // 1000
    return _GIGA_CACHE['token']

_orig_classify = classify_with_llm

def classify_with_llm(record, user_context=None):
    giga_key = (os.getenv('GIGACHAT_AUTH_KEY') or '').strip()
    if not giga_key:
        return _orig_classify(record, user_context=user_context)
    try:
        ctx = ssl._create_unverified_context()
        token = _giga_token(giga_key, (os.getenv('GIGACHAT_SCOPE') or 'GIGACHAT_API_PERS').strip(), ctx)
        chat_url = 'https' + '://gigachat.devices.' + 'sberbank.ru/api/v1/chat/completions'
        context = user_context or {'projects': [], 'categories': []}
        payload = {'transaction': {'description': record.get('description'), 'counterparty': record.get('counterparty'), 'amount': record.get('amount'), 'direction': record.get('direction')}, 'available_projects': context.get('projects', []), 'available_categories': context.get('categories', []), 'allowed_operation_types': OPERATION_TYPES}
        sys_msg = 'Ты финансовый классификатор. Выбирай project_id и category_id ТОЛЬКО из available_projects и available_categories по числовому id (или null, если не подходит). Правила: 1) Для direction=income выбирай ТОЛЬКО доходные категории (Выручка, Прочие доходы, Возвраты) и НИКОГДА не ставь расходные. 2) Для личных трат (продукты, снятие наличных через банкомат, перевод физлицу) НИКОГДА не ставь Банковские комиссии, ставь ставь business_status=personal, project_id=null, category_id=null. 3) Для коммуналки и электроэнергии выбирай Коммунальные услуги; для налогов ФНС/УСН — УСН 6% или Налоговые платежи; для курьерской доставки — Логистика и доставка. 4) Если ни одна категория из available_categories не подходит по смыслу (например, покупка оборудования или перевод без детализации), ставь category_id=null, не выдумывай и не подставляй Аренду. 5) Привязывай операцию к project_id, если она относится к деятельности проекта (в т.ч. коммуналка и аренда для ПВЗ). Если операция относится к бизнесу, ставь business_status=business; если личная - personal; если неясно - undefined. Верни ТОЛЬКО JSON-объект с ключами operation_type, category_id, project_id, business_status, confidence, reason.'
        body = {'model': (os.getenv('LLM_MODEL') or 'GigaChat').strip(), 'temperature': 0.1, 'messages': [{'role': 'system', 'content': sys_msg}, {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}]}
        req = url_request.Request(chat_url, data=json.dumps(body).encode('utf-8'), headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + token}, method='POST')
        raw = json.loads(url_request.urlopen(req, timeout=20, context=ctx).read().decode('utf-8'))
        parsed = _extract_json_object(raw['choices'].pop(0)['message']['content'])
        if not parsed:
            return None
        op = parsed.get('operation_type') if parsed.get('operation_type') in OPERATION_TYPES else None
        biz = parsed.get('business_status') if parsed.get('business_status') in {'business', 'personal', 'undefined'} else 'undefined'
        return {'operation_type': op, 'category_ref': parsed.get('category_id'), 'project_ref': parsed.get('project_id'), 'business_status': biz, 'confidence': float(parsed.get('confidence', 0.85)), 'reason': str(parsed.get('reason') or 'Классифицировано GigaChat').strip()}
    except Exception:
        return None
