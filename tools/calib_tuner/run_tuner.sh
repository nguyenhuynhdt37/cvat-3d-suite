#!/usr/bin/env bash
# Khởi chạy Local Server cho Calibration Tuner Tool
PORT=8080
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== [CVAT CALIBRATION TUNER] Đang khởi động HTTP Server... ==="
echo "Địa chỉ truy cập: http://localhost:${PORT}"
echo "Thư mục phục vụ: ${DIR}"
echo "Bấm Ctrl+C để dừng server."

# Mở trình duyệt mặc định trên macOS nếu có
if [[ "$OSTYPE" == "darwin"* ]]; then
  (sleep 1 && open "http://localhost:${PORT}") &
fi

python3 -m http.server ${PORT} --directory "${DIR}"
