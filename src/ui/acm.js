const acmSchemaCache = new WeakMap();

function inferAcmSchema(values) {
  const present = values.filter((value) => value !== null && value !== undefined);
  if (!present.length) return { type: "string", nullable: true };
  if (present.every(Array.isArray)) {
    const children = present.flat();
    const item = inferAcmSchema(children);
    const matrix = item.type === "array" && item.item?.type !== "array" && present.every((outer) => {
      if (!outer.length) return true;
      if (!outer.every(Array.isArray)) return false;
      const width = outer[0].length;
      return outer.every((row) => row.length === width);
    });
    return { type: "array", item, matrix };
  }
  const type = present.every((value) => typeof value === "number") ? "number"
    : present.every((value) => typeof value === "boolean") ? "boolean"
      : "string";
  return { type, nullable: present.length !== values.length };
}

function acmSchemaFor(solution) {
  if (acmSchemaCache.has(solution)) return acmSchemaCache.get(solution);
  let schema;
  if (solution.kind === "class") {
    const occurrences = new Map();
    for (const test of solution.tests) {
      test.ops.forEach((operation, index) => {
        if (!occurrences.has(operation)) occurrences.set(operation, []);
        occurrences.get(operation).push(test.args[index]);
      });
    }
    const operations = new Map([...occurrences].map(([operation, argumentLists]) => {
      const count = Math.max(0, ...argumentLists.map((args) => args.length));
      return [operation, Array.from({ length: count }, (_, index) => inferAcmSchema(argumentLists.map((args) => args[index])))];
    }));
    schema = { kind: "class", operations };
  } else {
    const count = Math.max(0, ...solution.tests.map((test) => test.length));
    schema = {
      kind: "method",
      args: Array.from({ length: count }, (_, index) => inferAcmSchema(solution.tests.map((test) => test[index]))),
    };
  }
  acmSchemaCache.set(solution, schema);
  return schema;
}

function acmScalarText(value) {
  if (value == null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === "") return '""';
  return String(value);
}

function encodeAcmValue(value, schema) {
  if (schema.type !== "array") return [acmScalarText(value)];
  if (schema.matrix) {
    const rows = value.length;
    const columns = rows ? value[0].length : 0;
    return [`${rows} ${columns}`, ...value.map((row) => row.map(acmScalarText).join(" "))];
  }
  if (schema.item.type !== "array") {
    if (schema.item.type === "string") return [String(value.length), ...value.map(acmScalarText)];
    return value.length ? [String(value.length), value.map(acmScalarText).join(" ")] : ["0"];
  }
  return [String(value.length), ...value.flatMap((item) => encodeAcmValue(item, schema.item))];
}

function formatAcmCase(value, solution) {
  const schema = acmSchemaFor(solution);
  if (schema.kind === "class") {
    const lines = [String(value.ops.length)];
    value.ops.forEach((operation, index) => {
      lines.push([operation, ...value.args[index].map(acmScalarText)].join(" "));
    });
    return lines.join("\n");
  }
  return value.flatMap((argument, index) => encodeAcmValue(argument, schema.args[index])).join("\n");
}

function parseAcmScalar(source, schema, label) {
  const value = source.trim();
  if (schema.nullable && ["null", "none"].includes(value.toLowerCase())) return null;
  if (schema.type === "number") {
    const parsed = Number(value);
    if (!value || !Number.isFinite(parsed)) throw new Error(`${label} 必须是数字`);
    return parsed;
  }
  if (schema.type === "boolean") {
    if (["true", "1"].includes(value.toLowerCase())) return true;
    if (["false", "0"].includes(value.toLowerCase())) return false;
    throw new Error(`${label} 必须是 true 或 false`);
  }
  if (schema.type === "string" && value === '""') return "";
  return source;
}

