function route() {
  if (privacyMode) {
    if (location.hash) history.replaceState(history.state, "", location.href.split("#")[0]);
    return;
  }
  const match = location.hash.match(/^#problem=(.+)$/);
  if (match) {
    try {
      const slug = decodeURIComponent(match[1]);
      if (bySlug.has(slug)) {
        if (currentSlug !== slug) openProblem(slug, false);
        return;
      }
    } catch {
      // Treat malformed hashes as the catalog route.
    }
  }
  showCatalog(false);
}

function switchWorkspaceTab(tab, focus = false) {
  if (!workspaceTabButtons.some((button) => button.dataset.tab === tab)) return;
  for (const button of workspaceTabButtons) {
    const active = button.dataset.tab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  }
  for (const panel of workspacePanels) {
    const active = panel.id === `${tab}-panel`;
    panel.classList.toggle("active", active);
    panel.setAttribute("aria-hidden", String(!active));
  }
}

function keyboardTabTarget(event, tabs) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return null;
  const currentIndex = tabs.indexOf(event.target.closest('[role="tab"]'));
  if (currentIndex < 0) return null;
  event.preventDefault();
  if (event.key === "Home") return tabs[0];
  if (event.key === "End") return tabs.at(-1);
  const offset = event.key === "ArrowRight" ? 1 : -1;
  return tabs[(currentIndex + offset + tabs.length) % tabs.length];
}

function updateCurrentRecord(values, immediate = false) {
  if (!currentSlug) {
    if (immediate && saveTimer != null) saveState(true);
    return;
  }
  const record = recordFor(currentSlug);
  let changed = false;
  for (const [key, value] of Object.entries(values)) {
    if (record[key] === value) continue;
    record[key] = value;
    changed = true;
  }
  if (!changed) {
    if (immediate && saveTimer != null) saveState(true);
    return;
  }
  record.updatedAt = timestamp();
  saveState(immediate);
}

function touchRecord(type) {
  if (type === "code") updateCurrentRecord({ [currentCodeRecordKey()]: elements.code_editor.value });
  else updateCurrentRecord({ note: elements.notes_editor.value });
}

function syncCurrentEditors(immediate = false) {
  updateCurrentRecord({
    [currentCodeRecordKey()]: elements.code_editor.value,
    note: elements.notes_editor.value,
  }, immediate);
}

const EDITOR_INDENT = "    ";
const EDITOR_INDENT_SIZE = EDITOR_INDENT.length;
const EDITOR_BRACKET_PAIRS = Object.freeze({ "(": ")", "[": "]", "{": "}" });
const EDITOR_CLOSING_BRACKETS = new Set(Object.values(EDITOR_BRACKET_PAIRS));

function codeVisualColumn(text) {
  let column = 0;
  for (const character of text) {
    column += character === "\t" ? EDITOR_INDENT_SIZE - column % EDITOR_INDENT_SIZE : 1;
  }
  return column;
}

function clearEditorFeedback() {
  clearTimeout(editorFeedbackTimer);
  editorFeedbackTimer = null;
  elements.editor_feedback.textContent = "";
  elements.editor_statusbar.classList.remove("has-feedback");
}

function showEditorFeedback(message) {
  clearEditorFeedback();
  elements.editor_statusbar.classList.add("has-feedback");
  elements.editor_feedback.textContent = message;
  editorFeedbackTimer = setTimeout(clearEditorFeedback, 3200);
}

function updateCursorPosition() {
  const value = elements.code_editor.value;
  const cursor = elements.code_editor.selectionStart;
  let line = 1;
  let lineStart = 0;
  for (let index = value.indexOf("\n"); index >= 0 && index < cursor; index = value.indexOf("\n", index + 1)) {
    line += 1;
    lineStart = index + 1;
  }
  elements.cursor_position.textContent = `Ln ${line}, Col ${codeVisualColumn(value.slice(lineStart, cursor)) + 1}`;
}

function changeEditorSize(delta, persist = true) {
  const size = clamp(state.settings.editorSize + delta, EDITOR_SIZE_MIN, EDITOR_SIZE_MAX);
  state.settings.editorSize = size;
  document.documentElement.style.setProperty("--editor-size", `${size}px`);
  elements.font_size_label.textContent = size;
  elements.font_down_button.disabled = size <= EDITOR_SIZE_MIN;
  elements.font_up_button.disabled = size >= EDITOR_SIZE_MAX;
  if (persist) saveState();
}

