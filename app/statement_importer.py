from datetime import date, datetime
from io import BytesIO
import re
from typing import Any
import pandas as pd


COLUMN_ALIASES: dict[str, list[str]] = {
    "transaction_date": [
        "дата",
        "дата операции",
        "дата проводки",
        "date",
        "transaction_date",
    ],
    "amount": [
        "сумма",
        "сумма операции",
        "amount",
        "value",
    ],
    "debit": [
        "списание",
        "расход",
        "дебет",
        "списания",
        "расходы",
        "debit",
    ],
    "credit": [
        "поступление",
        "приход",
        "кредит",
        "поступления",
        "доход",
        "credit",
    ],
    "direction": [
        "направление",
        "направление движения",
        "тип операции",
        "direction",
    ],
    "description": [
        "назначение платежа",
        "назначение",
        "описание",
        "детали платежа",
        "comment",
        "description",
    ],
    "counterparty": [
        "контрагент",
        "получатель",
        "плательщик",
        "получатель / плательщик",
        "counterparty",
    ],
    "account_id": [
        "счёт",
        "счет",
        "банковский счёт",
        "банковский счет",
        "счёт списания",
        "счет списания",
        "account",
        "account_id",
    ],
    "external_id": [
        "идентификатор",
        "идентификатор операции",
        "id операции",
        "референс",
        "external_id",
        "id",
    ],
    "currency": [
        "валюта",
        "currency",
    ],
}

ALLOWED_CURRENCIES: set[str] = {"RUB", "RUR", "₽", "USD", "EUR", "KZT", "BYN"}


def detect_file_format(filename: str) -> str:
    lower = (filename or "").lower().strip()
    if lower.endswith(".csv"):
        return "csv"
    if lower.endswith(".xlsx"):
        return "xlsx"
    raise ValueError("Поддерживаются только файлы форматов CSV и XLSX.")


def load_dataframe(file_bytes: bytes, file_format: str) -> pd.DataFrame:
    if file_format == "csv":
        for encoding in ("utf-8-sig", "utf-8", "cp1251"):
            try:
                return pd.read_csv(BytesIO(file_bytes), encoding=encoding, sep=None, engine="python")
            except UnicodeDecodeError:
                continue
        return pd.read_csv(BytesIO(file_bytes), encoding="utf-8", errors="replace", sep=None, engine="python")
    if file_format == "xlsx":
        return pd.read_excel(BytesIO(file_bytes), engine="openpyxl")
    raise ValueError("Неподдерживаемый формат файла.")


def _normalize_col_name(col: Any) -> str:
    return re.sub(r"\s+", " ", str(col or "").strip().lower())


def map_columns(df: pd.DataFrame) -> dict[str, str]:
    normalized_existing = {_normalize_col_name(col): col for col in df.columns}
    mapping: dict[str, str] = {}
    for target_field, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in normalized_existing:
                mapping[target_field] = normalized_existing[alias]
                break
    return mapping


