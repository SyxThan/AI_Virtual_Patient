# Danh mục Nhiệm vụ Kỹ thuật theo Vertical Slices (TASKS.md)

> **Phương pháp quản lý:** Chia nhỏ công việc theo **9 Vertical Slices** khép kín (từ Data/Backend tới UI/UX Frontend).
> **Nguyên tắc triển khai:** Mỗi slice thực hiện trên branch `feat/<task-id>`, vượt qua build/typecheck/lint và được **Reviewer** độc lập kiểm duyệt trước khi merge vào `main`.

---

## Bảng Ánh Xạ Mã Workbook (`AVP-xxx`) $\leftrightarrow$ Vertical Slices (`TASK-Sx-xx`)

Bảng dưới đây đồng bộ hóa 1:1 giữa danh mục công việc trong Workbook 30 ngày của nhóm (`AVP-xxx`) và các Vertical Slice tasks:

| Mã Workbook | Thuộc Vertical Slice | Tên Task & Nội dung | Độ ưu tiên | Trạng thái |
| :--- | :--- | :--- | :---: | :---: |
| **AVP-006, AVP-031** | **Slice 1** (`TASK-S1-01`) | Khung Monorepo, `.env.example`, Next.js 16 + FastAPI scaffold | **P0** | 🟡 Đã scaffold |
| **AVP-007, AVP-034** | **Slice 1** (`TASK-S1-02`) | Alembic migration 11 bảng, Postgres RLS, test RLS | **P0** | ❌ Chưa làm |
| **AVP-003, AVP-035** | **Slice 1** (`TASK-S1-03`) | Ca mẫu Nhi khoa Tay chân miệng (`hfmd_pediatric_01.json`), validate script | **P0** | 🟡 Có bản draft |
| **AVP-008** | **Slice 2** (`TASK-S2-01`) | Session API (`POST /sessions`), quản lý guest token | **P0** | ❌ Chưa làm |
| **AVP-010 (Part 1)** | **Slice 2** (`TASK-S2-02`) | Giao diện Setup Screen (`/setup`), consent checkbox | **P0** | ❌ Chưa làm |
| **AVP-009, AVP-011** | **Slice 3** (`TASK-S3-01`) | Patient Agent service, 3-tier guardrails, prompt cache | **P0** | ❌ Chưa làm |
| **AVP-010, AVP-012** | **Slice 3** (`TASK-S3-02`) | Transcript Box, text turn loop (`POST /sessions/{id}/turns`) | **P0** | ❌ Chưa làm |
| **AVP-102** | **Slice 4** (`TASK-S4-01`) | Vitals State Machine engine backend (5 trạng thái HFMD) | **P0** | ❌ Chưa làm |
| **AVP-102** | **Slice 4** (`TASK-S4-02`) | Monitor sinh hiệu thời gian thực frontend (`VitalsMonitor.tsx`) | **P0** | ❌ Chưa làm |
| **AVP-104** | **Slice 5** (`TASK-S5-01`) | Three.js canvas, nạp avatar 3D người mẹ bế bé | **P0** | ❌ Chưa làm |
| **AVP-101, AVP-104** | **Slice 5** (`TASK-S5-02`) | Raycasting 4 vùng khám (Bàn tay, Chân, Miệng, Mông/Gối) | **P0** | ❌ Chưa làm |
| **AVP-104** | **Slice 5** (`TASK-S5-03`) | Cử động môi (Lip-sync) cơ bản theo biên độ audio | **P1** | ❌ Chưa làm |
| **AVP-020, AVP-021** | **Slice 6** (`TASK-S6-01`) | STT / TTS provider adapters + MockVoiceAdapter offline | **P1** | ❌ Chưa làm |
| **AVP-022, AVP-103** | **Slice 6** (`TASK-S6-02`) | WebSocket duplex stream voice loop (`/ws/sessions/{id}`) | **P1** | ❌ Chưa làm |
| **AVP-004, AVP-014** | **Slice 7** (`TASK-S7-01`) | Evaluator Agent, phân tích transcript theo Rubric 7 domains | **P0** | ❌ Chưa làm |
| **AVP-013** | **Slice 7** (`TASK-S7-02`) | Code Evidence Verifier (xác minh quote), deterministic scoring | **P0** | ❌ Chưa làm |
| **AVP-017, AVP-018** | **Slice 8** (`TASK-S8-01`) | Ingest tài liệu QĐ 1003/QĐ-BYT Bộ Y tế, pgvector embedding | **P1** | ❌ Chưa làm |
| **AVP-019** | **Slice 8** (`TASK-S8-02`) | Debriefing Agent: Khung phản hồi 5 tầng & RAG citations | **P1** | ❌ Chưa làm |
| **AVP-015, AVP-023** | **Slice 9** (`TASK-S9-01`) | Giao diện Debriefing Screen (`/debrief/[id]`), cảnh báo Red Flags | **P0** | ❌ Chưa làm |
| **AVP-105** | **Slice 9** (`TASK-S9-02`) | Generator xuất báo cáo PDF chuẩn A4 kèm mã QR xác thực | **P0** | ❌ Chưa làm |

---

## Bảng tổng hợp Tiến độ Vertical Slices

| Slice | Tên phân đoạn (Vertical Slice) | Mức ưu tiên | Trạng thái |
| :--- | :--- | :--- | :--- |
| **Slice 1** | Khung dự án, Routing 3 màn hình & Data Model nền tảng | **P0** | 🟡 Một phần (Đã scaffold, cần hoàn thiện typegen) |
| **Slice 2** | Setup Screen: Chọn ca, vai trò & Khởi tạo phiên | **P0** | ❌ Chưa làm |
| **Slice 3** | Clinical Workspace — Hội thoại văn bản với Patient Agent | **P0** | ❌ Chưa làm |
| **Slice 4** | Clinical Workspace — Máy trạng thái Sinh hiệu (Vitals State Machine) | **P0** | ❌ Chưa làm |
| **Slice 5** | Clinical Workspace — Avatar 3D & Khám Thực Thể Raycasting | **P0** | ❌ Chưa làm |
| **Slice 6** | Tích hợp Đàm thoại Giọng nói (Voice-to-voice STT / TTS) | **P1** | ❌ Chưa làm |
| **Slice 7** | Evaluator Agent & Bộ chấm điểm Auto-OSCE Chuẩn Bộ Y tế | **P0** | ❌ Chưa làm |
| **Slice 8** | Phân hệ RAG Y tế & Trích dẫn Văn bản Pháp quy Bộ Y tế | **P1** | ❌ Chưa làm |
| **Slice 9** | Debriefing Screen: Phản hồi, Cảnh báo Red Flags & Xuất PDF + QR | **P0** | ❌ Chưa làm |

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
* **Mô tả:** Triển khai endpoint `GET /api/v1/sessions/{id}/debrief/pdf` sinh file PDF khổ A4 trình bày trang trọng bảng điểm, nhận xét, disclaimer học tập và mã QR liên kết tới URL xác thực trực tuyến.
* **Phụ thuộc:** `TASK-S9-01`.
* **File liên quan:** `apps/api/avp_api/services/pdf_service.py`, `apps/web/src/components/debrief/ExportPdfButton.tsx`.
* **Tiêu chí hoàn thành:** Bấm nút xuất tải về file PDF mở được bình thường, dùng camera điện thoại quét mã QR mở đúng trang phiên thực hành.
