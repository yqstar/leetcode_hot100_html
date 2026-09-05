function updateMasteredButton() {
  const solved = statusFor(currentSlug) === "solved";
  elements.mastered_button.textContent = solved ? "✓ 已掌握" : "标记已掌握";
  elements.mastered_button.classList.toggle("success", solved);
  elements.mastered_button.setAttribute("aria-pressed", String(solved));
}

function updateProblemToggleLabel(collapsed) {
  const label = mobileWorkspaceMedia.matches
    ? (collapsed ? "查看题目" : "进入代码")
    : (collapsed ? "展开题目" : "收起题目");
  elements.problem_toggle_button.textContent = label;
  elements.problem_toggle_button.setAttribute("aria-label", label);
}

function setProblemPaneCollapsed(collapsed) {
  finishPaneResize();
  elements.study_view.classList.toggle("problem-collapsed", collapsed);
  elements.problem_pane.inert = collapsed;
  elements.problem_toggle_button.setAttribute("aria-expanded", String(!collapsed));
  updateProblemToggleLabel(collapsed);
}

function problemPaneGeometry() {
  const style = getComputedStyle(elements.study_layout);
  // Grid percentages use the content box; the splitter also occupies a track.
  const contentWidth = elements.study_layout.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  let minimum = PROBLEM_PANE_MIN;
  let maximum = PROBLEM_PANE_MAX;
  if (contentWidth > 0 && !mobileWorkspaceMedia.matches) {
    const available = Math.max(0, contentWidth - elements.pane_resizer.getBoundingClientRect().width);
    const problemMinimum = Math.min(PROBLEM_PANE_MIN_PX, available * PROBLEM_PANE_MIN_PX / (PROBLEM_PANE_MIN_PX + WORKSPACE_PANE_MIN_PX));
    minimum = Math.max(minimum, problemMinimum / contentWidth * 100);
    maximum = Math.max(minimum, Math.min(maximum, (available - WORKSPACE_PANE_MIN_PX) / contentWidth * 100));
  }
  return { contentWidth, minimum, maximum };
}

function constrainedProblemPaneWidth(percent, geometry = problemPaneGeometry()) {
  const requested = Number(percent);
  return clamp(Number.isFinite(requested) ? requested : PROBLEM_PANE_DEFAULT, geometry.minimum, geometry.maximum);
}

function renderProblemPaneWidth(width, geometry) {
  document.documentElement.style.setProperty("--problem-pane-width", `${width}%`);
  const ariaPercent = (value) => String(Math.round(value * 100) / 100);
  elements.pane_resizer.setAttribute("aria-valuemin", ariaPercent(geometry.minimum));
  elements.pane_resizer.setAttribute("aria-valuemax", ariaPercent(geometry.maximum));
  elements.pane_resizer.setAttribute("aria-valuenow", ariaPercent(width));
}

function applyProblemPaneWidth() {
  if (elements.study_view.classList.contains("active")) {
    document.documentElement.style.setProperty("--workspace-top", `${Math.max(0, elements.study_view.getBoundingClientRect().top)}px`);
  }
  const geometry = problemPaneGeometry();
  renderProblemPaneWidth(constrainedProblemPaneWidth(state.settings.problemPaneWidth, geometry), geometry);
}

function setProblemPaneWidth(percent, persist = true, geometry = problemPaneGeometry()) {
  const width = constrainedProblemPaneWidth(percent, geometry);
  state.settings.problemPaneWidth = width;
  renderProblemPaneWidth(width, geometry);
  if (persist) saveState();
}

function startPaneResize(event) {
  if (paneResizeDrag || !event.isPrimary || event.button !== 0 || privacyMode || activeModalController()
    || mobileWorkspaceMedia.matches || !elements.study_view.classList.contains("active")
    || elements.study_view.classList.contains("problem-collapsed")) return;
  const geometry = problemPaneGeometry();
  if (geometry.contentWidth <= 0) return;
  event.preventDefault();
  elements.pane_resizer.focus({ preventScroll: true });
  paneResizeDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startWidth: elements.problem_pane.getBoundingClientRect().width,
    startSetting: state.settings.problemPaneWidth,
    geometry,
  };
  try {
    elements.pane_resizer.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-panes");
  } catch {
    finishPaneResize();
  }
}

function movePaneResize(event) {
  const drag = paneResizeDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  // A release outside the window can omit pointerup. Never resize on hover.
  if (!(event.buttons & 1)) {
    finishPaneResize(event);
    return;
  }
  const width = drag.startWidth + event.clientX - drag.startX;
  setProblemPaneWidth(width / drag.geometry.contentWidth * 100, false, drag.geometry);
}

function finishPaneResize(event) {
  const drag = paneResizeDrag;
  if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
  // Clear first: releasing capture itself dispatches lostpointercapture.
  paneResizeDrag = null;
  document.body.classList.remove("resizing-panes");
  if (elements.pane_resizer.hasPointerCapture(drag.pointerId)) {
    elements.pane_resizer.releasePointerCapture(drag.pointerId);
  }
  if (state.settings.problemPaneWidth !== drag.startSetting) saveState(true);
}

