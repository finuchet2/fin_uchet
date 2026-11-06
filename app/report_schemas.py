
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

from typing import Annotated
from pydantic import PlainSerializer

Money = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]


class ReportRowSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    amount: Money
    percentage: Money


class ReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    income: Money
    expense: Money
    tax: Money
    net: Money

    income_percentage: Money
    expense_percentage: Money
    tax_percentage: Money
    net_percentage: Money

    income_rows: list[ReportRowSchema]
    expense_rows: list[ReportRowSchema]
    tax_rows: list[ReportRowSchema]

    count: int


class ComparisonMetricSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    current: Money
    previous: Money
    difference: Money
    percent_change: Money | None
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
