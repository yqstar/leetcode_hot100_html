import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyBackupInBrowser } from "./backup-browser-test.mjs";
import { captureLayout } from "./layout-review.mjs";
import { verifyResponsiveLayout } from "./layout-browser-test.mjs";
import { verifyUiRegressions } from "./ui-regression-test.mjs";
import { verifySplitter } from "./splitter-browser-test.mjs";
import { verifyCatalogFilters } from "./filter-browser-test.mjs";
import { verifyWorkspacePresentation, captureWorkspacePresentation } from "./presentation-browser-test.mjs";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const applicationFiles = ["lc_offline.html", "lc_offline_compact.html"];
const commandTimeoutMs = 15_000;

async function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (isAbsolute(candidate)) {
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }
    const located = spawnSync("which", [candidate], { encoding: "utf8" });
    if (located.status === 0 && located.stdout.trim()) return located.stdout.trim();
  }
  throw new Error("未找到 Chrome 或 Chromium；可通过 CHROME_PATH 指定浏览器路径");
}

class CdpPipe {
  constructor(process) {
    this.process = process;
    this.nextId = 0;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    process.stdio[4].on("data", (chunk) => this.receive(chunk));
    process.stdio[4].on("error", (error) => this.close(error));
    process.on("exit", (code, signal) => {
      this.close(new Error(`Chrome 提前退出（code=${code}, signal=${signal || "none"}）`));
    });
  }

  receive(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let separator;
    while ((separator = this.buffer.indexOf(0)) >= 0) {
      const packet = this.buffer.subarray(0, separator).toString("utf8");
      this.buffer = this.buffer.subarray(separator + 1);
      if (!packet) continue;
      let message;
      try {
        message = JSON.parse(packet);
      } catch {
        this.close(new Error("Chrome 调试管道返回了无效 JSON"));
        return;
      }
      if (!message.id || !this.pending.has(message.id)) continue;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result);
    }
  }

  send(method, params = {}, sessionId = null, timeoutMs = commandTimeoutMs) {
    const id = ++this.nextId;
    const packet = { id, method, params };
    if (sessionId) packet.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超过 ${Math.round(timeoutMs / 1000)} 秒未响应`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this.process.stdio[3].write(`${JSON.stringify(packet)}\0`, (error) => {
        if (!error || !this.pending.has(id)) return;
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  close(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForApplication(cdp, sessionId, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const evaluation = await cdp.send("Runtime.evaluate", {
        expression: "document.readyState === 'complete' && typeof ensureJudge === 'function'",
        returnByValue: true,
      }, sessionId);
      if (evaluation.result?.value === true) return;
    } catch {
      // The compact build replaces its document while starting; retry in the new context.
    }
    await delay(200);
  }
  throw new Error("离线应用未在 30 秒内完成页面启动");
}

async function evaluateValue(cdp, sessionId, expression) {
  const evaluation = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text || "页面脚本异常");
  }
  return evaluation.result?.value;
}

async function clickElement(cdp, sessionId, selector) {
  const point = await evaluateValue(cdp, sessionId, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const bounds = element.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2;
    return { x, y, target: document.elementFromPoint(x, y)?.id || "" };
  })()`);
  if (!point || point.target !== selector.slice(1)) {
    throw new Error(`${selector} 中心点无法命中：${JSON.stringify(point)}`);
  }
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 }, sessionId);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 }, sessionId);
}

