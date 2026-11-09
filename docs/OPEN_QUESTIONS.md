# Các Điểm Cần Phê Duyệt & Quyết Định Thiết Kế (OPEN_QUESTIONS.md)

> **Nguyên tắc:** Để không làm gián đoạn tiến độ thực hiện (không blocking), Lead Orchestrator đã chọn trước **phương án hợp lý nhất (Recommended Default)** cho từng điểm bên dưới. Xin Product Owner xem xét và phê duyệt khi có thời gian.

---

### Câu hỏi 1: Phương án hiển thị Avatar 3D khi chưa có Model 3D chuyên nghiệp từ Họa sĩ 3D
* **Bối cảnh:** Việc tạo một model 3D chất lượng cao (người mẹ bế em bé có đầy đủ xương rig và morph target miệng) có thể tốn thời gian thiết kế bên ngoài.
* **Các phương án:**
  * *Phương án A:* Đợi có file model `.glb` hoàn chỉnh rồi mới code màn hình Clinical Workspace. *(Nhược điểm: Chặn tiến độ frontend)*.
  * *Phương án B (Đã chọn làm mặc định):* Dựng component Three.js với mô hình Low-poly/Procedural Humanoid Rig dạng hình học phân tầng (Stylized mother & infant avatar), gắn sẵn đầy đủ Raycast Collider Mesh vào 4 vùng (Bàn tay, Bàn chân, Miệng, Mông/Gối) và morph animation cơ bản. Khi có file `.glb` chính thức chỉ cần đổi đường dẫn nạp asset mà không phải sửa logic code.
* **Trạng thái:** 🟢 Đang triển khai theo Phương án B.

---

### Câu hỏi 2: Quy tắc xử lý Điểm tổng Auto-OSCE khi Bỏ sót Dấu hiệu Nguy hiểm (Critical Red Flag)
* **Bối cảnh:** Trong bệnh Tay chân miệng, "giật mình chới với lúc thiu thiu ngủ" và "sốt cao trên 39°C không hạ" là chỉ dấu cảnh báo biến chứng viêm não/viêm thân não. Nếu sinh viên hỏi tốt mọi thứ khác nhưng bỏ qua dấu hiệu này thì có cho đạt (Pass) không?
* **Các phương án:**
  * *Phương án A:* Chỉ trừ điểm của tiêu chí đó theo trọng số thông thường (ví dụ trừ 2/10 điểm, tổng vẫn 8/10).
  * *Phương án B (Đã chọn làm mặc định):* Kích hoạt cờ `critical_missed = true`, hiển thị Banner cảnh báo đỏ nổi bật ở đầu trang Debriefing và **giới hạn trần điểm tối đa của buổi thi không vượt quá 60/100** (mức không đạt tiêu chuẩn an toàn lâm sàng), đi kèm dòng giải thích sư phạm: *"Bỏ sót dấu hiệu báo động chuyển độ nặng nguy hiểm tính mạng"*.
* **Trạng thái:** 🟢 Đang triển khai theo Phương án B (chờ Bác sĩ duyệt chính thức ở AVP-016).

---

### Câu hỏi 3: Bộ Adapter Giọng nói (STT / TTS) mặc định trong Môi trường Phát triển
* **Bối cảnh:** Chưa có API Key thật cho các dịch vụ trả phí thương mại (ElevenLabs, OpenAI Whisper, FPT.AI) trong giai đoạn khảo sát nội bộ.
* **Các phương án:**
  * *Phương án A:* Bắt buộc cấu hình API key trả phí thì mới chạy được ứng dụng.
  * *Phương án B (Đã chọn làm mặc định):* Xây dựng `MockVoiceAdapter` (trả về audio tổng hợp qua Web Speech API có sẵn của trình duyệt hoặc file âm thanh mẫu lưu cục bộ trong `data/`) song song với Interface Adapter cho ElevenLabs/Whisper. Đảm bảo ứng dụng chạy mượt mà ngay trên máy dev mà không mất chi phí API.
* **Trạng thái:** 🟢 Đang triển khai theo Phương án B.

---

### Câu hỏi 4: Chứng nhận Báo cáo Debriefing PDF & Mã QR Tra cứu
* **Bối cảnh:** Tránh rủi ro pháp lý về việc cấp chứng chỉ hành nghề y tế giả mạo (ADR-010).
* **Phương án đã chọn làm mặc định:**
  * Tiêu đề file PDF xuất ra được đặt rõ ràng là: **"BÁO CÁO PHẢN HỒI THỰC HÀNH LÂM SÀNG (PRACTICE FEEDBACK REPORT)"**.
  * Cuối trang in dòng miễn trừ trách nhiệm y khoa: *"Tài liệu này là kết quả mô phỏng phục vụ mục đích học tập cá nhân, không có giá trị thay thế chứng chỉ lâm sàng hoặc đánh giá chính thức của cơ sở đào tạo."*
  * Mã QR khi quét bằng điện thoại sẽ mở ra trang web xác thực trực tuyến phiên khám, hiển thị nguyên văn transcript và các bằng chứng đã chấm.
* **Trạng thái:** 🟢 Đã ghi nhận vào SPEC và Schema.

