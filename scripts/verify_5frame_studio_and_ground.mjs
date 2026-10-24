import puppeteer from "puppeteer";

async function verify() {
  console.log("🚀 Bắt đầu kiểm thử Puppeteer: 5-Frame Studio & Ghim Đất Fallback Ego Road Z...");

  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: "http://localhost:9222",
      defaultViewport: null,
    });
    console.log("✅ Đã kết nối Chrome qua cổng remote debugging 9222!");
  } catch (e) {
    console.log("ℹ️ Không kết nối được remote debug 9222. Đang mở Chrome mới...");
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  const pages = await browser.pages();
  let cvatPage = pages.find((p) => p.url().includes("cvat.itup.io.vn"));

  if (!cvatPage) {
    console.log("⚠️ Không tìm thấy tab CVAT đang mở, sử dụng trang đầu tiên để test kiểm thử mô phỏng.");
    cvatPage = pages[0];
  }

  console.log("📄 Trang đang kiểm tra:", cvatPage.url());

  // Kiểm tra chức năng Ghim Đất Fallback Ego Road Z trên trang
  const groundFallbackCheck = await cvatPage.evaluate(() => {
    // Gọi thử computeGroundSlopesAndZ nếu có trên globalThis/window
    const fn = (window).computeGroundSlopesAndZ;
    if (typeof fn === "function") {
      const sparse = [
        { x: 10, y: 5, z: -0.2 },
        { x: 10.2, y: 5.1, z: -0.1 },
        { x: 9.8, y: 4.9, z: -0.3 },
      ];
      const res = fn(sparse, 10, 5, 0.5, 0, 2.3, 0.9, 0.8, { egoRoadZ: -1.75 });
      return {
        available: true,
        groundZ: res.groundZ,
        rollDeg: res.rollDeg,
        pitchDeg: res.pitchDeg,
        isFallbackZeroGround: res.isFallbackZeroGround,
      };
    }
    return { available: false };
  });

  console.log("🔍 Kết quả kiểm tra Ghim Đất Fallback Ego Road Z:", groundFallbackCheck);

  // Kiểm tra modal Fullscreen Track Studio
  const studioModalInfo = await cvatPage.evaluate(() => {
    const modal = document.getElementById("cvat-3d-track-studio-modal");
    if (!modal) return { exists: false };

    const frameCards = modal.querySelectorAll(".frame-column-card");
    const canvases = modal.querySelectorAll("canvas");

    return {
      exists: true,
      display: modal.style.display,
      frameColumnsCount: frameCards.length,
      canvasesCount: canvases.length,
    };
  });

  console.log("🔍 Thông tin Studio Modal hiện tại trong DOM:", studioModalInfo);

  console.log("✅ Hoàn thành script kiểm thử!");
}

verify().catch((err) => {
  console.error("❌ Lỗi kiểm thử:", err);
  process.exit(1);
});
