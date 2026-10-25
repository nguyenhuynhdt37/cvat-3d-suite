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

### 8. Chuẩn Ghim Mặt Đất: Tham Chiếu Ego Road Z & Căn Dốc Front Roll 2 Mép Biên
- **Mốc Mặt Đường Chuẩn của Xe Ego ($Z_{\text{ego\_road}}$)**:
  - Tự động trích xuất $Z_{\text{ego\_road}}$ từ đám mây điểm mặt đường quanh vùng xe Ego (bán kính $1.2\text{m} \sim 6.0\text{m}$).
  - **Chống Lún Âm Đất**: Đối với các xe ở xa, ít điểm (< 6 điểm) hoặc bị che khuất không có điểm mặt đất dưới gầm: Đáy box được neo chuẩn theo mốc $Z_{\text{ego\_road}}$, khóa cứng $\text{Roll} = 0^\circ, \text{Pitch} = 0^\circ$, loại bỏ 100% tình trạng box rơi tự do xuống âm đất.
  - **Nhận Diện Nền Vỉa Hè Chuẩn**: Khi mây điểm mặt đất dưới xe cao hơn $Z_{\text{ego\_road}}$ từ $+8\text{cm} \sim +35\text{cm}$: Xác nhận xe đỗ trên vỉa hè (`isCurbGround = true`), ghim đáy box bám sát mặt vỉa hè thực tế, không kéo tụt xuống lòng đường Ego.
- **Căn Góc Dốc Ngang Front View (Roll) Theo 2 Đầu Mép Biên 0–10% & 90–100%**:
  - Dải 0–10% (mép phải) và 90–100% (mép trái) theo trục ngang $Y$ của object:
    - Nếu cả 2 đầu mép đều có điểm tiếp đất tin cậy ($\ge 2$ điểm mỗi bên): Khử thành phần dốc dọc Pitch, tính độ dốc ngang $\text{Roll} = \arctan\left(\frac{Z_{\text{left}} - Z_{\text{right}}}{\text{spanY}}\right)$ và đặt tâm $c_0 = \frac{Z_{\text{left}} + Z_{\text{right}}}{2}$ để 2 đầu mép đáy của box cách đều mặt đường dốc.
    - Nếu ít điểm hoặc không check được điểm mặt đường ở 1 trong 2 đầu (hoặc cả 2 đầu): **BẮT BUỘC KHÓA CỨNG Roll = 0° (0 độ)** phẳng hoàn toàn, tuyệt đối không đoán mò làm nghiêng vẹo box!

### 9. Chuẩn Tự Ôm Điểm Gần Ở Xa, Giảm Trọng Số Chân & Kháng Ghosting (Người Đi Bộ & Xe 2 Bánh)
- **Tự thích ứng theo mật độ điểm (Box ít điểm ở xa)**:
  - Khi box có ít điểm ($N \le 12$ điểm): Phân kỳ tia LiDAR ở xa làm các điểm thưa hơn. Tự động nới `maxGap = 0.25m` (Người) và `0.28m` (Xe 2 bánh), bắt trọn 100% biên cực trị ($min \to max$) không qua phân vị loại bỏ điểm để box không bao giờ bị teo nhỏ hoặc lệch tâm.
- **Giảm trọng số tầng chân & bánh xe sát đất (Foot / Wheel Noise Protection)**:
  - Tầng thân chính ($Z \ge Z_{\text{ground}} + 0.30\text{m}$ cho Người; $Z \ge Z_{\text{ground}} + 0.25\text{m}$ cho Xe 2 bánh): Chiếm 100% trọng số hình dáng khi Fit Size.
  - Tầng sát chân/lốp ($Z_{\text{ground}} + 0.08\text{m} \le Z < Z_{\text{ground}} + 0.30\text{m}$): Khi Fit Size chỉ thu nạp khi tầng thân $< 8$ điểm.
