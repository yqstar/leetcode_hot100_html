const JUDGE_WORKER_SOURCE = `
let pyodide = null;
let harness = "";
let formatterBundle = null;
let formatterScript = "";
const errorText = (error) => String(error && (error.stack || error.message) || error);

function createRuntimeUrl(base64, type) {
  return URL.createObjectURL(new Blob([Uint8Array.fromBase64(base64)], { type }));
}

self.onmessage = async (event) => {
  const message = event.data;
  if (message.type === "init") {
    try {
      harness = message.harness;
      formatterBundle = message.formatterBundle;
      formatterScript = message.formatterScript;
      const nativeFetch = self.fetch.bind(self);
      const runtimeUrls = [];
      try {
        runtimeUrls.push(
          createRuntimeUrl(message.runtime.loader, "text/javascript"),
          createRuntimeUrl(message.runtime.asmModule, "text/javascript"),
          createRuntimeUrl(message.runtime.wasm, "application/wasm"),
          createRuntimeUrl(message.runtime.stdlib, "application/zip"),
        );
        // Preserve Pyodide's Wasm initialization hook while serving the embedded binary.
        self.fetch = (url, options) => nativeFetch(
          String(url) === "https://offline.local/pyodide.asm.wasm" ? runtimeUrls[2] : url, options,
        );
        const [loader, asmModule] = await Promise.all([import(runtimeUrls[0]), import(runtimeUrls[1])]);
        pyodide = await loader.loadPyodide({
          indexURL: "https://offline.local/",
          stdLibURL: runtimeUrls[3],
          lockFileContents: message.lock,
          packageBaseUrl: "https://offline.local/",
          createPyodideModule: asmModule.default,
        });
      } finally {
        self.fetch = nativeFetch;
        runtimeUrls.forEach((url) => URL.revokeObjectURL(url));
      }
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "init-error", error: errorText(error) });
    }
    return;
  }
  if (message.type !== "run" && message.type !== "format") return;
  try {
    let result;
    if (message.type === "run") {
      pyodide.globals.set("payload_json", JSON.stringify(message.payload));
      result = await pyodide.runPythonAsync(harness + "\\nRESULT_JSON");
    } else {
      if (formatterBundle) {
        pyodide.globals.set("formatter_bundle_json", JSON.stringify(formatterBundle));
        pyodide.globals.set("formatter_line_length", formatterBundle.lineLength);
        formatterBundle = null;
      }
      pyodide.globals.set("formatter_source", message.source);
      result = await pyodide.runPythonAsync(formatterScript + "\\nFORMAT_RESULT_JSON");
    }
    self.postMessage({ type: message.type + "-result", id: message.id, result: JSON.parse(result) });
  } catch (error) {
    self.postMessage({ type: message.type + "-error", id: message.id, error: errorText(error) });
  }
};
`;

let judgeWorker = null;
let judgeReady = null;
let pendingPythonRequest = null;
let pythonRequestSequence = 0;

function setRuntimeStatus(status, message) {
  elements.runtime_status.className = `runtime-status ${status}`;
  elements.runtime_status.querySelector("span:last-child").textContent = message;
  elements.runtime_status.title = message;
  elements.runtime_status.setAttribute("aria-label", message);
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
        if (pendingPythonRequest) { pendingPythonRequest.reject(error); pendingPythonRequest = null; }
        judgeReady = null;
        setRuntimeStatus("", "Python 评测进程已停止，将在下次运行时重启");
      }
    };
    try {
      // A data URL can start a module worker from file:// without a cross-origin Blob fetch.
      const workerUrl = `data:text/javascript;base64,${new TextEncoder().encode(JUDGE_WORKER_SOURCE).toBase64()}`;
      worker = new Worker(workerUrl, { type: "module", name: "lc-python-judge" });
      judgeWorker = worker;
      initTimer = setTimeout(() => fail(new Error("Python Worker 启动超时")), 20000);
      worker.onmessage = (event) => {
        const message = event.data;
        if (message.type === "ready") {
          if (initialized) return;
          initialized = true;
          clearTimeout(initTimer);
          setRuntimeStatus("ready", "离线 Python 已就绪");
          resolve(worker);
        } else if (message.type === "init-error") {
          fail(new Error(message.error));
        } else if (pendingPythonRequest?.id === message.id && message.type === `${pendingPythonRequest.type}-result`) {
          const pending = pendingPythonRequest; pendingPythonRequest = null; pending.resolve(message.result);
        } else if (pendingPythonRequest?.id === message.id && message.type === `${pendingPythonRequest.type}-error`) {
          const pending = pendingPythonRequest; pendingPythonRequest = null; pending.reject(new Error(message.error));
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        const location = event.filename ? ` (${event.filename}:${event.lineno || 0})` : "";
        fail(new Error(`${event.message || "Python Worker 发生错误"}${location}`));
      };
      worker.postMessage({
        type: "init",
        runtime: RUNTIME_BASE64,
        lock: PYODIDE_LOCK,
        harness: PYTHON_HARNESS,
        formatterBundle: FORMATTER_BUNDLE,
        formatterScript: PYTHON_FORMATTER,
      });
    } catch (error) {
      fail(error);
    }
  });
}

