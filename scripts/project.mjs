import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import vm from "node:vm";
import solutions from "../src/solutions.mjs";
import pythonFormatter from "../src/python-formatter.mjs";
import pythonHarness from "../src/python-harness.mjs";
import { createBackupTools } from "../src/backup.mjs";
import { verifyBackupTools } from "./backup-test.mjs";

const root = new URL("../", import.meta.url);
const runtimeUrl = new URL(".cache/runtime/", root);
const formatterUrl = new URL("src/vendor/black-26.5.1/", root);
const problems = JSON.parse(await readFile(new URL("src/problems.json", root), "utf8"));
const formatterManifest = JSON.parse(await readFile(new URL("manifest.json", formatterUrl), "utf8"));
const PYTHON_TEST_TIMEOUT_MS = 60_000;

// Ordered browser sources share one script scope in the standalone HTML. Keeping
// bundling at build time also lets file:// work without module fetches or a server.
const UI_SOURCES = ["app", "acm", "dialogs", "filters", "catalog", "workspace", "privacy", "editor", "backup-ui", "judge", "events"];

async function loadApplicationSource() {
  const [template, styles, ...scripts] = await Promise.all([
    readFile(new URL("src/app.html", root), "utf8"),
    readFile(new URL("src/styles.css", root), "utf8"),
    ...UI_SOURCES.map((name) => readFile(new URL(`src/ui/${name}.js`, root), "utf8")),
  ]);
  for (const marker of ["__APP_STYLES__", "__APP_SCRIPT__"]) {
    if (template.split(marker).length !== 2) throw new Error(`页面入口必须包含一个 ${marker}`);
  }
  const script = scripts.map((source, index) => `// src/ui/${UI_SOURCES[index]}.js\n${source}`).join("\n");
  return template.replace("__APP_STYLES__", () => styles.trimEnd())
    .replace("__APP_SCRIPT__", () => script.trimEnd());
}

const safeJson = (value) => JSON.stringify(value)
  .replaceAll("<", "\\u003c")
  .replaceAll("\u2028", "\\u2028")
  .replaceAll("\u2029", "\\u2029");

let formatterBundleCache = null;

async function loadFormatterBundle() {
  if (formatterBundleCache) return formatterBundleCache;
  const wheelEntries = await Promise.all(formatterManifest.packages.map(async ({ filename, sha256 }) => {
    const wheel = await readFile(new URL(filename, formatterUrl));
    const actualHash = createHash("sha256").update(wheel).digest("hex");
    if (actualHash !== sha256) throw new Error(`格式化器依赖校验失败：${filename}`);
    return [filename, wheel.toString("base64")];
  }));
  formatterBundleCache = {
    lineLength: formatterManifest.formatter.lineLength,
    wheels: Object.fromEntries(wheelEntries),
  };
  return formatterBundleCache;
}

