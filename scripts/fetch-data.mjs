import { mkdir, writeFile } from "node:fs/promises";

const categories = [
  ["哈希", ["two-sum", "group-anagrams", "longest-consecutive-sequence"]],
  ["双指针", ["move-zeroes", "container-with-most-water", "3sum", "trapping-rain-water"]],
  ["滑动窗口", ["longest-substring-without-repeating-characters", "find-all-anagrams-in-a-string"]],
  ["子串", ["subarray-sum-equals-k", "sliding-window-maximum", "minimum-window-substring"]],
  ["普通数组", ["maximum-subarray", "merge-intervals", "rotate-array", "product-of-array-except-self", "first-missing-positive"]],
  ["矩阵", ["set-matrix-zeroes", "spiral-matrix", "rotate-image", "search-a-2d-matrix-ii"]],
  ["链表", ["intersection-of-two-linked-lists", "reverse-linked-list", "palindrome-linked-list", "linked-list-cycle", "linked-list-cycle-ii", "merge-two-sorted-lists", "add-two-numbers", "remove-nth-node-from-end-of-list", "swap-nodes-in-pairs", "reverse-nodes-in-k-group", "copy-list-with-random-pointer", "sort-list", "merge-k-sorted-lists", "lru-cache"]],
  ["二叉树", ["binary-tree-inorder-traversal", "maximum-depth-of-binary-tree", "invert-binary-tree", "symmetric-tree", "diameter-of-binary-tree", "binary-tree-level-order-traversal", "convert-sorted-array-to-binary-search-tree", "validate-binary-search-tree", "kth-smallest-element-in-a-bst", "binary-tree-right-side-view", "flatten-binary-tree-to-linked-list", "construct-binary-tree-from-preorder-and-inorder-traversal", "path-sum-iii", "lowest-common-ancestor-of-a-binary-tree", "binary-tree-maximum-path-sum"]],
  ["图论", ["number-of-islands", "rotting-oranges", "course-schedule", "implement-trie-prefix-tree"]],
  ["回溯", ["permutations", "subsets", "letter-combinations-of-a-phone-number", "combination-sum", "generate-parentheses", "word-search", "palindrome-partitioning", "n-queens"]],
  ["二分查找", ["search-insert-position", "search-a-2d-matrix", "find-first-and-last-position-of-element-in-sorted-array", "search-in-rotated-sorted-array", "find-minimum-in-rotated-sorted-array", "median-of-two-sorted-arrays"]],
  ["栈", ["valid-parentheses", "min-stack", "decode-string", "daily-temperatures", "largest-rectangle-in-histogram"]],
  ["堆", ["kth-largest-element-in-an-array", "top-k-frequent-elements", "find-median-from-data-stream"]],
  ["贪心算法", ["best-time-to-buy-and-sell-stock", "jump-game", "jump-game-ii", "partition-labels"]],
  ["动态规划", ["climbing-stairs", "pascals-triangle", "house-robber", "perfect-squares", "coin-change", "word-break", "longest-increasing-subsequence", "maximum-product-subarray", "partition-equal-subset-sum", "longest-valid-parentheses"]],
  ["多维动态规划", ["unique-paths", "minimum-path-sum", "longest-palindromic-substring", "longest-common-subsequence", "edit-distance"]],
  ["技巧", ["single-number", "majority-element", "sort-colors", "next-permutation", "find-the-duplicate-number"]],
];

const query = `query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId questionFrontendId title titleSlug translatedTitle
    content translatedContent difficulty isPaidOnly exampleTestcases
    codeSnippets { lang langSlug code }
    topicTags { name translatedName slug }
    hints
  }
}`;

const all = categories.flatMap(([category, slugs]) => slugs.map((slug) => ({ category, slug })));
if (all.length !== 100 || new Set(all.map((item) => item.slug)).size !== 100) {
  throw new Error(`题单数量异常：${all.length}`);
}

async function fetchQuestion(item, index) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch("https://leetcode.cn/graphql/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "https://leetcode.cn",
        "referer": `https://leetcode.cn/problems/${item.slug}/`,
        "user-agent": "Mozilla/5.0 Codex Offline Study Builder",
      },
      body: JSON.stringify({ query, variables: { titleSlug: item.slug }, operationName: "questionData" }),
    });
    if (response.ok) {
      const payload = await response.json();
      if (payload.data?.question) {
        const question = payload.data.question;
        const python = question.codeSnippets?.find((snippet) => snippet.langSlug === "python3")
          ?? question.codeSnippets?.find((snippet) => snippet.lang.toLowerCase().includes("python"));
        return {
          rank: index + 1,
          category: item.category,
          frontendId: question.questionFrontendId,
          title: question.translatedTitle || question.title,
          englishTitle: question.title,
          slug: question.titleSlug,
          difficulty: question.difficulty,
          paidOnly: question.isPaidOnly,
          content: question.translatedContent || question.content || "",
          exampleTestcases: question.exampleTestcases || "",
          starterCode: python?.code || "class Solution:\n    pass",
          tags: (question.topicTags || []).map((tag) => tag.translatedName || tag.name),
          hints: question.hints || [],
        };
      }
    }
    if (attempt === 4) throw new Error(`${item.slug}: HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
}

const problems = [];
for (let index = 0; index < all.length; index += 1) {
  const item = all[index];
  const question = await fetchQuestion(item, index);
  problems.push(question);
  process.stdout.write(`${String(index + 1).padStart(3, " ")}/100 ${question.frontendId} ${question.title}\n`);
  await new Promise((resolve) => setTimeout(resolve, 80));
}

await mkdir(new URL("../src/", import.meta.url), { recursive: true });
await writeFile(new URL("../src/problems.json", import.meta.url), `${JSON.stringify(problems, null, 2)}\n`);

const counts = problems.reduce((result, problem) => {
  result[problem.difficulty] = (result[problem.difficulty] || 0) + 1;
  return result;
}, {});
console.log("完成", counts);
