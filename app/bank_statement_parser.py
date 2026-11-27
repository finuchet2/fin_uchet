"""Parser for the one-column quoted CSV statement export used in Выписка.csv.

The bank export is not a regular tabular CSV: each physical line is a quoted
cell, transaction rows contain two dates and two amounts, and some descriptions
continue on the following physical line. This module normalizes that layout to
a DataFrame consumed by the existing statement validation pipeline.
"""

from __future__ import annotations

import csv
import re
from datetime import datetime
from typing import Any

import pandas as pd

_DATE = r"\d{2}\.\d{2}\.\d{2}"
_DATE_PREFIX = re.compile(
    rf"^\s*(?P<operation_date>{_DATE}(?:\s+\d{{2}}:\d{{2}})?)\s+"
    rf"(?P<processing_date>{_DATE})\s+"
    r"(?P<description>.*?)\s+"
    r"(?P<amount>[+-]?\s*(?:\d{1,3}(?:[ \u00a0]\d{3})*|\d+)[,.]\d{2})\s*₽\s+"
    r"(?P<account_amount>[+-]?\s*(?:\d{1,3}(?:[ \u00a0]\d{3})*|\d+)[,.]\d{2})\s*₽\s*$"
)


def _decode(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _cell(line: str) -> str:
    """Decode one CSV cell without allowing malformed quotes to join rows."""
    try:
        row = next(csv.reader([line]))
        return row[0].strip().strip('"').strip() if row else ""
    except (csv.Error, StopIteration):
        return line.strip().strip('"').strip()


def is_bank_export(data: bytes) -> bool:
    text = _decode(data)
    lines = text.splitlines()
    if len(lines) < 10:
        return False
    sample = "\n".join(_cell(line) for line in lines[:40])
    has_statement_header = "Выписка по договору" in sample or "Операции по карте" in sample
    has_operation_rows = any(_DATE_PREFIX.match(_cell(line)) for line in lines)
    return has_statement_header and has_operation_rows


def _parse_amount(raw: str) -> float:
    cleaned = re.sub(r"\s+", "", raw).replace(",", ".")
    return float(cleaned)


def _parse_date(raw: str):
    value = raw.split()[0]
    return datetime.strptime(value, "%d.%m.%y").date()


def parse_bank_export_dataframe(
    data: bytes,
    default_account_id: str | None = None,
    default_currency: str = "RUB",
) -> pd.DataFrame:
    """Convert the bank's statement layout into the common importer columns."""
    lines = [_cell(line) for line in _decode(data).splitlines()]
    records: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for line in lines:
        match = _DATE_PREFIX.match(line)
        if match:
            if current is not None:
                records.append(current)
            description = re.sub(r"\s+", " ", match.group("description")).strip()
            amount_raw = match.group("account_amount")
            signed_amount = _parse_amount(amount_raw)
            # The second amount is the amount in the account currency. In this
            # export an explicit plus sign means a credit; unsigned rows are
            # debits, even when both directions appear in one section.
            direction = "Поступление" if amount_raw.lstrip().startswith("+") else "Списание"
            operation_date = _parse_date(match.group("operation_date"))
            processing_date = _parse_date(match.group("processing_date"))
            amount = abs(signed_amount)
            current = {
                "Дата операции": operation_date,
                "Дата обработки": processing_date,
                "Сумма": amount,
                "Направление": direction,
                "Контрагент": description,
                "Назначение платежа": description,
                "Идентификатор": None,
                "Валюта": default_currency or "RUB",
                "Счёт": default_account_id,
            }
            continue

        # Descriptions in this export sometimes wrap onto the next line
        # (phone numbers, merchant locations, or a second line of a payment
        # purpose). Ignore blank lines and statement headings.
        if current is not None and line:
            if line.startswith(("Баланс на", "Расходы:", "Поступления:", "Операции по карте", "Дата и время")):
                continue
            extra = re.sub(r"\s+", " ", line).strip()
            if extra and extra not in {"RUS"}:
                current["Назначение платежа"] = f"{current['Назначение платежа']} {extra}".strip()
                if current["Контрагент"] == current["Назначение платежа"]:
                    current["Контрагент"] = current["Назначение платежа"]

    if current is not None:
        records.append(current)

    if not records:
        raise ValueError("Не удалось распознать операции в банковской выписке.")

    return pd.DataFrame.from_records(records)