const compactShell = (compressedApp) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="压缩为单个 HTML 的 LC Python 离线训练场">
  <title>LC Python 离线训练场 · 正在启动</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111113; color: #f5f5f7; }
    main { width: min(460px, calc(100% - 40px)); padding: 32px; border: 1px solid #303033; border-radius: 16px; background: #1c1c1e; }
    h1 { margin: 0 0 10px; font-size: 20px; }
    p { margin: 0; color: #aeaeb2; line-height: 1.7; }
    .loader { width: 100%; height: 4px; margin-top: 22px; overflow: hidden; border-radius: 99px; background: #303033; }
    .loader::after { content: ""; display: block; width: 42%; height: 100%; border-radius: inherit; background: #409cff; animation: loading 1.15s ease-in-out infinite alternate; }
    pre { display: none; margin: 18px 0 0; padding: 12px; overflow: auto; border-radius: 10px; background: #111113; color: #ffb4b4; white-space: pre-wrap; }
    @keyframes loading { from { transform: translateX(-105%); } to { transform: translateX(245%); } }
    @media (prefers-reduced-motion: reduce) { .loader::after { animation: none; width: 100%; } }
  </style>
</head>
<body>
  <main>
    <h1>正在启动离线训练场</h1>
    <p id="status" role="status">正在准备题目与 Python 环境，无需联网。</p>
    <div class="loader" id="loader" aria-hidden="true"></div>
    <pre id="error" role="alert"></pre>
  </main>
  <script>
  (() => {
    "use strict";
    const COMPRESSED_APP = ${JSON.stringify(compressedApp.toString("base64"))};
    const status = document.getElementById("status");
    const loader = document.getElementById("loader");
    const errorOutput = document.getElementById("error");

    async function start() {
      if (typeof DecompressionStream !== "function" || typeof Uint8Array.fromBase64 !== "function") {
        throw new Error("当前浏览器缺少本地解压或原生 Base64 支持。请升级到最新版 Chrome、Edge、Safari 或 Firefox。");
      }
      const bytes = Uint8Array.fromBase64(COMPRESSED_APP);
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      const html = await new Response(stream).text();
      if (!/^<!doctype html>/i.test(html) || !html.includes("const PROBLEMS =")) {
        throw new Error("压缩内容校验失败，请重新获取该 HTML 文件。");
      }
      const parsed = new DOMParser().parseFromString(html, "text/html");
      document.documentElement.replaceWith(document.importNode(parsed.documentElement, true));
      // DOMParser leaves scripts inert; execute the bundled inline application once.
      for (const source of [...document.scripts]) {
        const script = document.createElement("script");
        script.textContent = source.textContent;
        source.replaceWith(script);
      }
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
  const [source, lockText, loader, asmModule, wasm, stdlib, formatterBundle] = await Promise.all([
    loadApplicationSource(),
    readFile(new URL("pyodide-lock.json", runtimeUrl), "utf8"),
    readFile(new URL("pyodide.mjs", runtimeUrl)),
    readFile(new URL("pyodide.asm.mjs", runtimeUrl)),
    readFile(new URL("pyodide.asm.wasm", runtimeUrl)),
    readFile(new URL("python_stdlib.zip", runtimeUrl)),
    loadFormatterBundle(),
  ]);
  const replacements = {
    __PROBLEMS_JSON__: safeJson(problems),
    __BACKUP_FACTORY__: createBackupTools.toString(),
    __SOLUTIONS_JSON__: safeJson(solutions),
    __PYTHON_HARNESS_JSON__: safeJson(pythonHarness),
    __PYTHON_FORMATTER_JSON__: safeJson(pythonFormatter),
    __FORMATTER_BUNDLE_JSON__: safeJson(formatterBundle),
    __PYODIDE_LOCK_JSON__: safeJson(JSON.parse(lockText)),
    __PYODIDE_LOADER_B64__: loader.toString("base64"),
    __PYODIDE_ASM_MJS_B64__: asmModule.toString("base64"),
    __PYODIDE_WASM_B64__: wasm.toString("base64"),
    __PYODIDE_STDLIB_B64__: stdlib.toString("base64"),
  };

  const remaining = new Set(Object.keys(replacements));
  const output = source.replace(/__[A-Z][A-Z0-9_]+__/g, (token) => {
    if (!remaining.delete(token)) throw new Error(`未知或重复的构建占位符：${token}`);
    return replacements[token];
  });
  if (remaining.size) throw new Error(`缺少构建占位符：${[...remaining].join(", ")}`);

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

function pythonResults(payloads, failureLabel) {
  const processResult = spawnSync("python3", ["-c", PYTHON_BATCH_RUNNER], {
    encoding: "utf8",
    input: JSON.stringify(payloads),
    maxBuffer: 10 * 1024 * 1024,
    timeout: PYTHON_TEST_TIMEOUT_MS,
  });
  let parsed;
  try {
    parsed = JSON.parse(typeof processResult.stdout === "string" ? processResult.stdout.trim() : "");
  } catch {
    parsed = null;
  }
  if (processResult.status === 0 && Array.isArray(parsed)) return parsed;
  const detail = processResult.error?.stack
    || processResult.stderr?.trim()
    || processResult.stdout?.trim()
    || `python3 子进程未正常退出（status=${processResult.status}, signal=${processResult.signal || "none"}）`;
  throw new Error(`${failureLabel}：${detail}`);
}

function payloadFor(solution, userCode = solution.code, limit = solution.tests.length) {
  const { code: referenceCode, tests, note: _note, complexity: _complexity, ...meta } = solution;
  return {
    mode: "core",
    userCode,
    referenceCode,
    meta,
    cases: tests.slice(0, limit).map((value) => ({ value })),
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
  const parsed = pythonResults(evaluable.map(({ payload }) => payload), "参考实现批量执行失败");
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
  const parsed = pythonResults(cases.map(([slug, userCode]) => payloadFor(solutions[slug], userCode, 2)), "反例批量执行失败");
  for (const [index, result] of parsed.entries()) {
    if (result?.passed) throw new Error(`${cases[index][0]} 未能拒绝：${cases[index][2]}`);
  }
  console.log(`PASS ${cases.length} 类错误答案均被拒绝`);
}

function testCustomCases() {
  const methodSolution = solutions["two-sum"];
  const methodPayload = payloadFor(methodSolution, methodSolution.code, 0);
  methodPayload.cases = [{ value: [[5, 1, 9], 10] }];

  const classSolution = solutions["lru-cache"];
  const classPayload = payloadFor(classSolution, classSolution.code, 0);
  classPayload.cases = [{ value: { ops: ["LRUCache", "put", "get"], args: [[1], [7, 9], [7]] } }];

  const invalidClassPayload = payloadFor(classSolution, classSolution.code, 0);
  invalidClassPayload.cases = [{ value: { ops: ["LRUCache", "get"], args: [[1]] } }];

  const parsed = pythonResults([methodPayload, classPayload, invalidClassPayload], "自定义样例执行失败");
  const valid = parsed[0].passed && parsed[0].results[0].actual === "[1, 2]"
    && parsed[1].passed && parsed[1].results[0].actual === "[null, null, 9]";
  if (!valid || parsed[2]?.fatal !== "内置参考实现执行失败") {
    throw new Error(`自定义样例结果异常：${JSON.stringify(parsed)}`);
  }
  console.log("PASS 函数题、设计题与无效自定义样例校验");
}

function testEvaluationIsolation() {
  const method = {
    kind: "method", method: "count", output: "default",
    code: "counter = globals().get('counter', 0) + 1\nclass Solution:\n    def count(self): return counter",
    tests: [[], [], []],
  };
  const design = {
    kind: "class", className: "Bag", output: "default",
    code: "class Bag:\n    def __init__(self, values):\n        self.size = len(values)\n        values.clear()\n    def count(self): return self.size",
    tests: [{ ops: ["Bag", "count"], args: [[[1, 2, 3]], []] }],
  };
  const core = payloadFor(method);
  const acm = payloadFor(method, "counter = globals().get('counter', 0) + 1\nprint(counter)");
  acm.mode = "acm";
  acm.cases.forEach((item) => { item.stdin = ""; });
  const parsed = pythonResults([core, acm, payloadFor(design)], "评测隔离验证失败");
  if (!parsed.every((result) => result.passed)
    || !parsed.slice(0, 2).every((result) => result.results.every((item) => item.actual === "1" && item.expected === "1"))
    || parsed[2].results[0].actual !== "[null, 3]") {
    throw new Error(`评测用例之间发生状态或输入泄漏：${JSON.stringify(parsed)}`);
  }
  console.log("PASS 核心与 ACM 代码复用编译结果时仍隔离命名空间，设计题输入相互独立");
}

function testAcmMode() {
  const solution = solutions["two-sum"];
  const correct = payloadFor(solution, "import sys\ndata = iter(map(int, sys.stdin.buffer.read().split()))\nn = next(data)\nnums = [next(data) for _ in range(n)]\ntarget = next(data)\nseen = {}\nfor i, value in enumerate(nums):\n    if target - value in seen:\n        print(seen[target - value], i)\n        break\n    seen[value] = i\nprint('checked', file=sys.stderr)", 2);
  correct.mode = "acm";
  correct.cases.forEach((item) => { item.stdin = `${item.value[0].length}\n${item.value[0].join(" ")}\n${item.value[1]}`; });
  const broken = payloadFor(solution, "print(missing_name)", 1);
  broken.mode = "acm";
  broken.cases[0].stdin = "4\n2 7 11 15\n9";
  const payloads = [correct, broken];
  const parsed = pythonResults(payloads, "ACM 模式执行失败");
  const valid = parsed?.[0]?.passed && parsed[0].results.length === 2
    && parsed[0].results.every((item) => item.passed && item.stderr === "checked\n")
    && parsed[0].results[0].actual === "0 1"
    && parsed?.[1]?.passed === false && parsed[1].results[0].error.includes("NameError");
  if (!valid) throw new Error(`ACM 模式结果异常：${JSON.stringify(parsed)}`);
  console.log("PASS ACM 模式复用内置用例、标准输入输出、标准错误与异常捕获");
}

function testAcmReferenceSolutions(html) {
  const start = html.indexOf("const acmSchemaCache");
  const end = html.indexOf("function customCaseTemplateFor", start);
  if (start < 0 || end <= start) throw new Error("无法提取 ACM 参考题解生成器");
  const context = {
    SOLUTIONS: solutions,
    state: { settings: { codeMode: "acm" } },
  };
  const script = `${html.slice(start, end)}
globalThis.payloads = Object.entries(SOLUTIONS).map(([slug, solution]) => {
  const { code: referenceCode, tests, note: _note, complexity: _complexity, ...meta } = solution;
  return {
    slug,
    userCode: acmReferenceCodeFor(solution),
    referenceCode,
    meta,
    mode: "acm",
    cases: tests.map((value) => ({
      value,
      stdin: formatAcmCase(value, solution),
    })),
  };
});`;
  new vm.Script(script, { filename: "acm-reference-solutions.test.js" }).runInNewContext(context);
  const generatedBySlug = Object.fromEntries(context.payloads.map((payload) => [payload.slug, payload.userCode]));
  const basicReference = generatedBySlug["two-sum"];
  if ((basicReference.match(/\n/g) || []).length + 1 > 20
    || /_read_matrix|_print_answer|class ListNode|class TreeNode/.test(basicReference)
    || /class ListNode|class Node/.test(generatedBySlug["invert-binary-tree"])) {
    throw new Error("ACM 参考题解包含与当前题目无关的通用框架代码");
  }
  const parsed = pythonResults(context.payloads, "ACM 参考题解批量执行失败");
  const failures = parsed.flatMap((result, index) => result?.passed ? [] : [
    `${context.payloads[index].slug}: ${JSON.stringify(result)}`,
  ]);
  if (failures.length) throw new Error(`ACM 参考题解失败 ${failures.length} 题：\n${failures.join("\n")}`);
  const caseCount = context.payloads.reduce((total, payload) => total + payload.cases.length, 0);
  console.log(`PASS ${problems.length} 道 ACM 完整参考程序通过全部 ${caseCount} 个内置样例`);
}

function verifyExportHelpers(html, check) {
  const start = html.indexOf("function markdownTableCell");
  const end = html.indexOf("function downloadText", start);
  check(start >= 0 && end > start, "可提取 Markdown 阅读导出函数");
  const record = { status: "solved", note: "中文 | 笔记\n🚀 <tag>", code: "if x < 2:\n    return x", acmCode: "print('ACM')" };
  const context = {
    escapeHtml: (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"),
    statistics: () => ({ solved: 1, attempted: 0, noted: 1, submissions: 3 }),
    PROBLEMS: [{ slug: "two-sum", frontendId: "1", title: "两数之和" }],
    recordFor: () => record,
  };
  new vm.Script(`${html.slice(start, end)}
    globalThis.result = {
      withCode: exportMarkdownText(true), withoutCode: exportMarkdownText(false),
    };`).runInNewContext(context);
  const { withCode, withoutCode } = context.result;
  check(withCode.includes("&#124;") && withCode.includes("<br>") && withCode.includes("&lt;tag&gt;")
    && withCode.includes("&nbsp;&nbsp;&nbsp;&nbsp;") && withCode.includes("print(&#039;ACM&#039;)"), "Markdown 阅读导出正确转义笔记并可显示两套代码");
  check(!withoutCode.includes("print(") && !withoutCode.includes("return") && withoutCode.includes("JSON 备份")
    && !withCode.includes("LC_RECORD") && !withCode.includes("Base64"), "Markdown 可省略代码，且已移除隐藏备份数据");
  verifyBackupTools(check);
}

function verifyStateHelpers(html, check) {
  const recordStart = html.indexOf("function plainObject");
  const normalizeRecordStart = html.indexOf("function normalizeRecord", recordStart);
  const settingsStart = html.indexOf("function normalizeSettings", normalizeRecordStart);
  const loadStateStart = html.indexOf("function loadState", settingsStart);
  check(recordStart >= 0 && normalizeRecordStart > recordStart && settingsStart > normalizeRecordStart && loadStateStart > settingsStart, "可提取本地状态校验函数");

  const recordContext = {
    VALID_STATUSES: new Set(["todo", "attempted", "solved"]),
    MAX_CUSTOM_CASES: 2,
    MAX_CUSTOM_CASE_LENGTH: 5,
    EMPTY_RECORD: Object.freeze({ status: "todo", attempts: 0, note: "", updatedAt: null, passedAt: null }),
  };
  const recordScript = `${html.slice(recordStart, settingsStart)}\nglobalThis.normalized = normalizeRecord({
    status: "invalid", attempts: -3, note: 42, code: null,
    customCases: ["valid", "too-long", 7, "ok"],
  });
globalThis.inconsistent = normalizeRecord({ status: "todo", attempts: 2, passedAt: "stale" });`;
  new vm.Script(recordScript, { filename: "state-record.test.js" }).runInNewContext(recordContext);
  check(recordContext.normalized.status === "todo" && recordContext.normalized.attempts === 0 && recordContext.normalized.note === "" && !("code" in recordContext.normalized), "损坏的题目状态会回退到安全默认值");
  check(JSON.stringify(recordContext.normalized.customCases) === JSON.stringify(["valid", "ok"]), "自定义样例会按类型、大小和数量清洗");
  check(JSON.stringify(recordContext.inconsistent) === JSON.stringify({ status: "attempted", attempts: 2, note: "", updatedAt: null, passedAt: null }), "本地状态加载时会统一提交次数、题目状态和通过时间");

  const settingsContext = {
    DEFAULT_SETTINGS: Object.freeze({ theme: "dark", editorSize: 14, lastSlug: "first", expandProblemByDefault: true, problemPaneWidth: 43, codeMode: "core" }),
    EDITOR_SIZE_MIN: 12,
    EDITOR_SIZE_MAX: 20,
    PROBLEM_PANE_MIN: 28,
    PROBLEM_PANE_MAX: 68,
    CODE_MODES: new Set(["core", "acm"]),
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
    bySlug: new Map([["first", true]]),
  };
  const settingsScript = `${html.slice(recordStart, normalizeRecordStart)}
${html.slice(settingsStart, loadStateStart)}\nglobalThis.normalized = normalizeSettings({
    theme: "invalid", editorSize: 99, lastSlug: "missing", expandProblemByDefault: "true", problemPaneWidth: null,
  });
globalThis.valid = normalizeSettings({ theme: "light", editorSize: 16, lastSlug: "first", expandProblemByDefault: false, problemPaneWidth: 60, codeMode: "acm" });`;
  new vm.Script(settingsScript, { filename: "state-settings.test.js" }).runInNewContext(settingsContext);
  check(JSON.stringify(settingsContext.normalized) === JSON.stringify({ theme: "dark", editorSize: 20, lastSlug: "first", expandProblemByDefault: true, problemPaneWidth: 43, codeMode: "core" }), "损坏的界面设置会回退到默认展开题面、分栏宽度和代码模式");
  check(JSON.stringify(settingsContext.valid) === JSON.stringify({ theme: "light", editorSize: 16, lastSlug: "first", expandProblemByDefault: false, problemPaneWidth: 60, codeMode: "acm" }), "有效界面设置会直接保留且不再经过旧版迁移分支");

  const progressStart = html.indexOf("function resetProgressRecords", loadStateStart);
  const summaryStart = html.indexOf("function renderSummary", progressStart);
  check(progressStart >= 0 && summaryStart > progressStart, "可提取学习进度重置函数");
  const progressContext = { PROBLEMS: [{ slug: "solved" }, { slug: "attempted" }, { slug: "untouched" }] };
  const progressScript = `${html.slice(progressStart, summaryStart)}
const records = {
  solved: { status: "solved", attempts: 3, passedAt: "old-pass", updatedAt: "old-update", code: "print(1)", note: "keep", customCases: ["[1]"] },
  attempted: { status: "attempted", attempts: 0, passedAt: null, updatedAt: "old-attempt", note: "also keep" },
  untouched: { status: "todo", attempts: 0, passedAt: null, updatedAt: "unchanged", code: "value = 1" },
};
globalThis.before = PROBLEMS.filter(({ slug }) => records[slug]?.status !== "todo").length;
globalThis.resetCount = resetProgressRecords(records, "reset-at");
globalThis.after = PROBLEMS.filter(({ slug }) => records[slug]?.status !== "todo").length;
globalThis.records = records;`;
  new vm.Script(progressScript, { filename: "state-progress-reset.test.js" }).runInNewContext(progressContext);
  check(progressContext.before === 2 && progressContext.resetCount === 2 && progressContext.after === 0, "学习进度重置会覆盖已通过、进行中和累计提交状态");
  check(JSON.stringify(progressContext.records.solved) === JSON.stringify({ status: "todo", attempts: 0, passedAt: null, updatedAt: "reset-at", code: "print(1)", note: "keep", customCases: ["[1]"] })
    && JSON.stringify(progressContext.records.attempted) === JSON.stringify({ status: "todo", attempts: 0, passedAt: null, updatedAt: "reset-at", note: "also keep" })
    && JSON.stringify(progressContext.records.untouched) === JSON.stringify({ status: "todo", attempts: 0, passedAt: null, updatedAt: "unchanged", code: "value = 1" }), "重置进度会保留代码、笔记、自定义样例和原本未开始的记录");
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

function verifyPrivacyRandomizerHelpers(html, check) {
  const constantsStart = html.indexOf("const PRIVACY_PAGE_PRESETS");
  const constantsEnd = html.indexOf("const DIFFICULTY", constantsStart);
  const helpersStart = html.indexOf("function privacyRandomIndex");
  const helpersEnd = html.indexOf("function renderPrivacyPage", helpersStart);
  check(constantsStart >= 0 && constantsEnd > constantsStart && helpersStart >= 0 && helpersEnd > helpersStart, "可提取隐私页随机内容模型");
  const context = { clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)) };
  const script = `${html.slice(constantsStart, constantsEnd)}
${html.slice(helpersStart, helpersEnd)}
globalThis.transitions = PRIVACY_PAGE_PRESETS.map((_, previous) => [0, .5, 1].map((value) => nextPrivacyVariantIndex(previous, () => value)));
globalThis.first = createPrivacyPageModel(-1, () => 0);
globalThis.second = createPrivacyPageModel(0, () => 0);
globalThis.last = createPrivacyPageModel(-1, () => 1);`;
  new vm.Script(script, { filename: "privacy-randomizer.test.js" }).runInNewContext(context);
  check(context.transitions.every((transitions, previous) => transitions.every((next) => next !== previous && next >= 0 && next < context.transitions.length)), "隐私页内容随机切换且不会连续使用同一模板");
  check(context.first.variantIndex === 0 && context.second.variantIndex === 1 && context.last.variantIndex === 3
    && context.first.preset.schedule.length === 4 && context.second.preset.schedule.length === 4, "隐私页包含四套完整日程模板并可覆盖随机边界");
  check(context.first.completed === 8 && context.first.remaining === 3 && context.first.progress === 73
    && context.first.note && context.first.progressLabel, "随机进度由完成数和待处理数一致计算");
}

function verifyAcmCaseHelpers(html, check) {
  const start = html.indexOf("const acmSchemaCache");
  const end = html.indexOf("function showModal", start);
  check(start >= 0 && end > start, "可提取 ACM 题目级输入格式辅助函数");
  const context = {
    SOLUTIONS: solutions,
    state: { settings: { codeMode: "acm" } },
    MAX_CUSTOM_CASE_LENGTH: 50_000,
  };
  const script = `${html.slice(start, end)}
const failures = [];
let total = 0;
for (const [slug, solution] of Object.entries(SOLUTIONS)) {
  for (const [index, original] of solution.tests.entries()) {
    total += 1;
    try {
      const input = formatAcmCase(original, solution);
      const parsed = solution.kind === "class" ? parseAcmClassCase(input, solution) : parseAcmMethodCase(input, solution);
      if (JSON.stringify(parsed) !== JSON.stringify(original)) failures.push({ slug, index, input, parsed });
    } catch (error) {
      failures.push({ slug, index, error: error.message });
    }
  }
}
const malformed = [
  ["two-sum", "2\\n2 7\\n   ", "必须是数字"],
  ["two-sum", "9007199254740992\\n2 7\\n9", "有效整数范围"],
  ["group-anagrams", "1000000000\\neat", "剩余输入不足"],
  ["rotate-image", "1000000000 1\\n1", "剩余输入不足"],
].map(([slug, input, expected]) => {
  try { parseCustomCase(input, SOLUTIONS[slug]); return false; }
  catch (error) { return error.message.includes(expected); }
});
globalThis.result = {
  failures, total, malformed,
  twoSum: formatAcmCase(SOLUTIONS["two-sum"].tests[0], SOLUTIONS["two-sum"]),
  lru: formatAcmCase(SOLUTIONS["lru-cache"].tests[0], SOLUTIONS["lru-cache"]),
};`;
  new vm.Script(script, { filename: "acm-cases.test.js" }).runInNewContext(context);
  check(context.result.failures.length === 0 && context.result.total === Object.values(solutions).reduce((total, solution) => total + solution.tests.length, 0), "全部内置用例均可在题目级 ACM 文本格式中无损往返");
  check(context.result.twoSum === "4\n2 7 11 15\n9" && context.result.lru.startsWith("10\nLRUCache 2\nput 1 1"), "数组参数与设计题使用常见的长度、空格分隔和逐行操作格式");
  check(context.result.malformed.every(Boolean), "ACM 输入拒绝空白数字、超出安全整数的长度及无法满足的行数声明");
}

function verifyEditorHelpers(html, check) {
  const start = html.indexOf('const EDITOR_INDENT = "    "');
  const end = html.indexOf("// src/ui/backup-ui.js", start);
  check(start >= 0 && end > start, "可提取代码编辑辅助函数");
  const context = { Event: class Event { constructor(type) { this.type = type; } } };
const script = `const editor = {
  value: "a\\nb\\n", selectionStart: 0, selectionEnd: 4, selectionDirection: "none", dispatchCount: 0,
  setRangeText(text, start, end, mode) {
    this.value = this.value.slice(0, start) + text + this.value.slice(end);
    const cursor = mode === "end" ? start + text.length : start;
    this.selectionStart = cursor; this.selectionEnd = cursor;
  },
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  dispatchEvent() { this.dispatchCount += 1; },
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
globalThis.inheritedNewline = { value: editor.value, cursor: editor.selectionStart };
editor.value = "      value"; editor.selectionStart = editor.selectionEnd = 6;
globalThis.sixSpaceBackspace = { handled: deleteCodeIndent(), value: editor.value, cursor: editor.selectionStart };
editor.value = "\\t  value"; editor.selectionStart = editor.selectionEnd = 3;
globalThis.tabBackspace = { handled: deleteCodeIndent(), value: editor.value, cursor: editor.selectionStart };
editor.value = "    value"; editor.selectionStart = editor.selectionEnd = editor.value.length;
globalThis.codeBackspace = { handled: deleteCodeIndent(), value: editor.value, cursor: editor.selectionStart };
globalThis.bracketInsertions = Object.keys(EDITOR_BRACKET_PAIRS).map((opening) => {
  editor.value = "call"; editor.selectionStart = editor.selectionEnd = editor.value.length;
  insertCodeBracketPair(opening);
  return { value: editor.value, cursor: editor.selectionStart };
});
editor.value = "left + right"; editor.selectionStart = 0; editor.selectionEnd = editor.value.length;
insertCodeBracketPair("[");
globalThis.wrappedSelection = { value: editor.value, start: editor.selectionStart, end: editor.selectionEnd };
editor.value = "items]"; editor.selectionStart = editor.selectionEnd = 5;
globalThis.skippedClosing = { handled: skipCodeClosingBracket("]"), value: editor.value, cursor: editor.selectionStart };
editor.value = "{}"; editor.selectionStart = editor.selectionEnd = 1;
globalThis.deletedPair = { handled: deleteEmptyCodePair(), value: editor.value, cursor: editor.selectionStart };
editor.value = "    "; editor.selectionStart = editor.selectionEnd = editor.value.length;
globalThis.nonPairAtLineEnd = { handled: deleteEmptyCodePair(), value: editor.value, cursor: editor.selectionStart };
editor.value = "name"; editor.selectionStart = editor.selectionEnd = 0;
globalThis.blockedPair = { handled: insertCodeBracketPair("("), value: editor.value, cursor: editor.selectionStart };
editor.value = "value"; editor.selectionStart = editor.selectionEnd = 0;
const dispatchCountBeforeNoop = editor.dispatchCount;
globalThis.noopOutdent = { handled: indentCodeSelection(true), dispatches: editor.dispatchCount - dispatchCountBeforeNoop };`;
  new vm.Script(script, { filename: "editor-helpers.test.js" }).runInNewContext(context);
  check(JSON.stringify(context.indented) === JSON.stringify({ value: "    a\n    b\n", start: 0, end: 12 })
    && JSON.stringify(context.outdented) === JSON.stringify({ value: "a\nb\n", start: 0, end: 4 }), "多行选择可缩进、反缩进且不会误选下一行");
  check(JSON.stringify(context.tabStop) === JSON.stringify({ value: "    x", cursor: 4 })
    && JSON.stringify(context.tabOut) === JSON.stringify({ value: "x", cursor: 0 }), "单光标缩进遵循四空格制表位并可移除 Tab");
  check(JSON.stringify(context.commented) === JSON.stringify({ value: "# if ok:\n    # work()\n", start: 0, end: 22 })
    && JSON.stringify(context.uncommented) === JSON.stringify({ value: "if ok:\n    work()\n", start: 0, end: 18 }), "当前行或多行选择可切换 Python 注释并保持选择范围");
  check(JSON.stringify(context.nestedNewline) === JSON.stringify({ value: "    if ready: # note\n        ", cursor: 29 })
    && JSON.stringify(context.inheritedNewline) === JSON.stringify({ value: "    value = 1\n    ", cursor: 18 }), "回车会继承当前缩进并在冒号语句后增加一级缩进");
  check(JSON.stringify(context.sixSpaceBackspace) === JSON.stringify({ handled: true, value: "    value", cursor: 4 })
    && JSON.stringify(context.tabBackspace) === JSON.stringify({ handled: true, value: "\tvalue", cursor: 1 })
    && JSON.stringify(context.codeBackspace) === JSON.stringify({ handled: false, value: "    value", cursor: 9 }), "退格仅在前导空白中删除到上一个四列制表位");
  check(JSON.stringify(context.bracketInsertions) === JSON.stringify([
    { value: "call()", cursor: 5 }, { value: "call[]", cursor: 5 }, { value: "call{}", cursor: 5 },
  ]), "三类左括号会自动补齐并把光标留在中间");
  check(JSON.stringify(context.wrappedSelection) === JSON.stringify({ value: "[left + right]", start: 1, end: 13 })
    && JSON.stringify(context.skippedClosing) === JSON.stringify({ handled: true, value: "items]", cursor: 6 })
    && JSON.stringify(context.deletedPair) === JSON.stringify({ handled: true, value: "", cursor: 0 })
    && JSON.stringify(context.nonPairAtLineEnd) === JSON.stringify({ handled: false, value: "    ", cursor: 4 })
    && JSON.stringify(context.blockedPair) === JSON.stringify({ handled: false, value: "name", cursor: 0 }), "括号补全支持包裹选区、越过右括号、成对删除和安全插入边界");
  check(JSON.stringify(context.noopOutdent) === JSON.stringify({ handled: false, dispatches: 0 }), "无可移除缩进时不会触发输入与保存事件");
}

function verifySyntaxHighlighting(html, check) {
  const start = html.indexOf('const EDITOR_INDENT = "    "');
  const end = html.indexOf("function updateCodeHighlight", start);
  check(start >= 0 && end > start, "可提取 Python 语法高亮函数");
  const context = {
    sample: "@cache\ndef greet(self, name):\n    message = \"# not a comment\"\n    # <safe>\n    return print(message, 42)\n",
    escapeHtml: (value) => String(value).replace(/[&<>'\"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
    })[character]),
  };
  const script = `${html.slice(start, end)}\nglobalThis.highlighted = highlightPython(sample);\nglobalThis.guided = highlightPython("  x\\n    y\\n        z");`;
  new vm.Script(script, { filename: "syntax-highlighting.test.js" }).runInNewContext(context);
  const highlighted = context.highlighted;
  check(["py-decorator", "py-keyword", "py-definition", "py-self", "py-string", "py-comment", "py-builtin", "py-number", "py-operator"]
    .every((className) => highlighted.includes(`class="${className}"`)), "Python 高亮覆盖装饰器、关键词、定义、字符串、注释、内置函数、数字和运算符");
  check(highlighted.includes("&lt;safe&gt;") && !highlighted.includes("<safe>") && (highlighted.match(/py-comment/g) || []).length === 1, "语法高亮会转义代码且不会把字符串中的井号识别为注释");
  check((context.guided.match(/class="py-indent-guide"/g) || []).length === 3
    && context.guided.replace(/<span class="py-indent-guide">|<\/span>/g, "") === "  x\n    y\n        z", "缩进引导线按完整四列层级绘制且不改变高亮文本宽度");
}

function verifyFormatterUiHelpers(html, check) {
  const start = html.indexOf("function codePositionAtOffset");
  const end = html.indexOf("function setEvaluationBusy", start);
  check(start >= 0 && end > start, "可提取格式化光标映射函数且旧撤销拦截已移除");
  const context = { clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)) };
  const script = `${html.slice(start, end)}
const source = "ab\\ncdef";
globalThis.position = codePositionAtOffset(source, 5);
globalThis.offset = codeOffsetAtPosition(source, { line: 2, column: 3 });
globalThis.clampedOffset = codeOffsetAtPosition(source, { line: 99, column: 99 });`;
  new vm.Script(script, { filename: "formatter-ui.test.js" }).runInNewContext(context);
  check(JSON.stringify(context.position) === JSON.stringify({ line: 2, column: 3 }) && context.offset === 5 && context.clampedOffset === 7, "格式化前后的光标行列可映射并安全限制到代码范围");
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
  const acmPayload = payloadFor(solutions["two-sum"], "import sys\ndata = iter(map(int, sys.stdin.buffer.read().split()))\nn = next(data)\nnums = [next(data) for _ in range(n)]\ntarget = next(data)\nfor i, a in enumerate(nums):\n    for j in range(i + 1, len(nums)):\n        if a + nums[j] == target:\n            print(i, j)\n            raise SystemExit", 2);
  acmPayload.mode = "acm";
  acmPayload.cases.forEach((item) => { item.stdin = `${item.value[0].length}\n${item.value[0].join(" ")}\n${item.value[1]}`; });
  pyodide.globals.set("payload_json", JSON.stringify(acmPayload));
  const acmOutput = JSON.parse(await pyodide.runPythonAsync(`${pythonHarness}\nRESULT_JSON`));
  if (!acmOutput.passed || acmOutput.results.length !== 2) throw new Error(`ACM 模式在内嵌 Python 运行时中失败：${JSON.stringify(acmOutput)}`);
  const formatterBundle = await loadFormatterBundle();
  pyodide.globals.set("formatter_bundle_json", JSON.stringify(formatterBundle));
  pyodide.globals.set("formatter_line_length", formatterBundle.lineLength);
  pyodide.globals.set("formatter_source", "def add( a,b):\n return(a+b)\n");
  const formatted = JSON.parse(await pyodide.runPythonAsync(`${pythonFormatter}\nFORMAT_RESULT_JSON`));
  if (!formatted.ok || formatted.version !== formatterManifest.formatter.version || formatted.code !== "def add(a, b):\n    return a + b\n") {
    throw new Error(`Black 格式化测试失败：${JSON.stringify(formatted)}`);
  }
  pyodide.globals.set("formatter_source", "def broken(:\n pass");
  const invalid = JSON.parse(await pyodide.runPythonAsync(`${pythonFormatter}\nFORMAT_RESULT_JSON`));
  if (invalid.ok || invalid.kind !== "syntax" || invalid.line !== 1 || invalid.column !== 11) {
    throw new Error(`Black 语法错误定位测试失败：${JSON.stringify(invalid)}`);
  }
  console.log(`PASS Pyodide ${pyodide.runPython("import sys; sys.version.split()[0]")}、${slugs.length} 类题型与 ACM 模式`);
  console.log(`PASS Black ${formatted.version} 离线格式化与语法错误定位`);
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
  check(problems.every((problem) => !["rank", "paidOnly", "exampleTestcases", "hints"].some((key) => Object.hasOwn(problem, key))), "构建产物不再携带未使用的题目元数据");
  check(Object.keys(solutions).length === 100, "参考题解恰好 100 份");
  check(new Set(problems.map((problem) => problem.slug)).size === problems.length, "题目 slug 唯一");
  check(new Set(problems.map((problem) => String(problem.frontendId))).size === problems.length, "题号唯一");
  check(problems.every((problem) => solutions[problem.slug]), "每道题都有评测配置");
  check(Object.keys(solutions).every((slug) => problems.some((problem) => problem.slug === slug)), "没有多余的题解配置");
  check(Object.values(solutions).every((solution) => typeof solution.code === "string" && solution.code.trim() && Array.isArray(solution.tests) && solution.tests.length), "每份题解都有代码和测试用例");
  check(problems.every((problem) => !/<img\b[^>]*\bsrc=["'](?:https?:)?\/\//i.test(problem.content)), "题目快照没有外部图片");
  check(Object.keys(lock.packages || {}).length === 0, "Pyodide 锁文件只保留必要元数据");
  check(!/__[A-Z][A-Z0-9_]+__/.test(html), "构建占位符已全部替换");
  check(!/<script\b[^>]*\bsrc\s*=/i.test(html), "没有外部脚本依赖");
  check(!/<link\b[^>]*\brel=["']?stylesheet/i.test(html), "没有外部样式表依赖");
  check(!/<(?:img|video|audio|source)\b[^>]*\bsrc=["']https?:\/\//i.test(html), "没有外部媒体资源依赖");
  check(!/url\(\s*["']?https?:\/\//i.test(html), "CSS 没有外部资源依赖");
  check((html.match(/data:image\//gi) || []).length >= 60, "题面示意图已内嵌");
  check(html.includes('<html lang="zh-CN" data-theme="dark">'), "默认使用深色模式");
  const staticHtml = html.slice(0, html.indexOf("<script>"));
  const htmlIds = [...staticHtml.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  check(new Set(htmlIds).size === htmlIds.length, "HTML 元素 id 唯一");
  const appHeader = staticHtml.slice(staticHtml.indexOf('<header id="app-header"'), staticHtml.indexOf("</header>", staticHtml.indexOf('<header id="app-header"')));
  const editorToolbar = staticHtml.slice(staticHtml.indexOf('<div class="editor-toolbar">'), staticHtml.indexOf('<div class="code-editor-shell">'));
  check(appHeader.includes('class="header-preferences"') && appHeader.includes('class="header-utilities"') && appHeader.includes('class="header-data-actions"')
    && appHeader.includes('id="core-mode-button"') && appHeader.includes('id="acm-mode-button"')
    && appHeader.indexOf('class="offline-pill"') < appHeader.indexOf('class="header-actions"')
    && appHeader.indexOf('id="auto-expand-button"') < appHeader.indexOf('class="code-mode-switch')
    && appHeader.indexOf('class="code-mode-switch') < appHeader.indexOf('id="import-button"')
    && appHeader.includes('>核心</button>') && appHeader.includes('>ACM</button>')
    && !editorToolbar.includes("code-mode-switch"), "页头按偏好与数据工具分组，离线状态靠近品牌且模式切换使用精简文案");
  check(!staticHtml.includes("-webkit-") && !staticHtml.includes('wrap="off"') && !staticHtml.includes('focusable="false"')
    && !html.includes("document.execCommand") && !html.includes('addEventListener("beforeunload"')
    && !html.includes('app_header.setAttribute("aria-hidden"') && !html.includes('problem_pane.setAttribute("aria-hidden"'), "已移除私有样式、非标准属性、重复隐藏状态与废弃浏览器接口");
  check(html.includes("lc-offline-backup") && html.includes("function confirmBackupImport") && html.includes("function undoLastImport") && !html.includes("LC_RECORD") && !html.includes("function importMarkdown"), "使用完整 JSON 备份、预览及撤销，移除旧 Markdown 导入协议");
  check(html.includes("export-code-checkbox") && html.includes("在表格中包含个人代码") && html.includes('["题目名", "笔记", "核心代码", "ACM 代码"]'), "Markdown 表格可选导出个人代码列");
  check(!html.includes("const STATE_VERSION") && html.includes("const DEFAULT_SETTINGS") && html.includes('id="auto-expand-button"') && html.includes("expandProblemByDefault: true") && html.includes("setProblemPaneCollapsed(!state.settings.expandProblemByDefault)"), "题目描述默认展开且状态设置使用单一规范化路径");
  check(html.includes("setCodeMode(state.settings.codeMode, false, false);\nroute();"), "首页启动时同步代码模式并由路由渲染当前页面");
  check(html.includes('id="pane-resizer"') && html.includes("function constrainedProblemPaneWidth") && html.includes("setProblemPaneWidth") && html.includes("PROBLEM_PANE_DEFAULT = 43"), "题目和代码分栏支持统一约束、调整宽度并持久化");
  check(html.includes('id="catalog-result-count"') && html.includes("mobileWorkspaceMedia"), "目录筛选和移动端单屏工作区完整");
  check(html.includes('id="code-highlight"') && html.includes("function highlightPython") && html.includes("function updateCodeHighlight") && html.includes("py-indent-guide"), "代码编辑器包含离线 Python 语法高亮层与缩进引导线");
  check(html.includes("function indentCodeSelection") && html.includes("function deleteCodeIndent") && html.includes("function insertCodeBracketPair") && html.includes("function toggleCodeComment") && html.includes("function insertIndentedNewline") && html.includes('event.key.toLowerCase() === "s"'), "代码编辑器支持智能缩进、括号补全、切换注释、回车缩进与快捷保存");
  check(html.includes('id="format-code-button"') && html.includes("function formatCurrentCode") && html.includes('event.key.toLowerCase() === "f"') && html.includes("formatPythonSource")
    && !html.includes("restoreLastCodeFormat") && !html.includes("lastFormatChange"), "代码编辑器支持整文件格式化且不再拦截浏览器原生撤销重做");
  check(html.includes("black.format_file_contents") && html.includes("fast=False") && formatterManifest.packages.every(({ filename }) => html.includes(filename)), "Black 及校验过的纯 Python 依赖已完整内嵌");
  check(html.includes("第 ${result.line} 行、第 ${result.column} 列附近存在语法错误") && html.includes("codeOffsetAtPosition"), "格式化语法错误会定位具体行列且不会覆盖原代码");
  check(html.includes('id="privacy-view"') && html.includes("function createPrivacyPageModel") && html.includes("const privacyDocumentTitle = renderPrivacyPage()") && html.includes("setPrivacyMode(!privacyMode)"), "双击回车可切换随机内容的独立隐私伪装页并隐藏真实标题");
  check(!html.includes("`${problem.frontendId}. ${problem.title} · Python 离线训练场`") && html.includes("<title>Python 离线训练场</title>"), "浏览器标签始终使用固定的训练场标题");
  check(html.includes('[data-theme="dark"] .privacy-view') && html.includes("--privacy-bg-top") && html.includes("--privacy-card"), "隐私伪装页会跟随当前深色或浅色主题");
  check(html.includes('history.replaceState(history.state, "", location.href.split("#")[0])') && html.includes("privacyRestoreHash"), "隐私伪装页会隐藏并恢复地址栏题目标识");
  check(html.includes("privacyRestoreScrollX") && html.includes("window.scrollTo(privacyRestoreScrollX, privacyRestoreScrollY)") && html.includes("elements.privacy_view.inert = true"), "隐私伪装页会恢复滚动位置并隔离不可见区域焦点");
  check(html.includes('role="tablist"') && html.includes('role="tabpanel"') && html.includes('event.key === "ArrowRight"'), "工作区标签支持完整语义与方向键导航");
  check(html.includes("function trapModalFocus") && html.includes('modal.setAttribute("aria-hidden", "false")'), "弹窗会维护可访问状态并限制键盘焦点");
  check(html.includes('id="reset-progress-button"') && html.includes('id="reset-progress-modal"') && html.includes("function resetProgressRecords") && html.includes("个人代码、笔记和自定义样例不会删除"), "目录支持确认后一键重置全部提交进度且保留个人内容");
  check(html.includes("function updateSaveIndicators()") && !html.includes("savePulseTimers") && html.includes('document.visibilityState === "hidden"') && html.includes('window.addEventListener("pagehide"'), "保存提示基于实际写入结果且页面进入后台时立即持久化");
  check(html.includes('id="run-button" class="button" type="button">运行</button>') && html.includes('id="submit-button" class="button primary" type="button">提交</button>')
    && html.includes('id="custom-case-button"') && html.includes("function renderTestConsole") && html.includes('data-console-view="cases"')
    && html.includes('data-console-view="results"') && html.includes("function inputFieldsForConsole"), "运行控制台支持测试用例、测试结果、Case 切换及按参数展示输入");
  check(html.includes("const evaluationControlButtons = [elements.format_code_button")
    && html.includes("const codeModeSwitch = elements.core_mode_button.parentElement")
    && !html.includes("formattingControlButtons")
    && html.match(/for \(const button of evaluationControlButtons\) button\.disabled = busy/g)?.length === 2,
  "评测与格式化期间均保持核心与 ACM 模式可切换，并由整个分段控件统一处理点击");
  check(html.includes("execute_acm") && html.includes("mode: codeMode,") && html.includes("solution.tests.slice"), "ACM 模式支持独立代码并复用运行、提交及自定义样例评测");
  check(pythonHarness.includes("payload['mode']") && pythonHarness.includes("meta['output']")
    && !pythonHarness.includes("payload.get('mode')") && !pythonHarness.includes("'yes'") && !pythonHarness.includes("'no'"), "评测器使用当前严格协议且仅接受公开的布尔输入格式");
  check(html.includes("evaluationInProgress") && html.includes("MAX_CUSTOM_CASES = 20") && html.includes("MAX_IMPORT_FILE_SIZE"), "评测、自定义样例和导入文件具有资源边界");
  check(html.includes("new Worker") && html.includes("loadPyodide"), "包含隔离的 Python 运行时");
  check(html.includes("prewarmJudge()") && html.includes("Python 运行时已内置，将自动准备"), "Python 运行时自动预热");
  check(html.includes("function createRuntimeUrl") && html.includes("runtimeUrls.forEach((url) => URL.revokeObjectURL(url))")
    && !html.includes("function runtimeAssets") && !html.includes("decodedRuntime"), "运行时在评测 Worker 内解码并释放 Blob URL，主线程不保留解码副本");
  check(html.includes('type: "module", name: "lc-python-judge"') && !html.includes('Object.defineProperty(globalThis, "importScripts"'), "Python 使用模块 Worker 并移除经典 Worker 兼容补丁");
  check(!html.includes("startMainThreadJudge") && !html.includes("runMainThreadPython") && !html.includes("new Function(`${loaderSource}"), "已移除重复且会阻塞页面的主线程 Python 兼容后端");
  check(Buffer.byteLength(html) > 15 * 1024 * 1024, "Python、题面和图片已打包进单文件");
  const scriptMatch = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/i);
  check(Boolean(scriptMatch), "主应用脚本已内嵌");
  new vm.Script(scriptMatch[1], { filename: "lc_offline.inline.js" });
  assertions.push("内嵌 JavaScript 语法正确");
  verifyExportHelpers(html, check);
  verifyStateHelpers(html, check);
  verifyPrivacyShortcutHelpers(html, check);
  verifyPrivacyRandomizerHelpers(html, check);
  verifyAcmCaseHelpers(html, check);
  verifyEditorHelpers(html, check);
  verifySyntaxHighlighting(html, check);
  verifyFormatterUiHelpers(html, check);
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
  if (!compactHtml.includes('new DecompressionStream("gzip")') || !compactHtml.includes('new DOMParser().parseFromString(html, "text/html")')
    || !compactHtml.includes("source.replaceWith(script)") || /document\.(?:write|open|close)\(/.test(compactHtml)) {
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

if (command === "build") {
  await buildArtifact();
} else if (command === "test") {
  const html = await buildArtifact();
  testReferenceSolutions();
  testNegativeCases();
  testCustomCases();
  testEvaluationIsolation();
  testAcmMode();
  testAcmReferenceSolutions(html);
  await testPyodide();
  await verifyArtifact(html);
  await verifyCompactArtifact(html);
  console.log("全部测试通过");
} else {
  console.error("用法：node scripts/project.mjs <build|test>");
  process.exitCode = 1;
}
