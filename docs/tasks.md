# Danh mục Nhiệm vụ Kỹ thuật theo Vertical Slices (TASKS.md)

> **Phương pháp quản lý:** Chia nhỏ công việc theo **14 Vertical Slices** khép kín (Giai đoạn 1: Slice 1–9 MVP cốt lõi; Giai đoạn 2: Slice 10–14 hoàn thiện web) (từ Data/Backend tới UI/UX Frontend).
> **Nguyên tắc triển khai:** Mỗi slice thực hiện trên branch `<type>/avp-xxx-slug` (xem `docs/git-workflow.md`), vượt qua build/typecheck/lint và được **Reviewer** độc lập kiểm duyệt trước khi merge vào `main`.

---

## Bảng Ánh Xạ Mã Workbook (`AVP-xxx`) $\leftrightarrow$ Vertical Slices (`TASK-Sx-xx`)

Trạng thái lấy theo `PROGRESS_TASK.md` (chỉ ghi ✅ khi đã merge và có bằng chứng chạy thật). **Giai đoạn 1** (Slice 1–9) là MVP cốt lõi; **Giai đoạn 2** (Slice 10–14) hoàn thiện web để người dùng thật sử dụng được.

| Mã Workbook | Thuộc Vertical Slice | Tên Task & Nội dung | Độ ưu tiên | Trạng thái |
| :--- | :--- | :--- | :---: | :---: |
| **AVP-006, AVP-031** | **Slice 1** (`TASK-S1-01`) | Khung Monorepo, `.env.example`, Next.js 16 + FastAPI scaffold | **P0** | ✅ Merged (PR #2) |
| **AVP-007, AVP-034** | **Slice 1** (`TASK-S1-02`) | Alembic migration 11 bảng, Postgres RLS, test RLS | **P0** | ✅ Merged (PR #7) |
| **AVP-003, AVP-035** | **Slice 1** (`TASK-S1-03`) | Ca mẫu Nhi khoa Tay chân miệng (`case-01-hfmd.json`), validate script | **P0** | ✅ Merged (PR #4, #7) — draft, chờ bác sĩ |
| **AVP-008** | **Slice 2** (`TASK-S2-01`) | Session API (`POST /sessions`), quản lý guest token | **P0** | ✅ Merged (PR #8) |
| **AVP-010 (Part 1)** | **Slice 2** (`TASK-S2-02`) | Giao diện Setup Screen (`/setup`), consent checkbox | **P0** | ✅ Merged (PR #8) |
| **AVP-009, AVP-011** | **Slice 3** (`TASK-S3-01`) | Patient Agent service, 3-tier guardrails, prompt cache | **P0** | ✅ Merged (PR #9, #11) |
| **AVP-010, AVP-012** | **Slice 3** (`TASK-S3-02`) | Transcript Box, text turn loop (`POST /sessions/{id}/turns`) | **P0** | ✅ Merged (PR #9, #10) |
| **AVP-102** | **Slice 4** (`TASK-S4-01`) | Vitals State Machine engine backend (5 trạng thái HFMD) | **P0** | ✅ Merged (PR #12) |
| **AVP-102** | **Slice 4** (`TASK-S4-02`) | Monitor sinh hiệu frontend (`VitalsMonitor.tsx`) | **P0** | ✅ Merged (PR #12) |
| **AVP-104** | **Slice 5** (`TASK-S5-01`) | Three.js canvas, avatar 3D người mẹ bế bé | **P0** | ✅ Merged (PR #13) |
| **AVP-101, AVP-104** | **Slice 5** (`TASK-S5-02`) | Raycasting 4 vùng khám | **P0** | ✅ Merged (PR #14) |
| **AVP-104** | **Slice 5** (`TASK-S5-03`) | Lip-sync cơ bản theo biên độ audio | **P1** | ✅ Merged (PR #15) |
| **AVP-020, AVP-021** | **Slice 6** (`TASK-S6-01`) | STT / TTS provider adapters + Fake offline | **P1** | ✅ Merged (PR #16) — provider thật chưa bật |
| **AVP-022, AVP-103** | **Slice 6** (`TASK-S6-02`) | WebSocket voice loop (`/ws/sessions/{id}`) | **P1** | ✅ Merged (PR #17) |
| **AVP-004, AVP-014** | **Slice 7** (`TASK-S7-01`) | Evaluator Agent + job queue | **P0** | ✅ Merged (PR #18) |
| **AVP-013** | **Slice 7** (`TASK-S7-02`) | Evidence Verifier, deterministic scoring | **P0** | ✅ Merged (PR #18) |
| **AVP-017, AVP-018** | **Slice 8** (`TASK-S8-01`) | Ingest QĐ 1003/QĐ-BYT, pgvector embedding | **P1** | ✅ Merged (PR #19) — corpus draft |
| **AVP-019** | **Slice 8** (`TASK-S8-02`) | Debriefing Agent 5 tầng & RAG citations | **P1** | ✅ Merged (PR #19) |
| **AVP-015, AVP-023** | **Slice 9** (`TASK-S9-01`) | Debriefing Screen (`/debrief/[id]`), Red Flags | **P0** | ✅ Merged (PR #20) |
| **AVP-105** | **Slice 9** (`TASK-S9-02`) | PDF báo cáo phản hồi A4 + mã QR | **P0** | ✅ Merged (PR #20) |
| **AVP-024, AVP-106** | **Slice 10** (`TASK-S10-01`) | FastAPI xác thực JWT Supabase (JWKS) cho HTTP + WebSocket | **P0** | ❌ Chưa làm |
| **AVP-107** | **Slice 10** (`TASK-S10-02`) | Màn hình Đăng nhập / Đăng ký (`/login`), menu tài khoản | **P0** | ❌ Chưa làm |
| **AVP-108** | **Slice 10** (`TASK-S10-03`) | Hồ sơ (`GET/PATCH /me`) + nhận phiên khách vào tài khoản | **P1** | ❌ Chưa làm |
| **AVP-109** | **Slice 11** (`TASK-S11-01`) | API danh sách phiên của tôi (`GET /sessions`) | **P0** | ❌ Chưa làm |
| **AVP-110** | **Slice 11** (`TASK-S11-02`) | Màn hình Lịch sử luyện tập (`/history`) | **P0** | ❌ Chưa làm |
| **AVP-111** | **Slice 11** (`TASK-S11-03`) | Tiến bộ theo tiêu chí qua các lần luyện | **P2** | ❌ Chưa làm |
| **AVP-112** | **Slice 12** (`TASK-S12-01`) | App shell: trang chủ, header/nav, 404, error, loading | **P0** | ❌ Chưa làm |
| **AVP-022, AVP-036** | **Slice 12** (`TASK-S12-02`) | Trạng thái chậm/lỗi, từ chối micro, xác nhận kết thúc, tiếp tục phiên | **P0** | ❌ Chưa làm |
| **AVP-113** | **Slice 12** (`TASK-S12-03`) | Khác biệt chế độ Luyện tập / Thi thử + hướng dẫn lần đầu | **P1** | ❌ Chưa làm |
| **AVP-114** | **Slice 12** (`TASK-S12-04`) | Responsive (mobile/tablet) + accessibility cơ bản | **P1** | ❌ Chưa làm |
| **AVP-115** | **Slice 13** (`TASK-S13-01`) | Trang Quyền riêng tư, xoá phiên / xoá dữ liệu của tôi | **P0** | ❌ Chưa làm |
| **AVP-116** | **Slice 13** (`TASK-S13-02`) | Trang xác thực báo cáo công khai qua QR (`/verify/[code]`) | **P2** | ⏸ Chờ quyết định (OPEN_QUESTIONS Q6) |
| **AVP-037** | **Slice 14** (`TASK-S14-01`) | Deploy staging (API + worker + web), Dockerfile, CORS | **P0** | ⏸ Chờ chọn hosting (OPEN_QUESTIONS Q5) |
| **AVP-025** | **Slice 14** (`TASK-S14-02`) | Test luồng đầy đủ: API in-process (pt1) + Playwright & 3 lần trên staging (pt2) | **P0** | 🟡 pt1 PR #21 chờ merge |
| **AVP-026, AVP-117** | **Slice 14** (`TASK-S14-03`) | Script đo latency, độ lặp lại, độ đồng thuận evaluator | **P1** | ❌ Chưa làm |
| **AVP-118** | **Slice 14** (`TASK-S14-04`) | Giới hạn tần suất & trần chi phí LLM/STT/TTS, log không PII | **P0** | ❌ Chưa làm |
| **AVP-038, AVP-119** | **Slice 14** (`TASK-S14-05`) | Thử nghiệm người dùng + form góp ý trong app | **P2** | ❌ Chưa làm |

---

## Bảng tổng hợp Tiến độ Vertical Slices

| Slice | Tên phân đoạn (Vertical Slice) | Mức ưu tiên | Trạng thái |
| :--- | :--- | :--- | :--- |
| **Slice 1** | Khung dự án, Routing 3 màn hình & Data Model nền tảng | **P0** | ✅ Hoàn tất |
| **Slice 2** | Setup Screen: Chọn ca, vai trò & Khởi tạo phiên | **P0** | ✅ Hoàn tất |
| **Slice 3** | Clinical Workspace — Hội thoại văn bản với Patient Agent | **P0** | ✅ Hoàn tất |
| **Slice 4** | Clinical Workspace — Máy trạng thái Sinh hiệu | **P0** | ✅ Hoàn tất (số liệu draft) |
| **Slice 5** | Clinical Workspace — Avatar 3D & Khám Raycasting | **P0** | ✅ Hoàn tất |
| **Slice 6** | Đàm thoại Giọng nói (STT / TTS) | **P1** | ✅ Hoàn tất về code (provider thật chưa bật) |
| **Slice 7** | Evaluator Agent & Auto-OSCE | **P0** | ✅ Hoàn tất |
| **Slice 8** | RAG Y tế & Trích dẫn Bộ Y tế | **P1** | ✅ Hoàn tất (corpus draft) |
| **Slice 9** | Debriefing Screen & Xuất PDF + QR | **P0** | ✅ Hoàn tất |
| **Slice 10** | Tài khoản & Đăng nhập (Supabase Auth) | **P0** | ❌ Chưa làm |
| **Slice 11** | Lịch sử luyện tập & Tiến bộ | **P0** | ❌ Chưa làm |
| **Slice 12** | Hoàn thiện trải nghiệm (App shell, trạng thái lỗi, chế độ, responsive) | **P0** | ❌ Chưa làm |
| **Slice 13** | Quyền riêng tư & Dữ liệu cá nhân | **P0** | ❌ Chưa làm |
| **Slice 14** | Triển khai, Vận hành & Đo lường | **P0** | 🟡 Một phần (PR #21) |

**Thứ tự đề xuất cho Giai đoạn 2:** S12-01 → S10-01 → S10-02 → S11-01 → S11-02 → S13-01 → S12-02 → S14-04 → S14-01 → S14-02 → các task P1/P2. Lý do: app shell và đăng nhập là nền cho lịch sử; xoá dữ liệu phải có trước khi cho người thật dùng (`database.md` §6); giới hạn chi phí phải có trước khi deploy công khai.

---

## Chi tiết từng Nhiệm vụ theo Slice

### Slice 1: Khung Dự Án & Nền Tảng Kỹ Thuật (Foundation & Core Routing)

#### `TASK-S1-01` [P0]: Khung cấu trúc Monorepo & Môi trường mẫu
* **Mô tả:** Đồng bộ cấu trúc `apps/api` (FastAPI) và `apps/web` (Next.js App Router). Khởi tạo file cấu hình biến môi trường mẫu `.env.example` với đầy đủ placeholder cho LLM, STT, TTS, Supabase URL/Key.
* **Phụ thuộc:** Không.
* **File liên quan:** `.env.example`, `apps/api/avp_api/config.py`, `apps/web/package.json`, `Makefile`.
* **Tiêu chí hoàn thành (Given/When/Then):**
  * **Given:** Developer clone dự án mới và copy `.env.example` thành `.env`.
  * **When:** Chạy lệnh `make lint` và `make build` (hoặc test tương ứng).
  * **Then:** Hệ thống không báo lỗi cú pháp hoặc thiếu biến môi trường bắt buộc.

#### `TASK-S1-02` [P0]: Database Migration & RLS Baseline
* **Mô tả:** Thiết lập migration Alembic cho toàn bộ 11 bảng cơ sở dữ liệu từ `docs/specs/schema.sql`, bật RLS và thu hồi quyền `anon`/`authenticated` Data API.
* **Phụ thuộc:** `TASK-S1-01`.
* **File liên quan:** `apps/api/alembic/*`, `apps/api/avp_api/db/models.py`.
* **Tiêu chí hoàn thành:** Chạy `alembic upgrade head` trên local Postgres hoặc Supabase dev thành công 100%.

#### `TASK-S1-03` [P0]: Biên soạn Dữ liệu Ca lâm sàng Mẫu (HFMD Pediatric Case)
* **Mô tả:** Hoàn thiện file dữ liệu `data/cases/hfmd_pediatric_01.json` mô tả ca bệnh Tay chân miệng Nhi khoa độ 2a theo chuẩn `schemas/case.schema.json`. Gắn nhãn `[CẦN BÁC SĨ DUYỆT]`.
* **Phụ thuộc:** `TASK-S1-01`.
* **File liên quan:** `data/cases/hfmd_pediatric_01.json`, `schemas/case.schema.json`, `scripts/validate_cases.py`.
* **Tiêu chí hoàn thành:** Script `python scripts/validate_cases.py` xác thực schema thành công, không thiếu trường bắt buộc.

---

### Slice 2: Màn hình Setup (Setup Screen)

#### `TASK-S2-01` [P0]: API Khởi tạo Phiên Khám (`POST /api/v1/sessions`)
* **Mô tả:** Xây dựng router FastAPI tiếp nhận yêu cầu tạo phiên: mã ca bệnh, vai trò, chế độ luyện tập, cờ chấp thuận điều khoản bảo mật dữ liệu (`consent`). Trả về `sessionId` và `X-Guest-Token` nếu là khách.
* **Phụ thuộc:** `TASK-S1-02`.
* **File liên quan:** `apps/api/avp_api/routers/sessions.py`, `apps/api/avp_api/services/session_service.py`.
* **Tiêu chí hoàn thành:** Endpoint trả về HTTP 201 kèm payload phiên hợp lệ; từ chối khi chưa có `consent`.

#### `TASK-S2-02` [P0]: Giao diện Setup Screen (`/setup`)
* **Mô tả:** Xây dựng màn hình Next.js cho phép sinh viên chọn ca bệnh Tay chân miệng, vai trò, chế độ thi/luyện tập, hộp thoại cam kết bảo mật và nút chuyển hướng sang Clinical Workspace.
* **Phụ thuộc:** `TASK-S2-01`.
* **File liên quan:** `apps/web/src/app/setup/page.tsx`, `apps/web/src/components/setup/*`.
* **Tiêu chí hoàn thành:** Sinh viên bấm nút "Bắt đầu khám", hệ thống gọi API và điều hướng người dùng sang `/session/[id]` trong dưới 1 giây.

---

### Slice 3: Clinical Workspace — Hội thoại với Patient Agent

#### `TASK-S3-01` [P0]: Patient Agent Service & 3-Tier Guardrails
* **Mô tả:** Triển khai core prompt builder đóng vai người mẹ của bé, tích hợp hàng rào bảo vệ 3 tầng (Tier 1 Clinical Facts, Tier 2 Social Persona, Tier 3 Unknown Policy). Thêm hàm kiểm tra Hot-path (kiểm tra con số và thuật ngữ cấm).
* **Phụ thuộc:** `TASK-S1-03`, `TASK-S2-01`.
* **File liên quan:** `apps/api/avp_api/services/patient_agent.py`, `apps/api/avp_api/providers/llm.py`.
* **Tiêu chí hoàn thành:** Chạy bộ test prompt; mẹ bé trả lời đúng thông tin sốt/giật mình và trả lời từ chối khéo léo khi gặp câu hỏi ngoài hồ sơ bệnh án.

#### `TASK-S3-02` [P0]: Transcript Box & Đàm thoại Văn bản (Text Turn Loop)
* **Mô tả:** Cổng API `POST /api/v1/sessions/{id}/turns` và giao diện khung chat hiển thị tin nhắn bác sĩ - người mẹ, thanh cuộn tự động và lưu trữ lịch sử lượt thoại.
* **Phụ thuộc:** `TASK-S3-01`.
* **File liên quan:** `apps/web/src/app/session/[id]/page.tsx`, `apps/web/src/components/chat/TranscriptBox.tsx`.
* **Tiêu chí hoàn thành:** Thực hiện 5 lượt chat liên tiếp mượt mà, tải lại trang vẫn giữ nguyên thứ tự tin nhắn.

---

### Slice 4: Clinical Workspace — Máy Trạng Thái Sinh Hiệu (Vitals State Machine)

#### `TASK-S4-01` [P0]: Vitals State Machine Engine Backend
* **Mô tả:** Hiện thực hóa logic chuyển trạng thái sinh hiệu (Grade 1 $\rightarrow$ Grade 2a baseline $\rightarrow$ High fever $\rightarrow$ Grade 2b progression $\rightarrow$ Stabilized) dựa trên thời gian và can thiệp y lệnh.
* **Phụ thuộc:** `TASK-S2-01`.
* **File liên quan:** `apps/api/avp_api/services/vitals_service.py`, `apps/api/avp_api/routers/vitals.py`.
* **Tiêu chí hoàn thành:** Endpoint `GET /api/v1/sessions/{id}/vitals` phản hồi đúng ma trận sinh hiệu của trạng thái hiện thời.

#### `TASK-S4-02` [P0]: Monitor Sinh hiệu Thời Gian Thực Frontend
* **Mô tả:** Component hiển thị đồng hồ và monitor sinh hiệu (Mạch, Nhịp thở, Nhiệt độ màu cảnh báo, SpO2) ở góc phải Clinical Workspace, tự động cập nhật khi trạng thái thay đổi.
* **Phụ thuộc:** `TASK-S4-01`.
* **File liên quan:** `apps/web/src/components/workspace/VitalsMonitor.tsx`.
* **Tiêu chí hoàn thành:** Khi sốt trên 39°C, chỉ số nhiệt độ nhấp nháy đỏ kèm âm cảnh báo nhịp tim nhanh.

---

### Slice 5: Clinical Workspace — Avatar 3D & Khám Raycasting

#### `TASK-S5-01` [P0]: Tích hợp Three.js Canvas & Render Mô hình 3D
* **Mô tả:** Component client-only `dynamic(..., { ssr: false })` nạp mô hình 3D người mẹ bế bé (định dạng GLB/GLTF hoặc procedural rig fallback), hỗ trợ xoay camera (OrbitControls) mượt mà.
* **Phụ thuộc:** `TASK-S1-01`.
* **File liên quan:** `apps/web/src/components/avatar/AvatarCanvas.tsx`.
* **Tiêu chí hoàn thành:** Mô hình hiển thị ổn định 60fps trên trình duyệt thông dụng, không crash khi resize.

#### `TASK-S5-02` [P0]: Raycasting Vùng Khám & API Kết Quả Thực Thể
* **Mô tả:** Gắn Mesh Collider vào các vùng giải phẫu của trẻ (Lòng bàn tay, Bàn chân, Vòm họng, Mông/Gối). Bắt sự kiện click chuột, gửi `POST /sessions/{id}/actions` và hiển thị ảnh/mô tả nốt ban bóng nước.
* **Phụ thuộc:** `TASK-S5-01`, `TASK-S1-03`.
* **File liên quan:** `apps/web/src/components/avatar/RaycastExam.tsx`, `apps/api/avp_api/routers/actions.py`.
* **Tiêu chí hoàn thành:** Click trúng bàn tay trẻ $\rightarrow$ modal phóng to ảnh nốt ban bóng nước hiện ra và ghi nhận 1 lượt khám thực thể vào transcript.

#### `TASK-S5-03` [P1]: Cử động môi (Lip-sync) cơ bản khi nói
* **Mô tả:** Đồng bộ biên độ âm thanh giọng nói (Audio Analyser) với morph target hàm dưới của avatar mẹ để tạo chuyển động mấp máy môi khi phát âm thanh.
* **Phụ thuộc:** `TASK-S5-01`.
* **File liên quan:** `apps/web/src/components/avatar/LipSyncController.ts`.
* **Tiêu chí hoàn thành:** Khi audio nói phát ra, miệng avatar mở và khép nhịp nhàng theo biên độ giọng nói.

---

### Slice 6: Đàm Thoại Giọng Nói (Voice-to-Voice Pipeline)

#### `TASK-S6-01` [P1]: STT & TTS Provider Adapters
* **Mô tả:** Viết adapter kết nối dịch vụ Speech-to-Text (STT: Whisper / Google Cloud Speech / FPT.AI) và Text-to-Speech (TTS: ElevenLabs / Kokoro / Viettel AI) kèm bản `FakeVoiceAdapter` phục vụ test offline.
* **Phụ thuộc:** `TASK-S1-01`.
* **File liên quan:** `apps/api/avp_api/providers/stt.py`, `apps/api/avp_api/providers/tts.py`.
* **Tiêu chí hoàn thành:** Chuyển đổi audio sang text và ngược lại thông qua mock adapter với độ trễ ghi nhận minh bạch.

#### `TASK-S6-02` [P1]: WebSocket Duplex Stream Voice Loop
* **Mô tả:** Triển khai endpoint `/ws/sessions/{id}` cho phép truyền trực tiếp voice chunks từ microphone người học và trả về audio stream giọng nói người mẹ.
* **Phụ thuộc:** `TASK-S6-01`, `TASK-S3-01`.
* **File liên quan:** `apps/api/avp_api/routers/websocket.py`, `apps/web/src/hooks/useVoiceSession.ts`.
* **Tiêu chí hoàn thành:** Sinh viên nói qua micro, nhận được phản hồi âm thanh phát qua loa trong vòng dưới 2.5 giây.

---

### Slice 7: Evaluator Agent & Bộ Chấm Điểm Auto-OSCE

#### `TASK-S7-01` [P0]: Evaluator Agent & Structured Output Extraction
* **Mô tả:** Triển khai Evaluator Agent phân tích transcript theo Rubric 7 domains bệnh Tay chân miệng (Khai thác sốt, giật mình, khám ban, phân độ, kê đơn hạ sốt, an thần).
* **Phụ thuộc:** `TASK-S1-03`, `TASK-S3-02`.
* **File liên quan:** `apps/api/avp_api/services/evaluator_agent.py`.
* **Tiêu chí hoàn thành:** Trả về danh sách tiêu chí dạng structured JSON có đầy đủ `level` và `evidence: [{turn_idx, quote}]`.

#### `TASK-S7-02` [P0]: Deterministic Code Evidence Verifier & Scoring Engine
* **Mô tả:** Thuật toán độc lập xác minh từng đoạn trích dẫn của LLM trong transcript gốc (chuẩn hóa Unicode, khoảng trắng). Tính toán điểm số học tổng thể và gắn cờ `critical_missed` nếu bỏ sót dấu hiệu báo động.
* **Phụ thuộc:** `TASK-S7-01`.
* **File liên quan:** `apps/api/avp_api/services/evidence_verifier.py`, `apps/api/avp_api/services/scoring_engine.py`.
* **Tiêu chí hoàn thành:** Đoạn trích sai lệch hoặc giả mạo lập tức bị hạ về 0 điểm; điểm số tính lại 5 lần cho cùng 1 kết quả nhất quán 100%.

---

### Slice 8: Phân Hệ RAG Y Tế & Trích Dẫn Văn Bản Bộ Y Tế

#### `TASK-S8-01` [P1]: Ingestion Pipeline Hướng Dẫn Bộ Y Tế & pgvector
* **Mô tả:** Ingest tài liệu Quyết định 1003/QĐ-BYT vào bảng `source_documents` và chia đoạn thành `source_chunks`, tính toán vector embedding và lưu vào cột pgvector.
* **Phụ thuộc:** `TASK-S1-02`.
* **File liên quan:** `apps/api/avp_api/services/rag_service.py`, `scripts/ingest_guideline.py`.
* **Tiêu chí hoàn thành:** Truy vấn tìm kiếm ngữ nghĩa theo cụm từ "giật mình độ 2a 2b" trả về chính xác đoạn quy định phân độ trong QĐ 1003.

#### `TASK-S8-02` [P1]: Debriefing Agent với Khung Phản Hồi 5 Tầng & Trích Dẫn
* **Mô tả:** Debriefing Agent tổng hợp bài học theo 5 phần: *Expected Approach, Rationale, Learning Points, Acceptable Alternatives, Important Errors*, gắn kèm liên kết trích dẫn `citations`.
* **Phụ thuộc:** `TASK-S7-02`, `TASK-S8-01`.
* **File liên quan:** `apps/api/avp_api/services/debrief_agent.py`.
* **Tiêu chí hoàn thành:** Endpoint `GET /api/v1/sessions/{id}/debrief` trả về khuyến nghị điều trị có trích dẫn rõ ràng số trang và tên quyết định Bộ Y tế.

---

### Slice 9: Debriefing Screen & Xuất Báo Cáo PDF + QR

#### `TASK-S9-01` [P0]: Giao diện Báo cáo Debriefing (`/debrief/[id]`)
* **Mô tả:** Xây dựng màn hình tổng kết: hiển thị điểm tổng Auto-OSCE, danh sách tiêu chí đạt/chưa đạt kèm dẫn chứng câu thoại, banner cảnh báo Red Flags nổi bật và khối lý giải y khoa.
* **Phụ thuộc:** `TASK-S7-02`, `TASK-S8-02`.
* **File liên quan:** `apps/web/src/app/debrief/[id]/page.tsx`, `apps/web/src/components/debrief/*`.
* **Tiêu chí hoàn thành:** Sinh viên bấm vào từng tiêu chí có thể xem ngay câu nói của mình được trích dẫn; banner đỏ cảnh báo xuất hiện nếu bỏ sót giật mình.

#### `TASK-S9-02` [P0]: Generator Xuất Báo Cáo PDF & Mã QR Tra Cứu
* **Mô tả:** Triển khai endpoint `GET /api/v1/sessions/{id}/debrief/pdf` sinh file PDF khổ A4 trình bày trang trọng bảng điểm, nhận xét, disclaimer học tập và mã QR liên kết tới trang phiên (`{WEB_BASE_URL}/debrief/{id}`, không chứa token; ADR-0010).
* **Phụ thuộc:** `TASK-S9-01`.
* **File liên quan:** `apps/api/avp_api/services/pdf_service.py`, `apps/web/src/components/debrief/ExportPdfButton.tsx`.
* **Tiêu chí hoàn thành:** Bấm nút xuất tải về file PDF mở được bình thường, dùng camera điện thoại quét mã QR mở đúng trang phiên thực hành (người xem phải có quyền với phiên; trang xác thực công khai là `TASK-S13-02`).


---

# Giai đoạn 2 — Hoàn thiện Web (Slice 10–14)

> **Ranh giới phạm vi:** Giai đoạn 2 **không** mở rộng MVP (vẫn 1 ca HFMD, 3 màn hình lõi; không thanh toán, không LMS, không nhiều ca). Các task chỉ thêm những phần mà một web dùng thật cần có: tài khoản, lịch sử, xử lý lỗi, quyền riêng tư, triển khai và đo lường. Những gì vượt ranh giới này nằm ở mục *Ngoài phạm vi* cuối file và cần Product Owner duyệt.
>
> **Ký hiệu giao việc:** 🤖 = có thể giao cho agy (đạt 3 điều kiện trong `CLAUDE.md`); 🧠 = Claude/người làm (đụng auth, bảo mật, schema, migration, prompt, nội dung lâm sàng hoặc hợp đồng API).
>
> **Quy tắc chung cho mọi task Giai đoạn 2:** chuỗi tiếng Việt trong `apps/web/messages/vi.json`; sau khi đổi endpoint chạy `make gen-client`; bảng mới phải qua `make db-check-rls`; test dùng dữ liệu tổng hợp; không ghi "chứng chỉ/certificate" (ADR-0010).

---

### Slice 10: Tài khoản & Đăng nhập (Supabase Auth — ADR-0008)

Hiện tại mọi phiên là phiên khách (guest token trong `sessionStorage`), nên mất khi đóng tab và không có lịch sử. `apps/api/avp_api/auth.py` đã có điểm cắm `TokenVerifier` nhưng mặc định từ chối mọi Bearer token (`UnconfiguredVerifier`).

#### `TASK-S10-01` [P0] 🧠: FastAPI xác thực JWT Supabase (HTTP + WebSocket)
* **Mô tả:** Thay `UnconfiguredVerifier` bằng `SupabaseJwtVerifier`: tải JWKS từ `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` (cache có TTL), kiểm `iss`, `aud=authenticated`, `exp`, thuật toán bất đối xứng; trả `sub` làm `user_id`. Phiên mới của người đã đăng nhập lưu `user_id` (không có `guest_token_hash`, đúng CHECK hiện có). WebSocket nhận `{"type":"auth","access_token":...}` ở tin nhắn đầu (không đưa vào URL). Lần đầu thấy `sub` thì tạo dòng `profiles` (role `student`).
* **Phụ thuộc:** Slice 2, AVP-034 (Supabase Auth bật Email).
* **File liên quan:** `apps/api/avp_api/auth.py`, `apps/api/avp_api/config.py`, `apps/api/avp_api/routers/websocket.py`, `apps/api/avp_api/services/session_service.py`, `apps/api/tests/test_auth.py`.
* **Tiêu chí hoàn thành:**
  * **Given:** user A và user B đều có JWT hợp lệ (test ký bằng khoá RSA tự sinh, JWKS giả).
  * **When:** B gọi bất kỳ route nào thuộc phiên của A (HTTP và WS).
  * **Then:** 404; token hết hạn / sai chữ ký / sai issuer → 401 `AUTH_INVALID`; không log token; phiên khách vẫn chạy như cũ (T-SEC-01, T-AUTH-01).

#### `TASK-S10-02` [P0] 🧠: Màn hình Đăng nhập / Đăng ký & menu tài khoản
* **Mô tả:** Trang `/login` (email + mật khẩu và magic link; đăng ký, quên mật khẩu) dùng `supabase-js` **chỉ để đăng nhập** với `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `AuthProvider` giữ session, tự refresh; `authHeaders()` trong `lib/sessionAuth.ts` gửi `Authorization: Bearer` khi đã đăng nhập, ngược lại gửi `X-Guest-Token`. Header có nút Đăng nhập / menu tài khoản (Hồ sơ, Lịch sử, Đăng xuất). Vẫn cho phép "Luyện tập không cần tài khoản".
* **Phụ thuộc:** `TASK-S10-01`, `TASK-S12-01`.
* **File liên quan:** `apps/web/src/app/login/page.tsx`, `apps/web/src/lib/supabaseClient.ts`, `apps/web/src/components/auth/*`, `apps/web/src/lib/sessionAuth.ts`, `apps/web/messages/vi.json`.
* **Tiêu chí hoàn thành:**
  * **Given:** người dùng đã đăng ký và xác nhận email.
  * **When:** đăng nhập rồi tạo phiên, hoàn thành, đóng trình duyệt, mở lại.
  * **Then:** vẫn mở được `/debrief/{id}` và tải PDF; đăng xuất thì trang báo không tìm thấy; bundle trình duyệt không chứa khoá service-role (kiểm bằng grep build output).

#### `TASK-S10-03` [P1] 🧠: Hồ sơ cá nhân & nhận phiên khách vào tài khoản
* **Mô tả:** `GET /me`, `PATCH /me` (`display_name`, tối đa 80 ký tự). `POST /sessions/{id}/claim` — người đã đăng nhập gửi kèm guest token hợp lệ thì phiên chuyển sang `user_id` của họ và xoá `guest_token_hash` (một transaction, giữ CHECK). Trang `/profile`. PDF in `display_name` nếu có (không in email).
* **Phụ thuộc:** `TASK-S10-01`, `TASK-S10-02`.
* **File liên quan:** `apps/api/avp_api/routers/me.py`, `apps/api/avp_api/services/session_service.py`, `apps/api/avp_api/services/pdf_service.py`, `apps/web/src/app/profile/page.tsx`.
* **Tiêu chí hoàn thành:** claim bằng token sai → 404 và phiên không đổi; claim 2 lần → idempotent; user khác không claim được phiên đã thuộc người khác.

---

### Slice 11: Lịch sử luyện tập & Tiến bộ

`quality-gates.md` (T-E2E-01, release gate) yêu cầu luồng có bước **history**, hiện chưa có.

#### `TASK-S11-01` [P0] 🧠: API danh sách phiên của tôi
* **Mô tả:** `GET /api/v1/sessions?limit=20&cursor=...` cho người đã đăng nhập: trả `id, case_id, mode, status, started_at, ended_at, total_score, critical_missed, evaluation_status` của **chính họ**, sắp xếp mới nhất trước (dùng index `sessions_user_idx`), phân trang bằng cursor. Khách → 401 `AUTH_REQUIRED`. Không trả transcript.
* **Phụ thuộc:** `TASK-S10-01`.
* **File liên quan:** `apps/api/avp_api/routers/sessions.py`, `apps/api/avp_api/db/repositories/session_repo.py`, `apps/api/avp_api/schemas/session.py`, `apps/api/tests/test_session_list.py`.
* **Tiêu chí hoàn thành:** user A không thấy phiên của B; 25 phiên → trang 1 có 20, trang 2 có 5, không trùng; một query (không N+1).

#### `TASK-S11-02` [P0] 🤖: Màn hình Lịch sử luyện tập (`/history`)
* **Mô tả:** Bảng/thẻ các phiên: ngày, chế độ, trạng thái, điểm, huy hiệu red flag; nút "Tiếp tục" (phiên `active` → `/session/{id}`) và "Xem phản hồi" (→ `/debrief/{id}`); "Tải thêm"; trạng thái rỗng dẫn tới `/setup`. Khách thấy lời mời đăng nhập.
* **Phụ thuộc:** `TASK-S11-01`, `TASK-S10-02`.
* **File liên quan:** `apps/web/src/app/history/page.tsx`, `apps/web/src/components/history/*`, `apps/web/messages/vi.json`.
* **Tiêu chí hoàn thành:** `npm run typecheck && npm run lint && npm run build` exit 0; trên trình duyệt danh sách khớp API.

#### `TASK-S11-03` [P2] 🧠: Tiến bộ theo tiêu chí qua các lần luyện
* **Mô tả:** Trên `/history`, biểu đồ điểm tổng theo lần luyện và bảng tỉ lệ `met` theo từng tiêu chí rubric, **chỉ tính từ evaluation đã lưu** (cùng `rubric_version`; khác version thì tách nhóm). Không có dữ liệu thì không vẽ, không ngoại suy.
* **Phụ thuộc:** `TASK-S11-02`.
* **File liên quan:** `apps/api/avp_api/routers/sessions.py` (`GET /me/progress`), `apps/web/src/components/history/ProgressChart.tsx`.
* **Tiêu chí hoàn thành:** số liệu khớp với từng evaluation trong DB test; nhãn ghi "phản hồi luyện tập, không phải đánh giá chính thức".

---

### Slice 12: Hoàn thiện trải nghiệm người dùng

#### `TASK-S12-01` [P0] 🤖: App shell — trang chủ, điều hướng, trang lỗi
* **Mô tả:** Layout chung có header (logo, Bắt đầu luyện tập, Lịch sử, Đăng nhập — mục chưa có thì ẩn) và footer có câu miễn trừ ADR-0010 + link Quyền riêng tư. Trang chủ `/` giới thiệu: cách hoạt động 3 bước (Setup → Khám → Phản hồi), yêu cầu thiết bị (micro, trình duyệt hỗ trợ WebGL), nhãn "Nội dung lâm sàng đang chờ bác sĩ duyệt". `not-found.tsx`, `error.tsx` (có nút thử lại), `loading.tsx`. Metadata (title, description, favicon).
* **Phụ thuộc:** Slice 9.
* **File liên quan:** `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/not-found.tsx`, `apps/web/src/app/error.tsx`, `apps/web/src/components/shell/*`.
* **Tiêu chí hoàn thành:** `npm run typecheck && npm run lint && npm run build` exit 0; `/khong-ton-tai` hiện trang 404 tiếng Việt.

#### `TASK-S12-02` [P0] 🧠: Trạng thái chậm/lỗi, micro, kết thúc và tiếp tục phiên (T-UX-01, T-UX-02, T-VOICE-03)
* **Mô tả:**
  * Từ chối micro / trình duyệt không hỗ trợ MediaRecorder → hướng dẫn bật quyền + tự chuyển sang nhập chữ.
  * Provider chậm/lỗi: spinner "Người mẹ đang trả lời…", timeout có thông báo rõ, nút gửi lại; không bao giờ hiện câu trả lời giả là thành công.
  * WebSocket rớt → tự kết nối lại (backoff, tối đa 3 lần) rồi báo dùng chế độ chữ.
  * Hộp thoại xác nhận trước "Kết thúc buổi khám" (cho biết sau đó không hỏi tiếp được).
  * Tải lại `/session/{id}` khôi phục transcript, sinh hiệu, chế độ; phiên đã kết thúc tự chuyển sang `/debrief/{id}`.
  * Đồng hồ thời gian phiên.
* **Phụ thuộc:** Slice 6, `TASK-S12-01`.
* **File liên quan:** `apps/web/src/app/session/[id]/page.tsx`, `apps/web/src/hooks/useVoiceSession.ts`, `apps/web/src/components/workspace/*`.
* **Tiêu chí hoàn thành:** checklist thủ công T-UX-01/02 và T-VOICE-03 ghi vào release checklist; Playwright: chặn quyền micro → ô nhập chữ vẫn gửi được.

#### `TASK-S12-03` [P1] 🧠: Khác biệt chế độ Luyện tập / Thi thử + hướng dẫn lần đầu
* **Mô tả:** Hiện `mode` (guided/exam) chỉ được lưu và hiển thị nhãn. Luyện tập: danh sách nhắc việc dựa trên **tên các miền rubric** (không thêm nội dung lâm sàng mới, không tiết lộ đáp án), tick khi tiêu chí có dấu hiệu đã hỏi (heuristic phía server, không phải chấm điểm). Thi thử: ẩn nhắc việc, có giới hạn thời gian (giá trị cấu hình, mặc định do người quyết định). Lớp hướng dẫn lần đầu (overlay 4 bước: hỏi bệnh, khám, sinh hiệu, kết thúc), lưu "đã xem" trong `localStorage`.
* **Phụ thuộc:** `TASK-S12-02`.
* **File liên quan:** `apps/web/src/components/workspace/GuidedChecklist.tsx`, `apps/web/src/components/workspace/Onboarding.tsx`, `apps/api/avp_api/routers/sessions.py`.
* **Tiêu chí hoàn thành:** chế độ thi không trả nhắc việc qua API (kiểm bằng test, không chỉ ẩn trên UI); văn bản nhắc việc được bác sĩ duyệt trước khi bỏ nhãn draft.

#### `TASK-S12-04` [P1] 🤖: Responsive & accessibility cơ bản
* **Mô tả:** Workspace xếp dọc trên màn hình < 1024 px (avatar → monitor → chat), không cuộn ngang ở 375 px; điều khiển bàn phím cho mọi nút; `aria-live` cho tin nhắn mới và cảnh báo sinh hiệu; tương phản màu đạt WCAG AA; nhãn cho ô nhập.
* **Phụ thuộc:** `TASK-S12-01`.
* **File liên quan:** `apps/web/src/app/session/[id]/page.tsx`, `apps/web/src/app/debrief/[id]/page.tsx`, `apps/web/src/components/**`.
* **Tiêu chí hoàn thành:** `npm run build` exit 0; quét axe (Playwright `@axe-core/playwright`) không còn lỗi mức serious/critical trên 4 trang.

---

### Slice 13: Quyền riêng tư & Dữ liệu cá nhân (Hard Rule 6, `database.md` §6)

#### `TASK-S13-01` [P0] 🧠: Trang Quyền riêng tư, xoá phiên, xoá dữ liệu của tôi
* **Mô tả:** Trang `/privacy` (dữ liệu nào được lưu: transcript chữ, không lưu audio; mục đích; thời gian lưu; quyền xoá) — văn bản do nhóm duyệt. `DELETE /api/v1/sessions/{id}` (chủ phiên; xoá cascade turns, evaluations, evaluation_items, debriefs, jobs). `DELETE /api/v1/me` xoá mọi phiên + profile (tài khoản Supabase xoá qua quy trình riêng phía server, không dùng khoá service-role ở trình duyệt). Nút xoá có xác nhận trên `/history` và `/debrief/{id}`. Phiên khách hết hạn: job dọn dẹp phiên khách quá N ngày (N do người quyết).
* **Phụ thuộc:** `TASK-S11-01`.
* **File liên quan:** `apps/api/avp_api/routers/sessions.py`, `apps/api/avp_api/routers/me.py`, `apps/api/avp_api/jobs/worker.py`, `apps/web/src/app/privacy/page.tsx`. Các FK con đã `on delete cascade` (`schema.sql`), nên không cần migration cho phần xoá.
* **Tiêu chí hoàn thành:** sau khi xoá, mọi route của phiên → 404 và không còn dòng nào trong các bảng con (test DB thật); người khác xoá phiên không phải của mình → 404.

#### `TASK-S13-02` [P2] 🧠 ⏸: Trang xác thực báo cáo công khai qua QR
* **Mô tả (đề xuất, chờ quyết định Q6):** QR trỏ tới `/verify/{code}` với `code` ngẫu nhiên riêng cho từng báo cáo (không phải session id, không phải token). Trang công khai chỉ hiện: tên ca, ngày, điểm tổng, `critical_missed`, phiên bản rubric, mã băm PDF và câu miễn trừ — **không** transcript, không tên người học trừ khi họ bật chia sẻ. Có thể thu hồi mã.
* **Phụ thuộc:** `TASK-S13-01`; cần migration (bảng `report_verifications` hoặc cột mới) + RLS.
* **Tiêu chí hoàn thành:** mã sai/đã thu hồi → 404; trang không lộ dữ liệu cá nhân (review thủ công + test).

---

### Slice 14: Triển khai, Vận hành & Đo lường

#### `TASK-S14-01` [P0] 🧠 ⏸: Deploy staging (API + worker + web)
* **Mô tả:** `apps/api/Dockerfile` (uvicorn, non-root, font DejaVu cho PDF), tiến trình worker riêng (`python -m avp_api.jobs.worker`) thay vì chỉ BackgroundTasks; web deploy với `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` đúng domain; `ALLOWED_ORIGINS`, `WEB_BASE_URL`; health check; `docs/deploy.md` hướng dẫn migrate + ingest. Nền tảng hosting do người chọn (Q5) — không tự đăng ký dịch vụ trả phí.
* **Phụ thuộc:** AVP-034, `TASK-S14-04`.
* **Tiêu chí hoàn thành:** `GET /health` trên staging 200; một phiên đầy đủ chạy được trên staging với provider Fake.

#### `TASK-S14-02` [P0]: Kiểm thử luồng đầy đủ (T-E2E-01)
* **pt1 🤖 (xong, PR #21):** `apps/api/tests/test_e2e_flow.py` — luồng session → PDF, thứ tự transcript, phân quyền 11 route.
* **pt2 🤖:** Playwright trong `apps/web/e2e/` chạy với API provider Fake: Setup → 3 câu hỏi → khám → kết thúc → debrief → mở transcript từ bằng chứng → tải PDF → (sau Slice 11) thấy phiên trong `/history`. Thêm job CI. Script `scripts/smoke_staging.py` chạy luồng 3 lần liên tiếp trên staging, ghi kết quả vào `evals/results/e2e-*.json`.
* **Tiêu chí hoàn thành:** `npx playwright test` exit 0 trong CI; 3/3 lần trên staging (release gate).

#### `TASK-S14-03` [P1] 🤖/🧠: Script đo lường (AVP-026, T-OSCE-04, latency)
* **Mô tả:** `evals/latency.py` (đo thời gian đến chữ đầu/audio đầu qua WS, n lượt, p50/p95), `evals/repeatability.py` (chấm lại cùng transcript k lần, so sánh kết quả), `evals/agreement.py` (so evaluator với nhãn người chấm, Cohen's kappa kèm n và giới hạn). Kết quả lưu `evals/results/*.json`. Script là 🤖; diễn giải kết quả và bộ nhãn vàng là 🧠/người.
* **Tiêu chí hoàn thành:** mỗi script chạy offline với provider Fake và in ra file kết quả; **chỉ số được trích dẫn trong tài liệu phải lấy từ các file này** (Hard Rule 3).

#### `TASK-S14-04` [P0] 🧠: Giới hạn tần suất, trần chi phí & log an toàn
* **Mô tả:** Giới hạn mỗi phiên: số lượt hỏi tối đa, độ dài câu hỏi, số giây audio; giới hạn tạo phiên theo IP/người dùng; trần chi phí ngày (đếm lượt gọi LLM/STT/TTS, vượt trần → chuyển provider Fake và báo người dùng). Middleware gắn `request_id`, log JSON không chứa transcript, audio, token, email. Trả 429 `RATE_LIMITED` có `Retry-After`.
* **Phụ thuộc:** Slice 3, Slice 6.
* **File liên quan:** `apps/api/avp_api/middleware/*`, `apps/api/avp_api/config.py`, `apps/api/tests/test_limits.py`.
* **Tiêu chí hoàn thành:** vượt giới hạn → 429; test kiểm log không chứa chuỗi transcript/token (T-SEC-02, T-RATE-01).

#### `TASK-S14-05` [P2] 🧠: Thử nghiệm người dùng & góp ý trong app (AVP-038)
* **Mô tả:** Kịch bản thử nghiệm 5–8 sinh viên (nhiệm vụ, câu hỏi SUS), form góp ý trên `/debrief/{id}` (điểm 1–5 + ý kiến, gắn session, có đồng ý). Cần bảng mới `feedback` (migration + RLS).
* **Tiêu chí hoàn thành:** kết quả thử nghiệm lưu `evals/results/usability-*.md` với n thật; không công bố con số khi chưa có dữ liệu.

---

## Ngoài phạm vi Giai đoạn 2 (cần Product Owner duyệt nếu muốn làm)
| Tính năng | Lý do chưa đưa vào |
|---|---|
| Nhiều ca bệnh / thư viện ca | `product-scope.md` chốt đúng 1 ca HFMD |
| Dashboard giảng viên xem bài sinh viên | Gần với LMS (bị loại); cần quyết định về quyền xem dữ liệu cá nhân |
| Thanh toán, gói thuê bao | Bị loại khỏi MVP |
| Giao diện tiếng Anh (i18n đa ngôn ngữ) | Người dùng mục tiêu là sinh viên Việt Nam |
| Ảnh lâm sàng thật cho vùng khám | Cần nguồn có quyền sử dụng và bác sĩ duyệt (`TODO(clinician)`) |
