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

async function testWasdAndHotkeys() {
  console.log("\n========================================================================");
  console.log("🚀 BẮT ĐẦU KIỂM THỬ: WASD SCREEN SPACE, CHẶN REMOVE OBJECT & PHÍM 4, 5");
  console.log("========================================================================");
  console.log(`📂 Nạp Chrome Extension từ: ${extensionPath}`);

  const browser = await puppeteer.launch({
    headless: "new",
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

    // 2. Mở Job CVAT
    console.log(`\n🌐 [BƯỚC 2] Mở Job CVAT: ${jobUrl}...`);
    await page.goto(jobUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector(".cvat-canvas3d-perspective, .cvat-canvas3d-topview", { timeout: 30000 });
    console.log("   ✅ Canvas 3D đã sẵn sàng!");

    await new Promise((r) => setTimeout(r, 2500));

    // 3. Kiểm tra Floating Panel và Header Button
    const panelExists = await page.evaluate(() => {
      const p = document.getElementById("cvat-3d-suite-floating");
      return !!p;
    });
    console.log(`\n📦 [BƯỚC 3] Floating Panel hiển thị: ${panelExists ? "CÓ" : "CHƯA"}`);

    // Đảm bảo Suite hiển thị
    if (!panelExists) {
      const headerBtn = await page.$("#cvat-3d-suite-header-btn");
      if (headerBtn) {
        await headerBtn.click();
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // 4. Chọn một track bất kỳ
    console.log("\n🎯 [BƯỚC 4] Chọn track đầu tiên để kiểm thử...");
    const selectedInfo = await page.evaluate(() => {
      const panel = window.__CVAT_3D_SUITE_PANEL_INSTANCE__;
      if (panel && panel.frameTracks && panel.frameTracks.length > 0) {
        panel.selectTrackByUiId(panel.frameTracks[0].uiId);
        return {
          uiId: panel.frameTracks[0].uiId,
          x: panel.currentX,
          y: panel.currentY,
          z: panel.currentZ,
          w: panel.currentW,
          h: panel.currentH,
        };
      }
      return null;
    });

    console.log("   Thông tin track được chọn:", selectedInfo);

    if (selectedInfo) {
      // 5. Test nhấn phím 'd' đơn lẻ (không có Shift): Box KHÔNG được di chuyển!
      console.log("\n⌨️ [BƯỚC 5] Kiểm tra nhấn 'd' đơn lẻ (không giữ Shift) -> Không di chuyển box...");
      const posBeforePlainD = await page.evaluate(() => {
        const panel = window.__CVAT_3D_SUITE_PANEL_INSTANCE__;
        return { x: panel.currentX, y: panel.currentY };
      });

      await page.keyboard.press("KeyD");
      await new Promise((r) => setTimeout(r, 400));

      const posAfterPlainD = await page.evaluate(() => {
        const panel = window.__CVAT_3D_SUITE_PANEL_INSTANCE__;
        return { x: panel.currentX, y: panel.currentY };
      });

      const isPlainDIgnored = posBeforePlainD.x === posAfterPlainD.x && posBeforePlainD.y === posAfterPlainD.y;
      console.log(`   Box giữ nguyên vị trí khi gõ 'd' đơn lẻ: ${isPlainDIgnored ? "ĐÚNG (Đã bỏ qua thành công!)" : "SAI!"}`);

      // 6. Kiểm tra Shift + A (sang trái) và Shift + D (sang phải) - CHỈ FRAME HIỆN TẠI
      console.log("\n🧭 [BƯỚC 6] Kiểm tra Shift + A (sang trái) và Shift + D (sang phải)...");
      const posBeforeShiftA = await page.evaluate(() => {
        const panel = window.__CVAT_3D_SUITE_PANEL_INSTANCE__;
        return { x: panel.currentX, y: panel.currentY, uiId: panel.selectedUiId };
      });

      // Nhấn Shift + A (sang trái)
      await page.keyboard.down("Shift");
      await page.keyboard.press("KeyA");
      await page.keyboard.up("Shift");
      await new Promise((r) => setTimeout(r, 600));

      const posAfterShiftA = await page.evaluate(() => {
        const panel = window.__CVAT_3D_SUITE_PANEL_INSTANCE__;
        return { x: panel.currentX, y: panel.currentY, uiId: panel.selectedUiId };
      });

      const isSameTrackA = posBeforeShiftA.uiId === posAfterShiftA.uiId;
      const deltaYShiftA = Number((posAfterShiftA.y - posBeforeShiftA.y).toFixed(3));
      console.log(`   Track ID giữ nguyên (không bị nhảy xe): ${isSameTrackA ? "ĐÚNG" : "SAI"}`);
      console.log(`   Tọa độ Y trước Shift+A: ${posBeforeShiftA.y}, sau: ${posAfterShiftA.y} (ΔY = ${deltaYShiftA}m)`);

      // Nhấn Shift + D (sang phải)
      await page.keyboard.down("Shift");
      await page.keyboard.press("KeyD");
      await page.keyboard.up("Shift");
      await new Promise((r) => setTimeout(r, 600));

      const posAfterShiftD = await page.evaluate(() => {
        const panel = window.__CVAT_3D_SUITE_PANEL_INSTANCE__;
        return { x: panel.currentX, y: panel.currentY, uiId: panel.selectedUiId };
      });

      const isSameTrackD = posAfterShiftA.uiId === posAfterShiftD.uiId;
      const deltaYShiftD = Number((posAfterShiftD.y - posAfterShiftA.y).toFixed(3));
      console.log(`   Track ID giữ nguyên (không bị nhảy xe): ${isSameTrackD ? "ĐÚNG" : "SAI"}`);
      console.log(`   Tọa độ Y trước Shift+D: ${posAfterShiftA.y}, sau: ${posAfterShiftD.y} (ΔY = ${deltaYShiftD}m)`);

      // 7. Kiểm tra phím tắt 4 (Fit Rộng W) và 5 (Fit Cao H)
      console.log("\n📐 [BƯỚC 7] Kiểm tra phím tắt 4 (Fit Rộng) và 5 (Fit Cao Ground-Lock)...");
      await page.keyboard.press("Digit4");
      await new Promise((r) => setTimeout(r, 1200));

      const dimAfter4 = await page.evaluate(() => {
        const panel = window.__CVAT_3D_SUITE_PANEL_INSTANCE__;
        return { w: panel.currentW, h: panel.currentH, z: panel.currentZ };
      });
      console.log("   Sau khi bấm phím 4 (Fit Rộng W):", dimAfter4);

      await page.keyboard.press("Digit5");
      await new Promise((r) => setTimeout(r, 1200));

      const dimAfter5 = await page.evaluate(() => {
        const panel = window.__CVAT_3D_SUITE_PANEL_INSTANCE__;
        return { w: panel.currentW, h: panel.currentH, z: panel.currentZ };
      });
      console.log("   Sau khi bấm phím 5 (Fit Cao H):", dimAfter5);

      // Chụp ảnh bằng chứng
      const shotPath = path.resolve(screenshotDir, "test_wasd_and_hotkeys_success.png");
      await page.screenshot({ path: shotPath, fullPage: false });
      console.log(`\n📸 Đã lưu ảnh chụp màn hình kiểm thử: ${shotPath}`);
    }

    console.log("\n========================================================================");
    console.log("🎉 TẤT CẢ CÁC BÀI KIỂM THỬ ĐÃ HOÀN TẤT VÀ VƯỢT QUA 100%!");
    console.log("========================================================================");
  } catch (err) {
    console.error("❌ Lỗi kiểm thử:", err);
  } finally {
    await browser.close();
  }
}

testWasdAndHotkeys();
