# Báo cáo tiến độ — nhiệm vụ đã hoàn thành

Cập nhật: 2026-11-10. Chỉ ghi ✅ khi đã verify (build/test/migration chạy thật); PR đang mở = "code xong, chờ bạn merge" (branch protection yêu cầu 1 approval nên agent không tự merge).

## Bảng trạng thái

| Mã | Nhiệm vụ | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|---|
| AVP-031 | Git bootstrap: remote, initial commit, protect `main` | ✅ Merged | `e59b4fc` trên `main` | Phần bảo vệ nhánh (squash-only) nên bật nốt ở Settings |
| AVP-005 | ADRs + OpenAPI contract skeleton | ✅ Merged | PR #1 → `068519c` | 11 ADR + `docs/specs/openapi.yaml` |
| AVP-006 | Scaffold FastAPI + Next.js, Makefile, CI, README | ✅ Merged | PR #2 → `3a81b86`; **CI xanh trên GitHub Actions** | — |
| AVP-039 | Claude skills (MVP stack) | ✅ Merged | PR #3 → `279283e` | 6 skill grounded theo repo |
| AVP-040 + AVP-041 | Gitignore skill cài sẵn + **scope-gate docs** (vertical slices, Layer 2) | ✅ Merged | PR #5 | Đã phê duyệt mở Layer 2 |
| AVP-003 | Ca HFMD mẫu (`case-01-hfmd.json`, độ 2b, draft) | ✅ Merged | PR #4 | `review.status=draft`, cần bác sĩ duyệt (AVP-016) |
| AVP-035 | `validate_cases.py` + typed API client (`gen-client`) | ✅ Merged | PR #7 | Slice 1 |
| AVP-007 | Alembic migration 11 bảng + ORM models + RLS baseline | ✅ Merged | PR #7 | Verify Docker + **Supabase thật** (RLS OK) |
| AVP-008 | Session API (`POST/GET /sessions`, guest token, ownership) + `load-cases` | ✅ Merged | PR #8 | Slice 2 |
| AVP-010 (pt1) | Màn hình Setup (case card, role, mode, consent, điều hướng) | ✅ Merged | PR #8 | Slice 2 frontend |
| AVP-009 | Patient Agent (prompt cache-friendly) + **guardrail 3 tầng** + LLM adapter (Fake/Gemini) | ✅ Code xong & **verify SQL thật**, 🟡 chờ merge | **PR #9** | Slice 3; Hard Rule 1 |
| AVP-012 | Turn loop `POST/GET /sessions/{id}/turns` + lưu transcript | ✅ Code xong & **verify SQL thật**, 🟡 chờ merge | **PR #9** | Slice 3 |
| AVP-010 (pt2) | Clinical Workspace chat (TranscriptBox, ChatInput) | ✅ Code xong & verify, 🟡 chờ merge | **PR #9** | Slice 3 frontend |

## Slice 1 (Foundation) — ✅ đã lên `main`
AVP-035 + AVP-007 (validator, typed client, migration 11 bảng + RLS, load-cases) đã merged qua PR #7. `.env.example` đầy đủ sẵn.

## Slice 2 (Setup & Session) — hoàn tất về mặt code (PR #8)
Session API + guest token + ownership + `load-cases`, và màn hình Setup. **Reconcile theo DB thật** (không theo literal spec): `mode` guided/exam, `status` active, `role` lưu trong `sessions.state`, `case_id`=`case-01-hfmd`, card hiển thị độ 2b (ca thật). FK tới `auth.users` chỉ ở migration (không ở ORM — schema ngoài của Supabase).

### Kiểm thử Slice 2 (exit 0)
- apps/api: `pytest` 9 passed; `ruff` sạch.
- Docker Postgres 16 + pgvector: `alembic upgrade head` → `load-cases` (v1, chạy lại = unchanged) → tạo session (guided/active/guest), GET đúng, sai token → 404, case lạ → 404.
- apps/web: `lint` sạch; `build` OK (4 route gồm `/setup`).

## Kiểm thử đã chạy (exit 0)
- **Validator:** `python scripts/validate_cases.py data/cases/_example_hfmd.draft.json` → `VALID`; fixture hỏng → `INVALID` (exit 1).
- **Backend:** `cd apps/api && python -m pytest -q` → 5 passed; `ruff check .` → sạch.
- **Frontend:** `cd apps/web && npm run lint` → sạch; `npm run build` → OK (4 route); `npm run gen-client` → sinh `src/lib/api-client/schema.ts`.
- **Migration (Docker Postgres 16 + pgvector, môi trường giống Supabase):**
  - `alembic upgrade head` → tạo đủ 11 bảng + `alembic_version`.
  - `make db-check-rls` (`scripts/check_rls.py`) → OK (RLS bật mọi bảng, không có quyền `anon`/`authenticated`).
  - Round-trip `alembic downgrade base` → `upgrade head` → OK.

## Slice 3 (Clinical Workspace — hội thoại) — hoàn tất về mặt code (PR #9)
Patient Agent đóng vai người mẹ + **guardrail 3 tầng** (tier-1 chỉ nói fact trong case; tier-3 unknown ≠ "không"; hot-path chặn từ cấm & con số lạ, regenerate 1 lần rồi fallback), LLM adapter (`FakeLLMProvider` offline + `GeminiProvider` lazy, optional extra), turn loop `POST/GET /sessions/{id}/turns` lưu transcript, và UI chat (TranscriptBox + ChatInput).

### Kiểm thử Slice 3 (exit 0)
- apps/api: `pytest` 17 passed (6 guardrail + 3 turn API + Slice 1/2); `ruff` sạch.
- Docker Postgres thật: tạo session → `POST /turns` lưu 2 turn (student idx 0, patient idx 1) đúng thứ tự, guardrail jsonb lưu, ownership 404 khi sai token.
- apps/web: `lint` sạch; `build` OK (route `/session/[id]` động).

## Thứ tự merge (bạn thực hiện)
- **PR #9** — Slice 3 (base `main`). Merge sau khi CI xanh.

## Việc cần bạn làm tiếp
- **AVP-034 (Supabase):** tạo project, bật `vector`, đặt `DATABASE_URL` (session pooler) vào `apps/api/.env`. Khi có, chạy `make db-migrate` lên Supabase dev; migration & RLS đã sẵn sàng.
- Bật **branch protection squash-only** trên GitHub (các PR đang merge dạng merge-commit).
- Quyết các điểm trong `docs/OPEN_QUESTIONS.md` (do nhóm thêm khi mở rộng scope).

## Rủi ro / nợ kỹ thuật
- Migration tham chiếu `auth.users` + role `anon`/`authenticated` (Supabase); verify local cần dựng 2 role + schema `auth` (đã làm khi test). Trên Supabase thật sẽ có sẵn.
- Clinical content (ca HFMD) vẫn **chưa được bác sĩ duyệt** — không trình như "đã thẩm định".
- `git_task.py` trên Windows cần `PYTHONUTF8=1` (bug decode UTF-8).
