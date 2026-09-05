// Runs in the real page so measurements include fonts, flex sizing and scrollbars.
export async function verifyResponsiveLayout() {
  const assert = (condition, message) => { if (!condition) throw new Error(`${innerWidth}×${innerHeight}：${message}`); };
  const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const rect = (node) => node.getBoundingClientRect();
  const withinWidth = () => assert(document.documentElement.scrollWidth <= innerWidth + 1, "页面出现横向溢出");
  const controlsFit = (parent) => {
    const controls = [...parent.querySelectorAll("button, select, input")].filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
    for (const node of controls) {
      const box = rect(node);
      assert(box.left >= -1 && box.right <= innerWidth + 1, `${node.id || node.className} 超出屏幕`);
      for (const other of controls) {
        if (node === other) continue;
        const target = rect(other);
        assert(Math.min(box.right, target.right) - Math.max(box.left, target.left) <= 1 || Math.min(box.bottom, target.bottom) - Math.max(box.top, target.top) <= 1, `${node.id} 与 ${other.id} 重叠`);
      }
    }
  };
  const dialogFits = async (modal) => {
    await settle();
    assert(!modal.classList.contains("hidden"), "预期弹窗没有打开");
    const card = modal.querySelector('[role="dialog"]');
    const body = modal.querySelector(".modal-body");
    const box = rect(card);
    const actions = rect(modal.querySelector(".modal-actions"));
    assert(box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1, "弹窗超出视口");
    assert(card.scrollWidth <= card.clientWidth + 1 && body.scrollWidth <= body.clientWidth + 1, "弹窗内容横向溢出");
    body.scrollTop = body.scrollHeight;
    await settle();
    assert(Math.abs(rect(modal.querySelector(".modal-actions")).top - actions.top) < 1, "滚动内容带走了弹窗操作区");
    for (const button of modal.querySelectorAll(".modal-actions button")) {
      const bounds = rect(button);
      assert(bounds.bottom <= innerHeight && bounds.top >= actions.top, "弹窗按钮不可见");
    }
    controlsFit(modal.querySelector(".modal-actions"));
  };

  showCatalog();
  elements.clear_filter_button.click();
  elements.undo_import_button.classList.remove("hidden");
  window.scrollTo(0, 0);
  await settle();
  withinWidth();
  controlsFit(elements.app_header);
  controlsFit(document.querySelector(".catalog-toolbar"));
  const firstCategory = PROBLEMS[0].category;
  const topic = [...elements.category_navigation.children].find((button) => button.dataset.category === firstCategory);
  topic.focus();
  topic.click();
  assert(elements.category_grid.querySelectorAll(".problem-row").length === problemsByCategory.get(firstCategory).length, "专题筛选数量错误");
  assert(document.activeElement.dataset.category === firstCategory && document.activeElement.getAttribute("aria-pressed") === "true", "专题切换后焦点或选中状态丢失");
  elements.search_input.value = "不存在的题目名称";
  renderCatalog();
  assert(elements.category_grid.querySelector(".empty-state"), "组合筛选缺少空状态");
  elements.clear_filter_button.click();
  assert(elements.category_grid.querySelectorAll(".problem-row").length === 100 && activeCategory === "all", "清除筛选没有恢复全部专题");
  window.scrollTo(0, 600);
  openProblem("two-sum", false);
  setProblemPaneCollapsed(mobileWorkspaceMedia.matches);
  await settle();
  assert(window.scrollY === 0, "从目录进入题目后未回到页面顶部");
  assert(Math.abs(rect(elements.study_view).bottom - innerHeight) <= 1, "工作区高度未贴合视口");
  withinWidth();
  controlsFit(document.querySelector(".study-toolbar"));
  controlsFit(document.querySelector(".editor-toolbar"));
  controlsFit(document.querySelector(".runbar"));
  assert(rect(elements.code_editor).height >= 80, "代码编辑区被工具栏挤压");
  assert(rect(elements.submit_button).bottom <= innerHeight, "提交按钮被裁切");
  elements.code_editor.value = Array.from({ length: 100 }, (_, index) => `value_${index} = ${index}`).join("\n");
  updateCodeHighlight();
  elements.code_editor.scrollTop = elements.code_editor.scrollHeight;
  elements.code_editor.dispatchEvent(new Event("scroll"));
  assert(elements.code_line_numbers.textContent.split("\n").length === 100, "编辑器行号数量错误");
  assert(Math.abs(elements.code_line_numbers.scrollTop - elements.code_editor.scrollTop) <= 1, "行号滚动不同步");
  const editorStyle = getComputedStyle(elements.code_editor);
  const lineStyle = getComputedStyle(elements.code_line_numbers);
  assert(editorStyle.paddingTop === lineStyle.paddingTop && editorStyle.lineHeight === lineStyle.lineHeight, "行号与代码行未对齐");
  renderTestConsole("cases");
  await settle();
  assert(rect(elements.result_panel).height >= 70 && rect(elements.code_editor).height > 0, "控制台挤出了编辑区");
  assert(rect(elements.result_panel).bottom <= rect(document.querySelector(".runbar")).top + 1, "控制台遮挡运行操作");
  closeTestConsole();
  for (const tab of ["notes", "solution"]) {
    switchWorkspaceTab(tab);
    await settle();
    withinWidth();
  }
  switchWorkspaceTab("code");
  setProblemPaneCollapsed(false);
  await settle();
  assert(rect(elements.problem_pane).width > 0, "题面无法展开");
  withinWidth();
  setProblemPaneCollapsed(mobileWorkspaceMedia.matches);

  openExportModal();
  elements.export_format_markdown.click();
  await dialogFits(elements.export_modal);
  closeExportModal();
  openResetCodeModal();
  await dialogFits(elements.reset_code_modal);
  closeResetCodeModal();
  openCustomCaseModal();
  customCaseDrafts = Array(20).fill("[[2, 7, 11, 15], 9]");
  renderCustomCaseDrafts();
  await dialogFits(elements.custom_case_modal);
  closeCustomCaseModal();
  await previewBackupFile(new File([backupTools.serialize({
    records: Object.fromEntries(PROBLEMS.map(({ slug }) => [slug, { ...EMPTY_RECORD, note: "导入预览内容" }])),
    settings: { ...DEFAULT_SETTINGS },
  })], "完整备份.json"));
  await dialogFits(elements.import_modal);
  closeImportModal();
  recordFor("two-sum").status = "solved";
  openResetProgressModal();
  await dialogFits(elements.reset_progress_modal);
  closeResetProgressModal();
  setPrivacyMode(true);
  await settle();
  withinWidth();
  setPrivacyMode(false);
  elements.undo_import_button.classList.add("hidden");
  showCatalog();
  return true;
}
