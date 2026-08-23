import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
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

  const outputPath = new URL("leetcode_hot100_offline.html", root);
  const outputBuffer = Buffer.from(output);
  let previous = null;
  try {
    previous = await readFile(outputPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const changed = !previous?.equals(outputBuffer);
  if (changed) await writeFile(outputPath, outputBuffer);

  const hash = createHash("sha256").update(outputBuffer).digest("hex");
  console.log(changed ? "已生成 leetcode_hot100_offline.html" : "构建产物无变化，跳过写入");
  console.log(`题目 ${problems.length}，题解 ${Object.keys(solutions).length}，内嵌图片 ${(output.match(/data:image\//gi) || []).length}`);
  console.log(`大小 ${(outputBuffer.byteLength / 1024 / 1024).toFixed(2)} MiB，SHA-256 ${hash}`);
  return output;
}

const harnessLibrary = pythonHarness.replace(
  /\nRESULT_JSON = json\.dumps\(run_payload\(json\.loads\(payload_json\)\), ensure_ascii=False\)\n?$/,
  "",
);
if (harnessLibrary === pythonHarness) throw new Error("无法拆分 Python 评测器入口");

function pythonResults(payloads) {
  const encoded = Buffer.from(JSON.stringify(payloads)).toString("base64");
  const source = `import base64, json\npayloads_json=base64.b64decode('${encoded}').decode()\n${harnessLibrary}\nprint(json.dumps([run_payload(payload) for payload in json.loads(payloads_json)], ensure_ascii=False))\n`;
  const processResult = spawnSync("python3", ["-c", source], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  let parsed;
  try {
    parsed = JSON.parse(processResult.stdout.trim());
  } catch (error) {
    parsed = null;
  }
  return { processResult, parsed };
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
    throw new Error(`参考实现批量执行失败：${processResult.stderr || processResult.stdout}`);
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
    throw new Error(`反例批量执行失败：${processResult.stderr || processResult.stdout}`);
  }
  for (const [index, result] of parsed.entries()) {
    if (result?.passed) throw new Error(`${cases[index][0]} 未能拒绝：${cases[index][2]}`);
  }
  console.log(`PASS ${cases.length} 类错误答案均被拒绝`);
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
  check(problems.every((problem) => solutions[problem.slug]), "每道题都有评测配置");
  check(problems.every((problem) => !/<img\b[^>]*\bsrc=["'](?:https?:)?\/\//i.test(problem.content)), "题目快照没有外部图片");
  check(Object.keys(lock.packages || {}).length === 0, "Pyodide 锁文件只保留必要元数据");
  check(!/__PROBLEMS_JSON__|__SOLUTIONS_JSON__|__PYODIDE_[A-Z0-9_]+__|__APP_SCRIPT__|__STYLES__/.test(html), "构建占位符已全部替换");
  check(!/<script\b[^>]*\bsrc\s*=/i.test(html), "没有外部脚本依赖");
  check(!/<link\b[^>]*\brel=["']?stylesheet/i.test(html), "没有外部样式表依赖");
  check(!/<(?:img|video|audio|source)\b[^>]*\bsrc=["']https?:\/\//i.test(html), "没有外部媒体资源依赖");
  check(!/url\(\s*["']?https?:\/\//i.test(html), "CSS 没有外部资源依赖");
  check((html.match(/data:image\//gi) || []).length >= 60, "题面示意图已内嵌");
  check(html.includes("HOT100_EXPORT_VERSION:2") && html.includes("HOT100_RECORD") && html.includes("HOT100_NOTE_START"), "包含 Markdown 导入导出协议");
  check(html.includes("export-code-checkbox") && html.includes("同时导出个人代码"), "Markdown 导出可选个人代码");
  check(html.includes('id="problem-toggle-button"') && html.includes("setProblemPaneCollapsed(true)"), "进入题目时默认收起题面并可手动展开");
  check(html.includes("new Worker") && html.includes("loadPyodide"), "包含隔离的 Python 运行时");
  check(html.includes("prewarmJudge()") && html.includes("Python 运行时已内置，将自动准备"), "Python 运行时自动预热");
  check(html.includes("startMainThreadJudge") && !html.includes('new Worker(workerUrl, { type: "module"'), "包含 file:// 兼容回退");
  check(html.includes("new Function(`${loaderSource}") && html.includes("new Response(runtime.wasmBytes"), "兼容模式从内存启动 Python");
  check(Buffer.byteLength(html) > 15 * 1024 * 1024, "Python、题面和图片已打包进单文件");
  const scriptMatch = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/i);
  check(Boolean(scriptMatch), "主应用脚本已内嵌");
  new vm.Script(scriptMatch[1], { filename: "leetcode_hot100_offline.inline.js" });
  assertions.push("内嵌 JavaScript 语法正确");
  const difficultyCounts = problems.reduce((counts, problem) => {
    counts[problem.difficulty] = (counts[problem.difficulty] || 0) + 1;
    return counts;
  }, {});
  check(difficultyCounts.Easy === 20 && difficultyCounts.Medium === 68 && difficultyCounts.Hard === 12, "难度分布正确");
  check(new Set(problems.map((problem) => problem.category)).size === 17, "题单包含 17 个专题");
  console.log(`PASS 离线构建产物 ${assertions.length} 项校验`);
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
  await testPyodide();
  testMemoryRuntimeInChild();
  await verifyArtifact(html);
  console.log("全部测试通过");
} else {
  console.error("用法：node scripts/project.mjs <build|test>");
  process.exitCode = 1;
}
