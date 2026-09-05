const PROBLEMS = __PROBLEMS_JSON__;
const SOLUTIONS = __SOLUTIONS_JSON__;
const PYTHON_HARNESS = __PYTHON_HARNESS_JSON__;
const PYTHON_FORMATTER = __PYTHON_FORMATTER_JSON__;
const FORMATTER_BUNDLE = __FORMATTER_BUNDLE_JSON__;
const PYODIDE_LOCK = __PYODIDE_LOCK_JSON__;
const RUNTIME_BASE64 = {
  loader: "__PYODIDE_LOADER_B64__",
  asmModule: "__PYODIDE_ASM_MJS_B64__",
  wasm: "__PYODIDE_WASM_B64__",
  stdlib: "__PYODIDE_STDLIB_B64__",
};

const STORAGE_KEY = "lc-offline:v1";
const MAX_CUSTOM_CASES = 20;
const MAX_CUSTOM_CASE_LENGTH = 50_000;
const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024;
const DOUBLE_ENTER_WINDOW_MS = 450;
const EDITOR_SIZE_MIN = 12;
const EDITOR_SIZE_MAX = 20;
const PROBLEM_PANE_MIN = 28;
const PROBLEM_PANE_MAX = 68;
const PROBLEM_PANE_DEFAULT = 43;
const PROBLEM_PANE_MIN_PX = 360;
const WORKSPACE_PANE_MIN_PX = 488;
const CODE_MODES = new Set(["core", "acm"]);
const ACM_CODE_TEMPLATE = `import sys

def solve():
    data = sys.stdin.buffer.read().split()
    # 按当前题目的 ACM 输入说明解析 data，并用 print() 输出答案

if __name__ == "__main__":
    solve()
`;
const PRIVACY_DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" });
const PRIVACY_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
const PRIVACY_PAGE_PRESETS = Object.freeze([
  {
    documentTitle: "每日工作台",
    brandMark: "日",
    brandName: "日常工作台",
    title: "今日概览",
    summary: "保持节奏，先完成最重要的一件事。这里汇总了今天的日程、备忘和本周进度。",
    scheduleTitle: "今日安排",
    schedule: [
      ["09:30", "整理本周资料", "归档文档与待处理事项"],
      ["11:00", "项目进度同步", "确认里程碑和后续安排"],
      ["14:30", "集中处理邮件", "回复需要跟进的信息"],
      ["17:30", "今日复盘", "记录完成项与明日重点"],
    ],
  },
  {
    documentTitle: "项目工作台",
    brandMark: "项",
    brandName: "项目工作台",
    title: "今日推进",
    summary: "按优先级推进当前事项，留出完整时间处理需要专注的工作。",
    scheduleTitle: "推进清单",
    schedule: [
      ["09:00", "校对项目清单", "确认优先级和负责人"],
      ["10:40", "更新需求记录", "补充变更与待确认问题"],
      ["14:00", "集中评审文档", "整理需要反馈的细节"],
      ["16:45", "汇总后续行动", "同步节点与下一步安排"],
    ],
  },
  {
    documentTitle: "个人事务台",
    brandMark: "事",
    brandName: "个人事务台",
    title: "本日计划",
    summary: "减少来回切换，把相近的事务放在一起完成，为重点事项保留连续时间。",
    scheduleTitle: "事务安排",
    schedule: [
      ["08:50", "浏览待办列表", "划分今天的处理顺序"],
      ["10:20", "处理资料归档", "整理近期文件与记录"],
      ["13:40", "完成重点事项", "集中处理高优先级任务"],
      ["17:10", "回顾今日进度", "更新完成项和明日计划"],
    ],
  },
  {
    documentTitle: "协作工作台",
    brandMark: "协",
    brandName: "协作工作台",
    title: "工作摘要",
    summary: "先确认协作依赖，再集中完成个人部分，让信息和行动保持同步。",
    scheduleTitle: "协作日程",
    schedule: [
      ["09:15", "准备同步材料", "整理当前进展与待决事项"],
      ["11:20", "确认依赖事项", "核对交付时间和前置条件"],
      ["15:00", "汇总阶段反馈", "记录结论与需要调整的部分"],
      ["17:40", "更新明日计划", "安排后续跟进和重点工作"],
    ],
  },
]);
const PRIVACY_NOTES = Object.freeze([
  "重要但不紧急的事项，安排固定时间集中处理，避免频繁切换注意力。",
  "先把需要完整思考的工作做完，再处理零散信息和临时请求。",
  "遇到暂时无法推进的事项，记录下一步动作，不在原地反复消耗时间。",
  "每完成一个阶段就更新记录，让后续沟通能够快速对齐上下文。",
  "给今天保留一段不被打断的时间，专门处理最需要专注的任务。",
]);
const PRIVACY_PROGRESS_LABELS = Object.freeze(["本周计划", "阶段任务", "近期事项"]);
const DIFFICULTY = {
  Easy: { label: "简单", className: "easy" },
  Medium: { label: "中等", className: "medium" },
  Hard: { label: "困难", className: "hard" },
};
const STATUS_LABEL = { todo: "未开始", attempted: "进行中", solved: "已通过" };
const VALID_STATUSES = new Set(Object.keys(STATUS_LABEL));
const EMPTY_RECORD = Object.freeze({ status: "todo", attempts: 0, note: "", updatedAt: null, passedAt: null });
const DEFAULT_SETTINGS = Object.freeze({
  theme: "dark",
  editorSize: 14,
  lastSlug: PROBLEMS[0].slug,
  expandProblemByDefault: true,
  problemPaneWidth: PROBLEM_PANE_DEFAULT,
  codeMode: "core",
});
const backupTools = (__BACKUP_FACTORY__)({
  slugs: PROBLEMS.map((problem) => problem.slug), defaultSettings: DEFAULT_SETTINGS,
  editorSizeBounds: [EDITOR_SIZE_MIN, EDITOR_SIZE_MAX], paneWidthBounds: [PROBLEM_PANE_MIN, PROBLEM_PANE_MAX],
  maxFileSize: MAX_IMPORT_FILE_SIZE, maxCases: MAX_CUSTOM_CASES, maxCaseLength: MAX_CUSTOM_CASE_LENGTH,
});
const bySlug = new Map(PROBLEMS.map((problem, index) => [problem.slug, { problem, index }]));
const problemsByCategory = new Map();
for (const problem of PROBLEMS) {
  if (!problemsByCategory.has(problem.category)) problemsByCategory.set(problem.category, []);
  problemsByCategory.get(problem.category).push(problem);
}
const searchTextBySlug = new Map(PROBLEMS.map((problem) => [
  problem.slug,
  normalizeSearch([problem.frontendId, problem.title, problem.englishTitle, problem.category, ...problem.tags].join(" ")),
]));
const sanitizedContentBySlug = new Map();

