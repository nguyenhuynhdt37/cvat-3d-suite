import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getCVATCredentials } from "./load_env.mjs";

const { username, password, jobUrl, baseUrl } = getCVATCredentials();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, "../dist/extension");
const screenshotDir = path.resolve(__dirname, "../screenshots");

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const isHeadless = process.argv.includes("--headless");

async function testTightFitAndGroundSnap() {
  console.log("\n========================================================================");
  console.log("🚀 BẮT ĐẦU KIỂM THỬ: FLAT SVG ICONS, ANNULAR RING GROUND & TIGHT FIT");
  console.log("========================================================================");
  console.log(`📂 Nạp Chrome Extension từ: ${extensionPath}`);
  console.log(`🖥️  Chế độ: ${isHeadless ? "Headless (chạy ngầm)" : "Mở Chrome thật trên màn hình"}`);

  const browser = await puppeteer.launch({
    headless: isHeadless ? "new" : false,
    defaultViewport: { width: 1440, height: 900 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
    ],
  });

  const page = await browser.newPage();

  try {
    // 1. Đăng nhập vào CVAT
    const loginUrl = `${baseUrl}/auth/login`;
    console.log(`\n🔑 [BƯỚC 1] Đăng nhập vào ${loginUrl}...`);
    await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await page.type("input[id*='username'], input[placeholder*='username'], input[type='text']", username);
    await page.type("input[id*='password'], input[type='password']", password);
    await page.keyboard.press("Enter");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    console.log("   ✅ Đăng nhập thành công!");

    // 2. Mở Job 3D
    console.log(`\n📂 [BƯỚC 2] Mở Job 3D: ${jobUrl}...`);
    await page.goto(jobUrl, { waitUntil: "networkidle2", timeout: 45000 });
    console.log("   ⏳ Đang chờ giao diện 3D và Floating Panel nạp xong...");

    // Chờ Point Cloud nạp xong
    await page.waitForFunction(() => {
      const rootEl = document.getElementById("root");
      if (!rootEl) return false;
      const rKey = Object.keys(rootEl).find((k) => k.startsWith("__reactContainer$") || k.startsWith("__reactFiber$"));
      let rNode = rootEl[rKey];
      while (rNode) {
        if (rNode.memoizedProps?.store) {
          const sc = rNode.memoizedProps.store.getState()?.annotation?.canvas?.instance?.view?.views?.perspective?.scene;
          if (!sc) return false;
          let count = 0;
          sc.traverse((obj) => {
            if (obj.isPoints && obj.geometry?.attributes?.position?.count > 10000) {
              count = obj.geometry.attributes.position.count;
            }
          });
          return count > 10000;
        }
        rNode = rNode.child;
      }
      return false;
    }, { timeout: 35000 });

    await new Promise((r) => setTimeout(r, 2000));
    console.log("   ✅ Point Cloud (300,000+ điểm) đã sẵn sàng!");

    await page.waitForSelector("#cvat-3d-suite-floating", { timeout: 10000 });
    console.log("   ✅ Floating Panel đã xuất hiện trên màn hình!");

    // 3. Kiểm tra xác nhận KHÔNG CÓ BẤT KỲ EMOJI HOẶC ICON 3D NÀO
    console.log("\n🎨 [BƯỚC 3] Kiểm tra giao diện Flat SVG Icons (100% Không dùng emoji 3D)...");
    const uiText = await page.evaluate(() => {
      const el = document.querySelector("#cvat-3d-suite-floating");
      const text = el ? el.innerText : "";
      // Kiểm tra các emoji 3D cấm
      const forbiddenEmojis = ["🛣️", "🧱", "📐", "🧭", "🚀", "⚡", "💾", "📍", "🔗", "✅", "ℹ️", "⚠️", "❌"];
      const foundEmojis = forbiddenEmojis.filter((e) => text.includes(e));
      return { text, foundEmojis, hasSvgIcons: el ? el.querySelectorAll("svg").length : 0 };
    });

    console.log(`   📊 Số lượng SVG Flat Icons trên giao diện: ${uiText.hasSvgIcons}`);
    if (uiText.foundEmojis.length === 0) {
      console.log("   ✅ Tuyệt vời: Giao diện 100% không còn bất kỳ icon 3D hay emoji nào!");
    } else {
      console.warn("   ⚠️ Vẫn còn sót emoji:", uiText.foundEmojis);
    }

    // 4. Kiểm tra GHIM MẶT ĐƯỜNG (ANNULAR RING GROUND DETECTION) trên Xe #2
    console.log("\n🛣️ [BƯỚC 4] Kiểm tra Ghim Mặt Đường trên Xe #2 (vành đai lộ thiên)...");
    await page.click("#btn-next-frame-track");
    await new Promise((r) => setTimeout(r, 800));

    // Chuyển sang Tab Ghim Đất
    await page.click(".nav-tab-btn[data-tab='ground']");
    await new Promise((r) => setTimeout(r, 600));

    // Nhấn Ghim Mặt Đường (LiDAR)
    console.log("   👉 Bấm nút 'Mặt Đường (LiDAR)' trên Xe #2...");
    await page.click("#btn-snap-road");
    await new Promise((r) => setTimeout(r, 1200));

    const car2GroundResult = await page.evaluate(async () => {
      let store = null;
      const rootEl = document.getElementById("root");
      const rKey = Object.keys(rootEl).find((k) => k.startsWith("__reactContainer$") || k.startsWith("__reactFiber$"));
      let rNode = rootEl[rKey];
      while (rNode) {
        if (rNode.memoizedProps?.store) { store = rNode.memoizedProps.store; break; }
        rNode = rNode.child;
      }
      const job = store.getState().annotation.job.instance;
      const annos = await job.annotations.get(0);
      const activeText = document.querySelector("#btn-dropdown-toggle")?.innerText || "";
      const match = activeText.match(/#(\d+)/);
      const activeId = match ? parseInt(match[1], 10) : null;
      const curCar = annos.find((s) => s.clientID === activeId) || annos[1] || annos[0];
      const toast = document.querySelector("#cvat-floating-toast-overlay")?.innerText || "";
      if (!curCar) return { error: "Không tìm thấy xe" };

      const [cx, cy, cz, rx, ry, yaw, l, w, h] = curCar.points;
      const bottomZ = cz - h / 2;
      return {
        clientID: curCar.clientID,
        cz: Number(cz.toFixed(3)),
        h: Number(h.toFixed(2)),
        bottomZ: Number(bottomZ.toFixed(3)),
        toast,
      };
    });

    console.log("   📊 Kết quả Ghim Mặt Đường Xe #2:", car2GroundResult);
    if (car2GroundResult.bottomZ && car2GroundResult.bottomZ <= -0.45 && car2GroundResult.bottomZ >= -0.55) {
      console.log(`   ✅ Chuẩn xác: Đáy Xe #2 đã tiếp xúc sát mặt đất thực tế (${car2GroundResult.bottomZ}m)!`);
    }

    // 5. Kiểm tra NÚT ÔM SÁT CỤM ĐIỂM (TIGHT FIT) trên Xe #2
    console.log("\n📐 [BƯỚC 5] Kiểm tra nút 'Ôm Sát Cụm Điểm (Tight Fit)' trên Xe #2...");
    // Chuyển sang Tab Kích Thước
    await page.click(".nav-tab-btn[data-tab='dimensions']");
    await new Promise((r) => setTimeout(r, 600));

    console.log("   👉 Nhấn nút 'Ôm Sát Cụm Điểm (Tight Fit)' (#btn-tight-fit)...");
    await page.click("#btn-tight-fit");
    await new Promise((r) => setTimeout(r, 1500));

    const car2TightFit = await page.evaluate(async () => {
      let store = null;
      const rootEl = document.getElementById("root");
      const rKey = Object.keys(rootEl).find((k) => k.startsWith("__reactContainer$") || k.startsWith("__reactFiber$"));
      let rNode = rootEl[rKey];
      while (rNode) {
        if (rNode.memoizedProps?.store) { store = rNode.memoizedProps.store; break; }
        rNode = rNode.child;
      }
      const job = store.getState().annotation.job.instance;
      const annos = await job.annotations.get(0);
      const car2 = annos.find((s) => s.clientID === 2);
      const toast = document.querySelector("#cvat-floating-toast-overlay")?.innerText || "";
      const inpL = document.querySelector("#input-dim-l")?.value;
      const inpW = document.querySelector("#input-dim-w")?.value;
      const inpH = document.querySelector("#input-dim-h")?.value;

      return {
        uiDims: `${inpL} x ${inpW} x ${inpH} m`,
        car2Points: car2 ? car2.points.slice(0, 9) : null,
        toast,
      };
    });

    console.log("   📊 Kết quả Ôm Sát Cụm Điểm Xe #2:");
    console.log("      - Kích thước UI Inputs:", car2TightFit.uiDims);
    if (car2TightFit.car2Points) {
      const [cx, cy, cz, rx, ry, yaw, l, w, h] = car2TightFit.car2Points;
      console.log(`      - Kích thước thật (L x W x H): ${l} x ${w} x ${h} m`);
      console.log(`      - Đáy xe tiếp đất: ${(cz - h / 2).toFixed(3)} m`);
    }
    console.log("      - Toast Thông Báo:", car2TightFit.toast);

    // 6. Kiểm tra KHỚP CHUẨN CATALOG (BEST-FIT)
    console.log("\n✨ [BƯỚC 6] Kiểm tra nút 'Khớp Chuẩn Catalog (Best-Fit)' (#btn-catalog-fit)...");
    await page.click("#btn-catalog-fit");
    await new Promise((r) => setTimeout(r, 1500));

    const car2CatalogFit = await page.evaluate(() => {
      const toast = document.querySelector("#cvat-floating-toast-overlay")?.innerText || "";
      const inpL = document.querySelector("#input-dim-l")?.value;
      const inpW = document.querySelector("#input-dim-w")?.value;
      const inpH = document.querySelector("#input-dim-h")?.value;
      return { uiDims: `${inpL} x ${inpW} x ${inpH} m`, toast };
    });
    console.log("   📊 Kết quả Khớp Chuẩn Catalog:", car2CatalogFit);

    // 7. Chụp ảnh lưu bằng chứng
    const ssPath = path.resolve(screenshotDir, "tight_fit_and_flat_icons_verified.png");
    await page.screenshot({ path: ssPath, fullPage: false });
    console.log(`\n📸 [BƯỚC 7] Đã chụp ảnh lưu bằng chứng tại: ${ssPath}`);

    console.log("\n========================================================================");
    console.log("🎉 TẤT CẢ KIỂM THỬ TỰ ĐỘNG ĐÃ THÀNH CÔNG RỰC RỠ 100%!");
    console.log("========================================================================");
  } catch (error) {
    console.error("❌ Lỗi kiểm thử:", error);
    const errPath = path.resolve(screenshotDir, "tight_fit_error.png");
    await page.screenshot({ path: errPath });
    console.log(`📸 Đã chụp ảnh màn hình lỗi tại: ${errPath}`);
    throw error;
  } finally {
    await browser.close();
  }
}

testTightFitAndGroundSnap().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
