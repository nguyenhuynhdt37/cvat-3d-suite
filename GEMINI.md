# QUY CHUẨN DỰ ÁN CVAT 3D SUITE (GEMINI.MD)

## I. NGUYÊN TẮC HÌNH HỌC LIDAR & FIT GÓC 2D/3D (BẮT BUỘC)

### 1. Chiều Cao (H) & Ghim Sàn (Ground-Lock)
- **Mặt đáy bám sàn cố định**: Đáy xe luôn bám sàn tại cao độ mặt đất $Z_{\text{ground}}$.
- **Fit nở lên trên**: Khi thay đổi chiều cao $H$ (qua nút stepper $\pm$, nhập tay, hoặc fit tự động): **Mặt đáy tiếp đất giữ nguyên cố định, chiều cao chỉ nở lên phía trên (vươn tới nóc xe $Z_{\text{roof}}$)**.
- **Công thức bù cao độ tâm**:
  $$\Delta Z_{\text{center}} = \frac{H_{\text{new}} - H_{\text{old}}}{2} \cdot \cos(\text{Pitch}) \cdot \cos(\text{Roll})$$
- **Quét Golden Anchor Box**: Khảo sát các frame của track: chạy ghim sàn (gimap) lấy $Z_{\text{ground}}$, tìm đỉnh nóc xe $Z_{\text{roof}}$, tính chiều cao chuẩn $H = Z_{\text{roof}} - Z_{\text{ground}}$ **từ đáy lên đầu**.

### 2. Nút FRONT (Mặt phẳng 2D Y - Z theo phương W)
- **🚨 TUYỆT ĐỐI KHÔNG GHIM ĐẤT**: Khi bấm FRONT, **giữ nguyên 100% cao độ $Z$** (`newZ = cz`), đồng thời giữ nguyên góc nghiêng `Roll` và `Pitch` hiện tại của xe. Tuyệt đối không bao giờ can thiệp kéo $Z$ xuống đất (đã có nút Ghim Đất riêng).
- **Không tự động ghim tâm**: Không lấy trung bình cộng mây điểm để dời tâm một cách mù quáng làm trôi dạt box đã căn ở Top View.
- **Ăn theo phương W**: Ưu tiên chùm point cloud đón tia từ Ego tới làm **Điểm Bao Ngoài Cùng (Boundary Edge)**:
  - Xác định sườn đón tia laser dựa vào mật độ điểm thật: bên nào đón tia từ Ego thì mặt đó có mây điểm dày đặc hơn hẳn sườn khuất.
  - Sườn Trái đón tia: Mép trái box ($+W/2$) áp sát viền ngoài cùng đón tia (phân vị 95% để loại bỏ nhiễu).
    $$\Delta Y = ly_{\text{edge}} - W / 2$$
  - Sườn Phải đón tia: Mép phải box ($-W/2$) áp sát viền ngoài cùng đón tia (phân vị 5% để loại bỏ nhiễu).
    $$\Delta Y = ly_{\text{edge}} + W / 2$$
- Trục dọc $X$ giữ nguyên cố định 100% (`shiftLx = 0`).

### 3. Nút SIDE (Mặt phẳng 2D X - Z theo phương L)
- **🚨 TUYỆT ĐỐI KHÔNG GHIM ĐẤT**: Khi bấm SIDE, **giữ nguyên 100% cao độ $Z$** (`newCenterZ = cz`), đồng thời giữ nguyên góc nghiêng `Roll` và `Pitch` hiện tại của xe. Tuyệt đối không can thiệp kéo $Z$ xuống đất (đã có nút Ghim Đất riêng).
- Nhìn 2D dọc trục $X$, chỉ căn mép cản đón tia (Trước/Sau) theo chiều dọc xe.
- Trục ngang $Y$ giữ nguyên cố định 100% (`shiftLy = 0`).

### 4. Nút TOP (Bao quát 3D)
- **🚨 TUYỆT ĐỐI KHÔNG GHIM ĐẤT**: Khi bấm TOP, **giữ nguyên 100% cao độ $Z$** (`newCenterZ = cz`), đồng thời giữ nguyên góc nghiêng `Roll` và `Pitch` hiện tại của xe.
- Chuyên trách căn góc xoay $Yaw$ theo viền đón tia tổng thể, xoay tại chỗ quanh tâm (`shiftLx = 0`, `shiftLy = 0`).

### 5. Nguyên Tắc Phân Tầng Độ Cao (Height Stratification - Kháng Nhiễu Mặt Đất)
- **Ưu tiên trọng số tầng trên cao (Core Body)**: Các điểm ở tầng trên cao (thân vỏ xe, kính, nóc xe, ngực/hông người, tay lái xe 2 bánh) phản ánh 100% hình dáng chuẩn của vật thể, không bị lẫn điểm mặt đất.
- **Cắt bỏ nhiễu sát sàn (Ground Noise Cut-off)**: Vùng sát mặt đất thường xuyên xuất hiện các chùm tia quét xiên loang rải rác (ground scatter), vạch sơn phản quang, gờ vỉa hè hoặc sỏi đá.
  - **Người đi bộ (Pedestrian)**: Cắt bỏ hoàn toàn điểm $Z < Z_{\text{ground}} + 0.30\text{m}$ khi tính $L, W$ để chống phình to box chân đế. Chặn trần kích thước an toàn $L, W \le 0.85\text{m}$.
  - **Ô tô (Car / Truck / Bus)**: Cắt bỏ điểm $Z < Z_{\text{ground}} + 0.22\text{m}$ khi căn mép cản $X$ và mép sườn $W$.
  - **Xe 2 bánh (Cyclist / Motorcycle)**: Cắt bỏ điểm $Z < Z_{\text{ground}} + 0.25\text{m}$ khi căn mép cản và co giãn độ rộng $W$ ôm tay lái.
  - Các điểm sát đất này **CHỈ** được dùng cho thuật toán ghim sàn ($Z_{\text{ground}}$).

