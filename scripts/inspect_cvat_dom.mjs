import puppeteer from "puppeteer";
import { getCVATCredentials } from "./load_env.mjs";

const { altUsername, password, altJobUrl } = getCVATCredentials();

async function inspectCVAT() {
  console.log("🔍 Đang kết nối CVAT để điều tra cấu trúc DOM và cơ chế Active Object...");
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  const cvatUrl = altJobUrl;
  await page.goto(cvatUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  await new Promise((r) => setTimeout(r, 2000));
  if (page.url().includes("/auth/login")) {
    console.log("🔑 Đang đăng nhập...");
    await page.waitForSelector("input#credential, input#username, input[type='text']", { timeout: 10000 });
    await page.type("input#credential, input#username, input[type='text']", altUsername);
    await page.type("input#password, input[type='password']", password);
    await page.click("button[type='submit']");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
  }

  console.log("⏳ Chờ giao diện CVAT nạp đầy đủ (8 giây)...");
  await new Promise((r) => setTimeout(r, 8000));

  // Điều tra các selectors trong sidebar đối tượng
  const domInfo = await page.evaluate(() => {
    const results = [];

    // 1. Quét tất cả element có class liên quan đến objects/sidebar
    const allElements = document.querySelectorAll("*");
    const classSet = new Set();
    const idList = [];

    for (const el of allElements) {
      if (el.id && el.id.includes("cvat")) {
        idList.push(el.id);
      }
      for (const cls of el.classList) {
        if (cls.includes("object") || cls.includes("item") || cls.includes("active") || cls.includes("sidebar")) {
          classSet.add(cls);
        }
      }
    }

    // 2. Tìm danh sách items trong objects sidebar
    const items = document.querySelectorAll("[class*='cvat-objects-sidebar-state-item'], [class*='objects-sidebar-state-item']");
    const itemDetails = [];
    for (const item of items) {
      itemDetails.push({
        tag: item.tagName,
        className: item.className,
        id: item.id,
        text: item.innerText?.slice(0, 50),
        attributes: Array.from(item.attributes).map(a => `${a.name}="${a.value}"`),
      });
    }

    // 3. Tìm Redux Store
    let reduxStateKeys = null;
    let activatedID = null;

    try {
      const root = document.getElementById("root");
      const fiberKey = Object.keys(root || {}).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
      if (fiberKey && root) {
        let curr = root[fiberKey];
        while (curr) {
          if (curr.memoizedState && curr.memoizedState.element && curr.memoizedState.element.props && curr.memoizedState.element.props.store) {
            const store = curr.memoizedState.element.props.store;
            const state = store.getState();
            reduxStateKeys = Object.keys(state);
            activatedID = state.annotation?.annotations?.activatedStateID;
            break;
          }
          if (curr.stateNode && curr.stateNode.store) {
            const store = curr.stateNode.store;
            const state = store.getState();
            reduxStateKeys = Object.keys(state);
            activatedID = state.annotation?.annotations?.activatedStateID;
            break;
          }
          curr = curr.child;
        }
      }
    } catch (e) {
      reduxStateKeys = `Lỗi tìm Redux: ${e.message}`;
    }

    return {
      classes: Array.from(classSet).slice(0, 30),
      ids: idList.slice(0, 20),
      itemsCount: items.length,
      itemDetails: itemDetails.slice(0, 5),
      reduxStateKeys,
      activatedID,
    };
  });

  console.log("📊 KẾT QUẢ ĐIỀU TRA DOM CVAT:");
  console.log(JSON.stringify(domInfo, null, 2));

  // Thử click vào item đầu tiên trong danh sách objects nếu có
  console.log("\n🖱️ Thử click vào item đầu tiên trong danh sách objects...");
  const firstItemClicked = await page.evaluate(() => {
    const firstItem = document.querySelector<HTMLElement>("[class*='cvat-objects-sidebar-state-item'], .ant-collapse-item, .ant-tree-treenode");
    if (firstItem) {
      firstItem.click();
      return {
        clicked: true,
        className: firstItem.className,
        text: firstItem.innerText?.slice(0, 50),
      };
    }
    return { clicked: false };
  });
  console.log("Kết quả click item:", firstItemClicked);

  await new Promise((r) => setTimeout(r, 2000));

  // Kiểm tra lại class sau khi click
  const afterClickInfo = await page.evaluate(() => {
    const active = document.querySelector<HTMLElement>("[class*='active'], [class*='selected']");
    return active ? { tag: active.tagName, className: active.className, text: active.innerText?.slice(0, 50) } : null;
  });
  console.log("Element active sau khi click:", afterClickInfo);

  await browser.close();
  console.log("🚪 Đã hoàn thành điều tra.");
}

inspectCVAT();