function parseAcmMethodCase(source, solution) {
  const lines = source.replaceAll("\r", "").split("\n");
  let cursor = 0;
  const readLine = (label) => {
    if (cursor >= lines.length) throw new Error(`缺少${label}`);
    return lines[cursor++];
  };
  const readCount = (label, pair = false) => {
    const parts = readLine(label).trim().split(/\s+/).filter(Boolean);
    const required = pair ? 2 : 1;
    if (parts.length !== required || parts.some((part) => !/^\d+$/.test(part))) throw new Error(`${label}格式无效`);
    const counts = parts.map(Number);
    if (counts.some((count) => !Number.isSafeInteger(count))) throw new Error(`${label}超出有效整数范围`);
    return counts;
  };
  const readRows = (count, label, read) => {
    if (count > lines.length - cursor) throw new Error(`${label}声明了 ${count} 行，但剩余输入不足`);
    return Array.from({ length: count }, (_, index) => read(index));
  };
  const parseValue = (schema, label) => {
    if (schema.type !== "array") return parseAcmScalar(readLine(label), schema, label);
    if (schema.matrix) {
      const [rows, columns] = readCount(`${label}的行列数`, true);
      return readRows(rows, label, (row) => {
        const parts = readLine(`${label}第 ${row + 1} 行`).trim().split(/\s+/).filter(Boolean);
        if (parts.length !== columns) throw new Error(`${label}第 ${row + 1} 行应有 ${columns} 项`);
        return parts.map((part, column) => parseAcmScalar(part, schema.item.item, `${label}[${row}][${column}]`));
      });
    }
    const [count] = readCount(`${label}的长度`);
    if (schema.item.type === "string") {
      return readRows(count, label, (index) => parseAcmScalar(readLine(`${label}[${index}]`), schema.item, `${label}[${index}]`));
    }
    if (schema.item.type !== "array") {
      if (!count) return [];
      const parts = readLine(`${label}的元素`).trim().split(/\s+/).filter(Boolean);
      if (parts.length !== count) throw new Error(`${label}应有 ${count} 项`);
      return parts.map((part, index) => parseAcmScalar(part, schema.item, `${label}[${index}]`));
    }
    return readRows(count, label, (index) => parseValue(schema.item, `${label}[${index}]`));
  };
  const schema = acmSchemaFor(solution);
  const args = schema.args.map((argumentSchema, index) => parseValue(argumentSchema, `参数 ${index + 1}`));
  if (lines.slice(cursor).some((line) => line.trim())) throw new Error("末尾存在多余输入");
  return args;
}

function parseAcmClassCase(source, solution) {
  const lines = source.replaceAll("\r", "").split("\n").filter((line) => line.trim());
  if (!lines.length || !/^\d+$/.test(lines[0].trim())) throw new Error("第一行必须是操作数量");
  const count = Number(lines[0]);
  if (lines.length !== count + 1) throw new Error(`应包含 ${count} 行操作`);
  const schema = acmSchemaFor(solution);
  const ops = [];
  const args = [];
  for (let index = 0; index < count; index += 1) {
    const [operation, ...tokens] = lines[index + 1].trim().split(/\s+/);
    const argumentSchemas = schema.operations.get(operation);
    if (!argumentSchemas) throw new Error(`未知操作 ${operation}`);
    if (tokens.length !== argumentSchemas.length) throw new Error(`${operation} 需要 ${argumentSchemas.length} 个参数`);
    ops.push(operation);
    args.push(tokens.map((token, argumentIndex) => parseAcmScalar(token, argumentSchemas[argumentIndex], `${operation} 参数 ${argumentIndex + 1}`)));
  }
  if (ops[0] !== solution.className) throw new Error(`首个操作必须是 ${solution.className}`);
  return { ops, args };
}

function solutionArgumentNames(solution) {
  if (solution.setup === "intersection") return ["链表 A 的独有前缀", "链表 B 的独有前缀", "公共尾部"];
  if (solution.setup === "cycle") return ["链表节点值", "环入口下标"];
  if (solution.setup === "lca") return ["二叉树层序序列", "节点 p 的值", "节点 q 的值"];
  const parameters = solution.code.match(/def\s+\w+\s*\(self(?:,\s*([^)]*))?\)/)?.[1];
  return parameters ? parameters.split(",").map((value) => value.trim().split(/[=:]/)[0].trim()) : [];
}

function describeAcmSchema(name, schema) {
  if (schema.type === "number") return `${name}：一行一个数字`;
  if (schema.type === "boolean") return `${name}：一行 true 或 false`;
  if (schema.type === "string") return `${name}：一行一个字符串`;
  if (schema.matrix) return `${name}：先输入“行数 列数”，随后每行输入一行数据`;
  if (schema.item.type === "string") return `${name}：先输入元素个数，随后每个字符串占一行`;
  if (schema.item.type !== "array") return `${name}：先输入元素个数，下一行输入空格分隔的元素`;
  return `${name}：先输入分组数，随后每组先输入长度，再输入该组元素`;
}

function acmInputDescriptionFor(solution) {
  const schema = acmSchemaFor(solution);
  if (schema.kind === "class") return "第一行输入操作数量；随后每行输入操作名及其空格分隔的参数。";
  const names = solutionArgumentNames(solution);
  return schema.args.map((argumentSchema, index) => describeAcmSchema(names[index] || `参数 ${index + 1}`, argumentSchema)).join("；") + "。";
}

