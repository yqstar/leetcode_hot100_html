const S = (method, note, complexity, code, tests, options = {}) => ({
  method, note, complexity, code, tests, kind: "method", output: "default", ...options,
});

const solutions = {
  "two-sum": S("twoSum", "一次遍历数组，用哈希表记录已经出现的数字及其下标；若 target - x 已出现，就找到了答案。", "时间 O(n)，空间 O(n)", String.raw`class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:
                return [seen[target - x], i]
            seen[x] = i`, [
    [[2, 7, 11, 15], 9], [[3, 2, 4], 6], [[3, 3], 6], [[-3, 4, 3, 90], 0],
  ], { output: "sorted" }),

  "group-anagrams": S("groupAnagrams", "将每个字符串排序后的结果作为哈希键，相同键的字符串自然落到同一组。", "时间 O(n·k log k)，空间 O(nk)", String.raw`class Solution:
    def groupAnagrams(self, strs):
        from collections import defaultdict
        groups = defaultdict(list)
        for s in strs:
            groups[''.join(sorted(s))].append(s)
        return list(groups.values())`, [
    [["eat", "tea", "tan", "ate", "nat", "bat"]], [[""]], [["a"]], [["ab", "ba", "abc", "cab", "bca"]],
  ], { output: "groups" }),

  "longest-consecutive-sequence": S("longestConsecutive", "把所有数字放入集合，只从不存在前驱 x-1 的数字开始向后扩展，每个数字最多访问一次。", "时间 O(n)，空间 O(n)", String.raw`class Solution:
    def longestConsecutive(self, nums):
        values = set(nums)
        best = 0
        for x in values:
            if x - 1 not in values:
                y = x
                while y in values:
                    y += 1
                best = max(best, y - x)
        return best`, [
    [[100, 4, 200, 1, 3, 2]], [[0, 3, 7, 2, 5, 8, 4, 6, 0, 1]], [[]], [[1, 2, 0, 1]],
  ]),

  "move-zeroes": S("moveZeroes", "用写指针压缩所有非零元素，再将剩余位置补零，保持非零元素的相对顺序。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def moveZeroes(self, nums):
        write = 0
        for x in nums:
            if x != 0:
                nums[write] = x
                write += 1
        nums[write:] = [0] * (len(nums) - write)`, [
    [[0, 1, 0, 3, 12]], [[0]], [[1, 2, 3]], [[0, 0, 1]],
  ], { output: "mutated" }),

  "container-with-most-water": S("maxArea", "左右指针从两端开始。面积受短板限制，因此每次移动较短的一侧，才可能获得更大的有效高度。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def maxArea(self, height):
        left, right, ans = 0, len(height) - 1, 0
        while left < right:
            ans = max(ans, (right - left) * min(height[left], height[right]))
            if height[left] <= height[right]:
                left += 1
            else:
                right -= 1
        return ans`, [
    [[1, 8, 6, 2, 5, 4, 8, 3, 7]], [[1, 1]], [[4, 3, 2, 1, 4]], [[1, 2, 1]],
  ]),

  "3sum": S("threeSum", "先排序，固定第一个数后用左右指针寻找另外两个数，并跳过重复值。", "时间 O(n²)，排序外空间 O(1)", String.raw`class Solution:
    def threeSum(self, nums):
        nums.sort()
        ans = []
        for i in range(len(nums) - 2):
            if i and nums[i] == nums[i - 1]:
                continue
            left, right = i + 1, len(nums) - 1
            while left < right:
                total = nums[i] + nums[left] + nums[right]
                if total < 0:
                    left += 1
                elif total > 0:
                    right -= 1
                else:
                    ans.append([nums[i], nums[left], nums[right]])
                    left += 1; right -= 1
                    while left < right and nums[left] == nums[left - 1]: left += 1
                    while left < right and nums[right] == nums[right + 1]: right -= 1
        return ans`, [
    [[-1, 0, 1, 2, -1, -4]], [[0, 1, 1]], [[0, 0, 0]], [[-2, 0, 1, 1, 2]],
  ], { output: "rows-sorted" }),

  "trapping-rain-water": S("trap", "维护左右最高挡板。较低一侧的接水量已经确定，累加该侧挡板与当前高度的差。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def trap(self, height):
        left, right = 0, len(height) - 1
        left_max = right_max = ans = 0
        while left <= right:
            if left_max <= right_max:
                left_max = max(left_max, height[left])
                ans += left_max - height[left]
                left += 1
            else:
                right_max = max(right_max, height[right])
                ans += right_max - height[right]
                right -= 1
        return ans`, [
    [[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]], [[4, 2, 0, 3, 2, 5]], [[]], [[2, 0, 2]],
  ]),

  "longest-substring-without-repeating-characters": S("lengthOfLongestSubstring", "滑动窗口记录字符上次出现位置；重复时直接移动左边界到安全位置。", "时间 O(n)，空间 O(字符集)", String.raw`class Solution:
    def lengthOfLongestSubstring(self, s):
        last = {}
        left = ans = 0
        for right, ch in enumerate(s):
            left = max(left, last.get(ch, -1) + 1)
            last[ch] = right
            ans = max(ans, right - left + 1)
        return ans`, [
    ["abcabcbb"], ["bbbbb"], ["pwwkew"], [""], ["abba"],
  ]),

  "find-all-anagrams-in-a-string": S("findAnagrams", "维护固定长度窗口的字符计数，窗口每次右移时增减两个字符。", "时间 O(n)，空间 O(字符集)", String.raw`class Solution:
    def findAnagrams(self, s, p):
        from collections import Counter
        need = Counter(p)
        window = Counter(s[:len(p)])
        ans = [0] if window == need else []
        for right in range(len(p), len(s)):
            window[s[right]] += 1
            left_ch = s[right - len(p)]
            window[left_ch] -= 1
            if window[left_ch] == 0: del window[left_ch]
            if window == need: ans.append(right - len(p) + 1)
        return ans`, [
    ["cbaebabacd", "abc"], ["abab", "ab"], ["baa", "aa"], ["abc", "d"],
  ]),

  "subarray-sum-equals-k": S("subarraySum", "前缀和为 s 时，之前出现过多少个 s-k，就有多少个以当前位置结尾的合法子数组。", "时间 O(n)，空间 O(n)", String.raw`class Solution:
    def subarraySum(self, nums, k):
        count = {0: 1}
        prefix = ans = 0
        for x in nums:
            prefix += x
            ans += count.get(prefix - k, 0)
            count[prefix] = count.get(prefix, 0) + 1
        return ans`, [
    [[1, 1, 1], 2], [[1, 2, 3], 3], [[1, -1, 0], 0], [[-1, -1, 1], 0],
  ]),

  "sliding-window-maximum": S("maxSlidingWindow", "单调递减队列保存仍在窗口内的候选下标，队首始终是窗口最大值。", "时间 O(n)，空间 O(k)", String.raw`class Solution:
    def maxSlidingWindow(self, nums, k):
        from collections import deque
        q, ans = deque(), []
        for i, x in enumerate(nums):
            while q and nums[q[-1]] <= x: q.pop()
            q.append(i)
            if q[0] <= i - k: q.popleft()
            if i >= k - 1: ans.append(nums[q[0]])
        return ans`, [
    [[1, 3, -1, -3, 5, 3, 6, 7], 3], [[1], 1], [[9, 11], 2], [[4, -2], 1],
  ]),

  "minimum-window-substring": S("minWindow", "用计数器维护需求，右边界纳入字符；全部满足后不断收缩左边界并更新最短窗口。", "时间 O(n)，空间 O(字符集)", String.raw`class Solution:
    def minWindow(self, s, t):
        from collections import Counter
        need = Counter(t)
        missing = len(t)
        left = start = 0
        best = float('inf')
        for right, ch in enumerate(s):
            if need[ch] > 0: missing -= 1
            need[ch] -= 1
            while missing == 0:
                if right - left + 1 < best:
                    start, best = left, right - left + 1
                out = s[left]; need[out] += 1; left += 1
                if need[out] > 0: missing += 1
        return '' if best == float('inf') else s[start:start + best]`, [
    ["ADOBECODEBANC", "ABC"], ["a", "a"], ["a", "aa"], ["aa", "aa"],
  ]),

  "maximum-subarray": S("maxSubArray", "Kadane 算法：当前位置的最优连续和，要么接在前一段后面，要么从当前元素重新开始。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def maxSubArray(self, nums):
        current = best = nums[0]
        for x in nums[1:]:
            current = max(x, current + x)
            best = max(best, current)
        return best`, [
    [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], [[1]], [[5, 4, -1, 7, 8]], [[-3, -2, -5]],
  ]),

  "merge-intervals": S("merge", "按左端点排序；若新区间与结果末尾重叠，就扩展右端点，否则直接追加。", "时间 O(n log n)，空间 O(n)", String.raw`class Solution:
    def merge(self, intervals):
        intervals.sort()
        ans = []
        for left, right in intervals:
            if not ans or ans[-1][1] < left:
                ans.append([left, right])
            else:
                ans[-1][1] = max(ans[-1][1], right)
        return ans`, [
    [[[1, 3], [2, 6], [8, 10], [15, 18]]], [[[1, 4], [4, 5]]], [[[1, 4], [0, 4]]], [[[1, 4], [2, 3]]],
  ]),

  "rotate-array": S("rotate", "将整个数组翻转，再分别翻转前 k 个和剩余部分，即可原地完成右轮转。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def rotate(self, nums, k):
        k %= len(nums)
        nums.reverse()
        nums[:k] = reversed(nums[:k])
        nums[k:] = reversed(nums[k:])`, [
    [[1, 2, 3, 4, 5, 6, 7], 3], [[-1, -100, 3, 99], 2], [[1], 5], [[1, 2], 0],
  ], { output: "mutated" }),

  "product-of-array-except-self": S("productExceptSelf", "先写入每个位置左侧元素的乘积，再从右向左乘上右侧乘积。", "时间 O(n)，额外空间 O(1)", String.raw`class Solution:
    def productExceptSelf(self, nums):
        ans = [1] * len(nums)
        prefix = 1
        for i, x in enumerate(nums):
            ans[i] = prefix
            prefix *= x
        suffix = 1
        for i in range(len(nums) - 1, -1, -1):
            ans[i] *= suffix
            suffix *= nums[i]
        return ans`, [
    [[1, 2, 3, 4]], [[-1, 1, 0, -3, 3]], [[2, 3]], [[0, 0]],
  ]),

  "first-missing-positive": S("firstMissingPositive", "把值 x 交换到下标 x-1；归位结束后，第一个 nums[i] != i+1 的位置就是答案。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def firstMissingPositive(self, nums):
        n = len(nums)
        for i in range(n):
            while 1 <= nums[i] <= n and nums[nums[i] - 1] != nums[i]:
                j = nums[i] - 1
                nums[i], nums[j] = nums[j], nums[i]
        for i, x in enumerate(nums):
            if x != i + 1: return i + 1
        return n + 1`, [
    [[1, 2, 0]], [[3, 4, -1, 1]], [[7, 8, 9, 11, 12]], [[1]], [[2, 2]],
  ]),

  "set-matrix-zeroes": S("setZeroes", "使用首行和首列充当标记数组，另存首列是否需要清零，最后反向写回。", "时间 O(mn)，空间 O(1)", String.raw`class Solution:
    def setZeroes(self, matrix):
        rows, cols = len(matrix), len(matrix[0])
        first_col = any(matrix[r][0] == 0 for r in range(rows))
        for r in range(rows):
            for c in range(1, cols):
                if matrix[r][c] == 0:
                    matrix[r][0] = matrix[0][c] = 0
        for r in range(rows - 1, -1, -1):
            for c in range(1, cols):
                if matrix[r][0] == 0 or matrix[0][c] == 0:
                    matrix[r][c] = 0
            if first_col: matrix[r][0] = 0`, [
    [[[1, 1, 1], [1, 0, 1], [1, 1, 1]]], [[[0, 1, 2, 0], [3, 4, 5, 2], [1, 3, 1, 5]]], [[[1, 0]]], [[[1], [0], [3]]],
  ], { output: "mutated" }),

  "spiral-matrix": S("spiralOrder", "逐层维护上、下、左、右边界，按右、下、左、上的顺序遍历并收缩边界。", "时间 O(mn)，空间 O(1)，不计答案", String.raw`class Solution:
    def spiralOrder(self, matrix):
        top, bottom, left, right = 0, len(matrix) - 1, 0, len(matrix[0]) - 1
        ans = []
        while top <= bottom and left <= right:
            ans.extend(matrix[top][left:right + 1]); top += 1
            for r in range(top, bottom + 1): ans.append(matrix[r][right])
            right -= 1
            if top <= bottom:
                ans.extend(reversed(matrix[bottom][left:right + 1])); bottom -= 1
            if left <= right:
                for r in range(bottom, top - 1, -1): ans.append(matrix[r][left])
                left += 1
        return ans`, [
    [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]], [[[1]]], [[[1, 2, 3]]],
  ]),

  "rotate-image": S("rotate", "先沿主对角线转置矩阵，再反转每一行，得到顺时针旋转 90° 的结果。", "时间 O(n²)，空间 O(1)", String.raw`class Solution:
    def rotate(self, matrix):
        n = len(matrix)
        for r in range(n):
            for c in range(r + 1, n):
                matrix[r][c], matrix[c][r] = matrix[c][r], matrix[r][c]
        for row in matrix: row.reverse()`, [
    [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], [[[5, 1, 9, 11], [2, 4, 8, 10], [13, 3, 6, 7], [15, 14, 12, 16]]], [[[1]]], [[[1, 2], [3, 4]]],
  ], { output: "mutated" }),

  "search-a-2d-matrix-ii": S("searchMatrix", "从右上角开始：当前值太大就左移，太小就下移，每一步排除一行或一列。", "时间 O(m+n)，空间 O(1)", String.raw`class Solution:
    def searchMatrix(self, matrix, target):
        r, c = 0, len(matrix[0]) - 1
        while r < len(matrix) and c >= 0:
            if matrix[r][c] == target: return True
            if matrix[r][c] > target: c -= 1
            else: r += 1
        return False`, [
    [[[1, 4, 7, 11, 15], [2, 5, 8, 12, 19], [3, 6, 9, 16, 22], [10, 13, 14, 17, 24], [18, 21, 23, 26, 30]], 5], [[[1, 4], [2, 5]], 3], [[[1]], 1], [[[1]], 0],
  ]),

  "intersection-of-two-linked-lists": S("getIntersectionNode", "让两个指针分别走完 A+B 与 B+A；若链表相交，它们会在相交节点同步。", "时间 O(m+n)，空间 O(1)", String.raw`class Solution:
    def getIntersectionNode(self, headA, headB):
        a, b = headA, headB
        while a is not b:
            a = a.next if a else headB
            b = b.next if b else headA
        return a`, [
    [[4, 1], [5, 6, 1], [8, 4, 5]], [[1, 9, 1], [3], [2, 4]], [[2, 6, 4], [1, 5], []], [[], [], [1, 2]],
  ], { setup: "intersection", output: "node-index" }),

  "reverse-linked-list": S("reverseList", "遍历链表，依次把当前节点的 next 指向前驱节点。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def reverseList(self, head):
        prev = None
        while head:
            nxt = head.next
            head.next = prev
            prev, head = head, nxt
        return prev`, [
    [[1, 2, 3, 4, 5]], [[1, 2]], [[]], [[1]],
  ], { argKinds: ["listnode"], output: "listnode" }),

  "palindrome-linked-list": S("isPalindrome", "找到中点并反转后半段，再逐个比较前后两半节点。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def isPalindrome(self, head):
        slow = fast = head
        while fast and fast.next:
            slow, fast = slow.next, fast.next.next
        prev = None
        while slow:
            slow.next, prev, slow = prev, slow, slow.next
        while prev:
            if head.val != prev.val: return False
            head, prev = head.next, prev.next
        return True`, [
    [[1, 2, 2, 1]], [[1, 2]], [[1]], [[1, 2, 3, 2, 1]],
  ], { argKinds: ["listnode"] }),

  "linked-list-cycle": S("hasCycle", "快慢指针同时出发；若存在环，快指针最终会在环内追上慢指针。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def hasCycle(self, head):
        slow = fast = head
        while fast and fast.next:
            slow, fast = slow.next, fast.next.next
            if slow is fast: return True
        return False`, [
    [[3, 2, 0, -4], 1], [[1, 2], 0], [[1], -1], [[], -1],
  ], { setup: "cycle" }),

  "linked-list-cycle-ii": S("detectCycle", "快慢指针相遇后，将一个指针移回头节点；两者再同速前进，相遇点就是环入口。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def detectCycle(self, head):
        slow = fast = head
        while fast and fast.next:
            slow, fast = slow.next, fast.next.next
            if slow is fast:
                slow = head
                while slow is not fast:
                    slow, fast = slow.next, fast.next
                return slow
        return None`, [
    [[3, 2, 0, -4], 1], [[1, 2], 0], [[1], -1], [[], -1],
  ], { setup: "cycle", output: "node-index" }),

  "merge-two-sorted-lists": S("mergeTwoLists", "使用虚拟头节点，每次连接两个链表中较小的当前节点。", "时间 O(m+n)，空间 O(1)", String.raw`class Solution:
    def mergeTwoLists(self, list1, list2):
        dummy = tail = ListNode()
        while list1 and list2:
            if list1.val <= list2.val:
                tail.next, list1 = list1, list1.next
            else:
                tail.next, list2 = list2, list2.next
            tail = tail.next
        tail.next = list1 or list2
        return dummy.next`, [
    [[1, 2, 4], [1, 3, 4]], [[], []], [[], [0]], [[-2, 5], [-1, 3, 7]],
  ], { argKinds: ["listnode", "listnode"], output: "listnode" }),

  "add-two-numbers": S("addTwoNumbers", "同步遍历两个逆序链表，逐位相加并维护进位。", "时间 O(max(m,n))，空间 O(max(m,n))", String.raw`class Solution:
    def addTwoNumbers(self, l1, l2):
        dummy = tail = ListNode()
        carry = 0
        while l1 or l2 or carry:
            total = carry + (l1.val if l1 else 0) + (l2.val if l2 else 0)
            carry, digit = divmod(total, 10)
            tail.next = ListNode(digit); tail = tail.next
            l1 = l1.next if l1 else None
            l2 = l2.next if l2 else None
        return dummy.next`, [
    [[2, 4, 3], [5, 6, 4]], [[0], [0]], [[9, 9, 9, 9, 9, 9, 9], [9, 9, 9, 9]], [[5], [5]],
  ], { argKinds: ["listnode", "listnode"], output: "listnode" }),

  "remove-nth-node-from-end-of-list": S("removeNthFromEnd", "快指针先走 n 步，再让快慢指针同步前进；慢指针最终停在待删除节点的前一个位置。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def removeNthFromEnd(self, head, n):
        dummy = ListNode(0, head)
        fast = slow = dummy
        for _ in range(n): fast = fast.next
        while fast.next:
            fast, slow = fast.next, slow.next
        slow.next = slow.next.next
        return dummy.next`, [
    [[1, 2, 3, 4, 5], 2], [[1], 1], [[1, 2], 1], [[1, 2], 2],
  ], { argKinds: ["listnode", "normal"], output: "listnode" }),

  "swap-nodes-in-pairs": S("swapPairs", "用虚拟头节点，每次调整 prev、first、second 三个局部指针，交换相邻节点。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def swapPairs(self, head):
        dummy = ListNode(0, head)
        prev = dummy
        while prev.next and prev.next.next:
            first, second = prev.next, prev.next.next
            first.next = second.next
            second.next = first
            prev.next = second
            prev = first
        return dummy.next`, [
    [[1, 2, 3, 4]], [[]], [[1]], [[1, 2, 3]],
  ], { argKinds: ["listnode"], output: "listnode" }),

  "reverse-nodes-in-k-group": S("reverseKGroup", "每次先确认剩余节点足够 k 个，再原地反转这一段并连接前后链表。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def reverseKGroup(self, head, k):
        dummy = ListNode(0, head)
        group_prev = dummy
        while True:
            kth = group_prev
            for _ in range(k):
                kth = kth.next
                if not kth: return dummy.next
            group_next = kth.next
            prev, cur = group_next, group_prev.next
            while cur is not group_next:
                cur.next, prev, cur = prev, cur, cur.next
            old_start = group_prev.next
            group_prev.next = kth
            group_prev = old_start`, [
    [[1, 2, 3, 4, 5], 2], [[1, 2, 3, 4, 5], 3], [[1], 1], [[1, 2], 3],
  ], { argKinds: ["listnode", "normal"], output: "listnode" }),

  "copy-list-with-random-pointer": S("copyRandomList", "先在每个原节点后插入复制节点，再设置随机指针，最后拆分两条链表。", "时间 O(n)，空间 O(1)，不计返回链表", String.raw`class Solution:
    def copyRandomList(self, head):
        cur = head
        while cur:
            cur.next = Node(cur.val, cur.next)
            cur = cur.next.next
        cur = head
        while cur:
            if cur.random: cur.next.random = cur.random.next
            cur = cur.next.next
        dummy = tail = Node(0)
        cur = head
        while cur:
            copy = cur.next
            cur.next = copy.next
            tail.next = copy; tail = copy
            cur = cur.next
        return dummy.next`, [
    [[[7, null], [13, 0], [11, 4], [10, 2], [1, 0]]], [[[1, 1], [2, 1]]], [[[3, null], [3, 0], [3, null]]], [[]],
  ], { argKinds: ["randomlist"], output: "randomlist" }),

  "sort-list": S("sortList", "归并排序天然适合链表：快慢指针切半，递归排序两半，再线性合并。", "时间 O(n log n)，递归栈 O(log n)", String.raw`class Solution:
    def sortList(self, head):
        if not head or not head.next: return head
        slow, fast = head, head.next
        while fast and fast.next:
            slow, fast = slow.next, fast.next.next
        mid = slow.next; slow.next = None
        a, b = self.sortList(head), self.sortList(mid)
        dummy = tail = ListNode()
        while a and b:
            if a.val <= b.val: tail.next, a = a, a.next
            else: tail.next, b = b, b.next
            tail = tail.next
        tail.next = a or b
        return dummy.next`, [
    [[4, 2, 1, 3]], [[-1, 5, 3, 4, 0]], [[]], [[1]],
  ], { argKinds: ["listnode"], output: "listnode" }),

  "merge-k-sorted-lists": S("mergeKLists", "把每条链表的头节点放入最小堆，每取出一个节点后再压入它的后继。", "时间 O(N log k)，空间 O(k)", String.raw`class Solution:
    def mergeKLists(self, lists):
        import heapq
        heap = []
        for i, node in enumerate(lists):
            if node: heapq.heappush(heap, (node.val, i, node))
        dummy = tail = ListNode()
        while heap:
            _, i, node = heapq.heappop(heap)
            tail.next = node; tail = node
            if node.next: heapq.heappush(heap, (node.next.val, i, node.next))
        return dummy.next`, [
    [[[1, 4, 5], [1, 3, 4], [2, 6]]], [[]], [[[], [1]]], [[[-2, 4], [-3, 5], []]],
  ], { argKinds: ["listnodes"], output: "listnode" }),

  "lru-cache": S(null, "哈希表提供 O(1) 定位，双向链表维护最近使用顺序；访问后移到头部，超容量时删除尾部。", "get/put 平均 O(1)，空间 O(capacity)", String.raw`class Node:
    def __init__(self, key=0, value=0):
        self.key, self.value = key, value
        self.prev = self.next = None

class LRUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self.cache = {}
        self.head, self.tail = Node(), Node()
        self.head.next, self.tail.prev = self.tail, self.head
    def _remove(self, node):
        node.prev.next, node.next.prev = node.next, node.prev
    def _add(self, node):
        node.next, node.prev = self.head.next, self.head
        self.head.next.prev = node
        self.head.next = node
    def get(self, key):
        if key not in self.cache: return -1
        node = self.cache[key]
        self._remove(node); self._add(node)
        return node.value
    def put(self, key, value):
        if key in self.cache:
            self._remove(self.cache[key])
        node = Node(key, value)
        self.cache[key] = node; self._add(node)
        if len(self.cache) > self.capacity:
            old = self.tail.prev
            self._remove(old); del self.cache[old.key]`, [
    { ops: ["LRUCache", "put", "put", "get", "put", "get", "put", "get", "get", "get"], args: [[2], [1, 1], [2, 2], [1], [3, 3], [2], [4, 4], [1], [3], [4]] },
    { ops: ["LRUCache", "put", "get", "put", "get", "get"], args: [[1], [2, 1], [2], [3, 2], [2], [3]] },
    { ops: ["LRUCache", "put", "put", "get", "get"], args: [[2], [2, 1], [2, 2], [2], [1]] },
  ], { kind: "class", className: "LRUCache" }),

  "binary-tree-inorder-traversal": S("inorderTraversal", "显式栈模拟递归：一路压入左子树，弹出访问后再转向右子树。", "时间 O(n)，空间 O(h)", String.raw`class Solution:
    def inorderTraversal(self, root):
        ans, stack = [], []
        while root or stack:
            while root:
                stack.append(root); root = root.left
            root = stack.pop(); ans.append(root.val)
            root = root.right
        return ans`, [
    [[1, null, 2, 3]], [[]], [[1]], [[1, 2, 3, 4, 5]],
  ], { argKinds: ["tree"] }),

  "maximum-depth-of-binary-tree": S("maxDepth", "递归计算左右子树最大深度，当前深度为两者最大值加一。", "时间 O(n)，递归栈 O(h)", String.raw`class Solution:
    def maxDepth(self, root):
        if not root: return 0
        return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))`, [
    [[3, 9, 20, null, null, 15, 7]], [[1, null, 2]], [[]], [[1]],
  ], { argKinds: ["tree"] }),

  "invert-binary-tree": S("invertTree", "递归交换每个节点的左右子树。", "时间 O(n)，递归栈 O(h)", String.raw`class Solution:
    def invertTree(self, root):
        if root:
            root.left, root.right = self.invertTree(root.right), self.invertTree(root.left)
        return root`, [
    [[4, 2, 7, 1, 3, 6, 9]], [[2, 1, 3]], [[]], [[1]],
  ], { argKinds: ["tree"], output: "tree" }),

  "symmetric-tree": S("isSymmetric", "递归比较两棵镜像子树：节点值相等，且左的左对应右的右、左的右对应右的左。", "时间 O(n)，递归栈 O(h)", String.raw`class Solution:
    def isSymmetric(self, root):
        def mirror(a, b):
            if not a or not b: return a is b
            return a.val == b.val and mirror(a.left, b.right) and mirror(a.right, b.left)
        return mirror(root.left, root.right) if root else True`, [
    [[1, 2, 2, 3, 4, 4, 3]], [[1, 2, 2, null, 3, null, 3]], [[]], [[1]],
  ], { argKinds: ["tree"] }),

  "diameter-of-binary-tree": S("diameterOfBinaryTree", "后序遍历计算子树高度；经过当前节点的最长路径为左右高度之和。", "时间 O(n)，递归栈 O(h)", String.raw`class Solution:
    def diameterOfBinaryTree(self, root):
        ans = 0
        def depth(node):
            nonlocal ans
            if not node: return 0
            left, right = depth(node.left), depth(node.right)
            ans = max(ans, left + right)
            return 1 + max(left, right)
        depth(root)
        return ans`, [
    [[1, 2, 3, 4, 5]], [[1, 2]], [[1]], [[]],
  ], { argKinds: ["tree"] }),

  "binary-tree-level-order-traversal": S("levelOrder", "广度优先搜索，按当前队列长度一次处理完整的一层。", "时间 O(n)，空间 O(n)", String.raw`class Solution:
    def levelOrder(self, root):
        if not root: return []
        from collections import deque
        q, ans = deque([root]), []
        while q:
            level = []
            for _ in range(len(q)):
                node = q.popleft(); level.append(node.val)
                if node.left: q.append(node.left)
                if node.right: q.append(node.right)
            ans.append(level)
        return ans`, [
    [[3, 9, 20, null, null, 15, 7]], [[1]], [[]], [[1, 2, 3, 4, null, null, 5]],
  ], { argKinds: ["tree"] }),

  "convert-sorted-array-to-binary-search-tree": S("sortedArrayToBST", "每次选择区间中点作为根，递归构造左右半区，可天然保持高度平衡。", "时间 O(n)，递归栈 O(log n)", String.raw`class Solution:
    def sortedArrayToBST(self, nums):
        def build(left, right):
            if left > right: return None
            mid = (left + right) // 2
            root = TreeNode(nums[mid])
            root.left = build(left, mid - 1)
            root.right = build(mid + 1, right)
            return root
        return build(0, len(nums) - 1)`, [
    [[-10, -3, 0, 5, 9]], [[1, 3]], [[1]], [[]],
  ], { output: "balanced-bst" }),

  "validate-binary-search-tree": S("isValidBST", "中序遍历二叉搜索树应严格递增；记录上一个访问值即可验证。", "时间 O(n)，空间 O(h)", String.raw`class Solution:
    def isValidBST(self, root):
        stack, prev = [], None
        while root or stack:
            while root:
                stack.append(root); root = root.left
            root = stack.pop()
            if prev is not None and root.val <= prev: return False
            prev = root.val; root = root.right
        return True`, [
    [[2, 1, 3]], [[5, 1, 4, null, null, 3, 6]], [[2, 2, 2]], [[]],
  ], { argKinds: ["tree"] }),

  "kth-smallest-element-in-a-bst": S("kthSmallest", "中序遍历二叉搜索树会得到递增序列，访问到第 k 个节点即可返回。", "时间 O(h+k)，空间 O(h)", String.raw`class Solution:
    def kthSmallest(self, root, k):
        stack = []
        while True:
            while root:
                stack.append(root); root = root.left
            root = stack.pop(); k -= 1
            if k == 0: return root.val
            root = root.right`, [
    [[3, 1, 4, null, 2], 1], [[5, 3, 6, 2, 4, null, null, 1], 3], [[1], 1], [[2, 1, 3], 3],
  ], { argKinds: ["tree", "normal"] }),

  "binary-tree-right-side-view": S("rightSideView", "按层遍历，每层最后访问的节点就是从右侧看到的节点。", "时间 O(n)，空间 O(n)", String.raw`class Solution:
    def rightSideView(self, root):
        if not root: return []
        from collections import deque
        q, ans = deque([root]), []
        while q:
            level_size = len(q)
            for i in range(level_size):
                node = q.popleft()
                if node.left: q.append(node.left)
                if node.right: q.append(node.right)
                if i == level_size - 1: ans.append(node.val)
        return ans`, [
    [[1, 2, 3, null, 5, null, 4]], [[1, 2, 3, 4, null, null, null, 5]], [[1]], [[]],
  ], { argKinds: ["tree"] }),

  "flatten-binary-tree-to-linked-list": S("flatten", "反向先序遍历（右、左、根），让当前节点的 right 指向上一个处理节点，并清空 left。", "时间 O(n)，递归栈 O(h)", String.raw`class Solution:
    def flatten(self, root):
        prev = None
        def visit(node):
            nonlocal prev
            if not node: return
            visit(node.right); visit(node.left)
            node.right = prev; node.left = None; prev = node
        visit(root)`, [
    [[1, 2, 5, 3, 4, null, 6]], [[]], [[0]], [[1, 2, null, 3]],
  ], { argKinds: ["tree"], output: "flatten" }),

  "construct-binary-tree-from-preorder-and-inorder-traversal": S("buildTree", "前序首元素是根；用哈希表在中序中定位根，再按左右子树长度递归切分。", "时间 O(n)，空间 O(n)", String.raw`class Solution:
    def buildTree(self, preorder, inorder):
        pos = {x: i for i, x in enumerate(inorder)}
        index = 0
        def build(left, right):
            nonlocal index
            if left > right: return None
            value = preorder[index]; index += 1
            root = TreeNode(value)
            mid = pos[value]
            root.left = build(left, mid - 1)
            root.right = build(mid + 1, right)
            return root
        return build(0, len(inorder) - 1)`, [
    [[3, 9, 20, 15, 7], [9, 3, 15, 20, 7]], [[-1], [-1]], [[1, 2], [2, 1]], [[1, 2, 3], [2, 3, 1]],
  ], { output: "tree" }),

  "path-sum-iii": S("pathSum", "DFS 维护从根到当前节点的前缀和；此前出现过多少个 prefix-target，就有多少条合法路径。", "时间 O(n)，空间 O(h)", String.raw`class Solution:
    def pathSum(self, root, targetSum):
        count = {0: 1}
        def dfs(node, prefix):
            if not node: return 0
            prefix += node.val
            ans = count.get(prefix - targetSum, 0)
            count[prefix] = count.get(prefix, 0) + 1
            ans += dfs(node.left, prefix) + dfs(node.right, prefix)
            count[prefix] -= 1
            return ans
        return dfs(root, 0)`, [
    [[10, 5, -3, 3, 2, null, 11, 3, -2, null, 1], 8], [[5, 4, 8, 11, null, 13, 4, 7, 2, null, null, 5, 1], 22], [[1], 1], [[], 0],
  ], { argKinds: ["tree", "normal"] }),

  "lowest-common-ancestor-of-a-binary-tree": S("lowestCommonAncestor", "后序递归：若 p、q 分别出现在左右子树，当前节点就是最近公共祖先；否则返回非空一侧。", "时间 O(n)，递归栈 O(h)", String.raw`class Solution:
    def lowestCommonAncestor(self, root, p, q):
        if not root or root is p or root is q: return root
        left = self.lowestCommonAncestor(root.left, p, q)
        right = self.lowestCommonAncestor(root.right, p, q)
        return root if left and right else left or right`, [
    [[3, 5, 1, 6, 2, 0, 8, null, null, 7, 4], 5, 1], [[3, 5, 1, 6, 2, 0, 8, null, null, 7, 4], 5, 4], [[1, 2], 1, 2],
  ], { setup: "lca", output: "node-index" }),

  "binary-tree-maximum-path-sum": S("maxPathSum", "后序遍历计算每个节点向父节点能提供的最大单边贡献，同时用左右正贡献之和更新全局答案。", "时间 O(n)，递归栈 O(h)", String.raw`class Solution:
    def maxPathSum(self, root):
        ans = -float('inf')
        def gain(node):
            nonlocal ans
            if not node: return 0
            left = max(0, gain(node.left)); right = max(0, gain(node.right))
            ans = max(ans, node.val + left + right)
            return node.val + max(left, right)
        gain(root)
        return ans`, [
    [[1, 2, 3]], [[-10, 9, 20, null, null, 15, 7]], [[-3]], [[2, -1]],
  ], { argKinds: ["tree"] }),

  "number-of-islands": S("numIslands", "遍历网格，遇到陆地就把与它连通的整座岛屿用 DFS 标记掉，并将答案加一。", "时间 O(mn)，递归栈最坏 O(mn)", String.raw`class Solution:
    def numIslands(self, grid):
        rows, cols = len(grid), len(grid[0])
        def sink(r, c):
            if r < 0 or r >= rows or c < 0 or c >= cols or grid[r][c] != '1': return
            grid[r][c] = '0'
            sink(r + 1, c); sink(r - 1, c); sink(r, c + 1); sink(r, c - 1)
        ans = 0
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == '1':
                    ans += 1; sink(r, c)
        return ans`, [
    [[['1','1','1','1','0'],['1','1','0','1','0'],['1','1','0','0','0'],['0','0','0','0','0']]], [[['1','1','0','0','0'],['1','1','0','0','0'],['0','0','1','0','0'],['0','0','0','1','1']]], [[['0']]], [[['1']]],
  ]),

  "rotting-oranges": S("orangesRotting", "多源 BFS：先把所有腐烂橘子入队，按层扩散；最后若仍有新鲜橘子则返回 -1。", "时间 O(mn)，空间 O(mn)", String.raw`class Solution:
    def orangesRotting(self, grid):
        from collections import deque
        q, fresh = deque(), 0
        for r, row in enumerate(grid):
            for c, value in enumerate(row):
                if value == 2: q.append((r, c))
                elif value == 1: fresh += 1
        minutes = 0
        while q and fresh:
            for _ in range(len(q)):
                r, c = q.popleft()
                for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < len(grid) and 0 <= nc < len(grid[0]) and grid[nr][nc] == 1:
                        grid[nr][nc] = 2; fresh -= 1; q.append((nr, nc))
            minutes += 1
        return minutes if fresh == 0 else -1`, [
    [[[2,1,1],[1,1,0],[0,1,1]]], [[[2,1,1],[0,1,1],[1,0,1]]], [[[0,2]]], [[[1]]],
  ]),

  "course-schedule": S("canFinish", "建立课程依赖图并统计入度，用拓扑排序不断学习入度为零的课程；能处理全部课程则无环。", "时间 O(V+E)，空间 O(V+E)", String.raw`class Solution:
    def canFinish(self, numCourses, prerequisites):
        from collections import deque
        graph = [[] for _ in range(numCourses)]
        indegree = [0] * numCourses
        for course, pre in prerequisites:
            graph[pre].append(course); indegree[course] += 1
        q = deque(i for i, degree in enumerate(indegree) if degree == 0)
        learned = 0
        while q:
            node = q.popleft(); learned += 1
            for nxt in graph[node]:
                indegree[nxt] -= 1
                if indegree[nxt] == 0: q.append(nxt)
        return learned == numCourses`, [
    [2, [[1,0]]], [2, [[1,0],[0,1]]], [1, []], [4, [[1,0],[2,1],[3,2]]],
  ]),

  "implement-trie-prefix-tree": S(null, "每个节点保存子节点映射和结束标记；插入、完整查询与前缀查询都沿字符路径前进。", "每次操作 O(单词长度)，空间 O(字符总数)", String.raw`class Trie:
    def __init__(self):
        self.children = {}
        self.end = False
    def insert(self, word):
        node = self
        for ch in word:
            node = node.children.setdefault(ch, Trie())
        node.end = True
    def search(self, word):
        node = self
        for ch in word:
            if ch not in node.children: return False
            node = node.children[ch]
        return node.end
    def startsWith(self, prefix):
        node = self
        for ch in prefix:
            if ch not in node.children: return False
            node = node.children[ch]
        return True`, [
    { ops: ["Trie","insert","search","search","startsWith","insert","search"], args: [[],["apple"],["apple"],["app"],["app"],["app"],["app"]] },
    { ops: ["Trie","insert","insert","search","startsWith","search"], args: [[],["a"],["ab"],["a"],["abc"],["abc"]] },
  ], { kind: "class", className: "Trie" }),

  "permutations": S("permute", "回溯维护当前路径和已使用标记；路径长度达到 n 时记录一个排列。", "时间 O(n·n!)，空间 O(n)", String.raw`class Solution:
    def permute(self, nums):
        ans, path, used = [], [], [False] * len(nums)
        def dfs():
            if len(path) == len(nums):
                ans.append(path[:]); return
            for i, x in enumerate(nums):
                if not used[i]:
                    used[i] = True; path.append(x)
                    dfs()
                    path.pop(); used[i] = False
        dfs(); return ans`, [
    [[1,2,3]], [[0,1]], [[1]], [[-1,0,2]],
  ], { output: "rows" }),

  "subsets": S("subsets", "每到一个位置都先记录当前路径，再从后续元素中选择下一个加入，覆盖所有组合。", "时间 O(n·2ⁿ)，空间 O(n)", String.raw`class Solution:
    def subsets(self, nums):
        ans, path = [], []
        def dfs(start):
            ans.append(path[:])
            for i in range(start, len(nums)):
                path.append(nums[i]); dfs(i + 1); path.pop()
        dfs(0); return ans`, [
    [[1,2,3]], [[0]], [[]], [[-1,2]],
  ], { output: "rows-sorted" }),

  "letter-combinations-of-a-phone-number": S("letterCombinations", "按数字逐层选择对应字母，递归构造所有长度相同的组合。", "时间 O(4ⁿ)，空间 O(n)", String.raw`class Solution:
    def letterCombinations(self, digits):
        if not digits: return []
        mapping = {'2':'abc','3':'def','4':'ghi','5':'jkl','6':'mno','7':'pqrs','8':'tuv','9':'wxyz'}
        ans, path = [], []
        def dfs(i):
            if i == len(digits): ans.append(''.join(path)); return
            for ch in mapping[digits[i]]:
                path.append(ch); dfs(i + 1); path.pop()
        dfs(0); return ans`, [
    ["23"], [""], ["2"], ["79"],
  ], { output: "unordered" }),

  "combination-sum": S("combinationSum", "排序后回溯，当前数字可重复选择；剩余目标小于候选值时提前结束。", "取决于答案规模，递归深度 O(target/min)", String.raw`class Solution:
    def combinationSum(self, candidates, target):
        candidates.sort(); ans, path = [], []
        def dfs(start, remain):
            if remain == 0: ans.append(path[:]); return
            for i in range(start, len(candidates)):
                x = candidates[i]
                if x > remain: break
                path.append(x); dfs(i, remain - x); path.pop()
        dfs(0, target); return ans`, [
    [[2,3,6,7], 7], [[2,3,5], 8], [[2], 1], [[3,4,5], 12],
  ], { output: "rows-sorted" }),

  "generate-parentheses": S("generateParenthesis", "只在左括号数量小于 n 时添加左括号，只在右括号少于左括号时添加右括号。", "时间与卡特兰数同阶，空间 O(n)", String.raw`class Solution:
    def generateParenthesis(self, n):
        ans = []
        def dfs(text, left, right):
            if len(text) == 2 * n: ans.append(text); return
            if left < n: dfs(text + '(', left + 1, right)
            if right < left: dfs(text + ')', left, right + 1)
        dfs('', 0, 0); return ans`, [
    [3], [1], [2], [4],
  ], { output: "unordered" }),

  "word-search": S("exist", "从每个格子出发 DFS，匹配一个字符后临时标记该格，向四个方向继续搜索并回溯。", "时间 O(mn·4ᴸ)，递归栈 O(L)", String.raw`class Solution:
    def exist(self, board, word):
        rows, cols = len(board), len(board[0])
        def dfs(r, c, i):
            if i == len(word): return True
            if r < 0 or r >= rows or c < 0 or c >= cols or board[r][c] != word[i]: return False
            ch = board[r][c]; board[r][c] = '#'
            found = dfs(r+1,c,i+1) or dfs(r-1,c,i+1) or dfs(r,c+1,i+1) or dfs(r,c-1,i+1)
            board[r][c] = ch
            return found
        return any(dfs(r, c, 0) for r in range(rows) for c in range(cols))`, [
    [[['A','B','C','E'],['S','F','C','S'],['A','D','E','E']], "ABCCED"], [[['A','B','C','E'],['S','F','C','S'],['A','D','E','E']], "SEE"], [[['A','B'],['C','D']], "ABCB"], [[['A']], "A"],
  ]),

  "palindrome-partitioning": S("partition", "预先或即时判断回文；从当前位置枚举回文前缀，加入路径后继续切分剩余字符串。", "最坏 O(n·2ⁿ)，空间 O(n)", String.raw`class Solution:
    def partition(self, s):
        ans, path = [], []
        def dfs(start):
            if start == len(s): ans.append(path[:]); return
            for end in range(start + 1, len(s) + 1):
                part = s[start:end]
                if part == part[::-1]:
                    path.append(part); dfs(end); path.pop()
        dfs(0); return ans`, [
    ["aab"], ["a"], ["efe"], ["abba"],
  ], { output: "rows" }),

  "n-queens": S("solveNQueens", "逐行放置皇后，用集合记录已占用的列和两类对角线，冲突时立即剪枝。", "时间约 O(n!)，空间 O(n²)", String.raw`class Solution:
    def solveNQueens(self, n):
        ans, board = [], [['.'] * n for _ in range(n)]
        cols, diag1, diag2 = set(), set(), set()
        def dfs(r):
            if r == n:
                ans.append([''.join(row) for row in board]); return
            for c in range(n):
                if c in cols or r-c in diag1 or r+c in diag2: continue
                cols.add(c); diag1.add(r-c); diag2.add(r+c); board[r][c] = 'Q'
                dfs(r + 1)
                board[r][c] = '.'; cols.remove(c); diag1.remove(r-c); diag2.remove(r+c)
        dfs(0); return ans`, [
    [4], [1], [5],
  ], { output: "rows" }),

  "search-insert-position": S("searchInsert", "在左闭右开区间上二分，寻找第一个大于等于 target 的位置。", "时间 O(log n)，空间 O(1)", String.raw`class Solution:
    def searchInsert(self, nums, target):
        left, right = 0, len(nums)
        while left < right:
            mid = (left + right) // 2
            if nums[mid] < target: left = mid + 1
            else: right = mid
        return left`, [
    [[1,3,5,6], 5], [[1,3,5,6], 2], [[1,3,5,6], 7], [[1], 0],
  ]),

  "search-a-2d-matrix": S("searchMatrix", "把矩阵视为长度 m·n 的有序数组，二分下标并用除法、取模映射回行列。", "时间 O(log(mn))，空间 O(1)", String.raw`class Solution:
    def searchMatrix(self, matrix, target):
        rows, cols = len(matrix), len(matrix[0])
        left, right = 0, rows * cols
        while left < right:
            mid = (left + right) // 2
            value = matrix[mid // cols][mid % cols]
            if value < target: left = mid + 1
            else: right = mid
        return left < rows * cols and matrix[left // cols][left % cols] == target`, [
    [[[1,3,5,7],[10,11,16,20],[23,30,34,60]], 3], [[[1,3,5,7],[10,11,16,20]], 13], [[[1]], 1], [[[1]], 0],
  ]),

  "find-first-and-last-position-of-element-in-sorted-array": S("searchRange", "分别用两次二分找到 target 的左边界与 target+1 的左边界，后者减一即右边界。", "时间 O(log n)，空间 O(1)", String.raw`class Solution:
    def searchRange(self, nums, target):
        from bisect import bisect_left, bisect_right
        left, right = bisect_left(nums, target), bisect_right(nums, target) - 1
        return [left, right] if left < len(nums) and nums[left] == target else [-1, -1]`, [
    [[5,7,7,8,8,10], 8], [[5,7,7,8,8,10], 6], [[], 0], [[2,2], 2],
  ]),

  "search-in-rotated-sorted-array": S("search", "二分时至少有一半区间有序，判断 target 是否落在有序半区，再决定舍弃哪一半。", "时间 O(log n)，空间 O(1)", String.raw`class Solution:
    def search(self, nums, target):
        left, right = 0, len(nums) - 1
        while left <= right:
            mid = (left + right) // 2
            if nums[mid] == target: return mid
            if nums[left] <= nums[mid]:
                if nums[left] <= target < nums[mid]: right = mid - 1
                else: left = mid + 1
            else:
                if nums[mid] < target <= nums[right]: left = mid + 1
                else: right = mid - 1
        return -1`, [
    [[4,5,6,7,0,1,2], 0], [[4,5,6,7,0,1,2], 3], [[1], 0], [[3,1], 1],
  ]),

  "find-minimum-in-rotated-sorted-array": S("findMin", "比较中点和右端点：中点更大说明最小值在右侧，否则最小值位于包含中点的左侧。", "时间 O(log n)，空间 O(1)", String.raw`class Solution:
    def findMin(self, nums):
        left, right = 0, len(nums) - 1
        while left < right:
            mid = (left + right) // 2
            if nums[mid] > nums[right]: left = mid + 1
            else: right = mid
        return nums[left]`, [
    [[3,4,5,1,2]], [[4,5,6,7,0,1,2]], [[11,13,15,17]], [[2,1]],
  ]),

  "median-of-two-sorted-arrays": S("findMedianSortedArrays", "在较短数组上二分分割线，使左右两部分数量相等且交叉边界有序，再由边界值计算中位数。", "时间 O(log min(m,n))，空间 O(1)", String.raw`class Solution:
    def findMedianSortedArrays(self, nums1, nums2):
        if len(nums1) > len(nums2): nums1, nums2 = nums2, nums1
        m, n = len(nums1), len(nums2)
        left, right = 0, m
        while left <= right:
            i = (left + right) // 2; j = (m + n + 1) // 2 - i
            aL = nums1[i-1] if i else -float('inf'); aR = nums1[i] if i < m else float('inf')
            bL = nums2[j-1] if j else -float('inf'); bR = nums2[j] if j < n else float('inf')
            if aL <= bR and bL <= aR:
                if (m+n) % 2: return max(aL, bL)
                return (max(aL,bL) + min(aR,bR)) / 2
            if aL > bR: right = i - 1
            else: left = i + 1`, [
    [[1,3], [2]], [[1,2], [3,4]], [[0,0], [0,0]], [[], [1]], [[2], []],
  ], { output: "float" }),

  "valid-parentheses": S("isValid", "遇到左括号就把期望的右括号入栈；遇到右括号时必须与栈顶一致。", "时间 O(n)，空间 O(n)", String.raw`class Solution:
    def isValid(self, s):
        pairs = {'(':')','[':']','{':'}'}
        stack = []
        for ch in s:
            if ch in pairs: stack.append(pairs[ch])
            elif not stack or stack.pop() != ch: return False
        return not stack`, [
    ["()"], ["()[]{}"], ["(]"], ["([)]"], ["{[]}"],
  ]),

  "min-stack": S(null, "同时维护数据栈与最小值栈；每次压入当前最小值，使 getMin 和 pop 都保持 O(1)。", "所有操作 O(1)，空间 O(n)", String.raw`class MinStack:
    def __init__(self):
        self.stack = []
        self.mins = []
    def push(self, val):
        self.stack.append(val)
        self.mins.append(val if not self.mins else min(val, self.mins[-1]))
    def pop(self):
        self.stack.pop(); self.mins.pop()
    def top(self):
        return self.stack[-1]
    def getMin(self):
        return self.mins[-1]`, [
    { ops: ["MinStack","push","push","push","getMin","pop","top","getMin"], args: [[],[-2],[0],[-3],[],[],[],[]] },
    { ops: ["MinStack","push","push","getMin","pop","getMin"], args: [[],[1],[1],[],[],[]] },
  ], { kind: "class", className: "MinStack" }),

  "decode-string": S("decodeString", "栈保存进入方括号前的字符串和重复次数；遇到右括号时弹出并拼接当前片段。", "时间 O(输出长度)，空间 O(嵌套深度+输出)", String.raw`class Solution:
    def decodeString(self, s):
        stack, current, number = [], '', 0
        for ch in s:
            if ch.isdigit(): number = number * 10 + int(ch)
            elif ch == '[':
                stack.append((current, number)); current, number = '', 0
            elif ch == ']':
                prefix, repeat = stack.pop(); current = prefix + current * repeat
            else: current += ch
        return current`, [
    ["3[a]2[bc]"], ["3[a2[c]]"], ["2[abc]3[cd]ef"], ["10[a]"],
  ]),

  "daily-temperatures": S("dailyTemperatures", "单调递减栈保存尚未遇到更高温度的下标；当前温度更高时不断结算栈顶。", "时间 O(n)，空间 O(n)", String.raw`class Solution:
    def dailyTemperatures(self, temperatures):
        ans = [0] * len(temperatures); stack = []
        for i, value in enumerate(temperatures):
            while stack and temperatures[stack[-1]] < value:
                j = stack.pop(); ans[j] = i - j
            stack.append(i)
        return ans`, [
    [[73,74,75,71,69,72,76,73]], [[30,40,50,60]], [[30,60,90]], [[90,80,70]],
  ]),

  "largest-rectangle-in-histogram": S("largestRectangleArea", "维护递增高度栈；遇到更矮柱子时弹出并以被弹高度计算能延伸的最大宽度。", "时间 O(n)，空间 O(n)", String.raw`class Solution:
    def largestRectangleArea(self, heights):
        stack, ans = [], 0
        for i, height in enumerate(heights + [0]):
            start = i
            while stack and stack[-1][1] > height:
                index, h = stack.pop(); ans = max(ans, h * (i - index)); start = index
            stack.append((start, height))
        return ans`, [
    [[2,1,5,6,2,3]], [[2,4]], [[1]], [[2,1,2]], [[0,0]],
  ]),

  "kth-largest-element-in-an-array": S("findKthLargest", "维护大小为 k 的最小堆，遍历结束后堆顶就是第 k 大元素。", "时间 O(n log k)，空间 O(k)", String.raw`class Solution:
    def findKthLargest(self, nums, k):
        import heapq
        heap = nums[:k]; heapq.heapify(heap)
        for x in nums[k:]:
            if x > heap[0]: heapq.heapreplace(heap, x)
        return heap[0]`, [
    [[3,2,1,5,6,4], 2], [[3,2,3,1,2,4,5,5,6], 4], [[1], 1], [[-1,-2,-3], 2],
  ]),

  "top-k-frequent-elements": S("topKFrequent", "统计频率后用桶下标表示出现次数，从高频桶向低频桶收集前 k 个元素。", "时间 O(n)，空间 O(n)", String.raw`class Solution:
    def topKFrequent(self, nums, k):
        from collections import Counter
        count = Counter(nums)
        buckets = [[] for _ in range(len(nums) + 1)]
        for value, freq in count.items(): buckets[freq].append(value)
        ans = []
        for freq in range(len(buckets) - 1, 0, -1):
            ans.extend(buckets[freq])
            if len(ans) >= k: return ans[:k]`, [
    [[1,1,1,2,2,3], 2], [[1], 1], [[4,4,4,4,6,6,6,7,7,8], 3], [[-1,-1,2,2,2,3], 1],
  ], { output: "sorted" }),

  "find-median-from-data-stream": S(null, "用最大堆保存较小一半、最小堆保存较大一半，并始终保持两边数量差不超过一。", "addNum O(log n)，findMedian O(1)，空间 O(n)", String.raw`class MedianFinder:
    def __init__(self):
        import heapq
        self.small, self.large = [], []
    def addNum(self, num):
        import heapq
        heapq.heappush(self.small, -num)
        heapq.heappush(self.large, -heapq.heappop(self.small))
        if len(self.large) > len(self.small):
            heapq.heappush(self.small, -heapq.heappop(self.large))
    def findMedian(self):
        if len(self.small) > len(self.large): return float(-self.small[0])
        return (-self.small[0] + self.large[0]) / 2`, [
    { ops: ["MedianFinder","addNum","addNum","findMedian","addNum","findMedian"], args: [[],[1],[2],[],[3],[]] },
    { ops: ["MedianFinder","addNum","findMedian","addNum","findMedian"], args: [[],[-1],[],[-2],[]] },
  ], { kind: "class", className: "MedianFinder" }),

  "best-time-to-buy-and-sell-stock": S("maxProfit", "遍历价格并维护此前最低买入价，用当前价格减去最低价更新最大利润。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def maxProfit(self, prices):
        low, ans = float('inf'), 0
        for price in prices:
            low = min(low, price)
            ans = max(ans, price - low)
        return ans`, [
    [[7,1,5,3,6,4]], [[7,6,4,3,1]], [[1]], [[2,4,1]],
  ]),

  "jump-game": S("canJump", "维护当前能到达的最远位置；若遍历下标超过最远位置则失败，否则不断扩展边界。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def canJump(self, nums):
        farthest = 0
        for i, jump in enumerate(nums):
            if i > farthest: return False
            farthest = max(farthest, i + jump)
        return True`, [
    [[2,3,1,1,4]], [[3,2,1,0,4]], [[0]], [[2,0,0]],
  ]),

  "jump-game-ii": S("jump", "在当前一步可覆盖的区间内寻找下一步最远边界；走到当前边界时增加步数并更新边界。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def jump(self, nums):
        steps = end = farthest = 0
        for i in range(len(nums) - 1):
            farthest = max(farthest, i + nums[i])
            if i == end:
                steps += 1; end = farthest
        return steps`, [
    [[2,3,1,1,4]], [[2,3,0,1,4]], [[0]], [[1,1,1,1]],
  ]),

  "partition-labels": S("partitionLabels", "预先记录每个字符最后出现位置，扫描时扩展当前片段终点；到达终点即可切分。", "时间 O(n)，空间 O(字符集)", String.raw`class Solution:
    def partitionLabels(self, s):
        last = {ch: i for i, ch in enumerate(s)}
        ans, start, end = [], 0, 0
        for i, ch in enumerate(s):
            end = max(end, last[ch])
            if i == end:
                ans.append(end - start + 1); start = i + 1
        return ans`, [
    ["ababcbacadefegdehijhklij"], ["eccbbbbdec"], ["a"], ["abc"],
  ]),

  "climbing-stairs": S("climbStairs", "到达第 n 阶的方法数等于到达 n-1 与 n-2 阶的方法数之和，可滚动计算。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def climbStairs(self, n):
        a, b = 1, 1
        for _ in range(n): a, b = b, a + b
        return a`, [
    [2], [3], [1], [10],
  ]),

  "pascals-triangle": S("generate", "每一行两端为 1，中间元素由上一行相邻两个元素相加得到。", "时间 O(numRows²)，空间 O(numRows²)", String.raw`class Solution:
    def generate(self, numRows):
        ans = []
        for r in range(numRows):
            row = [1] * (r + 1)
            for c in range(1, r): row[c] = ans[-1][c - 1] + ans[-1][c]
            ans.append(row)
        return ans`, [
    [5], [1], [2], [7],
  ]),

  "house-robber": S("rob", "滚动维护偷到前一间与前两间时的最优值，当前选择为“不偷”或“偷当前加前两间”。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def rob(self, nums):
        prev2 = prev1 = 0
        for money in nums:
            prev2, prev1 = prev1, max(prev1, prev2 + money)
        return prev1`, [
    [[1,2,3,1]], [[2,7,9,3,1]], [[0]], [[2,1,1,2]],
  ]),

  "perfect-squares": S("numSquares", "完全背包：dp[x] 表示组成 x 的最少平方数，枚举每个平方数更新后续状态。", "时间 O(n√n)，空间 O(n)", String.raw`class Solution:
    def numSquares(self, n):
        dp = [0] + [n] * n
        square = 1
        while square * square <= n:
            value = square * square
            for total in range(value, n + 1):
                dp[total] = min(dp[total], dp[total - value] + 1)
            square += 1
        return dp[n]`, [
    [12], [13], [1], [43],
  ]),

  "coin-change": S("coinChange", "完全背包：dp[x] 表示凑出金额 x 的最少硬币数，对每枚硬币正序更新金额。", "时间 O(amount·coins)，空间 O(amount)", String.raw`class Solution:
    def coinChange(self, coins, amount):
        dp = [amount + 1] * (amount + 1); dp[0] = 0
        for coin in coins:
            for total in range(coin, amount + 1):
                dp[total] = min(dp[total], dp[total - coin] + 1)
        return -1 if dp[amount] > amount else dp[amount]`, [
    [[1,2,5], 11], [[2], 3], [[1], 0], [[2,5,10,1], 27],
  ]),

  "word-break": S("wordBreak", "dp[i] 表示前 i 个字符能否拆分；枚举分割点 j，若 dp[j] 且 s[j:i] 在词典中则可达。", "时间 O(n²)，空间 O(n)", String.raw`class Solution:
    def wordBreak(self, s, wordDict):
        words = set(wordDict)
        dp = [True] + [False] * len(s)
        for i in range(1, len(s) + 1):
            dp[i] = any(dp[j] and s[j:i] in words for j in range(i))
        return dp[-1]`, [
    ["leetcode", ["leet","code"]], ["applepenapple", ["apple","pen"]], ["catsandog", ["cats","dog","sand","and","cat"]], ["a", ["a"]],
  ]),

  "longest-increasing-subsequence": S("lengthOfLIS", "维护各长度递增子序列的最小结尾 tails；对每个数二分替换第一个不小于它的位置。", "时间 O(n log n)，空间 O(n)", String.raw`class Solution:
    def lengthOfLIS(self, nums):
        from bisect import bisect_left
        tails = []
        for x in nums:
            i = bisect_left(tails, x)
            if i == len(tails): tails.append(x)
            else: tails[i] = x
        return len(tails)`, [
    [[10,9,2,5,3,7,101,18]], [[0,1,0,3,2,3]], [[7,7,7,7,7]], [[1]],
  ]),

  "maximum-product-subarray": S("maxProduct", "负数会交换最大与最小乘积的角色，因此同时维护以当前位置结尾的最大值和最小值。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def maxProduct(self, nums):
        high = low = ans = nums[0]
        for x in nums[1:]:
            if x < 0: high, low = low, high
            high = max(x, high * x); low = min(x, low * x)
            ans = max(ans, high)
        return ans`, [
    [[2,3,-2,4]], [[-2,0,-1]], [[-2,3,-4]], [[0,2]],
  ]),

  "partition-equal-subset-sum": S("canPartition", "总和必须为偶数；用 0/1 背包倒序更新可达和，判断能否达到总和的一半。", "时间 O(n·sum)，空间 O(sum)", String.raw`class Solution:
    def canPartition(self, nums):
        total = sum(nums)
        if total % 2: return False
        target = total // 2
        reachable = {0}
        for x in nums:
            reachable |= {value + x for value in reachable if value + x <= target}
        return target in reachable`, [
    [[1,5,11,5]], [[1,2,3,5]], [[1,1]], [[2,2,3,5]],
  ]),

  "longest-valid-parentheses": S("longestValidParentheses", "栈保存未匹配左括号下标，并以 -1 作为最近无效位置；匹配后用当前位置减栈顶更新长度。", "时间 O(n)，空间 O(n)", String.raw`class Solution:
    def longestValidParentheses(self, s):
        stack, ans = [-1], 0
        for i, ch in enumerate(s):
            if ch == '(': stack.append(i)
            else:
                stack.pop()
                if not stack: stack.append(i)
                else: ans = max(ans, i - stack[-1])
        return ans`, [
    ["(()"], [")()())"], [""], ["()(())"],
  ]),

  "unique-paths": S("uniquePaths", "一维动态规划：到达当前格子的路径数等于上方旧值加左侧新值。", "时间 O(mn)，空间 O(n)", String.raw`class Solution:
    def uniquePaths(self, m, n):
        dp = [1] * n
        for _ in range(1, m):
            for c in range(1, n): dp[c] += dp[c - 1]
        return dp[-1]`, [
    [3, 7], [3, 2], [1, 1], [7, 3],
  ]),

  "minimum-path-sum": S("minPathSum", "逐格累加到达该格的最小代价，状态来自上方和左方较小者，可直接复用一维数组。", "时间 O(mn)，空间 O(n)", String.raw`class Solution:
    def minPathSum(self, grid):
        cols = len(grid[0]); dp = [float('inf')] * cols; dp[0] = 0
        for row in grid:
            for c, value in enumerate(row):
                dp[c] = min(dp[c], dp[c - 1] if c else float('inf')) + value
        return dp[-1]`, [
    [[[1,3,1],[1,5,1],[4,2,1]]], [[[1,2,3],[4,5,6]]], [[[1]]], [[[1,2],[1,1]]],
  ]),

  "longest-palindromic-substring": S("longestPalindrome", "以每个位置及相邻位置为中心向两侧扩展，记录能够得到的最长回文区间。", "时间 O(n²)，空间 O(1)", String.raw`class Solution:
    def longestPalindrome(self, s):
        start = end = 0
        def expand(left, right):
            while left >= 0 and right < len(s) and s[left] == s[right]:
                left -= 1; right += 1
            return left + 1, right - 1
        for i in range(len(s)):
            for left, right in (expand(i, i), expand(i, i + 1)):
                if right - left > end - start: start, end = left, right
        return s[start:end + 1]`, [
    ["babad"], ["cbbd"], ["a"], ["ac"], ["forgeeksskeegfor"],
  ], { output: "palindrome" }),

  "longest-common-subsequence": S("longestCommonSubsequence", "dp[j] 表示当前处理前缀与 text2 前 j 个字符的 LCS；字符相等取左上加一，否则取上或左最大值。", "时间 O(mn)，空间 O(n)", String.raw`class Solution:
    def longestCommonSubsequence(self, text1, text2):
        dp = [0] * (len(text2) + 1)
        for a in text1:
            diagonal = 0
            for j, b in enumerate(text2, 1):
                old = dp[j]
                if a == b: dp[j] = diagonal + 1
                else: dp[j] = max(dp[j], dp[j - 1])
                diagonal = old
        return dp[-1]`, [
    ["abcde", "ace"], ["abc", "abc"], ["abc", "def"], ["bsbininm", "jmjkbkjkv"],
  ]),

  "edit-distance": S("minDistance", "dp[i][j] 表示两个前缀的编辑距离；末字符相同继承左上，否则取插入、删除、替换三者最小值加一。", "时间 O(mn)，空间 O(n)", String.raw`class Solution:
    def minDistance(self, word1, word2):
        dp = list(range(len(word2) + 1))
        for i, a in enumerate(word1, 1):
            current = [i]
            for j, b in enumerate(word2, 1):
                if a == b: current.append(dp[j - 1])
                else: current.append(1 + min(dp[j], current[-1], dp[j - 1]))
            dp = current
        return dp[-1]`, [
    ["horse", "ros"], ["intention", "execution"], ["", "abc"], ["a", "a"],
  ]),

  "single-number": S("singleNumber", "相同数字异或后为零，零与任何数异或仍为该数，因此所有元素异或结果就是唯一数字。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def singleNumber(self, nums):
        ans = 0
        for x in nums: ans ^= x
        return ans`, [
    [[2,2,1]], [[4,1,2,1,2]], [[1]], [[-1,-1,-2]],
  ]),

  "majority-element": S("majorityElement", "Boyer–Moore 投票：不同元素两两抵消，最终剩余候选人就是出现次数过半的元素。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def majorityElement(self, nums):
        candidate = None; count = 0
        for x in nums:
            if count == 0: candidate = x
            count += 1 if x == candidate else -1
        return candidate`, [
    [[3,2,3]], [[2,2,1,1,1,2,2]], [[1]], [[-1,-1,2]],
  ]),

  "sort-colors": S("sortColors", "荷兰国旗三指针：把 0 交换到左侧、2 交换到右侧，1 保留在中间。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def sortColors(self, nums):
        left = i = 0; right = len(nums) - 1
        while i <= right:
            if nums[i] == 0:
                nums[left], nums[i] = nums[i], nums[left]; left += 1; i += 1
            elif nums[i] == 2:
                nums[right], nums[i] = nums[i], nums[right]; right -= 1
            else: i += 1`, [
    [[2,0,2,1,1,0]], [[2,0,1]], [[0]], [[1,2,0,1]],
  ], { output: "mutated" }),

  "next-permutation": S("nextPermutation", "从右向左找第一个下降位置，与右侧刚好更大的数交换，再反转后缀得到最小增量。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def nextPermutation(self, nums):
        i = len(nums) - 2
        while i >= 0 and nums[i] >= nums[i + 1]: i -= 1
        if i >= 0:
            j = len(nums) - 1
            while nums[j] <= nums[i]: j -= 1
            nums[i], nums[j] = nums[j], nums[i]
        nums[i + 1:] = reversed(nums[i + 1:])`, [
    [[1,2,3]], [[3,2,1]], [[1,1,5]], [[1,3,2]],
  ], { output: "mutated" }),

  "find-the-duplicate-number": S("findDuplicate", "把 nums[i] 看成链表后继，下标 0 为起点；Floyd 快慢指针先相遇，再从起点同步找到环入口。", "时间 O(n)，空间 O(1)", String.raw`class Solution:
    def findDuplicate(self, nums):
        slow = fast = 0
        while True:
            slow = nums[slow]; fast = nums[nums[fast]]
            if slow == fast: break
        finder = 0
        while finder != slow:
            finder = nums[finder]; slow = nums[slow]
        return finder`, [
    [[1,3,4,2,2]], [[3,1,3,4,2]], [[3,3,3,3,3]], [[2,1,2]],
  ]),
};

export default solutions;
