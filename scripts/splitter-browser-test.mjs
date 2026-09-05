// Pointer input goes through Chrome, including native pointer capture and hit testing.
export async function verifySplitter({ cdp, sessionId, evaluate, reload }) {
  const run = (expression) => evaluate(cdp, sessionId, expression);
  const assert = (condition, message) => { if (!condition) throw new Error(`分栏拖动：${message}`); };
  const settle = () => run("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const resize = async (width) => {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await settle();
  };
  const measure = () => run(`(() => {
    const handle = elements.pane_resizer.getBoundingClientRect();
    return { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2,
      left: elements.problem_pane.getBoundingClientRect().width,
      right: document.querySelector('.workspace-pane').getBoundingClientRect().width,
      dragging: document.body.classList.contains('resizing-panes'),
      captured: elements.pane_resizer.hasPointerCapture(window.__splitterPointerId || 1),
      setting: state.settings.problemPaneWidth,
      saved: JSON.parse(localStorage.getItem(STORAGE_KEY))?.settings.problemPaneWidth };
  })()`);
  const mouse = (type, x, y, buttons = 0, button = "none") => cdp.send("Input.dispatchMouseEvent", {
    type, x, y, buttons, button, clickCount: type === "mouseMoved" ? 0 : 1,
  }, sessionId);
  const move = (x, y, buttons = 0) => mouse("mouseMoved", x, y, buttons);
  const release = (x, y) => mouse("mouseReleased", x, y, 0, "left");
  const reset = async () => {
    await run('setPrivacyMode(false); openProblem("two-sum", false); setProblemPaneCollapsed(false); setProblemPaneWidth(43); saveState(true)');
    await settle();
  };
  const start = async (offset = 0) => {
    const before = await measure();
    await move(before.x + offset, before.y);
    await mouse("mousePressed", before.x + offset, before.y, 1, "left");
    const started = await measure();
    assert(started.dragging && started.captured, "按下分隔条没有开始拖动或捕获指针");
    return { ...before, pointerX: before.x + offset };
  };
  const checkStopped = async (label) => {
    const before = await measure();
    assert(!before.dragging && !before.captured, `${label} 后拖动状态或指针捕获仍残留`);
    await move(before.x + 1, before.y);
    const after = await measure();
    assert(Math.abs(after.left - before.left) < 0.1, `${label} 后悬停仍会改变栏宽`);
    assert(after.saved === after.setting, `${label} 后栏宽未保存`);
  };
  await run(`window.__splitterOriginalState = structuredClone(state);
    window.__splitterTrackPointer = event => { window.__splitterPointerId = event.pointerId; };
    elements.pane_resizer.addEventListener('pointerdown', window.__splitterTrackPointer);`);
  try {
    for (const width of [2048, 1440, 1024, 901]) {
      await resize(width);
      for (const offset of [-4, 0, 4]) {
        await reset();
        const initial = await start(offset);
        await move(initial.pointerX - 1, initial.y, 1);
        let current = await measure();
        assert(Math.abs(current.left - initial.left + 1) < 0.15, `${width}px、抓取偏移 ${offset}px：移动 1px 时跳动 ${current.left - initial.left}px`);
        await move(initial.pointerX - 8, initial.y, 1);
        current = await measure();
        assert(Math.abs(current.left - initial.left + 8) < 0.15, `${width}px：拖动未跟随指针位移`);
        await release(initial.pointerX - 8, 10);
        await checkStopped("在分隔条外松开");
      }
      await reset();
      const initial = await start();
      await move(1, initial.y, 1);
      let current = await measure();
      assert(current.left >= 359.9 && current.right >= 487.9, `${width}px：向左拖动突破最小栏宽`);
      await move(width - 1, initial.y, 1);
      current = await measure();
      assert(current.left >= 359.9 && current.right >= 487.9, `${width}px：向右拖动突破最小栏宽`);
      await release(width - 1, initial.y);
      await checkStopped("达到宽度边界后松开");
    }
    await resize(1440);
    const interruptions = [
      ["丢失指针捕获", "elements.pane_resizer.releasePointerCapture(window.__splitterPointerId)"],
      ["窗口失焦", "window.dispatchEvent(new Event('blur'))"],
      ["指针取消", "elements.pane_resizer.dispatchEvent(new PointerEvent('pointercancel', { pointerId: window.__splitterPointerId, bubbles: true }))"],
      ["Escape", "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"],
      ["收起题目", "setProblemPaneCollapsed(true)"],
      ["返回目录", "showCatalog(false)"],
      ["切换题目", "openProblem('group-anagrams', false)"],
      ["隐私页", "setPrivacyMode(true)"],
      ["打开弹窗", "openCustomCaseModal()"],
      ["页面隐藏", "Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState"],
      ["离开页面", "window.dispatchEvent(new Event('pagehide'))"],
    ];
    for (const [label, action] of interruptions) {
      await reset();
      const initial = await start();
      await move(initial.pointerX + 24, initial.y, 1);
      await run(action);
      // Native lostpointercapture is delivered before the next pointer event.
      await move(initial.pointerX + 30, 10, 1);
      await release(initial.pointerX + 30, 10);
      await checkStopped(label);
      await run('closeCustomCaseModal(); setPrivacyMode(false)');
    }
    await reset();
    let initial = await start();
    await move(initial.pointerX + 24, initial.y, 1);
    await move(initial.pointerX + 25, initial.y, 0);
    await checkStopped("鼠标按键已松开但未收到 pointerup");
    await release(initial.pointerX + 25, initial.y);

    await reset();
    initial = await start();
    await run("window.dispatchEvent(new PointerEvent('pointerup', { pointerId: window.__splitterPointerId + 1 }))");
    assert((await measure()).dragging, "其他指针的松开错误结束了当前拖动");
    await release(initial.pointerX, initial.y);
    const idle = await measure();
    await mouse("mousePressed", idle.x, idle.y, 2, "right");
    assert(!(await measure()).dragging, "右键不应开始分栏拖动");
    await mouse("mouseReleased", idle.x, idle.y, 0, "right");
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);

    await reset();
    initial = await start();
    await move(initial.pointerX + 20, initial.y, 1);
    await resize(900);
    assert(!(await measure()).dragging && !(await measure()).captured, "进入移动布局后未结束拖动");
    await release(500, 10);
    await resize(1440);
    await checkStopped("恢复桌面布局");

    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true }, sessionId);
    for (const endType of ["touchEnd", "touchCancel"]) {
      await reset();
      const before = await measure();
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: before.x, y: before.y, id: 0 }] }, sessionId);
      assert((await measure()).dragging, "触摸没有开始拖动");
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: before.x + 24, y: before.y, id: 0 }] }, sessionId);
      assert(Math.abs((await measure()).left - before.left - 24) < 0.15, "触摸拖动未跟随手指位移");
      await cdp.send("Input.dispatchTouchEvent", { type: endType, touchPoints: [] }, sessionId);
      await checkStopped(endType === "touchEnd" ? "触摸松开" : "触摸取消");
    }
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false }, sessionId);

    await reset();
    await run("elements.pane_resizer.setPointerCapture = () => { throw new DOMException('测试捕获失败', 'NotFoundError'); }");
    const uncaptured = await measure();
    await mouse("mousePressed", uncaptured.x, uncaptured.y, 1, "left");
    await release(uncaptured.x, uncaptured.y);
    await run("delete elements.pane_resizer.setPointerCapture");
    await checkStopped("无法捕获指针");
    initial = await start();
    await release(initial.pointerX, initial.y);
    assert((await measure()).setting === uncaptured.setting, "仅按下松开不应改变栏宽");

    await resize(1024);
    await reset();
    await run("state.settings.problemPaneWidth = 68; applyProblemPaneWidth(); elements.pane_resizer.focus()");
    const beforeKey = await measure();
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 }, sessionId);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 }, sessionId);
    assert((await measure()).left < beforeKey.left - 15, "键盘调整没有从当前实际栏宽开始");
    await run("saveState(true)");
    const saved = (await measure()).setting;
    // Reload both artifacts in the runner, verifying the persisted setting independently.
    await run("elements.pane_resizer.removeEventListener('pointerdown', window.__splitterTrackPointer)");
    const original = await run("window.__splitterOriginalState");
    await reload();
    await run(`window.__splitterOriginalState = ${JSON.stringify(original)}`);
    assert((await measure()).setting === saved, "刷新后未恢复拖动保存的栏宽");
  } finally {
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false }, sessionId);
    await release(1, 1);
    await resize(2048);
    await run(`elements.pane_resizer.removeEventListener('pointerdown', window.__splitterTrackPointer);
      delete elements.pane_resizer.setPointerCapture;
      if (window.__splitterOriginalState) { commitImportedState(window.__splitterOriginalState, false); refreshImportedState(); saveState(true); }
      delete window.__splitterOriginalState; delete window.__splitterTrackPointer; delete window.__splitterPointerId;`);
  }
}
