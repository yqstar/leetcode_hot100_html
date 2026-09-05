function resetPrivacyShortcut() {
  lastPrivacyEnterAt = null;
  privacyFirstEnterSnapshot = null;
}

function registerPrivacyEnter(now) {
  const elapsed = lastPrivacyEnterAt == null ? Infinity : now - lastPrivacyEnterAt;
  const isDoubleEnter = elapsed >= 0 && elapsed <= DOUBLE_ENTER_WINDOW_MS;
  lastPrivacyEnterAt = isDoubleEnter ? null : now;
  return isDoubleEnter;
}

function rememberPrivacyFirstEnter(event) {
  const target = event.target;
  privacyFirstEnterSnapshot = target?.matches?.("textarea") ? {
    target,
    value: target.value,
    selectionStart: target.selectionStart,
    selectionEnd: target.selectionEnd,
    selectionDirection: target.selectionDirection,
    scrollTop: target.scrollTop,
  } : null;
}

function restorePrivacyFirstEnter(event) {
  const snapshot = privacyFirstEnterSnapshot;
  if (!snapshot || snapshot.target !== event.target || !snapshot.target.isConnected || snapshot.target.value === snapshot.value) return;
  snapshot.target.value = snapshot.value;
  snapshot.target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd, snapshot.selectionDirection || "none");
  snapshot.target.scrollTop = snapshot.scrollTop;
  snapshot.target.dispatchEvent(new Event("input", { bubbles: true }));
}

function privacyRandomIndex(length, random = Math.random) {
  if (!Number.isInteger(length) || length <= 0) return -1;
  const value = Number(random());
  const unit = Number.isFinite(value) ? clamp(value, 0, 1 - Number.EPSILON) : 0;
  return Math.floor(unit * length);
}

function nextPrivacyVariantIndex(previousIndex, random = Math.random) {
  const length = PRIVACY_PAGE_PRESETS.length;
  if (length <= 1) return 0;
  if (!Number.isInteger(previousIndex) || previousIndex < 0 || previousIndex >= length) return privacyRandomIndex(length, random);
  const candidate = privacyRandomIndex(length - 1, random);
  return candidate >= previousIndex ? candidate + 1 : candidate;
}

function privacyRandomItem(items, random = Math.random) {
  return items[privacyRandomIndex(items.length, random)];
}

function privacyRandomInteger(minimum, maximum, random = Math.random) {
  return minimum + privacyRandomIndex(maximum - minimum + 1, random);
}

function createPrivacyPageModel(previousIndex = privacyVariantIndex, random = Math.random) {
  const variantIndex = nextPrivacyVariantIndex(previousIndex, random);
  const completed = privacyRandomInteger(8, 18, random);
  const remaining = privacyRandomInteger(3, 8, random);
  return {
    variantIndex,
    preset: PRIVACY_PAGE_PRESETS[variantIndex],
    note: privacyRandomItem(PRIVACY_NOTES, random),
    progressLabel: privacyRandomItem(PRIVACY_PROGRESS_LABELS, random),
    completed,
    remaining,
    progress: Math.round(completed / (completed + remaining) * 100),
  };
}

function renderPrivacyPage() {
  const model = createPrivacyPageModel();
  const { preset } = model;
  privacyVariantIndex = model.variantIndex;
  elements.privacy_view.setAttribute("aria-label", preset.documentTitle);
  elements.privacy_brand_mark.textContent = preset.brandMark;
  elements.privacy_brand_name.textContent = preset.brandName;
  elements.privacy_title.textContent = preset.title;
  elements.privacy_summary.textContent = preset.summary;
  elements.privacy_schedule_title.textContent = preset.scheduleTitle;
  elements.privacy_note.textContent = model.note;
  elements.privacy_progress_label.textContent = model.progressLabel;
  elements.privacy_progress_percent.textContent = `${model.progress}%`;
  elements.privacy_progress_detail.textContent = `已完成 ${model.completed} 项，还有 ${model.remaining} 项待处理。`;
  elements.privacy_progress_track.style.setProperty("--privacy-progress", `${model.progress}%`);
  const scheduleItems = preset.schedule.map(([time, title, detail]) => {
    const item = document.createElement("li");
    const timeElement = document.createElement("span");
    const dot = document.createElement("span");
    const task = document.createElement("span");
    const taskTitle = document.createElement("strong");
    const taskDetail = document.createElement("small");
    timeElement.className = "privacy-time";
    timeElement.textContent = time;
    dot.className = "privacy-schedule-dot";
    task.className = "privacy-task";
    taskTitle.textContent = title;
    taskDetail.textContent = detail;
    task.append(taskTitle, taskDetail);
    item.append(timeElement, dot, task);
    return item;
  });
  elements.privacy_schedule.replaceChildren(...scheduleItems);
  return preset.documentTitle;
}

function updatePrivacyPageClock() {
  const now = new Date();
  elements.privacy_date.textContent = PRIVACY_DATE_FORMATTER.format(now);
  elements.privacy_time.textContent = `更新于 ${PRIVACY_TIME_FORMATTER.format(now)}`;
}

function setPrivacyMode(enabled) {
  if (privacyMode === enabled) return;
  privacyMode = enabled;
  resetPrivacyShortcut();
  if (enabled) {
    closeCatalogFilter();
    finishPaneResize();
    syncCurrentEditors(true);
    privacyRestoreTitle = document.title;
    privacyRestoreHash = location.hash;
    privacyRestoreFocus = document.activeElement;
    privacyRestoreScrollX = window.scrollX;
    privacyRestoreScrollY = window.scrollY;
    const privacyDocumentTitle = renderPrivacyPage();
    updatePrivacyPageClock();
    document.body.classList.add("privacy-mode");
    document.body.classList.remove("modal-open");
    elements.app_header.inert = true;
    elements.app_main.inert = true;
    elements.privacy_view.inert = false;
    elements.privacy_view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    document.title = privacyDocumentTitle;
    if (location.hash) history.replaceState(history.state, "", location.href.split("#")[0]);
    return;
  }
  document.body.classList.remove("privacy-mode");
  const modalOpen = Boolean(activeModalController());
  document.body.classList.toggle("modal-open", modalOpen);
  elements.app_header.inert = modalOpen;
  elements.app_main.inert = modalOpen;
  elements.privacy_view.inert = true;
  const baseUrl = location.href.split("#")[0];
  history.replaceState(history.state, "", `${baseUrl}${privacyRestoreHash}`);
  document.title = privacyRestoreTitle || "Python 离线训练场";
  if (privacyRestoreFocus?.isConnected) privacyRestoreFocus.focus({ preventScroll: true });
  window.scrollTo(privacyRestoreScrollX, privacyRestoreScrollY);
  privacyRestoreFocus = null;
}
