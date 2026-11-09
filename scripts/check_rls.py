#!/usr/bin/env python
"""Assert the RLS/REVOKE baseline on every public table (AVP-007, `make db-check-rls`).

Connects with DATABASE_URL and fails (exit 1) if any public table has RLS
disabled, or if anon/authenticated hold any privilege on a public table. This is
the gate from CLAUDE.md hard rule 7: a table is not done until this returns clean.
"""

from __future__ import annotations

import os
import sys

import psycopg

RLS_OFF = """
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by c.relname
"""

BAD_GRANTS = """
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
order by table_name, grantee
"""


def _dsn() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set", file=sys.stderr)
        raise SystemExit(2)
    # psycopg wants a plain libpq URL, not the SQLAlchemy +psycopg driver suffix.
    return url.replace("postgresql+psycopg://", "postgresql://")


def main() -> int:
    violations: list[str] = []
    with psycopg.connect(_dsn()) as conn, conn.cursor() as cur:
        cur.execute(RLS_OFF)
        for (name,) in cur.fetchall():
            violations.append(f"RLS disabled on public.{name}")
        cur.execute(BAD_GRANTS)
        for table_name, grantee, priv in cur.fetchall():
            violations.append(f"grant to {grantee} on public.{table_name}: {priv}")

    if violations:
        for v in violations:
            print(f"FAIL {v}")
        print(f"db-check-rls: {len(violations)} violation(s)")
        return 1
    print("db-check-rls: OK (RLS enabled, no anon/authenticated grants)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
