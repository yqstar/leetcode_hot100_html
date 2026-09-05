elements.category_grid.addEventListener("click", (event) => {
  if (event.target.closest("[data-clear-filters]")) {
    clearCatalogFilters();
    elements.search_input.focus();
    return;
  }
  const row = event.target.closest(".problem-row");
  if (row && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    openProblem(row.dataset.slug);
  }
});
elements.search_input.addEventListener("input", scheduleCatalogRender);
elements.search_input.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.search_input.value) {
    event.preventDefault();
    elements.search_input.value = "";
    renderCatalog();
  }
});
[elements.difficulty_filter, elements.status_filter].forEach((element) => element.addEventListener("change", renderCatalog));
elements.clear_filter_button.addEventListener("click", clearCatalogFilters);
elements.category_navigation.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category;
  renderCatalog();
});
elements.continue_button.addEventListener("click", () => openProblem(state.settings.lastSlug));
elements.random_button.addEventListener("click", () => {
  const remaining = PROBLEMS.filter((problem) => statusFor(problem.slug) !== "solved");
  const pool = remaining.length ? remaining : PROBLEMS;
  openProblem(pool[Math.floor(Math.random() * pool.length)].slug);
});
elements.auto_expand_button.addEventListener("click", () => {
  applyProblemExpansionPreference(!state.settings.expandProblemByDefault);
});
elements.back_button.addEventListener("click", () => showCatalog());
elements.problem_toggle_button.addEventListener("click", () => {
  const collapsed = !elements.study_view.classList.contains("problem-collapsed");
  setProblemPaneCollapsed(collapsed);
  if (mobileWorkspaceMedia.matches && collapsed) requestAnimationFrame(() => elements.code_editor.focus());
});
elements.previous_button.addEventListener("click", () => { const index = bySlug.get(currentSlug).index; if (index > 0) openProblem(PROBLEMS[index - 1].slug); });
elements.next_button.addEventListener("click", () => { const index = bySlug.get(currentSlug).index; if (index + 1 < PROBLEMS.length) openProblem(PROBLEMS[index + 1].slug); });
elements.mastered_button.addEventListener("click", () => {
  const record = recordFor(currentSlug);
  record.status = record.status === "solved" ? (record.attempts ? "attempted" : "todo") : "solved";
  record.updatedAt = timestamp();
  record.passedAt = record.status === "solved" ? record.updatedAt : null;
  saveState(true); updateMasteredButton(); toast(record.status === "solved" ? "已标记为掌握" : "已取消掌握标记");
});
workspaceTabButtons.forEach((button) => button.addEventListener("click", () => switchWorkspaceTab(button.dataset.tab)));
elements.workspace_tabs.addEventListener("keydown", (event) => {
  const target = keyboardTabTarget(event, workspaceTabButtons);
  if (target) switchWorkspaceTab(target.dataset.tab, true);
});
elements.code_editor.addEventListener("input", () => { clearEditorFeedback(); touchRecord("code"); scheduleCodeHighlight(); });
elements.code_editor.addEventListener("scroll", () => {
  elements.code_highlight.scrollTop = elements.code_editor.scrollTop;
  elements.code_highlight.scrollLeft = elements.code_editor.scrollLeft;
  elements.code_line_numbers.scrollTop = elements.code_editor.scrollTop;
});
elements.code_editor.addEventListener("click", updateCursorPosition);
elements.code_editor.addEventListener("keyup", updateCursorPosition);
elements.code_editor.addEventListener("keydown", (event) => {
  if (elements.code_editor.readOnly || event.isComposing) return;
  const plainEditingKey = !event.metaKey && !event.ctrlKey && !event.altKey && !event.isComposing;
  if (event.key === "/" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    toggleCodeComment();
    return;
  }
  if (event.key === "Backspace" && plainEditingKey && (deleteEmptyCodePair() || deleteCodeIndent())) {
    event.preventDefault();
    return;
  }
  if (plainEditingKey && EDITOR_BRACKET_PAIRS[event.key] && insertCodeBracketPair(event.key)) {
    event.preventDefault();
    return;
  }
  if (plainEditingKey && EDITOR_CLOSING_BRACKETS.has(event.key) && skipCodeClosingBracket(event.key)) {
    event.preventDefault();
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    indentCodeSelection(event.shiftKey);
    return;
  }
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault(); runEvaluation(event.shiftKey ? "submit" : "sample");
    return;
  }
  if (event.key === "Enter" && !event.altKey && !event.isComposing) {
    event.preventDefault();
    insertIndentedNewline();
  }
});
elements.notes_editor.addEventListener("input", () => touchRecord("note"));
elements.font_down_button.addEventListener("click", () => changeEditorSize(-1));
elements.font_up_button.addEventListener("click", () => changeEditorSize(1));
codeModeSwitch.addEventListener("click", (event) => {
  const button = event.target.closest(".code-mode-button");
  const mode = button === elements.core_mode_button ? "core"
    : button === elements.acm_mode_button ? "acm"
      : event.clientX < codeModeSwitch.getBoundingClientRect().left + codeModeSwitch.offsetWidth / 2 ? "core" : "acm";
  if (state.settings.codeMode !== mode) setCodeMode(mode);
});
elements.format_code_button.addEventListener("click", formatCurrentCode);
elements.reset_code_button.addEventListener("click", openResetCodeModal);
elements.reset_code_cancel_button.addEventListener("click", closeResetCodeModal);
elements.reset_code_confirm_button.addEventListener("click", confirmCodeReset);
elements.copy_solution_button.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(referenceCodeForMode(SOLUTIONS[currentSlug]));
    toast("参考代码已复制");
  } catch {
    toast("浏览器未允许复制到剪贴板", "error");
  }
});
elements.run_button.addEventListener("click", () => runEvaluation("sample"));
elements.submit_button.addEventListener("click", () => runEvaluation("submit"));
elements.custom_case_button.addEventListener("click", toggleTestConsole);
elements.custom_case_add_button.addEventListener("click", addCustomCaseDraft);
elements.custom_case_cancel_button.addEventListener("click", closeCustomCaseModal);
elements.custom_case_save_button.addEventListener("click", saveCustomCases);
elements.custom_case_list.addEventListener("input", (event) => {
  const index = Number(event.target.dataset.customCaseIndex);
  if (event.target.matches(".custom-case-input") && Number.isInteger(index)) customCaseDrafts[index] = event.target.value;
});
elements.custom_case_list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-custom-case]");
  if (!button) return;
  const index = Number(button.dataset.removeCustomCase);
  customCaseDrafts.splice(index, 1);
  renderCustomCaseDrafts();
});
elements.result_panel.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-console]")) return closeTestConsole();
  if (event.target.closest("[data-add-custom-case]")) return openCustomCaseModal();
  const viewButton = event.target.closest("[data-console-view]");
  if (viewButton) return renderTestConsole(viewButton.dataset.consoleView);
  const caseButton = event.target.closest("[data-console-case]");
  if (caseButton) {
    testConsoleState.caseIndex = Number(caseButton.dataset.consoleCase);
    renderTestConsole();
  }
});
elements.result_panel.addEventListener("keydown", (event) => {
  const tabs = [...(event.target.parentElement?.querySelectorAll('[role="tab"]') || [])];
  const target = keyboardTabTarget(event, tabs);
  if (target) {
    target.focus();
    target.click();
  }
});
elements.export_button.addEventListener("click", openExportModal);
elements.export_cancel_button.addEventListener("click", closeExportModal);
elements.export_format_options.addEventListener("change", updateExportOptions);
elements.export_confirm_button.addEventListener("click", exportLearningRecords);
elements.reset_progress_button.addEventListener("click", openResetProgressModal);
elements.reset_progress_cancel_button.addEventListener("click", closeResetProgressModal);
elements.reset_progress_confirm_button.addEventListener("click", confirmResetProgress);
elements.import_button.addEventListener("click", () => {
  try { requireDataIdle(); elements.backup_file_input.click(); }
  catch (error) { toast(error.message, "error"); }
});
elements.backup_file_input.addEventListener("change", async () => {
  const file = elements.backup_file_input.files[0];
  elements.backup_file_input.value = "";
  if (!file) return;
  try {
    await previewBackupFile(file);
  } catch (error) { toast(error.message || "JSON 备份导入失败", "error"); }
});
elements.import_policy_select.addEventListener("change", updateImportPreview);
elements.import_settings_checkbox.addEventListener("change", updateImportPreview);
elements.import_memory_checkbox.addEventListener("change", updateImportPreview);
elements.import_cancel_button.addEventListener("click", closeImportModal);
elements.import_confirm_button.addEventListener("click", confirmBackupImport);
elements.undo_import_button.addEventListener("click", undoLastImport);
elements.theme_button.addEventListener("click", () => { applyTheme(state.settings.theme === "dark" ? "light" : "dark"); saveState(); });
for (const { element, close } of MODAL_CONTROLLERS) {
  element.addEventListener("click", (event) => { if (event.target === element) close(); });
  element.addEventListener("keydown", (event) => trapModalFocus(element, event));
}
elements.pane_resizer.addEventListener("pointerdown", startPaneResize);
elements.pane_resizer.addEventListener("lostpointercapture", finishPaneResize);
window.addEventListener("pointermove", movePaneResize, true);
window.addEventListener("pointerup", finishPaneResize, true);
window.addEventListener("pointercancel", finishPaneResize, true);
window.addEventListener("blur", finishPaneResize);
elements.pane_resizer.addEventListener("dblclick", () => setProblemPaneWidth(PROBLEM_PANE_DEFAULT));
elements.pane_resizer.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const current = constrainedProblemPaneWidth(state.settings.problemPaneWidth);
  const target = event.key === "Home" ? PROBLEM_PANE_MIN
    : event.key === "End" ? PROBLEM_PANE_MAX
      : current + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 5 : 2);
  setProblemPaneWidth(target);
});
document.addEventListener("keydown", (event) => {
  if (handleCatalogFilterKeydown(event)) {
    resetPrivacyShortcut();
    return;
  }
  const modifier = event.metaKey || event.ctrlKey;
  const modal = activeModalController();
  if (!privacyMode && !modal && currentSlug && event.key.toLowerCase() === "f" && event.shiftKey && event.altKey && !modifier) {
    event.preventDefault();
    resetPrivacyShortcut();
    formatCurrentCode();
    return;
  }
  if (!privacyMode && !modal && modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    resetPrivacyShortcut();
    syncCurrentEditors(true);
    toast(storageAvailable ? "代码与笔记已保存" : "内容已保存在本次会话内存中");
    return;
  }
  const searchShortcut = event.key === "/" && !modifier && !event.altKey && !event.target.matches("input, textarea, select, [contenteditable]")
    || modifier && event.key.toLowerCase() === "k";
  if (!privacyMode && !modal && !event.isComposing && searchShortcut && elements.catalog_view.classList.contains("active")) {
    event.preventDefault();
    resetPrivacyShortcut();
    elements.search_input.focus();
    if (modifier) elements.search_input.select();
    return;
  }
  if (event.key === "Escape") {
    if (paneResizeDrag) {
      event.preventDefault();
      finishPaneResize();
      resetPrivacyShortcut();
      return;
    }
    resetPrivacyShortcut();
    if (privacyMode) return;
    if (modal) modal.close();
    else if (elements.result_panel.classList.contains("open")) {
      closeTestConsole();
      elements.code_editor.focus();
    }
    return;
  }
  if (event.key !== "Enter") {
    resetPrivacyShortcut();
    return;
  }
  if (modal) {
    resetPrivacyShortcut();
    return;
  }
  if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    resetPrivacyShortcut();
    return;
  }
  if (!registerPrivacyEnter(performance.now())) {
    rememberPrivacyFirstEnter(event);
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  restorePrivacyFirstEnter(event);
  setPrivacyMode(!privacyMode);
}, true);
document.addEventListener("pointerdown", resetPrivacyShortcut);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    closeCatalogFilter();
    finishPaneResize();
    syncCurrentEditors(true);
  }
});
window.addEventListener("hashchange", route);
window.addEventListener("resize", () => {
  finishPaneResize();
  applyProblemPaneWidth();
});
const workspaceLayoutObserver = new ResizeObserver(applyProblemPaneWidth);
workspaceLayoutObserver.observe(elements.app_header);
workspaceLayoutObserver.observe(elements.storage_warning);
mobileWorkspaceMedia.addEventListener("change", () => {
  finishPaneResize();
  applyProblemPaneWidth();
  updateProblemToggleLabel(elements.study_view.classList.contains("problem-collapsed"));
});
window.addEventListener("pagehide", () => {
  finishPaneResize();
  syncCurrentEditors(true);
});

initializeCatalogFilters();
applyTheme(state.settings.theme);
updateSaveIndicators();
applyProblemExpansionPreference(state.settings.expandProblemByDefault, false);
changeEditorSize(0, false);
applyProblemPaneWidth();
setCodeMode(state.settings.codeMode, false, false);
route();
prewarmJudge();
