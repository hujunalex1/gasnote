import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecords, parseImport, serialize, newId, newIdFallback, SCHEMA_VERSION } from '../src/store.js';

const good = (over = {}) => ({ id: 'a1', date: '2026-10-15', amount: 320.5, note: '', ...over });

test('newId：一千次调用互不相同', () => {
  const ids = new Set();
  for (let i = 0; i < 1000; i++) ids.add(newId());
  assert.equal(ids.size, 1000);
});

// Review Focus 第 4 条：同一毫秒内的连续录入。
// 必须直接测 newIdFallback —— Node 里 crypto.randomUUID 一定存在，
// 走 newId() 只会命中 UUID 分支，回退路径一个测试都覆盖不到，
// 而真会撞号（同一毫秒内）的恰恰只有回退分支。
test('newIdFallback：一千次调用互不相同', () => {
  const ids = new Set();
  for (let i = 0; i < 1000; i++) ids.add(newIdFallback());
  assert.equal(ids.size, 1000);
});

test('newIdFallback：同一毫秒内连续调用也不撞号', () => {
  const ids = new Set();
  for (let i = 0; i < 500; i++) ids.add(newIdFallback());
  assert.equal(ids.size, 500);
});

test('normalizeRecords：接受合法记录', () => {
  const r = normalizeRecords([good()]);
  assert.equal(r.ok, true);
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].date, '2026-10-15');
  assert.equal(r.records[0].amount, 320.5);
});

test('normalizeRecords：非数组被拒绝', () => {
  assert.equal(normalizeRecords('nope').ok, false);
  assert.equal(normalizeRecords(null).ok, false);
  assert.equal(normalizeRecords({}).ok, false);
});

test('normalizeRecords：空数组是合法的', () => {
  const r = normalizeRecords([]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.records, []);
});

test('normalizeRecords：元素不是对象被拒绝', () => {
  assert.equal(normalizeRecords([1]).ok, false);
  assert.equal(normalizeRecords([null]).ok, false);
  assert.equal(normalizeRecords([[]]).ok, false);
});

test('normalizeRecords：日期格式错被拒绝', () => {
  assert.equal(normalizeRecords([good({ date: '2026/10/15' })]).ok, false);
  assert.equal(normalizeRecords([good({ date: '2026-02-30' })]).ok, false);
  assert.equal(normalizeRecords([good({ date: 20261015 })]).ok, false);
});

test('normalizeRecords：金额为负/零/NaN/字符串被拒绝', () => {
  assert.equal(normalizeRecords([good({ amount: -1 })]).ok, false);
  assert.equal(normalizeRecords([good({ amount: 0 })]).ok, false);
  assert.equal(normalizeRecords([good({ amount: NaN })]).ok, false);
  assert.equal(normalizeRecords([good({ amount: Infinity })]).ok, false);
  assert.equal(normalizeRecords([good({ amount: '320' })]).ok, false);
});

test('normalizeRecords：错误信息指明是第几条', () => {
  const r = normalizeRecords([good(), good({ id: 'b2', amount: -1 })]);
  assert.equal(r.ok, false);
  assert.match(r.error, /第 2 条/);
});

// 修复条件：id 是内部实现细节，坏掉不该让整份备份作废
test('normalizeRecords：id 缺失时补发', () => {
  const r = normalizeRecords([{ date: '2026-10-15', amount: 100 }]);
  assert.equal(r.ok, true);
  assert.equal(typeof r.records[0].id, 'string');
  assert.ok(r.records[0].id.length > 0);
});

test('normalizeRecords：id 为空字符串时补发', () => {
  const r = normalizeRecords([good({ id: '' })]);
  assert.equal(r.ok, true);
  assert.ok(r.records[0].id.length > 0);
});

test('normalizeRecords：id 重复时补发，且结果里所有 id 唯一', () => {
  const r = normalizeRecords([good({ id: 'dup' }), good({ id: 'dup' }), good({ id: 'dup' })]);
  assert.equal(r.ok, true);
  const ids = r.records.map((x) => x.id);
  assert.equal(new Set(ids).size, 3);
});

test('normalizeRecords：note 缺失时补空串，非字符串时也补空串', () => {
  const r = normalizeRecords([good({ note: undefined }), good({ id: 'b2', note: 42 })]);
  assert.equal(r.ok, true);
  assert.equal(r.records[0].note, '');
  assert.equal(r.records[1].note, '');
});

test('normalizeRecords：金额超过两位小数被归整', () => {
  const r = normalizeRecords([good({ amount: 320.555 })]);
  assert.equal(r.ok, true);
  assert.equal(r.records[0].amount, 320.56);
});

test('parseImport：接受 serialize 出来的字符串（往返一致）', () => {
  const original = [good()];
  const r = parseImport(serialize(original));
  assert.equal(r.ok, true);
  assert.deepEqual(r.records, original);
});

test('parseImport：非 JSON 被拒绝', () => {
  const r = parseImport('这不是 json');
  assert.equal(r.ok, false);
  assert.equal(typeof r.error, 'string');
});

test('parseImport：顶层是数组或标量被拒绝', () => {
  assert.equal(parseImport('[]').ok, false);
  assert.equal(parseImport('123').ok, false);
  assert.equal(parseImport('"x"').ok, false);
});

test('parseImport：版本不认识被拒绝', () => {
  const r = parseImport(JSON.stringify({ version: 99, records: [] }));
  assert.equal(r.ok, false);
  assert.match(r.error, /版本/);
});

test('parseImport：版本缺失被拒绝', () => {
  assert.equal(parseImport(JSON.stringify({ records: [] })).ok, false);
});

test('parseImport：records 非数组被拒绝', () => {
  assert.equal(parseImport(JSON.stringify({ version: SCHEMA_VERSION, records: 'x' })).ok, false);
});

test('parseImport：部分记录非法时整体拒绝，不产生部分结果', () => {
  const payload = JSON.stringify({
    version: SCHEMA_VERSION,
    records: [good(), good({ id: 'b2', date: 'bad' })],
  });
  const r = parseImport(payload);
  assert.equal(r.ok, false);
  assert.equal(r.records, undefined); // 关键：拒绝时不能给出半截数据
});

test('serialize：产物带版本号且能被 parseImport 读回', () => {
  const text = serialize([good()]);
  const parsed = JSON.parse(text);
  assert.equal(parsed.version, SCHEMA_VERSION);
  assert.equal(parsed.records.length, 1);
});
