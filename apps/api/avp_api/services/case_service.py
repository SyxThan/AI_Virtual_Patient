"""Case library logic (Slice 20, AVP-147).

Turns stored case content into a whitelisted CaseSummary. Only the fields named
here are copied; everything else in the case JSON (exam, rubric, history, labs,
management, fallback lines, citations, source...) is never read into the DTO.
"""

from __future__ import annotations

import logging

from fastapi import HTTPException
from pydantic import ValidationError

from avp_api.db.repositories.case_repo import CaseRecord, CaseRepository
from avp_api.schemas.case import CaseCatalog, CaseListResponse, CasePatient, CaseSummary

log = logging.getLogger(__name__)


def _catalog(content: dict) -> CaseCatalog | None:
    raw = content.get("catalog")
    if not isinstance(raw, dict):
        return None
    try:
        # Extra keys are ignored by the model, so only whitelisted fields survive.
        return CaseCatalog.model_validate(raw)
    except ValidationError:
        log.warning("case %s has an invalid catalog block; served without it", content.get("id"))
        return None


def _patient(content: dict) -> CasePatient:
    patient = content.get("patient") or {}
    age = patient.get("age") or {}
    informant = patient.get("informant")
    role = informant.get("role") if isinstance(informant, dict) else None
    return CasePatient(
        age_value=age.get("value"),
        age_unit=age.get("unit"),
        sex=patient.get("sex"),
        informant_role=role or "self",
    )


def _summary(rec: CaseRecord, reveal: bool) -> CaseSummary:
    content = rec.content
    title = diagnosis = None
    if reveal:
        raw_title = content.get("title")
        title = raw_title.get("vi") if isinstance(raw_title, dict) else None
        raw_dx = content.get("diagnosis")
        diagnosis = raw_dx.get("primary") if isinstance(raw_dx, dict) else None
    return CaseSummary(
        id=rec.id,
        version=rec.version,
        specialty=content.get("specialty", ""),
        review_status=rec.review_status,
        patient=_patient(content),
        catalog=_catalog(content),
        title=title,
        diagnosis=diagnosis,
    )


def _sort_key(summary: CaseSummary) -> tuple[int, int, str]:
    if summary.catalog is None:
        return (1, 0, summary.id)  # cases without a catalog block go last
    return (0, summary.catalog.order, summary.id)


def list_cases(repo: CaseRepository) -> CaseListResponse:
    items = [_summary(rec, reveal=False) for rec in repo.list_active()]
    return CaseListResponse(items=sorted(items, key=_sort_key))


def get_case(case_id: str, repo: CaseRepository, reveal: bool) -> CaseSummary:
    rec = repo.get_active(case_id)
    if rec is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "CASE_NOT_FOUND", "message": f"Case '{case_id}' is not available."},
        )
    return _summary(rec, reveal)
