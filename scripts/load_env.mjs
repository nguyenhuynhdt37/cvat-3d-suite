import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.resolve(projectRoot, ".env");

// Nạp file .env từ root dự án
if (fs.existsSync(envPath)) {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  } else {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const idx = line.indexOf("=");
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^['"](.*)['"]$/, "$1");
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
  }
}

/**
 * Lấy cấu hình đăng nhập & URL CVAT từ biến môi trường.
 * Bắt buộc phải có CVAT_USERNAME và CVAT_PASSWORD trong .env.
 */
export function getCVATCredentials() {
  const username = process.env.CVAT_USERNAME;
  const password = process.env.CVAT_PASSWORD;
  const jobUrl = process.env.CVAT_JOB_URL;
  const baseUrl = process.env.CVAT_BASE_URL;

  if (!username || !password) {
    console.error("❌ [LỖI BẢO MẬT]: Chưa tìm thấy CVAT_USERNAME hoặc CVAT_PASSWORD trong biến môi trường / file .env!");
    console.error("👉 Vui lòng tạo file .env (tham khảo .env.example) và cấu hình tài khoản trước khi chạy test.");
    process.exit(1);
  }

  return {
    username,
    password,
    jobUrl: jobUrl || "",
    baseUrl: baseUrl || "",
    altUsername: process.env.CVAT_ALT_USERNAME || username,
    altBaseUrl: process.env.CVAT_ALT_BASE_URL || baseUrl || "",
    altJobUrl: process.env.CVAT_ALT_JOB_URL || jobUrl || "",
  };
}
