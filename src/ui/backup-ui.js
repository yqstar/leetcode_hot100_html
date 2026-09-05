function markdownTableCell(value) {
  return escapeHtml(value)
    .replaceAll("|", "&#124;")
    .replace(/\r?\n/g, "<br>");
}

function markdownCodeCell(value) {
  const content = String(value ?? "").replace(/\r\n/g, "\n").split("\n")
    .map((line) => markdownTableCell(line.replaceAll("\t", "    ")).replaceAll(" ", "&nbsp;"))
    .join("<br>");
  return `<code>${content}</code>`;
}

function exportMarkdownText(includeCode = false, exportedAt = new Date()) {
  const stats = statistics();
  const lines = [
    "# LC 学习记录", "",
    `> 由 Python 离线训练场导出于 ${exportedAt.toLocaleString("zh-CN")}。`, "",
    "> 此文件用于阅读与分享。恢复代码、样例、进度和设置请使用完整 JSON 备份。", "",
    `- 进度：**${stats.solved} / ${PROBLEMS.length}**`,
    `- 进行中：${stats.attempted}`, `- 笔记：${stats.noted}`, `- 提交：${stats.submissions} 次`, "",
    "## 题目、笔记与个人代码", "",
  ];
  const headers = includeCode ? ["题目名", "笔记", "核心代码", "ACM 代码"] : ["题目名", "笔记"];
  lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`);
  for (const problem of PROBLEMS) {
    const record = recordFor(problem.slug, false);
    const title = `[${record.status === "solved" ? "x" : " "}] **${problem.frontendId}. ${markdownTableCell(problem.title)}**`;
    const note = record.note.trim() ? markdownTableCell(record.note) : "—";
    const cells = [title, note];
    if (includeCode) cells.push(...[record.code, record.acmCode].map((code) => code != null ? markdownCodeCell(code) : "—"));
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

function downloadText(text, extension, mimeType) {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `lc-progress-${stamp}.${extension}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportLearningRecords() {
  try {
    syncCurrentEditors(true);
    const markdown = elements.export_format_markdown.checked;
    const text = markdown ? exportMarkdownText(elements.export_code_checkbox.checked) : backupTools.serialize(state);
    downloadText(text, markdown ? "md" : "json", markdown ? "text/markdown" : "application/json");
    closeExportModal();
    toast(markdown ? "Markdown 阅读表格已导出" : "完整 JSON 备份已导出");
  } catch (error) { toast(`导出失败：${error.message}`, "error"); }
}

function updateExportOptions() {
  const markdown = elements.export_format_markdown.checked;
  for (const radio of [elements.export_format_json, elements.export_format_markdown]) {
    radio.tabIndex = radio.checked ? 0 : -1;
  }
  elements.export_code_option.classList.toggle("hidden", !markdown);
  elements.export_description.textContent = markdown
    ? "按题目整理为 Markdown 表格。此文档用于阅读，恢复记录请使用 JSON 备份。"
    : "包含两套代码、自定义样例、笔记、进度和偏好设置。";
  elements.export_confirm_button.textContent = markdown ? "导出表格" : "导出备份";
}

function openExportModal() {
  elements.export_format_json.checked = true;
  elements.export_code_checkbox.checked = false;
  updateExportOptions();
  showModal(elements.export_modal, () => elements.export_format_json);
}

function closeExportModal() {
  hideModal(elements.export_modal, elements.export_button);
}

const MODAL_CONTROLLERS = [
  { element: elements.custom_case_modal, close: closeCustomCaseModal },
  { element: elements.export_modal, close: closeExportModal },
  { element: elements.import_modal, close: closeImportModal },
  { element: elements.reset_progress_modal, close: closeResetProgressModal },
  { element: elements.reset_code_modal, close: closeResetCodeModal },
];

function activeModalController() {
  return MODAL_CONTROLLERS.find(({ element }) => !element.classList.contains("hidden"));
}

function requireDataIdle() {
  if (evaluationInProgress || formattingInProgress) throw new Error("请等待当前运行、提交或格式化完成后再导入或撤销");
}

function importPlan() {
  return backupTools.plan(pendingBackup, state, elements.import_policy_select.value, elements.import_settings_checkbox.checked);
}

function recordSummary(record) {
  if (!record) return "无记录";
  const codeCount = Number(Object.hasOwn(record, "code")) + Number(Object.hasOwn(record, "acmCode"));
  const caseCount = (record.customCases?.length || 0) + (record.acmCustomCases?.length || 0);
  return `${STATUS_LABEL[record.status]} · ${record.attempts} 次提交 · 笔记 ${record.note.length} 字 · ${codeCount} 份代码 · ${caseCount} 个样例`;
}

function updateImportPreview() {
  if (!pendingBackup) return;
  const plan = importPlan();
  const count = (kind) => plan.rows.filter((row) => row.kind === kind).length;
  elements.import_summary.textContent = `新增 ${count("new")} · 冲突 ${count("conflict")} · 相同 ${count("same")} · 无效 ${pendingBackup.errors.length}。将导入 ${plan.beforeRecords.size} 道题${plan.settingsChanged ? "并恢复设置" : ""}。`;
  const labels = { status: "状态", attempts: "提交次数", note: "笔记", code: "核心代码", acmCode: "ACM 代码", customCases: "核心样例", acmCustomCases: "ACM 样例", updatedAt: "更新时间", passedAt: "通过时间" };
  elements.import_preview_body.innerHTML = plan.rows.map(({ slug, kind, apply, existing, incoming, changedFields }) => {
    const { problem } = bySlug.get(slug);
    const action = kind === "same" ? "相同，跳过" : kind === "new" ? "新增" : apply ? "覆盖本地" : "保留本地";
    const changes = kind === "conflict" ? changedFields.map((key) => labels[key]).join("、") : "";
    return `<tr><td>${escapeHtml(`${problem.frontendId}. ${problem.title}`)}</td><td data-label="本地">${escapeHtml(recordSummary(existing))}</td><td data-label="备份">${escapeHtml(recordSummary(incoming))}</td><td>${action}${changes ? `<br><small>差异：${changes}</small>` : ""}</td></tr>`;
  }).join("") || '<tr><td colspan="4">此备份没有题目记录，可单独恢复偏好设置。</td></tr>';
  elements.import_confirm_button.disabled = !plan.beforeRecords.size && !plan.settingsChanged;
  elements.import_confirm_button.textContent = elements.import_memory_checkbox.checked ? "仅本次会话导入" : "确认导入";
}

async function previewBackupFile(file) {
  requireDataIdle();
  if (file.size > MAX_IMPORT_FILE_SIZE) throw new Error("导入文件不能超过 50 MiB");
  const backup = backupTools.parse(await file.text());
  requireDataIdle();
  syncCurrentEditors(true);
  pendingBackup = backup;
  elements.import_source.textContent = `${file.name} · 导出于 ${new Date(backup.exportedAt).toLocaleString("zh-CN")}`;
  elements.import_policy_select.value = "keep";
  elements.import_settings_checkbox.checked = true;
  const settings = backup.settings;
  const lastProblem = bySlug.get(settings.lastSlug).problem;
  elements.import_settings_description.textContent = `${settings.theme === "dark" ? "深色" : "浅色"}主题 · 字号 ${settings.editorSize} · ${settings.codeMode === "core" ? "核心" : "ACM"}模式 · 题面${settings.expandProblemByDefault ? "展开" : "收起"} · 分栏 ${settings.problemPaneWidth}% · 上次学习 ${lastProblem.frontendId}. ${lastProblem.title}`;
  elements.import_errors.classList.toggle("hidden", !backup.errors.length);
  elements.import_errors.open = backup.errors.length > 0;
  elements.import_errors_summary.textContent = `${backup.errors.length} 条无效记录将被跳过，查看原因`;
  elements.import_errors_list.innerHTML = backup.errors.map(({ index, slug, reason }) => `<li>${escapeHtml(`第 ${index} 条${slug ? `（${slug}）` : ""}：${reason}`)}</li>`).join("");
  elements.import_save_error.classList.add("hidden");
  elements.import_memory_checkbox.checked = false;
  elements.import_memory_option.classList.toggle("hidden", storageAvailable);
  updateImportPreview();
  showModal(elements.import_modal, () => elements.import_policy_select);
}

function closeImportModal() {
  pendingBackup = null;
  hideModal(elements.import_modal, elements.import_button);
}

function commitImportedState(next, memoryOnly) {
  // Persist first: a quota or permission failure must not partially replace live records.
  if (!memoryOnly) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  clearTimeout(saveTimer);
  saveTimer = null;
  state.records = next.records;
  state.settings = next.settings;
  storageAvailable = !memoryOnly;
  elements.storage_warning.classList.toggle("visible", memoryOnly);
  elements.storage_warning.textContent = memoryOnly
    ? "本次导入仅保存在会话内存中，自动保存已暂停；刷新前请导出 JSON 备份。"
    : "本地存储不可用；本次内容仅保存在内存中，请及时导出 JSON 备份。";
  updateSaveIndicators();
}

function refreshImportedState() {
  showCatalog();
  applyTheme(state.settings.theme);
  applyProblemExpansionPreference(state.settings.expandProblemByDefault, false);
  changeEditorSize(0, false);
  applyProblemPaneWidth();
  setCodeMode(state.settings.codeMode, false, false);
}

function confirmBackupImport() {
  if (!pendingBackup) return;
  try {
    requireDataIdle();
    const plan = importPlan();
    if (!plan.beforeRecords.size && !plan.settingsChanged) return;
    const memoryOnly = elements.import_memory_checkbox.checked;
    commitImportedState(plan.next, memoryOnly);
    lastImportUndo = { records: plan.beforeRecords, settings: plan.beforeSettings };
    elements.undo_import_button.classList.remove("hidden");
    const skipped = pendingBackup.errors.length;
    closeImportModal();
    refreshImportedState();
    toast(`${memoryOnly ? "仅本次会话导入" : "已导入并保存"} ${plan.beforeRecords.size} 道题${plan.settingsChanged ? "及偏好设置" : ""}${skipped ? `，跳过 ${skipped} 条无效记录` : ""}`);
  } catch (error) {
    elements.import_save_error.textContent = `导入未完成，现有记录未被替换。${error.message}。若本地存储不可用，可勾选“仅本次会话导入”或取消后导出备份。`;
    elements.import_save_error.classList.remove("hidden");
    elements.import_memory_option.classList.remove("hidden");
  }
}

function undoLastImport() {
  if (!lastImportUndo) return;
  try {
    requireDataIdle();
    if (!confirm("撤销会将上次导入影响的题目及设置恢复到导入前（包括这些题目导入后新增的修改）。其他题目保持不变。是否继续？")) return;
    syncCurrentEditors(true);
    const next = { records: { ...state.records }, settings: lastImportUndo.settings || { ...state.settings } };
    for (const [slug, record] of lastImportUndo.records) {
      if (record === undefined) delete next.records[slug];
      else next.records[slug] = record;
    }
    commitImportedState(next, !storageAvailable);
    lastImportUndo = null;
    elements.undo_import_button.classList.add("hidden");
    refreshImportedState();
    toast(storageAvailable ? "已撤销上次导入并保存" : "已在本次会话中撤销上次导入，请及时导出 JSON 备份");
  } catch (error) { toast(`撤销失败，当前记录保持不变：${error.message}`, "error"); }
}