const ELEMENT_IDS = [
  "storage-warning", "app-header", "app-main", "privacy-view", "privacy-brand-mark", "privacy-brand-name", "privacy-date", "privacy-time",
  "privacy-title", "privacy-summary", "privacy-schedule-title", "privacy-schedule", "privacy-note", "privacy-progress-label",
  "privacy-progress-percent", "privacy-progress-track", "privacy-progress-detail", "workspace-tabs",
  "catalog-view", "study-view", "category-grid", "category-navigation", "catalog-title", "search-input",
  "difficulty-filter", "status-filter", "clear-filter-button", "reset-progress-button", "catalog-result-count", "solved-count",
  "attempted-count", "noted-count", "submission-count", "progress-number", "progress-orbit",
  "practice-caption", "easy-progress", "medium-progress", "hard-progress", "easy-count", "medium-count", "hard-count",
  "continue-button", "random-button", "auto-expand-button", "import-button", "export-button", "theme-button",
  "backup-file-input", "undo-import-button", "toast-stack", "back-button", "previous-button", "next-button",
  "mastered-button", "problem-toggle-button", "study-position", "study-title-mini", "study-layout", "pane-resizer", "problem-kicker", "problem-title",
  "official-content", "acm-format-card", "acm-input-description", "acm-sample-input", "problem-pane", "code-editor", "code-highlight", "code-line-numbers", "editor-shortcuts", "notes-editor", "code-save-state",
  "notes-save-state", "font-down-button", "font-up-button", "font-size-label", "format-code-button", "reset-code-button", "editor-statusbar", "editor-feedback",
  "reset-code-modal", "reset-code-context", "reset-code-cancel-button", "reset-code-confirm-button",
  "core-mode-button", "acm-mode-button",
  "cursor-position", "runtime-status", "custom-case-button", "run-button", "submit-button", "result-panel",
  "solution-note", "solution-complexity", "reference-code", "reference-mode-label", "copy-solution-button",
  "export-modal", "export-code-checkbox", "export-cancel-button", "export-confirm-button",
  "export-format-options", "export-format-json", "export-format-markdown", "export-description", "export-code-option",
  "import-modal", "import-source", "import-policy-select", "import-summary", "import-preview-body",
  "import-errors", "import-errors-summary", "import-errors-list", "import-settings-checkbox", "import-settings-description",
  "import-memory-option", "import-memory-checkbox", "import-save-error", "import-cancel-button", "import-confirm-button",
  "reset-progress-modal", "reset-progress-description", "reset-progress-cancel-button", "reset-progress-confirm-button",
  "custom-case-modal", "custom-case-description", "custom-case-template", "custom-case-list", "custom-case-add-button",
  "custom-case-cancel-button", "custom-case-save-button",
];
const elements = {};
const missingElementIds = [];
for (const id of ELEMENT_IDS) {
  const element = document.getElementById(id);
  elements[id.replaceAll("-", "_")] = element;
  if (!element) missingElementIds.push(id);
}
if (missingElementIds.length) throw new Error(`页面缺少必要元素：${missingElementIds.join(", ")}`);
const workspaceTabButtons = [...elements.workspace_tabs.querySelectorAll('[role="tab"]')];
const workspacePanels = [...document.querySelectorAll('[role="tabpanel"]')];
const evaluationControlButtons = [elements.format_code_button, elements.custom_case_button, elements.run_button, elements.submit_button, elements.reset_code_button];
const codeModeSwitch = elements.core_mode_button.parentElement;
const mobileWorkspaceMedia = matchMedia("(max-width: 900px)");

