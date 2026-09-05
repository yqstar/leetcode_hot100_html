// Search is normalized once per problem; navigation nodes survive every filter change.
function normalizeSearch(value) {
  return String(value).normalize("NFKC").toLocaleLowerCase("zh-CN").trim();
}

function searchTokens(value) {
  return [...new Set(normalizeSearch(value).split(/\s+/).filter(Boolean))];
}

function highlightedMatch(value, tokens) {
  const text = String(value);
  if (!tokens.length) return escapeHtml(text);
  const normalized = normalizeSearch(text);
  // NFKC can change a character's length; leave these uncommon titles unmarked.
  if (normalized.length !== text.length) return escapeHtml(text);
  const ranges = [];
  for (const token of tokens) {
    for (let start = normalized.indexOf(token); start >= 0; start = normalized.indexOf(token, start + token.length)) {
      ranges.push([start, start + token.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  }
  let result = "", offset = 0;
  for (const [start, end] of merged) {
    result += escapeHtml(text.slice(offset, start)) + `<mark>${escapeHtml(text.slice(start, end))}</mark>`;
    offset = end;
  }
  return result + escapeHtml(text.slice(offset));
}

const categoryNavigationNodes = new Map();
let catalogMarkup = null;

function updateCategoryNavigation(categories) {
  if (!categoryNavigationNodes.size) {
    const fragment = document.createDocumentFragment();
    for (const { category } of categories) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "category-link";
      button.dataset.category = category;
      const label = document.createElement("span");
      label.textContent = category === "all" ? "全部题目" : category;
      const count = document.createElement("span");
      count.setAttribute("aria-hidden", "true");
      button.append(label, count);
      categoryNavigationNodes.set(category, { button, count });
      fragment.append(button);
    }
    elements.category_navigation.replaceChildren(fragment);
  }
  for (const { category, count } of categories) {
    const nodes = categoryNavigationNodes.get(category);
    nodes.button.setAttribute("aria-pressed", String(activeCategory === category));
    nodes.button.setAttribute("aria-label", `${category === "all" ? "全部题目" : category}，${count} 道`);
    nodes.count.textContent = count;
  }
}

function clearCatalogFilters() {
  closeCatalogFilter();
  activeCategory = "all";
  elements.search_input.value = "";
  elements.difficulty_filter.value = "all";
  elements.status_filter.value = "all";
  renderCatalog();
}

function statusFor(slug) {
  return recordFor(slug, false).status;
}

const HTML_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => HTML_ENTITIES[character]);
}

function toast(message, type = "info") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  elements.toast_stack.append(item);
  while (elements.toast_stack.childElementCount > 4) elements.toast_stack.firstElementChild.remove();
  setTimeout(() => item.remove(), 3200);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  state.settings.theme = theme;
  const label = theme === "dark" ? "切换浅色模式" : "切换深色模式";
  elements.theme_button.setAttribute("aria-label", label);
  elements.theme_button.title = label;
}

function applyProblemExpansionPreference(enabled, persist = true) {
  state.settings.expandProblemByDefault = enabled;
  elements.auto_expand_button.setAttribute("aria-checked", String(enabled));
  elements.auto_expand_button.title = enabled ? "进入题目时默认展开题面" : "进入题目时默认收起题面";
  if (currentSlug) setProblemPaneCollapsed(!enabled);
  if (persist) saveState();
}

function statistics() {
  let solved = 0, attempted = 0, noted = 0, submissions = 0;
  for (const problem of PROBLEMS) {
    const record = recordFor(problem.slug, false);
    if (record.status === "solved") solved += 1;
    else if (record.status === "attempted") attempted += 1;
    if (record.note.trim()) noted += 1;
    submissions += record.attempts;
  }
  return { solved, attempted, noted, submissions, progress: solved + attempted };
}

