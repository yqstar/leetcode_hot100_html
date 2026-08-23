import { spawnSync } from "node:child_process";
import solutions from "../src/solutions.mjs";
import pythonHarness from "../src/python-harness.mjs";

function evaluate(slug, userCode) {
  const solution = solutions[slug];
  const { code: referenceCode, tests, note: _note, complexity: _complexity, ...meta } = solution;
  const payload = {
    userCode, referenceCode, meta,
    cases: tests.slice(0, 2).map((value, index) => ({ index, visible: true, value })),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  const source = `import base64\npayload_json=base64.b64decode('${encoded}').decode()\n${pythonHarness}\nprint(RESULT_JSON)\n`;
  const result = spawnSync("python3", ["-c", source], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout.trim());
}

const negativeCases = [
  ["two-sum", "class Solution:\n    def twoSum(self, nums, target): return [0, 0]", "普通错误答案"],
  ["move-zeroes", "class Solution:\n    def moveZeroes(self, nums): return sorted(nums)", "未按要求原地修改"],
  ["copy-list-with-random-pointer", "class Solution:\n    def copyRandomList(self, head): return head", "未进行深拷贝"],
  ["lowest-common-ancestor-of-a-binary-tree", "class Solution:\n    def lowestCommonAncestor(self, root, p, q): return TreeNode(3)", "返回了伪造节点"],
  ["valid-parentheses", "class Solution:\n    def isValid(self, s) return True", "Python 语法错误"],
];

for (const [slug, code, label] of negativeCases) {
  const result = evaluate(slug, code);
  if (result.passed) throw new Error(`${slug} 未能拒绝：${label}`);
  console.log(`PASS 已拒绝 ${label} (${slug})`);
}
