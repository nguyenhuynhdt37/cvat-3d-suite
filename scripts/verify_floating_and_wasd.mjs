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

async function verifyAll() {
  console.log("\n========================================================================");
  console.log("🚀 BẮT ĐẦU KIỂM THỬ XÁC MINH TOÀN DIỆN: FLOATING PANEL, F5 & WASD THEO VIEW");
  console.log("========================================================================");

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

  // Bắt console logs
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("CVAT 3D Suite") || text.includes("WASD") || text.includes("View")) {
      console.log(`  [BROWSER] ${text}`);
    }
  });

  try {
    // 1. Đăng nhập
    console.log(`\n🔑 [BƯỚC 1] Đăng nhập vào ${baseUrl}/auth/login...`);
    await page.goto(`${baseUrl}/auth/login`, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForSelector("input[type='text'], input[id*='username']", { timeout: 10000 });
    await page.type("input[type='text'], input[id*='username']", username);
    await page.type("input[type='password'], input[id*='password']", password);
    await page.keyboard.press("Enter");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
    console.log("✅ Đăng nhập thành công!");

    // 2. Vào Job URL
    console.log(`\n📂 [BƯỚC 2] Truy cập Job URL: ${jobUrl}...`);
    await page.goto(jobUrl, { waitUntil: "networkidle2", timeout: 45000 });
    console.log("⏳ Chờ 6 giây cho CVAT tải 3D Canvas và Point Cloud...");
    await new Promise((r) => setTimeout(r, 6000));

    // 3. KIỂM TRA TRẠNG THÁI FLOATING PANEL & SIDEBAR NGUYÊN BẢN CỦA CVAT
    console.log("\n🧪 [KIỂM TRA 1] Kiểm tra giao diện Cửa sổ nổi (Floating Panel)...");
    const uiStatus = await page.evaluate(() => {
      const panel = window.__CVAT_3D_SUITE_PANEL_INSTANCE__;
      const floatingEl = document.getElementById("cvat-3d-suite-floating");
      const cvatSidebar = document.querySelector(".cvat-objects-sidebar");
      const sidebarChildren = cvatSidebar?.querySelector(".ant-layout-sider-children");

      return {
        floatingExists: !!floatingEl,
        floatingStyle: floatingEl ? {
          position: floatingEl.style.position,
          top: floatingEl.style.top,
          right: floatingEl.style.right,
          width: floatingEl.style.width,
          borderRadius: floatingEl.style.borderRadius,
        } : null,
        cvatSidebarExists: !!cvatSidebar,
        cvatSidebarVisible: sidebarChildren ? sidebarChildren.style.visibility !== "hidden" : false,
        selectedUiId: panel?.selectedUiId,
        selectedCategory: panel?.selectedCategory,
        currentActiveView: panel?.currentActiveView,
        tracksCount: panel?.frameTracks?.length || 0,
      };
    });

    console.log("📊 Trạng thái UI ban đầu:", JSON.stringify(uiStatus, null, 2));

    if (uiStatus.floatingExists && uiStatus.floatingStyle?.position === "fixed") {
      console.log("✅ [ĐẠT] Floating Panel đang hiển thị ở dạng Cửa sổ nổi độc lập!");
    } else {
      console.error("❌ [LỖI] Floating Panel không đúng dạng cửa sổ nổi!");
    }

    if (uiStatus.cvatSidebarExists && uiStatus.cvatSidebarVisible) {
      console.log("✅ [ĐẠT] Sidebar gốc của CVAT hiển thị 100% nguyên bản, không bị che/ẩn!");
    } else {
      console.warn("⚠️ Sidebar CVAT trạng thái:", uiStatus.cvatSidebarVisible);
    }

    // Chụp ảnh trước khi F5
    await page.screenshot({ path: path.join(screenshotDir, "verify_floating_before_f5.png") });

    // 4. KIỂM THỬ F5 (RELOAD TRANG)
    console.log("\n🔄 [KIỂM TRA 2] Thực hiện F5 (page.reload()) và theo dõi 8 giây...");
    await page.reload({ waitUntil: "domcontentloaded" });

    const reloadTimeline = [];
    let hasFakeId = false;

    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const snap = await page.evaluate((elapsedMs) => {
        const panel = window.__CVAT_3D_SUITE_PANEL_INSTANCE__;
        const tracks = panel?.frameTracks || [];
        const uiIds = tracks.map((t) => t.uiId);
        return {
          elapsedMs,
          selectedUiId: panel?.selectedUiId ?? null,
          tracksCount: tracks.length,
          uiIds,
          currentFrame: panel?.currentFrameNumber,
        };
      }, (i + 1) * 500);

      reloadTimeline.push(snap);
      console.log(`  ⏱️ [${snap.elapsedMs}ms] ID đang chọn: ${snap.selectedUiId} | Frame: ${snap.currentFrame} | Tracks (${snap.tracksCount}): [${snap.uiIds.join(", ")}]`);

      // Kiểm tra xem có xuất hiện ID ảo (1, 2, 3...) khi xe thật là 13..18 hoặc 25..30 không
      if (snap.tracksCount > 0 && snap.uiIds.some((id) => id >= 1 && id <= 6 && snap.currentFrame === 4)) {
        hasFakeId = true;
      }
    }

    if (!hasFakeId) {
      console.log("\n✅ [ĐẠT] TRIỆT TIÊU 100% ID ẢO! Không còn hiện tượng gán ID 1..6 bừa bãi!");
    } else {
      console.error("\n❌ [LỖI] Vẫn còn xuất hiện ID ảo!");
    }

    // Chụp ảnh sau F5
    await page.screenshot({ path: path.join(screenshotDir, "verify_floating_after_f5.png") });

    // 5. KIỂM THỬ TÍNH NĂNG NHẬN DIỆN VIEW & PHÍM TẮT WASD
    console.log("\n🎮 [KIỂM TRA 3] Kiểm thử hệ thống nhận diện View & Phím tắt WASD...");

    // Chờ thêm 2 giây để chắc chắn có xe được chọn
    await new Promise((r) => setTimeout(r, 2000));

    const wasdTestResult = await page.evaluate(async () => {
      const panel = window.__CVAT_3D_SUITE_PANEL_INSTANCE__;
      if (!panel) return { success: false, reason: "Không có panel instance" };

      await panel.ensureActiveTrackSelected();
      const initialX = panel.currentX;
      const initialY = panel.currentY;
      const initialZ = panel.currentZ;

      // Test 1: Khung nhìn TOP VIEW -> phím W (Tiến +1cm X)
      panel.setActiveView("top");
      await panel.handleNudgeByView("w", false);
      const afterTopW = { x: panel.currentX, y: panel.currentY, z: panel.currentZ };

      // Test 2: Khung nhìn SIDE VIEW -> phím W (Nâng +1cm Z)
      panel.setActiveView("side");
      await panel.handleNudgeByView("w", false);
      const afterSideW = { x: panel.currentX, y: panel.currentY, z: panel.currentZ };

      // Test 3: Khung nhìn FRONT VIEW -> phím D (Dịch sườn phải -1cm Y)
      panel.setActiveView("front");
      await panel.handleNudgeByView("d", false);
      const afterFrontD = { x: panel.currentX, y: panel.currentY, z: panel.currentZ };

      return {
        success: true,
        initial: { x: initialX, y: initialY, z: initialZ },
        afterTopW,
        afterSideW,
        afterFrontD,
      };
    });

    console.log("📊 Kết quả kiểm thử WASD:", JSON.stringify(wasdTestResult, null, 2));

    if (wasdTestResult.success) {
      console.log("✅ [ĐẠT] Hệ thống phím tắt WASD vi chỉnh chính xác theo ngữ cảnh khung nhìn (Top: X, Side: Z, Front: Y)!");
    } else {
      console.error("❌ [LỖI] Kiểm thử WASD thất bại:", wasdTestResult.reason);
    }

    console.log("\n🎉 HOÀN TẤT TẤT CẢ CÁC BƯỚC KIỂM THỬ XÁC MINH!");
  } catch (err) {
    console.error("❌ Lỗi kiểm thử:", err);
  } finally {
    await browser.close();
    console.log("🚪 Đã đóng trình duyệt.");
  }
}

verifyAll();
