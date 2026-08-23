import vm from "node:vm";
import { readFile } from "node:fs/promises";
import solutions from "../src/solutions.mjs";

const root = new URL("../", import.meta.url);
const [html, problemText, manifestText] = await Promise.all([
  readFile(new URL("leetcode_hot100_offline.html", root), "utf8"),
  readFile(new URL("src/problems.json", root), "utf8"),
  readFile(new URL(".cache/images/manifest.json", root), "utf8"),
]);
const problems = JSON.parse(problemText);
const manifest = JSON.parse(manifestText);
const assertions = [];
const check = (condition, message) => {
  if (!condition) throw new Error(message);
  assertions.push(message);
};

check(/^<!doctype html>/i.test(html), "包含 HTML5 文档声明");
check(problems.length === 100, "题目数据恰好 100 道");
check(Object.keys(solutions).length === 100, "参考题解恰好 100 份");
check(problems.every((problem) => solutions[problem.slug]), "每道题都有匹配的参考题解与评测配置");
check(Object.values(manifest).every((entry) => !entry.error), "题面图片全部下载成功");
check(!/__PROBLEMS_JSON__|__SOLUTIONS_JSON__|__PYODIDE_[A-Z0-9_]+__|__APP_SCRIPT__|__STYLES__/.test(html), "构建占位符已全部替换");
check(!/<script\b[^>]*\bsrc\s*=/i.test(html), "没有外部脚本依赖");
check(!/<link\b[^>]*\brel=["']?stylesheet/i.test(html), "没有外部样式表依赖");
check(!/<(?:img|video|audio|source)\b[^>]*\bsrc=["']https?:\/\//i.test(html), "没有外部媒体资源依赖");
check(!/url\(\s*["']?https?:\/\//i.test(html), "CSS 没有外部资源依赖");
check((html.match(/data:image\//gi) || []).length >= 60, "题面示意图已内嵌");
check(html.includes("HOT100_EXPORT_VERSION:2") && html.includes("HOT100_RECORD") && html.includes("HOT100_NOTE_START"), "包含简洁清单版 Markdown 导入导出协议");
check(html.includes("export-code-checkbox") && html.includes("同时导出个人代码"), "Markdown 导出支持选择是否包含代码");
check(html.includes("new Worker") && html.includes("loadPyodide"), "包含隔离的离线 Python 评测运行时");
check(html.includes("prewarmJudge()") && html.includes("Python 运行时已内置，将自动准备"), "内嵌 Python 运行时会自动预热");
check(html.includes("startMainThreadJudge") && !html.includes('new Worker(workerUrl, { type: "module"'), "file:// Worker 失败时包含兼容回退");
check(html.includes("new Function(`${loaderSource}") && html.includes("new Response(runtime.wasmBytes"), "兼容模式直接从内存启动 Python");
check(Buffer.byteLength(html) > 15 * 1024 * 1024, "Python、题面和图片已实际打包进单文件");

const scriptMatch = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/i);
check(Boolean(scriptMatch), "主应用脚本已内嵌");
new vm.Script(scriptMatch[1], { filename: "leetcode_hot100_offline.inline.js" });
assertions.push("内嵌 JavaScript 语法检查通过");

const difficultyCounts = problems.reduce((counts, problem) => {
  counts[problem.difficulty] = (counts[problem.difficulty] || 0) + 1;
  return counts;
}, {});
check(difficultyCounts.Easy === 20 && difficultyCounts.Medium === 68 && difficultyCounts.Hard === 12, "难度分布为 20 / 68 / 12");
check(new Set(problems.map((problem) => problem.category)).size === 17, "题单包含 17 个专题");

console.log(`验证通过：${assertions.length} 项`);
for (const assertion of assertions) console.log(`PASS ${assertion}`);