### 6. Bộ Kích Thước L, W, H & Vi Chỉnh Center
- **Dàn đều kích thước**: Chiều dài $L$ và chiều rộng $W$ nới/thu dàn đều ra hai bên từ tâm cố định.
- **Vi chỉnh Center 2D Dàn Đều**: Hỗ trợ các nút vi chỉnh độc lập $\pm 1\text{cm}, \pm 5\text{cm}$ cho Trục Dọc $X$ (Side View - Tiến/Lùi) và Trục Ngang $Y$ (Front View - Trái/Phải).
- **Phạm vi [Toàn Track]**: Khi bật toggle "Toàn Track", mọi dịch chuyển tâm $(\Delta X, \Delta Y)$ hoặc thay đổi kích thước $(L, W, H)$ phải **tịnh tiến dàn đều cho toàn bộ các frame trong track**.
- **Chế độ Quét Golden Anchor**: Khi người dùng bấm nút Quét Best Frame, chạy chế độ `Scan Only` (chỉ điền kết quả vào ô input để người dùng duyệt, không tự ý lưu đè toàn track).

### 7. Chuẩn Căn Chỉnh & Fix Size Cho Người Đi Bộ (Pedestrian)
- **3 Nút 2D Độc Lập**:
  - **TOP (Kháng dính đám đông)**: Áp dụng thuật toán **Cắt thung lũng mật độ (Density Valley Clustering với maxGap = 14cm)** để chém đứt các điểm của người đi cùng/đám đông xung quanh; chỉ căn góc xoay Yaw theo trục thân người mục tiêu tại tâm box, **khóa cứng tâm $X, Y, Z$ và kích thước $L, W, H$**.
  - **SIDE**: Căn mép trước/sau đón tia theo trục dọc $X$, **giữ nguyên 100% cao độ $Z$** (`newCenterZ = cz`, tuyệt đối không auto ghim đất) và bảo toàn $L, W, H$.
  - **FRONT (Ôm sát tia Ego)**: Sườn đón tia laser từ xe Ego ($+W/2$ hoặc $-W/2$) phải **áp sát khít khao viền ngoài cùng đón tia** (Line-of-Sight Boundary Snap), tuyệt đối không lấy trung bình cộng làm thụt mép đón tia; **giữ nguyên 100% cao độ $Z$** (`newCenterZ = cz`) và bảo toàn $L, W, H$.
- **3 Nút Fix Size Tách Biệt**:
  - **Fit Dài (L)**: Co giãn riêng chiều dài $L$ theo mây điểm thân người mục tiêu (kháng đám đông), căn tâm $X$, giữ nguyên $W, H, Z, Y$.
  - **Fit Rộng (W)**: Co giãn riêng chiều rộng $W$ theo mây điểm vai/ngực người mục tiêu (kháng đám đông), căn tâm $Y$, giữ nguyên $L, H, Z, X$.
  - **Fit Cao (H)**: Chuẩn **Ground-Lock**: mặt đáy tiếp đất $Z_{\text{base}}$ giữ nguyên cố định, chiều cao $H$ nở lên đỉnh đầu ($+12\text{cm}$ đệm đầu), giữ nguyên $L, W$ và $XY$.
- **Khóa Thẳng Đứng**: Luôn khóa cứng $\text{Roll} = 0^\circ, \text{Pitch} = 0^\circ$ tuyệt đối cho người đi bộ.

---

## II. QUY CHUẨN GIAO DIỆN (UI/UX)
1. **Clean White / Light Theme**:
   - Nền trắng `rgba(255, 255, 255, 0.98)` hoặc pastel nhã nhặn.
   - Viền xám mỏng `#e4e4e7` / `#e2e8f0`.
   - Text đậm, tương phản cao `#09090b` hoặc `#334155`.
2. **100% Flat SVG Icons 2D**:
   - Tuyệt đối KHÔNG dùng icon 3D, gradient khối, hoặc emoji hệ điều hành (`⚡`, `🚶`, `🚴`, `🔝`, `↔️`, `↕️`, `⚙️`, `💾`, `🔄`, `⟲`, `✕`, v.v.).
   - Mọi icon đều phải dùng SVG thuần phẳng từ `src/ui/icons.ts`.

---

## III. QUY TRÌNH BUILD & RUNTIME
1. **Lệnh build**: `npm run build` (chạy Vite bundle cả Userscript `dist/cvat-3d-suite.user.js` và Chrome Extension `dist/extension/`).
2. **Auto Reload**: Build script tự động reload tab Chrome Extension sau khi hoàn tất.
