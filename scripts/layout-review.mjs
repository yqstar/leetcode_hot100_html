import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function captureLayout({ cdp, sessionId, evaluate, phase }) {
  const directory = `/private/tmp/lc-layout-review/${phase}`;
  await mkdir(directory, { recursive: true });
  await evaluate(cdp, sessionId, "ensureJudge().then(() => true)");
  const scenarios = [
    ["catalog-desktop", 1440, 1000, 'applyTheme("dark"); showCatalog();'],
    ["workspace-desktop", 1440, 1000, 'openProblem("two-sum", false); setProblemPaneCollapsed(false); elements.code_editor.value = SOLUTIONS["two-sum"].code; updateCodeHighlight();'],
    ["console-desktop", 1440, 1000, 'renderTestConsole("cases");'],
    ["notes-desktop", 1440, 1000, 'switchWorkspaceTab("notes");'],
    ["solution-desktop", 1440, 1000, 'switchWorkspaceTab("solution");'],
    ["catalog-mobile", 390, 844, 'showCatalog();'],
    ["workspace-mobile", 390, 844, 'openProblem("two-sum", false); setProblemPaneCollapsed(true); elements.code_editor.value = SOLUTIONS["two-sum"].code; updateCodeHighlight();'],
    ["console-mobile", 390, 844, 'renderTestConsole("cases");'],
    ["samples-mobile", 390, 844, 'openCustomCaseModal(); customCaseDrafts = Array(10).fill("[[2, 7, 11, 15], 9]"); renderCustomCaseDrafts();'],
    ["export-desktop", 1440, 900, 'closeCustomCaseModal(); openExportModal();'],
    ["import-mobile", 390, 844, 'closeExportModal(); showCatalog(); await previewBackupFile(new File([backupTools.serialize({ records: Object.fromEntries(PROBLEMS.slice(0, 6).map(({ slug }) => [slug, { ...EMPTY_RECORD, note: "样例笔记", code: "print(1)" }])), settings: { ...DEFAULT_SETTINGS } })], "学习记录备份.json"));'],
    ["privacy-mobile", 390, 844, 'closeImportModal(); setPrivacyMode(true);'],
    ["privacy-desktop", 1440, 1000, ''],
    ["catalog-light", 1440, 1000, 'setPrivacyMode(false); applyTheme("light"); showCatalog();'],
  ];
  for (const [name, width, height, setup] of scenarios) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await evaluate(cdp, sessionId, `(async () => {
      ${setup}
      if (currentSlug) syncCurrentEditors(true);
      window.scrollTo(0, 0);
      await document.fonts.ready;
      await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()`);
    if (name === "catalog-light") {
      const color = await evaluate(cdp, sessionId, `({ body: getComputedStyle(document.body).color, title: getComputedStyle(document.querySelector(".category-title")).color, problem: getComputedStyle(document.querySelector(".problem-name")).color })`);
      if (color.body !== color.title || color.body !== color.problem) throw new Error(`浅色文字未同步：${JSON.stringify(color)}`);
    }
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(directory, `${name}.png`), Buffer.from(screenshot.data, "base64"));
  }
  console.log(`页面截图：${directory}`);
}
