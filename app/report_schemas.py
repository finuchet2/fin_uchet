
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

from typing import Annotated
from pydantic import PlainSerializer

Money = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]


class ReportRowSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    amount: Decimal
    percentage: Decimal


class ReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    income: Decimal
    expense: Decimal
    tax: Decimal
    net: Decimal

    income_percentage: Decimal
    expense_percentage: Decimal
    tax_percentage: Decimal
    net_percentage: Decimal

    income_rows: list[ReportRowSchema]
    expense_rows: list[ReportRowSchema]
    tax_rows: list[ReportRowSchema]

    count: int


class ComparisonMetricSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    current: Decimal
    previous: Decimal
    difference: Decimal
    percent_change: Decimal | None
    trend: Literal["UP", "DOWN", "UNCHANGED"]


class ReportComparisonSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    income: ComparisonMetricSchema
    expense: ComparisonMetricSchema
    tax: ComparisonMetricSchema
    net: ComparisonMetricSchema


class ReportRequestSchema(BaseModel):
    project_ids: list[str] | None = None
    period_start: date
    period_end: date
    method: Literal["PNL", "CASH_FLOW"]

    @model_validator(mode="after")
    def validate_period(self):
        if self.period_start > self.period_end:
            raise ValueError(
                "Начало периода не может быть позже его окончания"
            )
        return self


class ReportComparisonRequestSchema(BaseModel):
    current_period_start: date
    current_period_end: date
    previous_period_start: date
    previous_period_end: date
    project_ids: list[str] | None = None
    method: Literal["PNL", "CASH_FLOW"]

    @model_validator(mode="after")
    def validate_periods(self):
        if self.current_period_start > self.current_period_end:
            raise ValueError(
                "Начало текущего периода не может быть позже его окончания"
            )

        if self.previous_period_start > self.previous_period_end:
            raise ValueError(
                "Начало предыдущего периода не может быть позже его окончания"
            )

        return self