const smokeExpression = `
(async () => {
  elements.difficulty_filter.value = "Hard";
  renderCatalog();
  const hardCount = elements.category_grid.querySelectorAll(".problem-row").length;
  elements.difficulty_filter.value = "all";
  elements.search_input.value = "  TWO SUM  ";
  renderCatalog();
  const searchPassed = elements.category_grid.querySelectorAll(".problem-row").length === 1
    && elements.category_grid.querySelector(".problem-row").dataset.slug === "two-sum";
  elements.clear_filter_button.click();
  const catalogPassed = hardCount === 12 && searchPassed
    && elements.category_grid.querySelectorAll(".problem-row").length === 100
    && elements.category_grid.querySelectorAll(".category-card").length === 17;
  const routeSettled = new Promise((resolve) => window.addEventListener("hashchange", resolve, { once: true }));
  openProblem("two-sum");
  switchWorkspaceTab("notes");
  await routeSettled;
  const routePassed = elements.notes_editor.closest('[role="tabpanel"]').classList.contains("active");
  switchWorkspaceTab("code");
  setCodeMode("core");
  elements.code_editor.value = "# before typing";
  updateCodeHighlight();
  let highlightUpdates = 0;
  const highlightObserver = new MutationObserver((records) => { highlightUpdates += records.length; });
  highlightObserver.observe(elements.code_highlight, { childList: true });
  for (let index = 0; index < 10; index += 1) {
    elements.code_editor.value = "print(" + index + ")";
    notifyCodeInput();
  }
  const savedBeforeRender = recordFor("two-sum").code === "print(9)";
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const highlightPassed = savedBeforeRender && highlightUpdates === 1 && elements.code_highlight.textContent === "print(9)";
  highlightObserver.disconnect();
  const solution = SOLUTIONS["two-sum"];
  const { code: referenceCode, tests, note: _note, complexity: _complexity, ...meta } = solution;
  const coreCases = tests.slice(0, 2).map((value) => ({ value }));
  const core = await evaluate({
    mode: "core",
    userCode: referenceCode,
    referenceCode,
    meta,
    cases: coreCases,
  }, 12_000);
  const acmCases = tests.slice(0, 2).map((value) => ({
    value,
    stdin: formatAcmCase(value, solution),
  }));
  const acm = await evaluate({
    mode: "acm",
    userCode: acmReferenceCodeFor(solution),
    referenceCode,
    meta,
    cases: acmCases,
  }, 12_000);
  const formatted = await formatPythonSource("def add( a,b):\\n return(a+b)\\n", 12_000);
  const unchanged = await formatPythonSource(formatted.code, 12_000);
  document.querySelector("#custom-case-button").click();
  const caseViewPassed = document.querySelector("#result-panel").classList.contains("open")
    && document.querySelectorAll("[data-console-view]").length === 2
    && document.querySelectorAll("[data-console-case]").length === 2
    && [...document.querySelectorAll(".console-field-label")].map((element) => element.textContent).join("|") === "nums =|target =";
  renderResults(core, "sample", coreCases);
  const resultViewPassed = document.querySelector('[data-console-view="results"]')?.classList.contains("active")
    && document.querySelectorAll("[data-console-case]").length === core.results.length
    && document.querySelector(".console-result-title")?.textContent.includes("运行通过")
    && [...document.querySelectorAll(".console-field-label")].some((element) => element.textContent === "实际结果");
  elements.code_editor.value = referenceCode;
  recordFor("two-sum").customCases = ["[[5,1,9],10]"];
  await runEvaluation("sample");
  document.querySelector('[data-console-case="2"]').click();
  const customResultPassed = testConsoleState.evaluation.passed
    && document.querySelector('[data-console-case="2"]').textContent === "自定义样例 1"
    && document.querySelector(".console-field-value").textContent === "[5,1,9]"
    && testConsoleState.evaluation.results.every((result) => !["index", "visible", "input", "label"].some((key) => Object.hasOwn(result, key)));
  recordFor("two-sum").customCases = [];
  setCodeMode("acm");
  document.querySelector("#custom-case-button").click();
  const acmCaseViewPassed = document.querySelector(".console-field-label")?.textContent === "标准输入"
    && document.querySelector(".console-field-value")?.textContent === formatAcmCase(solution.tests[0], solution);
  setCodeMode("core");
  setEvaluationBusy(true, "sample");
  document.querySelector("#acm-mode-button").click();
  const modeSwitchWhileBusyPassed = state.settings.codeMode === "acm";
  setEvaluationBusy(false, "sample");
  setFormattingBusy(true);
  document.querySelector("#core-mode-button").click();
  const modeSwitchWhileFormattingPassed = state.settings.codeMode === "core";
  setFormattingBusy(false);
  let repeatedModeSwitchPassed = true;
  for (let index = 0; index < 8; index += 1) {
    const mode = index % 2 ? "acm" : "core";
    document.querySelector("#" + mode + "-mode-button").click();
    repeatedModeSwitchPassed &&= state.settings.codeMode === mode;
  }
  let timeoutPassed = false;
  try {
    await evaluate({ mode: "core", userCode: "while True: pass", referenceCode, meta, cases: coreCases }, 100);
  } catch (error) {
    timeoutPassed = error.message.includes("已终止 Python 进程");
  }
  const restarted = await evaluate({ mode: "core", userCode: referenceCode, referenceCode, meta, cases: coreCases }, 12_000);
  return {
    runtime: document.querySelector("#runtime-status span:last-child")?.textContent,
    corePassed: core?.passed === true,
    acmPassed: acm?.passed === true,
    consolePassed: caseViewPassed && resultViewPassed && customResultPassed && acmCaseViewPassed,
    modeSwitchPassed: modeSwitchWhileBusyPassed && modeSwitchWhileFormattingPassed && repeatedModeSwitchPassed,
    formatPassed: formatted?.ok === true && formatted.code === "def add(a, b):\\n    return a + b\\n" && unchanged.ok && !unchanged.changed,
    routePassed,
    catalogPassed,
    highlightPassed,
    restartPassed: timeoutPassed && restarted.passed,
  };
})()
`;