- **Kháng hiện tượng bóng ma Ghosting (Motion Smear)**:
  - Khóa trần kích thước vật lý an toàn: Người đi bộ ($L \le 0.78\text{m}, W \le 0.68\text{m}$); Xe 2 bánh ($W \le 0.85\text{m}$).
  - Khi phát hiện vệt kéo dài vượt trần: Hệ thống khóa chặt trần kích thước và tự động bắt cản/sườn đón tia từ xe Ego (vị trí thân thật của vật thể tại frame hiện tại), gạt bỏ hoàn toàn phần đuôi bóng ma trôi dạt phía sau.

### 10. Giảm Cắt Nhiễu Biên (SIDE & FRONT) & Tinh Chỉnh Đệm Kích Thước Gọn Gàng
- **Nút SIDE & FRONT Không Cắt Mất Curpoint**:
  - Không lọc nhiễu quá gắt làm mất các điểm biên đón tia (bàn chân, cẳng chân, lốp xe, gương chiếu hậu, tay lái).
  - Thu nạp điểm sát chân/lốp xuống tới $Z_{\text{ground}} + 0.02\text{m}$, dùng `maxGapLx = 0.38m` (Xe 2 bánh) / `0.32m` (Người) và `maxGapLy = 0.35m` (Xe 2 bánh) / `0.30m` (Người) để nối thông bánh xe và gương vào thân.
  - Phân vị biên chỉ loại bỏ tối đa 1% nếu $\ge 25$ điểm.
- **Hạ Đệm Fit Cao & Fit Rộng (Tránh Box Phình To & Cao Lêu Nghêu)**:
  - **Fit Cao (H)**: Hạ đệm nóc từ $+12\text{cm} \sim +15\text{cm}$ xuống mức gọn gàng chuẩn **$+5\text{cm}$** cho cả Người đi bộ và Xe 2 bánh.
  - **Fit Rộng (W)**: Xe 2 bánh đệm nhẹ $+6\text{cm}$ (+3cm mỗi bên, trần $W \le 0.85\text{m}$); Người đi bộ đệm nhẹ $+4\text{cm}$ (+2cm mỗi bên, trần $W \le 0.68\text{m}$).
  - **Fit Dài (L)**: Người đi bộ đệm nhẹ $+5\text{cm}$ (trần $L \le 0.78\text{m}$).

### 11. Ghim Đất Toàn Track & Căn Xe 2 Bánh Mất Bánh (Rider 42% Geometry)
- **Nút Riêng "Ghim Đất Toàn Track"**:
  - Nút riêng biệt trên `FloatingPanel` cạnh thao tác nhanh: duyệt và ghim toàn bộ các frame thuộc Track ID hiện tại xuống mặt đường hoặc vỉa hè theo độ chênh $\Delta Z$ và góc dốc mặt đường.
  - Hỗ trợ Undo/Pre khôi phục 100% snapshot toàn track.
- **Quy Tắc Người Lái Xe 2 Bánh (Rider 42% Geometry)**:
  - Thân người lái xe ở tầng cao ($Z \ge Z_{\text{ground}} + 0.65\text{m}$) ngồi cách cản trước khoảng $\approx 42\%$ chiều dài xe ($lx_{\text{rider}} \approx +0.08 \cdot L$).
  - **Mất bánh trước** ($dist_{\text{front}} < 0.28 \cdot L$): Tự động phóng mép cản trước ra $lx_{\text{rider}} + 0.42 \cdot L$, bám cản sau thật đón tia.
  - **Mất bánh sau** ($dist_{\text{rear}} < 0.38 \cdot L$): Tự động phóng mép cản sau về $lx_{\text{rider}} - 0.58 \cdot L$, bám cản trước thật đón tia.
  - **Mất cả 2 bánh** (chỉ có người lái): Tự động định vị tâm xe tại $lx_{\text{rider}} - 0.08 \cdot L$.

### 12. Căn Yaw Theo Vạch Kẻ Làn Đường 3D (LiDAR Intensity Lane Snap)
- **Độc lập camera, kháng méo hình ảnh**: Tận dụng kênh cường độ phản xạ `intensity` của mây điểm LiDAR (vạch sơn nhiệt phản quang phản xạ mạnh gấp 3-5 lần nhựa đường) để trích xuất tim làn 3D nguyên bản, không bị ảnh hưởng bởi ống kính camera méo góc rộng/mắt cá của Vin.
- **Vùng khảo sát mặt đường quanh xe**:
  - Trích xuất các điểm sát mặt đất $Z \in [Z_{\text{ground}} - 0.15\text{m}, Z_{\text{ground}} + 0.18\text{m}]$ trong phạm vi dọc $X \in [-12\text{m}, 12\text{m}]$ và ngang $Y \in [-4.5\text{m}, 4.5\text{m}]$ quanh xe.
  - Phân vị động trích xuất top 15% điểm có `intensity` cao nhất đại diện cho vạch sơn phản quang.
