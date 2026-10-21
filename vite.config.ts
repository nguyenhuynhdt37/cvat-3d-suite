import { defineConfig } from "vite";
import fs from "fs";
import path from "path";

function dualBuildPlugin() {
  return {
    name: "dual-build-plugin",
    closeBundle() {
      const headerPath = path.resolve(__dirname, "src/userscript.header.js");
      const distUserScriptPath = path.resolve(__dirname, "dist/cvat-3d-suite.user.js");
      const extensionDir = path.resolve(__dirname, "dist/extension");

      if (fs.existsSync(distUserScriptPath)) {
        const bundleCode = fs.readFileSync(distUserScriptPath, "utf-8");

        // 1. Tạo Userscript có Header
        if (fs.existsSync(headerPath)) {
          const header = fs.readFileSync(headerPath, "utf-8");
          fs.writeFileSync(distUserScriptPath, header + "\n" + bundleCode, "utf-8");
          console.log("✅ Đã xuất Userscript: dist/cvat-3d-suite.user.js");
        }

        // 2. Tạo Chrome Extension (Manifest V3 - Main World Access)
        if (!fs.existsSync(extensionDir)) {
          fs.mkdirSync(extensionDir, { recursive: true });
        }

        const manifest = {
          manifest_version: 3,
          name: "CVAT 3D Suite",
          version: "1.0.0",
          description: "CVAT 3D Point Cloud Annotation & Alignment Assistant",
          permissions: ["activeTab"],
          content_scripts: [
            {
              matches: ["*://*/*"],
              js: ["content.js"],
              run_at: "document_end",
              world: "MAIN",
            },
          ],
        };

        fs.writeFileSync(
          path.join(extensionDir, "manifest.json"),
          JSON.stringify(manifest, null, 2),
          "utf-8"
        );
        fs.writeFileSync(path.join(extensionDir, "content.js"), bundleCode, "utf-8");
        console.log("✅ Đã xuất Chrome Extension (world: MAIN): dist/extension/");
      }
    },
  };
}

export default defineConfig({
  plugins: [dualBuildPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "CVAT3DSuite",
      fileName: () => "cvat-3d-suite.user.js",
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