const PYTHON_KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "case", "class", "continue", "def", "del", "elif", "else",
  "except", "False", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "match", "None",
  "nonlocal", "not", "or", "pass", "raise", "return", "True", "try", "while", "with", "yield",
]);
const PYTHON_BUILTINS = new Set([
  "abs", "all", "any", "bin", "bool", "bytearray", "bytes", "callable", "chr", "classmethod", "compile", "complex",
  "delattr", "dict", "dir", "divmod", "enumerate", "eval", "exec", "filter", "float", "format", "frozenset",
  "getattr", "globals", "hasattr", "hash", "help", "hex", "id", "input", "int", "isinstance", "issubclass", "iter",
  "len", "list", "locals", "map", "max", "memoryview", "min", "next", "object", "oct", "open", "ord", "pow",
  "print", "property", "range", "repr", "reversed", "round", "set", "setattr", "slice", "sorted", "staticmethod",
  "str", "sum", "super", "tuple", "type", "vars", "zip", "__import__",
]);
const PYTHON_NUMBER_PATTERN = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][+-]?[\d_]+)?j?)/y;
const PYTHON_DECORATOR_PATTERN = /@[A-Za-z_][\w.]*/y;
const PYTHON_WORD_PATTERN = /[A-Za-z_]\w*/y;
const PYTHON_OPERATOR_PATTERN = /(?:\*\*|\/\/|<<|>>|:=|==|!=|<=|>=|->|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|[-+*/%@&|^~<>=:])/y;

function matchPythonToken(pattern, source, index) {
  pattern.lastIndex = index;
  return pattern.exec(source)?.[0] || "";
}

function highlightPython(source) {
  let html = "";
  let index = 0;
  let expectsDefinition = false;
  let atLineStart = true;
  const append = (text, className = "") => {
    const escaped = escapeHtml(text);
    html += className ? `<span class="${className}">${escaped}</span>` : escaped;
    atLineStart = text.endsWith("\n");
  };
  const appendIndentation = (indentation) => {
    let column = 0;
    let chunk = "";
    for (const character of indentation) {
      chunk += character;
      column += character === "\t" ? EDITOR_INDENT_SIZE - column % EDITOR_INDENT_SIZE : 1;
      if (column % EDITOR_INDENT_SIZE === 0) {
        append(chunk, "py-indent-guide");
        chunk = "";
      }
    }
    if (chunk) append(chunk);
  };

  while (index < source.length) {
    const character = source[index];
    if (atLineStart && (character === " " || character === "\t")) {
      let indentationEnd = index + 1;
      while (source[indentationEnd] === " " || source[indentationEnd] === "\t") indentationEnd += 1;
      appendIndentation(source.slice(index, indentationEnd));
      index = indentationEnd;
      continue;
    }
    if (character === "\n") {
      append(character);
      expectsDefinition = false;
      index += 1;
      continue;
    }
    if (character === "#") {
      const end = source.indexOf("\n", index);
      const stop = end < 0 ? source.length : end;
      append(source.slice(index, stop), "py-comment");
      index = stop;
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = character;
      const triple = source.slice(index, index + 3) === quote.repeat(3);
      let cursor = index + (triple ? 3 : 1);
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += Math.min(2, source.length - cursor);
          continue;
        }
        if (triple && source.slice(cursor, cursor + 3) === quote.repeat(3)) {
          cursor += 3;
          break;
        }
        if (!triple && source[cursor] === quote) {
          cursor += 1;
          break;
        }
        if (!triple && source[cursor] === "\n") break;
        cursor += 1;
      }
      append(source.slice(index, cursor), "py-string");
      index = cursor;
      continue;
    }
    if (/\d/.test(character) || (character === "." && /\d/.test(source[index + 1] || ""))) {
      const number = matchPythonToken(PYTHON_NUMBER_PATTERN, source, index);
      if (number) {
        append(number, "py-number");
        index += number.length;
        continue;
      }
    }
    if (character === "@" && /[A-Za-z_]/.test(source[index + 1] || "")) {
      const decorator = matchPythonToken(PYTHON_DECORATOR_PATTERN, source, index);
      append(decorator, "py-decorator");
      index += decorator.length;
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      const word = matchPythonToken(PYTHON_WORD_PATTERN, source, index);
      let className = "";
      if (expectsDefinition) {
        className = "py-definition";
        expectsDefinition = false;
      } else if (PYTHON_KEYWORDS.has(word)) {
        className = "py-keyword";
        expectsDefinition = word === "def" || word === "class";
      } else if (PYTHON_BUILTINS.has(word)) {
        className = "py-builtin";
      } else if (word === "self" || word === "cls") {
        className = "py-self";
      }
      append(word, className);
      index += word.length;
      continue;
    }
    const operator = matchPythonToken(PYTHON_OPERATOR_PATTERN, source, index);
    if (operator) {
      append(operator, "py-operator");
      index += operator.length;
      continue;
    }
    append(character);
    index += 1;
  }
  return html;
}

