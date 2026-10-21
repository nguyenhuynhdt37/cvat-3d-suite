#!/usr/bin/env python3
"""
Tool cập nhật kích thước 3D Cuboid (Bounding Box 3D) cho CVAT.
Hỗ trợ tái sử dụng cho bất kỳ Task / Job / Track ID nào.
Không phụ thuộc thư viện bên ngoài (Zero Dependencies - chỉ dùng thư viện chuẩn Python 3).
"""

import argparse
import datetime
import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple


def load_dotenv(env_path: Optional[str] = None) -> None:
    """Tự động nạp file .env vào os.environ (chuẩn zero-dependency)."""
    if env_path is None:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    if key not in os.environ:
                        os.environ[key] = val
        except Exception:
            pass


load_dotenv()

DEFAULT_USERNAME = os.getenv("CVAT_USERNAME", "")
DEFAULT_PASSWORD = os.getenv("CVAT_PASSWORD", "")
DEFAULT_BASE_URL = os.getenv("CVAT_BASE_URL", "https://cvat.example.com")


def parse_cvat_url(url_or_job_id: str) -> Tuple[str, int]:
    """
    Trích xuất Base URL và Job ID từ URL CVAT hoặc chuỗi Job ID.
    Hỗ trợ các định dạng:
      - https://cvat.example.com/tasks/1259/jobs/1256
      - https://cvat.example.com/jobs/1256
      - 1256
    """
    url_or_job_id = url_or_job_id.strip()
    match = re.search(r"^(https?://[^/]+).*?/jobs/(\d+)", url_or_job_id)
    if match:
        base_url = match.group(1)
        job_id = int(match.group(2))
        return base_url, job_id

    # Nếu chỉ truyền số Job ID
    if url_or_job_id.isdigit():
        return DEFAULT_BASE_URL, int(url_or_job_id)

    raise ValueError(f"Không thể phân tích Job ID từ URL: '{url_or_job_id}'")