function ensureJudge() {
  if (judgeReady) return judgeReady;
  setRuntimeStatus("loading", "正在启动内嵌 Python 运行时…");
  judgeReady = startWorkerJudge()
    .catch((error) => {
      judgeReady = null;
      setRuntimeStatus("", "Python 运行时启动失败");
      throw error;
    });
  return judgeReady;
}

async function evaluate(payload, timeoutMs) {
  const worker = await ensureJudge();
  return requestPythonWorker(worker, "run", { payload }, timeoutMs);
}

async function formatPythonSource(source, timeoutMs = 12000) {
  const worker = await ensureJudge();
  return requestPythonWorker(worker, "format", { source }, timeoutMs);
}

function requestPythonWorker(worker, type, payload, timeoutMs) {
  if (pendingPythonRequest) throw new Error("已有 Python 任务正在运行");
  const id = ++pythonRequestSequence;
  const action = type === "format" ? "格式化" : "运行";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingPythonRequest = null;
      worker.terminate();
      judgeWorker = null;
      judgeReady = null;
      setRuntimeStatus("", `上次${action}超时，运行时将在下次操作时重启`);
      reject(new Error(`${action}超过 ${Math.round(timeoutMs / 1000)} 秒，已终止 Python 进程`));
    }, timeoutMs);
    pendingPythonRequest = {
      id,
      type,
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    };
    try {
      worker.postMessage({ type, id, ...payload });
    } catch (error) {
      const pending = pendingPythonRequest;
      pendingPythonRequest = null;
      pending.reject(error);
    }
  });
}

function prewarmJudge() {
  setTimeout(() => ensureJudge().catch((error) => console.warn("离线 Python 预热失败：", error)), 500);
}

function formatConsoleValue(value) {
  const compact = JSON.stringify(value);
  return compact.length <= 180 ? compact : JSON.stringify(value, null, 2);
}

function consoleFieldMarkup(label, value, error = false) {
  return `<div class="console-field"><span class="console-field-label">${escapeHtml(label)}</span><pre class="console-field-value${error ? " error" : ""}">${escapeHtml(value)}</pre></div>`;
}

function inputFieldsForConsole(value) {
  const solution = SOLUTIONS[currentSlug];
  if (state.settings.codeMode === "acm") return [{ label: "标准输入", value: formatAcmCase(value, solution) }];
  if (solution.kind === "class") {
    return [
      { label: "operations =", value: formatConsoleValue(value.ops) },
      { label: "arguments =", value: formatConsoleValue(value.args) },
    ];
  }
  const names = solutionArgumentNames(solution);
  return value.map((item, index) => ({
    label: `${names[index] || `参数 ${index + 1}`} =`,
    value: formatConsoleValue(item),
  }));
}

function sampleCasesForConsole() {
  if (!currentSlug) return [];
  const solution = SOLUTIONS[currentSlug];
  const cases = solution.tests.slice(0, 2).map((value, index) => ({
    label: `Case ${index + 1}`,
    value,
  }));
  for (const [index, source] of customCasesFor().entries()) {
    try {
      cases.push({ label: `自定义 ${index + 1}`, value: parseCustomCase(source, solution) });
    } catch (error) {
      cases.push({ label: `自定义 ${index + 1}`, raw: source, error: error.message || String(error) });
    }
  }
  return cases;
}

