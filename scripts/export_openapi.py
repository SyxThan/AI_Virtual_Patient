#!/usr/bin/env python
"""Export the live FastAPI OpenAPI schema (the API contract, CLAUDE.md) to JSON.

Used by `make gen-client` / `npm run gen-client` so the typed web client is
generated from the real app, not from the design sketch in docs/specs/openapi.yaml.
No database or secrets needed: the app factory is import-safe.

Usage: python scripts/export_openapi.py <out.json>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from avp_api.main import create_app


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: export_openapi.py <out.json>", file=sys.stderr)
        return 2
    out = Path(argv[0])
    out.parent.mkdir(parents=True, exist_ok=True)
    schema = create_app().openapi()
    out.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(schema.get('paths', {}))} paths)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
