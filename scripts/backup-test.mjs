import assert from "node:assert/strict";
import { createBackupTools } from "../src/backup.mjs";

export function verifyBackupTools(check) {
  const settings = { theme: "dark", editorSize: 14, lastSlug: "first", expandProblemByDefault: true, problemPaneWidth: 43, codeMode: "core" };
  const config = { slugs: ["first", "second", "third"], defaultSettings: settings, editorSizeBounds: [12, 20], paneWidthBounds: [28, 68], maxFileSize: 50 * 1024 * 1024, maxCases: 20, maxCaseLength: 50_000 };
  const tools = createBackupTools(config);
  const empty = { status: "todo", attempts: 0, note: "", updatedAt: null, passedAt: null };
  const record = { status: "solved", attempts: 3, note: "中文 | 笔记\n🚀 <script>", updatedAt: "2026-09-03T00:00:00.000Z", passedAt: "2026-09-03T00:00:00.000Z", code: "class Solution:\n    pass", acmCode: "", customCases: ["[[1, 2], 3]"], acmCustomCases: ["2\n1 2\n3"] };
  const snapshot = { records: { first: record, second: { ...empty, customCases: [] } }, settings: { theme: "light", editorSize: 18, lastSlug: "second", expandProblemByDefault: false, problemPaneWidth: 51.5, codeMode: "acm" } };
  const exportedAt = new Date("2026-09-04T00:00:00.000Z");
  const text = tools.serialize(snapshot, exportedAt);
  const backup = tools.parse(text);
  const restored = tools.plan(backup, { records: {}, settings }, "keep", true);
  assert.deepEqual(restored.next, snapshot);
  assert.equal(restored.beforeRecords.size, 2);
  assert.equal(restored.settingsChanged, true);
  assert.equal(tools.serialize(restored.next, exportedAt), text);
  check(true, "JSON 从空白环境完整恢复两套代码、两套样例、笔记、进度和全部设置");
  assert.equal(Object.hasOwn(restored.next.records.first, "acmCode"), true);
  assert.equal(restored.next.records.first.acmCode, "");
  assert.equal(Object.hasOwn(restored.next.records.second, "code"), false);
  assert.deepEqual(restored.next.records.second.customCases, []);
  check(true, "备份保留空代码、未保存代码和空样例列表的区别");

  const current = { records: { first: { ...record, note: "本地修改" }, third: { ...empty, code: "keep me" } }, settings };
  const before = structuredClone(current);
  const keep = tools.plan(backup, current, "keep", false);
  assert.equal(keep.next.records.first.note, "本地修改");
  assert.equal(keep.next.records.third.code, "keep me");
  assert.deepEqual(keep.next.settings, settings);
  assert.equal(keep.rows[0].kind, "conflict");
  assert.equal(keep.beforeRecords.size, 1);
  const overwrite = tools.plan(backup, current, "overwrite", true);
  assert.deepEqual(overwrite.next.records.first, record);
  assert.deepEqual(overwrite.next.records.third, current.records.third);
  assert.deepEqual(overwrite.beforeRecords.get("first"), current.records.first);
  assert.deepEqual(current, before);
  overwrite.next.records.first.customCases.push("independent");
  assert.equal(backup.records.get("first").customCases.length, 1);
  check(true, "预览无副作用，默认保留冲突、覆盖只影响备份中的题目且数据不共享可变引用");

  const same = tools.plan(backup, snapshot, "keep", true);
  assert.equal(same.beforeRecords.size, 0);
  assert.equal(same.settingsChanged, false);
  assert.ok(same.rows.every((row) => row.kind === "same"));
  const cleared = tools.parse(tools.serialize({ records: { first: empty }, settings }));
  assert.equal(tools.plan(cleared, current, "keep", false).next.records.first.note, "本地修改");
  assert.equal(Object.hasOwn(tools.plan(cleared, current, "overwrite", false).next.records.first, "code"), false);
  const noRecords = tools.parse(tools.serialize({ records: {}, settings }));
  assert.deepEqual(tools.plan(noRecords, current, "overwrite", true).next.records, current.records);
  check(true, "重复导入不改数据，空备份不清空本地，完整覆盖能恢复代码字段缺省状态");

  const mutate = (change) => { const value = JSON.parse(text); change(value); return JSON.stringify(value); };
  const invalidMixed = tools.parse(mutate((value) => { value.records[1].customCases = Array(21).fill("[]"); }));
  assert.equal(invalidMixed.records.size, 1);
  assert.equal(invalidMixed.errors[0].index, 2);
  assert.match(invalidMixed.errors[0].reason, /customCases/);
  const unknown = tools.parse(mutate((value) => { value.records[1].slug = "unknown"; }));
  assert.equal(unknown.errors[0].reason, "未知题目标识");
  const invalidField = tools.parse(mutate((value) => { value.records[0].attempts = -1; }));
  assert.equal(invalidField.errors[0].slug, "first");
  assert.equal(invalidField.records.has("first"), false);
  check(true, "部分损坏记录整体跳过，预览提供具体题目、序号和原因");

  const invalidCases = [
    [(value) => { value.version = 2; }, /版本/],
    [(value) => { value.format = "other"; }, /格式/],
    [(value) => { value.extra = 1; }, /未知字段/],
    [(value) => { delete value.settings; }, /缺少字段/],
    [(value) => { value.settings.codeMode = "legacy"; }, /代码模式/],
    [(value) => { value.settings.editorSize = 21; }, /字号/],
    [(value) => { value.exportedAt = "2026-02-30T00:00:00.000Z"; }, /时间/],
    [(value) => { value.records[1].slug = "first"; }, /重复/],
    [(value) => { value.records = [null]; }, /没有有效记录/],
    [(value) => { value.records = [{ ...value.records[0], passedAt: "not-a-date" }]; }, /passedAt/],
    [(value) => { value.records = [{ ...value.records[0], code: null }]; }, /code/],
    [(value) => { value.records = [{ ...value.records[0], status: "todo" }]; }, /不一致/],
  ];
  for (const [change, message] of invalidCases) assert.throws(() => tools.parse(mutate(change)), message);
  assert.throws(() => tools.parse("# Markdown\n<!-- LC_RECORD -->"), /JSON/);
  assert.throws(() => tools.parse("[]"), /必须是对象/);
  assert.throws(() => tools.plan(backup, current, "invalid", false), /冲突/);
  check(true, "拒绝旧 Markdown、重复题目、不支持版本、非法设置和时间及损坏文件");

  const small = createBackupTools({ ...config, maxFileSize: 600 });
  assert.throws(() => small.parse("中".repeat(201)), /MiB/);
  assert.throws(() => small.serialize(snapshot), /MiB/);
  check(true, "导入导出按 UTF-8 字节限制体积，超限不会生成不可恢复的备份");
}
