import { mkdir, writeFile } from "node:fs/promises";

export async function verifyWorkspacePresentation() {
  const assert = (condition, message) => { if (!condition) throw new Error(`工作区展示：${message}`); };
  const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const snapshot = structuredClone(state);
  const nativeConfirm = window.confirm;
  window.confirm = () => { throw new Error("重置模板不应调用系统确认框"); };
  try {
    openProblem("two-sum", false);
    setCodeMode("acm");
    setProblemPaneCollapsed(false);
    const record = recordFor(currentSlug);
    record.code = "# 保留核心代码";
    record.note = "保留个人笔记";
    record.status = "solved";
    elements.notes_editor.value = record.note;
    elements.code_editor.value = "print('keep')";
    notifyCodeInput();
    syncCurrentEditors(true);
    const beforeCancel = JSON.stringify(state);
    elements.reset_code_button.click();
    await settle();
    assert(!elements.reset_code_modal.classList.contains("hidden") && elements.app_main.inert, "确认框未打开或未隔离背景");
    assert(document.activeElement === elements.reset_code_cancel_button && elements.reset_code_context.textContent.includes("ACM"), "确认框应显示模式并默认聚焦取消");
    elements.reset_code_cancel_button.click();
    assert(JSON.stringify(state) === beforeCancel && elements.code_editor.value === "print('keep')", "取消重置改动了内容");
    elements.reset_code_button.click();
    elements.reset_code_confirm_button.click();
    assert(elements.code_editor.value === ACM_CODE_TEMPLATE && record.acmCode === ACM_CODE_TEMPLATE, "确认后没有恢复并保存当前模式模板");
    assert(record.code === "# 保留核心代码" && record.note === "保留个人笔记" && record.status === "solved", "恢复模板影响了另一模式、笔记或进度");
    assert(elements.editor_feedback.textContent === "已恢复初始模板", "恢复操作没有就地反馈");
    elements.reset_code_button.click();
    setCodeMode("core");
    const beforeStale = elements.code_editor.value;
    elements.reset_code_confirm_button.click();
    assert(elements.code_editor.value === beforeStale, "过期的确认重置了另一模式代码");

    elements.toast_stack.replaceChildren();
    elements.code_editor.value = "def add( a,b):\n return(a+b)\n";
    notifyCodeInput();
    await formatCurrentCode();
    assert(elements.editor_feedback.textContent === "已格式化" && elements.toast_stack.childElementCount === 0, "格式化成功仍使用浮层或缺少反馈");
    assert(elements.code_editor.value === "def add(a, b):\n    return a + b\n", "格式化未应用代码");
    await formatCurrentCode();
    assert(elements.editor_feedback.textContent === "格式已规范，无需调整" && elements.toast_stack.childElementCount === 0, "无需调整应显示轻量提示");
    await new Promise((resolve) => setTimeout(resolve, 3300));
    assert(!elements.editor_feedback.textContent && !elements.editor_statusbar.classList.contains("has-feedback"), "格式化提示没有自动消失");
    showEditorFeedback("已格式化");
    elements.code_editor.value += "\n";
    notifyCodeInput();
    assert(!elements.editor_feedback.textContent, "继续编辑时残留过期提示");
    showEditorFeedback("已格式化");
    setCodeMode("acm");
    assert(!elements.editor_feedback.textContent, "切换模式后残留格式化结果");
    elements.code_editor.value = "def broken(:\n pass";
    notifyCodeInput();
    await formatCurrentCode();
    assert(elements.code_editor.value === "def broken(:\n pass" && elements.toast_stack.querySelector(".error")?.textContent.includes("语法错误"), "语法错误应保留原代码并给出定位信息");

    openExportModal();
    await settle();
    assert(document.activeElement === elements.export_format_json && elements.export_format_json.checked, "导出未使用可聚焦的格式卡片");
    elements.export_format_markdown.click();
    assert(elements.export_format_markdown.checked && !elements.export_code_option.classList.contains("hidden"), "阅读文档卡片未切换实际导出格式");
    elements.export_format_markdown.focus();
    elements.export_format_markdown.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    assert(document.activeElement === elements.export_confirm_button, "单选卡片切换后 Shift+Tab 焦点逸出弹窗");
    elements.export_confirm_button.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    assert(document.activeElement === elements.export_format_markdown, "Tab 未返回当前选中的格式卡片");
    elements.export_format_json.click();
    assert(elements.export_format_json.checked && elements.export_code_option.classList.contains("hidden"), "完整备份卡片未同步内容选项");
    closeExportModal();

    elements.acm_format_card.open = true;
    assert(elements.acm_sample_input.textContent === formatAcmCase(SOLUTIONS[currentSlug].tests[0], SOLUTIONS[currentSlug]), "ACM 展示改变了实际输入样例");
    elements.acm_format_card.querySelector("summary").click();
    assert(!elements.acm_format_card.open, "ACM 说明无法折叠");
    elements.acm_format_card.querySelector("summary").click();
    assert(elements.acm_format_card.open, "ACM 说明无法展开");
  } finally {
    window.confirm = nativeConfirm;
    setFormattingBusy(false);
    if (!elements.reset_code_modal.classList.contains("hidden")) closeResetCodeModal();
    if (!elements.export_modal.classList.contains("hidden")) closeExportModal();
    clearEditorFeedback();
    elements.toast_stack.replaceChildren();
    commitImportedState(snapshot, false);
    refreshImportedState();
    showCatalog(false);
  }
}