const ACM_REFERENCE_LIST_SUPPORT = String.raw`class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def _build_list(values):
    nodes = [ListNode(value) for value in values]
    for current, following in zip(nodes, nodes[1:]):
        current.next = following
    return (nodes[0] if nodes else None), nodes`;

const ACM_REFERENCE_RANDOM_SUPPORT = String.raw`class Node:
    def __init__(self, x=0, next=None, random=None):
        self.val = x
        self.next = next
        self.random = random

def _random_from(values):
    nodes = [Node(item[0]) for item in values]
    for index, item in enumerate(values):
        if index + 1 < len(nodes):
            nodes[index].next = nodes[index + 1]
        if item[1] is not None:
            nodes[index].random = nodes[item[1]]
    return nodes[0] if nodes else None`;

const ACM_REFERENCE_TREE_SUPPORT = String.raw`class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def _tree_from(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = [root]
    index = 1
    for node in queue:
        if index >= len(values):
            break
        if index < len(values) and values[index] is not None:
            node.left = TreeNode(values[index])
            queue.append(node.left)
        index += 1
        if index < len(values) and values[index] is not None:
            node.right = TreeNode(values[index])
            queue.append(node.right)
        index += 1
    return root`;

const acmReferenceCodeCache = new WeakMap();
const ACM_DEFAULT_LIST_METHODS = new Set([
  "findAnagrams", "maxSlidingWindow", "productExceptSelf", "spiralOrder", "inorderTraversal",
  "rightSideView", "searchRange", "dailyTemperatures", "partitionLabels",
]);
const ACM_DEFAULT_ROW_METHODS = new Set(["merge", "levelOrder", "generate"]);
const ACM_STRING_OUTPUT_METHODS = new Set(["minWindow", "decodeString", "longestPalindrome"]);

function acmPythonToken(source, schema) {
  let converted;
  if (schema.type === "number") converted = `int(${source})`;
  else if (schema.type === "boolean") converted = `${source}.lower() in ("true", "1")`;
  else converted = `("" if ${source} == '\"\"' else ${source})`;
  return schema.nullable ? `(None if ${source}.lower() in ("null", "none") else ${converted})` : converted;
}

function acmTokenListExpression(schema) {
  if (schema.type === "number" && !schema.nullable) return "list(map(int, input().split()))";
  return `[${acmPythonToken("value", schema)} for value in input().split()]`;
}

function acmReadLines(name, schema) {
  const size = `${name}_length`;
  if (schema.type !== "array") {
    if (schema.type === "number" && !schema.nullable) return [`${name} = int(input())`];
    if (schema.type === "boolean" && !schema.nullable) return [`${name} = input().strip().lower() in ("true", "1")`];
    const raw = `${name}_text`;
    return [`${raw} = input()`, `${name} = ${acmPythonToken(raw, schema)}`];
  }
  if (schema.matrix) {
    const rows = `${name}_rows`;
    const columns = `${name}_columns`;
    return [
      `${rows}, ${columns} = map(int, input().split())`,
      `${name} = [${acmTokenListExpression(schema.item.item)} for _ in range(${rows})]`,
    ];
  }
  if (schema.item.type !== "array") {
    if (schema.item.type === "string") {
      const raw = `${name}_text`;
      return [
        `${size} = int(input())`,
        `${name} = []`,
        `for _ in range(${size}):`,
        `    ${raw} = input()`,
        `    ${name}.append(${acmPythonToken(raw, schema.item)})`,
      ];
    }
    return [
      `${size} = int(input())`,
      `${name} = ${acmTokenListExpression(schema.item)} if ${size} else []`,
    ];
  }
  const groupSize = `${name}_group_length`;
  const itemSchema = schema.item.item;
  const lines = [`${size} = int(input())`, `${name} = []`, `for _ in range(${size}):`, `    ${groupSize} = int(input())`];
  if (itemSchema.type === "string") {
    const raw = `${name}_text`;
    const group = `${name}_group`;
    lines.push(`    ${group} = []`, `    for _ in range(${groupSize}):`, `        ${raw} = input()`, `        ${group}.append(${acmPythonToken(raw, itemSchema)})`, `    ${name}.append(${group})`);
  } else {
    lines.push(`    ${name}.append(${acmTokenListExpression(itemSchema)} if ${groupSize} else [])`);
  }
  return lines;
}

