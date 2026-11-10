"""Clinical action schemas (Slice 5-02, AVP-104): physical exam on the avatar."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, model_validator

# Regions the UI can tap on the 3D avatar (colliders in components/avatar).
UIExamRegion = Literal["palm_hands", "feet", "mouth_throat", "buttocks_knees"]
ActionType = Literal["examine_region", "observe_child"]


class ExamActionRequest(BaseModel):
    action: ActionType
    # Required for examine_region; ignored for observe_child.
    region: UIExamRegion | None = None

    @model_validator(mode="after")
    def _region_required(self) -> ExamActionRequest:
        if self.action == "examine_region" and self.region is None:
            raise ValueError("region is required for examine_region")
        return self


class ExamActionResponse(BaseModel):
    action: ActionType
    region: UIExamRegion | None
    # The case's own exam region the UI region maps onto (None if unmapped).
    case_region: str | None
    # False => the case has no documented finding here: show the neutral unknown
    # message, never a fabricated negative (Hard Rule 1).
    documented: bool
    finding: str | None
    case_action: str | None
    red_flag: bool
    review_status: str
    # Index of the system turn that recorded the finding in the transcript.
    turn_idx: int
