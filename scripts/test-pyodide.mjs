import { pathToFileURL } from "node:url";
import solutions from "../src/solutions.mjs";
import pythonHarness from "../src/python-harness.mjs";

const runtimePath = new URL("../.cache/runtime/", import.meta.url).pathname;
const { loadPyodide } = await import(pathToFileURL(`${runtimePath}pyodide.mjs`));
const pyodide = await loadPyodide({ indexURL: runtimePath });

for (const slug of ["two-sum", "reverse-linked-list", "lru-cache", "lowest-common-ancestor-of-a-binary-tree"]) {
  const solution = solutions[slug];
  const { code: referenceCode, tests, note: _note, complexity: _complexity, ...meta } = solution;
  const payload = {
    userCode: referenceCode,
    referenceCode,
    meta,
    cases: tests.slice(0, 2).map((value, index) => ({ index, visible: true, value })),
  };
  pyodide.globals.set("payload_json", JSON.stringify(payload));
  const output = await pyodide.runPythonAsync(`${pythonHarness}\nRESULT_JSON`);
  const result = JSON.parse(output);
  if (!result.passed) throw new Error(`${slug} 在内嵌 Python 运行时中未通过`);
  console.log(`PASS Pyodide ${slug}`);
}

console.log(`PASS Python ${pyodide.runPython("import sys; sys.version.split()[0]")}`);