let storageAvailable = true;
let currentSlug = null;
let saveTimer = null;
let catalogRenderFrame = null;
let codeRenderFrame = null;
let highlightedSource = null;
let displayedLineCount = 0;
let activeCategory = "all";
let catalogScrollY = 0;
let catalogFocusSlug = null;
let customCaseDrafts = [];
let evaluationInProgress = false;
let formattingInProgress = false;
let editorFeedbackTimer = null;
let pendingCodeReset = null;
let pendingBackup = null;
let lastImportUndo = null;
const testConsoleState = { view: "cases", caseIndex: 0, evaluation: null, evaluationMode: "sample", evaluatedCases: [] };
let lastPrivacyEnterAt = null;
let privacyMode = false;
let privacyVariantIndex = -1;
let privacyRestoreTitle = "";
let privacyRestoreHash = "";
let privacyRestoreFocus = null;
let privacyFirstEnterSnapshot = null;
let privacyRestoreScrollX = 0;
let privacyRestoreScrollY = 0;
let paneResizeDrag = null;
const state = loadState();

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function timestamp() {
  return new Date().toISOString();
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeRecord(value) {
  const raw = plainObject(value) || {};
  const attempts = Number.isInteger(raw.attempts) && raw.attempts >= 0 ? raw.attempts : 0;
  let status = VALID_STATUSES.has(raw.status) ? raw.status : "todo";
  if (status === "todo" && attempts > 0) status = "attempted";
  const record = {
    status,
    attempts,
    note: typeof raw.note === "string" ? raw.note : "",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    passedAt: status === "solved" && typeof raw.passedAt === "string" ? raw.passedAt : null,
  };
  for (const key of ["code", "acmCode"]) {
    if (typeof raw[key] === "string") record[key] = raw[key];
  }
  for (const key of ["customCases", "acmCustomCases"]) {
    if (!Array.isArray(raw[key])) continue;
    record[key] = raw[key]
      .filter((item) => typeof item === "string" && item.length <= MAX_CUSTOM_CASE_LENGTH)
      .slice(0, MAX_CUSTOM_CASES);
  }
  return record;
}

function normalizeSettings(value) {
  const raw = plainObject(value) || {};
  return {
    theme: ["light", "dark"].includes(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme,
    editorSize: Number.isFinite(raw.editorSize) ? clamp(Math.round(raw.editorSize), EDITOR_SIZE_MIN, EDITOR_SIZE_MAX) : DEFAULT_SETTINGS.editorSize,
    lastSlug: bySlug.has(raw.lastSlug) ? raw.lastSlug : DEFAULT_SETTINGS.lastSlug,
    expandProblemByDefault: typeof raw.expandProblemByDefault === "boolean" ? raw.expandProblemByDefault : DEFAULT_SETTINGS.expandProblemByDefault,
    problemPaneWidth: Number.isFinite(raw.problemPaneWidth) ? clamp(raw.problemPaneWidth, PROBLEM_PANE_MIN, PROBLEM_PANE_MAX) : DEFAULT_SETTINGS.problemPaneWidth,
    codeMode: CODE_MODES.has(raw.codeMode) ? raw.codeMode : DEFAULT_SETTINGS.codeMode,
  };
}

function loadState() {
  const fallback = { records: {}, settings: { ...DEFAULT_SETTINGS } };
  let raw;
  try {
    // Read existing records before probing writes: a full quota must not hide them.
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    storageAvailable = false;
    elements.storage_warning.classList.add("visible");
    return fallback;
  }
  try {
    const testKey = `${STORAGE_KEY}:test`;
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
  } catch {
    storageAvailable = false;
    elements.storage_warning.classList.add("visible");
  }
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!plainObject(parsed)) throw new Error("状态根节点必须是对象");
    const rawRecords = plainObject(parsed.records) || {};
    const records = {};
    for (const problem of PROBLEMS) {
      if (Object.hasOwn(rawRecords, problem.slug)) records[problem.slug] = normalizeRecord(rawRecords[problem.slug]);
    }
    return { records, settings: normalizeSettings(parsed.settings) };
  } catch (error) {
    storageAvailable = false;
    elements.storage_warning.textContent = "本地学习记录格式损坏，已暂停自动保存以保留原始数据；请导入有效的 JSON 备份。";
    elements.storage_warning.classList.add("visible");
    console.warn("本地学习记录损坏，已使用默认状态：", error);
    toast("本地学习记录格式损坏，本次已使用默认状态", "error");
    return fallback;
  }
}

