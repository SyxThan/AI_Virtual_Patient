# Báo cáo tiến độ — nhiệm vụ đã hoàn thành

Cập nhật: 2026-11-09. Chỉ ghi ✅ khi đã verify (build/test/migration chạy thật); PR đang mở = "code xong, chờ bạn merge" (branch protection yêu cầu 1 approval nên agent không tự merge).

## Bảng trạng thái

| Mã | Nhiệm vụ | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|---|
| AVP-031 | Git bootstrap: remote, initial commit, protect `main` | ✅ Merged | `e59b4fc` trên `main` | Phần bảo vệ nhánh (squash-only) nên bật nốt ở Settings |
| AVP-005 | ADRs + OpenAPI contract skeleton | ✅ Merged | PR #1 → `068519c` | 11 ADR + `docs/specs/openapi.yaml` |
| AVP-006 | Scaffold FastAPI + Next.js, Makefile, CI, README | ✅ Merged | PR #2 → `3a81b86`; **CI xanh trên GitHub Actions** | — |
| AVP-039 | Claude skills (MVP stack) | ✅ Merged | PR #3 → `279283e` | 6 skill grounded theo repo |
| AVP-040 + AVP-041 | Gitignore skill cài sẵn + **scope-gate docs** (vertical slices, Layer 2) | 🟡 Chờ merge | **PR #5** | Merge = phê duyệt mở Layer 2 (avatar/voice/vitals/PDF+QR practice) |
| AVP-003 | Ca HFMD mẫu (`case-01-hfmd.json`, độ 2b, draft) | 🟡 Chờ merge | **PR #4** | `review.status=draft`, cần bác sĩ duyệt (AVP-016) |
| AVP-035 | `validate_cases.py` + typed API client (`gen-client`) | ✅ Code xong & verify, 🟡 chờ merge | **PR #6** (`7a47373`) | Xem "Kiểm thử" |
| AVP-007 | Alembic migration 11 bảng + ORM models + RLS baseline | ✅ Code xong & **verify bằng Docker**, 🟡 chờ merge | **PR #6** (commit `feat(db): ... [AVP-007]`) | Xem "Kiểm thử" |

## Slice 1 (Foundation) — hoàn tất về mặt code
PR #6 (nhánh `feat/avp-035-slice1-foundation`, stacked trên PR #5) chứa AVP-035 + AVP-007. `.env.example` đã đầy đủ sẵn (backend + frontend), không cần sửa.

## Kiểm thử đã chạy (exit 0)
- **Validator:** `python scripts/validate_cases.py data/cases/_example_hfmd.draft.json` → `VALID`; fixture hỏng → `INVALID` (exit 1).
- **Backend:** `cd apps/api && python -m pytest -q` → 5 passed; `ruff check .` → sạch.
- **Frontend:** `cd apps/web && npm run lint` → sạch; `npm run build` → OK (4 route); `npm run gen-client` → sinh `src/lib/api-client/schema.ts`.
- **Migration (Docker Postgres 16 + pgvector, môi trường giống Supabase):**
  - `alembic upgrade head` → tạo đủ 11 bảng + `alembic_version`.
  - `make db-check-rls` (`scripts/check_rls.py`) → OK (RLS bật mọi bảng, không có quyền `anon`/`authenticated`).
  - Round-trip `alembic downgrade base` → `upgrade head` → OK.

## Thứ tự merge (bạn thực hiện)
1. **PR #4** — ca HFMD (base `main`)
2. **PR #5** — housekeeping + scope-gate docs (base `main`)
3. **PR #6** — Slice 1 code (stacked trên #5; merge #5 trước, GitHub tự chuyển base về `main`)

## Việc cần bạn làm tiếp
- **AVP-034 (Supabase):** tạo project, bật `vector`, đặt `DATABASE_URL` (session pooler) vào `apps/api/.env`. Khi có, chạy `make db-migrate` lên Supabase dev; migration & RLS đã sẵn sàng.
- Bật **branch protection squash-only** trên GitHub (các PR đang merge dạng merge-commit).
- Quyết các điểm trong `docs/OPEN_QUESTIONS.md` (do nhóm thêm khi mở rộng scope).

## Rủi ro / nợ kỹ thuật
- Migration tham chiếu `auth.users` + role `anon`/`authenticated` (Supabase); verify local cần dựng 2 role + schema `auth` (đã làm khi test). Trên Supabase thật sẽ có sẵn.
- Clinical content (ca HFMD) vẫn **chưa được bác sĩ duyệt** — không trình như "đã thẩm định".
- `git_task.py` trên Windows cần `PYTHONUTF8=1` (bug decode UTF-8).
