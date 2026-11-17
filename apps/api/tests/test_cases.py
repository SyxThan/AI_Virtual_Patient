"""Case library API tests (Slice 20, AVP-147) with an in-memory fake repository.

All case content here is synthetic; nothing is read from data/cases/.
"""

from __future__ import annotations

import copy
import json

import pytest
from fastapi.testclient import TestClient

from avp_api.db.repositories.case_repo import CaseRecord
from avp_api.main import create_app
from avp_api.routers.cases import get_case_repo

# Secret marker strings: none of them may ever appear in a library response.
SECRET_EXAM = "SECRET-EXAM-FINDING vesicles on palms"
SECRET_HISTORY = "SECRET-HISTORY fever three days"
SECRET_LAB = "SECRET-LAB wbc 14"
SECRET_MGMT = "SECRET-MGMT admit and monitor"
SECRET_FALLBACK = "SECRET-FALLBACK I do not know"
SECRET_RUBRIC = "SECRET-RUBRIC asks about fever"
SECRET_PRESENTATION = "SECRET-PRESENTATION opening line"
SECRET_CITATION = "SECRET-CITATION guideline 2024"
SECRET_SOURCE = "SECRET-SOURCE station table"
SECRET_FORBIDDEN = "SECRET-FORBIDDEN-TERM"
SECRET_OVERUSE = "SECRET-OVERUSE ct scan"
SECRET_TITLE = "Synthetic Disease Alpha"
SECRET_DX = "synthetic disease alpha, grade 2"

FORBIDDEN_KEYS = [
    "exam",
    "rubric",
    "history",
    "labs",
    "management",
    "fallback_lines",
    "presentation",
    "overuse_orders",
    "forbidden_terms",
    "citations",
    "source",
]
SECRET_VALUES = [
    SECRET_EXAM,
    SECRET_HISTORY,
    SECRET_LAB,
    SECRET_MGMT,
    SECRET_FALLBACK,
    SECRET_RUBRIC,
    SECRET_PRESENTATION,
    SECRET_CITATION,
    SECRET_SOURCE,
    SECRET_FORBIDDEN,
    SECRET_OVERUSE,
]


def _content(case_id: str, *, catalog: dict | None = None, informant: dict | None = None) -> dict:
    content = {
        "schema_version": 1,
        "id": case_id,
        "title": {"vi": SECRET_TITLE, "en": SECRET_TITLE},
        "specialty": "Synthetic specialty",
        "source": {"note": SECRET_SOURCE},
        "review": {"status": "clinician_reviewed", "reviewer": "x", "date": "2026-01-01"},
        "patient": {
            "name": "Synthetic Child",
            "age": {"value": 18, "unit": "months"},
            "sex": "male",
            "persona": {"tone": "worried"},
        },
        "presentation": {"chief_complaint": SECRET_PRESENTATION},
        "history": [{"id": "h1", "fact": SECRET_HISTORY}],
        "exam": [{"id": "e1", "finding": SECRET_EXAM}],
        "labs": [{"id": "l1", "value": SECRET_LAB}],
        "overuse_orders": [SECRET_OVERUSE],
        "diagnosis": {"primary": SECRET_DX, "differentials": ["other"]},
        "management": [SECRET_MGMT],
        "rubric": {"version": 1, "criteria": [{"id": "c1", "title": SECRET_RUBRIC}]},
        "citations": [SECRET_CITATION],
        "forbidden_terms": [SECRET_FORBIDDEN],
        "fallback_lines": [SECRET_FALLBACK],
    }
    if informant is not None:
        content["patient"]["informant"] = informant
    if catalog is not None:
        content["catalog"] = catalog
    return content


def _catalog(order: int, **extra) -> dict:
    return {
        "patient_group": "child",
        "display_complaint": "Bé sốt, nổi ban",
        "cover": None,
        "exam_mode": "2d",
        "exam_regions": [
            {"id": "mouth", "label": "Miệng", "x": 0.5, "y": 0.2, "finding": SECRET_EXAM}
        ],
        "estimated_minutes": 15,
        "order": order,
        **extra,
    }


class FakeCaseRepo:
    def __init__(self, records: list[CaseRecord], inactive: set[str] | None = None) -> None:
        self.records = records
        self.inactive = inactive or set()

    def list_active(self) -> list[CaseRecord]:
        return [r for r in self.records if r.id not in self.inactive]

    def get_active(self, case_id: str) -> CaseRecord | None:
        for r in self.list_active():
            if r.id == case_id:
                return r
        return None


def _rec(case_id: str, content: dict, review_status: str = "draft", version: int = 1):
    return CaseRecord(id=case_id, version=version, content=content, review_status=review_status)