function persistState() {
  saveTimer = null;
  if (!storageAvailable) return updateSaveIndicators();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    storageAvailable = false;
    elements.storage_warning.classList.add("visible");
    toast("本地存储失败，请导出 JSON 备份", "error");
  }
  updateSaveIndicators();
}

function saveState(immediate = false) {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!storageAvailable) return updateSaveIndicators();
  if (immediate) persistState();
  else {
    saveTimer = setTimeout(persistState, 350);
    updateSaveIndicators();
  }
}

function updateSaveIndicators() {
  const status = !storageAvailable ? "memory" : saveTimer != null ? "pending" : "saved";
  const label = { memory: "仅内存", pending: "保存中…", saved: "已保存" }[status];
  for (const element of [elements.code_save_state, elements.notes_save_state]) {
    element.textContent = label;
    element.dataset.state = status;
  }
}

function recordFor(slug, create = true) {
  if (!state.records[slug] && create) state.records[slug] = { ...EMPTY_RECORD };
  return state.records[slug] || EMPTY_RECORD;
}

function customCasesFor(slug = currentSlug) {
  const key = state.settings.codeMode === "acm" ? "acmCustomCases" : "customCases";
  const cases = slug ? recordFor(slug, false)[key] : null;
  return Array.isArray(cases) ? cases : [];
}
