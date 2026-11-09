# Nhật Ký Thay Đổi Tài Liệu (CHANGELOG_DOCS.md)

| Ngày cập nhật | Tài liệu thay đổi | Loại thay đổi | Chi tiết thay đổi & Lý do |
| :--- | :--- | :--- | :--- |
| 2026-11-09 | `docs/research/RECON_cyberpatient.md` | **Tạo mới** | Tài liệu khảo sát Clean-room hệ thống CyberPatient qua REA CDP và static code analysis. Phục vụ tham chiếu UX, sitemap, userflow và ma trận Gap Analysis (GATE 1). |
| 2026-11-09 | `docs/specs/product-scope.md` | **Cập nhật** | • Chốt phạm vi MVP: Đúng 1 ca Nhi khoa Tay chân miệng (người mẹ bế con), 3 màn hình cốt lõi.<br>• Chốt giải quyết Quyết định D-1: Đưa Avatar 3D (Three.js raycasting), Vitals State Machine, Voice đàm thoại, Auto-OSCE và Debriefing RAG xuất PDF+QR vào phạm vi phát triển chính thức.<br>• Bổ sung Acceptance Criteria định dạng Given/When/Then cho toàn bộ tính năng. |
| 2026-11-09 | `docs/specs/vitals-state-machine.md` | **Tạo mới** | Đặc tả chi tiết Máy trạng thái Sinh hiệu cho ca bệnh Tay chân miệng: 5 trạng thái diễn tiến lâm sàng (Độ 1 $\rightarrow$ Độ 2a $\rightarrow$ Độ 2b $\rightarrow$ Ổn định), ma trận chỉ số sinh hiệu và các trigger events can thiệp y lệnh. |
| 2026-11-09 | `docs/specs/agents-and-rag.md` | **Tạo mới** | Đặc tả kiến trúc phân tách Hot Path vs Cold Path, chi tiết 3 Agent nghiệp vụ (Patient Agent với 3-tier guardrails & prompt caching, Evaluator Agent với code scoring, Debriefing Agent với khung phản hồi 5 tầng sư phạm) và luồng RAG trích dẫn văn bản Bộ Y tế (QĐ 1003/QĐ-BYT). |
| 2026-11-09 | `docs/specs/database.md` | **Cập nhật** | Bổ sung sơ đồ quan hệ thực thể hoàn chỉnh (Mermaid ERD) liên kết giữa Profiles, Cases, Sessions, Turns, Evaluations, Evaluation Items, Debriefs, Source Documents/Chunks và Jobs. |
| 2026-11-09 | `docs/specs/openapi.yaml` | **Cập nhật** | Bổ sung các endpoint hợp đồng API mới:<br>• `POST /sessions/{id}/actions`: Khám thực thể qua raycasting 3D.<br>• `GET /sessions/{id}/vitals`: Lấy snapshot sinh hiệu hiện tại.<br>• `GET /sessions/{id}/debrief/pdf`: Xuất file PDF bảng điểm kèm mã QR. |
| 2026-11-09 | `docs/TASKS.md` | **Tạo mới** | Tái cấu trúc danh mục công việc kỹ thuật thành 9 Vertical Slices hoàn chỉnh (tương ứng lộ trình GĐ 4), gán độ ưu tiên P0/P1/P2, mã định danh, dependencies, file liên quan và Acceptance Criteria. |
| 2026-11-09 | `docs/OPEN_QUESTIONS.md` | **Tạo mới** | Ghi nhận các quyết định kiến trúc và lựa chọn mặc định hợp lý (3D model format, voice provider, scoring cap rules) để Product Owner rà soát duyệt mà không chặn tiến độ. |