@pytest.fixture
def repo() -> FakeCaseRepo:
    return FakeCaseRepo(
        [
            _rec("case-z-nocatalog", _content("case-z-nocatalog")),
            _rec(
                "case-b",
                _content("case-b", catalog=_catalog(2), informant={"role": "mother"}),
                version=3,
            ),
            _rec("case-a", _content("case-a", catalog=_catalog(2))),
            _rec("case-first", _content("case-first", catalog=_catalog(1))),
            _rec("case-off", _content("case-off", catalog=_catalog(0))),
        ],
        inactive={"case-off"},
    )


@pytest.fixture
def client(repo: FakeCaseRepo) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_case_repo] = lambda: repo
    with TestClient(app) as c:
        yield c


def _assert_no_secrets(body: object) -> None:
    text = json.dumps(body, ensure_ascii=False)

    def walk(node: object) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                assert key not in FORBIDDEN_KEYS, f"forbidden key {key!r} in response"
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(body)
    for secret in SECRET_VALUES:
        assert secret not in text, f"secret {secret!r} leaked"


def test_list_only_active_sorted_by_order_then_id(client: TestClient) -> None:
    r = client.get("/api/v1/cases")
    assert r.status_code == 200
    ids = [item["id"] for item in r.json()["items"]]
    assert ids == ["case-first", "case-a", "case-b", "case-z-nocatalog"]


def test_list_never_leaks_answer_key(client: TestClient) -> None:
    body = client.get("/api/v1/cases").json()
    _assert_no_secrets(body)
    text = json.dumps(body, ensure_ascii=False)
    assert SECRET_TITLE not in text
    assert SECRET_DX not in text
    for item in body["items"]:
        assert item["title"] is None
        assert item["diagnosis"] is None


def test_summary_shape(client: TestClient) -> None:
    body = client.get("/api/v1/cases/case-b").json()
    assert body["id"] == "case-b"
    assert body["version"] == 3
    assert body["specialty"] == "Synthetic specialty"
    # DB column wins over content.review.status.
    assert body["review_status"] == "draft"
    assert body["patient"] == {
        "age_value": 18,
        "age_unit": "months",
        "sex": "male",
        "informant_role": "mother",
    }
    assert body["catalog"]["exam_regions"] == [
        {"id": "mouth", "label": "Miệng", "x": 0.5, "y": 0.2}
    ]
    assert body["catalog"]["display_complaint"] == "Bé sốt, nổi ban"
    assert set(body) == {
        "id",
        "version",
        "specialty",
        "review_status",
        "patient",
        "catalog",
        "title",
        "diagnosis",
    }


def test_no_informant_means_self_and_no_catalog_is_null(client: TestClient) -> None:
    body = client.get("/api/v1/cases/case-z-nocatalog").json()
    assert body["patient"]["informant_role"] == "self"
    assert body["catalog"] is None


def test_get_without_reveal_hides_title_and_diagnosis(client: TestClient) -> None:
    body = client.get("/api/v1/cases/case-a").json()
    assert body["title"] is None and body["diagnosis"] is None
    _assert_no_secrets(body)
    assert SECRET_DX not in json.dumps(body)


def test_get_with_reveal_shows_title_and_diagnosis_only(client: TestClient) -> None:
    body = client.get("/api/v1/cases/case-a", params={"reveal": "true"}).json()
    assert body["title"] == SECRET_TITLE
    assert body["diagnosis"] == SECRET_DX
    _assert_no_secrets(body)


@pytest.mark.parametrize("case_id", ["case-unknown", "case-off"])
def test_get_unknown_or_inactive_is_404(client: TestClient, case_id: str) -> None:
    r = client.get(f"/api/v1/cases/{case_id}")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "CASE_NOT_FOUND"
    assert r.json()["error"]["message"]


def test_invalid_catalog_is_served_as_null() -> None:
    bad = _content("case-bad", catalog={"patient_group": "alien", "order": "x"})
    app = create_app()
    app.dependency_overrides[get_case_repo] = lambda: FakeCaseRepo([_rec("case-bad", bad)])
    with TestClient(app) as c:
        body = c.get("/api/v1/cases").json()
    assert body["items"][0]["catalog"] is None


def test_public_no_auth_needed(client: TestClient) -> None:
    # No Authorization and no X-Guest-Token header: still 200.
    assert client.get("/api/v1/cases").status_code == 200
    assert client.get("/api/v1/cases/case-a").status_code == 200


def test_content_is_not_mutated(repo: FakeCaseRepo, client: TestClient) -> None:
    before = copy.deepcopy([r.content for r in repo.records])
    client.get("/api/v1/cases")
    client.get("/api/v1/cases/case-a", params={"reveal": "true"})
    assert [r.content for r in repo.records] == before
