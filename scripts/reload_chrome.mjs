import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Tự động reload các tab chrome://extensions/ trên Google Chrome (macOS AppleScript)
 * Hỗ trợ reload cả tab CVAT nếu truyền options.reloadCVAT = true.
 */
export async function reloadChromeExtensions(options = { reloadCVAT: false }) {
  if (process.platform !== "darwin") {
    console.log("ℹ️ [Auto-Reload] Tự động reload chỉ khả dụng trên macOS qua AppleScript.");
    return { success: false, reason: "not_macos" };
  }

  const reloadCVAT = options.reloadCVAT === true;

  const appleScript = `
tell application "System Events"
  set isRunning to (name of processes) contains "Google Chrome"
end tell

if isRunning then
  tell application "Google Chrome"
    set extReloadCount to 0
    set cvatReloadCount to 0
    repeat with w in windows
      repeat with t in tabs of w
        set tabUrl to (URL of t)
        if tabUrl starts with "chrome://extensions" then
          tell t to reload
          set extReloadCount to extReloadCount + 1
        else if ${reloadCVAT ? "true" : "false"} and (tabUrl contains "cvat" or tabUrl contains "/jobs/") then
          tell t to reload
          set cvatReloadCount to cvatReloadCount + 1
        end if
      end repeat
    end repeat
    return (extReloadCount as string) & "," & (cvatReloadCount as string)
  end tell
else
  return "-1,-1"
end if
`;

  try {
    const { stdout } = await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`);
    const [extStr, cvatStr] = stdout.trim().split(",");
    const extCount = parseInt(extStr, 10);
    const cvatCount = parseInt(cvatStr, 10);

    if (extCount >= 0) {
      if (extCount > 0) {
        console.log(`🔄 [Auto-Reload] Đã tự động reload ${extCount} tab chrome://extensions/ trên Google Chrome!`);
      } else {
        console.log("ℹ️ [Auto-Reload] Google Chrome đang mở nhưng không có tab nào ở chrome://extensions/");
      }

      if (cvatCount > 0) {
        console.log(`🔄 [Auto-Reload] Đã tự động reload ${cvatCount} tab CVAT!`);
      }

      return { success: true, extCount, cvatCount };
    } else {
      console.log("ℹ️ [Auto-Reload] Google Chrome hiện không chạy.");
      return { success: false, reason: "chrome_not_running" };
    }
  } catch (err) {
    console.warn("⚠️ [Auto-Reload] Không thể reload tab Google Chrome:", err.message);
    return { success: false, error: err };
  }
}

// Chạy trực tiếp từ dòng lệnh: node scripts/reload_chrome.mjs [--cvat]
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const reloadCVAT = args.includes("--cvat");
  reloadChromeExtensions({ reloadCVAT });
}
