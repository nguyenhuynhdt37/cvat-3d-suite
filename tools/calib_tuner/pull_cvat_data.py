#!/usr/bin/env python3
"""
Script kéo dữ liệu từ CVAT server (Job 105, Task 61)
- Context images (8 camera x 5 frame)
- 3D Annotations (Bounding Box Cuboids)
- Labels danh mục vật thể
"""

import os
import sys
import json
import zipfile
import urllib.request
import urllib.parse
from io import BytesIO

BASE_URL = "https://cvat.itup.io.vn"
JOB_ID = 105
TASK_ID = 61
TOKEN = "51acceec5ad57a4442f2a3c6aa348b8d755a8070"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
FRAMES_DIR = os.path.join(DATA_DIR, "frames")

os.makedirs(FRAMES_DIR, exist_ok=True)

HEADERS = {
    "Authorization": f"Token {TOKEN}",
    "Accept": "*/*",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Origin": BASE_URL,
    "Referer": f"{BASE_URL}/tasks/{TASK_ID}/jobs/{JOB_ID}",
}

def make_request(url, is_json=False):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read()
            if is_json:
                return json.loads(content.decode("utf-8"))
            return content
    except Exception as e:
        print(f"[-] Lỗi khi request {url}: {e}", file=sys.stderr)
        return None

def main():
    print(f"=== [CVAT DATA PULLER] Bắt đầu kéo data từ {BASE_URL} (Job {JOB_ID}) ===")

    # 1. Tải Job Info
    print("[1/4] Đang lấy thông tin Job...")
    job_info = make_request(f"{BASE_URL}/api/jobs/{JOB_ID}", is_json=True)
    if not job_info:
        print("[-] Không thể lấy thông tin job!")
        return

    start_frame = job_info.get("start_frame", 0)
    stop_frame = job_info.get("stop_frame", 4)
    print(f"[+] Job {JOB_ID}: start_frame={start_frame}, stop_frame={stop_frame}")

    # 2. Tải Labels
    print("[2/4] Đang tải danh sách Labels...")
    labels_info = make_request(f"{BASE_URL}/api/labels?task_id={TASK_ID}", is_json=True)
    if labels_info:
        labels_path = os.path.join(DATA_DIR, "labels.json")
        with open(labels_path, "w", encoding="utf-8") as f:
            json.dump(labels_info, f, indent=2, ensure_ascii=False)
        print(f"[+] Đã lưu {len(labels_info.get('results', []))} labels vào {labels_path}")

    # 3. Tải Annotations
    print("[3/4] Đang tải 3D Annotations...")
    anno_info = make_request(f"{BASE_URL}/api/jobs/{JOB_ID}/annotations", is_json=True)
    if anno_info:
        anno_path = os.path.join(DATA_DIR, "annotations.json")
        with open(anno_path, "w", encoding="utf-8") as f:
            json.dump(anno_info, f, indent=2, ensure_ascii=False)
        tracks_count = len(anno_info.get("tracks", []))
        shapes_count = len(anno_info.get("shapes", []))
        print(f"[+] Đã lưu annotations ({tracks_count} tracks, {shapes_count} shapes) vào {anno_path}")

    # 4. Tải Context Images cho từng Frame
    print(f"[4/4] Đang tải Context Images (8 camera) cho các frame {start_frame} -> {stop_frame}...")
    for frame in range(start_frame, stop_frame + 1):
        frame_dir = os.path.join(FRAMES_DIR, f"frame_{frame}")
        os.makedirs(frame_dir, exist_ok=True)

        url = f"{BASE_URL}/api/jobs/{JOB_ID}/data?type=context_image&quality=original&number={frame}"
        print(f"  -> Tải frame {frame}...", end=" ", flush=True)
        zip_bytes = make_request(url)

        if not zip_bytes:
            print("FAILED")
            continue

        try:
            with zipfile.ZipFile(BytesIO(zip_bytes)) as z:
                z.extractall(frame_dir)
                extracted = z.namelist()
                print(f"OK ({len(extracted)} files: {', '.join(extracted[:3])}...)")
        except Exception as e:
            print(f"Lỗi giải nén ZIP: {e}")

    print("\n=== HOÀN TẤT TẢI DỮ LIỆU! ===")
    print(f"Dữ liệu được lưu tại: {DATA_DIR}")

if __name__ == "__main__":
    main()
