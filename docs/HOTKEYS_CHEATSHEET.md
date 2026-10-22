# BẢNG TRA CỨU PHÍM TẮT & HƯỚNG DẪN THAO TÁC (CHEATSHEET)
> **Dành cho:** Kỹ thuật viên gán nhãn 3D (Annotator) & Kiểm duyệt chất lượng (QC)  
> **Khuyên dùng:** In ra dán trước bàn làm việc hoặc mở song song trên màn hình phụ để thao tác bằng tay trái siêu tốc.

---

## 1. BẢNG PHÍM TẮT TAY TRÁI TỐC ĐỘ CAO (SPEEDRUN HOTKEYS)

> [!TIP]
> Tất cả các phím tắt được thiết kế tối ưu cho **bàn tay trái**, không làm gián đoạn tay phải đang cầm chuột điều khiển camera 3D.

### 1.1. Nhóm Căn Chỉnh 3 Chiều & 1-Click Smart Fit

| Phím tắt | Thao tác thực hiện | Mô tả chi tiết |
| :---: | :--- | :--- |
| <kbd>1</kbd> hoặc <kbd>T</kbd> | **Căn TOP (Yaw & Nóc)** | Căn góc xoay Yaw theo viền đón tia tổng thể, khóa cứng tâm $X, Y, Z$ và kích thước (kháng dính đám đông). |
| <kbd>2</kbd> | **Căn SIDE (Cản Dọc X)** | Căn cản trước/sau đón tia theo trục dọc $X$. Giữ nguyên $100\%$ cao độ $Z$, không tự động ghim đất. |
| <kbd>3</kbd> | **Căn FRONT (Sườn Ngang W/Y)** | Sườn đón tia laser áp sát viền ngoài cùng đón tia. Giữ nguyên $100\%$ cao độ $Z$. |
| <kbd>Space</kbd> *(Phím cách)* | **1-Click Smart Fit (ALL)** | Chạy chu trình fit toàn diện: **TOP $\rightarrow$ SIDE $\rightarrow$ FRONT** hoàn chỉnh cho đối tượng đang chọn chỉ trong 1 nốt nhạc! |

---

### 1.2. Nhóm Xoay Hướng Xe & Làn Đường 3D (Heading, Yaw & Lane)

| Phím tắt | Thao tác thực hiện | Mô tả chi tiết |
| :---: | :--- | :--- |
| <kbd>L</kbd> | **Căn Làn Đường 3D (LiDAR Lane)** | Quét vạch sơn phản quang 3D dưới lòng đường, nắn góc Yaw song song tuyệt đối với tim đường. Tự động nhận diện xuôi/ngược chiều. |
| <kbd>F</kbd> | **Flip 180° Frame Hiện Tại** | Đảo chiều mũi tên chỉ hướng xe $180^\circ$ tại frame đang xem. Không làm lệch góc nghiêng Roll/Pitch. |
| <kbd>Shift</kbd> + <kbd>F</kbd> | **Flip 180° Toàn Bộ Track** | Lập tức đảo ngược đầu xe cho **toàn bộ các frame** của ID đó trong tích tắc. |
| <kbd>Q</kbd> / <kbd>E</kbd> | **Vi chỉnh Xoay Yaw $\pm 1^\circ$** | <kbd>Q</kbd>: Xoay trái $-1^\circ$ \| <kbd>E</kbd>: Xoay phải $+1^\circ$ quanh tâm xe. |
| <kbd>Shift</kbd> + <kbd>Q</kbd> / <kbd>E</kbd> | **Xoay Yaw Nhanh $\pm 5^\circ$** | Xoay góc lớn $-5^\circ$ hoặc $+5^\circ$ để nắn nhanh hướng xe. |

---

### 1.3. Nhóm Ghim Mặt Đường & Địa Hình (Terrain & Ground Snap)

| Phím tắt | Thao tác thực hiện | Mô tả chi tiết |
| :---: | :--- | :--- |
| <kbd>G</kbd> | **Ghim Mặt Đường (Road Snap)** | Đáy xe chạm sát mặt đường chuẩn xác 100%, khóa Roll $0^\circ$. |
| <kbd>Shift</kbd> + <kbd>G</kbd> | **Ghim Đất Toàn Bộ Track** | Duyệt và ghim toàn bộ các frame của Track hiện tại xuống mặt đường. |
| <kbd>Alt</kbd> + <kbd>G</kbd> | **Chế Độ Vỉa Hè (Curb Offset)** | Nâng cao độ đáy xe $+15\text{cm}$ khi xe hoặc người nằm trên mặt vỉa hè. |
| <kbd>H</kbd> | **Đỗ Gác Bánh (Half-on-Curb)** | Tự động tính góc nghiêng thân xe (Roll) khi 2 bánh gác lên vỉa hè và 2 bánh dưới lòng đường. |
| <kbd>Alt</kbd> + <kbd>R</kbd> | **Reset Dốc Phẳng 0°** | Trả lại góc nghiêng Roll = $0^\circ$ và Pitch = $0^\circ$ phẳng hoàn toàn. |

