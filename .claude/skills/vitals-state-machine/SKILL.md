---
name: vitals-state-machine
description: Use when building, testing, or updating the Vitals State Machine, monitor UI, or severity transitions (`apps/api/avp_api/services/vitals_service.py` and `apps/web/src/components/workspace/VitalsMonitor.tsx`).
---

# Vitals State Machine Skill

Guidance for implementing the clinical Vitals State Machine for pediatric Hand, Foot, and Mouth Disease (HFMD) in compliance with Ministry of Health guidelines (QĐ 1003/QĐ-BYT).

## Core Concepts
- **Deterministic Transitions:** State transitions depend on two factors:
  1. *Time Elapsed without intervention* (e.g. 5 minutes without antipyretic $\rightarrow$ high fever).
  2. *Student Orders / Actions* (e.g. correct antipyretic dose $\rightarrow$ temperature drops).
- **Clinical Grade Alignment:**
  - `GRADE_1`: Mild, stable vitals (T: 37.8°C, HR: 115 bpm).
  - `GRADE_2A_BASELINE`: T: 39.2°C, HR: 142 bpm (fever difficult to control, 1 startle reflex).
  - `GRADE_2A_HIGH_FEVER`: T: 39.8°C, HR: 155 bpm (persistent fever).
  - `GRADE_2B_PROGRESSION`: T: 39.5°C, HR: 168 bpm, RR: 44 bpm, frequent startle $\ge 2$ times / 30 mins.
  - `STABILIZED`: Responsive to correct management (T: 37.8°C, HR: 124 bpm).

## Backend Implementation Pattern (`vitals_service.py`)
```python
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Literal

ClinicalState = Literal["GRADE_1", "GRADE_2A_BASELINE", "GRADE_2A_HIGH_FEVER", "GRADE_2B_PROGRESSION", "STABILIZED"]

class VitalsSnapshot(BaseModel):
    temperature_c: float
    heart_rate_bpm: int
    respiratory_rate_bpm: int
    blood_pressure_sys: int
    blood_pressure_dia: int
    spo2_percent: int
    clinical_state: ClinicalState
    updated_at: datetime

class VitalsStateMachine:
    def __init__(self, initial_state: ClinicalState = "GRADE_2A_BASELINE"):
        self.state = initial_state
        self.last_updated = datetime.now(timezone.utc)

    def trigger_event(self, event: str, payload: dict | None = None) -> VitalsSnapshot:
        if event == "ORDER_ANTIPYRETIC":
            # Paracetamol 10-15 mg/kg administered
            if self.state in ["GRADE_2A_BASELINE", "GRADE_2A_HIGH_FEVER"]:
                self.state = "STABILIZED"
        elif event == "TIME_TICK_UNMANAGED":
            if self.state == "GRADE_2A_BASELINE":
                self.state = "GRADE_2A_HIGH_FEVER"
            elif self.state == "GRADE_2A_HIGH_FEVER":
                self.state = "GRADE_2B_PROGRESSION"

        return self.get_snapshot()

    def get_snapshot(self) -> VitalsSnapshot:
        matrix = {
            "GRADE_2A_BASELINE": (39.2, 142, 32, 95, 65, 97),
            "GRADE_2A_HIGH_FEVER": (39.8, 155, 36, 100, 65, 96),
            "GRADE_2B_PROGRESSION": (39.5, 168, 44, 110, 70, 94),
            "STABILIZED": (37.8, 124, 28, 92, 60, 98),
        }
        t, hr, rr, sys, dia, spo2 = matrix.get(self.state, matrix["GRADE_2A_BASELINE"])
        return VitalsSnapshot(
            temperature_c=t,
            heart_rate_bpm=hr,
            respiratory_rate_bpm=rr,
            blood_pressure_sys=sys,
            blood_pressure_dia=dia,
            spo2_percent=spo2,
            clinical_state=self.state,
            updated_at=datetime.now(timezone.utc),
        )
```

## Frontend Integration (`VitalsMonitor.tsx`)
- Render continuous monitor layout with heart rate waveform / digital readout.
- Apply conditional Tailwind styles:
  - Temperature $> 39.0^\circ\text{C}$: `text-red-500 animate-pulse`
  - Heart rate $> 150$: `text-amber-500 font-bold`
  - SpO2 $< 95\%$: `text-red-600`

## Common Pitfalls
1. **Clock Desync:** Do not rely purely on client `setInterval` for vital degradation. Backend must validate elapsed session time.
2. **Pediatric Reference Range:** Children 1-2 years have normal HR 100-130 and RR 24-30. Do not use adult vitals thresholds.

