# Báo cáo tiến độ — nhiệm vụ đã hoàn thành

Cập nhật: 2026-11-12 (Giai đoạn 2: Slice 10–13). Chỉ ghi ✅ khi đã verify (build/test/migration chạy thật); PR đang mở = "code xong, chờ bạn merge" (branch protection yêu cầu 1 approval nên agent không tự merge).

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
| AVP-009 | Patient Agent + **guardrail 3 tầng** + LLM adapter (Fake/Gemini) | ✅ Merged | PR #9 | Slice 3; Hard Rule 1 |
| AVP-012 | Turn loop `POST/GET /sessions/{id}/turns` + lưu transcript | ✅ Merged | PR #9 | Slice 3 |
| AVP-010 (pt2) | Clinical Workspace chat (TranscriptBox, ChatInput) | ✅ Merged | PR #9 | Slice 3 frontend |
| AVP-012 (fix) | Sửa 500 turn loop (async→sync, tránh pool xuyên thread) | ✅ Merged | PR #10 | — |
| AVP-009 (fix) | Retry lỗi Gemini tạm thời (503/429) + `make check-llm` | ✅ Merged | PR #11 | — |
| AVP-102 | **Vitals State Machine** (5 trạng thái HFMD) + Patient Monitor UI | ✅ Merged | PR #12 | Slice 4; draft lâm sàng; jsonb verify DB thật (cùng PR #14) |
| AVP-104 (S5-01) | Avatar 3D SSR-safe (rig procedural mẹ bế bé, OrbitControls) | ✅ Merged | PR #13 | Slice 5 |
| AVP-104 (S5-02) | Raycasting khám 4 vùng → `POST /sessions/{id}/actions` → ghi turn → panel kết quả | ✅ Merged | PR #14 | Mapping vùng + ảnh minh hoạ cần duyệt |
| AVP-104 (S5-03) | Lip-sync theo biên độ audio | ✅ Merged | PR #15 | Đã nối với voice ở PR #17 |
| AVP-020 (S6-01) | Adapter STT/TTS + Fake offline + lỗi có kiểu + đo latency | ✅ Merged | PR #16 | Real provider (Google Cloud) **chưa bật** |
| AVP-022 (S6-02) | WebSocket `/ws/sessions/{id}` + `useVoiceSession` + nút giữ-để-nói | ✅ Merged | PR #17 | — |
| AVP-013 (S7-02) | Evidence verifier (NFC, chỉ lời student, giáng cấp) + scoring engine thuần | ✅ Merged | PR #18 | Có giới hạn điểm khi trượt critical hay không: chờ bác sĩ (AVP-016) |
| AVP-014 (S7-01) | Evaluator Agent + job queue (`SKIP LOCKED`) + `/finish`, `/evaluation`, `/evaluation/retry` + nút Kết thúc | ✅ Merged | PR #18 | Chưa chạy Evaluator với Gemini thật |
| AVP-017/018 (S8-01) | Embedding adapter (Fake 768d + Gemini lazy), corpus HFMD (QĐ 1003 + BV BNĐ 2023), rights gate, pgvector repo, migration 0002 (HNSW), `ingest_guidelines.py` | ✅ Merged | PR #19 | Corpus là **bản tóm tắt nháp**, chưa đối chiếu nguyên văn, chưa có số trang: chờ bác sĩ |
| AVP-019 (S8-02) | Debriefing Agent 5 tầng + citation verifier + chuỗi job evaluate→debrief + `GET /debrief` | ✅ Merged | PR #19 | Chưa chạy với Gemini thật; ngưỡng liên quan cho Gemini chưa hiệu chỉnh |
| AVP-105 (S9-02) | PDF báo cáo phản hồi + QR (`GET /sessions/{id}/debrief/pdf`), chặn từ ngữ ADR-0010, font Unicode + fallback ASCII | ✅ Merged | **PR #20** | Thêm dependency `fpdf2`, `qrcode[pil]` (theo brief) |
| AVP-015 (S9-01) | Màn hình Debrief `/debrief/[id]`: polling, cảnh báo red flag, bảng kiểm + bằng chứng → transcript, phản hồi 5 tầng, trích dẫn, xuất PDF | ✅ Merged | **PR #20** | — |
| AVP-025 (pt1) | Test API luồng đầy đủ + phân quyền 11 route (agy viết, Claude review) | 🟡 Chờ merge | **PR #21** | 105 test pass; chưa có Playwright / staging |
| AVP-042 | Kế hoạch Giai đoạn 2 (Slice 10–14) trong `docs/tasks.md` + cập nhật scope, quality gates, open questions, risks | 🟡 Chờ merge | PR (docs) | Chỉ tài liệu |
| AVP-106/107/108 (S10) | Đăng nhập Supabase: FastAPI xác thực JWT qua JWKS (RS256/ES256) cho HTTP + WS, `/login`, `/profile`, `GET/PATCH /me`, nhận phiên khách vào tài khoản, tên trên PDF | ✅ Merged | PR #24 | Đăng nhập thật trên trình duyệt: người dùng tự test |
| AVP-109/110/111 (S11) | `GET /sessions` (keyset, 1 SQL), `GET /sessions/progress`, trang `/history` + biểu đồ tiến bộ | ✅ Merged | PR #23 | Verify Postgres thật (EXPLAIN dùng index) |
| AVP-120 | Test chéo Slice 10–11 (agy viết, Claude review) | ✅ Merged | PR #25 | 170 test |
| AVP-112/113/114 + AVP-022/036 (S12) | Trang chủ, 404/error/loading, menu mobile, xử lý micro/WS/provider lỗi, xác nhận kết thúc, khôi phục phiên, đồng hồ, chế độ Luyện tập/Thi thử (`/guide`, giới hạn thời gian), hướng dẫn lần đầu, responsive + axe | 🟡 Chờ merge | PR #27 | Browser check 62/62 + WS 4/4, axe không còn lỗi serious/critical |
| AVP-115 (S13) | `DELETE /sessions/{id}`, `DELETE /me` (+ xoá tài khoản Supabase nếu có `SUPABASE_SECRET_KEY` ở server), dọn phiên khách (`jobs.cleanup`), trang `/privacy`, nút xoá | 🟡 Chờ merge | PR #26 | Verify Postgres thật: 0 dòng con sau khi xoá; nội dung `/privacy` là bản nháp |
| AVP-121 | Tích hợp S12+S13: giới hạn thời gian cho thao tác khám/y lệnh, worker không crash khi phiên bị xoá, `hide_parameters` cho log SQL (T-SEC-02), nút xoá trên `/debrief`, sửa câu đồng ý, gen-client | 🟡 Chờ merge (sau #26, #27) | PR #28 | — |

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

## Slice 4 (Vitals State Machine & Monitor) — hoàn tất về mặt code (PR #12)
Máy trạng thái sinh hiệu 5 độ (GRADE_1 → 2a baseline → 2a sốt cao → 2b → STABILIZED) theo `vitals-state-machine.md`, chuyển trạng thái deterministic theo y lệnh/thời gian, lưu trong `sessions.state["vitals"]` (không bảng mới). `GET /sessions/{id}/vitals` + `POST /sessions/{id}/vitals/events`. UI Patient Monitor (HR/Temp/RR/BP/SpO2, cảnh báo sốt cao, badge phân độ, nút Đo / Cho hạ sốt) ở cột trái workspace. **Số liệu lâm sàng là draft, cần bác sĩ duyệt.**

### Kiểm thử Slice 4 (exit 0)
- apps/api: `pytest` 21 passed (4 vitals + các slice trước); `ruff` sạch.
- apps/web: `lint` sạch; `build` OK.
- ⚠️ Chưa chạy verify DB thật (Docker đang tắt); routes vitals là `def` đồng bộ nên không dính lỗi pool.

## Slice 5 (Avatar 3D & khám raycasting) — hoàn tất về mặt code (PR #13, #14, #15)
- **S5-01 (#13):** `three@0.170.0`; rig low-poly procedural "mẹ bế bé" (chưa có `.glb`), `next/dynamic` ssr:false, OrbitControls giới hạn trước/bên, resize, dispose đầy đủ. Nhãn "Mô hình minh hoạ".
- **S5-02 (#14):** raycasting theo khung canvas (phân biệt click/kéo), hover highlight, nút "Quan sát trẻ nằm yên". `POST /sessions/{id}/actions` lấy finding **nguyên văn** từ `exam[]` của case; vùng không có ghi nhận → "không có ghi nhận" (không bịa âm tính). Ghi 2 turn (student + system); turn system **không** đưa vào prompt người mẹ. `gen-client` giờ sinh từ schema FastAPI thật.
- **S5-03 (#15):** `LipSyncController` (AnalyserNode → RMS → độ mở miệng); không có audio thì miệng đóng (no-op) — chờ Slice 6 nối voice.
- ⚠ Cần duyệt: mapping `mouth_throat→mouth`, `palm_hands/feet/buttocks_knees→skin`; red flag giật mình hiển thị qua thao tác "quan sát"; chưa có ảnh lâm sàng thật (chỉ SVG minh hoạ, `TODO(clinician)`).

### Kiểm thử Slice 5 (exit 0)
- apps/api: `pytest` 28 passed (7 test actions mới); `ruff` sạch.
- apps/web: `tsc` sạch, eslint sạch, build OK; SSR smoke `GET /session/...` = 200.
- Postgres thật (TestClient): khám miệng (finding nguyên văn) → quan sát (red flag) → chat → vitals hạ sốt (STABILIZED được lưu) → transcript đúng thứ tự.
- Lip-sync: kiểm logic với AnalyserNode giả (đóng → mở → đóng).
- Mục tiêu "60fps", "<1s" trong tasks là **mục tiêu thiết kế, chưa đo**.

## Slice 6 (Voice-to-voice) — hoàn tất về mặt code (PR #16, #17)
- **S6-01 (#16):** `providers/stt.py`, `providers/tts.py` theo đúng khuôn `llm.py` (ABC → Fake → 1 provider thật lazy → selector fallback Fake). Provider thật: Google Cloud Speech-to-Text / Text-to-Speech qua REST (stdlib, **không thêm dependency**), key ở header. Mọi lỗi/timeout → `VoiceProviderError`; log chỉ có provider, kết quả, `elapsed_ms` đo được.
- **S6-02 (#17):** WS auth bằng tin nhắn đầu (guest token, không để trong URL), kiểm Origin, giới hạn 5 MB/lượt. Giữa lượt dùng lại `turns_service.submit_turn` (guardrail + lưu DB), gọi qua `run_in_threadpool`. STT lỗi → báo lỗi, socket vẫn mở, gõ chữ vẫn chạy; TTS lỗi/timeout → vẫn có transcript chữ. Web: `useVoiceSession` (MediaRecorder, phát qua AnalyserNode → lip-sync), nút giữ-để-nói (chuột/chạm/phím Space).

### Kiểm thử Slice 6 (exit 0)
- apps/api: `pytest` 47 passed (11 adapter + 8 WS), `ruff` sạch — không mạng, không key.
- apps/web: `tsc`, eslint sạch; build OK.
- Postgres thật (Docker tạm, TestClient, provider Fake): tạo session → WS auth → audio → transcript SV + mẹ + audio WAV + timing → lượt gõ chữ qua WS → transcript `[(0,student),(1,patient),(2,student),(3,patient)]`; sai token → đóng 1008.
- ⚠ Chưa thử micro thật trên trình duyệt và chưa gọi API Google thật (chưa có key). Mục tiêu "< 2.5 s" chưa đo.

## Slice 7 (Evaluator & Auto-OSCE) — hoàn tất về mặt code (PR #18)
- **LLM đề xuất, code chấm (Hard Rule 4):** Evaluator trả `level` + trích dẫn theo từng tiêu chí; `evidence_verifier` chỉ nhận trích dẫn có thật trong lượt **student** (NFC + gộp khoảng trắng + casefold); met/partial mất hết bằng chứng → `insufficient_evidence`, `flagged`. Tiêu chí LLM bỏ sót → `insufficient_evidence` + flagged; id lạ bị bỏ. `scoring_engine` (thuần): `level/2`, tổng có trọng số 0–100, `critical_missed` khi `r-startle-hx`/`r-dx-grade` unmet/insufficient.
- **Evaluator:** prompt `evaluator-v1`, temperature 0.1, JSON sai → thử lại 1 lần rồi `failed`. Model đọc từ `LLM_MODEL_EVALUATOR` (rơi về `LLM_MODEL_PATIENT`). Không có key → heuristic từ khoá offline (model lưu là `fake-heuristic`, **không phải evaluator đã kiểm định**).
- **Job queue:** bảng `jobs`, claim `FOR UPDATE SKIP LOCKED`; chạy bằng `python -m avp_api.jobs.worker [--once]` hoặc tự chạy qua BackgroundTasks sau `/finish`.
- **API:** `POST /finish` idempotent và nguyên tử (chuyển trạng thái + enqueue trong 1 transaction); `GET /evaluation` 409 nếu chưa kết thúc, 202 khi đang chấm, 200 `done`/`failed` (thông báo an toàn, không stack trace, không hiện điểm dở dang); `POST /evaluation/retry` chỉ khi `failed`. Sau khi kết thúc, gửi lượt hỏi/khám → 409. Luôn kèm thông báo "Học liệu phản hồi để luyện tập…".
- **Web:** nút "Kết thúc buổi khám" gọi `/finish` rồi mới sang `/debrief/{id}`; `gen-client` đã chạy lại.

### Kiểm thử Slice 7 (exit 0)
- apps/api: `pytest` 65 passed (6 verifier, 5 scoring, 7 API/E2E), `ruff` sạch.
- apps/web: `tsc`, eslint sạch; build OK.
- Postgres thật (Docker tạm): tạo session → 3 câu hỏi → khám lòng bàn tay → finish ×2 (1 job) → evaluation `done`, 8 tiêu chí, `critical_missed=true`; sai token → 404. CHECK của DB từ chối `met` không bằng chứng và `insufficient_evidence` có level. `SKIP LOCKED`: job đang bị khoá thì worker khác lấy job kế tiếp. `make db-check-rls` OK.
- ⚠ Chưa chạy Evaluator với Gemini thật; độ lặp lại T-OSCE-04 và kappa (AVP-026) **chưa đo**.

## Slice 8 (RAG y tế & Debriefing) — hoàn tất về mặt code (PR #19)
- **Corpus** `data/guidelines/hfmd_moh_chunks.json`: 11 đoạn (8 từ QĐ 1003/QĐ-BYT, 3 từ BV Bệnh Nhiệt đới 2023 Bài 20). Đây là **bản tóm tắt do tác giả viết, trạng thái draft**, không phải trích nguyên văn; chưa có số trang (không đoán). Đoạn BV BNĐ chỉ diễn lại nội dung đã có trong `case-01-hfmd.json`. `rights_checked=true` theo chỉ đạo trong brief.
- **Rights gate (T-RAG-03):** ingest từ chối tài liệu `rights_checked != true`; truy vấn cũng chỉ lấy tài liệu đã kiểm quyền.
- **Embedding:** `FakeEmbeddingProvider` (hash n-gram âm tiết, 768 chiều, offline) và `GeminiEmbeddingProvider` (đọc `EMBEDDING_MODEL`, chỉ dùng khi có key). Mỗi chunk lưu tên model; truy vấn chỉ so vector cùng model, đổi model thì phải ingest lại.
- **Migration 0002:** `source_key` (unique), `review_status`, `content_hash`, `embedding_model`, index HNSW `vector_cosine_ops`. Không thêm bảng; RLS giữ nguyên.
- **Debriefing Agent:** truy vấn RAG cho từng tiêu chí chưa đạt hoặc trọng yếu, đưa chunk cho LLM dưới mã S1, S2…; **citation verifier** chỉ giữ mã đã truy xuất thật, lấy metadata trích dẫn từ DB; không còn trích dẫn → `verified=false`. Chế độ offline ghép phản hồi 5 tầng từ rubric + kết quả chấm (không sinh nội dung lâm sàng mới).
- **Worker:** evaluate xong → tự enqueue job debrief; chạy nối tiếp trong BackgroundTasks.
- **API:** `GET /sessions/{id}/debrief`: sai chủ → 404, chưa kết thúc → 409, đang xử lý → 202, xong → 200 (hoặc `failed` với thông báo an toàn). Luôn trả `sources_reviewed=false` khi nguồn còn là bản nháp.

### Kiểm thử Slice 8 (exit 0)
- apps/api: `pytest` 80 passed (10 RAG: T-RAG-01/02/03; 5 debrief API/E2E), `ruff` sạch.
- apps/web: `gen-client`, eslint, `tsc`, build OK.
- Postgres thật (Docker pgvector tạm, provider Fake): `alembic upgrade` 0001→0002 → `load-cases` → `ingest_guidelines.py` (inserted; chạy lại = unchanged) → index HNSW tồn tại → "giật mình độ 2a" trả đúng đoạn "Phân độ lâm sàng - Độ 2a" → rights gate từ chối → finish → jobs `evaluate done`, `debrief done` → `GET /debrief` 200 với trích dẫn trỏ đúng chunk có thật; sai token 404. Downgrade 0001 → upgrade lại OK; `db-check-rls` OK.
- ⚠ Chưa chạy debrief/embedding với Gemini thật; ngưỡng liên quan Gemini (0.5) là giá trị tạm, chưa đo.

## Slice 9 (Debriefing Screen & PDF + QR) — hoàn tất về mặt code (PR #20)
- **PDF (`services/pdf_service.py`):** tiêu đề "BÁO CÁO PHẢN HỒI THỰC HÀNH LÂM SÀNG"; thông tin phiên, điểm, khung cảnh báo red flag, bảng 8 tiêu chí, phản hồi 5 tầng, nhận xét kèm nguồn, danh mục tài liệu tham chiếu, mã QR và câu miễn trừ ở chân mọi trang. Từ ngữ kiểu "chứng chỉ/certificate" trong nội dung sinh tự động bị thay thế; nếu xuất hiện trong chữ cố định thì báo lỗi, không in ra. Font: tìm TTF Unicode của hệ thống (Arial/Segoe trên Windows, DejaVu/Liberation/Noto trên Linux, hoặc `PDF_FONT_PATH`); không có thì bỏ dấu sang ASCII để không bao giờ lỗi. QR chỉ chứa `{WEB_BASE_URL}/debrief/{id}`, không chứa token.
- **API:** `GET /sessions/{id}/debrief/pdf`: sai chủ → 404, chưa kết thúc hoặc chấm/phản hồi lỗi → 409, đang xử lý → 202, xong → PDF.
- **Web `/debrief/[id]`:** poll 1,5 s khi 202 (tối đa ~3 phút); hiện kết quả chấm ngay, phần phản hồi tải sau; lỗi chấm → nút "Thử chấm lại". Banner luyện tập + nhãn nguồn nháp, banner red flag, thẻ điểm, bảng kiểm (huy hiệu trạng thái, trọng yếu, bằng chứng bị bác bỏ), bấm bằng chứng → ngăn transcript tô sáng đúng lượt, phản hồi 5 tầng, nhận xét kèm nút trích dẫn mở đoạn nguồn. Xuất PDF bằng `fetch` + Blob để gửi kèm `X-Guest-Token`.

### Kiểm thử Slice 9 (exit 0)
- apps/api: `pytest` 91 passed (11 test PDF), `ruff` sạch.
- apps/web: `gen-client`, `typecheck`, `lint`, `build` OK.
- Chạy thật (Docker Postgres + API + `next start`, provider Fake, Chrome qua Playwright): hỏi 3 câu + khám miệng → finish → trang debrief hiện đủ các phần; bấm bằng chứng mở transcript đúng lượt; bấm trích dẫn hiện đoạn nguồn có nhãn "Bản tóm tắt nháp"; nút PDF tải được file `%PDF-` ~70 KB; đổi sang token sai → hiện thông báo không tìm thấy.
- ⚠ Người quét mã QR chỉ xem được trang nếu có quyền với phiên (cùng trình duyệt với phiên khách, hoặc đăng nhập). Chưa có trang xác thực công khai: nếu cần thì phải thiết kế riêng, vì transcript là dữ liệu cá nhân.

## Tổng kết
**9/9 vertical slice của Giai đoạn 1 đã merge.** Giai đoạn 2: Slice 10–11 đã merge; Slice 12–13 code xong, chờ merge PR #26, #27, #28; Slice 14 (triển khai & đo lường) chưa làm. Chưa phải bản phát hành: ca bệnh và corpus RAG vẫn là bản nháp chờ bác sĩ duyệt; chưa chạy với Gemini/Google thật; các chỉ số (latency, kappa, T-OSCE-04) chưa đo.

## Thứ tự merge (bạn thực hiện)
1. **PR #21** (AVP-025 test). 2. PR docs AVP-042 (kế hoạch Giai đoạn 2). Hai PR độc lập, merge thứ tự nào cũng được.

## Việc cần bạn làm tiếp
- **AVP-034 (Supabase):** tạo project, bật `vector`, đặt `DATABASE_URL` (session pooler) vào `apps/api/.env`. Khi có, chạy `make db-migrate` lên Supabase dev; migration & RLS đã sẵn sàng.
- Bật **branch protection squash-only** trên GitHub (các PR đang merge dạng merge-commit).
- Quyết các điểm trong `docs/OPEN_QUESTIONS.md`, đặc biệt Câu 5 (hosting), 7 (lưu phiên khách), 8 (giới hạn chi phí), 10 (phương thức đăng nhập) — chặn Slice 10, 13, 14.

## Rủi ro / nợ kỹ thuật
- Migration tham chiếu `auth.users` + role `anon`/`authenticated` (Supabase); verify local cần dựng 2 role + schema `auth` (đã làm khi test). Trên Supabase thật sẽ có sẵn.
- Clinical content (ca HFMD) vẫn **chưa được bác sĩ duyệt** — không trình như "đã thẩm định".
- Corpus RAG là bản tóm tắt nháp: bác sĩ cần đối chiếu nguyên văn QĐ 1003, sửa ngưỡng nếu sai, thêm số trang. Brief ghi độ 2a là "sốt > 39°C kéo dài > 2 ngày" và độ 2b "mạch > 150"; corpus ghi "sốt trên 2 ngày, HOẶC trên 39°C", 2b nhóm 1 mạch > 130, nhóm 2 > 150 → cần bác sĩ chốt.
- `git_task.py` trên Windows cần `PYTHONUTF8=1` (bug decode UTF-8).