function resetProgressRecords(records, updatedAt = timestamp()) {
  let resetCount = 0;
  for (const problem of PROBLEMS) {
    const record = records[problem.slug];
    if (!record || record.status === "todo") continue;
    record.status = "todo";
    record.attempts = 0;
    record.passedAt = null;
    record.updatedAt = updatedAt;
    resetCount += 1;
  }
  return resetCount;
}

function openResetProgressModal() {
  const count = statistics().progress;
  if (!count) return toast("当前没有需要重置的学习进度");
  elements.reset_progress_description.textContent = `将把 ${count} 道有进度的题目恢复为未开始，并把累计提交次数清零。个人代码、笔记和自定义样例不会删除。`;
  showModal(elements.reset_progress_modal, () => elements.reset_progress_cancel_button);
}

function closeResetProgressModal() {
  hideModal(elements.reset_progress_modal, elements.reset_progress_button);
}

function confirmResetProgress() {
  const resetCount = resetProgressRecords(state.records);
  closeResetProgressModal();
  if (!resetCount) return toast("当前没有需要重置的学习进度");
  saveState(true);
  renderCatalog();
  if (currentSlug) {
    updateMasteredButton();
    resetTestConsole();
  }
  toast(`已将 ${resetCount} 道题恢复为未开始，累计提交已清零`);
}

function renderSummary() {
  const stats = statistics();
  elements.solved_count.textContent = stats.solved;
  elements.attempted_count.textContent = stats.attempted;
  elements.noted_count.textContent = stats.noted;
  elements.submission_count.textContent = stats.submissions;
  const percent = Math.round(stats.solved / PROBLEMS.length * 100);
  elements.progress_number.textContent = `${percent}%`;
  elements.progress_orbit.setAttribute("aria-valuenow", String(percent));
  elements.progress_orbit.setAttribute("aria-valuetext", `${stats.solved} / ${PROBLEMS.length} 道已通过`);
  for (const [difficulty, prefix] of [["Easy", "easy"], ["Medium", "medium"], ["Hard", "hard"]]) {
    const problems = PROBLEMS.filter((problem) => problem.difficulty === difficulty);
    const solved = problems.filter((problem) => statusFor(problem.slug) === "solved").length;
    const progress = elements[`${prefix}_progress`];
    progress.setAttribute("aria-valuemax", String(problems.length));
    progress.setAttribute("aria-valuenow", String(solved));
    progress.style.setProperty("--completion", `${solved / problems.length * 100}%`);
    elements[`${prefix}_count`].textContent = `${solved}/${problems.length}`;
  }
  elements.progress_orbit.style.setProperty("--progress", `${percent * 3.6}deg`);
  elements.reset_progress_button.disabled = stats.progress === 0;
  const last = bySlug.get(state.settings.lastSlug).problem;
  const hasWork = Object.keys(state.records).length > 0;
  elements.continue_button.textContent = hasWork ? `继续：${last.frontendId}. ${last.title}` : "开始第一题";
  elements.practice_caption.textContent = stats.solved === PROBLEMS.length
    ? "100 道题已全部通过。回看笔记，让解题思路更扎实。"
    : hasWork ? `上次练习 · ${last.category} / ${DIFFICULTY[last.difficulty].label} · 代码与笔记自动保存`
      : "从一道题开始，积累自己的解题思路。";
}

