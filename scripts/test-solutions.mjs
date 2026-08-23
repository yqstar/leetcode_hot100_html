import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import solutions from "../src/solutions.mjs";
import pythonHarness from "../src/python-harness.mjs";

const problems = JSON.parse(await readFile(new URL("../src/problems.json", import.meta.url), "utf8"));
let failures = 0;

for (const [index, problem] of problems.entries()) {
  const solution = solutions[problem.slug];
  if (!solution) {
    console.error(`缺少题解：${problem.slug}`);
    failures += 1;
    continue;
  }
  const payload = {
    userCode: solution.code,
    referenceCode: solution.code,
    meta: solution,
    cases: solution.tests.map((value, caseIndex) => ({ index: caseIndex, visible: caseIndex < 2, value })),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  const source = `import base64\npayload_json=base64.b64decode('${encoded}').decode()\n${pythonHarness}\nprint(RESULT_JSON)\n`;
  const result = spawnSync("python3", ["-c", source], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    parsed = null;
  }
  if (result.status !== 0 || !parsed?.passed) {
    failures += 1;
    console.error(`FAIL ${index + 1}. ${problem.frontendId} ${problem.title}`);
    console.error(result.stderr || result.stdout || JSON.stringify(parsed));
  } else {
    console.log(`PASS ${String(index + 1).padStart(3, " ")} ${problem.frontendId} ${problem.title}`);
  }
}

if (failures) {
  console.error(`共 ${failures} 题失败`);
  process.exit(1);
}
console.log(`全部 ${problems.length} 道参考实现与评测适配通过`);