- **RANSAC 2D Line Fitting & PCA Hồi Quy**:
  - Thuật toán RANSAC 2D tìm cụm vạch kẻ thẳng hàng với ngưỡng khoảng cách $12\text{cm}$.
  - Hồi quy trực giao PCA trên tập inliers để xác định chính xác vector hướng của vạch làn $\vec{v} = (v_x, v_y)$.
- **Đồng pha hướng xe & Chặn an toàn (Guardrail)**:
  - Khóa hướng xuôi chiều: nếu $\vec{v} \cdot \vec{d}_{\text{xe}} < 0$ thì đảo chiều $\vec{v} \leftarrow -\vec{v}$.
  - Chặn lệch góc an toàn: Nếu góc lệch giữa xe và vạch sơn $|\Delta\psi| > 35^\circ$ (xe đang rẽ cua góc vuông hoặc đổi làn gắt), hệ thống tự động kích hoạt **Fallback an toàn**: giữ nguyên 100% góc Yaw ban đầu, không bẻ vẹo xe.
- **Bảo toàn 100% công thức cũ**:
  - Chỉ can thiệp duy nhất góc xoay Yaw $\psi$.
  - Khóa cứng 100% vị trí tâm $X, Y, Z$, kích thước $L, W, H$, và góc dốc nghiêng $\text{Roll}, \text{Pitch}$.

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

---

## IV. BỘ QUY CHUẨN HIỆU NĂNG 60 FPS & EVENT-DRIVEN SYNC (ZERO-LAG ARCHITECTURE)

### 1. Phân Lập Tuyệt Đối: Camera Orbit/Pan vs Box Transform
- **Camera Navigation Guard**: Khi người dùng nhấn giữ chuột để xoay góc nhìn 3D (Perspective Orbit) hoặc di chuyển góc nhìn 2D (Pan), vị trí thế giới của mây điểm và các box không thay đổi $\rightarrow$ **TUYỆT ĐỐI KHÔNG CHẠY LẠI HÀM TÔ MÀU MÂY ĐIỂM (`applyPointCloudColorizationInMainWorld`)**.
- **Bộ lọc Transform $O(1)$ (`isTargetBoxTransforming`)**:
  - Chỉ kiểm tra duy nhất đối tượng đang active (Active Track).
  - Khử nhiễu các trục cố định của Camera 2D trực giao (Top View chỉ kiểm tra $X, Y$; Side View chỉ kiểm tra $X, Z$; Front View chỉ kiểm tra $Y, Z$) để triệt tiêu 100% tình trạng False-Positive kích hoạt tô màu khi xoay camera.
  - Kiểm tra đầy đủ cả 3 thao tác: Dịch chuyển vị trí ($X, Y, Z$), Thay đổi góc xoay ($Yaw$) và Co giãn kích thước ($L, W, H$).

### 2. Anti-Loop: Chống Bão Re-Dispatch Redux Khi Focus Đối Tượng
- Khi annotator click chọn đối tượng trên Canvas hoặc Sidebar: Redux Store của CVAT đã nắm giữ trạng thái `activatedStateClientID`.
- **Nguyên tắc Anti-Loop**: Nếu đối tượng đã active trên Redux/Canvas, tool **chỉ ghi nhận và focus**, tuyệt đối **không dispatch ngược lại action `ACTIVATE_OBJECT` vào Redux**, ngăn chặn triệt để bão re-render toàn bộ DOM Sidebar và component con của CVAT.
- **Khử Duplicate Events**: Áp dụng guard `lastDispatchedActiveId` để đảm bảo mỗi lượt chọn đối tượng chỉ phát ra đúng 1 event duy nhất sang UI panel trong $< 0.2\text{ms}$.