def _parse_date(value: Any) -> date | None:
    if value is None or (isinstance(value, float) and pd.isna(value)) or pd.isna(value):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text_val = str(value).strip()
    if not text_val:
        return None
    parsed = pd.to_datetime(text_val, dayfirst=True, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date()


def _parse_number(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        num = float(value)
        return None if pd.isna(num) else num
    raw = str(value).strip()
    if not raw:
        return None
    cleaned = re.sub(r"[^\d,.\-+]", "", raw).replace(" ", "")
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        num = float(cleaned)
        return None if pd.isna(num) else num
    except ValueError:
        return None


def _normalize_currency(value: Any, default_currency: str = "RUB") -> tuple[str | None, bool]:
    if value is None or pd.isna(value) or str(value).strip() == "":
        return default_currency, True
    raw = str(value).strip().upper()
    if raw in {"₽", "РУБ", "РУБЛЬ", "РУБЛЕЙ", "RUR"}:
        return "RUB", True
    if raw in ALLOWED_CURRENCIES:
        return raw, True
    return raw, False


def _clean_optional_str(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    s = str(value).strip()
    return s if s else None


def parse_and_validate_statement(
    file_bytes: bytes,
    filename: str,
    default_account_id: str | None = None,
    default_currency: str = "RUB",
) -> dict[str, Any]:
    file_format = detect_file_format(filename)
    df = load_dataframe(file_bytes, file_format)
    df = df.dropna(how="all")

    col_map = map_columns(df)
    norm_default_currency, _ = _normalize_currency(default_currency, "RUB")
    base_currency = norm_default_currency or "RUB"

    records: list[dict[str, Any]] = []
    valid_count = 0
    invalid_count = 0

    for idx, row in df.iterrows():
        errors: list[str] = []

        raw_date = row[col_map["transaction_date"]] if "transaction_date" in col_map else None
        tx_date = _parse_date(raw_date)
        if tx_date is None:
            errors.append("некорректная или отсутствующая дата операции")

        amount: float | None = None
        direction: str | None = None

        if "amount" in col_map:
            parsed_amt = _parse_number(row[col_map["amount"]])
            if parsed_amt is None:
                errors.append("некорректный числовой формат суммы")
            else:
                if parsed_amt < 0:
                    direction = "expense"
                    amount = abs(parsed_amt)
                elif parsed_amt > 0:
                    direction = "income"
                    amount = parsed_amt
                else:
                    amount = 0.0

        debit_val = _parse_number(row[col_map["debit"]]) if "debit" in col_map else None
        credit_val = _parse_number(row[col_map["credit"]]) if "credit" in col_map else None

        if amount is None and ("debit" in col_map or "credit" in col_map):
            if debit_val is not None and debit_val != 0:
                amount = abs(debit_val)
                direction = "expense"
            elif credit_val is not None and credit_val != 0:
                amount = abs(credit_val)
                direction = "income"
            else:
                errors.append("отсутствует корректная сумма операции")

        if "direction" in col_map and _clean_optional_str(row[col_map["direction"]]):
            raw_dir = _clean_optional_str(row[col_map["direction"]]).lower()
            if any(k in raw_dir for k in ("списан", "расход", "дебет", "debit", "expense", "-")):
                direction = "expense"
            elif any(k in raw_dir for k in ("поступл", "приход", "доход", "кредит", "credit", "+")):
                direction = "income"

        raw_curr = row[col_map["currency"]] if "currency" in col_map else None
        currency, curr_valid = _normalize_currency(raw_curr, base_currency)
        if not curr_valid:
            errors.append(f"недопустимая валюта: {currency}")

        description = (
            _clean_optional_str(row[col_map["description"]])
            if "description" in col_map
            else None
        )
        counterparty = (
            _clean_optional_str(row[col_map["counterparty"]])
            if "counterparty" in col_map
            else None
        )
        account_id = (
            _clean_optional_str(row[col_map["account_id"]])
            if "account_id" in col_map
            else None
        ) or _clean_optional_str(default_account_id)
        external_id = (
            _clean_optional_str(row[col_map["external_id"]])
            if "external_id" in col_map
            else None
        )

        if not description and not counterparty:
            errors.append("отсутствует назначение платежа и контрагент")

        is_valid = len(errors) == 0
        if is_valid:
            valid_count += 1
        else:
            invalid_count += 1

        records.append(
            {
                "row_number": int(idx) + 2 if file_format == "csv" else int(idx) + 2,
                "account_id": account_id,
                "external_id": external_id,
                "transaction_date": tx_date,
                "date_fact": tx_date,
                "date_period": tx_date,
                "amount": amount,
                "direction": direction,
                "currency": currency,
                "description": description,
                "counterparty": counterparty,
                "is_valid": is_valid,
                "validation_error": "; ".join(errors) if errors else None,
            }
        )

    if len(records) == 0 or valid_count == 0:
        raise ValueError("В файле не найдено ни одной корректной строки операции.")

    dates = [r["transaction_date"] for r in records if r["transaction_date"] is not None]
    period_start = min(dates) if dates else None
    period_end = max(dates) if dates else None

    return {
        "file_format": file_format,
        "total_rows": len(records),
        "valid_rows": valid_count,
        "invalid_rows": invalid_count,
        "period_start": period_start,
        "period_end": period_end,
        "detected_columns": col_map,
        "records": records,
    }