function consoleCaseTabs(entries, selectedIndex, includeAddButton = false) {
  const tabs = entries.map((entry, index) => {
    const resultClass = entry.result ? (entry.result.passed ? " pass" : " fail") : "";
    return `<button class="console-case-tab${index === selectedIndex ? " active" : ""}${resultClass}" type="button" role="tab" aria-selected="${index === selectedIndex}" tabindex="${index === selectedIndex ? "0" : "-1"}" data-console-case="${index}">${escapeHtml(entry.label)}</button>`;
  }).join("");
  const addButton = includeAddButton
    ? `<button class="console-add-case" type="button" data-add-custom-case aria-label="添加自定义样例" title="添加自定义样例">＋</button>`
    : "";
  return `<div class="console-case-tabs" role="tablist" aria-label="测试样例">${tabs}${addButton}</div>`;
}

function consoleNavigation(view) {
  return `<div class="console-nav" role="tablist" aria-label="运行控制台">
    <button class="console-view-tab${view === "cases" ? " active" : ""}" type="button" role="tab" aria-selected="${view === "cases"}" tabindex="${view === "cases" ? "0" : "-1"}" data-console-view="cases"><span class="console-tab-icon" aria-hidden="true">✓</span>测试用例</button>
    <button class="console-view-tab${view === "results" ? " active" : ""}" type="button" role="tab" aria-selected="${view === "results"}" tabindex="${view === "results" ? "0" : "-1"}" data-console-view="results"><span class="console-tab-icon" aria-hidden="true">&gt;_</span>测试结果</button>
    <button class="console-close" type="button" data-close-console aria-label="收起运行控制台" title="收起">⌄</button>
  </div>`;
}

function renderConsoleCases() {
  const entries = sampleCasesForConsole();
  testConsoleState.caseIndex = clamp(testConsoleState.caseIndex, 0, Math.max(0, entries.length - 1));
  if (!entries.length) return `<div class="console-empty">当前题目没有可用样例</div>`;
  const entry = entries[testConsoleState.caseIndex];
  const fields = entry.error
    ? consoleFieldMarkup("样例格式错误", `${entry.error}\n\n${entry.raw}`, true)
    : inputFieldsForConsole(entry.value).map((field) => consoleFieldMarkup(field.label, field.value)).join("");
  return `${consoleCaseTabs(entries, testConsoleState.caseIndex, true)}<div class="console-fields" role="tabpanel">${fields}</div>`;
}

function evaluationTitle(result, mode) {
  const passedCount = result.results.filter((item) => item.passed).length;
  if (result.passed) return mode === "submit" ? "全部通过" : "运行通过";
  return `${passedCount} / ${result.results.length} 个${mode === "submit" ? "用例" : "样例"}通过`;
}

function renderConsoleResults() {
  const { evaluation, evaluationMode, evaluatedCases } = testConsoleState;
  if (!evaluation) return `<div class="console-empty">运行代码后，这里会显示每个 Case 的实际输出和期望结果</div>`;
  if (evaluation.fatal || !Array.isArray(evaluation.results)) {
    const message = evaluation.fatal || "评测器返回了无效结果";
    return `<div class="console-result-banner"><span class="console-result-title fail">× 评测器错误</span></div><div class="console-fields">${consoleFieldMarkup("错误信息", `${message}${evaluation.detail ? `\n${evaluation.detail}` : ""}`, true)}</div>`;
  }
  const entries = evaluation.results.map((result, index) => ({
    label: evaluatedCases[index].label || `Case ${index + 1}`,
    result,
  }));
  testConsoleState.caseIndex = clamp(testConsoleState.caseIndex, 0, Math.max(0, entries.length - 1));
  const item = entries[testConsoleState.caseIndex].result;
  const source = evaluatedCases[testConsoleState.caseIndex];
  const inputFields = inputFieldsForConsole(source.value).map((field) => consoleFieldMarkup(field.label, field.value)).join("");
  const duration = `${item.durationMs} ms`;
  const details = [
    inputFields,
    consoleFieldMarkup("期望结果", item.expected),
    consoleFieldMarkup("实际结果", item.actual),
    item.stdout ? consoleFieldMarkup("标准输出", item.stdout) : "",
    item.stderr ? consoleFieldMarkup("标准错误", item.stderr, true) : "",
    item.error ? consoleFieldMarkup("异常", item.error, true) : "",
  ].join("");
  return `${consoleCaseTabs(entries, testConsoleState.caseIndex)}
    <div class="console-result-banner"><span class="console-result-title ${evaluation.passed ? "pass" : "fail"}">${evaluation.passed ? "✓" : "×"} ${evaluationTitle(evaluation, evaluationMode)}</span><span class="console-result-time">当前 Case · ${duration}</span></div>
    <div class="console-fields" role="tabpanel">${details}</div>`;
}

