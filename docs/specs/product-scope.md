# Product Scope: AI Virtual Patient MVP

## 1. Mục tiêu & Phạm vi cốt lõi (Core MVP Scope)
Xây dựng nền tảng Bệnh nhân Ảo y tế (AI Virtual Patient) tương tác đa phương thức (voice-to-voice + avatar 3D + khám lâm sàng raycasting) và tự động lượng giá năng lực lâm sàng (Auto-OSCE + RAG trích dẫn Hướng dẫn Bộ Y tế) phục vụ đào tạo Y Dược.

### 1.1. Phạm vi ca bệnh (Clinical Scope)
* **Số lượng:** Đúng **01 ca lâm sàng duy nhất**: **Nhi khoa - Bệnh Tay chân miệng (Hand, Foot, and Mouth Disease - HFMD)**.
* **Hình tượng nhân vật:** Người mẹ bế con nhỏ (bệnh nhân nhi).
* **Nguồn tài liệu y khoa:** Hướng dẫn chẩn đoán và điều trị Bệnh Tay chân miệng (Quyết định số 1003/QĐ-BYT của Bộ Y tế và phác đồ Bệnh viện Bệnh Nhiệt đới TP.HCM). Toàn bộ dữ liệu ca bệnh được lưu tại `data/cases/hfmd_pediatric_01.json` và đánh dấu `[CẦN BÁC SĨ DUYỆT]`.

### 1.2. Ba màn hình chính (3 Screens Architecture)
1. **Setup Screen (`/setup`):**
   * Lựa chọn ca bệnh (HFMD Nhi khoa).
   * Lựa chọn vai trò người học (Sinh viên Y đa khoa, Bác sĩ nội trú, Bác sĩ thực hành).
   * Lựa chọn chế độ: Luyện tập (có gợi ý/feedback tức thì) hoặc Thi thử (OSCE Exam mode, ẩn gợi ý).
   * Tiếp nhận chấp thuận người dùng (Informed consent notice) và khởi tạo phiên thực hành (`sessionId`).
2. **Clinical Workspace (`/session/[id]`):**
   * **Avatar 3D tương tác (Three.js):** Mô hình 3D người mẹ bế em bé, hỗ trợ cử động mắt/đầu và cử động môi (lip-sync cơ bản) khi phản hồi giọng nói.
   * **Khám thực thể bằng Raycasting:** Người học click trực tiếp vào các vị trí giải phẫu của trẻ (Lòng bàn tay, Lòng bàn chân, Vòm họng/Miệng, Vùng mông/Đầu gối) để quan sát hình ảnh nốt ban, bóng nước và vết loét.
   * **Hệ thống Sinh hiệu theo State Machine:** Monitor hiển thị Mạch, Nhiệt độ, Huyết áp, Nhịp thở, SpO2 tự động biến thiên theo trạng thái bệnh cảnh và can thiệp của sinh viên.
   * **Hội thoại Hai chiều (Voice-to-voice & Text):** Đàm thoại qua WebSocket với Patient Agent (đóng vai người mẹ), hiển thị transcript đồng bộ thời gian thực.
3. **Debriefing Screen (`/debrief/[id]`):**
   * Bảng điểm Auto-OSCE chi tiết 7 miền năng lực theo rubric chuẩn.
   * Cảnh báo Dấu hiệu Nguy hiểm (Red Flags Alert): Nhận diện giật mình chới với, sốt cao khó hạ, biến chứng thần kinh/tim mạch.
   * RAG Debriefing: Từng nhận xét đều trích dẫn chính xác điều khoản/trang tài liệu Hướng dẫn chẩn đoán & điều trị của Bộ Y tế.
   * Xuất báo cáo kết quả định dạng **PDF** tích hợp **Mã QR** xác thực phiên làm bài.

---

