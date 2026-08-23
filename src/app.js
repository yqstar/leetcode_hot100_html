const PROBLEMS = __PROBLEMS_JSON__;
const SOLUTIONS = __SOLUTIONS_JSON__;
const PYTHON_HARNESS = __PYTHON_HARNESS_JSON__;
const PYODIDE_LOCK = __PYODIDE_LOCK_JSON__;
const RUNTIME_BASE64 = {
  loader: "__PYODIDE_LOADER_B64__",
  asmModule: "__PYODIDE_ASM_MJS_B64__",
  wasm: "__PYODIDE_WASM_B64__",
  stdlib: "__PYODIDE_STDLIB_B64__",
};

const STORAGE_KEY = "leetcode-hot100-offline:v1";
const EXPORT_VERSION = 2;
const DIFFICULTY = {
  Easy: { label: "简单", className: "easy" },
  Medium: { label: "中等", className: "medium" },
  Hard: { label: "困难", className: "hard" },
};
const STATUS_LABEL = { todo: "未开始", attempted: "进行中", solved: "已通过" };
const bySlug = new Map(PROBLEMS.map((problem, index) => [problem.slug, { problem, index }]));
const categories = [...new Set(PROBLEMS.map((problem) => problem.category))];

const elements = Object.fromEntries([
  "storage-warning", "catalog-view", "study-view", "category-grid", "search-input",
  "difficulty-filter", "status-filter", "clear-filter-button", "solved-count",
  "attempted-count", "noted-count", "submission-count", "progress-number", "progress-orbit",
  "continue-button", "random-button", "import-button", "export-button", "theme-button",
  "markdown-file-input", "toast-stack", "back-button", "previous-button", "next-button",
  "mastered-button", "study-position", "study-title-mini", "problem-kicker", "problem-title",
  "official-content", "problem-pane", "code-editor", "notes-editor", "code-save-state",
  "notes-save-state", "font-down-button", "font-up-button", "font-size-label", "reset-code-button",
  "cursor-position", "runtime-status", "run-button", "submit-button", "result-panel",
  "solution-note", "solution-complexity", "reference-code", "copy-solution-button",
  "export-modal", "export-code-checkbox", "export-cancel-button", "export-confirm-button",
].map((id) => [id.replaceAll("-", "_"), document.getElementById(id)]));

let storageAvailable = true;
let currentSlug = null;
let saveTimer = null;
let state = loadState();

function blankState() {
  return {
    version: 1,
    records: {},
    settings: { theme: "light", editorSize: 14, lastSlug: PROBLEMS[0].slug },
  };
}

function loadState() {
  const fallback = blankState();
  try {
    const testKey = `${STORAGE_KEY}:test`;
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      records: parsed.records && typeof parsed.records === "object" ? parsed.records : {},
      settings: { ...fallback.settings, ...(parsed.settings || {}) },
    };
  } catch (error) {
    storageAvailable = false;
    queueMicrotask(() => elements.storage_warning?.classList.add("visible"));
    return fallback;
  }
}

function saveState(immediate = false) {
  clearTimeout(saveTimer);
  const persist = () => {
    if (!storageAvailable) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      storageAvailable = false;
      elements.storage_warning.classList.add("visible");
      toast("本地存储失败，请导出 Markdown 备份", "error");
    }
  };
  if (immediate) persist();
  else saveTimer = setTimeout(persist, 350);
}

function recordFor(slug, create = true) {
  if (!state.records[slug] && create) {
    state.records[slug] = { status: "todo", attempts: 0, note: "", updatedAt: null };
  }
  return state.records[slug] || { status: "todo", attempts: 0, note: "", updatedAt: null };
}

function statusFor(slug) {
  return recordFor(slug, false).status || "todo";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function toast(message, type = "info") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  elements.toast_stack.append(item);
  setTimeout(() => item.remove(), 3200);
}

function applyTheme(theme) {
  const resolved = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
  state.settings.theme = resolved;
  elements.theme_button.setAttribute("aria-label", resolved === "dark" ? "切换浅色模式" : "切换深色模式");
}

function statistics() {
  let solved = 0, attempted = 0, noted = 0, submissions = 0;
  for (const problem of PROBLEMS) {
    const record = recordFor(problem.slug, false);
    if (record.status === "solved") solved += 1;
    else if (record.status === "attempted") attempted += 1;
    if ((record.note || "").trim()) noted += 1;
    submissions += Number(record.attempts || 0);
  }
  return { solved, attempted, noted, submissions };
}

function renderSummary() {
  const stats = statistics();
  elements.solved_count.textContent = stats.solved;
  elements.attempted_count.textContent = stats.attempted;
  elements.noted_count.textContent = stats.noted;
  elements.submission_count.textContent = stats.submissions;
  const percent = Math.round(stats.solved / PROBLEMS.length * 100);
  elements.progress_number.textContent = `${percent}%`;
  elements.progress_orbit.style.setProperty("--progress", `${percent * 3.6}deg`);
  const last = bySlug.get(state.settings.lastSlug)?.problem || PROBLEMS[0];
  elements.continue_button.textContent = stats.solved || stats.attempted ? `继续：${last.frontendId}. ${last.title}` : "从第一题开始";
}

