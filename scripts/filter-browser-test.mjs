import { mkdir, writeFile } from "node:fs/promises";

export async function verifyCatalogFilters({ cdp, sessionId, evaluate }) {
  const run = async (expression) => {
    try { return await evaluate(cdp, sessionId, expression); }
    catch (error) { throw new Error(`筛选检查失败：${expression.slice(0, 180)}\n${error.message}`, { cause: error }); }
  };
  const assert = (condition, message) => { if (!condition) throw new Error(`目录筛选：${message}`); };
  const settle = () => run("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const click = async (selector) => {
    const point = await run(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      const box = element.getBoundingClientRect();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      return { x, y, hit: element.contains(document.elementFromPoint(x, y)) };
    })()`);
    assert(point.hit, `${selector} 被遮挡或超出视口`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 }, sessionId);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1 }, sessionId);
  };
  const key = async (key, code, windowsVirtualKeyCode) => {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode }, sessionId);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode }, sessionId);
  };
  const count = () => run('elements.category_grid.querySelectorAll(".problem-row").length');
  const snapshot = await run("JSON.stringify(state)");
  let stage = "鼠标与键盘";
  try {
    await run('showCatalog(false); clearCatalogFilters(); document.querySelector(".catalog-toolbar").scrollIntoView({ block: "center" })');
    await settle();
    await click("#difficulty-filter");
    assert(await run('document.querySelector("#difficulty-filter").getAttribute("aria-expanded") === "true" && document.activeElement.id === "difficulty-filter"'), "打开菜单后焦点或展开状态不正确");
    await click("#difficulty-filter-option-2");
    assert(await count() === 68 && await run('elements.difficulty_filter.value === "Medium" && document.querySelector("#difficulty-filter .filter-label").textContent === "中等"'), "鼠标选择中等难度未同步结果或标签");
    await key("Enter", "Enter", 13);
    await key("Home", "Home", 36);
    await key("Enter", "Enter", 13);
    assert(await count() === 100 && !(await run("privacyMode")), "连续 Enter 操作误触隐私模式或未选择全部难度");
    await key("ArrowDown", "ArrowDown", 40);
    await key("End", "End", 35);
    await key("Escape", "Escape", 27);
    assert(await count() === 100 && await run("openCatalogFilterControl === null"), "Escape 未取消尚未提交的选择");
    await key(" ", "Space", 32);
    await key("ArrowDown", "ArrowDown", 40);
    await key("Tab", "Tab", 9);
    assert(await count() === 20 && await run('document.activeElement.id === "status-filter"'), "空格、方向键和 Tab 选择或焦点顺序错误");

    await run('recordFor("two-sum").status = "solved"; recordFor("group-anagrams").note = "筛选回归笔记"; clearCatalogFilters()');
    await click("#status-filter");
    await click("#status-filter-option-4");
    assert(await run('elements.status_filter.value === "noted" && [...elements.category_grid.querySelectorAll(".problem-row")].every(row => recordFor(row.dataset.slug).note.trim())'), "有笔记筛选错误");
    await click("#clear-filter-button");
    assert(await count() === 100 && await run('[...document.querySelectorAll(".filter-trigger .filter-label")].map(node => node.textContent).join() === "全部难度,全部状态"'), "清除筛选未同步菜单标签");
    await click("#difficulty-filter");
    await click("#status-filter");
    assert(await run('document.querySelectorAll(".filter-menu:not([hidden])").length === 1 && document.querySelector("#difficulty-filter").getAttribute("aria-expanded") === "false"'), "两个菜单不应同时展开");
    await click("#search-input");
    assert(await run('openCatalogFilterControl === null && document.activeElement === elements.search_input'), "点击外部未关闭菜单或抢走了搜索框焦点");

    for (const action of ['openProblem("two-sum", false)', 'openExportModal()', 'setPrivacyMode(true)']) {
      stage = action;
      await click("#difficulty-filter");
      await run(action);
      assert(await run('openCatalogFilterControl === null'), "切换页面或弹窗后菜单残留");
      await run('closeExportModal(); setPrivacyMode(false); showCatalog(false); document.querySelector(".catalog-toolbar").scrollIntoView({ block: "center" })');
      await settle();
    }

    await mkdir("/private/tmp/lc-filter-review", { recursive: true });
    for (const [theme, width, height] of [["dark", 1440, 900], ["light", 1440, 900], ["dark", 390, 844], ["dark", 320, 480]]) {
      stage = `${theme} ${width}px`;
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await run(`closeCatalogFilter(); applyTheme(${JSON.stringify(theme)}); clearCatalogFilters(); document.querySelector(".catalog-toolbar").scrollIntoView({ block: "center" })`);
      await settle();
      await click("#difficulty-filter");
      await settle();
      assert(await run('[...document.querySelectorAll(".filter-label")].every(label => label.scrollWidth <= label.clientWidth)'), `${width}px：筛选名称被截断`);
      assert(await run(`(() => {
        const menu = document.querySelector('.filter-menu:not([hidden])');
        if (!menu) return false;
        const box = menu.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
          && document.documentElement.scrollWidth <= innerWidth && getComputedStyle(menu).color === getComputedStyle(document.body).color;
      })()`), `${theme} ${width}px：菜单溢出视口或主题文字不匹配`);
      await run('Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))');
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(`/private/tmp/lc-filter-review/${theme}-${width}.png`, Buffer.from(screenshot.data, "base64"));
      await click("#difficulty-filter-option-1");
      assert(await count() === 20, `${width}px：窄屏菜单选项无法点击`);
    }
    // Coarse-pointer hit targets and touch selection use the same themed menu.
    stage = "触摸";
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true }, sessionId);
    await run('clearCatalogFilters(); document.querySelector(".catalog-toolbar").scrollIntoView({ block: "center" })');
    await settle();
    for (const selector of ["#status-filter", "#status-filter-option-3"]) {
      const point = await run(`(() => { const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 0 }; })()`);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] }, sessionId);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, sessionId);
      await settle();
    }
    assert(await run('elements.status_filter.value === "solved"'), "触摸操作没有提交状态选择");
  } catch (error) {
    throw new Error(`${stage}：${error.message}`, { cause: error });
  } finally {
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false }, sessionId);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 2048, height: 768, deviceScaleFactor: 1, mobile: false }, sessionId);
    await run(`closeCatalogFilter(); closeExportModal(); setPrivacyMode(false); commitImportedState(${snapshot}, false); refreshImportedState(); clearCatalogFilters(); showCatalog(false); saveState(true); window.scrollTo(0, 0)`);
  }
}
