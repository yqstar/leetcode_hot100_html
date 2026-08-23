import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [loaderRaw, asmRaw, wasmBuffer, stdlibBuffer, lockText] = await Promise.all([
  readFile(new URL(".cache/runtime/pyodide.mjs", root), "utf8"),
  readFile(new URL(".cache/runtime/pyodide.asm.mjs", root), "utf8"),
  readFile(new URL(".cache/runtime/pyodide.asm.wasm", root)),
  readFile(new URL(".cache/runtime/python_stdlib.zip", root)),
  readFile(new URL(".cache/runtime/pyodide-lock.json", root), "utf8"),
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

// Make this isolated process look like a browser main thread. This exercises the
// exact no-Worker/no-Blob compatibility path used by the generated HTML.
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

let pyodide;
try {
  pyodide = await loader.loadPyodide({
    indexURL: "https://offline.local/",
    stdLibURL: "https://offline.local/python_stdlib.zip",
    lockFileContents: JSON.parse(lockText),
    packageBaseUrl: "https://offline.local/",
    createPyodideModule,
  });
} catch (error) {
  originalProcess.stderr.write(`${error?.name || "Error"}: ${error?.message || error}\n`);
  const conciseStack = String(error?.stack || "").split("\n").filter((line) => line.length < 500).slice(1, 12).join("\n");
  if (conciseStack) originalProcess.stderr.write(`${conciseStack}\n`);
  originalProcess.exit(1);
}

const answer = pyodide.runPython("sum(i * i for i in range(10))");
if (answer !== 285) throw new Error(`内存兼容模式结果异常：${answer}`);
console.log(`PASS 内存兼容模式 Python ${pyodide.runPython("import sys; sys.version.split()[0]")}`);
originalProcess.exit(0);
