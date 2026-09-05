const catalogFilterControls = [];
let openCatalogFilterControl = null;

function syncCatalogFilters() {
  for (const control of catalogFilterControls) {
    const { trigger, label, options, entries, name } = control;
    const selectedIndex = entries.findIndex(([value]) => value === trigger.value);
    label.textContent = entries[selectedIndex][1];
    trigger.setAttribute("aria-label", `${name}：${label.textContent}`);
    trigger.classList.toggle("has-filter", trigger.value !== "all");
    options.forEach((option, index) => option.setAttribute("aria-selected", String(index === selectedIndex)));
  }
}

function closeCatalogFilter() {
  const control = openCatalogFilterControl;
  if (!control) return;
  openCatalogFilterControl = null;
  control.menu.hidden = true;
  control.trigger.setAttribute("aria-expanded", "false");
  control.trigger.removeAttribute("aria-activedescendant");
  control.search = "";
}

function highlightCatalogFilterOption(control, index) {
  control.activeIndex = clamp(index, 0, control.options.length - 1);
  control.options.forEach((option, position) => option.classList.toggle("is-active", position === control.activeIndex));
  const active = control.options[control.activeIndex];
  control.trigger.setAttribute("aria-activedescendant", active.id);
  active.scrollIntoView({ block: "nearest" });
}

function openCatalogFilter(control) {
  closeCatalogFilter();
  syncCatalogFilters();
  openCatalogFilterControl = control;
  control.trigger.focus({ preventScroll: true });
  control.trigger.setAttribute("aria-expanded", "true");
  const { menu, trigger } = control;
  const bounds = trigger.getBoundingClientRect();
  // A body-level popup avoids the sticky toolbar's backdrop-filter containing block.
  menu.style.width = `${Math.min(Math.max(184, bounds.width), innerWidth - 16)}px`;
  menu.hidden = false;
  const below = innerHeight - bounds.bottom - 16;
  const above = bounds.top - 16;
  const preferBelow = below >= Math.min(menu.scrollHeight + 2, 256) || below >= above;
  menu.style.maxHeight = `${Math.max(40, preferBelow ? below : above)}px`;
  const box = menu.getBoundingClientRect();
  menu.style.left = `${clamp(bounds.right - box.width, 8, innerWidth - box.width - 8)}px`;
  menu.style.top = `${Math.max(8, preferBelow ? bounds.bottom + 8 : bounds.top - box.height - 8)}px`;
  highlightCatalogFilterOption(control, control.entries.findIndex(([value]) => value === trigger.value));
}

function selectCatalogFilterOption(control) {
  control.trigger.value = control.entries[control.activeIndex][0];
  closeCatalogFilter();
  control.trigger.dispatchEvent(new Event("change", { bubbles: true }));
  control.trigger.focus({ preventScroll: true });
}

function handleCatalogFilterKeydown(event) {
  const control = catalogFilterControls.find(({ trigger }) => trigger === event.target);
  if (!control || event.isComposing || event.metaKey || event.ctrlKey) return false;
  const open = openCatalogFilterControl === control;
  const key = event.key;
  if (key === "Tab") {
    if (open) selectCatalogFilterOption(control);
    return true;
  }
  if (key === "Escape") {
    if (!open) return false;
    event.preventDefault();
    closeCatalogFilter();
    return true;
  }
  if (["Enter", " ", "ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
    event.preventDefault();
    if (event.repeat && (key === "Enter" || key === " ")) return true;
    if (!open) openCatalogFilter(control);
    if (key === "Home" || key === "End") {
      highlightCatalogFilterOption(control, key === "Home" ? 0 : control.options.length - 1);
    } else if (open && (key === "ArrowDown" || key === "ArrowUp")) {
      highlightCatalogFilterOption(control, control.activeIndex + (key === "ArrowDown" ? 1 : -1));
    } else if (open) selectCatalogFilterOption(control);
    return true;
  }
  if (key.length === 1 && !event.altKey) {
    if (!open) openCatalogFilter(control);
    const now = performance.now();
    control.search = now - control.searchTime < 700 ? control.search + key : key;
    control.searchTime = now;
    const index = control.options.findIndex((option) => option.textContent.trim().startsWith(control.search));
    if (index >= 0) highlightCatalogFilterOption(control, index);
    event.preventDefault();
    return true;
  }
  return false;
}

function initializeCatalogFilters() {
  const definitions = [
    [elements.difficulty_filter, [["all", "全部难度"], ...Object.entries(DIFFICULTY).map(([value, { label }]) => [value, label])]],
    [elements.status_filter, [["all", "全部状态"], ...Object.entries(STATUS_LABEL), ["noted", "有笔记"]]],
  ];
  for (const [trigger, entries] of definitions) {
    const name = trigger.getAttribute("aria-label");
    const menu = document.createElement("div");
    menu.className = "filter-menu";
    menu.hidden = true;
    const list = document.createElement("div");
    list.id = `${trigger.id}-listbox`;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", name);
    const options = entries.map(([, label], index) => {
      const option = document.createElement("div");
      option.id = `${trigger.id}-option-${index}`;
      option.className = "filter-option";
      option.setAttribute("role", "option");
      const text = document.createElement("span");
      text.textContent = label;
      const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      check.setAttribute("viewBox", "0 0 16 16");
      check.setAttribute("aria-hidden", "true");
      check.innerHTML = '<path d="m3 8 3 3 7-7"></path>';
      option.append(text, check);
      list.append(option);
      return option;
    });
    menu.append(list);
    const control = { trigger, entries, name, menu, options, label: trigger.querySelector(".filter-label"), activeIndex: 0, search: "", searchTime: 0 };
    catalogFilterControls.push(control);
    trigger.addEventListener("click", () => openCatalogFilterControl === control ? closeCatalogFilter() : openCatalogFilter(control));
    // Keep DOM focus on the combobox for keyboard navigation and screen readers.
    menu.addEventListener("pointerdown", (event) => event.preventDefault());
    options.forEach((option, index) => {
      option.addEventListener("pointermove", () => {
        if (control.activeIndex !== index) highlightCatalogFilterOption(control, index);
      });
      option.addEventListener("click", () => {
        control.activeIndex = index;
        selectCatalogFilterOption(control);
      });
    });
    document.body.append(menu);
  }
  const dismissOutside = (event) => {
    const control = openCatalogFilterControl;
    if (control && !control.trigger.contains(event.target) && !control.menu.contains(event.target)) closeCatalogFilter();
  };
  document.addEventListener("pointerdown", dismissOutside);
  document.addEventListener("focusin", dismissOutside);
  window.addEventListener("scroll", (event) => {
    if (openCatalogFilterControl && !openCatalogFilterControl.menu.contains(event.target)) closeCatalogFilter();
  }, true);
  window.addEventListener("resize", closeCatalogFilter);
  window.addEventListener("blur", closeCatalogFilter);
  syncCatalogFilters();
}