export async function captureWorkspacePresentation({ cdp, sessionId, evaluate }) {
  const run = (expression) => evaluate(cdp, sessionId, expression);
  const snapshot = await run("JSON.stringify(state)");
  await mkdir("/private/tmp/lc-components-review", { recursive: true });
  try {
    for (const [name, theme, width, height, setup] of [
      ["format-dark", "dark", 1440, 900, 'showEditorFeedback("格式已规范，无需调整")'],
      ["reset-dark", "dark", 1440, 900, 'openResetCodeModal()'],
      ["export-dark", "dark", 1440, 900, 'openExportModal()'],
      ["acm-dark", "dark", 1440, 900, 'elements.acm_format_card.open = true; elements.acm_format_card.scrollIntoView({ block: "start" })'],
      ["reset-light", "light", 1440, 900, 'openResetCodeModal()'],
      ["export-light", "light", 1440, 900, 'openExportModal()'],
      ["acm-light", "light", 1440, 900, 'elements.acm_format_card.open = true; elements.acm_format_card.scrollIntoView({ block: "start" })'],
      ["format-mobile", "dark", 320, 480, 'setProblemPaneCollapsed(true); showEditorFeedback("格式已规范，无需调整")'],
      ["reset-mobile", "dark", 320, 480, 'openResetCodeModal()'],
      ["export-mobile", "dark", 320, 480, 'openExportModal(); await new Promise(requestAnimationFrame); elements.export_format_markdown.click(); elements.export_format_markdown.focus()'],
      ["acm-mobile", "dark", 390, 844, 'elements.acm_format_card.open = true; elements.acm_format_card.scrollIntoView({ block: "start" })'],
    ]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await run(`(async () => {
        if (!elements.reset_code_modal.classList.contains('hidden')) closeResetCodeModal();
        if (!elements.export_modal.classList.contains('hidden')) closeExportModal();
        applyTheme(${JSON.stringify(theme)}); openProblem('two-sum', false); setCodeMode('acm'); setProblemPaneCollapsed(false);
        elements.code_editor.value = referenceCodeForMode(SOLUTIONS['two-sum'], 'acm'); updateCodeHighlight(); updateCursorPosition(); syncCurrentEditors(true);
        ${setup};
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
      })()`);
      const valid = await run(`(() => {
        if (document.documentElement.scrollWidth > innerWidth) return false;
        const modal = activeModalController()?.element;
        if (modal) {
          const box = modal.querySelector('[role="dialog"]').getBoundingClientRect();
          const actions = modal.querySelector('.modal-actions').getBoundingClientRect();
          return box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth && actions.bottom <= innerHeight;
        }
        if (elements.editor_feedback.textContent) {
          const box = elements.editor_feedback.getBoundingClientRect();
          return box.height > 0 && box.left >= 0 && box.right <= innerWidth && box.bottom <= elements.run_button.getBoundingClientRect().top;
        }
        return true;
      })()`);
      if (!valid) throw new Error(`${name} 展示溢出或遮挡操作区`);
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(`/private/tmp/lc-components-review/${name}.png`, Buffer.from(screenshot.data, "base64"));
    }
  } finally {
    await run(`if (!elements.reset_code_modal.classList.contains('hidden')) closeResetCodeModal();
      if (!elements.export_modal.classList.contains('hidden')) closeExportModal();
      commitImportedState(${snapshot}, false); refreshImportedState(); showCatalog(false); clearEditorFeedback(); saveState(true)`);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 2048, height: 768, deviceScaleFactor: 1, mobile: false }, sessionId);
  }
}
