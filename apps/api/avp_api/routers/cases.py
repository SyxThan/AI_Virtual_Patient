"""Case library routes (thin): GET /cases, GET /cases/{case_id} (Slice 20, AVP-147).

Public (guests too). Returns card data only, never the answer key.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from avp_api.db.repositories.case_repo import CaseRepository, SqlCaseRepository
from avp_api.db.session import get_db
from avp_api.schemas.case import CaseListResponse, CaseSummary
from avp_api.services import case_service

router = APIRouter(tags=["cases"])


def get_case_repo(db=Depends(get_db)) -> CaseRepository:
    return SqlCaseRepository(db)


@router.get("/cases", response_model=CaseListResponse)
def list_cases(repo: CaseRepository = Depends(get_case_repo)) -> CaseListResponse:
    return case_service.list_cases(repo)


@router.get("/cases/{case_id}", response_model=CaseSummary)
def get_case(
    case_id: str,
    reveal: bool = Query(
        default=False, description="Include title and diagnosis (they name the disease)."
    ),
    repo: CaseRepository = Depends(get_case_repo),
) -> CaseSummary:
    return case_service.get_case(case_id, repo, reveal)
