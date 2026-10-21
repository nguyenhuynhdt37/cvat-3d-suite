# QUY CHUẨN KÍCH THƯỚC XE THỰC TẾ: 3D VEHICLE CATALOG
> **Tiêu chuẩn áp dụng:** Dữ liệu gán nhãn 3D LiDAR/Point Cloud cho xe tự hành (Autonomous Driving Benchmark: KITTI, nuScenes, Waymo Open Dataset).  
> **Đơn vị đo:** Mét ($m$)  
> **Dung sai nghiệm thu cho phép:** $\pm 0.05m$ ($\pm 5cm$) đối với xe con; $\pm 0.10m$ ($\pm 10cm$) đối với xe tải lớn và xe buýt.

---

## 1. BẢNG DANH MỤC KÍCH THƯỚC CHUẨN (STANDARD DIMENSIONS)

### 1.1. Nhóm Xe Con & Đa Dụng (Passenger Cars & SUVs)

| Phân hạng xe (Class) | Chiều dài ($L$) | Chiều rộng ($W$) | Chiều cao ($H$) | Mẫu xe thực tế tham chiếu | Ghi chú đặc trưng nhận diện |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Sedan Hạng B / C** *(Phổ biến nhất)* | **$4.60m$** | **$1.80m$** | **$1.45m$** | Toyota Vios, Camry, Hyundai Accent, Honda Civic, Tesla Model 3 | Đầu xe dài, cốp sau tách biệt, mui thấp lướt gió. |
| **Hatchback Đô Thị** | **$4.00m$** | **$1.75m$** | **$1.50m$** | Kia Morning, Hyundai i10, Toyota Yaris | Đuôi xe cụt thẳng đứng, chiều dài ngắn hơn Sedan. |
| **Crossover / Compact SUV** | **$4.65m$** | **$1.85m$** | **$1.68m$** | Mazda CX-5, Honda CR-V, Hyundai Tucson, Tesla Model Y | Gầm cao hơn Sedan khoảng $15 \sim 20cm$, nóc xe cao. |
| **SUV Cỡ Lớn (Full-size SUV)** | **$4.95m$** | **$1.95m$** | **$1.85m$** | Toyota Land Cruiser, Ford Explorer, Lexus LX600 | Kích thước đồ sộ, nóc xe cao ngang tầm ngực người lớn. |
| **Xe Bán Tải (Pickup Truck)** | **$5.35m$** | **$1.90m$** | **$1.82m$** | Ford Ranger, Toyota Hilux, Mitsubishi Triton | Thùng hàng hở phía sau chiếm $1/3$ chiều dài xe. |
| **Bán Tải Cỡ Lớn (Mỹ)** | **$5.90m$** | **$2.05m$** | **$1.95m$** | Ford F-150, RAM 1500, Chevrolet Silverado | Rất dài và rộng, thường gặp trong các tập dữ liệu tại Mỹ. |

---

### 1.2. Nhóm Xe Chở Khách & Xe Tải (Buses & Commercial Trucks)

| Phân hạng xe (Class) | Chiều dài ($L$) | Chiều rộng ($W$) | Chiều cao ($H$) | Mẫu xe thực tế tham chiếu | Ghi chú đặc trưng nhận diện |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Minivan / MPV Gia Đình** | **$4.85m$** | **$1.85m$** | **$1.75m$** | Mitsubishi Xpander, Toyota Innova, Kia Carnival | Dáng thuôn dài, chở 7–8 người. |
| **Xe Khách Nhỏ (Van 16 Chỗ)** | **$6.20m$** | **$2.05m$** | **$2.50m$** | Ford Transit, Hyundai Solati | Đầu xe ngắn, thân xe vuông vức hình hộp chữ nhật. |
| **Xe Buýt Trung Bình (29 Chỗ)**| **$7.60m$** | **$2.30m$** | **$3.10m$** | Hyundai County, Thaco Meadow | Thân xe dài gấp rưỡi xe con, nóc xe rất cao. |
| **Xe Buýt Lớn (45 Chỗ / BRT)** | **$12.00m$**| **$2.50m$** | **$3.40m$** | Xe buýt công cộng nội đô, Hyundai Universe | Chiều dài chuẩn quốc tế 12 mét, thành xe phẳng lì. |
| **Xe Tải Nhẹ (Dưới 3.5 Tấn)** | **$5.20m$** | **$1.85m$** | **$2.40m$** | Kia K200, Isuzu QKR, Hyundai Porter | Đầu cabin lật, thùng kín hoặc phủ bạt phía sau. |
| **Xe Tải Trung / Nặng (3–4 Chân)**| **$9.50m$** | **$2.50m$** | **$3.60m$** | Hino 500, Isuzu Giga, Dongfeng | Khung gầm cao, thường có 3 đến 4 trục bánh xe. |
| **Đầu Kéo Container (Có Rơ-moóc)**| **$16.50m$**| **$2.50m$** | **$4.00m$** | Xe đầu kéo kéo thùng container 40 feet | *Lưu ý:* Phải tách làm 2 box riêng (Đầu kéo & Rơ-moóc). |