---

### 1.4. Nhóm Chuyên Biệt Cho Người Đi Bộ & Xe 2 Bánh

| Phím tắt | Thao tác thực hiện | Mô tả chi tiết |
| :---: | :--- | :--- |
| <kbd>P</kbd> | **Fit Người Đi Bộ Toàn Diện** | Khóa đứng $0^\circ$, bù đỉnh đầu $+12\text{cm}$, co giãn L, W ôm khít cơ thể, chém đứt đám đông bên cạnh. |
| <kbd>Shift</kbd> + <kbd>P</kbd> | **Fix Cao H Người (Ground-Lock)**| Đáy tiếp đất giữ nguyên cố định, chiều cao nở lên đỉnh đầu $+12\text{cm}$. |
| <kbd>C</kbd> | **Fit Xe 2 Bánh Toàn Diện** | Chu trình TOP $\rightarrow$ SIDE $\rightarrow$ FRONT cho Cyclist, khóa cứng 100% chiều dài $L$. |
| <kbd>Shift</kbd> + <kbd>C</kbd> | **Fit Rộng W (Bắt Gương Xe)** | Đo sườn ôm trọn gương chiếu hậu và tay lái, đệm $+5\text{cm}$ mỗi bên. |

---

### 1.5. Nhóm Vi Chỉnh Kích Thước (Stepper L, W, H) & Catalog

| Phím tắt | Thao tác thực hiện | Mô tả chi tiết |
| :---: | :--- | :--- |
| <kbd>Shift</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | **Tăng / Giảm Chiều Dài L ($\pm 10\text{cm}$)** | Nới / thu dàn đều 2 đầu cản xe từ tâm cố định. |
| <kbd>Shift</kbd> + <kbd>→</kbd> / <kbd>←</kbd> | **Tăng / Giảm Chiều Rộng W ($\pm 10\text{cm}$)**| Nới / thu dàn đều 2 bên sườn xe từ tâm cố định. |
| <kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | **Tăng / Giảm Chiều Cao H ($\pm 5\text{cm}$)** | Chuẩn Ground-Lock: Đáy giữ nguyên cố định, nở/thu ở đỉnh nóc xe. |
| <kbd>B</kbd> | **Khớp Chuẩn Catalog** | Nhận diện dòng xe (Sedan/SUV/Bus...) và gán kích thước chuẩn catalog tức thì. |

---

### 1.6. Nhóm Điều Hướng & Quản Lý Track

| Phím tắt | Thao tác thực hiện | Mô tả chi tiết |
| :---: | :--- | :--- |
| <kbd>[</kbd> | **Xe Liền Trước (Prev Track)** | Chuyển vùng chọn sang xe phía trước trong danh sách. |
| <kbd>]</kbd> | **Xe Kế Tiếp (Next Track)** | Chuyển vùng chọn sang xe tiếp theo. |
| <kbd>Tab</kbd> hoặc <kbd>X</kbd> | **Đổi Phạm Vi (Scope Toggle)** | Bật/tắt chuyển đổi: **Chỉ Frame Này** $\longleftrightarrow$ **Toàn Bộ Track**. |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | **Hoàn Tác (Pre / Undo)** | Khôi phục 100% snapshot trạng thái trước đó (vị trí, góc xoay, kích thước). |
| <kbd>Shift</kbd> + <kbd>O</kbd> | **Outside Toàn Track** | Đánh dấu Outside (ẩn) toàn bộ các frame của Track này. |
| <kbd>`</kbd> *(Dấu huyền)* | **Ẩn / Hiện Panel (Minimize)** | Thu nhỏ bảng điều khiển thành viên thuốc mini ở góc màn hình. |
| <kbd>Shift</kbd> + <kbd>M</kbd> | **Fullscreen Track Studio** | Mở bảng ma trận toàn màn hình duyệt và chỉnh sửa toàn bộ các frame của Track. |
| <kbd>PageUp</kbd> / <kbd>PageDown</kbd> | **Vi chỉnh Z $\pm 1\text{cm}$** | Nâng lên $+1\text{cm}$ hoặc hạ xuống $-1\text{cm}$. |