function renderTestConsole(view = testConsoleState.view) {
  testConsoleState.view = view === "results" ? "results" : "cases";
  elements.result_panel.innerHTML = `${consoleNavigation(testConsoleState.view)}<div class="console-body">${testConsoleState.view === "cases" ? renderConsoleCases() : renderConsoleResults()}</div>`;
  elements.result_panel.classList.add("open");
  elements.custom_case_button.setAttribute("aria-expanded", "true");
}

function closeTestConsole() {
  elements.result_panel.classList.remove("open");
  elements.custom_case_button.setAttribute("aria-expanded", "false");
}

function resetTestConsole() {
  Object.assign(testConsoleState, { view: "cases", caseIndex: 0, evaluation: null, evaluationMode: "sample", evaluatedCases: [] });
  elements.result_panel.className = "result-panel";
  elements.result_panel.innerHTML = "";
  elements.custom_case_button.setAttribute("aria-expanded", "false");
}

function toggleTestConsole() {
  if (elements.result_panel.classList.contains("open")) closeTestConsole();
  else renderTestConsole();
}

function renderResults(result, mode, evaluatedCases) {
  Object.assign(testConsoleState, { evaluation: result, evaluationMode: mode, evaluatedCases });
  testConsoleState.caseIndex = result?.results?.findIndex((item) => !item.passed) ?? 0;
  if (testConsoleState.caseIndex < 0) testConsoleState.caseIndex = 0;
  renderTestConsole("results");
}

function codePositionAtOffset(source, offset) {
  const safeOffset = clamp(offset, 0, source.length);
  const prefix = source.slice(0, safeOffset);
  const lineStart = prefix.lastIndexOf("\n") + 1;
  return {
    line: (prefix.match(/\n/g) || []).length + 1,
    column: safeOffset - lineStart + 1,
  };
}

function codeOffsetAtPosition(source, position) {
  const lines = source.split("\n");
  const lineIndex = clamp(Number(position.line || 1) - 1, 0, lines.length - 1);
  let offset = 0;
  for (let index = 0; index < lineIndex; index += 1) offset += lines[index].length + 1;
  return offset + clamp(Number(position.column || 1) - 1, 0, lines[lineIndex].length);
}

function focusCodePosition(line, column) {
  const editor = elements.code_editor;
  const offset = codeOffsetAtPosition(editor.value, { line, column });
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(offset, Math.min(offset + 1, editor.value.length));
  updateCursorPosition();
}

function setEvaluationBusy(busy, mode) {
  evaluationInProgress = busy;
  elements.result_panel.setAttribute("aria-busy", String(busy));
  for (const button of evaluationControlButtons) button.disabled = busy;
  elements.run_button.textContent = busy && mode === "sample" ? "运行中…" : "运行";
  elements.submit_button.textContent = busy && mode === "submit" ? "提交中…" : "提交";
}

function setFormattingBusy(busy) {
  if (busy) clearEditorFeedback();
  formattingInProgress = busy;
  elements.code_editor.readOnly = busy;
  elements.code_editor.setAttribute("aria-busy", String(busy));
  for (const button of evaluationControlButtons) button.disabled = busy;
  elements.format_code_button.textContent = busy ? "格式化中…" : "格式化";
}