function currentCodeRecordKey(mode = state.settings.codeMode) {
  return mode === "acm" ? "acmCode" : "code";
}

function codeTemplateFor(problem, mode = state.settings.codeMode) {
  return mode === "acm" ? ACM_CODE_TEMPLATE : problem.starterCode;
}

function setCodeMode(mode, saveCurrent = true, persist = true) {
  if (!CODE_MODES.has(mode)) return;
  clearEditorFeedback();
  if (saveCurrent && currentSlug) syncCurrentEditors();
  state.settings.codeMode = mode;
  const acm = mode === "acm";
  elements.core_mode_button.classList.toggle("active", !acm);
  elements.acm_mode_button.classList.toggle("active", acm);
  elements.core_mode_button.setAttribute("aria-pressed", String(!acm));
  elements.acm_mode_button.setAttribute("aria-pressed", String(acm));
  elements.acm_format_card.classList.toggle("hidden", !acm);
  elements.code_editor.setAttribute("aria-label", acm ? "Python ACM 代码编辑器" : "Python 核心代码编辑器");
  elements.editor_shortcuts.textContent = acm
    ? "按题目格式从 stdin 读取 · 输出答案到 stdout · ⌘/Ctrl + Enter 运行"
    : "Tab / 退格缩进 · 括号补全 · Shift + Alt/Option + F 格式化 · ⌘/Ctrl + Enter 运行";
  if (currentSlug) {
    const { problem } = bySlug.get(currentSlug);
    const solution = SOLUTIONS[currentSlug];
    const record = recordFor(currentSlug);
    const key = currentCodeRecordKey(mode);
    elements.code_editor.value = record[key] ?? codeTemplateFor(problem, mode);
    elements.acm_input_description.textContent = acm ? acmInputDescriptionFor(solution) : "";
    elements.acm_sample_input.textContent = acm ? formatAcmCase(solution.tests[0], solution) : "";
    elements.reference_mode_label.textContent = acm ? "ACM 模式参考题解" : "核心模式参考题解";
    elements.reference_code.innerHTML = highlightPython(referenceCodeForMode(solution, mode));
    resetTestConsole();
    updateCodeHighlight();
    updateCursorPosition();
    updateCustomCaseButton();
  }
  if (persist) saveState();
}

function openProblem(slug, updateHash = true) {
  const entry = bySlug.get(slug);
  if (!entry) return;
  closeCatalogFilter();
  finishPaneResize();
  if (!currentSlug) {
    catalogScrollY = window.scrollY;
    catalogFocusSlug = document.activeElement?.closest(".problem-row")?.dataset.slug || null;
  }
  currentSlug = slug;
  const { problem, index } = entry;
  const solution = SOLUTIONS[slug];
  const record = recordFor(slug);
  state.settings.lastSlug = slug;
  saveState();

  elements.catalog_view.classList.remove("active");
  elements.study_view.classList.add("active");
  window.scrollTo(0, 0);
  applyProblemPaneWidth();
  setProblemPaneCollapsed(!state.settings.expandProblemByDefault);
  elements.study_position.textContent = `${index + 1} / ${PROBLEMS.length}`;
  elements.study_title_mini.textContent = `${problem.frontendId}. ${problem.title}`;
  elements.problem_title.textContent = `${problem.frontendId}. ${problem.title}`;
  elements.previous_button.disabled = index === 0;
  elements.next_button.disabled = index === PROBLEMS.length - 1;
  const difficulty = DIFFICULTY[problem.difficulty];
  elements.problem_kicker.innerHTML = `<span class="difficulty ${difficulty.className}">${difficulty.label}</span><span class="tag">${escapeHtml(problem.category)}</span>${problem.tags.slice(0, 5).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}`;
  elements.official_content.innerHTML = officialContentFor(problem);
  setCodeMode(state.settings.codeMode, false, false);
  elements.notes_editor.value = record.note;
  elements.solution_note.textContent = solution.note;
  elements.solution_complexity.textContent = solution.complexity;
  elements.problem_pane.scrollTop = 0;
  updateMasteredButton();
  switchWorkspaceTab("code");
  updateSaveIndicators();
  if (updateHash && location.hash !== `#problem=${encodeURIComponent(slug)}`) {
    location.hash = `problem=${encodeURIComponent(slug)}`;
  }
}

function showCatalog(updateHash = true) {
  clearEditorFeedback();
  finishPaneResize();
  const returning = currentSlug !== null;
  currentSlug = null;
  elements.study_view.classList.remove("active");
  elements.catalog_view.classList.add("active");
  renderCatalog();
  if (returning) {
    window.scrollTo(0, catalogScrollY);
    if (catalogFocusSlug) {
      [...elements.category_grid.querySelectorAll(".problem-row")].find((row) => row.dataset.slug === catalogFocusSlug)?.focus({ preventScroll: true });
    }
  }
  if (updateHash && location.hash) history.pushState(null, "", location.href.split("#")[0]);
}