function matchesFilter(problem) {
  const keyword = elements.search_input.value.trim().toLowerCase();
  const difficulty = elements.difficulty_filter.value;
  const status = elements.status_filter.value;
  const record = recordFor(problem.slug, false);
  const searchable = [problem.frontendId, problem.title, problem.englishTitle, problem.category, ...(problem.tags || [])].join(" ").toLowerCase();
  if (keyword && !searchable.includes(keyword)) return false;
  if (difficulty !== "all" && problem.difficulty !== difficulty) return false;
  if (status === "noted" && !(record.note || "").trim()) return false;
  if (!["all", "noted"].includes(status) && statusFor(problem.slug) !== status) return false;
  return true;
}

function renderCatalog() {
  renderSummary();
  let visibleCount = 0;
  const cards = [];
  for (const [categoryIndex, category] of categories.entries()) {
    const allProblems = PROBLEMS.filter((problem) => problem.category === category);
    const problems = allProblems.filter(matchesFilter);
    if (!problems.length) continue;
    visibleCount += problems.length;
    const solved = allProblems.filter((problem) => statusFor(problem.slug) === "solved").length;
    const rows = problems.map((problem) => {
      const status = statusFor(problem.slug);
      const difficulty = DIFFICULTY[problem.difficulty];
      return `<li class="problem-row" data-slug="${escapeHtml(problem.slug)}" tabindex="0" role="button" aria-label="打开 ${escapeHtml(problem.title)}">
        <span class="status-dot ${status}" aria-label="${STATUS_LABEL[status]}">${status === "solved" ? "✓" : ""}</span>
        <span class="problem-name"><span class="problem-id">${escapeHtml(problem.frontendId)}.</span>${escapeHtml(problem.title)}</span>
        <span class="difficulty ${difficulty.className}">${difficulty.label}</span>
      </li>`;
    }).join("");
    cards.push(`<section class="category-card">
      <header class="category-header"><div class="category-title"><span class="category-index">${String(categoryIndex + 1).padStart(2, "0")}</span>${escapeHtml(category)}</div><div class="category-progress">${solved} / ${allProblems.length} 已通过</div></header>
      <ul class="problem-list">${rows}</ul>
    </section>`);
  }
  elements.category_grid.innerHTML = visibleCount ? cards.join("") : `<div class="empty-state"><strong>没有匹配的题目</strong><br><br>试试清除筛选条件或换一个关键词。</div>`;
}

