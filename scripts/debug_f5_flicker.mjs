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

async function debugF5() {
  console.log("\n========================================================================");
  console.log("🔍 ĐANG CHẠY KIỂM THỬ GỠ LỖI F5: THEO DÕI NHÁY & ID ẢO");
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

  // Thu thập console logs từ extension
  const extensionLogs = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("CVAT 3D Suite") || text.includes("VinCalib") || text.includes("error") || text.includes("Error")) {
      extensionLogs.push(`[${new Date().toISOString().slice(11, 23)}] [${msg.type()}] ${text}`);
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
    console.log("⏳ Chờ 6 giây để CVAT nạp Point Cloud và khởi tạo...");
    await new Promise((r) => setTimeout(r, 6000));

    // 3. Kiểm tra trạng thái ban đầu trước khi F5
    const initialStatus = await page.evaluate(() => {
      const panel = (window).__CVAT_3D_SUITE_PANEL_INSTANCE__;
      const floatingEl = document.getElementById("cvat-3d-suite-floating");
      const sidebarEl = document.querySelector(".cvat-objects-sidebar");
      const titleEl = floatingEl?.querySelector("[style*='font-family: ui-monospace']");
      return {
        hasPanelInstance: !!panel,
        hasFloatingEl: !!floatingEl,
        isDocked: panel?.isDocked,
        selectedUiId: panel?.selectedUiId,
        selectedServerId: panel?.selectedServerId,
        frameTracksCount: panel?.frameTracks?.length || 0,
        frameTracks: panel?.frameTracks || [],
        floatingStyle: floatingEl ? {
          position: floatingEl.style.position,
          top: floatingEl.style.top,
          right: floatingEl.style.right,
          width: floatingEl.style.width,
        } : null,
        titleText: titleEl?.textContent?.trim() || null,
      };
    });
    console.log("\n📊 [TRẠNG THÁI TRƯỚC KHI F5]:", JSON.stringify(initialStatus, null, 2));

    await page.screenshot({ path: path.join(screenshotDir, "f5_before_reload.png") });

    // 4. THỰC HIỆN F5 (RELOAD TRANG)
    console.log("\n🔄 [BƯỚC 3] THỰC HIỆN F5 (page.reload())...");
    extensionLogs.length = 0; // Xóa logs cũ để đo riêng sau F5

    await page.reload({ waitUntil: "domcontentloaded" });
    console.log("⚡ Trang đã domcontentloaded, bắt đầu theo dõi nháy và ID ảo trong 8 giây...");

    // Theo dõi liên tục từng 500ms trong 8 giây
    const timeline = [];
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const snap = await page.evaluate((elapsedMs) => {
        const panel = (window).__CVAT_3D_SUITE_PANEL_INSTANCE__;
        const floatingEl = document.getElementById("cvat-3d-suite-floating");
        const titleEl = floatingEl?.querySelector("[style*='font-family: ui-monospace']");
        return {
          elapsedMs,
          hasPanel: !!panel,
          hasFloatingEl: !!floatingEl,
          isDocked: panel?.isDocked || false,
          selectedUiId: panel?.selectedUiId ?? null,
          tracksLen: panel?.frameTracks?.length || 0,
          titleText: titleEl?.textContent?.trim() || null,
          floatingRight: floatingEl?.style.right,
          floatingTop: floatingEl?.style.top,
        };
      }, (i + 1) * 500);
      timeline.push(snap);
      console.log(`  ⏱️ [${snap.elapsedMs}ms] ID: ${snap.selectedUiId} | Tracks: ${snap.tracksLen} | Docked: ${snap.isDocked} | Title: "${snap.titleText}" | Pos: (top:${snap.floatingTop}, right:${snap.floatingRight})`);
    }

    await page.screenshot({ path: path.join(screenshotDir, "f5_after_8s.png") });

    console.log("\n🏁 [KẾT QUẢ THEO DÕI F5]:");
    console.log(JSON.stringify(timeline, null, 2));

  } catch (err) {
    console.error("❌ Lỗi kiểm thử:", err);
  } finally {
    await browser.close();
    console.log("🚪 Đã đóng trình duyệt.");
  }
}

debugF5();