## 2. Quyết định Phạm vi D-1: ĐÃ CHỐT (Resolved)
* **Quyết định:** Thống nhất tích hợp Avatar 3D + Raycasting khám, State Machine Sinh hiệu, Voice-to-voice, Auto-OSCE và Debriefing RAG xuất PDF+QR vào phạm vi MVP của phiên bản hiện tại.
* **Ranh giới Clean-room:** Không sao chép tài sản, mã nguồn hay giao diện từ CyberPatient. Mọi thành phần được xây dựng độc lập theo chuẩn Y tế Việt Nam.

---

## 3. Tiêu chí Chấp nhận Tính năng (Acceptance Criteria - Given/When/Then)

### Tính năng 1: Thiết lập Phiên Khám bệnh (Setup Screen)
* **Kịch bản 1.1: Khởi tạo phiên hợp lệ**
  * **Given:** Người học đã truy cập trang `/setup`.
  * **When:** Người học chọn ca "Tay chân miệng Nhi khoa", chọn vai trò "Sinh viên Y", chọn chế độ "Luyện tập" và bấm "Bắt đầu khám".
  * **Then:** Hệ thống gửi request tạo phiên, nhận `sessionId` và chuyển hướng mượt mà sang `/session/[id]` trong vòng dưới 1 giây.
* **Kịch bản 1.2: Chưa đồng ý điều khoản bảo mật dữ liệu**
  * **Given:** Người học ở màn hình `/setup`.
  * **When:** Người học chưa tick chọn ô xác nhận đồng ý điều khoản lưu trữ transcript ẩn danh và bấm "Bắt đầu khám".
  * **Then:** Nút bắt đầu bị vô hiệu hóa hoặc hiển thị thông báo yêu cầu xác nhận điều khoản.

### Tính năng 2: Không gian Khám Lâm sàng & Hội thoại Bệnh nhân (Clinical Workspace)
* **Kịch bản 2.1: Khám thực thể qua Raycasting 3D**
  * **Given:** Người học đang ở màn hình `/session/[id]` và tương tác với Avatar 3D.
  * **When:** Người học click chuột vào vùng "Lòng bàn tay" của trẻ trên mô hình 3D.
  * **Then:** Hệ thống thực hiện raycast trúng vùng khám `palm_hands`, kích hoạt hành động khám, hiển thị hình ảnh tổn thương bóng nước đặc trưng kèm dòng ghi chú mô tả lâm sàng, đồng thời ghi nhận sự kiện khám vào transcript.
* **Kịch bản 2.2: Hỏi bệnh người mẹ qua Giọng nói (Voice-to-voice)**
  * **Given:** Người học nhấn giữ nút Micro hoặc bật chế độ rảnh tay và nói: "Cháu bị sốt từ khi nào vậy chị?".
  * **When:** Tín hiệu âm thanh truyền qua STT Adapter chuyển thành văn bản và chuyển tới Patient Agent.
  * **Then:** Patient Agent trả lời đúng vai người mẹ (theo dữ liệu `data/cases/`), Avatar 3D mấp máy môi phát âm thanh giọng nói tiếng Việt, và hộp thoại transcript hiển thị câu hỏi - câu trả lời trong vòng 1.5 - 2.5 giây.
* **Kịch bản 2.3: Xử lý Guardrail khi sinh viên hỏi điều ngoài kịch bản**
  * **Given:** Sinh viên hỏi một thông tin không có trong hồ sơ ca bệnh (ví dụ: "Bố cháu có hút thuốc lá không?").
  * **When:** Patient Agent đối chiếu tầng Tier 3 Fallback.
  * **Then:** Phản hồi bằng câu từ chối tự nhiên theo tâm lý người mẹ ("Dạ em không để ý/Dạ chuyện đó bình thường bác sĩ ơi"), tuyệt đối không tự bịa thông tin bệnh lý làm sai lệch ca bệnh.