async function testBackupLayout(cdp, sessionId, relativePath) {
  await evaluateValue(cdp, sessionId, `previewBackupFile(new File([backupTools.serialize({
    records: Object.fromEntries(PROBLEMS.map(({ slug }) => [slug, { ...EMPTY_RECORD, note: "笔记示例", code: "print(1)" }])),
    settings: { ...DEFAULT_SETTINGS },
  })], "lc-progress.json"))`);
  for (const [width, height] of [[2048, 768], [375, 812]]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    const layout = await evaluateValue(cdp, sessionId, `(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const card = elements.import_modal.querySelector('[role="dialog"]');
      const rect = card.getBoundingClientRect();
      elements.import_confirm_button.scrollIntoView({ block: "nearest" });
      const button = elements.import_confirm_button.getBoundingClientRect();
      const valid = rect.top >= 0 && rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
        && card.scrollWidth <= card.clientWidth && button.bottom <= innerHeight;
      card.scrollTop = 0;
      return valid;
    })()`);
    if (!layout) throw new Error(`${relativePath} 导入预览在 ${width}px 下溢出或无法确认`);
    if (process.env.SMOKE_SCREENSHOT_DIR) {
      await mkdir(process.env.SMOKE_SCREENSHOT_DIR, { recursive: true });
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(process.env.SMOKE_SCREENSHOT_DIR, `${relativePath}-${width}.png`), Buffer.from(screenshot.data, "base64"));
    }
  }
  await evaluateValue(cdp, sessionId, "closeImportModal(); openExportModal()");
  const exportLayout = await evaluateValue(cdp, sessionId, `(() => {
    elements.export_format_markdown.click();
    const card = elements.export_modal.querySelector('[role="dialog"]');
    const rect = card.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && card.scrollWidth <= card.clientWidth;
  })()`);
  if (!exportLayout) throw new Error(`${relativePath} 移动端导出选项溢出`);
  await evaluateValue(cdp, sessionId, "closeExportModal()");
}