function updateCodeHighlight() {
  cancelAnimationFrame(codeRenderFrame);
  codeRenderFrame = null;
  const source = elements.code_editor.value;
  if (source !== highlightedSource) {
    // Keep large pastes editable without creating thousands of token elements.
    const trailingSpace = source.endsWith("\n") || !source ? " " : "";
    if (source.length > 200_000) elements.code_highlight.textContent = source + trailingSpace;
    else elements.code_highlight.innerHTML = highlightPython(source) + trailingSpace;
    const lineCount = source.split("\n").length;
    if (lineCount !== displayedLineCount) {
      elements.code_line_numbers.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join("\n");
      displayedLineCount = lineCount;
    }
    highlightedSource = source;
  }
  elements.code_highlight.scrollTop = elements.code_editor.scrollTop;
  elements.code_highlight.scrollLeft = elements.code_editor.scrollLeft;
  elements.code_line_numbers.scrollTop = elements.code_editor.scrollTop;
}

function scheduleCodeHighlight() {
  if (codeRenderFrame != null) return;
  codeRenderFrame = requestAnimationFrame(() => {
    updateCodeHighlight();
    updateCursorPosition();
  });
}

function notifyCodeInput(editor = elements.code_editor) {
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function previousIndentStopOffset(whitespace) {
  const column = codeVisualColumn(whitespace);
  const targetColumn = Math.max(0, column - (column % EDITOR_INDENT_SIZE || EDITOR_INDENT_SIZE));
  let currentColumn = 0;
  for (let index = 0; index < whitespace.length; index += 1) {
    currentColumn += whitespace[index] === "\t" ? EDITOR_INDENT_SIZE - currentColumn % EDITOR_INDENT_SIZE : 1;
    if (currentColumn === targetColumn) return index + 1;
  }
  return 0;
}

function deleteCodeIndent() {
  const editor = elements.code_editor;
  const start = editor.selectionStart;
  if (start !== editor.selectionEnd || start === 0) return false;
  const lineStart = editor.value.lastIndexOf("\n", start - 1) + 1;
  const indentation = editor.value.slice(lineStart, start);
  if (!/^[ \t]+$/.test(indentation)) return false;
  const removalStart = lineStart + previousIndentStopOffset(indentation);
  editor.setRangeText("", removalStart, start, "end");
  notifyCodeInput(editor);
  return true;
}

function insertCodeBracketPair(opening) {
  const closing = EDITOR_BRACKET_PAIRS[opening];
  if (!closing) return false;
  const editor = elements.code_editor;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const nextCharacter = editor.value[end] || "";
  if (start === end && nextCharacter && !/[\s)\]};:,]/.test(nextCharacter)) return false;
  const selected = editor.value.slice(start, end);
  editor.setRangeText(`${opening}${selected}${closing}`, start, end, "start");
  editor.setSelectionRange(start + 1, start === end ? start + 1 : end + 1, editor.selectionDirection || "none");
  notifyCodeInput(editor);
  return true;
}

function skipCodeClosingBracket(closing) {
  const editor = elements.code_editor;
  const start = editor.selectionStart;
  if (start !== editor.selectionEnd || editor.value[start] !== closing) return false;
  editor.setSelectionRange(start + 1, start + 1);
  return true;
}

function deleteEmptyCodePair() {
  const editor = elements.code_editor;
  const start = editor.selectionStart;
  const closing = EDITOR_BRACKET_PAIRS[editor.value[start - 1]];
  if (start !== editor.selectionEnd || !closing || closing !== editor.value[start]) return false;
  editor.setRangeText("", start - 1, start + 1, "end");
  notifyCodeInput(editor);
  return true;
}

