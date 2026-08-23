import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import solutions from "../src/solutions.mjs";
import pythonHarness from "../src/python-harness.mjs";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");
const safeJson = (value) => JSON.stringify(value)
  .replaceAll("<", "\\u003c")
  .replaceAll("\u2028", "\\u2028")
  .replaceAll("\u2029", "\\u2029");

const [problemText, styleText, appTemplate, appSource, lockText, loader, asmModule, wasm, stdlib] = await Promise.all([
  readText("src/problems.json"), readText("src/styles.css"), readText("src/app.template"),
  readText("src/app.js"), readText(".cache/runtime/pyodide-lock.json"),
  readFile(new URL(".cache/runtime/pyodide.mjs", root)),
  readFile(new URL(".cache/runtime/pyodide.asm.mjs", root)),
  readFile(new URL(".cache/runtime/pyodide.asm.wasm", root)),
  readFile(new URL(".cache/runtime/python_stdlib.zip", root)),
]);
const problems = JSON.parse(problemText);

if (problems.length !== 100) throw new Error(`题目数量异常：${problems.length}`);
const missingSolutions = problems.filter((problem) => !solutions[problem.slug]);
if (missingSolutions.length) throw new Error(`缺少题解：${missingSolutions.map((problem) => problem.slug).join(", ")}`);

const imageSources = problems.flatMap((problem) =>
  [...problem.content.matchAll(/<img\b[^>]*?\bsrc=(["'])([^"']+)\1/gi)].map((match) => match[2]),
);
const externalImages = imageSources.filter((source) => !source.startsWith("data:image/"));
if (externalImages.length) {
  throw new Error(`题面仍包含 ${externalImages.length} 个未内嵌图片`);
}

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

let script = appSource;
for (const [token, value] of Object.entries(replacements)) {
  const occurrences = script.split(token).length - 1;
  if (occurrences !== 1) throw new Error(`构建占位符 ${token} 出现 ${occurrences} 次`);
  script = script.replace(token, value);
}
script = script.replaceAll("</script", "<\\/script");

const output = appTemplate
  .replace("__STYLES__", styleText)
  .replace("__APP_SCRIPT__", script);
if (/__(?:STYLES|APP_SCRIPT)__/.test(output)) throw new Error("HTML 模板占位符未完整替换");
const outputPath = new URL("leetcode_hot100_offline.html", root);
await writeFile(outputPath, output);

const hash = createHash("sha256").update(output).digest("hex");
console.log(`已生成 leetcode_hot100_offline.html`);
console.log(`题目 ${problems.length}，题解 ${Object.keys(solutions).length}，内嵌图片 ${imageSources.length}`);
console.log(`大小 ${(Buffer.byteLength(output) / 1024 / 1024).toFixed(2)} MiB，SHA-256 ${hash}`);
