export function createBackupTools({ slugs, defaultSettings, editorSizeBounds, paneWidthBounds, maxFileSize, maxCases, maxCaseLength }) {
  const format = "lc-offline-backup";
  const version = 1;
  const validSlugs = new Set(slugs);
  const maxTextLength = maxFileSize;
  const requiredRecordKeys = ["status", "attempts", "note", "updatedAt", "passedAt"];
  const optionalRecordKeys = ["code", "acmCode", "customCases", "acmCustomCases"];
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const date = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

  function checkKeys(value, required, optional = []) {
    if (!object(value)) throw new Error("必须是对象");
    for (const key of required) if (!Object.hasOwn(value, key)) throw new Error(`缺少字段 ${key}`);
    for (const key of Object.keys(value)) if (!required.includes(key) && !optional.includes(key)) throw new Error(`未知字段 ${key}`);
  }

  function validateSettings(value) {
    checkKeys(value, Object.keys(defaultSettings));
    if (!["light", "dark"].includes(value.theme)) throw new Error("主题无效");
    if (!["core", "acm"].includes(value.codeMode)) throw new Error("代码模式无效");
    if (!validSlugs.has(value.lastSlug)) throw new Error("上次学习的题目标识无效");
    if (typeof value.expandProblemByDefault !== "boolean") throw new Error("题面展开设置无效");
    if (!Number.isInteger(value.editorSize) || value.editorSize < editorSizeBounds[0] || value.editorSize > editorSizeBounds[1]) throw new Error("编辑器字号超出范围");
    if (!Number.isFinite(value.problemPaneWidth) || value.problemPaneWidth < paneWidthBounds[0] || value.problemPaneWidth > paneWidthBounds[1]) throw new Error("分栏宽度超出范围");
    return Object.fromEntries(Object.keys(defaultSettings).map((key) => [key, value[key]]));
  }

  function validateRecord(value) {
    checkKeys(value, ["slug", ...requiredRecordKeys], optionalRecordKeys);
    if (!validSlugs.has(value.slug)) throw new Error("未知题目标识");
    if (!["todo", "attempted", "solved"].includes(value.status)) throw new Error("学习状态无效");
    if (!Number.isSafeInteger(value.attempts) || value.attempts < 0) throw new Error("提交次数必须是非负整数");
    if (value.status === "todo" && value.attempts !== 0) throw new Error("未开始状态与提交次数不一致");
    for (const key of ["updatedAt", "passedAt"]) if (value[key] !== null && !date(value[key])) throw new Error(`${key} 必须是有效的 UTC 时间或 null`);
    if (value.status !== "solved" && value.passedAt !== null) throw new Error("未通过的记录不能包含通过时间");
    for (const key of ["note", "code", "acmCode"]) {
      if (key !== "note" && !Object.hasOwn(value, key)) continue;
      if (typeof value[key] !== "string" || value[key].length > maxTextLength) throw new Error(`${key} 必须是最多 ${maxTextLength} 个字符的文本`);
    }
    for (const key of ["customCases", "acmCustomCases"]) {
      if (!Object.hasOwn(value, key)) continue;
      if (!Array.isArray(value[key]) || value[key].length > maxCases || value[key].some((item) => typeof item !== "string" || item.length > maxCaseLength)) throw new Error(`${key} 最多 ${maxCases} 个样例，每个最多 ${maxCaseLength} 个字符`);
    }
    return Object.fromEntries([...requiredRecordKeys, ...optionalRecordKeys].filter((key) => Object.hasOwn(value, key)).map((key) => [key, structuredClone(value[key])]));
  }

  function checkSize(text) {
    if (text.length > maxFileSize || new TextEncoder().encode(text).length > maxFileSize) throw new Error(`备份不能超过 ${maxFileSize / 1024 / 1024} MiB`);
  }

  function serialize(snapshot, exportedAt = new Date()) {
    const records = slugs.filter((slug) => Object.hasOwn(snapshot.records, slug)).map((slug) => ({ slug, ...validateRecord({ slug, ...snapshot.records[slug] }) }));
    const text = JSON.stringify({ format, version, exportedAt: exportedAt.toISOString(), settings: validateSettings(snapshot.settings), records }, null, 2);
    checkSize(text);
    return text;
  }

  function parse(text) {
    checkSize(text);
    let backup;
    try { backup = JSON.parse(text); } catch { throw new Error("文件不是有效的 JSON 备份；Markdown 仅用于阅读导出"); }
    checkKeys(backup, ["format", "version", "exportedAt", "settings", "records"]);
    if (backup.format !== format || backup.version !== version) throw new Error("不支持的备份格式或版本");
    if (!date(backup.exportedAt)) throw new Error("导出时间无效");
    if (!Array.isArray(backup.records) || backup.records.length > slugs.length) throw new Error(`备份记录必须是最多 ${slugs.length} 项的数组`);
    const settings = validateSettings(backup.settings);
    const seen = new Set();
    const records = new Map();
    const errors = [];
    backup.records.forEach((value, index) => {
      if (typeof value?.slug === "string") {
        if (seen.has(value.slug)) throw new Error(`题目标识重复：${value.slug}，未导入任何记录`);
        seen.add(value.slug);
      }
      try {
        const record = validateRecord(value);
        records.set(value.slug, record);
      }
      catch (error) { errors.push({ index: index + 1, slug: typeof value?.slug === "string" ? value.slug : "", reason: error.message }); }
    });
    if (backup.records.length && !records.size) throw new Error(`没有有效记录：${errors.map((item) => `第 ${item.index} 条：${item.reason}`).join("；")}`);
    return { records, settings, errors, exportedAt: backup.exportedAt };
  }

  function hasContent(record) {
    return Boolean(record && (record.status !== "todo" || record.attempts || record.note || Object.hasOwn(record, "code") || Object.hasOwn(record, "acmCode") || record.customCases?.length || record.acmCustomCases?.length));
  }

  function equalField(first, second) {
    if (Array.isArray(first) && Array.isArray(second)) return first.length === second.length && first.every((value, index) => value === second[index]);
    return first === second;
  }

  function plan(backup, current, policy, restoreSettings) {
    if (!["keep", "overwrite"].includes(policy)) throw new Error("请选择有效的冲突处理方式");
    const next = { records: { ...current.records }, settings: structuredClone(restoreSettings ? backup.settings : current.settings) };
    const rows = [];
    const beforeRecords = new Map();
    for (const [slug, incoming] of backup.records) {
      const existing = current.records[slug];
      const changedFields = [...requiredRecordKeys, ...optionalRecordKeys].filter((key) => !equalField(existing?.[key], incoming[key]));
      const kind = changedFields.length === 0 ? "same" : hasContent(existing) ? "conflict" : "new";
      const apply = kind === "new" || (kind === "conflict" && policy === "overwrite");
      rows.push({ slug, kind, apply, existing, incoming, changedFields });
      if (apply) {
        beforeRecords.set(slug, structuredClone(existing));
        next.records[slug] = structuredClone(incoming);
      }
    }
    const settingsChanged = Object.keys(defaultSettings).some((key) => current.settings[key] !== next.settings[key]);
    return { next, rows, beforeRecords, settingsChanged, beforeSettings: settingsChanged ? structuredClone(current.settings) : null };
  }

  return { serialize, parse, plan };
}