async function testApplication(cdp, relativePath) {
  const url = pathToFileURL(join(rootPath, relativePath)).href;
  const { targetId } = await cdp.send("Target.createTarget", { url });
  try {
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.bringToFront", {}, sessionId);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 2048,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId);
    await waitForApplication(cdp, sessionId);
    if (process.argv.includes("--layout-before") || process.argv.includes("--layout-after")) {
      await captureLayout({ cdp, sessionId, evaluate: evaluateValue, phase: process.argv.includes("--layout-before") ? "before" : "after" });
      return;
    }
    if (!process.argv.includes("--splitter-only") && !process.argv.includes("--filters-only")) {
      await evaluateValue(cdp, sessionId, "ensureJudge().then(() => true)");
      await evaluateValue(cdp, sessionId, `(${verifyWorkspacePresentation.toString()})()`);
      await captureWorkspacePresentation({ cdp, sessionId, evaluate: evaluateValue });
      console.log(`PASS ${relativePath} 格式化就地反馈、模板恢复确认、导出格式卡片、ACM 折叠说明及 11 张明暗与移动端截图`);
      if (process.argv.includes("--components-only")) return;
    }
    if (!process.argv.includes("--splitter-only")) {
      await verifyCatalogFilters({ cdp, sessionId, evaluate: evaluateValue });
      console.log(`PASS ${relativePath} 筛选菜单明暗主题、真实鼠标与触摸、键盘选择、取消、焦点及窄屏布局`);
      if (process.argv.includes("--filters-only")) return;
    }
    await verifySplitter({ cdp, sessionId, evaluate: evaluateValue, reload: async () => {
      await cdp.send("Page.reload", {}, sessionId);
      await waitForApplication(cdp, sessionId);
    } });
    console.log(`PASS ${relativePath} 分栏真实鼠标拖动、四种桌面宽度、捕获丢失、失焦、松开兜底、页面切换、键盘调整及刷新恢复`);
    if (process.argv.includes("--splitter-only")) return;
    const startupModeUiPassed = await evaluateValue(cdp, sessionId, `(() => {
      const acm = state.settings.codeMode === "acm";
      return elements.core_mode_button.classList.contains("active") === !acm
        && elements.acm_mode_button.classList.contains("active") === acm
        && elements.core_mode_button.getAttribute("aria-pressed") === String(!acm)
        && elements.acm_mode_button.getAttribute("aria-pressed") === String(acm);
    })()`);
    if (!startupModeUiPassed) throw new Error(`${relativePath} 首页启动模式与页头选中状态不一致`);
    await evaluateValue(cdp, sessionId, 'setCodeMode("acm"); saveState(true)');
    await cdp.send("Page.reload", {}, sessionId);
    await waitForApplication(cdp, sessionId);
    const restoredAcmUiPassed = await evaluateValue(cdp, sessionId, `state.settings.codeMode === "acm"
      && elements.acm_mode_button.classList.contains("active")
      && elements.acm_mode_button.getAttribute("aria-pressed") === "true"
      && !elements.core_mode_button.classList.contains("active")`);
    if (!restoredAcmUiPassed) throw new Error(`${relativePath} 重载后未正确显示已保存的 ACM 选中状态`);
    await evaluateValue(cdp, sessionId, 'showCatalog(false); setCodeMode("core")');
    for (const mode of ["acm", "core", "acm", "core", "acm"]) {
      await clickElement(cdp, sessionId, `#${mode}-mode-button`);
      const selectedMode = await evaluateValue(cdp, sessionId, "state.settings.codeMode");
      if (selectedMode !== mode) throw new Error(`${relativePath} 首页真实点击 ${mode.toUpperCase()} 模式失败`);
    }
    const evaluation = await cdp.send("Runtime.evaluate", {
      expression: smokeExpression,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId, 60_000);
    if (evaluation.exceptionDetails) {
      throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text || "页面测试异常");
    }
    const result = evaluation.result?.value;
    if (!result?.corePassed || !result?.acmPassed || !result?.formatPassed || !result?.consolePassed || !result?.modeSwitchPassed
      || !result?.catalogPassed || !result?.routePassed || !result?.highlightPassed || !result?.restartPassed || result.runtime !== "离线 Python 已就绪") {
      throw new Error(`${relativePath} 浏览器测试失败：${JSON.stringify(result)}`);
    }
    const backupPassed = await evaluateValue(cdp, sessionId, `(${verifyBackupInBrowser.toString()})()`);
    if (!backupPassed) throw new Error(`${relativePath} 备份恢复测试失败`);
    await evaluateValue(cdp, sessionId, `(${verifyUiRegressions.toString()})()`);
    await testBackupLayout(cdp, sessionId, relativePath);
    for (const [width, height] of [[320, 480], [375, 667], [390, 844], [768, 1024], [900, 700], [1024, 768], [1440, 900]]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluateValue(cdp, sessionId, `(${verifyResponsiveLayout.toString()})()`);
    }
    console.log(`PASS ${relativePath} 在 file:// 下完成真实点击、核心/ACM 评测、控制台、连续格式化、路由保持、合并高亮刷新和 Worker 超时重启`);
    console.log(`PASS ${relativePath} 完整备份下载、空白环境恢复、冲突预览、撤销、部分无效记录、存储失败处理及桌面/移动端布局`);
    console.log(`PASS ${relativePath} 7 种视口的专题筛选、编辑器行号、工作区、5 类弹窗及隐私页布局`);
    console.log(`PASS ${relativePath} 搜索归一化、DOM 复用、返回定位、真实保存状态、配额与损坏记录恢复、长代码、键盘隔离及 Worker 发送失败处理`);
  } finally {
    await cdp.send("Target.closeTarget", { targetId }).catch(() => {});
  }
}

const executable = await chromeExecutable();
const profilePath = await mkdtemp(join(tmpdir(), "lc-offline-browser-"));
let stderr = "";
const chrome = spawn(executable, [
  "--headless=new",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-extensions",
  "--disable-gpu",
  "--disable-sync",
  "--metrics-recording-only",
  "--no-default-browser-check",
  "--no-first-run",
  "--remote-debugging-pipe",
  `--user-data-dir=${profilePath}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
const chromeClosed = new Promise((resolve) => chrome.once("close", resolve));
chrome.stderr.on("data", (chunk) => {
  stderr = (stderr + chunk.toString("utf8")).slice(-8_000);
});
const cdp = new CdpPipe(chrome);

try {
  await cdp.send("Browser.getVersion");
  for (const relativePath of process.argv.some((arg) => arg.startsWith("--layout-")) ? applicationFiles.slice(0, 1) : applicationFiles) await testApplication(cdp, relativePath);
  await cdp.send("Browser.close").catch(() => {});
} catch (error) {
  if (stderr.trim()) error.message += `\nChrome 日志：\n${stderr.trim()}`;
  throw error;
} finally {
  if (chrome.exitCode == null) chrome.kill("SIGTERM");
  await chromeClosed;
  await rm(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