### 3. Kiến Trúc Thuần Event-Driven (Cấm Polling `setInterval`)
- **Loại bỏ hoàn toàn vòng lặp Polling `setInterval`**: Không dùng `setInterval(..., 400ms)` để query DOM hoặc quét lại danh sách track.
- **Kích hoạt theo sự kiện**: Chỉ cập nhật danh sách xe và frame khi nhận tín hiệu từ Redux / CustomEvents (`CVAT_EXT_RES_FRAME_CHANGED`, `CVAT_EXT_RES_FRAME_TRACKS_DIRTY`, `CVAT_EXT_RES_OBJECT_ACTIVATED`), giải phóng 100% CPU khi hệ thống rảnh rỗi.

### 4. Highlight DOM Bằng $O(1)$ Direct Class Swap
- Tuyệt đối không dùng `document.querySelectorAll` duyệt hàng trăm node Sidebar để xóa class active.
- Sử dụng trực tiếp class swap trên phần tử DOM mục tiêu qua `syncSidebarItemHighlight(id)`.

### 5. Tối Ưu Hóa Sâu Tầng Nền Tảng CVAT (Native Engine Acceleration)
- **CSS Virtualization cho Sidebar CVAT**: Áp dụng `content-visibility: auto` và `contain-intrinsic-size` cho danh sách `.cvat-objects-sidebar-state-item` để Chromium ngắt render 85% phần tử ngoài viewport, giảm ngay 70% CPU Layout/Repaint.
- **Hardware Compositing Layer Isolation**: Đẩy 4 container canvas Three.js lên GPU Texture Surface độc lập qua `transform: translateZ(0); will-change: transform; isolation: isolate;` nhằm triệt tiêu repaint lây lan khi UI xung quanh thay đổi.
- **Raycasting Guard trên Mây Điểm**: Gán `ptsObj.raycast = () => {}` trên đối tượng `THREE.Points` 305.000 điểm để vô hiệu hóa việc duyệt va chạm đỉnh mây điểm khi di chuột, giải phóng 100% hiện tượng khựng chuột vi mô (Micro-stutter).

---

## V. NGUYÊN TẮC THIẾT KẾ: TÍNH THỰC DỤNG & HIỆU NĂNG TỐI THƯỢNG (UTILITY & ZERO-BLOAT FIRST)

### 1. Bộ Lọc Giá Trị Thực Tế (Adoption & Utility Filter)
- Trước khi thêm bất kỳ tính năng, nút bấm, chế độ hay thuật toán mới nào, **BẮT BUỘC** phải trả lời 2 câu hỏi:
  1. **Ai sẽ dùng chức năng này?** Tần suất sử dụng trong ca làm việc thực tế là bao nhiêu (thường xuyên mỗi frame, hay chỉ thỉnh thoảng)?
  2. **Giá trị thực tế đem lại là gì?** Nó có trực tiếp giúp annotator gán nhãn nhanh hơn hoặc chính xác hơn không, hay chỉ làm rối rắm giao diện và phình to codebase?

### 2. Kỷ Luật Hiệu Năng Chi Phí Bằng Không (Zero-Performance-Cost Guard)
- Mọi tính năng mới **TUYỆT ĐỐI KHÔNG ĐƯỢC ĐÁNH ĐỔI HIỆU NĂNG 60 FPS**:
  - Không được làm tăng thời gian xử lý khung hình (Frame-Time) vượt quá ngưỡng $16.6\text{ms}$.
  - Không được cấp phát rác liên tục trên heap gây nghẽn Garbage Collection.
  - Không được chạy ngầm vô điều kiện trên CPU Main Thread.
- **Quy tắc đào thải**: Nếu một chức năng ít khi dùng hoặc chỉ phục vụ trường hợp hiếm gặp mà lại tiêu tốn CPU/GPU/RAM hoặc làm phức tạp luồng render $\rightarrow$ **DỨT KHOÁT LOẠI BỎ hoặc MẶC ĐỊNH TẮT**, ưu tiên số 1 luôn là tốc độ phản hồi tức thì và sự mượt mà tối đa của hệ thống!


