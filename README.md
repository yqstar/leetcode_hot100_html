# LC Python 离线训练场

一个无需服务器、无需安装、无需联网，并支持快速隐藏刷题页面的单 HTML 刷题工具。

## 界面预览

<table>
  <tr>
    <th width="33.33%">题目列表页</th>
    <th width="33.33%">题目详情页</th>
    <th width="33.33%">隐私伪装页</th>
  </tr>
  <tr>
    <td align="center">
      <a href="./docs/images/problem-list.svg"><img src="./docs/images/problem-list.svg" alt="题目列表页界面示意" width="100%"></a>
    </td>
    <td align="center">
      <a href="./docs/images/problem-detail.svg"><img src="./docs/images/problem-detail.svg" alt="题目详情页界面示意" width="100%"></a>
    </td>
    <td align="center">
      <a href="./docs/images/privacy-view.svg"><img src="./docs/images/privacy-view.svg" alt="隐私伪装页界面示意" width="100%"></a>
    </td>
  </tr>
</table>

刷题界面默认使用深色模式，隐私伪装页会自动跟随当前的深色或浅色主题。点击缩略图可查看完整示意图。

## 使用

项目提供两个都能直接双击运行的单文件版本：

- [`lc_offline_compact.html`](./lc_offline_compact.html)：压缩单文件版，体积更小，打开后会在浏览器内自行解压并启动，推荐使用。
- [`lc_offline.html`](./lc_offline.html)：标准单文件版，无需启动解压，适合浏览器不支持 `DecompressionStream` 时使用。

两个版本都已经内嵌题目、图片、题解、评测器和完整 Python 运行时，不依赖项目中的其他文件，也不会联网加载资源。推荐使用最新版 Chrome 或 Edge；Safari、Firefox 也可使用，但 `file://` 页面本地存储策略可能因浏览器而异，建议定期导出 Markdown 备份。

每次推送 `v*` 版本标签时，GitHub Actions 会重新构建并完成全部测试，然后把 `lc_offline_compact.html` 上传为对应 GitHub Release 的下载附件。同一标签的发布流程重跑时会覆盖旧附件。

## 功能

- 17 个专题、100 道 LC 中文题面和内嵌示意图
- 内嵌 Pyodide/CPython，可断网运行 Python 3 代码
- 支持内置与自定义样例运行、本地提交评估，覆盖普通参数、链表、二叉树、设计题和原地修改题
- 每题参考思路、复杂度与 Python 参考实现
- 进入题目时默认展示完整题目描述，也可在顶部切换为默认收起
- 桌面端题面/代码分栏可拖动或用方向键调整并自动记忆宽度
- 移动端使用题面/代码单屏切换，避免长题面与编辑器纵向堆叠；目录会实时显示筛选命中数
- 代码编辑器支持明暗主题 Python 语法高亮、回车自动继承缩进、Tab / Shift+Tab 块级缩进、`⌘/Ctrl + /` 切换注释，`⌘/Ctrl + S` 可立即保存
- 自动保存个人代码、进度与 Markdown 笔记
- 以 Markdown 表格统一导出和导入题目名、笔记，可选择是否包含个人代码列
- 搜索、难度/状态筛选、随机未完成题、深色模式
- 在任意位置快速连按两次 Enter，可立即切换到无关的“每日工作台”隐私伪装页；再次连按两次恢复原页面

## 隐私伪装页

需要临时隐藏刷题内容时，在页面任意位置快速连按两次 `Enter`。页面会立即切换为一个与刷题无关的“每日工作台”，并同时隐藏：

- 题目目录、题目详情、代码、笔记和参考题解
- 当前打开的弹窗、运行结果和页面提示
- 浏览器标签中的题目名称
- 地址栏中的 `#problem=...` 题目标识

隐私伪装页会沿用当前刷题界面的深色或浅色主题。快捷键在代码与笔记编辑器内同样有效，触发后不会留下多余换行。再次快速连按两次 `Enter` 即可恢复，之前打开的题目、编辑内容、焦点和滚动位置都会保留。切换前会立即保存当前代码与笔记；伪装页完全内置，不会联网或上传任何内容。

> 隐私伪装页用于临时遮挡屏幕内容，不提供密码保护、加密或访问控制。如果需要真正隔离学习记录，请关闭页面或清理浏览器为该文件保存的本地数据。

Python 运行时已经打包在 HTML 内，页面空闲时会自动预热，不会临时联网下载。若浏览器限制 `file://` 页面启动 Worker，会自动切换到直接从内存启动的兼容模式。

本地评估用于日常练习，不等同于力扣官方完整测试集。题面内容版权归 LC 及原作者；内嵌 Python 运行时使用 Pyodide（MPL-2.0）与 CPython。

## 开发校验

```bash
node scripts/project.mjs build
node scripts/project.mjs test
```

`build` 会生成标准版和压缩版两个离线 HTML，并且只在内容变化时重新写入；`test` 会先构建，再依次执行参考解、反例、CPython、Pyodide、兼容模式、标准产物和压缩产物校验。项目没有第三方 npm 依赖。

前端结构、样式与交互集中在 `src/app.html`；题目快照、题解和 Python 评测器保持独立，便于分别维护。
