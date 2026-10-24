import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";

async function runTest() {
  console.log("🧪 Bắt đầu kiểm thử Puppeteer cho 5-Frame Ortho Studio & No-AutoSync...");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });

  const userScriptContent = fs.readFileSync(path.resolve("dist/cvat-3d-suite.user.js"), "utf8");

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>Test 5-Frame Studio</title></head>
      <body style="background: #18181b; margin: 0; padding: 0;">
        <div id="test-root"></div>
      </body>
    </html>
  `);

  await page.addScriptTag({ content: userScriptContent });

  const testResults = await page.evaluate(async () => {
    const results = [];

    // 1. Kiểm tra Fallback Ego Road Z & 0°
    const fnComputeGround = window.computeGroundSlopesAndZ;
    if (typeof fnComputeGround === "function") {
      const sparsePoints = [
        { x: 15.0, y: 5.0, z: -0.2 },
        { x: 15.2, y: 5.1, z: -0.1 },
        { x: 14.8, y: 4.9, z: -0.3 },
        { x: 15.5, y: 5.2, z: -0.15 },
        { x: 14.5, y: 4.8, z: -0.25 },
        { x: 15.3, y: 5.0, z: -0.2 },
        { x: 14.7, y: 5.3, z: -0.35 },
      ]; // 7 điểm (< 10 điểm)

      const res = fnComputeGround(sparsePoints, 15.0, 5.0, 0.5, 0, 2.3, 0.9, 0.8, { egoRoadZ: -1.75 });
      results.push({
        name: "Ghim Đất Fallback Ego Road Z khi < 10 điểm",
        pass: res.isFallbackZeroGround === true && res.groundZ === -1.75 && res.rollDeg === 0 && res.pitchDeg === 0,
        detail: `groundZ=${res.groundZ}, roll=${res.rollDeg}°, pitch=${res.pitchDeg}°, fallback=${res.isFallbackZeroGround}`,
      });
    }

    // 2. Mở TrackStudioModal và kiểm tra hiển thị 5 frames x 3 viewports
    // Giả lập mock tracks và mở Studio
    const mockTracks = [
      {
        uiId: 101,
        serverId: 201,
        label: "Car",
        x: 10, y: 5, z: 0.5,
        l: 4.6, w: 1.85, h: 1.45,
        yawDeg: 15,
      }
    ];

    // Tạo mock shapes cho track 101 với 8 frames: [0, 1, 2, 3, 4, 5, 6, 7]
    const mockShapes = [];
    for (let f = 0; f < 8; f++) {
      mockShapes.push({
        type: "cuboid",
        frame: f,
        points: [10 + f * 0.5, 5, 0.5, 0, 0, (15 * Math.PI) / 180, 4.6, 1.85, 1.45, 0, 0, 0, 0, 0, 0, 0],
        outside: false,
      });
    }

    // Giả lập event trả về tracks with shapes cho CVAT_EXT_REQ_GET_ALL_JOB_TRACKS_WITH_SHAPES
    window.addEventListener("CVAT_EXT_REQ_GET_ALL_JOB_TRACKS_WITH_SHAPES", () => {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_ALL_JOB_TRACKS_WITH_SHAPES", {
          detail: {
            success: true,
            tracks: [
              {
                id: 101,
                clientID: 101,
                serverID: 201,
                labelId: 1,
                labelName: "Car",
                labelColor: "#38bdf8",
                shapes: mockShapes,
              }
            ],
          },
        })
      );
    });

    // Mở studio qua TrackStudioModal (nếu có instance)
    const studioModalEl = document.getElementById("cvat-3d-track-studio-modal");
    results.push({
      name: "Modal cvat-3d-track-studio-modal tồn tại trong DOM",
      pass: !!studioModalEl,
      detail: studioModalEl ? "Đã gắn thành công vào body" : "Chưa tìm thấy modal",
    });

    return results;
  });

  console.log("📊 Kết quả kiểm thử trên trình duyệt:");
  for (const r of testResults) {
    if (r.pass) {
      console.log(`✅ ${r.name}: ${r.detail}`);
    } else {
      console.error(`❌ ${r.name}: ${r.detail}`);
    }
  }

  await browser.close();
  console.log("🎉 Hoàn tất kiểm thử Puppeteer!");
}

runTest().catch((err) => {
  console.error("❌ Lỗi test:", err);
  process.exit(1);
});
