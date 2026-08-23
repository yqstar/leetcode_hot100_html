const pythonHarness = String.raw`
import json, copy, io, math, time, traceback, contextlib
from collections import deque
from typing import *

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

class Node:
    def __init__(self, x=0, next=None, random=None):
        self.val = x
        self.next = next
        self.random = random

def listnode_from(values):
    dummy = tail = ListNode()
    nodes = []
    for value in values:
        tail.next = ListNode(value)
        tail = tail.next
        nodes.append(tail)
    return dummy.next, nodes

def listnodes_from(groups):
    return [listnode_from(values)[0] for values in groups]

def tree_from(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = deque([root])
    index = 1
    while queue and index < len(values):
        node = queue.popleft()
        if index < len(values) and values[index] is not None:
            node.left = TreeNode(values[index])
            queue.append(node.left)
        index += 1
        if index < len(values) and values[index] is not None:
            node.right = TreeNode(values[index])
            queue.append(node.right)
        index += 1
    return root

def tree_nodes(root):
    if not root:
        return []
    result, queue = [], deque([root])
    while queue:
        node = queue.popleft()
        result.append(node)
        if node.left: queue.append(node.left)
        if node.right: queue.append(node.right)
    return result

def find_tree_node(root, value):
    for node in tree_nodes(root):
        if node.val == value:
            return node
    return None

def randomlist_from(values):
    if not values:
        return None
    nodes = [Node(item[0]) for item in values]
    for index, item in enumerate(values):
        if index + 1 < len(nodes):
            nodes[index].next = nodes[index + 1]
        if item[1] is not None:
            nodes[index].random = nodes[item[1]]
    return nodes[0]

def listnode_to_values(head, limit=10000):
    values, seen = [], set()
    while head and len(values) < limit:
        marker = id(head)
        if marker in seen:
            values.append('<cycle>')
            break
        seen.add(marker)
        values.append(head.val)
        head = head.next
    if head and len(values) >= limit:
        values.append('<truncated>')
    return values

def tree_to_values(root):
    if not root:
        return []
    values, queue, seen = [], deque([root]), set()
    while queue and len(values) < 10000:
        node = queue.popleft()
        if node is None:
            values.append(None)
            continue
        if id(node) in seen:
            values.append('<cycle>')
            continue
        seen.add(id(node))
        values.append(node.val)
        queue.append(node.left)
        queue.append(node.right)
    while values and values[-1] is None:
        values.pop()
    return values

def randomlist_to_values(head):
    nodes, seen = [], set()
    cur = head
    while cur and len(nodes) < 10000:
        if id(cur) in seen:
            return ['<cycle>']
        seen.add(id(cur)); nodes.append(cur); cur = cur.next
    index = {id(node): i for i, node in enumerate(nodes)}
    return [[node.val, index.get(id(node.random)) if node.random else None] for node in nodes]

def to_plain(value):
    if isinstance(value, ListNode):
        return listnode_to_values(value)
    if isinstance(value, TreeNode):
        return tree_to_values(value)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(key): to_plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_plain(item) for item in value]
    if isinstance(value, set):
        return sorted([to_plain(item) for item in value], key=json_key)
    if hasattr(value, 'to_py'):
        return to_plain(value.to_py())
    return repr(value)

def json_key(value):
    return json.dumps(to_plain(value), ensure_ascii=False, sort_keys=True)

def setup_case(meta, raw_case):
    raw_case = copy.deepcopy(raw_case)
    context = {}
    setup = meta.get('setup')
    if setup == 'intersection':
        prefix_a, prefix_b, shared_values = raw_case
        shared, shared_nodes = listnode_from(shared_values)
        head_a, nodes_a = listnode_from(prefix_a)
        head_b, nodes_b = listnode_from(prefix_b)
        if nodes_a: nodes_a[-1].next = shared
        else: head_a = shared
        if nodes_b: nodes_b[-1].next = shared
        else: head_b = shared
        context['nodes'] = shared_nodes + nodes_a + nodes_b
        return [head_a, head_b], context
    if setup == 'cycle':
        values, position = raw_case
        head, nodes = listnode_from(values)
        if nodes and position >= 0:
            nodes[-1].next = nodes[position]
        context['nodes'] = nodes
        return [head], context
    if setup == 'lca':
        values, p_value, q_value = raw_case
        root = tree_from(values)
        context['nodes'] = tree_nodes(root)
        return [root, find_tree_node(root, p_value), find_tree_node(root, q_value)], context

    kinds = meta.get('argKinds') or []
    args = []
    for index, value in enumerate(raw_case):
        kind = kinds[index] if index < len(kinds) else 'normal'
        if kind == 'listnode':
            args.append(listnode_from(value)[0])
        elif kind == 'listnodes':
            args.append(listnodes_from(value))
        elif kind == 'tree':
            args.append(tree_from(value))
        elif kind == 'randomlist':
            head = randomlist_from(value)
            args.append(head)
            original_ids = context.setdefault('originalRandomNodeIds', set())
            current = head
            while current and id(current) not in original_ids:
                original_ids.add(id(current))
                current = current.next
        else:
            args.append(value)
    return args, context

def is_balanced_bst(root):
    inorder = []
    def walk(node):
        if not node: return 0, True
        left_h, left_ok = walk(node.left)
        inorder.append(node.val)
        right_h, right_ok = walk(node.right)
        return 1 + max(left_h, right_h), left_ok and right_ok and abs(left_h - right_h) <= 1
    _, balanced = walk(root)
    return {'inorder': inorder, 'balanced': balanced}

def normalize(result, meta, args, context, raw_case):
    output = meta.get('output', 'default')
    if output == 'mutated':
        return to_plain(args[meta.get('mutationArg', 0)])
    if output == 'listnode':
        return listnode_to_values(result)
    if output == 'tree':
        return tree_to_values(result)
    if output == 'randomlist':
        original_ids = context.get('originalRandomNodeIds', set())
        current, distinct, seen = result, True, set()
        while current and id(current) not in seen:
            seen.add(id(current))
            if id(current) in original_ids: distinct = False
            current = current.next
        return {'values': randomlist_to_values(result), 'distinct': distinct}
    if output == 'node-index':
        if result is None: return -1
        for index, node in enumerate(context.get('nodes', [])):
            if result is node: return index
        return -2
    if output == 'node-value':
        return result.val if result else None
    if output == 'flatten':
        root = args[meta.get('mutationArg', 0)]
        values, seen, valid = [], set(), True
        while root and len(values) < 10000:
            if id(root) in seen or root.left is not None:
                valid = False; break
            seen.add(id(root)); values.append(root.val); root = root.right
        return {'valid': valid, 'values': values}
    if output == 'balanced-bst':
        return is_balanced_bst(result)
    if output == 'groups':
        groups = [sorted(to_plain(group), key=json_key) for group in result]
        return sorted(groups, key=json_key)
    if output == 'rows':
        return sorted(to_plain(result), key=json_key)
    if output == 'rows-sorted':
        rows = [sorted(to_plain(row), key=json_key) for row in result]
        return sorted(rows, key=json_key)
    if output == 'unordered':
        return sorted(to_plain(result), key=json_key)
    if output == 'sorted':
        return sorted(to_plain(result), key=json_key)
    if output == 'palindrome':
        source = raw_case[0]
        valid = isinstance(result, str) and result == result[::-1] and result in source
        return {'valid': valid, 'length': len(result) if isinstance(result, str) else -1}
    return to_plain(result)

def namespace():
    return {
        '__name__': '__main__',
        'ListNode': ListNode, 'TreeNode': TreeNode, 'Node': Node,
        'List': List, 'Optional': Optional, 'Dict': Dict, 'Set': Set,
        'Tuple': Tuple, 'Deque': Deque, 'Any': Any,
    }

def execute(source, meta, raw_case):
    ns = namespace()
    args, context = setup_case(meta, raw_case)
    output_buffer = io.StringIO()
    with contextlib.redirect_stdout(output_buffer):
        exec(source, ns)
        if meta.get('kind') == 'class':
            instance = None
            outputs = []
            for index, (operation, operation_args) in enumerate(zip(raw_case['ops'], raw_case['args'])):
                if index == 0:
                    instance = ns[meta['className']](*operation_args)
                    outputs.append(None)
                else:
                    outputs.append(to_plain(getattr(instance, operation)(*operation_args)))
            result = outputs
        else:
            solution = ns['Solution']()
            result = getattr(solution, meta['method'])(*args)
    normalized = normalize(result, meta, args, context, raw_case)
    return normalized, output_buffer.getvalue()

def values_equal(actual, expected, output):
    if output == 'float':
        try:
            return math.isclose(float(actual), float(expected), rel_tol=1e-9, abs_tol=1e-9)
        except Exception:
            return False
    return actual == expected

def safe_display(value):
    text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    return text if len(text) <= 5000 else text[:5000] + '…'

def run_payload(payload):
    meta = payload['meta']
    results = []
    for item in payload['cases']:
        raw_case = item['value']
        started = time.perf_counter()
        try:
            expected, _ = execute(payload['referenceCode'], meta, raw_case)
        except Exception:
            return {'fatal': '内置参考实现执行失败', 'detail': traceback.format_exc()}
        try:
            actual, stdout = execute(payload['userCode'], meta, raw_case)
            passed = values_equal(actual, expected, meta.get('output', 'default'))
            error = None
        except Exception:
            actual, stdout, passed = None, '', False
            error = traceback.format_exc(limit=8)
        results.append({
            'index': item['index'], 'visible': item.get('visible', False),
            'passed': passed, 'input': safe_display(to_plain(raw_case)),
            'expected': safe_display(expected), 'actual': safe_display(actual),
            'stdout': stdout[-4000:], 'error': error,
            'durationMs': round((time.perf_counter() - started) * 1000, 2),
        })
    return {'results': results, 'passed': all(item['passed'] for item in results)}

RESULT_JSON = json.dumps(run_payload(json.loads(payload_json)), ensure_ascii=False)
`;

export default pythonHarness;