function indentCodeSelection(outdent = false) {
  const editor = elements.code_editor;
  const value = editor.value;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  if (start === end) {
    if (!outdent) {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const column = codeVisualColumn(value.slice(lineStart, start));
      const spaces = " ".repeat(EDITOR_INDENT_SIZE - column % EDITOR_INDENT_SIZE);
      editor.setRangeText(spaces, start, end, "end");
    } else {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const prefix = value.slice(lineStart, start);
      const removalStart = /^[ \t]+$/.test(prefix)
        ? previousIndentStopOffset(prefix)
        : prefix.endsWith("\t") ? prefix.length - 1 : prefix.length - Math.min(prefix.match(/ +$/)?.[0].length || 0, EDITOR_INDENT_SIZE);
      const removable = prefix.length - removalStart;
      if (!removable) return false;
      editor.setRangeText("", start - removable, start, "end");
    }
    notifyCodeInput(editor);
    return true;
  }

  const blockStart = value.lastIndexOf("\n", start - 1) + 1;
  const selectionEndForBlock = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = value.indexOf("\n", selectionEndForBlock);
  const blockEnd = nextBreak < 0 ? value.length : nextBreak;
  const lines = value.slice(blockStart, blockEnd).split("\n");
  let firstRemoved = 0;
  let totalRemoved = 0;
  const replacement = lines.map((line, index) => {
    if (!outdent) return `${EDITOR_INDENT}${line}`;
    const removed = line.startsWith("\t") ? 1 : Math.min(line.match(/^ +/)?.[0].length || 0, EDITOR_INDENT_SIZE);
    if (index === 0) firstRemoved = removed;
    totalRemoved += removed;
    return line.slice(removed);
  }).join("\n");
  if (outdent && totalRemoved === 0) return false;
  editor.setRangeText(replacement, blockStart, blockEnd, "start");
  if (outdent) {
    editor.setSelectionRange(Math.max(blockStart, start - firstRemoved), Math.max(blockStart, end - totalRemoved));
  } else {
    editor.setSelectionRange(start + (start > blockStart ? EDITOR_INDENT_SIZE : 0), end + lines.length * EDITOR_INDENT_SIZE);
  }
  notifyCodeInput(editor);
  return true;
}

function toggleCodeComment() {
  const editor = elements.code_editor;
  const value = editor.value;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const blockStart = value.lastIndexOf("\n", start - 1) + 1;
  const selectionEndForBlock = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = value.indexOf("\n", selectionEndForBlock);
  const blockEnd = nextBreak < 0 ? value.length : nextBreak;
  const lines = value.slice(blockStart, blockEnd).split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim());
  const shouldUncomment = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => /^\s*#/.test(line));
  const transformations = [];
  let lineOffset = 0;
  const replacement = lines.map((line) => {
    const indentation = line.match(/^\s*/)?.[0] || "";
    const remainder = line.slice(indentation.length);
    const position = blockStart + lineOffset + indentation.length;
    if (shouldUncomment) {
      const removed = remainder.match(/^# ?/)?.[0].length || 0;
      transformations.push({ position, removed, inserted: 0 });
      lineOffset += line.length + 1;
      return indentation + remainder.slice(removed);
    }
    transformations.push({ position, removed: 0, inserted: 2 });
    lineOffset += line.length + 1;
    return `${indentation}# ${remainder}`;
  }).join("\n");

  const mapOffset = (offset, includeInsertion) => {
    let adjustment = 0;
    for (const change of transformations) {
      if (offset < change.position) break;
      if (offset <= change.position + change.removed) {
        return change.position + adjustment + (includeInsertion ? change.inserted : 0);
      }
      adjustment += change.inserted - change.removed;
    }
    return offset + adjustment;
  };
  const mappedStart = mapOffset(start, start === end);
  const mappedEnd = start === end ? mappedStart : mapOffset(end, true);
  editor.setRangeText(replacement, blockStart, blockEnd, "start");
  editor.setSelectionRange(mappedStart, mappedEnd);
  notifyCodeInput(editor);
}

function insertIndentedNewline() {
  const editor = elements.code_editor;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const lineStart = editor.value.lastIndexOf("\n", start - 1) + 1;
  const beforeCursor = editor.value.slice(lineStart, start);
  const indentation = beforeCursor.match(/^\s*/)?.[0] || "";
  const statement = beforeCursor.slice(indentation.length);
  const commentStart = statement.indexOf("#");
  const codeBeforeComment = (commentStart < 0 ? statement : statement.slice(0, commentStart)).trimEnd();
  const needsNestedIndent = codeBeforeComment.endsWith(":");
  editor.setRangeText(`\n${indentation}${needsNestedIndent ? EDITOR_INDENT : ""}`, start, end, "end");
  notifyCodeInput(editor);
}