function acmRawArgumentNames(solution, count) {
  const special = solution.setup === "intersection" ? ["prefix_a", "prefix_b", "shared_values"]
    : solution.setup === "cycle" ? ["values", "position"]
      : solution.setup === "lca" ? ["tree_values", "p_value", "q_value"]
        : solutionArgumentNames(solution);
  return Array.from({ length: count }, (_, index) => /^[A-Za-z_]\w*$/.test(special[index] || "") ? special[index] : `_arg_${index + 1}`);
}

function indentPython(source, spaces = 4) {
  const indentation = " ".repeat(spaces);
  return source.split("\n").map((line) => line ? indentation + line : "").join("\n");
}

function acmOutputShape(solution, schema) {
  if (["rows", "rows-sorted", "randomlist"].includes(solution.output)) return "rows";
  if (solution.output === "mutated") return schema.args[0]?.matrix ? "rows" : "list";
  if (["listnode", "tree", "balanced-bst", "flatten", "unordered"].includes(solution.output)) return "list";
  if (ACM_DEFAULT_ROW_METHODS.has(solution.method)) return "rows";
  if (ACM_DEFAULT_LIST_METHODS.has(solution.method)) return "list";
  return "scalar";
}

function acmPrintLines(shape, solution, variable = "answer") {
  if (shape === "rows") return [
    `for row in ${variable}:`,
    solution.method === "groupAnagrams"
      ? `    print(*(('\"\"' if value == "" else value) for value in row)) if row else print("-")`
      : `    print(*row) if row else print("-")`,
  ];
  if (shape === "list") return [`print(*${variable})`];
  if (ACM_STRING_OUTPUT_METHODS.has(solution.method)) return [`print('\"\"' if ${variable} == "" else ${variable})`];
  return [`print(${variable})`];
}

function acmMethodBody(solution, schema, names) {
  const lines = names.flatMap((name, index) => acmReadLines(name, schema.args[index]));
  const kinds = solution.argKinds || [];
  let callNames = [...names];
  if (solution.setup === "intersection") {
    lines.push(...String.raw`shared, shared_nodes = _build_list(shared_values)
head_a, nodes_a = _build_list(prefix_a)
head_b, nodes_b = _build_list(prefix_b)
head_a = head_a or shared
head_b = head_b or shared
if nodes_a:
    nodes_a[-1].next = shared
if nodes_b:
    nodes_b[-1].next = shared
nodes = shared_nodes + nodes_a + nodes_b`.split("\n"));
    callNames = ["head_a", "head_b"];
  } else if (solution.setup === "cycle") {
    lines.push(...String.raw`head, nodes = _build_list(values)
if nodes and position >= 0:
    nodes[-1].next = nodes[position]`.split("\n"));
    callNames = ["head"];
  } else if (solution.setup === "lca") {
    lines.push(...String.raw`root = _tree_from(tree_values)
nodes = []
queue = [root] if root else []
for node in queue:
    nodes.append(node)
    if node.left:
        queue.append(node.left)
    if node.right:
        queue.append(node.right)
p = next((node for node in nodes if node.val == p_value), None)
q = next((node for node in nodes if node.val == q_value), None)`.split("\n"));
    callNames = ["root", "p", "q"];
  } else {
    names.forEach((name, index) => {
      const kind = kinds[index] || "normal";
      if (kind === "listnode") lines.push(`${name}, _ = _build_list(${name})`);
      else if (kind === "listnodes") lines.push(`${name} = [_build_list(values)[0] for values in ${name}]`);
      else if (kind === "tree") lines.push(`${name} = _tree_from(${name})`);
      else if (kind === "randomlist") lines.push(`${name} = _random_from(${name})`);
    });
  }
  lines.push(`result = Solution().${solution.method}(${callNames.join(", ")})`);
  let outputName = "result";
  if (solution.output === "mutated") {
    lines.push(`answer = ${callNames[0]}`);
    outputName = "answer";
  } else if (solution.output === "listnode") {
    lines.push(...String.raw`answer = []
while result:
    answer.append(result.val)
    result = result.next`.split("\n"));
    outputName = "answer";
  } else if (["tree", "balanced-bst"].includes(solution.output)) {
    lines.push(...String.raw`answer = []
queue = [result] if result else []
for node in queue:
    if node is None:
        answer.append(None)
        continue
    answer.append(node.val)
    queue.extend((node.left, node.right))
while answer and answer[-1] is None:
    answer.pop()`.split("\n"));
    outputName = "answer";
  } else if (solution.output === "randomlist") {
    lines.push(...String.raw`nodes = []
while result:
    nodes.append(result)
    result = result.next
positions = {id(node): index for index, node in enumerate(nodes)}
answer = [[node.val, positions.get(id(node.random)) if node.random else None] for node in nodes]`.split("\n"));
    outputName = "answer";
  } else if (solution.output === "node-index") {
    lines.push("answer = next((index for index, node in enumerate(nodes) if node is result), -1)");
    outputName = "answer";
  } else if (solution.output === "flatten") {
    lines.push(...String.raw`answer = []
node = root
while node:
    answer.append(node.val)
    node = node.right`.split("\n"));
    outputName = "answer";
  }
  lines.push(...acmPrintLines(acmOutputShape(solution, schema), solution, outputName));
  return lines.join("\n");
}

