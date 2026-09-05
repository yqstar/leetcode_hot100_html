function showModal(modal, focusTarget) {
  closeCatalogFilter();
  finishPaneResize();
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  elements.app_header.inert = true;
  elements.app_main.inert = true;
  requestAnimationFrame(() => {
    if (!modal.classList.contains("hidden") && !privacyMode) focusTarget()?.focus();
  });
}

function hideModal(modal, returnFocus) {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  elements.app_header.inert = false;
  elements.app_main.inert = false;
  returnFocus?.focus();
}

function openResetCodeModal() {
  if (!currentSlug || evaluationInProgress || formattingInProgress) return;
  const { problem } = bySlug.get(currentSlug);
  pendingCodeReset = { slug: currentSlug, mode: state.settings.codeMode, source: elements.code_editor.value };
  elements.reset_code_context.textContent = `${problem.frontendId}. ${problem.title} · ${pendingCodeReset.mode === "acm" ? "ACM 模式" : "核心代码模式"}`;
  showModal(elements.reset_code_modal, () => elements.reset_code_cancel_button);
}

function closeResetCodeModal() {
  pendingCodeReset = null;
  hideModal(elements.reset_code_modal, elements.reset_code_button);
}

function confirmCodeReset() {
  const target = pendingCodeReset;
  if (!target) return;
  closeResetCodeModal();
  if (target.slug !== currentSlug || target.mode !== state.settings.codeMode || target.source !== elements.code_editor.value
    || evaluationInProgress || formattingInProgress) return toast("题目或代码已经变化，请重新确认要恢复的模板", "error");
  elements.code_editor.value = codeTemplateFor(bySlug.get(target.slug).problem, target.mode);
  notifyCodeInput();
  syncCurrentEditors(true);
  updateCursorPosition();
  showEditorFeedback("已恢复初始模板");
}

function trapModalFocus(modal, event) {
  if (event.key !== "Tab" || modal.classList.contains("hidden")) return;
  const focusable = [...modal.querySelectorAll('button, input, textarea, select, summary, [href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

function updateCustomCaseButton() {
  const count = customCasesFor().length;
  elements.custom_case_button.title = count ? `查看测试用例，含 ${count} 个自定义样例` : "查看测试用例";
  elements.custom_case_button.setAttribute("aria-label", elements.custom_case_button.title);
}

function renderCustomCaseDrafts(focusIndex = -1) {
  const inputMode = state.settings.codeMode === "acm" ? "ACM 标准" : "JSON";
  elements.custom_case_list.innerHTML = customCaseDrafts.length
    ? customCaseDrafts.map((value, index) => `<article class="custom-case-editor">
        <div class="custom-case-head"><span>自定义样例 ${index + 1}</span><button class="button small ghost custom-case-remove" type="button" data-remove-custom-case="${index}">删除</button></div>
        <textarea class="custom-case-input" data-custom-case-index="${index}" maxlength="${MAX_CUSTOM_CASE_LENGTH}" spellcheck="false" aria-label="自定义样例 ${index + 1} 的 ${inputMode} 输入">${escapeHtml(value)}</textarea>
      </article>`).join("")
    : `<div class="empty-state">还没有自定义样例，点击“再加一个”开始。</div>`;
  elements.custom_case_add_button.disabled = customCaseDrafts.length >= MAX_CUSTOM_CASES;
  elements.custom_case_add_button.title = elements.custom_case_add_button.disabled ? `最多添加 ${MAX_CUSTOM_CASES} 个自定义样例` : "添加一个自定义样例";
  if (focusIndex >= 0) requestAnimationFrame(() => elements.custom_case_list.querySelector(`[data-custom-case-index="${focusIndex}"]`)?.focus());
}

function addCustomCaseDraft() {
  if (customCaseDrafts.length >= MAX_CUSTOM_CASES) return toast(`最多添加 ${MAX_CUSTOM_CASES} 个自定义样例`, "error");
  customCaseDrafts.push(customCaseTemplateFor());
  renderCustomCaseDrafts(customCaseDrafts.length - 1);
}

function openCustomCaseModal() {
  if (!currentSlug) return;
  const acm = state.settings.codeMode === "acm";
  customCaseDrafts = [...customCasesFor()];
  elements.custom_case_description.textContent = acm
    ? `每个样例按当前题目的标准输入格式填写，最多添加 ${MAX_CUSTOM_CASES} 个。${acmInputDescriptionFor(SOLUTIONS[currentSlug])}运行时由参考解计算期望结果。`
    : `每个样例填写一段 JSON 输入，最多添加 ${MAX_CUSTOM_CASES} 个。运行时会在内置样例之后执行这些自定义样例，并由参考解自动计算期望结果。`;
  elements.custom_case_template.textContent = customCaseTemplateFor();
  if (!customCaseDrafts.length) addCustomCaseDraft();
  else renderCustomCaseDrafts();
  showModal(elements.custom_case_modal, () => elements.custom_case_list.querySelector("textarea"));
}

function closeCustomCaseModal() {
  customCaseDrafts = [];
  hideModal(elements.custom_case_modal, elements.custom_case_button);
}

function saveCustomCases() {
  const acm = state.settings.codeMode === "acm";
  const solution = SOLUTIONS[currentSlug];
  const normalized = [];
  for (const [index, source] of customCaseDrafts.entries()) {
    try {
      const value = parseCustomCase(source, solution);
      normalized.push(acm ? formatAcmCase(value, solution) : JSON.stringify(value, null, 2));
    } catch (error) {
      renderCustomCaseDrafts(index);
      toast(`自定义样例 ${index + 1} 格式错误：${error.message}`, "error");
      return;
    }
  }
  const record = recordFor(currentSlug);
  record[acm ? "acmCustomCases" : "customCases"] = normalized;
  record.updatedAt = timestamp();
  saveState(true);
  Object.assign(testConsoleState, { evaluation: null, evaluatedCases: [], view: "cases" });
  testConsoleState.caseIndex = clamp(testConsoleState.caseIndex, 0, Math.max(0, normalized.length + Math.min(2, solution.tests.length) - 1));
  updateCustomCaseButton();
  closeCustomCaseModal();
  if (elements.result_panel.classList.contains("open")) renderTestConsole("cases");
  toast(normalized.length ? `已保存 ${normalized.length} 个自定义样例` : "已清空自定义样例");
}
