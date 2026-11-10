"""Vitals state-machine API schemas (Slice 4, AVP-102).

Clinical values and transitions follow docs/specs/vitals-state-machine.md
(QĐ 1003/QĐ-BYT). Draft scenario content — needs clinician review (Hard Rule 2).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ClinicalState = Literal[
    "GRADE_1",
    "GRADE_2A_BASELINE",
    "GRADE_2A_HIGH_FEVER",
    "GRADE_2B_PROGRESSION",
    "STABILIZED",
]

VitalsEvent = Literal[
    "MEASURE_VITALS",
    "TIME_TICK",
    "ORDER_ANTIPYRETIC",
    "ORDER_SEDATIVE",
    "ORDER_INCORRECT",
]


class VitalsSnapshot(BaseModel):
    temperature_c: float
    heart_rate_bpm: int
    respiratory_rate_bpm: int
    blood_pressure_sys: int
    blood_pressure_dia: int
    spo2_percent: int
    clinical_state: ClinicalState
    clinical_label: str
    active_symptoms: list[str]
    updated_at: datetime


class VitalsEventRequest(BaseModel):
    event: VitalsEvent
    notes: str | None = None
