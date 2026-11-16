# evals/: đo lường có bằng chứng

Theo Hard rule 3 (CLAUDE.md), mọi con số về độ trễ, độ đồng thuận, tỉ lệ bịa thông tin hay chi phí chỉ được trích dẫn khi lấy từ file mà các script ở đây ghi vào `evals/results/`. Mỗi file kết quả ghi rõ:
- thời điểm đo;
- commit;
- máy đo;
- provider đã dùng.

Kết quả chạy bằng provider giả (`contains_fake_provider: true`) chỉ để kiểm tra script, **không được trích dẫn**.

## Độ trễ một lượt hỏi (`latency.py`, AVP-026)

**Cách đo:**
- Script chạy API FastAPI ngay trong tiến trình, dùng repo trong bộ nhớ (không cần DB, không đụng server dev) và ca bệnh thật `data/cases/case-01-hfmd.json`.
- Script gửi 8 câu hỏi tổng hợp qua đúng WebSocket `/ws/sessions/{id}` mà trình duyệt dùng.

**Các chỉ số đo được:**

| Chỉ số | Nghĩa |
|---|---|
| `stt_ms` | Thời gian nhận dạng giọng nói (đo ở server, chỉ có ở chế độ voice) |
| `llm_ms` | Thời gian Patient Agent trả lời (đo ở server) |
| `tts_ms` | Thời gian tổng hợp giọng người mẹ (đo ở server) |
| `first_text_ms` | Từ lúc gửi câu hỏi đến khi nhận chữ trả lời |
| `first_audio_ms` | Từ lúc gửi câu hỏi đến khi nhận audio trả lời. So với mục tiêu p95 < 1500 ms |

Mỗi chỉ số có n, min, p50, p95, max, mean. Percentile tính theo hạng gần nhất, nên luôn là một giá trị đã thực sự quan sát được.

**Chưa tính:** thời gian ghi âm và phát âm thanh trên trình duyệt, và mạng tới server ở xa. Khi trình bày phải nói rõ điều này.

```bash
# Kiểm tra script (provider giả, như trong CI)
python evals/latency.py

# Số đo thật: chạy từ thư mục repo chính (nơi có .env), sau khi đã bật
# server STT (cổng 8890) và VieNeu theo README, ví dụ bằng run.bat
python evals/latency.py --providers env --mode voice --sessions 3
python evals/latency.py --providers env --mode text --sessions 3
# hoặc: make eval-latency ARGS="--providers env --mode voice"
```

**Tuỳ chọn:**
- `--sessions N`: số phiên, mỗi phiên 8 câu.
- `--warmup K`: bỏ K lượt đầu khỏi thống kê, mặc định 1, để không tính thời gian nạp model.
- `--out DIR`: thư mục ghi kết quả.

**Ở chế độ voice với STT thật:** câu hỏi được đọc thành âm thanh trước bằng TTS đã cấu hình. Bước này không tính giờ. Vì vậy nên bật VieNeu, không dùng TTS giả.

**Kết quả không bao giờ chứa:** nội dung câu hỏi hoặc câu trả lời, âm thanh, token.
