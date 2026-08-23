import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import solutions from "../src/solutions.mjs";
import pythonHarness from "../src/python-harness.mjs";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");
const readBuffer = (path) => readFile(new URL(path, root));
const safeJson = (value) => JSON.stringify(value)
  .replaceAll("<", "\\u003c")
  .replaceAll("\u2028", "\\u2028")
  .replaceAll("\u2029", "\\u2029");

const [problemText, styleText, appTemplate, appSource, manifestText, lockText] = await Promise.all([
  readText("src/problems.json"), readText("src/styles.css"), readText("src/app.template"),
  readText("src/app.js"), readText(".cache/images/manifest.json"), readText(".cache/runtime/pyodide-lock.json"),
]);
const problems = JSON.parse(problemText);
const imageManifest = JSON.parse(manifestText);

if (problems.length !== 100) throw new Error(`题目数量异常：${problems.length}`);
const missingSolutions = problems.filter((problem) => !solutions[problem.slug]);
if (missingSolutions.length) throw new Error(`缺少题解：${missingSolutions.map((problem) => problem.slug).join(", ")}`);

const imageData = new Map();
for (const [url, entry] of Object.entries(imageManifest)) {
  if (entry.error) continue;
  const buffer = await readBuffer(`.cache/images/${entry.filename}`);
  imageData.set(url, `data:${entry.contentType};base64,${buffer.toString("base64")}`);
}

function normalizeUrl(url) {
  const decoded = url.replaceAll("&amp;", "&");
  return decoded.startsWith("//") ? `https:${decoded}` : decoded;
}

function embedProblemImages(content) {
  return content
    .replace(/\s+srcset=(["'])[^"']*\1/gi, "")
    .replace(/(<img\b[^>]*?\bsrc=)(["'])([^"']+)\2/gi, (full, prefix, quote, source) => {
      const embedded = imageData.get(normalizeUrl(source));
      return embedded ? `${prefix}${quote}${embedded}${quote}` : full;
    });
}

const embeddedProblems = problems.map((problem) => ({ ...problem, content: embedProblemImages(problem.content) }));
const runtimeFiles = {
  __PYODIDE_LOADER_B64__: (await readBuffer(".cache/runtime/pyodide.mjs")).toString("base64"),
  __PYODIDE_ASM_MJS_B64__: (await readBuffer(".cache/runtime/pyodide.asm.mjs")).toString("base64"),
  __PYODIDE_WASM_B64__: (await readBuffer(".cache/runtime/pyodide.asm.wasm")).toString("base64"),
  __PYODIDE_STDLIB_B64__: (await readBuffer(".cache/runtime/python_stdlib.zip")).toString("base64"),
};

let script = appSource
  .replace("__PROBLEMS_JSON__", safeJson(embeddedProblems))
  .replace("__SOLUTIONS_JSON__", safeJson(solutions))
  .replace("__PYTHON_HARNESS_JSON__", safeJson(pythonHarness))
  .replace("__PYODIDE_LOCK_JSON__", safeJson(JSON.parse(lockText)));
for (const [placeholder, value] of Object.entries(runtimeFiles)) {
  script = script.replace(placeholder, value);
}
script = script.replaceAll("</script", "<\\/script");

const output = appTemplate.replace("__STYLES__", styleText).replace("__APP_SCRIPT__", script);
const outputPath = new URL("leetcode_hot100_offline.html", root);
await writeFile(outputPath, output);

const hash = createHash("sha256").update(output).digest("hex");
console.log(`已生成 leetcode_hot100_offline.html`);
console.log(`题目 ${embeddedProblems.length}，题解 ${Object.keys(solutions).length}，内嵌图片 ${imageData.size}`);
console.log(`大小 ${(Buffer.byteLength(output) / 1024 / 1024).toFixed(2)} MiB，SHA-256 ${hash}`);
