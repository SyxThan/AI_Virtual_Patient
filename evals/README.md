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

## Độ lặp lại của Evaluator (`repeatability.py`, AVP-117)

**Cách đo:** script chấm cùng một transcript K lần (mặc định 5) bằng Evaluator đã cấu hình. Script đi qua đúng pipeline thật: LLM đề xuất mức đạt, rồi code kiểm tra bằng chứng và tính điểm.

**Transcript dùng để chấm:**
- 3 transcript tổng hợp trong `evals/fixtures/repeatability_transcripts.json`: `thorough` (hỏi kỹ), `partial` (hỏi một phần), `minimal` (hỏi rất ít).
- Câu của sinh viên được viết riêng cho bài đo.
- Câu của người mẹ lấy nguyên văn từ `history[].lay_response` và `fallback_lines` của ca bệnh.
- Không có dữ kiện lâm sàng nào được viết mới.

**Các chỉ số:**

| Chỉ số | Nghĩa |
|---|---|
| `identical_all_runs_rate` | Tỉ lệ ô (transcript × tiêu chí) cho cùng một mức ở mọi lần chấm |
| `mean_modal_agreement` | Trung bình tỉ lệ số lần chấm trùng với mức xuất hiện nhiều nhất |
| `max_total_score_range` | Chênh lệch lớn nhất (max − min) của tổng điểm do code tính |
| `evaluator_ms` | Thời gian một lần chấm |

**Giới hạn khi trình bày:**
- Đây là độ **ổn định**, không phải độ **đúng**. Evaluator có thể sai một cách ổn định.
- Độ đồng thuận với giảng viên (Cohen's kappa, mục tiêu ≥ 0.82) cần bộ nhãn do giảng viên chấm, và là script riêng, chưa làm.
- Rubric ca bệnh vẫn ở trạng thái `draft` (ghi trong `case_review_status`).

```bash
python evals/repeatability.py                              # Evaluator giả, kiểm tra script
python evals/repeatability.py --providers env --runs 5     # số đo thật (15 lượt gọi LLM)
python evals/repeatability.py --providers env --only thorough --runs 10
```

## Trang "Minh bạch số liệu" (`publish_summary.py`, AVP-139)

Trang web `/transparency` hiển thị số đo từ file `apps/web/src/data/evals-summary.json`. File này **chỉ** được tạo bằng script dưới đây, không sửa tay.

```bash
python evals/publish_summary.py   # đọc evals/results/, ghi apps/web/src/data/evals-summary.json
```

**Quy tắc của script:**
- Kết quả có `contains_fake_provider` khác `false` không bao giờ được đưa lên.
- Mỗi chỉ số lấy lần đo thật mới nhất, ghi kèm ngày đo, commit, mô hình và tên file nguồn.
- Tỉ lệ "unsupported / 100 lượt" của judge chỉ hiện khi người kiểm đã chấm **xong** mẫu (`--score-audit` cho `complete: true`).
- Chưa có số đo thật thì trang ghi "Chưa có số đo thật" kèm lệnh để đo.

**Quy trình sau mỗi lần đo thật:**
1. Chạy các script đo.
2. Chạy `publish_summary.py`.
3. Commit cả file kết quả trong `evals/results/` lẫn `evals-summary.json` trong cùng một PR.
