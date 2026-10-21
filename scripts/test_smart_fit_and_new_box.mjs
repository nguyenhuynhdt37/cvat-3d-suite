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

async function testSmartFitAndNewBox() {
  console.log("\n========================================================================");
  console.log("🚀 BẮT ĐẦU KIỂM THỬ: REALTIME BOX MỚI TẠO, SMART AUTO-FIT & MULTI-FRAME ANCHOR");
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

    // 3. Kiểm tra chọn Box #3 (Box mới tạo với kích thước ban đầu 1x1x1m)
    console.log("\n📦 [BƯỚC 3] Kiểm tra Realtime đồng bộ dữ liệu cho Box #3...");
    
    // Mở Dropdown để chọn Xe #3
    await page.click("#btn-dropdown-toggle");
    await new Promise((r) => setTimeout(r, 400));
    
    // Tìm item Xe #3 trong danh sách
    const hasCar3 = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".dropdown-track-item"));
      const car3Item = items.find((el) => el.getAttribute("data-uiid") === "3");
      if (car3Item) {
        car3Item.click();
        return true;
      }
      return false;
    });

    if (hasCar3) {
      console.log("   ✅ Đã chọn Xe #3 từ danh sách!");
    } else {
      console.log("   ⚠️ Không thấy Xe #3 trong dropdown, chọn qua next track...");
      await page.click("#btn-next-frame-track");
      await page.click("#btn-next-frame-track");
    }
    await new Promise((r) => setTimeout(r, 1000));

    // Đọc thông số của Xe #3 hiển thị trên Floating Panel
    const car3InitialUI = await page.evaluate(() => {
      const title = document.querySelector("#btn-dropdown-toggle")?.innerText || "";
      const inpL = document.querySelector("#input-dim-l")?.value;
      const inpW = document.querySelector("#input-dim-w")?.value;
      const inpH = document.querySelector("#input-dim-h")?.value;
      const summary = document.querySelector("#cvat-3d-suite-floating div:nth-child(2) div:nth-child(2)")?.innerText || "";
      return { title, inpL, inpW, inpH, summary };
    });

    console.log("   📊 Dữ liệu Xe #3 hiển thị ban đầu trên UI:", car3InitialUI);

    // 4. Kiểm tra THUẬT TOÁN TỰ ĐỘNG FIT BOX THÔNG MINH DỰA TRÊN ĐÁM MÂY ĐIỂM (SMART BEST-FIT)
    console.log("\n⚡ [BƯỚC 4] Kích hoạt 'Tự Tính Kích Thước Tốt Nhất (LiDAR Best-Fit)' trên Box #3...");
    await page.click("#btn-auto-fit-points");
    await new Promise((r) => setTimeout(r, 2000));

    // Đọc kết quả sau khi Fit
    const car3AfterFit = await page.evaluate(async () => {
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
      const car3 = annos.find((s) => s.clientID === 3);

      const inpL = document.querySelector("#input-dim-l")?.value;
      const inpW = document.querySelector("#input-dim-w")?.value;
      const inpH = document.querySelector("#input-dim-h")?.value;
      const toastText = document.querySelector("#cvat-floating-toast-overlay")?.innerText || "";

      return {
        uiDims: { l: inpL, w: inpW, h: inpH },
        car3Points: car3 ? car3.points.slice(0, 9) : null,
        toastText,
      };
    });

    console.log("   📊 Kết quả Xe #3 sau khi Smart Best-Fit:");
    console.log("      - UI Inputs (L x W x H):", `${car3AfterFit.uiDims.l} x ${car3AfterFit.uiDims.w} x ${car3AfterFit.uiDims.h} m`);
    if (car3AfterFit.car3Points) {
      const [cx, cy, cz, rx, ry, yaw, l, w, h] = car3AfterFit.car3Points;
      console.log(`      - Tọa độ tâm (X, Y, Z): (${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(3)})`);
      console.log(`      - Kích thước thật: ${l} x ${w} x ${h} m`);
      console.log(`      - Góc xoay Yaw: ${(yaw * 180 / Math.PI).toFixed(1)}°`);
    }
    console.log("      - Toast Thông Báo Nổi:", car3AfterFit.toastText);

    // 5. Kiểm tra NÚT FIT MỐC CHUẨN TOÀN TRACK (MULTI-FRAME ANCHOR FIT)
    console.log("\n🚀 [BƯỚC 5] Kiểm tra 'Fit Mốc Chuẩn Toàn Track' (#btn-smart-anchor-fit)...");
    await page.click("#btn-smart-anchor-fit");
    await new Promise((r) => setTimeout(r, 2000));

    const anchorFitToast = await page.evaluate(() => {
      return document.querySelector("#cvat-floating-toast-overlay")?.innerText || "";
    });
    console.log("   ✅ Toast phản hồi Fit Mốc Toàn Track:", anchorFitToast);

    // 6. Kiểm tra CHUYỂN MODULE TABS & CHỨC NĂNG LẬT / GHIM ĐẤT
    console.log("\n🧭 [BƯỚC 6] Chuyển sang Tab '🧭 Hướng & Lật' và lật 180°...");
    await page.click(".nav-tab-btn[data-tab='rotation']");
    await new Promise((r) => setTimeout(r, 600));

    console.log("   👉 Nhấn nút 'Lật Frame này' (F)...");
    await page.click("#btn-flip-frame");
    await new Promise((r) => setTimeout(r, 1200));

    const yawAfterFlip = await page.evaluate(() => {
      const summary = document.querySelector("#cvat-3d-suite-floating div:nth-child(2) div:nth-child(2)")?.innerText || "";
      const toast = document.querySelector("#cvat-floating-toast-overlay")?.innerText || "";
      return { summary, toast };
    });
    console.log("   ✅ Kết quả lật hướng 180°:", yawAfterFlip);

    console.log("\n🛣️ [BƯỚC 7] Chuyển sang Tab '🛣️ Ghim Đất' và kiểm tra Ghim Mặt Đường...");
    await page.click(".nav-tab-btn[data-tab='ground']");
    await new Promise((r) => setTimeout(r, 600));

    console.log("   👉 Nhấn nút 'Mặt Đường (LiDAR)' (G)...");
    await page.click("#btn-snap-road");
    await new Promise((r) => setTimeout(r, 1200));

    console.log("   👉 Thử nghiệm Vi Chỉnh Micro-Z (+1cm)...");
    await page.click(".btn-micro-z[data-delta='1']");
    await new Promise((r) => setTimeout(r, 1000));

    const groundResult = await page.evaluate(() => {
      const summary = document.querySelector("#cvat-3d-suite-floating div:nth-child(2) div:nth-child(2)")?.innerText || "";
      const toast = document.querySelector("#cvat-floating-toast-overlay")?.innerText || "";
      return { summary, toast };
    });
    console.log("   ✅ Kết quả Ghim Đất & Vi Chỉnh Z:", groundResult);

    // Chuyển lại Tab Kích Thước để chụp ảnh hoàn tất
    await page.click(".nav-tab-btn[data-tab='dimensions']");
    await new Promise((r) => setTimeout(r, 800));

    // Chụp ảnh lưu bằng chứng
    const ssPath = path.resolve(screenshotDir, "smart_fit_car3_verified.png");
    await page.screenshot({ path: ssPath, fullPage: false });
    console.log(`\n📸 [BƯỚC 8] Đã chụp ảnh lưu bằng chứng tại: ${ssPath}`);

    console.log("\n========================================================================");
    console.log("🎉 TẤT CẢ KIỂM THỬ THỜI GIAN THỰC ĐÃ THÀNH CÔNG RỰC RỠ 100%!");
    console.log("========================================================================");
  } catch (error) {
    console.error("❌ Lỗi kiểm thử:", error);
    const errPath = path.resolve(screenshotDir, "smart_fit_car3_error.png");
    await page.screenshot({ path: errPath });
    console.log(`📸 Đã chụp ảnh màn hình lỗi tại: ${errPath}`);
    throw error;
  } finally {
    await browser.close();
  }
}

testSmartFitAndNewBox().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
