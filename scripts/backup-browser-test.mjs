// Serialized into Chrome's page context by browser-smoke.mjs.
export async function verifyBackupInBrowser() {
  const assert = (condition, message) => { if (!condition) throw new Error(`备份测试：${message}`); };
  const equal = (first, second) => JSON.stringify(first) === JSON.stringify(second);
  const [first, second, third] = PROBLEMS.map((problem) => problem.slug);
  const record = { ...EMPTY_RECORD, status: "solved", attempts: 2, updatedAt: "2026-09-03T00:00:00.000Z", passedAt: "2026-09-03T00:00:00.000Z", note: "中文笔记 | <tag> 🚀", code: "class Solution:\n    pass", acmCode: "", customCases: ["[[2,7],9]"], acmCustomCases: ["2\n2 7\n9"] };
  const snapshot = { records: { [first]: record, [second]: { ...EMPTY_RECORD } }, settings: { ...DEFAULT_SETTINGS, theme: "light", editorSize: 18, lastSlug: second, expandProblemByDefault: false, problemPaneWidth: 51.5, codeMode: "acm" } };
  showCatalog();
  commitImportedState(structuredClone(snapshot), false);
  refreshImportedState();

  const downloads = [];
  const nativeCreateUrl = URL.createObjectURL;
  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = (blob) => { downloads.push({ blob }); return nativeCreateUrl(blob); };
  HTMLAnchorElement.prototype.click = function () { downloads.at(-1).name = this.download; };
  try {
    elements.export_button.click();
    assert(elements.export_format_json.checked && elements.export_code_option.classList.contains("hidden"), "默认导出完整 JSON");
    elements.export_confirm_button.click();
    elements.export_button.click();
    elements.export_format_markdown.click();
    assert(!elements.export_code_option.classList.contains("hidden"), "Markdown 显示代码选项");
    elements.export_code_checkbox.checked = true;
    elements.export_confirm_button.click();
  } finally {
    URL.createObjectURL = nativeCreateUrl;
    HTMLAnchorElement.prototype.click = nativeAnchorClick;
  }
  assert(downloads.length === 2 && downloads[0].name.endsWith(".json") && downloads[1].name.endsWith(".md"), "下载类型与文件名正确");
  const backupText = await downloads[0].blob.text();
  const markdown = await downloads[1].blob.text();
  assert(downloads[0].blob.type.startsWith("application/json") && markdown.includes("ACM 代码") && !markdown.includes("LC_RECORD"), "备份与阅读导出分开");

  commitImportedState({ records: {}, settings: { ...DEFAULT_SETTINGS } }, false);
  refreshImportedState();
  const transfer = new DataTransfer();
  transfer.items.add(new File([backupText], "roundtrip.json", { type: "application/json" }));
  elements.backup_file_input.files = transfer.files;
  elements.backup_file_input.dispatchEvent(new Event("change"));
  const deadline = performance.now() + 3000;
  while (!pendingBackup && performance.now() < deadline) await new Promise(requestAnimationFrame);
  assert(pendingBackup && elements.backup_file_input.value === "", "文件选择事件完成预览并清空文件框");
  assert(Object.keys(state.records).length === 0 && elements.import_summary.textContent.includes("新增 2"), "预览不提前修改状态");
  assert(elements.app_main.inert && !elements.import_modal.classList.contains("hidden"), "导入预览可访问且阻止背景编辑");
  elements.import_confirm_button.click();
  assert(equal(state, snapshot) && equal(JSON.parse(localStorage.getItem(STORAGE_KEY)), snapshot), "从空白状态恢复完整备份并保存");
  assert(state.records[first].acmCode === "" && state.records[first].customCases[0] === record.customCases[0] && state.records[first].acmCustomCases[0] === record.acmCustomCases[0], "空代码与两套样例真实恢复");
  assert(elements.acm_mode_button.classList.contains("active") && document.documentElement.style.getPropertyValue("--editor-size") === "18px", "恢复设置立即反映在界面");

  const file = () => new File([backupText], "backup.json");
  await previewBackupFile(file());
  assert(elements.import_confirm_button.disabled && elements.import_summary.textContent.includes("相同 2"), "重复导入禁用无效提交");
  elements.import_cancel_button.click();
  state.records[first].note = "本地笔记";
  delete state.records[second];
  state.records[third] = { ...EMPTY_RECORD, note: "未涉及的记录" };
  state.settings.editorSize = 14;
  saveState(true);
  await previewBackupFile(file());
  elements.import_settings_checkbox.checked = false;
  elements.import_settings_checkbox.dispatchEvent(new Event("change"));
  assert(elements.import_policy_select.value === "keep" && elements.import_preview_body.textContent.includes("差异：笔记"), "默认保留冲突并显示不同字段");
  elements.import_confirm_button.click();
  assert(state.records[first].note === "本地笔记" && state.records[second] && state.settings.editorSize === 14, "保留冲突，新增记录，可不恢复设置");
  state.records[third].note = "导入后修改的其他题目";
  const nativeConfirm = window.confirm;
  window.confirm = () => true;
  try {
    elements.undo_import_button.click();
    assert(!state.records[second] && state.records[first].note === "本地笔记" && state.records[third].note === "导入后修改的其他题目", "撤销保留未涉及题目的新修改");
    assert(state.settings.editorSize === 14 && lastImportUndo === null, "撤销只还原导入修改的设置");
    await previewBackupFile(file());
    elements.import_policy_select.value = "overwrite";
    elements.import_policy_select.dispatchEvent(new Event("change"));
    elements.import_confirm_button.click();
    assert(equal(state.records[first], record) && state.settings.editorSize === 18 && state.records[third], "明确覆盖记录且保留其他题目");

    const previousUndo = lastImportUndo;
    const beforeFailure = JSON.stringify(state);
    const savedBeforeFailure = localStorage.getItem(STORAGE_KEY);
    const changedBackup = JSON.parse(backupText);
    changedBackup.records[0].note = "新备份中的笔记";
    await previewBackupFile(new File([JSON.stringify(changedBackup)], "changed.json"));
    elements.import_policy_select.value = "overwrite";
    elements.import_policy_select.dispatchEvent(new Event("change"));
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException("测试：空间不足", "QuotaExceededError"); };
    try {
      elements.import_confirm_button.click();
      assert(JSON.stringify(state) === beforeFailure && localStorage.getItem(STORAGE_KEY) === savedBeforeFailure && lastImportUndo === previousUndo, "存储失败时数据和原撤销点均未替换");
      assert(!elements.import_save_error.classList.contains("hidden") && !elements.import_memory_checkbox.checked && !elements.import_memory_option.classList.contains("hidden"), "失败原因可见，会话导入需明确勾选");
      elements.import_memory_checkbox.checked = true;
      elements.import_memory_checkbox.dispatchEvent(new Event("change"));
      elements.import_confirm_button.click();
      assert(state.records[first].note === "新备份中的笔记" && !storageAvailable && saveTimer === null, "会话导入成功并暂停自动保存");
      saveState(true);
      assert(localStorage.getItem(STORAGE_KEY) === savedBeforeFailure, "会话导入不修改磁盘备份");
      const sessionExport = backupTools.parse(backupTools.serialize(state));
      assert(sessionExport.records.get(first).note === "新备份中的笔记", "存储失败后仍可导出会话数据");
      elements.undo_import_button.click();
      assert(JSON.stringify(state) === beforeFailure && !storageAvailable && lastImportUndo === null, "会话导入可撤销且保持自动保存暂停");
    } finally { Storage.prototype.setItem = nativeSetItem; }
  } finally { window.confirm = nativeConfirm; }

  const beforeInvalid = JSON.stringify(state);
  for (const text of ["# old Markdown", JSON.stringify({ ...JSON.parse(backupText), version: 99 })]) {
    let rejected = false;
    try { await previewBackupFile(new File([text], "invalid.json")); } catch { rejected = true; }
    assert(rejected && JSON.stringify(state) === beforeInvalid && !pendingBackup, "非法文件拒绝后状态不变");
  }
  setEvaluationBusy(true, "sample");
  let busyRejected = false;
  try { await previewBackupFile(file()); } catch { busyRejected = true; }
  setEvaluationBusy(false, "sample");
  assert(busyRejected && !pendingBackup, "运行中禁止导入，避免评测回写覆盖恢复数据");

  const partial = JSON.parse(backupText);
  partial.records[1].note = 123;
  await previewBackupFile(new File([JSON.stringify(partial)], "partial-<tag>.json"));
  assert(pendingBackup.errors.length === 1 && !elements.import_errors.classList.contains("hidden") && elements.import_errors_list.textContent.includes("note"), "部分无效记录显示具体原因");
  assert(!elements.import_source.querySelector("tag"), "文件名只按纯文本展示");
  elements.import_cancel_button.click();
  commitImportedState({ records: {}, settings: { ...DEFAULT_SETTINGS } }, false);
  refreshImportedState();
  return true;
}
