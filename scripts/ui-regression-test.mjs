// Executed against both standalone artifacts in a disposable Chrome profile.
export async function verifyUiRegressions() {
  const assert = (value, message) => { if (!value) throw new Error(`界面回归：${message}`); };
  const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const snapshot = structuredClone(state);
  const nativeSetItem = Storage.prototype.setItem;
  const first = PROBLEMS[0].slug;
  const backup = { records: { [first]: { ...EMPTY_RECORD, note: '保留记录 <script> & "中文"', code: "print(42)", status: "solved" } }, settings: { ...DEFAULT_SETTINGS } };
  showCatalog();
  try {
    commitImportedState(structuredClone(backup), false);
    refreshImportedState();
    const nav = elements.category_navigation.children[1];
    const row = elements.category_grid.querySelector(".problem-row");
    renderCatalog();
    assert(elements.category_grid.querySelector(".problem-row") === row, "无变化重绘不应替换题目 DOM");
    nav.focus();
    nav.click();
    renderCatalog();
    assert(elements.category_navigation.children[1] === nav && document.activeElement === nav, "筛选应复用专题按钮并保持焦点");
    clearCatalogFilters();
    for (const [query, expected] of [["数组   TWO", [first, "median-of-two-sorted-arrays"]], ["ＴＷＯ　ＳＵＭ", [first]], ["哈希 两数", [first]]]) {
      elements.search_input.value = query;
      renderCatalog();
      const actual = [...elements.category_grid.querySelectorAll(".problem-row")].map((row) => row.dataset.slug).sort();
      assert(JSON.stringify(actual) === JSON.stringify(expected.sort()), `组合或全角搜索失败：${query} → ${actual.join(", ")}`);
    }
    assert(elements.category_grid.querySelector("mark")?.textContent === "两数", "匹配文字应安全高亮");
    assert(highlightedMatch('<img src=x onerror=alert(1)>', ["img"]).startsWith('&lt;<mark>img</mark>'), "高亮必须转义 HTML");
    elements.search_input.value = "没有这道题";
    renderCatalog();
    elements.category_grid.querySelector("[data-clear-filters]").click();
    assert(elements.category_grid.querySelectorAll(".problem-row").length === 100 && document.activeElement === elements.search_input, "空结果按钮应恢复目录并聚焦搜索");
    assert(elements.easy_progress.getAttribute("aria-valuenow") === "1" && elements.easy_count.textContent === "1/20" && elements.progress_orbit.getAttribute("aria-valuenow") === "1", "分难度与总体统计应来自真实记录");

    window.scrollTo(0, 500);
    const scroll = window.scrollY;
    const focusRow = elements.category_grid.querySelector(".problem-row");
    focusRow.focus({ preventScroll: true });
    focusRow.click();
    await settle();
    showCatalog();
    assert(Math.abs(window.scrollY - scroll) <= 1 && document.activeElement.dataset.slug === first, "返回目录应恢复滚动位置和题目焦点");
    openProblem(first, false);
    elements.code_editor.value = "value = 1";
    notifyCodeInput();
    assert(elements.code_save_state.dataset.state === "pending", "编辑后显示保存中");
    saveState(true);
    assert(elements.code_save_state.dataset.state === "saved" && JSON.parse(localStorage.getItem(STORAGE_KEY)).records[first].code === "value = 1", "已保存必须对应真实磁盘内容");
    Storage.prototype.setItem = function () { throw new DOMException("测试配额不足", "QuotaExceededError"); };
    elements.code_editor.value = "value = 2";
    notifyCodeInput();
    saveState(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert(elements.code_save_state.textContent === "仅内存" && elements.notes_save_state.dataset.state === "memory", "写入失败不能在计时器后误报已保存");
    const loaded = loadState();
    assert(loaded.records[first].code === "value = 1" && loaded.records[first].note === backup.records[first].note, "写入配额不足仍须加载已有记录");
    Storage.prototype.setItem = nativeSetItem;
    localStorage.setItem(STORAGE_KEY, '{"records":broken');
    storageAvailable = true;
    loadState();
    saveState(true);
    assert(!storageAvailable && localStorage.getItem(STORAGE_KEY) === '{"records":broken', "损坏存储必须保留原始值并暂停覆盖");
    commitImportedState(structuredClone(backup), false);
    refreshImportedState();
    openProblem(first, false);

    const initialCode = elements.code_editor.value;
    setFormattingBusy(true);
    for (const key of ["Tab", "(", "Enter", "Backspace"]) {
      elements.code_editor.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
    assert(elements.code_editor.value === initialCode, "格式化只读期间不能被自定义键盘逻辑改写");
    setFormattingBusy(false);
    elements.code_editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", isComposing: true, bubbles: true, cancelable: true }));
    assert(elements.code_editor.value === initialCode, "输入法组合期间不处理缩进");
    elements.code_editor.value = '# ' + "a".repeat(210_000) + "\n";
    updateCodeHighlight();
    assert(!elements.code_highlight.querySelector("span") && elements.code_highlight.textContent === elements.code_editor.value + " ", "长代码应降级为安全纯文本渲染");
    elements.code_editor.value = initialCode;
    updateCodeHighlight();
    assert(elements.code_highlight.querySelector(".py-builtin"), "恢复短代码后应重新启用语法高亮");
    assert(elements.reference_code.querySelector(".py-keyword"), "参考代码使用语法高亮");
    changeEditorSize(100, false);
    assert(elements.font_up_button.disabled && !elements.font_down_button.disabled, "最大字号禁用增大按钮");
    changeEditorSize(-100, false);
    assert(elements.font_down_button.disabled && !elements.font_up_button.disabled, "最小字号禁用减小按钮");

    showCatalog();
    openExportModal();
    const modalFocus = elements.export_format_json;
    await settle();
    modalFocus.focus();
    modalFocus.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
    assert(document.activeElement === modalFocus, "搜索快捷键不能从弹窗中抢走焦点");
    closeExportModal();
    openExportModal();
    closeExportModal();
    elements.search_input.focus();
    await settle();
    assert(document.activeElement === elements.search_input, "已关闭弹窗的延迟焦点不能回到隐藏控件");
    elements.random_button.focus();
    elements.random_button.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
    assert(document.activeElement === elements.search_input, "Ctrl+K 应聚焦目录搜索");

    let cloneRejected = false;
    try { await requestPythonWorker({ postMessage() { throw new DOMException("不能克隆", "DataCloneError"); } }, "run", {}, 1000); }
    catch { cloneRejected = true; }
    assert(cloneRejected && pendingPythonRequest === null, "Worker 消息发送失败必须释放请求与超时定时器");
    return true;
  } finally {
    Storage.prototype.setItem = nativeSetItem;
    setFormattingBusy(false);
    if (!elements.export_modal.classList.contains("hidden")) closeExportModal();
    showCatalog();
    clearCatalogFilters();
    commitImportedState(snapshot, false);
    refreshImportedState();
    elements.toast_stack.replaceChildren();
  }
}
