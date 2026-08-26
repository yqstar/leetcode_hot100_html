import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import vm from "node:vm";
import solutions from "../src/solutions.mjs";
import pythonHarness from "../src/python-harness.mjs";

const root = new URL("../", import.meta.url);
const runtimeUrl = new URL(".cache/runtime/", root);
const problems = JSON.parse(await readFile(new URL("src/problems.json", root), "utf8"));

const safeJson = (value) => JSON.stringify(value)
  .replaceAll("<", "\\u003c")
  .replaceAll("\u2028", "\\u2028")
  .replaceAll("\u2029", "\\u2029");

const compactShell = (compressedApp) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="压缩为单个 HTML 的 LC Python 离线训练场">
  <title>LC Python 离线训练场 · 正在启动</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #080b12; color: #e7ecf7; }
    main { width: min(520px, calc(100% - 40px)); padding: 28px; border: 1px solid #293249; border-radius: 18px; background: #111725; box-shadow: 0 24px 80px #0008; }
    h1 { margin: 0 0 10px; font-size: 20px; }
    p { margin: 0; color: #aeb9ce; line-height: 1.7; }
    .loader { width: 100%; height: 4px; margin-top: 22px; overflow: hidden; border-radius: 99px; background: #252d40; }
    .loader::after { content: ""; display: block; width: 42%; height: 100%; border-radius: inherit; background: #7c9cff; animation: loading 1.15s ease-in-out infinite alternate; }
    pre { display: none; margin: 18px 0 0; padding: 12px; overflow: auto; border-radius: 10px; background: #090d16; color: #ffb4b4; white-space: pre-wrap; }
    @keyframes loading { from { transform: translateX(-105%); } to { transform: translateX(245%); } }
  </style>
</head>
<body>
  <main>
    <h1>正在启动离线训练场</h1>
    <p id="status">正在从这个 HTML 内解压题目、图片和 Python 运行时…</p>
    <div class="loader" id="loader" aria-hidden="true"></div>
    <pre id="error"></pre>
  </main>
  <script>
  (() => {
    "use strict";
    const COMPRESSED_APP = ${JSON.stringify(compressedApp.toString("base64"))};
    const status = document.getElementById("status");
    const loader = document.getElementById("loader");
    const errorOutput = document.getElementById("error");

    async function start() {
      if (typeof DecompressionStream !== "function") {
        throw new Error("当前浏览器不支持本地解压。请升级到最新版 Chrome、Edge、Safari 或 Firefox，或改用 lc_offline.html。");
      }
      const binary = atob(COMPRESSED_APP);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      const html = await new Response(stream).text();
      if (!/^<!doctype html>/i.test(html) || !html.includes("const PROBLEMS =")) {
        throw new Error("压缩内容校验失败，请重新获取该 HTML 文件。");
      }
      document.open();
      document.write(html);
      document.close();
    }

    start().catch((error) => {
      status.textContent = "启动失败";
      loader.style.display = "none";
      errorOutput.style.display = "block";
      errorOutput.textContent = error?.stack || String(error);
    });
  })();
  </script>
</body>
</html>
`;

async function writeArtifact(relativePath, buffer) {
  const outputPath = new URL(relativePath, root);
  let previous = null;
  try {
    previous = await readFile(outputPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const changed = !previous?.equals(buffer);
  if (changed) {
    const temporaryPath = new URL(`${relativePath}.tmp`, root);
    await writeFile(temporaryPath, buffer);
    await rename(temporaryPath, outputPath);
  }
  return changed;
}

async function buildArtifact() {
  const [source, lockText, loader, asmModule, wasm, stdlib] = await Promise.all([
    readFile(new URL("src/app.html", root), "utf8"),
    readFile(new URL("pyodide-lock.json", runtimeUrl), "utf8"),
    readFile(new URL("pyodide.mjs", runtimeUrl)),
    readFile(new URL("pyodide.asm.mjs", runtimeUrl)),
    readFile(new URL("pyodide.asm.wasm", runtimeUrl)),
    readFile(new URL("python_stdlib.zip", runtimeUrl)),
  ]);
  const replacements = {
    __PROBLEMS_JSON__: safeJson(problems),
    __SOLUTIONS_JSON__: safeJson(solutions),
    __PYTHON_HARNESS_JSON__: safeJson(pythonHarness),
    __PYODIDE_LOCK_JSON__: safeJson(JSON.parse(lockText)),
    __PYODIDE_LOADER_B64__: loader.toString("base64"),
    __PYODIDE_ASM_MJS_B64__: asmModule.toString("base64"),
    __PYODIDE_WASM_B64__: wasm.toString("base64"),
    __PYODIDE_STDLIB_B64__: stdlib.toString("base64"),
  };

  let output = source;
  for (const [token, value] of Object.entries(replacements)) {
    const occurrences = output.split(token).length - 1;
    if (occurrences !== 1) throw new Error(`构建占位符 ${token} 出现 ${occurrences} 次`);
    output = output.replace(token, () => value);
  }
  if (/__[A-Z][A-Z0-9_]+__/.test(output)) throw new Error("HTML 构建占位符未完整替换");

  const outputBuffer = Buffer.from(output);
  const compressedBuffer = gzipSync(outputBuffer, { level: 9 });
  const compactBuffer = Buffer.from(compactShell(compressedBuffer));
  const [changed, compactChanged] = await Promise.all([
    writeArtifact("lc_offline.html", outputBuffer),
    writeArtifact("lc_offline_compact.html", compactBuffer),
  ]);

  const hash = createHash("sha256").update(outputBuffer).digest("hex");
  console.log(changed ? "已生成 lc_offline.html" : "构建产物无变化，跳过写入");
  console.log(`题目 ${problems.length}，题解 ${Object.keys(solutions).length}，内嵌图片 ${(output.match(/data:image\//gi) || []).length}`);
  console.log(`大小 ${(outputBuffer.byteLength / 1024 / 1024).toFixed(2)} MiB，SHA-256 ${hash}`);
  const compactHash = createHash("sha256").update(compactBuffer).digest("hex");
  const compactRatio = (100 * compactBuffer.byteLength / outputBuffer.byteLength).toFixed(1);
  console.log(compactChanged ? "已生成 lc_offline_compact.html" : "压缩构建产物无变化，跳过写入");
  console.log(`压缩单文件 ${(compactBuffer.byteLength / 1024 / 1024).toFixed(2)} MiB（原文件的 ${compactRatio}%），SHA-256 ${compactHash}`);
  return output;
}

const harnessLibrary = pythonHarness.replace(
  /\nRESULT_JSON = json\.dumps\(run_payload\(json\.loads\(payload_json\)\), ensure_ascii=False\)\n?$/,
  "",
);
if (harnessLibrary === pythonHarness) throw new Error("无法拆分 Python 评测器入口");
const PYTHON_BATCH_RUNNER = `import json, sys\n${harnessLibrary}\npayloads = json.load(sys.stdin)\nprint(json.dumps([run_payload(payload) for payload in payloads], ensure_ascii=False))\n`;
if (Buffer.byteLength(PYTHON_BATCH_RUNNER) > 64 * 1024) throw new Error("Python 批量测试入口超过安全的命令行参数大小");

function pythonResults(payloads) {
  const processResult = spawnSync("python3", ["-c", PYTHON_BATCH_RUNNER], {
    encoding: "utf8",
    input: JSON.stringify(payloads),
    maxBuffer: 10 * 1024 * 1024,
  });
  let parsed;
  try {
    parsed = JSON.parse(typeof processResult.stdout === "string" ? processResult.stdout.trim() : "");
  } catch (error) {
    parsed = null;
  }
  return { processResult, parsed };
}

function pythonProcessFailure(processResult) {
  return processResult.error?.stack
    || processResult.stderr?.trim()
    || processResult.stdout?.trim()
    || `python3 子进程未正常退出（status=${processResult.status}, signal=${processResult.signal || "none"}）`;
}

function payloadFor(solution, userCode = solution.code, limit = solution.tests.length) {
  const { code: referenceCode, tests, note: _note, complexity: _complexity, ...meta } = solution;
  return {
    userCode,
    referenceCode,
    meta,
    cases: tests.slice(0, limit).map((value, index) => ({ index, visible: index < 2, value })),
  };
}

function testReferenceSolutions() {
  const failures = [];
  const evaluable = [];
  for (const problem of problems) {
    const solution = solutions[problem.slug];
    if (!solution) {
      failures.push(`${problem.slug}: 缺少题解`);
      continue;
    }
    evaluable.push({ problem, payload: payloadFor(solution) });
  }
  const { processResult, parsed } = pythonResults(evaluable.map(({ payload }) => payload));
  if (processResult.status !== 0 || !Array.isArray(parsed)) {
    throw new Error(`参考实现批量执行失败：${pythonProcessFailure(processResult)}`);
  }
  for (const [index, result] of parsed.entries()) {
    if (result?.passed) continue;
    const problem = evaluable[index].problem;
    failures.push(`${problem.frontendId}. ${problem.title}: ${JSON.stringify(result)}`);
  }
  if (failures.length) throw new Error(`参考实现失败 ${failures.length} 题：\n${failures.join("\n")}`);
  console.log(`PASS ${problems.length} 道参考实现与 CPython 评测适配`);
}

function testNegativeCases() {
  const cases = [
    ["two-sum", "class Solution:\n    def twoSum(self, nums, target): return [0, 0]", "普通错误答案"],
    ["move-zeroes", "class Solution:\n    def moveZeroes(self, nums): return sorted(nums)", "未按要求原地修改"],
    ["copy-list-with-random-pointer", "class Solution:\n    def copyRandomList(self, head): return head", "未进行深拷贝"],
    ["lowest-common-ancestor-of-a-binary-tree", "class Solution:\n    def lowestCommonAncestor(self, root, p, q): return TreeNode(3)", "返回了伪造节点"],
    ["valid-parentheses", "class Solution:\n    def isValid(self, s) return True", "Python 语法错误"],
  ];
  const { processResult, parsed } = pythonResults(cases.map(([slug, userCode]) => payloadFor(solutions[slug], userCode, 2)));
  if (processResult.status !== 0 || !Array.isArray(parsed)) {
    throw new Error(`反例批量执行失败：${pythonProcessFailure(processResult)}`);
  }
  for (const [index, result] of parsed.entries()) {
    if (result?.passed) throw new Error(`${cases[index][0]} 未能拒绝：${cases[index][2]}`);
  }
  console.log(`PASS ${cases.length} 类错误答案均被拒绝`);
}

function testCustomCases() {
  const methodSolution = solutions["two-sum"];
  const methodPayload = payloadFor(methodSolution, methodSolution.code, 0);
  methodPayload.cases = [{ index: 0, visible: true, label: "自定义样例 1", value: [[5, 1, 9], 10] }];

  const classSolution = solutions["lru-cache"];
  const classPayload = payloadFor(classSolution, classSolution.code, 0);
  classPayload.cases = [{ index: 0, visible: true, label: "自定义样例 2", value: { ops: ["LRUCache", "put", "get"], args: [[1], [7, 9], [7]] } }];

  const invalidClassPayload = payloadFor(classSolution, classSolution.code, 0);
  invalidClassPayload.cases = [{ index: 0, visible: true, value: { ops: ["LRUCache", "get"], args: [[1]] } }];

  const { processResult, parsed } = pythonResults([methodPayload, classPayload, invalidClassPayload]);
  const valid = parsed?.[0]?.passed && parsed?.[0]?.results?.[0]?.label === "自定义样例 1"
    && parsed?.[1]?.passed && parsed?.[1]?.results?.[0]?.label === "自定义样例 2";
  if (processResult.status !== 0 || !valid || parsed?.[2]?.fatal !== "内置参考实现执行失败") {
    throw new Error(`自定义样例执行失败：${pythonProcessFailure(processResult)}`);
  }
  console.log("PASS 函数题、设计题与无效自定义样例校验");
}

function verifyExportHelpers(html, check) {
  const start = html.indexOf("function base64FromBytes");
  const end = html.indexOf("function exportMarkdown", start);
  check(start >= 0 && end > start, "可提取 Markdown 导出辅助函数");
  const context = {
    TextEncoder,
    TextDecoder,
    Uint8Array,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    escapeHtml: (value) => String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;"),
  };
  const sample = "中文笔记 | 换行\nemoji 🚀";
  const script = `${html.slice(start, end)}\nglobalThis.helperResult = {
    decoded: decodeRecordText(encodeRecordText(${JSON.stringify(sample)})),
    note: markdownTableCell(${JSON.stringify(sample + " <tag>")}),
    code: markdownCodeCell("if x < 2:\\n    return x"),
  };`;
  new vm.Script(script, { filename: "export-helpers.test.js" }).runInNewContext(context);
  check(context.helperResult.decoded === sample, "导出文本 UTF-8 编解码可往返");
  check(context.helperResult.note.includes("&#124;") && context.helperResult.note.includes("<br>") && context.helperResult.note.includes("&lt;tag&gt;"), "Markdown 表格笔记转义正确");
  check(context.helperResult.code.startsWith("<code>") && context.helperResult.code.includes("&nbsp;&nbsp;&nbsp;&nbsp;"), "Markdown 表格代码格式正确");
}

function verifyStateHelpers(html, check) {
  const recordStart = html.indexOf("function normalizeRecord");
  const settingsStart = html.indexOf("function normalizeSettings", recordStart);
  const loadStateStart = html.indexOf("function loadState", settingsStart);
  check(recordStart >= 0 && settingsStart > recordStart && loadStateStart > settingsStart, "可提取本地状态校验函数");

  const recordContext = {
    VALID_STATUSES: new Set(["todo", "attempted", "solved"]),
    MAX_CUSTOM_CASES: 2,
    MAX_CUSTOM_CASE_LENGTH: 5,
    EMPTY_RECORD: Object.freeze({ status: "todo", attempts: 0, note: "", updatedAt: null, passedAt: null }),
  };
  const recordScript = `${html.slice(recordStart, settingsStart)}\nglobalThis.normalized = normalizeRecord({
    status: "invalid", attempts: -3, note: 42, code: null,
    customCases: ["valid", "too-long", 7, "ok"],
  });`;
  new vm.Script(recordScript, { filename: "state-record.test.js" }).runInNewContext(recordContext);
  check(recordContext.normalized.status === "todo" && recordContext.normalized.attempts === 0 && recordContext.normalized.note === "" && !("code" in recordContext.normalized), "损坏的题目状态会回退到安全默认值");
  check(JSON.stringify(recordContext.normalized.customCases) === JSON.stringify(["valid", "ok"]), "自定义样例会按类型、大小和数量清洗");

  const settingsContext = {
    STATE_VERSION: 3,
    blankState: () => ({ settings: { theme: "dark", editorSize: 14, lastSlug: "first", expandProblemByDefault: true, problemPaneWidth: 43 } }),
    bySlug: new Map([["first", true]]),
  };
  const settingsScript = `${html.slice(settingsStart, loadStateStart)}\nglobalThis.normalized = normalizeSettings({
    theme: "invalid", editorSize: 99, lastSlug: "missing", expandProblemByDefault: "true",
  });
globalThis.migrated = normalizeSettings({ theme: "light", editorSize: 16, lastSlug: "first", expandProblemByDefault: false }, 1);`;
  new vm.Script(settingsScript, { filename: "state-settings.test.js" }).runInNewContext(settingsContext);
  check(JSON.stringify(settingsContext.normalized) === JSON.stringify({ theme: "dark", editorSize: 20, lastSlug: "first", expandProblemByDefault: true, problemPaneWidth: 43 }), "损坏的界面设置会回退到默认展开题面和分栏宽度");
  check(JSON.stringify(settingsContext.migrated) === JSON.stringify({ theme: "light", editorSize: 16, lastSlug: "first", expandProblemByDefault: true, problemPaneWidth: 43 }), "旧版状态升级后会采用默认展开题面和分栏宽度");
}

function verifyPrivacyShortcutHelpers(html, check) {
  const start = html.indexOf("function resetPrivacyShortcut");
  const end = html.indexOf("function updatePrivacyPageClock", start);
  check(start >= 0 && end > start, "可提取双击回车判定函数");
  const context = { Event: class Event { constructor(type) { this.type = type; } } };
  const script = `let lastPrivacyEnterAt = null;
let privacyFirstEnterSnapshot = null;
const DOUBLE_ENTER_WINDOW_MS = 450;
${html.slice(start, end)}
globalThis.shortcutResults = [
  registerPrivacyEnter(1_000),
  registerPrivacyEnter(1_300),
  registerPrivacyEnter(2_000),
  (resetPrivacyShortcut(), registerPrivacyEnter(3_000)),
  registerPrivacyEnter(3_451),
  registerPrivacyEnter(3_700),
];
const textarea = {
  value: "line",
  selectionStart: 4,
  selectionEnd: 4,
  selectionDirection: "none",
  scrollTop: 12,
  isConnected: true,
  matches: (selector) => selector === "textarea",
  setSelectionRange(start, end, direction) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; },
  dispatchEvent(event) { this.dispatchedEvent = event.type; },
};
rememberPrivacyFirstEnter({ target: textarea });
textarea.value = "line\\n";
textarea.selectionStart = 5;
textarea.selectionEnd = 5;
restorePrivacyFirstEnter({ target: textarea });
globalThis.snapshotResult = { value: textarea.value, selectionStart: textarea.selectionStart, scrollTop: textarea.scrollTop, event: textarea.dispatchedEvent };`;
  new vm.Script(script, { filename: "double-enter.test.js" }).runInNewContext(context);
  check(JSON.stringify(context.shortcutResults) === JSON.stringify([false, true, false, false, false, true]), "双击回车仅在 450ms 时间窗内触发并在触发后复位");
  check(JSON.stringify(context.snapshotResult) === JSON.stringify({ value: "line", selectionStart: 4, scrollTop: 12, event: "input" }), "编辑器触发隐私页时会撤销第一次回车产生的多余换行");
}

function verifyEditorHelpers(html, check) {
  const start = html.indexOf("function indentCodeSelection");
  const end = html.indexOf("function base64FromBytes", start);
  check(start >= 0 && end > start, "可提取代码缩进辅助函数");
  const context = { Event: class Event { constructor(type) { this.type = type; } } };
  const script = `const editor = {
  value: "a\\nb\\n", selectionStart: 0, selectionEnd: 4,
  setRangeText(text, start, end, mode) {
    this.value = this.value.slice(0, start) + text + this.value.slice(end);
    const cursor = mode === "end" ? start + text.length : start;
    this.selectionStart = cursor; this.selectionEnd = cursor;
  },
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  dispatchEvent() {},
};
const elements = { code_editor: editor };
${html.slice(start, end)}
indentCodeSelection(false);
globalThis.indented = { value: editor.value, start: editor.selectionStart, end: editor.selectionEnd };
indentCodeSelection(true);
globalThis.outdented = { value: editor.value, start: editor.selectionStart, end: editor.selectionEnd };
editor.value = "  x"; editor.selectionStart = editor.selectionEnd = 2; indentCodeSelection(false);
globalThis.tabStop = { value: editor.value, cursor: editor.selectionStart };
editor.value = "\\tx"; editor.selectionStart = editor.selectionEnd = 1; indentCodeSelection(true);
globalThis.tabOut = { value: editor.value, cursor: editor.selectionStart };
editor.value = "if ok:\\n    work()\\n"; editor.selectionStart = 0; editor.selectionEnd = editor.value.length;
toggleCodeComment();
globalThis.commented = { value: editor.value, start: editor.selectionStart, end: editor.selectionEnd };
toggleCodeComment();
globalThis.uncommented = { value: editor.value, start: editor.selectionStart, end: editor.selectionEnd };
editor.value = "    if ready: # note"; editor.selectionStart = editor.selectionEnd = editor.value.length;
insertIndentedNewline();
globalThis.nestedNewline = { value: editor.value, cursor: editor.selectionStart };
editor.value = "    value = 1"; editor.selectionStart = editor.selectionEnd = editor.value.length;
insertIndentedNewline();
globalThis.inheritedNewline = { value: editor.value, cursor: editor.selectionStart };`;
  new vm.Script(script, { filename: "editor-helpers.test.js" }).runInNewContext(context);
  check(JSON.stringify(context.indented) === JSON.stringify({ value: "    a\n    b\n", start: 0, end: 12 })
    && JSON.stringify(context.outdented) === JSON.stringify({ value: "a\nb\n", start: 0, end: 4 }), "多行选择可缩进、反缩进且不会误选下一行");
  check(JSON.stringify(context.tabStop) === JSON.stringify({ value: "    x", cursor: 4 })
    && JSON.stringify(context.tabOut) === JSON.stringify({ value: "x", cursor: 0 }), "单光标缩进遵循四空格制表位并可移除 Tab");
  check(JSON.stringify(context.commented) === JSON.stringify({ value: "# if ok:\n    # work()\n", start: 0, end: 22 })
    && JSON.stringify(context.uncommented) === JSON.stringify({ value: "if ok:\n    work()\n", start: 0, end: 18 }), "当前行或多行选择可切换 Python 注释并保持选择范围");
  check(JSON.stringify(context.nestedNewline) === JSON.stringify({ value: "    if ready: # note\n        ", cursor: 29 })
    && JSON.stringify(context.inheritedNewline) === JSON.stringify({ value: "    value = 1\n    ", cursor: 18 }), "回车会继承当前缩进并在冒号语句后增加一级缩进");
}

function verifySyntaxHighlighting(html, check) {
  const start = html.indexOf("const PYTHON_KEYWORDS");
  const end = html.indexOf("function updateCodeHighlight", start);
  check(start >= 0 && end > start, "可提取 Python 语法高亮函数");
  const context = {
    sample: "@cache\ndef greet(self, name):\n    message = \"# not a comment\"\n    # <safe>\n    return print(message, 42)\n",
    escapeHtml: (value) => String(value).replace(/[&<>'\"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
    })[character]),
  };
  const script = `${html.slice(start, end)}\nglobalThis.highlighted = highlightPython(sample);`;
  new vm.Script(script, { filename: "syntax-highlighting.test.js" }).runInNewContext(context);
  const highlighted = context.highlighted;
  check(["py-decorator", "py-keyword", "py-definition", "py-self", "py-string", "py-comment", "py-builtin", "py-number", "py-operator"]
    .every((className) => highlighted.includes(`class="${className}"`)), "Python 高亮覆盖装饰器、关键词、定义、字符串、注释、内置函数、数字和运算符");
  check(highlighted.includes("&lt;safe&gt;") && !highlighted.includes("<safe>") && (highlighted.match(/py-comment/g) || []).length === 1, "语法高亮会转义代码且不会把字符串中的井号识别为注释");
}

async function testPyodide() {
  const { loadPyodide } = await import(pathToFileURL(`${runtimeUrl.pathname}pyodide.mjs`));
  const lock = JSON.parse(await readFile(new URL("pyodide-lock.json", runtimeUrl), "utf8"));
  const pyodide = await loadPyodide({ indexURL: runtimeUrl.pathname, lockFileContents: lock });
  const slugs = ["two-sum", "reverse-linked-list", "lru-cache", "lowest-common-ancestor-of-a-binary-tree"];
  for (const slug of slugs) {
    pyodide.globals.set("payload_json", JSON.stringify(payloadFor(solutions[slug], solutions[slug].code, 2)));
    const output = await pyodide.runPythonAsync(`${pythonHarness}\nRESULT_JSON`);
    if (!JSON.parse(output).passed) throw new Error(`${slug} 在内嵌 Python 运行时中未通过`);
  }
  console.log(`PASS Pyodide ${pyodide.runPython("import sys; sys.version.split()[0]")} 与 ${slugs.length} 类题型`);
}

async function testMemoryRuntime() {
  const [loaderRaw, asmRaw, wasmBuffer, stdlibBuffer, lockText] = await Promise.all([
    readFile(new URL("pyodide.mjs", runtimeUrl), "utf8"),
    readFile(new URL("pyodide.asm.mjs", runtimeUrl), "utf8"),
    readFile(new URL("pyodide.asm.wasm", runtimeUrl)),
    readFile(new URL("python_stdlib.zip", runtimeUrl)),
    readFile(new URL("pyodide-lock.json", runtimeUrl), "utf8"),
  ]);
  const loaderSource = loaderRaw.replace(
    /export\{dt as loadPyodide,U as version\};?/,
    "return { loadPyodide: dt, version: U };",
  );
  const asmSource = asmRaw
    .replaceAll("import.meta.url", JSON.stringify("https://offline.local/pyodide.asm.mjs"))
    .replace(/export default _createPyodideModule;?/, "return _createPyodideModule;");
  const wasmBytes = new Uint8Array(wasmBuffer);
  const stdlibBytes = new Uint8Array(stdlibBuffer);
  const originalProcess = globalThis.process;

  globalThis.process = undefined;
  globalThis.window = globalThis;
  globalThis.document = { createElement: () => ({}) };
  globalThis.sessionStorage = {};
  globalThis.location = new URL("https://offline.local/index.html");
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  const loader = new Function(loaderSource)();
  const createPyodideModule = new Function(asmSource)();
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, options) => {
    const url = typeof input === "string" ? input : (input?.url || input?.href || String(input));
    if (url === "https://offline.local/pyodide.asm.wasm") {
      return Promise.resolve(new Response(wasmBytes, { status: 200, headers: { "Content-Type": "application/wasm" } }));
    }
    if (url === "https://offline.local/python_stdlib.zip") {
      return Promise.resolve(new Response(stdlibBytes, { status: 200, headers: { "Content-Type": "application/zip" } }));
    }
    return nativeFetch(input, options);
  };

  try {
    const pyodide = await loader.loadPyodide({
      indexURL: "https://offline.local/",
      stdLibURL: "https://offline.local/python_stdlib.zip",
      lockFileContents: JSON.parse(lockText),
      packageBaseUrl: "https://offline.local/",
      createPyodideModule,
    });
    const answer = pyodide.runPython("sum(i * i for i in range(10))");
    if (answer !== 285) throw new Error(`内存兼容模式结果异常：${answer}`);
    originalProcess.stdout.write(`PASS 内存兼容模式 Python ${pyodide.runPython("import sys; sys.version.split()[0]")}\n`);
    originalProcess.exit(0);
  } catch (error) {
    originalProcess.stderr.write(`${error?.stack || error}\n`);
    originalProcess.exit(1);
  }
}

function testMemoryRuntimeInChild() {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--memory-runtime"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  process.stdout.write(result.stdout);
  if (result.status !== 0) throw new Error(result.stderr || "内存兼容模式测试失败");
}

async function verifyArtifact(html) {
  const lockText = await readFile(new URL("pyodide-lock.json", runtimeUrl), "utf8");
  const lock = JSON.parse(lockText);
  const assertions = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    assertions.push(message);
  };

  check(/^<!doctype html>/i.test(html), "包含 HTML5 文档声明");
  check(problems.length === 100, "题目数据恰好 100 道");
  check(Object.keys(solutions).length === 100, "参考题解恰好 100 份");
  check(new Set(problems.map((problem) => problem.slug)).size === problems.length, "题目 slug 唯一");
  check(new Set(problems.map((problem) => String(problem.frontendId))).size === problems.length, "题号唯一");
  check(problems.every((problem) => solutions[problem.slug]), "每道题都有评测配置");
  check(Object.keys(solutions).every((slug) => problems.some((problem) => problem.slug === slug)), "没有多余的题解配置");
  check(Object.values(solutions).every((solution) => typeof solution.code === "string" && solution.code.trim() && Array.isArray(solution.tests) && solution.tests.length), "每份题解都有代码和测试用例");
  check(problems.every((problem) => !/<img\b[^>]*\bsrc=["'](?:https?:)?\/\//i.test(problem.content)), "题目快照没有外部图片");
  check(Object.keys(lock.packages || {}).length === 0, "Pyodide 锁文件只保留必要元数据");
  check(!/__PROBLEMS_JSON__|__SOLUTIONS_JSON__|__PYODIDE_[A-Z0-9_]+__|__APP_SCRIPT__|__STYLES__/.test(html), "构建占位符已全部替换");
  check(!/<script\b[^>]*\bsrc\s*=/i.test(html), "没有外部脚本依赖");
  check(!/<link\b[^>]*\brel=["']?stylesheet/i.test(html), "没有外部样式表依赖");
  check(!/<(?:img|video|audio|source)\b[^>]*\bsrc=["']https?:\/\//i.test(html), "没有外部媒体资源依赖");
  check(!/url\(\s*["']?https?:\/\//i.test(html), "CSS 没有外部资源依赖");
  check((html.match(/data:image\//gi) || []).length >= 60, "题面示意图已内嵌");
  check(html.includes('<html lang="zh-CN" data-theme="dark">'), "默认使用深色模式");
  const staticHtml = html.slice(0, html.indexOf("<script>"));
  const htmlIds = [...staticHtml.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  check(new Set(htmlIds).size === htmlIds.length, "HTML 元素 id 唯一");
  check(html.includes("const EXPORT_VERSION = 1") && html.includes("LC_EXPORT_VERSION:") && html.includes("LC_RECORD") && html.includes("noteBase64"), "包含 Markdown 导入导出协议");
  check(html.includes("export-code-checkbox") && html.includes("在表格中包含个人代码") && html.includes('["题目名", "笔记", "个人代码"]'), "Markdown 表格可选导出个人代码列");
  check(html.includes("const STATE_VERSION = 3") && html.includes('id="auto-expand-button"') && html.includes("expandProblemByDefault: true") && html.includes("setProblemPaneCollapsed(!state.settings.expandProblemByDefault)"), "题目描述默认展开且旧版设置可迁移");
  check(html.includes('id="pane-resizer"') && html.includes("setProblemPaneWidth") && html.includes("problemPaneWidth: 43"), "题目和代码分栏支持调整宽度并持久化");
  check(html.includes('id="catalog-result-count"') && html.includes("mobileWorkspaceMedia"), "目录筛选和移动端单屏工作区完整");
  check(html.includes('id="code-highlight"') && html.includes("function highlightPython") && html.includes("function updateCodeHighlight"), "代码编辑器包含离线 Python 语法高亮层");
  check(html.includes("function indentCodeSelection") && html.includes("function toggleCodeComment") && html.includes("function insertIndentedNewline") && html.includes('event.key.toLowerCase() === "s"'), "代码编辑器支持块级缩进、切换注释、回车缩进与快捷保存");
  check(html.includes('id="privacy-view"') && html.includes('document.title = "每日工作台"') && html.includes("setPrivacyMode(!privacyMode)"), "双击回车可切换独立隐私伪装页并隐藏真实标题");
  check(!html.includes("`${problem.frontendId}. ${problem.title} · Python 离线训练场`") && html.includes('document.title = "Python 离线训练场"'), "浏览器标签始终使用固定的训练场标题");
  check(html.includes('[data-theme="dark"] .privacy-view') && html.includes("--privacy-bg-top") && html.includes("--privacy-card"), "隐私伪装页会跟随当前深色或浅色主题");
  check(html.includes('history.replaceState(history.state, "", location.href.split("#")[0])') && html.includes("privacyRestoreHash"), "隐私伪装页会隐藏并恢复地址栏题目标识");
  check(html.includes("privacyRestoreScrollX") && html.includes("window.scrollTo(privacyRestoreScrollX, privacyRestoreScrollY)") && html.includes("elements.privacy_view.inert = true"), "隐私伪装页会恢复滚动位置并隔离不可见区域焦点");
  check(html.includes('role="tablist"') && html.includes('role="tabpanel"') && html.includes('event.key === "ArrowRight"'), "工作区标签支持完整语义与方向键导航");
  check(html.includes("function trapModalFocus") && html.includes('modal.setAttribute("aria-hidden", "false")'), "弹窗会维护可访问状态并限制键盘焦点");
  check(html.includes("const savePulseTimers = new WeakMap()") && html.includes('document.visibilityState === "hidden"') && html.includes('window.addEventListener("pagehide"'), "保存提示去抖且页面进入后台时立即持久化");
  check(html.includes('id="run-button" class="button" type="button">运行</button>') && html.includes('id="submit-button" class="button primary" type="button">提交</button>') && html.includes('id="custom-case-button"'), "运行与提交操作支持添加自定义样例");
  check(html.includes("evaluationInProgress") && html.includes("MAX_CUSTOM_CASES = 20") && html.includes("MAX_IMPORT_FILE_SIZE"), "评测、自定义样例和导入文件具有资源边界");
  check(html.includes("new Worker") && html.includes("loadPyodide"), "包含隔离的 Python 运行时");
  check(html.includes("prewarmJudge()") && html.includes("Python 运行时已内置，将自动准备"), "Python 运行时自动预热");
  check(html.includes("startMainThreadJudge") && !html.includes('new Worker(workerUrl, { type: "module"'), "包含 file:// 兼容回退");
  check(html.includes("new Function(`${loaderSource}") && html.includes("new Response(runtime.wasmBytes"), "兼容模式从内存启动 Python");
  check(Buffer.byteLength(html) > 15 * 1024 * 1024, "Python、题面和图片已打包进单文件");
  const scriptMatch = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/i);
  check(Boolean(scriptMatch), "主应用脚本已内嵌");
  new vm.Script(scriptMatch[1], { filename: "lc_offline.inline.js" });
  assertions.push("内嵌 JavaScript 语法正确");
  verifyExportHelpers(html, check);
  verifyStateHelpers(html, check);
  verifyPrivacyShortcutHelpers(html, check);
  verifyEditorHelpers(html, check);
  verifySyntaxHighlighting(html, check);
  const difficultyCounts = problems.reduce((counts, problem) => {
    counts[problem.difficulty] = (counts[problem.difficulty] || 0) + 1;
    return counts;
  }, {});
  check(difficultyCounts.Easy === 20 && difficultyCounts.Medium === 68 && difficultyCounts.Hard === 12, "难度分布正确");
  check(new Set(problems.map((problem) => problem.category)).size === 17, "题单包含 17 个专题");
  console.log(`PASS 离线构建产物 ${assertions.length} 项校验`);
}

async function verifyCompactArtifact(html) {
  const compactHtml = await readFile(new URL("lc_offline_compact.html", root), "utf8");
  const payloadMatch = compactHtml.match(/const COMPRESSED_APP = "([A-Za-z0-9+/=]+)";/);
  if (!payloadMatch) throw new Error("压缩单文件缺少内嵌应用数据");
  const expandedHtml = gunzipSync(Buffer.from(payloadMatch[1], "base64")).toString("utf8");
  if (expandedHtml !== html) throw new Error("压缩单文件解压后与标准离线产物不一致");
  if (!compactHtml.includes('new DecompressionStream("gzip")') || !compactHtml.includes("document.write(html)")) {
    throw new Error("压缩单文件缺少浏览器内解压启动逻辑");
  }
  if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel=["']?stylesheet|https?:\/\//i.test(compactHtml)) {
    throw new Error("压缩单文件仍包含外部资源依赖");
  }
  if (Buffer.byteLength(compactHtml) >= Buffer.byteLength(html)) {
    throw new Error("压缩单文件体积没有小于标准离线产物");
  }
  const scriptMatch = compactHtml.match(/<script>([\s\S]*)<\/script>\s*<\/body>/i);
  if (!scriptMatch) throw new Error("压缩单文件缺少启动脚本");
  new vm.Script(scriptMatch[1], { filename: "lc_offline_compact.inline.js" });
  console.log("PASS 压缩单文件可完整还原标准离线应用，且没有外部依赖");
}

const command = process.argv[2];

if (process.argv.includes("--memory-runtime")) {
  await testMemoryRuntime();
} else if (command === "build") {
  await buildArtifact();
} else if (command === "test") {
  const html = await buildArtifact();
  testReferenceSolutions();
  testNegativeCases();
  testCustomCases();
  await testPyodide();
  testMemoryRuntimeInChild();
  await verifyArtifact(html);
  await verifyCompactArtifact(html);
  console.log("全部测试通过");
} else {
  console.error("用法：node scripts/project.mjs <build|test>");
  process.exitCode = 1;
}
