# CVAT 3D Suite - Trợ Lý Gán Nhãn & Căn Chỉnh Point Cloud Realtime 100%

Dự án gồm 2 công cụ chính:
1. **CVAT 3D Suite (Chrome Extension & Tampermonkey Userscript):** Giao diện nổi Floating Panel cao cấp phong cách shadcn/ui hỗ trợ Lật hướng xe $180^\circ$ realtime (Zero-F5), Ghim Mặt Đất & Nền Vỉa Hè (Ground & Curb Snapping), khóa kích thước Catalog xe chuẩn và chuẩn hóa Client UI ID (`#1`, `#2`).
2. **CLI Python Editor (`edit_cuboid.py`):** Script chỉnh sửa cuboid qua REST API dòng lệnh với cơ chế tự động backup.

---

## ⚡ Các Lệnh Kiểm Thử & Đóng Gói (One-Command Test & Build)

### 1. Kiểm thử Toàn Diện Modular UI, Edit Kích Thước (L, W, H) & Best-Fit LiDAR
Lệnh này mở Job 3D trên CVAT, kiểm tra hệ thống 3 Tabs Module (Kích Thước, Hướng Xoay, Ghim Đất), chỉnh sửa $L, W, H$ trực tiếp và Stepper, switch phạm vi (Frame này vs Toàn Track), tính toán Best-Fit xe chuẩn và Toast nổi không nháy:
```bash
npm run test:modular
```
*(Nếu muốn chạy ngầm không hiện cửa sổ, thêm cờ: `npm run test:modular -- --headless`)*

### 2. Kiểm thử Tự Động Fit Box LiDAR & Dropdown Select
```bash
npm run test:autofit
```

### 3. Kiểm thử Tự Động Ghim Mặt Đất & Vỉa Hè (Side & Front View)
```bash
npm run test:ground
```

### 4. Kiểm thử Tự Động Lật Xe Realtime (Phím F - Zero F5)
```bash
npm run test:realtime
```

### 5. Chạy Kiểm Thử Unit Test Hình Học 3D & Catalog (11 Bài Test)
```bash
npm test
```

### 6. Đóng Gói Build Extension & Userscript
```bash
npm run build
```
- **Chrome Extension (Manifest V3 - Main World):** nằm tại thư mục `dist/extension/`
- **Tampermonkey Userscript:** nằm tại file `dist/cvat-3d-suite.user.js`

---

## 🎮 Hệ Thống Phím Tắt Tốc Độ Cao (Speedrun Hotkeys)

| Phím tắt | Thao tác | Mô tả nghiệp vụ |
| :---: | :--- | :--- |
| **`Shift + B`** (hoặc `⇧B`) | **⚡ Tự Fit Box LiDAR** | Quét đám mây điểm LiDAR thực tế, tự ôm khít thân xe và ghim sát mặt đất (khử tán cây). |
| **`F`** | **Lật Xe 180° (Frame này)** | Quay đầu xe $180^\circ$ tức thì trên cả 4 view Three.js (Zero-F5). |
| **`Shift + F`** | **Lật Toàn Bộ Track** | Đảo chiều $180^\circ$ cho xe trên tất cả các frame. |
| **`G`** | **Ghim Mặt Đường** | Đọc tọa độ điểm LiDAR dưới gầm và ghim đáy xe sát mặt đường tại Side & Front View. |
| **`Alt + G`** (hoặc `⌥G`) | **Ghim Nền Vỉa Hè** | Nâng đáy xe lên $+15cm$ khớp mặt bê tông vỉa hè. |
| **`Shift + G`** (hoặc `⇧G`) | **Gác Lề Vỉa Hè (Half-Curb)** | 2 bánh trên vỉa hè, 2 bánh dưới đường (Nghiêng Roll $\approx 4.6^\circ$). |
| **`PageUp`** | **Vi Chỉnh $+1cm$** | Nhích xe lên từng centimet bám sát vệt LiDAR. |
| **`PageDown`** | **Vi Chỉnh $-1cm$** | Nhích xe xuống từng centimet bám sát vệt LiDAR. |
| **`[`** và **`]`** | **Xe Trước / Xe Kế** | Chuyển đổi nhanh giữa các xe `#1`, `#2` có mặt tại frame. |
| **`` ` ``** (dấu huyền) | **Thu Nhỏ / Mở Rộng** | Ẩn hiện nhanh cửa sổ nổi về dạng Mini Pill. |

---

## 🛠️ Hướng Dẫn Cài Đặt Chrome Extension Vào Trình Duyệt

1. Mở Google Chrome và truy cập: `chrome://extensions/`
2. Bật công tắc **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Bấm nút **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn thư mục:
   ```
   <đường_dẫn_dự_án>/dist/extension
   # Hoặc đường dẫn tương đối: ./dist/extension
   ```
5. Mở hoặc tải lại bất kỳ Job 3D nào trên CVAT (ví dụ: `https://cvat.example.com/tasks/1/jobs/1`).
   - Cửa sổ nổi **CVAT 3D Suite** sẽ xuất hiện ngay lập tức ở góc trên bên phải!
   - Thử nghiệm ngay phím **`F`** (Lật xe), **`G`** (Ghim đường), **`Alt+G`** (Ghim vỉa hè)!

---

## 🚗 CLI Python Editor (`edit_cuboid.py`)

Công cụ dòng lệnh cập nhật kích thước 3D Bounding Box (Cuboid) trên CVAT qua REST API.

```bash
# Cập nhật đối tượng #1 trên toàn bộ frames:
python3 edit_cuboid.py -u https://cvat.example.com/tasks/1/jobs/1 --id 1 -l 4.60 -w 1.80 -H 1.45

# Chỉ cập nhật 1 frame cụ thể (ví dụ frame 0):
python3 edit_cuboid.py -u https://cvat.example.com/tasks/1/jobs/1 --id 1 -w 1.80 -H 1.45 -f 0

# Chạy thử nghiệm mô phỏng (không ghi lên server):
python3 edit_cuboid.py -u https://cvat.example.com/tasks/1/jobs/1 --id 1 -l 4.60 -w 1.80 -H 1.45 --dry-run
```
