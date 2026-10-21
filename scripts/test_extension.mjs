import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getCVATCredentials } from "./load_env.mjs";

const { baseUrl } = getCVATCredentials();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, "../dist/extension");
const screenshotDir = path.resolve(__dirname, "../screenshots");

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function runTest() {
  console.log("🚀 Đang khởi động trình duyệt tự động với Chrome Extension...");
  console.log(`📂 Đường dẫn Extension: ${extensionPath}`);

  const browser = await puppeteer.launch({
    headless: false, // Mở giao diện thật để người dùng quan sát được
    defaultViewport: { width: 1440, height: 900 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  const page = await browser.newPage();

  try {
    // -------------------------------------------------------------
    // TEST 1: Kiểm tra trên trang web ngoài (Google.com)
    // KỲ VỌNG: Badge KHÔNG ĐƯỢC PHÉP XUẤT HIỆN
    // -------------------------------------------------------------
    console.log("\n🧪 [TEST 1] Kiểm tra tính an toàn trên trang ngoài (https://www.google.com)...");
    await page.goto("https://www.google.com", { waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));

    const googleBadge = await page.$("#cvat-3d-suite-badge");
    if (!googleBadge) {
      console.log("✅ [TEST 1 ĐẠT]: Extension an toàn tuyệt đối, không hiện badge trên trang ngoài!");
    } else {
      console.error("❌ [TEST 1 THẤT BẠI]: Badge bị rò rỉ trên trang ngoài!");
    }

    // -------------------------------------------------------------
    // TEST 2: Mở trang CVAT ưu tiên từ biến môi trường
    // KỲ VỌNG: Tự nhận diện CVAT và hiện Badge kết nối
    // -------------------------------------------------------------
    const cvatUrl = baseUrl || "https://cvat.example.com";
    console.log(`\n🧪 [TEST 2] Mở CVAT: ${cvatUrl}...`);
    await page.goto(cvatUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Chờ 3 giây để giao diện CVAT và badge nạp xong
    console.log("⏳ Đang chờ CVAT nạp giao diện và Extension kết nối...");
    await new Promise((r) => setTimeout(r, 4000));

    // Kiểm tra sự xuất hiện của Floating Panel (chuẩn shadcn/ui)
    const floatingElement = await page.$("#cvat-3d-suite-floating");
    if (floatingElement) {
      console.log(`✅ [TEST 2 ĐẠT]: Cửa sổ nổi shadcn/ui đã hiển thị thành công trên ${cvatUrl}!`);

      // Chụp ảnh bằng chứng
      const screenshotPath = path.join(screenshotDir, "cvat_floating_verified.png");
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`📸 Đã chụp ảnh màn hình lưu tại: ${screenshotPath}`);
    } else {
      console.log("⚠️ Chưa tìm thấy Floating Panel, đang kiểm tra thêm...");
      const pageTitle = await page.title();
      console.log(`   Tiêu đề trang hiện tại: "${pageTitle}"`);
      const screenshotPath = path.join(screenshotDir, "cvat_debug.png");
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    console.log("\n🎉 KIỂM TRA HOÀN TẤT! Giữ trình duyệt mở thêm 10 giây để bạn quan sát...");
    await new Promise((r) => setTimeout(r, 10000));
  } catch (err) {
    console.error("❌ Lỗi trong quá trình kiểm tra:", err);
  } finally {
    await browser.close();
    console.log("🚪 Đã đóng trình duyệt kiểm thử.");
  }
}

runTest();