function acmClassBody(solution, schema) {
  const branches = [...schema.operations].flatMap(([operation, argumentSchemas], index) => {
    const args = argumentSchemas.map((item, argumentIndex) => acmPythonToken(`values[${argumentIndex}]`, item)).join(", ");
    const action = operation === solution.className
      ? [`instance = ${solution.className}(${args})`, "answer.append(None)"]
      : [`answer.append(instance.${operation}(${args}))`];
    return [`${index ? "elif" : "if"} operation == ${JSON.stringify(operation)}:`, ...action.map((line) => `    ${line}`)];
  });
  return [
    "instance = None",
    "answer = []",
    "for _ in range(int(input())):",
    "    operation, *values = input().split()",
    ...branches.map((line) => `    ${line}`),
    ...acmPrintLines("list", solution),
  ].join("\n");
}

function acmReferenceCodeFor(solution) {
  if (acmReferenceCodeCache.has(solution)) return acmReferenceCodeCache.get(solution);
  const schema = acmSchemaFor(solution);
  const usesLinked = ["intersection", "cycle"].includes(solution.setup)
    || (solution.argKinds || []).some((kind) => ["listnode", "listnodes"].includes(kind))
    || solution.output === "listnode";
  const usesRandom = (solution.argKinds || []).includes("randomlist") || solution.output === "randomlist";
  const usesTree = solution.setup === "lca" || (solution.argKinds || []).includes("tree")
    || ["tree", "balanced-bst", "flatten"].includes(solution.output);
  const structures = [
    usesLinked ? ACM_REFERENCE_LIST_SUPPORT : "",
    usesRandom ? ACM_REFERENCE_RANDOM_SUPPORT : "",
    usesTree ? ACM_REFERENCE_TREE_SUPPORT : "",
  ].filter(Boolean).join("\n\n");
  const names = schema.kind === "method" ? acmRawArgumentNames(solution, schema.args.length) : [];
  const body = schema.kind === "class" ? acmClassBody(solution, schema) : acmMethodBody(solution, schema, names);
  const code = `${structures ? `${structures}\n\n` : ""}${solution.code}\n\ndef solve():\n${indentPython(body)}\n\nif __name__ == "__main__":\n    solve()\n`;
  acmReferenceCodeCache.set(solution, code);
  return code;
}

function referenceCodeForMode(solution, mode = state.settings.codeMode) {
  return mode === "acm" ? acmReferenceCodeFor(solution) : solution.code;
}

function customCaseTemplateFor() {
  const solution = SOLUTIONS[currentSlug];
  const example = solution.tests[0];
  return state.settings.codeMode === "acm" ? formatAcmCase(example, solution) : JSON.stringify(example, null, 2);
}

function parseCustomCase(source, solution) {
  if (source.length > MAX_CUSTOM_CASE_LENGTH) throw new Error(`内容不能超过 ${MAX_CUSTOM_CASE_LENGTH} 个字符`);
  if (state.settings.codeMode === "acm") {
    return solution.kind === "class" ? parseAcmClassCase(source, solution) : parseAcmMethodCase(source, solution);
  }
  const value = JSON.parse(source);
  if (solution.kind !== "class") {
    if (!Array.isArray(value)) throw new Error("函数题输入需要使用参数数组");
    return value;
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.ops) || !Array.isArray(value.args)) throw new Error("设计题输入需要包含 ops 和 args 数组");
  if (!value.ops.length || value.ops.length !== value.args.length) throw new Error("ops 和 args 必须非空且长度一致");
  if (value.ops[0] !== solution.className || !value.args.every(Array.isArray)) throw new Error(`首个操作必须是 ${solution.className}，且每项参数都必须是数组`);
  return value;
}
