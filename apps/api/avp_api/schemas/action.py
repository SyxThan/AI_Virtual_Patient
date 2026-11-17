"""Clinical action schemas (Slice 5-02, AVP-104): physical exam on the avatar."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints, model_validator

# A hotspot id from the case's `catalog.exam_regions` (AVP-150): the 3D avatar's
# colliders for HFMD (palm_hands, feet, mouth_throat, buttocks_knees) or a 2D
# hotspot of another case. Which ids exist is checked against the case in
# exam_service (422 UNKNOWN_REGION), not here.
UIExamRegion = Annotated[str, StringConstraints(pattern=r"^[a-z0-9_]{1,64}$")]
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