async function formatCurrentCode() {
  if (!currentSlug) return;
  if (evaluationInProgress) return toast("评测正在运行，请稍候", "error");
  if (formattingInProgress) return;
  const slug = currentSlug;
  const codeMode = state.settings.codeMode;
  const editor = elements.code_editor;
  const source = editor.value;
  if (!source.trim()) return toast("没有可格式化的 Python 代码", "error");
  const selection = {
    start: codePositionAtOffset(source, editor.selectionStart),
    end: codePositionAtOffset(source, editor.selectionEnd),
    direction: editor.selectionDirection,
  };
  setFormattingBusy(true);
  try {
    const result = await formatPythonSource(source);
    if (currentSlug !== slug || state.settings.codeMode !== codeMode || editor.value !== source) return toast("题目、模式或代码已经变化，未应用格式化结果", "error");
    if (!result?.ok) {
      if (result?.kind === "syntax" && Number.isInteger(result.line) && Number.isInteger(result.column)) {
        focusCodePosition(result.line, result.column);
        return toast(`第 ${result.line} 行、第 ${result.column} 列附近存在语法错误`, "error");
      }
      return toast(`格式化失败：${result?.error || "格式化器返回了无效结果"}`, "error");
    }
    if (!result.changed) return showEditorFeedback("格式已规范，无需调整");
    const afterStart = codeOffsetAtPosition(result.code, selection.start);
    const afterEnd = codeOffsetAtPosition(result.code, selection.end);
    editor.setRangeText(result.code, 0, source.length, "preserve");
    editor.setSelectionRange(afterStart, afterEnd, selection.direction || "none");
    notifyCodeInput(editor);
    syncCurrentEditors(true);
    showEditorFeedback("已格式化");
  } catch (error) {
    if (currentSlug === slug) toast(error.message || "代码格式化失败", "error");
  } finally {
    setFormattingBusy(false);
  }
}

async function runEvaluation(mode) {
  if (!currentSlug) return;
  if (evaluationInProgress) return toast("评测正在运行，请稍候", "error");
  if (formattingInProgress) return toast("代码正在格式化，请稍候", "error");
  const slug = currentSlug;
  const codeMode = state.settings.codeMode;
  const solution = SOLUTIONS[slug];
  const code = elements.code_editor.value;
  if (!code.trim()) return toast("请先输入 Python 代码", "error");
  touchRecord("code");
  const tests = mode === "sample" ? solution.tests.slice(0, 2) : solution.tests;
  const { code: referenceCode, tests: _tests, note: _note, complexity: _complexity, ...meta } = solution;
  const cases = tests.map((value) => ({
    value,
    ...(codeMode === "acm" ? { stdin: formatAcmCase(value, solution) } : {}),
  }));
  if (mode === "sample") {
    for (const [index, source] of customCasesFor(slug).entries()) {
      try {
        const value = parseCustomCase(source, solution);
        cases.push({
          label: `自定义样例 ${index + 1}`,
          value,
          ...(codeMode === "acm" ? { stdin: formatAcmCase(value, solution) } : {}),
        });
      } catch (error) {
        return toast(`自定义样例 ${index + 1} 无效：${error.message}`, "error");
      }
    }
  }
  const payload = {
    mode: codeMode,
    userCode: code,
    referenceCode,
    meta,
    cases: cases.map(({ value, stdin }) => ({ value, ...(codeMode === "acm" ? { stdin } : {}) })),
  };
  setEvaluationBusy(true, mode);
  try {
    const result = await evaluate(payload, mode === "submit" ? 9000 : 6000);
    const record = recordFor(slug);
    if (mode === "submit") record.attempts += 1;
    const updatedAt = timestamp();
    if (mode === "submit" && result.passed) {
      record.status = "solved";
      record.passedAt = updatedAt;
    } else if (record.status !== "solved") {
      record.status = "attempted";
    }
    record.updatedAt = updatedAt;
    saveState(true);
    if (currentSlug === slug && state.settings.codeMode === codeMode) {
      renderResults(result, mode, cases);
      updateMasteredButton();
      if (mode === "submit" && result.passed) toast("全部本地用例通过，已记录进度");
    }
  } catch (error) {
    if (currentSlug === slug && state.settings.codeMode === codeMode) {
      renderResults({ fatal: error.message || String(error) }, mode, cases);
      toast(error.message || "评测失败", "error");
    }
  } finally {
    setEvaluationBusy(false);
    if (!currentSlug && !privacyMode) renderCatalog();
  }
}
