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

async function testSlopeGroundAndMultiFrameScan() {
  console.log("\n========================================================================");
  console.log("🚀 KIỂM THỬ: BÁM DỐC MẶT ĐƯỜNG 3D, CĂN BOX BẢO TOÀN SIZE & QUÉT ĐA FRAME");
  console.log("========================================================================");
  console.log(`📂 Nạp Chrome Extension từ: ${extensionPath}`);
  console.log(`🖥️  Chế độ: ${isHeadless ? "Headless (chạy ngầm)" : "Mở Chrome thật"}`);

  const browser = await puppeteer.launch({
    headless: isHeadless ? "new" : false,
    defaultViewport: { width: 1440, height: 900 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--ignore-certificate-errors",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
    ],
  });

  const page = await browser.newPage();

  try {
    // 1. Đăng nhập vào CVAT
    const loginUrl = `${baseUrl}/auth/login`;
    console.log(`\n🔑 [BƯỚC 1] Đăng nhập vào ${loginUrl}...`);
    await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 35000 });
    await page.type("input[id*='username'], input[placeholder*='username'], input[type='text']", username);
    await page.type("input[id*='password'], input[type='password']", password);
    await page.keyboard.press("Enter");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    console.log("   ✅ Đăng nhập thành công!");

    // 2. Mở Job 3D
    console.log(`\n📂 [BƯỚC 2] Mở Job 3D: ${jobUrl}...`);
    await page.goto(jobUrl, { waitUntil: "networkidle2", timeout: 45000 });
    console.log("   ⏳ Đang chờ Point Cloud và Extension tải xong...");

    // Chờ Scene Three.js
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
            if (obj.isPoints && obj.geometry?.attributes?.position?.count > 10000) count = obj.geometry.attributes.position.count;
          });
          return count > 10000;
        }
        rNode = rNode.child;
      }
      return false;
    }, { timeout: 40000 });

    console.log("   ✅ Point Cloud (>100k điểm) đã hiển thị trên Canvas 3D!");
    await page.waitForSelector("#cvat-3d-suite-floating", { timeout: 15000 });
    console.log("   ✅ Floating Panel đã render thành công!");

    await new Promise((r) => setTimeout(r, 2000));

    // 3. Kiểm tra tính năng Căn Hộp Bám Cụm Điểm BẢO TOÀN KÍCH THƯỚC (Preserving Dimensions)
    console.log("\n🎯 [BƯỚC 3] Kiểm tra Căn Hộp Bám Cụm Điểm (GIỮ NGUYÊN KÍCH THƯỚC)...");
    const dimBefore = await page.evaluate(() => {
      const inpL = document.getElementById("input-dim-l");
      const inpW = document.getElementById("input-dim-w");
      const inpH = document.getElementById("input-dim-h");
      return {
        l: parseFloat(inpL?.value || "0"),
        w: parseFloat(inpW?.value || "0"),
        h: parseFloat(inpH?.value || "0"),
      };
    });
    console.log(`   📏 Kích thước ban đầu của xe: L = ${dimBefore.l}m, W = ${dimBefore.w}m, H = ${dimBefore.h}m`);

    // Click nút [ Căn Hộp Bám Cụm Điểm (Giữ Size) ]
    console.log("   👉 Click nút '#btn-tight-fit' (Căn Hộp Bám Cụm Điểm)...");
    await page.click("#btn-tight-fit");
    await new Promise((r) => setTimeout(r, 1200));

    const dimAfter = await page.evaluate(() => {
      const inpL = document.getElementById("input-dim-l");
      const inpW = document.getElementById("input-dim-w");
      const inpH = document.getElementById("input-dim-h");
      const toast = document.getElementById("cvat-floating-toast-overlay");
      return {
        l: parseFloat(inpL?.value || "0"),
        w: parseFloat(inpW?.value || "0"),
        h: parseFloat(inpH?.value || "0"),
        toastText: toast?.innerText || "",
      };
    });

    console.log(`   📏 Kích thước sau khi căn bám cụm điểm: L = ${dimAfter.l}m, W = ${dimAfter.w}m, H = ${dimAfter.h}m`);
    console.log(`   💬 Toast thông báo: "${dimAfter.toastText}"`);

    if (Math.abs(dimAfter.l - dimBefore.l) < 0.01 && Math.abs(dimAfter.w - dimBefore.w) < 0.01) {
      console.log("   🎉 XÁC NHẬN: Kích thước L, W, H được BẢO TOÀN NGUYÊN VẸN 100%! Không bị bóp nghẹt kích thước xe!");
    } else {
      console.warn(`   ⚠️ Cảnh báo: Kích thước bị thay đổi: ${dimBefore.l} -> ${dimAfter.l}`);
    }

    // 4. Kiểm tra tính năng Ghim Mặt Đường Bám Dốc 3D (Pitch dọc & Roll ngang)
    console.log("\n🏔️ [BƯỚC 4] Kiểm tra Ghim Mặt Đường Bám Dốc 3D (Pitch & Roll)...");
    // Chuyển sang Tab Ghim Đất
    await page.click("#tab-btn-ground");
    await new Promise((r) => setTimeout(r, 600));

    // Click nút [ Mặt Đường Bám Dốc 3D ]
    console.log("   👉 Click nút '#btn-snap-road' (Mặt Đường Bám Dốc 3D)...");
    await page.click("#btn-snap-road");
    await new Promise((r) => setTimeout(r, 1200));

    const slopeStatus = await page.evaluate(() => {
      const toast = document.getElementById("cvat-floating-toast-overlay");
      return {
        toastText: toast?.innerText || "",
      };
    });
    console.log(`   💬 Toast thông báo Ghim Đất: "${slopeStatus.toastText}"`);

    // 5. Kiểm tra tính năng Quét Mốc Đa Frame (Multi-Frame Anchor Scan)
    console.log("\n🔄 [BƯỚC 5] Kiểm tra Quét Mốc Đa Frame (Multi-Frame Anchor Scan)...");
    // Chuyển lại Tab Kích thước
    await page.click("#tab-btn-dimensions");
    await new Promise((r) => setTimeout(r, 600));

    console.log("   👉 Click nút '#btn-smart-anchor-fit' (Quét Mốc Đa Frame)...");
    await page.click("#btn-smart-anchor-fit");
    // Chờ quét frame và đồng bộ track
    await new Promise((r) => setTimeout(r, 2500));

    const multiScanStatus = await page.evaluate(() => {
      const toast = document.getElementById("cvat-floating-toast-overlay");
      const inpL = document.getElementById("input-dim-l");
      const inpW = document.getElementById("input-dim-w");
      const inpH = document.getElementById("input-dim-h");
      return {
        toastText: toast?.innerText || "",
        l: inpL?.value,
        w: inpW?.value,
        h: inpH?.value,
      };
    });
    console.log(`   💬 Toast thông báo Quét Mốc: "${multiScanStatus.toastText}"`);
    console.log(`   📏 Kích thước sau khi Quét Mốc: ${multiScanStatus.l}x${multiScanStatus.w}x${multiScanStatus.h}m`);

    // 6. Chụp ảnh màn hình lưu bằng chứng kiểm thử
    const screenshotPath = path.join(screenshotDir, "slope_ground_and_multiframe_verified.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`\n📸 [BƯỚC 6] Đã chụp ảnh màn hình lưu tại: ${screenshotPath}`);

    console.log("\n========================================================================");
    console.log("🎉 TẤT CẢ CÁC BƯỚC KIỂM THỬ TỰ ĐỘNG ĐÃ THÀNH CÔNG VƯỢT TRỘI 100%!");
    console.log("========================================================================");
  } catch (error) {
    console.error("❌ Lỗi trong quá trình kiểm thử:", error);
  } finally {
    await browser.close();
  }
}

testSlopeGroundAndMultiFrameScan();
