"""Case library schemas (Slice 20, AVP-147 / TASK-S20-02).

A CaseSummary is the card a student sees before starting a case. It is built by
whitelisting fields, so it never carries the answer key: no exam findings,
rubric, history, labs, management, fallback lines or citations. `title` and
`diagnosis` name the disease and are filled only when the caller asks for
`reveal=true`.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

PatientGroup = Literal["child", "adult", "elderly"]
ExamMode = Literal["3d", "2d"]
ReviewStatus = Literal["draft", "clinician_reviewed"]


class CaseExamRegion(BaseModel):
    id: str
    label: str
    # Position on the 2D illustration (0..1); null when the case uses the 3D scene.
    x: float | None = None
    y: float | None = None


class CaseCatalog(BaseModel):
    patient_group: PatientGroup
    # Chief complaint shown on the card; never the diagnosis.
    display_complaint: str
    cover: str | None = None
    exam_mode: ExamMode
    exam_regions: list[CaseExamRegion] = Field(default_factory=list)
    estimated_minutes: int | None = None
    order: int


class CasePatient(BaseModel):
    age_value: int
    age_unit: str
    sex: str
    # patient.informant.role, or "self" when the patient answers for themselves.
    informant_role: str


class CaseSummary(BaseModel):
    id: str
    version: int
    specialty: str
    review_status: ReviewStatus
    patient: CasePatient
    catalog: CaseCatalog | None = None
    # Filled only with reveal=true: both name the disease.
    title: str | None = None
    diagnosis: str | None = None


class CaseListResponse(BaseModel):
    items: list[CaseSummary]