---

### 1.3. Nhóm Phương Tiện 2 Bánh & Người Đi Bộ (Vulnerable Road Users - VRU)

| Phân hạng (Class) | Chiều dài ($L$) | Chiều rộng ($W$) | Chiều cao ($H$) | Tham chiếu thực tế | Ghi chú quy tắc gán nhãn |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Xe Máy Phổ Thông (Bao gồm người lái)** | **$1.90m$** | **$0.80m$** | **$1.45m$** | Honda Wave, Vision, Sirius | Box 3D bao trùm cả xe VÀ người ngồi trên xe. |
| **Xe Tay Ga Lớn / Xe Phân Khối Lớn** | **$2.15m$** | **$0.90m$** | **$1.55m$** | Honda SH, Vespa GTS, Kawasaki Z1000 | Chiều dài và chiều rộng nhỉnh hơn xe số phổ thông. |
| **Xe Đạp (Bao gồm người lái)** | **$1.75m$** | **$0.65m$** | **$1.60m$** | Xe đạp địa hình, xe đạp mini | Thân xe rất mỏng, chiều cao tính tới đỉnh mũ/đầu người. |
| **Người Đi Bộ Đứng / Đang Bước** | **$0.60m$** | **$0.60m$** | **$1.70m$** | Người trưởng thành đi bộ | Box hình khối hộp vuông đáy $0.6 \times 0.6m$, cao $1.70m$. |
| **Trẻ Em Đi Bộ** | **$0.45m$** | **$0.45m$** | **$1.20m$** | Trẻ em $6 \sim 10$ tuổi | Cần nhận diện cẩn thận để tránh nhầm với thùng rác/cột mốc. |

---

## 2. NGUYÊN TẮC "BẤT BIẾN KÍCH THƯỚC" (RIGID BODY INVARIANCE)

> [!IMPORTANT]
> **Quy tắc vàng:** Trong toàn bộ video sequence (chuỗi các frame liên tiếp), một chiếc xe **TUYỆT ĐỐI KHÔNG ĐƯỢC THAY ĐỔI KÍCH THƯỚC** $(L, W, H)$.

1. **Khi điểm LiDAR bị thưa dần ở khoảng cách xa (> 40m):**
   * Mắt người hoặc AI chỉ thấy được 1 vệt vài điểm phản xạ ở đuôi xe.
   * **Quy tắc:** Bắt buộc phải giữ nguyên kích thước chuẩn $(L, W, H)$ đã đo ở frame gần, không được co rút box lại ôm vào cụm điểm thưa!
2. **Khi xe bị che khuất một phần (Occlusion):**
   * Nếu đầu xe bị che khuất bởi xe khác, box 3D vẫn phải bao trùm toàn bộ hình học chiếc xe ngầm dự đoán bên dưới, không được cắt ngắn chiều dài xe.
3. **Mặt tiếp xúc bánh xe với mặt đất (Ground Contact):**
   * Mặt phẳng đáy của Bounding Box phải chạm đúng vào mặt đường (ngang với điểm thấp nhất của lốp xe tiếp đất).
   * Tuyệt đối không để box bị treo lơ lửng cách mặt đường $> 5cm$ hoặc chìm sâu vào lòng đường.

---

## 3. CẤU TRÚC JSON PRESET DÙNG TRONG CODE EXTENSION

Đoạn mã này được tích hợp trực tiếp vào `src/config/presets.ts` của Extension:

```typescript
export const VEHICLE_CATALOG = {
  sedan: {
    label: "Sedan / Car",
    length: 4.60,
    width: 1.80,
    height: 1.45,
    color: "#1890ff",
    hotkey: "1",
  },
  suv: {
    label: "SUV / Crossover",
    length: 4.65,
    width: 1.85,
    height: 1.68,
    color: "#52c41a",
    hotkey: "2",
  },
  pickup: {
    label: "Pickup Truck",
    length: 5.35,
    width: 1.90,
    height: 1.82,
    color: "#fa8c16",
    hotkey: "3",
  },
  bus_small: {
    label: "Minivan / 16-Seat Van",
    length: 6.20,
    width: 2.05,
    height: 2.50,
    color: "#eb2f96",
    hotkey: "4",
  },
  bus_large: {
    label: "City Bus (45-Seat)",
    length: 12.00,
    width: 2.50,
    height: 3.40,
    color: "#722ed1",
    hotkey: "5",
  },
  truck: {
    label: "Medium Truck",
    length: 7.50,
    width: 2.40,
    height: 3.20,
    color: "#faad14",
    hotkey: "6",
  },
  motorcycle: {
    label: "Motorbike + Rider",
    length: 1.90,
    width: 0.80,
    height: 1.45,
    color: "#13c2c2",
    hotkey: "7",
  },
  pedestrian: {
    label: "Pedestrian",
    length: 0.60,
    width: 0.60,
    height: 1.70,
    color: "#f5222d",
    hotkey: "8",
  },
} as const;
```