### Tính năng 3: Diễn tiến Sinh hiệu (Vitals State Machine)
* **Kịch bản 3.1: Chuyển độ lâm sàng khi không hạ sốt kịp thời**
  * **Given:** Trẻ đang ở trạng thái Độ 2a (Sốt cao 39.2°C, mạch 140 l/p).
  * **When:** Sau 5 phút hội thoại hoặc sinh viên không đưa ra chỉ định hạ sốt / an thần kinh.
  * **Then:** State machine kích hoạt sự kiện `FEVER_UNCONTROLLED`, sinh hiệu chuyển sang Độ 2b (Mạch tăng lên 165 l/p, nhịp thở 45 l/p, xuất hiện ghi nhận giật mình 2 lần trong 30 phút).

### Tính năng 4: Đánh giá Tự động Auto-OSCE & Debriefing RAG (Debriefing Screen)
* **Kịch bản 4.1: Chấm điểm dựa trên bằng chứng minh bạch**
  * **Given:** Sinh viên bấm "Kết thúc buổi khám" (`POST /sessions/{id}/finish`).
  * **When:** Evaluator Agent chạy phân tích transcript và code chấm điểm thực thi.
  * **Then:** Mọi tiêu chí đạt điểm (Status `met` hoặc `partial`) bắt buộc phải trích dẫn số thứ tự lượt thoại (`turn_idx`) và câu nói nguyên văn của sinh viên. Nếu không có trích dẫn hợp lệ, tiêu chí tự động về 0 điểm.
* **Kịch bản 4.2: Cảnh báo Dấu hiệu Nguy hiểm (Red Flags)**
  * **Given:** Sinh viên không hỏi về triệu chứng "giật mình khi thiu thiu ngủ" của bé.
  * **When:** Evaluator kiểm tra tiêu chí Critical Red Flag `r-redflag-startle`.
  * **Then:** Màn hình Debriefing hiển thị nổi bật banner cảnh báo đỏ: "BỎ SÓT DẤU HIỆU NGUY HIỂM: Giật mình chới với - Nguy cơ chuyển độ 2b biến chứng thần kinh".
* **Kịch bản 4.3: Trích dẫn chứng cứ y khoa RAG**
  * **Given:** Hệ thống đưa ra nhận xét: "Cần cho trẻ nhập viện theo dõi sát và chỉ định Phenobarbital".
  * **When:** Sinh viên bấm vào biểu tượng nguồn trích dẫn bên cạnh khuyến nghị.
  * **Then:** Modal mở ra hiển thị nguyên văn đoạn trích từ Hướng dẫn chẩn đoán và điều trị Bệnh Tay chân miệng (Quyết định 1003/QĐ-BYT) kèm số trang và mục điều trị cụ thể.
* **Kịch bản 4.4: Xuất báo cáo PDF kèm QR Code**
  * **Given:** Sinh viên ở trang Debriefing.
  * **When:** Bấm nút "Xuất chứng nhận thực hành (PDF)".
  * **Then:** File PDF chuẩn A4 được tải xuống, có chứa đầy đủ thông tin: Tên sinh viên, Ca lâm sàng, Điểm OSCE từng phần, Lỗi sai cần khắc phục, Ghi chú miễn trừ y khoa, và Mã QR liên kết trực tiếp tới bản ghi phiên khám trực tuyến để hậu kiểm.

---

## 4. Definition of Done (DoD)
1. **Mã nguồn:** Code chạy ổn định, không lỗi TypeScript/Python linting (`ruff`, `tsc`).
2. **Không Secrets:** Không chứa bất kỳ API key, token hay mật khẩu thật nào trong repo.
3. **Mô phỏng độc lập (Mock-first):** Toàn bộ các dịch vụ ngoài (LLM, STT, TTS, Vector DB) có adapter giả lập (Fake/Mock) để chạy demo offline không phụ thuộc mạng.
4. **Y khoa thận trọng:** Toàn bộ văn bản kết quả ghi rõ: *"Học liệu phản hồi để luyện tập, không phải kết quả đánh giá chính thức hay chứng chỉ hành nghề y tế"*.