function sanitizeOfficialContent(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script,style,iframe,object,embed,form").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      if (["src", "href"].includes(attribute.name) && /^javascript:/i.test(attribute.value)) node.removeAttribute(attribute.name);
    });
  });
  template.content.querySelectorAll("a").forEach((link) => {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
  return template.innerHTML;
}

function updateMasteredButton() {
  const solved = statusFor(currentSlug) === "solved";
  elements.mastered_button.textContent = solved ? "✓ 已掌握" : "标记已掌握";
  elements.mastered_button.classList.toggle("success", solved);
}

function openProblem(slug, updateHash = true) {
  const entry = bySlug.get(slug);
  if (!entry) return;
  currentSlug = slug;
  const { problem, index } = entry;
  const solution = SOLUTIONS[slug];
  const record = recordFor(slug);
  state.settings.lastSlug = slug;
  saveState();

  elements.catalog_view.classList.remove("active");
  elements.study_view.classList.add("active");
  elements.study_position.textContent = `${index + 1} / ${PROBLEMS.length}`;
  elements.study_title_mini.textContent = `${problem.frontendId}. ${problem.title}`;
  elements.problem_title.textContent = `${problem.frontendId}. ${problem.title}`;
  elements.previous_button.disabled = index === 0;
  elements.next_button.disabled = index === PROBLEMS.length - 1;
  const difficulty = DIFFICULTY[problem.difficulty];
  elements.problem_kicker.innerHTML = `<span class="difficulty ${difficulty.className}">${difficulty.label}</span><span class="tag">${escapeHtml(problem.category)}</span>${(problem.tags || []).slice(0, 5).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}`;
  elements.official_content.innerHTML = sanitizeOfficialContent(problem.content);
  elements.code_editor.value = record.code ?? problem.starterCode;
  elements.notes_editor.value = record.note || "";
  elements.solution_note.textContent = solution.note;
  elements.solution_complexity.textContent = solution.complexity;
  elements.reference_code.textContent = solution.code;
  elements.result_panel.className = "result-panel";
  elements.result_panel.innerHTML = "";
  elements.problem_pane.scrollTop = 0;
  updateMasteredButton();
  updateCursorPosition();
  switchWorkspaceTab("code");
  document.title = `${problem.frontendId}. ${problem.title} · Hot 100 离线训练场`;
  if (updateHash && location.hash !== `#problem=${encodeURIComponent(slug)}`) {
    location.hash = `problem=${encodeURIComponent(slug)}`;
  }
}

function showCatalog(updateHash = true) {
  currentSlug = null;
  elements.study_view.classList.remove("active");
  elements.catalog_view.classList.add("active");
  document.title = "Hot 100 · Python 离线训练场";
  renderCatalog();
  if (updateHash && location.hash) history.pushState(null, "", location.href.split("#")[0]);
}

function route() {
  const match = location.hash.match(/^#problem=(.+)$/);
  if (match) {
    const slug = decodeURIComponent(match[1]);
    if (bySlug.has(slug)) return openProblem(slug, false);
  }
  showCatalog(false);
}

function switchWorkspaceTab(tab) {
  document.querySelectorAll(".tab-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  document.querySelectorAll(".workspace-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `${tab}-panel`));
}

function touchRecord(type) {
  if (!currentSlug) return;
  const record = recordFor(currentSlug);
  if (type === "code") record.code = elements.code_editor.value;
  if (type === "note") record.note = elements.notes_editor.value;
  record.updatedAt = new Date().toISOString();
  saveState();
}

function showSavePulse(element) {
  element.textContent = "保存中…";
  setTimeout(() => { element.textContent = storageAvailable ? "已保存" : "仅内存"; }, 450);
}

function updateCursorPosition() {
  const value = elements.code_editor.value.slice(0, elements.code_editor.selectionStart);
  const lines = value.split("\n");
  elements.cursor_position.textContent = `Ln ${lines.length}, Col ${lines.at(-1).length + 1}`;
}

function changeEditorSize(delta) {
  const size = Math.max(12, Math.min(20, Number(state.settings.editorSize || 14) + delta));
  state.settings.editorSize = size;
  document.documentElement.style.setProperty("--editor-size", `${size}px`);
  elements.font_size_label.textContent = size;
  saveState();
}

function markdownFence(content, language = "") {
  const runs = [...String(content).matchAll(/`+/g)].map((match) => match[0].length);
  const fence = "`".repeat(Math.max(3, ...(runs.map((length) => length + 1))));
  return `${fence}${language}\n${content}\n${fence}`;
}

function exportMarkdown(includeCode = false) {
  if (currentSlug) touchRecord("code");
  if (currentSlug) touchRecord("note");
  const stats = statistics();
  const lines = [
    "# LeetCode Hot 100 学习清单", "",
    `> 由 Hot 100 Python 离线训练场导出于 ${new Date().toLocaleString("zh-CN")}。`, "",
    `<!-- HOT100_EXPORT_VERSION:${EXPORT_VERSION} -->`,
    `<!-- HOT100_EXPORT_OPTIONS ${JSON.stringify({ includeCode })} -->`, "",
    `- 进度：**${stats.solved} / ${PROBLEMS.length}**`,
    `- 进行中：${stats.attempted}`, `- 笔记：${stats.noted}`, `- 提交：${stats.submissions} 次`, "",
    "## 题目清单", "",
  ];
  for (const problem of PROBLEMS) {
    const record = recordFor(problem.slug, false);
    const metadata = {
      slug: problem.slug,
      status: record.status || "todo",
      attempts: Number(record.attempts || 0),
      updatedAt: record.updatedAt || null,
      passedAt: record.passedAt || null,
      hasNote: Boolean((record.note || "").trim()),
      hasCode: record.code != null,
    };
    const extras = [];
    if (metadata.status === "attempted") extras.push("进行中");
    if (metadata.attempts) extras.push(`提交 ${metadata.attempts} 次`);
    if (metadata.hasNote) extras.push("有笔记");
    lines.push(`<!-- HOT100_RECORD ${JSON.stringify(metadata)} -->`);
    lines.push(`- [${metadata.status === "solved" ? "x" : " "}] **${problem.frontendId}. ${problem.title}** · ${problem.category} · ${DIFFICULTY[problem.difficulty].label}${extras.length ? ` · ${extras.join(" · ")}` : ""}`);
  }

  const notedProblems = PROBLEMS.filter((problem) => (recordFor(problem.slug, false).note || "").trim());
  if (notedProblems.length) {
    lines.push("", "## 个人笔记", "");
    for (const problem of notedProblems) {
      const note = recordFor(problem.slug, false).note;
      lines.push(`### ${problem.frontendId}. ${problem.title}`, "", `<!-- HOT100_NOTE_START ${problem.slug} -->`, note, `<!-- HOT100_NOTE_END ${problem.slug} -->`, "");
    }
  }

  const codedProblems = includeCode ? PROBLEMS.filter((problem) => recordFor(problem.slug, false).code != null) : [];
  if (includeCode) {
    lines.push("", "## 个人代码", "");
    if (!codedProblems.length) lines.push("> 还没有保存过个人代码。", "");
    for (const problem of codedProblems) {
      const code = recordFor(problem.slug, false).code;
      lines.push(`### ${problem.frontendId}. ${problem.title}`, "", `<!-- HOT100_CODE_START ${problem.slug} -->`, markdownFence(code, "python"), `<!-- HOT100_CODE_END ${problem.slug} -->`, "");
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `leetcode-hot100-progress-${stamp}.md`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(includeCode ? "清单、笔记和个人代码已导出" : "简洁学习清单已导出");
}

function openExportModal() {
  elements.export_code_checkbox.checked = false;
  elements.export_modal.classList.remove("hidden");
  setTimeout(() => elements.export_code_checkbox.focus(), 0);
}

function closeExportModal() {
  elements.export_modal.classList.add("hidden");
  elements.export_button.focus();
}

function between(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return null;
  const contentStart = startIndex + start.length;
  const endIndex = text.indexOf(end, contentStart);
  return endIndex < 0 ? null : text.slice(contentStart, endIndex).replace(/^\s*\n/, "").replace(/\n\s*$/, "");
}

function stripCodeFence(text) {
  if (text == null) return null;
  const lines = text.split("\n");
  if (/^`{3,}[^\n]*$/i.test(lines[0] || "")) lines.shift();
  if (/^`{3,}\s*$/.test(lines.at(-1) || "")) lines.pop();
  return lines.join("\n");
}

function finalizeImport(imported) {
  if (!imported.size) throw new Error("未找到可识别的 Hot 100 学习记录");
  saveState(true);
  renderCatalog();
  if (currentSlug && imported.has(currentSlug)) openProblem(currentSlug, false);
  return imported.size;
}

function importMarkdownV2(text) {
  const imported = new Set();
  const optionsMatch = text.match(/<!-- HOT100_EXPORT_OPTIONS (\{[^\n]+\}) -->/);
  let includeCode = false;
  try { includeCode = Boolean(JSON.parse(optionsMatch?.[1] || "{}").includeCode); } catch (error) { /* use default */ }

  const recordPattern = /<!-- HOT100_RECORD (\{[^\n]+\}) -->/g;
  let match;
  while ((match = recordPattern.exec(text))) {
    try {
      const metadata = JSON.parse(match[1]);
      if (!bySlug.has(metadata.slug)) continue;
      const record = {
        ...recordFor(metadata.slug, false),
        status: ["todo", "attempted", "solved"].includes(metadata.status) ? metadata.status : "todo",
        attempts: Math.max(0, Number(metadata.attempts || 0)),
        updatedAt: metadata.updatedAt || new Date().toISOString(),
        passedAt: metadata.passedAt || null,
      };
      if (!metadata.hasNote) record.note = "";
      if (includeCode && !metadata.hasCode) delete record.code;
      state.records[metadata.slug] = record;
      imported.add(metadata.slug);
    } catch (error) {
      // Skip malformed records while preserving valid ones.
    }
  }

  const notePattern = /<!-- HOT100_NOTE_START ([a-z0-9-]+) -->([\s\S]*?)<!-- HOT100_NOTE_END \1 -->/g;
  while ((match = notePattern.exec(text))) {
    if (!bySlug.has(match[1])) continue;
    recordFor(match[1]).note = match[2].replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    imported.add(match[1]);
  }
  const codePattern = /<!-- HOT100_CODE_START ([a-z0-9-]+) -->([\s\S]*?)<!-- HOT100_CODE_END \1 -->/g;
  while ((match = codePattern.exec(text))) {
    if (!bySlug.has(match[1])) continue;
    const block = match[2].replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    recordFor(match[1]).code = stripCodeFence(block);
    imported.add(match[1]);
  }
  return finalizeImport(imported);
}

function importMarkdownV1(text) {
  const pattern = /<!-- HOT100_RECORD_START (\{[^\n]+\}) -->([\s\S]*?)<!-- HOT100_RECORD_END -->/g;
  const imported = new Set();
  let match;
  while ((match = pattern.exec(text))) {
    try {
      const metadata = JSON.parse(match[1]);
      if (!bySlug.has(metadata.slug)) continue;
      const section = match[2];
      const code = stripCodeFence(between(section, "<!-- HOT100_CODE_START -->", "<!-- HOT100_CODE_END -->"));
      const note = between(section, "<!-- HOT100_NOTE_START -->", "<!-- HOT100_NOTE_END -->");
      state.records[metadata.slug] = {
        ...recordFor(metadata.slug, false),
        status: ["todo", "attempted", "solved"].includes(metadata.status) ? metadata.status : "todo",
        attempts: Math.max(0, Number(metadata.attempts || 0)),
        updatedAt: metadata.updatedAt || new Date().toISOString(),
        passedAt: metadata.passedAt || null,
        ...(code != null ? { code } : {}),
        ...(note != null ? { note } : {}),
      };
      imported.add(metadata.slug);
    } catch (error) {
      // Skip malformed records while preserving valid ones.
    }
  }
  return finalizeImport(imported);
}

function importMarkdown(text) {
  return text.includes("HOT100_EXPORT_VERSION:2") ? importMarkdownV2(text) : importMarkdownV1(text);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
    document.body.append(area); area.select(); document.execCommand("copy"); area.remove();
  }
}

function bytesFromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  const chunk = 1 << 20;
  for (let start = 0; start < binary.length; start += chunk) {
    const end = Math.min(start + chunk, binary.length);
    for (let index = start; index < end; index += 1) bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

const JUDGE_WORKER_SOURCE = `
let pyodide = null;
let harness = "";

// Pyodide rejects classic workers when importScripts is present. We deliberately
// hide it and use dynamic import so the same worker also works from file:// URLs,
// where module workers are rejected by some browsers.
try {
  Object.defineProperty(globalThis, "importScripts", { value: undefined, configurable: true });
} catch (error) {
  globalThis.importScripts = undefined;
}

self.onmessage = async (event) => {
  const message = event.data;
  if (message.type === "init") {
    try {
      harness = message.harness;
      const nativeFetch = self.fetch.bind(self);
      self.fetch = (input, options) => {
        const url = typeof input === "string" ? input : (input?.url || input?.href || String(input));
        if (url === "https://offline.local/pyodide.asm.wasm") return nativeFetch(message.runtime.wasmUrl, options);
        return nativeFetch(input, options);
      };
      const loader = await import(message.runtime.loaderUrl);
      const asmModule = await import(message.runtime.asmModuleUrl);
      pyodide = await loader.loadPyodide({
        indexURL: "https://offline.local/",
        stdLibURL: message.runtime.stdlibUrl,
        lockFileContents: message.runtime.lock,
        packageBaseUrl: "https://offline.local/",
        createPyodideModule: asmModule.default,
      });
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "init-error", error: String(error && (error.stack || error.message) || error) });
    }
    return;
  }
  if (message.type === "run") {
    try {
      pyodide.globals.set("payload_json", JSON.stringify(message.payload));
      const result = await pyodide.runPythonAsync(harness + "\\nRESULT_JSON");
      self.postMessage({ type: "result", id: message.id, result: JSON.parse(result) });
    } catch (error) {
      self.postMessage({ type: "run-error", id: message.id, error: String(error && (error.stack || error.message) || error) });
    }
  }
};
`;

let decodedRuntime = null;
let runtimeUrls = null;
let judgeWorker = null;
let mainThreadPyodide = null;
let judgeReady = null;
let judgeBackend = null;
let pendingRun = null;
let runSequence = 0;

function setRuntimeStatus(status, message) {
  elements.runtime_status.className = `runtime-status ${status}`;
  elements.runtime_status.querySelector("span:last-child").textContent = message;
}

function runtimeAssets() {
  if (decodedRuntime) return decodedRuntime;
  setRuntimeStatus("loading", "正在读取内嵌 Python 运行时…");
  const decoder = new TextDecoder();
  const loaderBytes = bytesFromBase64(RUNTIME_BASE64.loader);
  const asmModuleBytes = bytesFromBase64(RUNTIME_BASE64.asmModule);
  decodedRuntime = {
    loaderSource: decoder.decode(loaderBytes),
    asmModuleSource: decoder.decode(asmModuleBytes),
    wasmBytes: bytesFromBase64(RUNTIME_BASE64.wasm),
    stdlibBytes: bytesFromBase64(RUNTIME_BASE64.stdlib),
    lock: PYODIDE_LOCK,
  };
  return decodedRuntime;
}

function runtimeObjectUrls() {
  if (runtimeUrls) return runtimeUrls;
  setRuntimeStatus("loading", "正在准备内嵌 Python 运行时…");
  const runtime = runtimeAssets();
  runtimeUrls = {
    loaderUrl: URL.createObjectURL(new Blob([runtime.loaderSource], { type: "text/javascript" })),
    asmModuleUrl: URL.createObjectURL(new Blob([runtime.asmModuleSource], { type: "text/javascript" })),
    wasmUrl: URL.createObjectURL(new Blob([runtime.wasmBytes], { type: "application/wasm" })),
    stdlibUrl: URL.createObjectURL(new Blob([runtime.stdlibBytes], { type: "application/zip" })),
    lock: runtime.lock,
  };
  return runtimeUrls;
}

function destroyJudge(reason) {
  if (judgeWorker) judgeWorker.terminate();
  judgeWorker = null;
  judgeBackend = null;
  judgeReady = null;
  if (pendingRun) {
    pendingRun.reject(new Error(reason || "评测进程已终止"));
    pendingRun = null;
  }
}

function startWorkerJudge() {
  return new Promise((resolve, reject) => {
    let worker = null;
    let initialized = false;
    let initTimer = null;
    const fail = (error) => {
      if (initTimer) clearTimeout(initTimer);
      if (worker) worker.terminate();
      if (judgeWorker === worker) judgeWorker = null;
      if (!initialized) {
        initialized = true;
        reject(error);
      } else {
        if (pendingRun) { pendingRun.reject(error); pendingRun = null; }
        judgeBackend = null;
        judgeReady = null;
        setRuntimeStatus("", "Python 评测进程已停止，将在下次运行时重启");
      }
    };
    try {
      const workerUrl = URL.createObjectURL(new Blob([JUDGE_WORKER_SOURCE], { type: "text/javascript" }));
      worker = new Worker(workerUrl, { name: "hot100-python-judge" });
      judgeWorker = worker;
      setTimeout(() => URL.revokeObjectURL(workerUrl), 1000);
      initTimer = setTimeout(() => fail(new Error("Python Worker 启动超时")), 20000);
      worker.onmessage = (event) => {
        const message = event.data;
        if (message.type === "ready") {
          if (initialized) return;
          initialized = true;
          clearTimeout(initTimer);
          judgeBackend = "worker";
          setRuntimeStatus("ready", "离线 Python 已就绪");
          resolve({ kind: "worker", worker });
        } else if (message.type === "init-error") {
          fail(new Error(message.error));
        } else if (message.type === "result" && pendingRun?.id === message.id) {
          const pending = pendingRun; pendingRun = null; pending.resolve(message.result);
        } else if (message.type === "run-error" && pendingRun?.id === message.id) {
          const pending = pendingRun; pendingRun = null; pending.reject(new Error(message.error));
        }
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        const location = event.filename ? ` (${event.filename}:${event.lineno || 0})` : "";
        fail(new Error(`${event.message || "Python Worker 发生错误"}${location}`));
      };
      worker.postMessage({ type: "init", runtime: runtimeObjectUrls(), harness: PYTHON_HARNESS });
    } catch (error) {
      fail(error);
    }
  });
}

async function startMainThreadJudge(workerError) {
  console.warn("Python Worker 不可用，切换到本页兼容模式：", workerError);
  setRuntimeStatus("loading", "兼容模式：正在解析内嵌模块…");
  const runtime = runtimeAssets();
  const loaderSource = runtime.loaderSource.replace(
    /export\{dt as loadPyodide,U as version\};?/,
    "return { loadPyodide: dt, version: U };",
  );
  const asmModuleSource = runtime.asmModuleSource
    .replaceAll("import.meta.url", JSON.stringify("https://offline.local/pyodide.asm.mjs"))
    .replace(/export default _createPyodideModule;?/, "return _createPyodideModule;");
  if (!loaderSource.includes("return { loadPyodide: dt") || !asmModuleSource.includes("return _createPyodideModule")) {
    throw new Error("无法解析内嵌 Python 模块");
  }
  const loader = new Function(`${loaderSource}\n//# sourceURL=hot100-pyodide-loader.js`)();
  const createPyodideModule = new Function(`${asmModuleSource}\n//# sourceURL=hot100-pyodide-asm.js`)();
  const originalFetch = globalThis.fetch;
  const nativeFetch = originalFetch.bind(globalThis);
  globalThis.fetch = (input, options) => {
    const url = typeof input === "string" ? input : (input?.url || input?.href || String(input));
    if (url === "https://offline.local/pyodide.asm.wasm") {
      return Promise.resolve(new Response(runtime.wasmBytes, { status: 200, headers: { "Content-Type": "application/wasm" } }));
    }
    if (url === "https://offline.local/python_stdlib.zip") {
      return Promise.resolve(new Response(runtime.stdlibBytes, { status: 200, headers: { "Content-Type": "application/zip" } }));
    }
    return nativeFetch(input, options);
  };
  try {
    setRuntimeStatus("loading", "兼容模式：正在编译内嵌 Python…");
    mainThreadPyodide = await loader.loadPyodide({
      indexURL: "https://offline.local/",
      stdLibURL: "https://offline.local/python_stdlib.zip",
      lockFileContents: runtime.lock,
      packageBaseUrl: "https://offline.local/",
      createPyodideModule,
    });
    judgeBackend = "main";
    setRuntimeStatus("ready", "离线 Python 已就绪（兼容模式）");
    return { kind: "main", pyodide: mainThreadPyodide };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function ensureJudge() {
  if (judgeReady) return judgeReady;
  setRuntimeStatus("loading", "正在启动内嵌 Python 运行时…");
  judgeReady = startWorkerJudge()
    .catch((workerError) => startMainThreadJudge(workerError))
    .catch((error) => {
      judgeReady = null;
      judgeBackend = null;
      setRuntimeStatus("", "Python 运行时启动失败");
      throw error;
    });
  return judgeReady;
}

async function evaluate(payload, timeoutMs) {
  const backend = await ensureJudge();
  if (backend.kind === "main") {
    backend.pyodide.globals.set("payload_json", JSON.stringify(payload));
    const result = await backend.pyodide.runPythonAsync(PYTHON_HARNESS + "\nRESULT_JSON");
    return JSON.parse(result);
  }
  if (pendingRun) throw new Error("已有评测正在运行");
  const id = ++runSequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRun = null;
      destroyJudge();
      setRuntimeStatus("", "上次运行超时，运行时将在下次重启");
      reject(new Error(`运行超过 ${Math.round(timeoutMs / 1000)} 秒，已终止评测进程`));
    }, timeoutMs);
    pendingRun = {
      id,
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    };
    backend.worker.postMessage({ type: "run", id, payload });
  });
}

function prewarmJudge() {
  const start = () => ensureJudge().catch((error) => console.warn("离线 Python 预热失败：", error));
  if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 1500 });
  else setTimeout(start, 500);
}

function renderResults(result, mode) {
  elements.result_panel.className = "result-panel open";
  if (result.fatal) {
    elements.result_panel.innerHTML = `<div class="result-summary"><span class="result-title fail">评测器错误</span></div><div class="case-list"><pre class="case-value error">${escapeHtml(result.fatal)}\n${escapeHtml(result.detail || "")}</pre></div>`;
    return;
  }
  const passedCount = result.results.filter((item) => item.passed).length;
  const title = result.passed ? (mode === "submit" ? "全部通过" : "样例通过") : `${passedCount} / ${result.results.length} 个用例通过`;
  const cases = result.results.map((item, index) => {
    const expanded = !item.passed || result.results.length <= 2 ? " expanded" : "";
    const label = item.visible ? `样例 ${item.index + 1}` : `隐藏用例 ${item.index + 1}`;
    return `<article class="case-item${expanded}">
      <div class="case-head" role="button" tabindex="0"><div class="case-name"><span class="case-badge ${item.passed ? "pass" : "fail"}">${item.passed ? "✓" : "×"}</span>${label}</div><span class="case-time">${item.durationMs} ms</span></div>
      <div class="case-detail">
        <div class="case-field"><span class="case-label">输入</span><pre class="case-value">${escapeHtml(item.input)}</pre></div>
        <div class="case-field"><span class="case-label">期望</span><pre class="case-value">${escapeHtml(item.expected)}</pre></div>
        <div class="case-field"><span class="case-label">实际</span><pre class="case-value">${escapeHtml(item.actual)}</pre></div>
        ${item.stdout ? `<div class="case-field"><span class="case-label">标准输出</span><pre class="case-value">${escapeHtml(item.stdout)}</pre></div>` : ""}
        ${item.error ? `<div class="case-field"><span class="case-label">异常</span><pre class="case-value error">${escapeHtml(item.error)}</pre></div>` : ""}
      </div>
    </article>`;
  }).join("");
  elements.result_panel.innerHTML = `<div class="result-summary"><span class="result-title ${result.passed ? "pass" : "fail"}">${title}</span><button id="close-results" class="button small ghost" type="button">收起</button></div><div class="case-list">${cases}</div>`;
}

async function runEvaluation(mode) {
  if (!currentSlug) return;
  const solution = SOLUTIONS[currentSlug];
  const code = elements.code_editor.value;
  if (!code.trim()) return toast("请先输入 Python 代码", "error");
  touchRecord("code");
  const tests = mode === "sample" ? solution.tests.slice(0, Math.min(2, solution.tests.length)) : solution.tests;
  const { code: referenceCode, tests: _tests, note: _note, complexity: _complexity, ...meta } = solution;
  const payload = {
    userCode: code,
    referenceCode,
    meta,
    cases: tests.map((value, index) => ({ index, visible: index < 2, value })),
  };
  elements.run_button.disabled = true;
  elements.submit_button.disabled = true;
  elements.run_button.textContent = mode === "sample" ? "运行中…" : "运行样例";
  elements.submit_button.textContent = mode === "submit" ? "评测中…" : "提交评估";
  try {
    const result = await evaluate(payload, mode === "submit" ? 9000 : 6000);
    renderResults(result, mode);
    const record = recordFor(currentSlug);
    if (mode === "submit") record.attempts = Number(record.attempts || 0) + 1;
    if (mode === "submit" && result.passed) {
      record.status = "solved";
      record.passedAt = new Date().toISOString();
      toast("全部本地用例通过，已记录进度");
    } else if (record.status !== "solved") {
      record.status = "attempted";
    }
    record.updatedAt = new Date().toISOString();
    saveState(true);
    updateMasteredButton();
  } catch (error) {
    renderResults({ fatal: error.message || String(error) }, mode);
    toast(error.message || "评测失败", "error");
  } finally {
    elements.run_button.disabled = false;
    elements.submit_button.disabled = false;
    elements.run_button.textContent = "运行样例";
    elements.submit_button.textContent = "提交评估";
  }
}

elements.category_grid.addEventListener("click", (event) => {
  const row = event.target.closest(".problem-row");
  if (row) openProblem(row.dataset.slug);
});
elements.category_grid.addEventListener("keydown", (event) => {
  const row = event.target.closest(".problem-row");
  if (row && ["Enter", " "].includes(event.key)) { event.preventDefault(); openProblem(row.dataset.slug); }
});
[elements.search_input, elements.difficulty_filter, elements.status_filter].forEach((element) => element.addEventListener("input", renderCatalog));
elements.clear_filter_button.addEventListener("click", () => {
  elements.search_input.value = ""; elements.difficulty_filter.value = "all"; elements.status_filter.value = "all"; renderCatalog();
});
elements.continue_button.addEventListener("click", () => openProblem(bySlug.has(state.settings.lastSlug) ? state.settings.lastSlug : PROBLEMS[0].slug));
elements.random_button.addEventListener("click", () => {
  const remaining = PROBLEMS.filter((problem) => statusFor(problem.slug) !== "solved");
  const pool = remaining.length ? remaining : PROBLEMS;
  openProblem(pool[Math.floor(Math.random() * pool.length)].slug);
});
elements.back_button.addEventListener("click", () => showCatalog());
elements.previous_button.addEventListener("click", () => { const index = bySlug.get(currentSlug).index; if (index > 0) openProblem(PROBLEMS[index - 1].slug); });
elements.next_button.addEventListener("click", () => { const index = bySlug.get(currentSlug).index; if (index + 1 < PROBLEMS.length) openProblem(PROBLEMS[index + 1].slug); });
elements.mastered_button.addEventListener("click", () => {
  const record = recordFor(currentSlug);
  record.status = record.status === "solved" ? (record.attempts ? "attempted" : "todo") : "solved";
  if (record.status === "solved") record.passedAt = new Date().toISOString();
  record.updatedAt = new Date().toISOString(); saveState(true); updateMasteredButton(); toast(record.status === "solved" ? "已标记为掌握" : "已取消掌握标记");
});
document.querySelectorAll(".tab-button").forEach((button) => button.addEventListener("click", () => switchWorkspaceTab(button.dataset.tab)));
elements.code_editor.addEventListener("input", () => { touchRecord("code"); showSavePulse(elements.code_save_state); updateCursorPosition(); });
elements.code_editor.addEventListener("click", updateCursorPosition);
elements.code_editor.addEventListener("keyup", updateCursorPosition);
elements.code_editor.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    const start = elements.code_editor.selectionStart, end = elements.code_editor.selectionEnd;
    elements.code_editor.setRangeText("    ", start, end, "end");
    elements.code_editor.dispatchEvent(new Event("input"));
  }
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault(); runEvaluation(event.shiftKey ? "submit" : "sample");
  }
});
elements.notes_editor.addEventListener("input", () => { touchRecord("note"); showSavePulse(elements.notes_save_state); });
elements.font_down_button.addEventListener("click", () => changeEditorSize(-1));
elements.font_up_button.addEventListener("click", () => changeEditorSize(1));
elements.reset_code_button.addEventListener("click", () => {
  if (!currentSlug || !confirm("确定把当前代码恢复为初始模板吗？个人笔记和进度不会改变。")) return;
  elements.code_editor.value = bySlug.get(currentSlug).problem.starterCode; touchRecord("code"); updateCursorPosition(); toast("已恢复初始模板");
});
elements.copy_solution_button.addEventListener("click", async () => { await copyText(SOLUTIONS[currentSlug].code); toast("参考代码已复制"); });
elements.run_button.addEventListener("click", () => runEvaluation("sample"));
elements.submit_button.addEventListener("click", () => runEvaluation("submit"));
elements.result_panel.addEventListener("click", (event) => {
  if (event.target.closest("#close-results")) elements.result_panel.classList.remove("open");
  const head = event.target.closest(".case-head"); if (head) head.parentElement.classList.toggle("expanded");
});
elements.export_button.addEventListener("click", openExportModal);
elements.export_cancel_button.addEventListener("click", closeExportModal);
elements.export_confirm_button.addEventListener("click", () => {
  const includeCode = elements.export_code_checkbox.checked;
  closeExportModal();
  exportMarkdown(includeCode);
});
elements.export_modal.addEventListener("click", (event) => { if (event.target === elements.export_modal) closeExportModal(); });
elements.import_button.addEventListener("click", () => elements.markdown_file_input.click());
elements.markdown_file_input.addEventListener("change", async () => {
  const file = elements.markdown_file_input.files[0];
  elements.markdown_file_input.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    if (!confirm("导入会覆盖 Markdown 中包含题目的本地代码、笔记和进度，是否继续？")) return;
    const count = importMarkdown(text); toast(`已导入 ${count} 道题的学习记录`);
  } catch (error) { toast(error.message || "Markdown 导入失败", "error"); }
});
elements.theme_button.addEventListener("click", () => { applyTheme(state.settings.theme === "dark" ? "light" : "dark"); saveState(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.export_modal.classList.contains("hidden")) closeExportModal();
});
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", () => { if (currentSlug) { touchRecord("code"); touchRecord("note"); } saveState(true); });

applyTheme(state.settings.theme);
changeEditorSize(0);
renderCatalog();
route();
prewarmJudge();
