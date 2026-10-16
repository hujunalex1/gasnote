import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backupFileName,
  isBackupName,
  backupDateOf,
  pickPrunable,
  shouldRemindExport,
  BACKUP_KEEP,
  STALE_DAYS,
} from '../src/lib/backup.ts';

const DAY = 24 * 60 * 60 * 1000;

test('backupFileName：拼出带日期的文件名', () => {
  assert.equal(backupFileName('2026-10-16'), 'gasnote-2026-10-16.json');
});

test('backupFileName 与 backupDateOf 往返一致', () => {
  for (const d of ['2026-01-01', '2026-10-16', '2024-02-29', '1999-12-31']) {
    assert.equal(backupDateOf(backupFileName(d)), d);
  }
});

test('isBackupName：只认严格格式', () => {
  assert.equal(isBackupName('gasnote-2026-10-16.json'), true);
  // 以下都是"像但不是"——必须拒绝，因为它们决定我们敢不敢删
  for (const n of [
    'gasnote-2026-1-1.json',        // 月份没补零
    'gasnote-notes.json',           // 不是日期
    'gasnote-2026-10-16.json.bak',  // 多了后缀
    '我的gasnote-2026-10-16.json',   // 有前缀
    'GASNOTE-2026-10-16.json',      // 大小写不同
    'gasnote-2026-13-99.json',      // 月份日期越界
    'gasnote-.json',
    'gasnote-2026-10-16.txt',
    '',
  ]) {
    assert.equal(isBackupName(n), false, `应拒绝: ${n}`);
  }
});

test('backupDateOf：非备份文件返回 null', () => {
  assert.equal(backupDateOf('IMG_1234.jpg'), null);
  assert.equal(backupDateOf('gasnote-2026-13-01.json'), null);
  assert.equal(backupDateOf('gasnote-2026-02-30.json'), null, '2 月 30 日不存在');
});

// ---- pickPrunable：这是全项目唯一会删用户文件的地方 ----

test('pickPrunable：无关文件绝不入选', () => {
  const names = [
    '照片.jpg', 'gasnote-notes.json', '录音.m4a', '.DS_Store',
    'gasnote-2026-10-16.json.bak', '我的gasnote-2026-10-16.json',
    'gasnote-2026-10-16.json',
  ];
  assert.deepEqual(pickPrunable(names, 1), [], '只有一个是合法备份，keep=1 时不该删任何东西');
});

test('pickPrunable：无关文件混在多份备份里也不会被选中', () => {
  const names = [
    '报告.pdf',
    'gasnote-2026-10-01.json',
    'gasnote-2026-10-02.json',
    'gasnote-2026-10-03.json',
    'notes.txt',
  ];
  assert.deepEqual(pickPrunable(names, 2).sort(), ['gasnote-2026-10-01.json']);
});

test('pickPrunable：不足或正好等于 keep 时不删', () => {
  assert.deepEqual(pickPrunable([], 5), []);
  assert.deepEqual(pickPrunable(['gasnote-2026-10-01.json'], 5), []);
  assert.deepEqual(
    pickPrunable(['gasnote-2026-10-01.json', 'gasnote-2026-10-02.json'], 2),
    [],
  );
});

test('pickPrunable：超出 keep 时留下最新的，删掉更早的', () => {
  const names = [
    'gasnote-2026-10-01.json',
    'gasnote-2026-10-02.json',
    'gasnote-2026-10-03.json',
    'gasnote-2026-10-04.json',
    'gasnote-2026-10-05.json',
  ];
  assert.deepEqual(pickPrunable(names, 3).sort(), [
    'gasnote-2026-10-01.json',
    'gasnote-2026-10-02.json',
  ]);
});

test('pickPrunable：跨年按日期排序，不是按字符串巧合', () => {
  const names = [
    'gasnote-2025-12-31.json',
    'gasnote-2026-01-01.json',
    'gasnote-2025-11-30.json',
  ];
  assert.deepEqual(pickPrunable(names, 1).sort(), [
    'gasnote-2025-11-30.json',
    'gasnote-2025-12-31.json',
  ]);
});

test('pickPrunable：输入顺序不影响结果', () => {
  const names = ['gasnote-2026-10-03.json', 'gasnote-2026-10-01.json', 'gasnote-2026-10-02.json'];
  assert.deepEqual(pickPrunable(names, 1), ['gasnote-2026-10-01.json', 'gasnote-2026-10-02.json']);
  assert.deepEqual(pickPrunable([...names].reverse(), 1), ['gasnote-2026-10-01.json', 'gasnote-2026-10-02.json']);
});

test('pickPrunable：keep 退化成 0 或负数时兜底为 1，绝不删光', () => {
  const names = ['gasnote-2026-10-01.json', 'gasnote-2026-10-02.json'];
  assert.deepEqual(pickPrunable(names, 0), ['gasnote-2026-10-01.json']);
  assert.deepEqual(pickPrunable(names, -5), ['gasnote-2026-10-01.json']);
});

test('BACKUP_KEEP 是个不让人心慌的整数', () => {
  assert.ok(Number.isInteger(BACKUP_KEEP) && BACKUP_KEEP >= 3);
});

// ---- shouldRemindExport ----

test('shouldRemindExport：没有记录时不提醒（没东西可丢）', () => {
  assert.equal(shouldRemindExport(null, Date.now(), 0), false);
  assert.equal(shouldRemindExport(0, Date.now(), 0), false);
});

test('shouldRemindExport：有记录但从未备份过 → 提醒', () => {
  assert.equal(shouldRemindExport(null, Date.now(), 3), true);
});

test('shouldRemindExport：超过阈值才提醒', () => {
  const now = 1_700_000_000_000;
  assert.equal(shouldRemindExport(now - (STALE_DAYS - 1) * DAY, now, 1), false);
  assert.equal(shouldRemindExport(now - STALE_DAYS * DAY, now, 1), false, '正好等于阈值不算"超过"');
  assert.equal(shouldRemindExport(now - (STALE_DAYS + 1) * DAY, now, 1), true);
});

test('shouldRemindExport：时钟回拨（备份时间在未来）不提醒', () => {
  const now = 1_700_000_000_000;
  assert.equal(shouldRemindExport(now + 100 * DAY, now, 5), false);
});

test('shouldRemindExport：刚好压线的一刻', () => {
  const now = 1_700_000_000_000;
  assert.equal(shouldRemindExport(now - STALE_DAYS * DAY - 1, now, 1), true);
  assert.equal(shouldRemindExport(now - STALE_DAYS * DAY + 1, now, 1), false);
});