function renderCatalog() {
  cancelAnimationFrame(catalogRenderFrame);
  catalogRenderFrame = null;
  renderSummary();
  syncCatalogFilters();
  const tokens = searchTokens(elements.search_input.value);
  const difficulty = elements.difficulty_filter.value;
  const status = elements.status_filter.value;
  let visibleCount = 0;
  let matchingCount = 0;
  let categoryIndex = 0;
  const cards = [];
  const categories = [];
  for (const [category, allProblems] of problemsByCategory) {
    categoryIndex += 1;
    const problems = [];
    let solved = 0;
    for (const problem of allProblems) {
      const record = recordFor(problem.slug, false);
      if (record.status === "solved") solved += 1;
      if (!tokens.every((token) => searchTextBySlug.get(problem.slug).includes(token))) continue;
      if (difficulty !== "all" && problem.difficulty !== difficulty) continue;
      if (status === "noted" ? !record.note.trim() : status !== "all" && record.status !== status) continue;
      problems.push(problem);
    }
    matchingCount += problems.length;
    categories.push({ category, count: problems.length });
    if (!problems.length || (activeCategory !== "all" && activeCategory !== category)) continue;
    visibleCount += problems.length;
    const rows = problems.map((problem) => {
      const status = statusFor(problem.slug);
      const difficulty = DIFFICULTY[problem.difficulty];
      const isCurrent = problem.slug === state.settings.lastSlug && Object.hasOwn(state.records, problem.slug);
      return `<li><a class="problem-row${isCurrent ? " is-current" : ""}" href="#problem=${encodeURIComponent(problem.slug)}" data-slug="${escapeHtml(problem.slug)}" aria-label="打开 ${escapeHtml(problem.frontendId)}. ${escapeHtml(problem.title)}，${STATUS_LABEL[status]}，${difficulty.label}">
        <span class="status-dot ${status}" aria-label="${STATUS_LABEL[status]}">${status === "solved" ? "✓" : ""}</span>
        <span class="problem-name"><span class="problem-id">${highlightedMatch(problem.frontendId, tokens)}.</span>${highlightedMatch(problem.title, tokens)}</span>
        <span class="difficulty ${difficulty.className}">${difficulty.label}</span>
      </a></li>`;
    }).join("");
    cards.push(`<section class="category-card">
      <header class="category-header" style="--category-progress:${solved / allProblems.length * 100}%"><div class="category-title"><span class="category-index">${String(categoryIndex).padStart(2, "0")}</span>${escapeHtml(category)}</div><div class="category-progress">${solved} / ${allProblems.length} 已通过</div></header>
      <ul class="problem-list">${rows}</ul>
    </section>`);
  }
  const markup = visibleCount ? cards.join("") : `<div class="empty-state"><strong>没有找到匹配的题目</strong><p>试试更短的关键词，或清除当前的专题、难度和状态筛选。</p><button class="button" type="button" data-clear-filters>清除全部筛选</button></div>`;
  if (markup !== catalogMarkup) {
    elements.category_grid.innerHTML = markup;
    catalogMarkup = markup;
  }
  elements.category_grid.classList.toggle("single-category", cards.length === 1);
  updateCategoryNavigation([{ category: "all", count: matchingCount }, ...categories]);
  elements.catalog_title.textContent = activeCategory === "all" ? "全部题目" : activeCategory;
  elements.catalog_result_count.textContent = visibleCount === PROBLEMS.length ? `共 ${PROBLEMS.length} 道` : `显示 ${visibleCount} / ${PROBLEMS.length} 道`;
  elements.clear_filter_button.disabled = !tokens.length && difficulty === "all" && status === "all" && activeCategory === "all";
}

function scheduleCatalogRender() {
  if (catalogRenderFrame != null) return;
  catalogRenderFrame = requestAnimationFrame(() => {
    catalogRenderFrame = null;
    renderCatalog();
  });
}

function sanitizeOfficialContent(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script,style,iframe,object,embed,form").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      if (["src", "href"].includes(attribute.name) && /^\s*javascript:/i.test(attribute.value)) node.removeAttribute(attribute.name);
    });
  });
  template.content.querySelectorAll("a").forEach((link) => {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
  return template.innerHTML;
}

function officialContentFor(problem) {
  if (!sanitizedContentBySlug.has(problem.slug)) {
    sanitizedContentBySlug.set(problem.slug, sanitizeOfficialContent(problem.content));
  }
  return sanitizedContentBySlug.get(problem.slug);
}
