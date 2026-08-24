# LeetCode Python 离线训练场

一个无需服务器、无需安装、无需联网的单 HTML 刷题工具。

## 界面预览

<table>
  <tr>
    <th width="50%">题目列表页</th>
    <th width="50%">题目详情页</th>
  </tr>
  <tr>
    <td align="center">
      <a href="./docs/images/problem-list.svg"><img src="./docs/images/problem-list.svg" alt="题目列表页界面示意" width="100%"></a>
    </td>
    <td align="center">
      <a href="./docs/images/problem-detail.svg"><img src="./docs/images/problem-detail.svg" alt="题目详情页界面示意" width="100%"></a>
    </td>
  </tr>
</table>

默认使用深色模式。点击缩略图可查看完整示意图。

## 使用

直接双击打开 [`leetcode_offline.html`](./leetcode_offline.html)。推荐使用最新版 Chrome 或 Edge；Safari、Firefox 也可使用，但 `file://` 页面本地存储策略可能因浏览器而异，建议定期导出 Markdown 备份。

## 功能

- 17 个专题、100 道 LeetCode 中文题面和内嵌示意图
- 内嵌 Pyodide/CPython，可断网运行 Python 3 代码
- 支持内置与自定义样例运行、本地提交评估，覆盖普通参数、链表、二叉树、设计题和原地修改题
- 每题参考思路、复杂度与 Python 参考实现
- 自动保存个人代码、进度与 Markdown 笔记
- 以 Markdown 表格统一导出和导入题目名、笔记，可选择是否包含个人代码列
- 搜索、难度/状态筛选、随机未完成题、深色模式

Python 运行时已经打包在 HTML 内，页面空闲时会自动预热，不会临时联网下载。若浏览器限制 `file://` 页面启动 Worker，会自动切换到直接从内存启动的兼容模式。

本地评估用于日常练习，不等同于力扣官方完整测试集。题面内容版权归 LeetCode 及原作者；内嵌 Python 运行时使用 Pyodide（MPL-2.0）与 CPython。

## 开发校验

```bash
node scripts/project.mjs build
node scripts/project.mjs test
```

`build` 只在内容变化时重新写入离线 HTML；`test` 会先构建，再一次执行参考解、反例、CPython、Pyodide、兼容模式和离线产物校验。项目没有第三方 npm 依赖。

前端结构、样式与交互集中在 `src/app.html`；题目快照、题解和 Python 评测器保持独立，便于分别维护。