def login_cvat(base_url: str, username: str, password: str) -> str:
    """Đăng nhập vào CVAT API và trả về Token."""
    login_url = f"{base_url}/api/auth/login"
    payload = json.dumps({"username": username, "password": password}).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    req = urllib.request.Request(login_url, data=payload, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            token = data.get("key") or data.get("token")
            if not token:
                raise RuntimeError("Đăng nhập thành công nhưng không tìm thấy token trong phản hồi.")
            return str(token)
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Lỗi đăng nhập ({err.code}): {err_body}") from err


def get_job_annotations(base_url: str, job_id: int, token: str) -> Dict[str, Any]:
    """Tải toàn bộ dữ liệu annotations của Job."""
    url = f"{base_url}/api/jobs/{job_id}/annotations/"
    headers = {
        "Authorization": f"Token {token}",
        "Accept": "application/vnd.cvat+json, application/json, */*",
        "User-Agent": "Mozilla/5.0",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Lỗi tải annotations Job {job_id} ({err.code}): {err_body}") from err


def find_target_track(tracks: List[Dict[str, Any]], target_id: int) -> Tuple[Dict[str, Any], str]:
    """
    Tìm track theo:
    1. Database Track ID trùng khớp với target_id.
    2. Nếu không thấy, tìm theo số thứ tự hiển thị trên CVAT UI (1-based index).
    """
    # 1. Tìm theo DB ID
    for t in tracks:
        if t.get("id") == target_id:
            return t, f"Database Track ID: {target_id}"

    # 2. Tìm theo thứ tự UI (1-based)
    ui_index = target_id - 1
    if 0 <= ui_index < len(tracks):
        matched_track = tracks[ui_index]
        return matched_track, f"Thứ tự UI #{target_id} (Database Track ID: {matched_track.get('id')})"

    raise ValueError(f"Không tìm thấy đối tượng với ID = {target_id} (Job hiện có {len(tracks)} tracks).")


def backup_annotations(data: Dict[str, Any], job_id: int, backup_dir: str) -> str:
    """Sao lưu annotations ra file JSON trước khi chỉnh sửa."""
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    file_path = os.path.join(backup_dir, f"job_{job_id}_backup_{timestamp}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return file_path


def update_track_cuboid_dimensions(
    track: Dict[str, Any],
    length: Optional[float],
    width: Optional[float],
    height: Optional[float],
    frame_filter: Optional[int] = None,
) -> int:
    """
    Cập nhật kích thước length (lx), width (ly), height (lz) cho các shapes trong track.
    points trong CVAT 3D cuboid gồm 16 phần tử:
      points[0..2]: center x, y, z
      points[3..5]: rot x, y, z
      points[6]: length
      points[7]: width
      points[8]: height
    """
    updated_count = 0
    shapes = track.get("shapes", [])

    for shape in shapes:
        if shape.get("type") != "cuboid":
            continue

        shape_frame = shape.get("frame")
        if frame_filter is not None and shape_frame != frame_filter:
            continue

        points = list(shape.get("points", []))
        if len(points) < 9:
            continue

        if length is not None:
            points[6] = float(length)
        if width is not None:
            points[7] = float(width)
        if height is not None:
            points[8] = float(height)

        shape["points"] = points
        updated_count += 1

    return updated_count


def patch_annotations(base_url: str, job_id: int, token: str, version: int, updated_track: Dict[str, Any]) -> None:
    """Gửi yêu cầu PATCH cập nhật riêng track được sửa đổi lên CVAT."""
    url = f"{base_url}/api/jobs/{job_id}/annotations/?action=update"
    headers = {
        "Authorization": f"Token {token}",
        "Content-Type": "application/json",
        "Accept": "application/vnd.cvat+json, application/json, */*",
        "User-Agent": "Mozilla/5.0",
    }
    payload = {
        "version": version,
        "tracks": [updated_track],
        "shapes": [],
        "tags": [],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")

    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status not in (200, 201):
                raise RuntimeError(f"Server trả về mã phản hồi không mong muốn: {resp.status}")
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Lỗi khi gửi PATCH đến Job {job_id} ({err.code}): {err_body}") from err


def verify_update(
    base_url: str,
    job_id: int,
    token: str,
    target_track_id: int,
    length: Optional[float],
    width: Optional[float],
    height: Optional[float],
    frame_filter: Optional[int] = None,
) -> bool:
    """Kiểm tra và xác thực dữ liệu trực tiếp từ server sau khi PATCH."""
    fresh_data = get_job_annotations(base_url, job_id, token)
    matched_track = None
    for t in fresh_data.get("tracks", []):
        if t.get("id") == target_track_id:
            matched_track = t
            break

    if not matched_track:
        print(f"❌ CẢNH BÁO: Không tìm thấy Track ID {target_track_id} sau khi cập nhật.")
        return False

    shapes = matched_track.get("shapes", [])
    mismatches = 0
    checked_count = 0

    for s in shapes:
        if s.get("type") != "cuboid":
            continue
        if frame_filter is not None and s.get("frame") != frame_filter:
            continue

        p = s.get("points", [])
        if len(p) < 9:
            continue

        checked_count += 1
        l_cur, w_cur, h_cur = round(p[6], 3), round(p[7], 3), round(p[8], 3)
        if length is not None and abs(l_cur - round(length, 3)) > 0.005:
            mismatches += 1
        if width is not None and abs(w_cur - round(width, 3)) > 0.005:
            mismatches += 1
        if height is not None and abs(h_cur - round(height, 3)) > 0.005:
            mismatches += 1

    if mismatches == 0 and checked_count > 0:
        print(f"✅ XÁC THỰC THÀNH CÔNG: Toàn bộ {checked_count} shapes đều đã khớp chính xác kích thước mới trên server!")
        return True
    else:
        print(f"⚠️ CẢNH BÁO: Có {mismatches}/{checked_count} shapes chưa khớp kích thước mong muốn.")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Công cụ cập nhật kích thước Bounding Box 3D (Cuboid) trên CVAT.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ví dụ sử dụng:
  # Cập nhật đối tượng số 6 trên toàn bộ frames:
  python3 edit_cuboid.py -u https://cvat.example.com/tasks/1/jobs/1 --id 6 -l 4.63 -w 1.85 -H 1.82

  # Chỉ cập nhật frame số 10:
  python3 edit_cuboid.py -u https://cvat.example.com/tasks/1/jobs/1 --id 6 -w 1.85 -H 1.82 -f 10

  # Xem trước mà không ghi lên server (--dry-run):
  python3 edit_cuboid.py -u https://cvat.example.com/tasks/1/jobs/1 --id 6 -l 4.63 -w 1.85 -H 1.82 --dry-run
        """,
    )

    parser.add_argument("-u", "--url", required=False, help="URL của Job hoặc Task trên CVAT (hoặc Job ID)")
    parser.add_argument("--id", type=int, required=False, help="ID của đối tượng (Thứ tự UI #id hoặc Database Track ID)")
    parser.add_argument("-l", "--length", type=float, required=False, help="Chiều dài length (m)")
    parser.add_argument("-w", "--width", type=float, required=False, help="Chiều rộng width (m)")
    parser.add_argument("-H", "--height", type=float, required=False, help="Chiều cao height (m)")
    parser.add_argument("-f", "--frame", type=int, default=None, help="Chỉ định frame cụ thể (mặc định: toàn bộ frames)")
    parser.add_argument("--username", default=DEFAULT_USERNAME, help="Tài khoản CVAT (mặc định lấy từ biến môi trường CVAT_USERNAME)")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="Mật khẩu CVAT (mặc định lấy từ biến môi trường CVAT_PASSWORD)")
    parser.add_argument("--backup-dir", default=os.path.join(os.path.dirname(__file__), "backups"), help="Thư mục lưu backup")
    parser.add_argument("--dry-run", action="store_true", help="Chạy thử nghiệm mà không lưu lên server")

    args = parser.parse_args()

    # Chế độ tương tác nếu thiếu tham số bắt buộc
    url_input = args.url
    if not url_input:
        url_input = input("Nhập URL Job CVAT (ví dụ: https://cvat.example.com/tasks/1/jobs/1): ").strip()
        if not url_input:
            print("Lỗi: URL Job là bắt buộc.")
            sys.exit(1)

    # Kiểm tra username và password
    username = args.username
    if not username:
        username = input("Nhập tài khoản CVAT: ").strip()
        if not username:
            print("Lỗi: Tài khoản CVAT là bắt buộc.")
            sys.exit(1)

    password = args.password
    if not password:
        password = getpass.getpass("Nhập mật khẩu CVAT: ").strip()
        if not password:
            print("Lỗi: Mật khẩu CVAT là bắt buộc.")
            sys.exit(1)

    target_id = args.id
    if target_id is None:
        raw_id = input("Nhập ID đối tượng (UI # hoặc Database Track ID): ").strip()
        if not raw_id.isdigit():
            print("Lỗi: ID phải là số nguyên.")
            sys.exit(1)
        target_id = int(raw_id)

    length = args.length
    width = args.width
    height = args.height

    if length is None and width is None and height is None:
        print("Nhập kích thước cần chỉnh sửa (nhấn Enter để bỏ qua không sửa thuộc tính đó):")
        raw_l = input("  Length (m) [bỏ qua]: ").strip()
        raw_w = input("  Width (m)  [bỏ qua]: ").strip()
        raw_h = input("  Height (m) [bỏ qua]: ").strip()
        length = float(raw_l) if raw_l else None
        width = float(raw_w) if raw_w else None
        height = float(raw_h) if raw_h else None

    if length is None and width is None and height is None:
        print("Lỗi: Cần nhập ít nhất 1 trong 3 kích thước: Length, Width hoặc Height.")
        sys.exit(1)

    # Phân tích URL
    try:
        base_url, job_id = parse_cvat_url(url_input)
    except Exception as e:
        print(f"❌ {e}")
        sys.exit(1)

    print("=" * 60)
    print(f"🔹 Base URL : {base_url}")
    print(f"🔹 Job ID   : {job_id}")
    print(f"🔹 Target ID: {target_id}")
    print(f"🔹 Target   : Length={length}, Width={width}, Height={height}")
    print(f"🔹 Scope    : {'Frame ' + str(args.frame) if args.frame is not None else 'Toàn bộ frames'}")
    print("=" * 60)

    # Đăng nhập
    print("\n[1/5] Đang xác thực với CVAT...")
    try:
        token = login_cvat(base_url, username, password)
        print("✔ Đăng nhập thành công.")
    except Exception as e:
        print(f"❌ Đăng nhập thất bại: {e}")
        sys.exit(1)

    # Tải dữ liệu
    print(f"\n[2/5] Đang tải annotations Job {job_id}...")
    try:
        annot_data = get_job_annotations(base_url, job_id, token)
        tracks = annot_data.get("tracks", [])
        print(f"✔ Đã tải xong: {len(tracks)} tracks tìm thấy.")
    except Exception as e:
        print(f"❌ Lỗi: {e}")
        sys.exit(1)

    # Tìm đối tượng
    print("\n[3/5] Đang tìm đối tượng mục tiêu...")
    try:
        matched_track, desc = find_target_track(tracks, target_id)
        db_track_id = matched_track.get("id")
        total_shapes = len(matched_track.get("shapes", []))
        print(f"✔ Tìm thấy: {desc} (Tổng {total_shapes} shapes)")
    except Exception as e:
        print(f"❌ Lỗi: {e}")
        sys.exit(1)

    # Sao lưu an toàn
    print("\n[4/5] Tạo bản sao lưu an toàn...")
    backup_file = backup_annotations(annot_data, job_id, args.backup_dir)
    print(f"✔ Đã lưu bản sao lưu tại: {backup_file}")

    # Áp dụng cập nhật
    updated_track = json.loads(json.dumps(matched_track))
    count = update_track_cuboid_dimensions(updated_track, length, width, height, args.frame)
    print(f"✔ Đã cập nhật {count} shapes trong bộ nhớ cục bộ.")

    if args.dry_run:
        print("\n[DRY RUN] Đã hoàn thành mô phỏng. Không ghi dữ liệu lên server do có cờ --dry-run.")
        sys.exit(0)

    # Gửi PATCH
    print(f"\n[5/5] Gửi PATCH cập nhật Track {db_track_id} lên server...")
    try:
        version = annot_data.get("version", 0)
        patch_annotations(base_url, job_id, token, version, updated_track)
        print("✔ Gửi cập nhật thành công!")
    except Exception as e:
        print(f"❌ Lỗi khi PATCH: {e}")
        sys.exit(1)

    # Xác thực
    print("\n[XÁC THỰC] Kiểm tra lại kết quả từ server...")
    verify_update(base_url, job_id, token, db_track_id, length, width, height, args.frame)
    print("\n Hoàn tất!")


if __name__ == "__main__":
    main()
