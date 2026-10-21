# BẢNG TRA CỨU PHÍM TẮT & HƯỚNG DẪN THAO TÁC (CHEATSHEET)
> **Dành cho:** Kỹ thuật viên gán nhãn 3D (Annotator) & Kiểm duyệt chất lượng (QC)  
> **Khuyên dùng:** In ra dán trước bàn làm việc hoặc mở song song trên màn hình phụ để thao tác bằng tay trái siêu tốc.

---

## 1. BẢNG PHÍM TẮT TAY TRÁI TỐC ĐỘ CAO (SPEEDRUN HOTKEYS)

> [!TIP]
> Tất cả các phím tắt được thiết kế tối ưu cho **bàn tay trái**, không làm gián đoạn tay phải đang cầm chuột điều khiển camera 3D.

### 1.1. Nhóm Xoay Hướng Xe (Heading & Yaw)

| Phím tắt | Thao tác thực hiện | Mô tả chi tiết |
| :---: | :--- | :--- |
| <kbd>F</kbd> | **Flip 180° Frame Hiện Tại** | Đảo chiều mũi tên chỉ hướng xe $180^\circ$ tại frame đang xem. Không làm lệch góc nghiêng Roll/Pitch. |
| <kbd>Shift</kbd> + <kbd>F</kbd> | **Flip 180° Toàn Bộ Track** | Lập tức đảo ngược đầu xe cho **toàn bộ 50–100 frames** của ID đó trong tích tắc. |
| <kbd>V</kbd> + Click chuột | **Căn Hướng Bằng 2 Điểm** | Giữ phím `V`, click điểm Đuôi ➔ click điểm Đầu trên cụm điểm LiDAR để xe xoay thẳng theo vector di chuyển. |

---

### 1.2. Nhóm Chuẩn Hóa Kích Thước (Size & Catalog Presets)

| Phím tắt | Thao tác thực hiện | Kích thước gán ($L \times W \times H$) |
| :---: | :--- | :---: |
| <kbd>1</kbd> | **Gán chuẩn Xe Sedan / Car** | $4.60 \times 1.80 \times 1.45m$ (Kèm bù trừ Ground-Lock Z) |
| <kbd>2</kbd> | **Gán chuẩn Xe SUV / Crossover** | $4.65 \times 1.85 \times 1.68m$ (Kèm bù trừ Ground-Lock Z) |
| <kbd>3</kbd> | **Gán chuẩn Xe Bán Tải (Pickup)** | $5.35 \times 1.90 \times 1.82m$ |
| <kbd>4</kbd> | **Gán chuẩn Xe Van / 16 Chỗ** | $6.20 \times 2.05 \times 2.50m$ |
| <kbd>5</kbd> | **Gán chuẩn Xe Buýt Lớn (Bus 45)**| $12.00 \times 2.50 \times 3.40m$ |
| <kbd>Shift</kbd> + <kbd>S</kbd> | **Sync Frame Này Sang Toàn Track**| Lấy kích thước của frame đang chọn ép cho 100% frame còn lại. |
| <kbd>M</kbd> | **Làm Mịn Kích Thước (Median)** | Tự tính trung vị kích thước của cả track để triệt tiêu độ rung giật. |

---

### 1.3. Nhóm Ghim Mặt Đường & Địa Hình (Terrain & Ground Snap)

| Phím tắt | Thao tác thực hiện | Mô tả chi tiết |
| :---: | :--- | :--- |
| <kbd>G</kbd> | **Ghim Mặt Đường Dốc (Snap Road)** | Tự động bẻ góc chúi đầu (**Pitch**) và nghiêng sườn (**Roll**) khớp với mặt dốc đường; hút đáy xe chạm đất. |
| <kbd>Alt</kbd> + <kbd>G</kbd> | **Chế Độ Vỉa Hè (Curb Offset)** | Nâng cao độ đáy xe $+15cm$ khi xe hoặc người nằm trên mặt vỉa hè. |
| <kbd>H</kbd> | **Đỗ Gác Bánh (Half-on-Curb)** | Tự động nghiêng thân xe khi 2 bánh gác lên vỉa hè và 2 bánh dưới lòng đường. |

---

### 1.4. Nhóm Khởi Tạo Xe Mới Nhanh (Nhánh 2 - Quick Spawn)

| Phím tắt | Thao tác thực hiện | Mô tả chi tiết |
| :---: | :--- | :--- |
| <kbd>C</kbd> + Click | **Spawn Nhanh Xe Con (Car)** | Click vào cụm điểm LiDAR ➔ Sinh ngay 1 xe con chuẩn kích thước ôm sát mặt đất. |
| <kbd>T</kbd> + Click | **Spawn Nhanh Xe Tải (Truck)**| Click vào điểm LiDAR ➔ Sinh ngay 1 xe tải kích thước chuẩn. |
| <kbd>B</kbd> + Click | **Spawn Nhanh Xe Buýt (Bus)** | Click vào điểm LiDAR ➔ Sinh ngay 1 xe buýt kích thước chuẩn. |

---

### 1.5. Nhóm Điều Hướng & Bảng Điều Khiển (Navigation & Inspector)

| Phím tắt | Thao tác thực hiện | Mô tả chi tiết |
| :---: | :--- | :--- |
| <kbd>`</kbd> *(Dấu huyền)* | **Ẩn / Hiện Bảng Inspector** | Đóng/mở bảng danh sách tất cả các frame của chiếc xe đang chọn. |
| <kbd>[</kbd> | **Nhảy Về Frame Lỗi Phía Trước** | Tự động nhảy timeline đến frame bị cảnh báo đỏ (ngược đầu/giật tốc độ). |
| <kbd>]</kbd> | **Nhảy Đến Frame Lỗi Kế Tiếp** | Tìm và nhảy đến frame bất thường tiếp theo trong chuỗi. |
| Click Đúp Dòng Frame | **Nhảy Timeline Tức Thì** | Trên bảng Inspector, click đúp vào dòng nào ➔ CVAT nhảy ngay tới frame đó. |

---

## 2. HƯỚNG DẪN CÀI ĐẶT NHANH SCRIPT TRONG 3 BƯỚC

### Bước 1: Cài tiện ích Tampermonkey trên Chrome
1. Mở trình duyệt Chrome, truy cập Chrome Web Store:  
   👉 [Cài đặt Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
2. Bấm nút **"Thêm vào Chrome"** (Add to Chrome).

### Bước 2: Nạp Script Extension vào Tampermonkey
1. Click vào biểu tượng Tampermonkey ở góc trên bên phải trình duyệt ➔ Chọn **"Create a new script..."** (Tạo script mới).
2. Xóa toàn bộ nội dung mẫu có sẵn.
3. Mở file `dist/cvat-3d-suite.user.js` trong thư mục dự án, copy toàn bộ nội dung và paste vào trình soạn thảo Tampermonkey.
4. Bấm `Ctrl + S` (hoặc `Cmd + S` trên Mac) để Lưu (Save).

### Bước 3: Mở CVAT và Trải Nghiệm
1. Truy cập vào trang web CVAT của bạn (ví dụ: `https://cvat.example.com/...`).
2. Mở một Job 3D Point Cloud bất kỳ.
3. Bạn sẽ thấy thanh công cụ màu đen hiện đại nổi ở góc phải màn hình ➔ **Sẵn sàng gán nhãn siêu tốc!**
