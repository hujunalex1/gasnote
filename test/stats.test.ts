import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthKey, monthlyTotal, yearlySummary, allYears, barHeights, summaryCards,
  economySegments, economySummary, odometerBounds, segmentPer100km,
} from '../src/lib/stats.ts';

const rec = (date, amount, id = date + amount) => ({ id, date, amount, note: '' });

const EMPTY = { total: 0, count: 0, avg: 0 };

test('monthKey 截取年月', () => {
  assert.equal(monthKey('2026-10-15'), '2026-10');
});

test('monthlyTotal：空数组返回全零而不是 NaN', () => {
  const r = monthlyTotal([], '2026-10');
  assert.deepEqual(r, EMPTY);
  assert.ok(!Number.isNaN(r.avg));
});

test('monthlyTotal：没有匹配记录时返回全零', () => {
  assert.deepEqual(monthlyTotal([rec('2026-09-01', 100)], '2026-10'), EMPTY);
});

test('monthlyTotal：单条记录', () => {
  assert.deepEqual(monthlyTotal([rec('2026-10-15', 320.5)], '2026-10'), {
    total: 320.5, count: 1, avg: 320.5,
  });
});

test('monthlyTotal：多条记录合计与平均', () => {
  const records = [rec('2026-10-05', 300), rec('2026-10-15', 400), rec('2026-10-25', 500)];
  assert.deepEqual(monthlyTotal(records, '2026-10'), { total: 1200, count: 3, avg: 400 });
});

test('monthlyTotal：只统计目标月份，不串月', () => {
  const records = [rec('2026-09-30', 999), rec('2026-10-01', 100), rec('2026-11-01', 888)];
  assert.deepEqual(monthlyTotal(records, '2026-10'), { total: 100, count: 1, avg: 100 });
});

// 金额浮点累加：0.1 + 0.2 直接算会得到 0.30000000000000004
test('monthlyTotal：浮点金额累加不产生误差', () => {
  const records = [rec('2026-10-01', 0.1), rec('2026-10-02', 0.2)];
  assert.equal(monthlyTotal(records, '2026-10').total, 0.3);
});

test('monthlyTotal：多笔带角分的金额累加精确', () => {
  const records = [rec('2026-10-01', 320.55), rec('2026-10-02', 199.99), rec('2026-10-03', 7.46)];
  assert.equal(monthlyTotal(records, '2026-10').total, 528);
});

test('monthlyTotal：平均金额按分四舍五入', () => {
  const records = [rec('2026-10-01', 100), rec('2026-10-02', 100), rec('2026-10-03', 100.01)];
  assert.equal(monthlyTotal(records, '2026-10').avg, 100);
});

test('yearlySummary：months 恒定 12 项，且月份编号为 1..12', () => {
  const r = yearlySummary([], 2026);
  assert.equal(r.months.length, 12);
  assert.deepEqual(r.months.map((m) => m.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('yearlySummary：无记录的年份返回 12 个零项', () => {
  const r = yearlySummary([], 2026);
  assert.equal(r.total, 0);
  assert.equal(r.count, 0);
  for (const m of r.months) {
    assert.equal(m.total, 0);
    assert.equal(m.count, 0);
  }
});

test('yearlySummary：无记录的月份补零，有记录的月份填值', () => {
  const records = [rec('2026-01-10', 100), rec('2026-10-15', 320.5), rec('2026-10-20', 79.5)];
  const r = yearlySummary(records, 2026);
  assert.equal(r.months[0].total, 100);
  assert.equal(r.months[0].count, 1);
  assert.equal(r.months[1].total, 0);   // 2 月无记录
  assert.equal(r.months[1].count, 0);
  assert.equal(r.months[9].total, 400); // 10 月
  assert.equal(r.months[9].count, 2);
});

test('yearlySummary：年合计等于各月之和', () => {
  const records = [rec('2026-01-10', 100), rec('2026-10-15', 320.5), rec('2026-10-20', 79.5)];
  const r = yearlySummary(records, 2026);
  assert.equal(r.total, 500);
  assert.equal(r.count, 3);
});

test('yearlySummary：跨年记录互不污染', () => {
  const records = [rec('2025-10-15', 999), rec('2026-10-15', 100)];
  assert.equal(yearlySummary(records, 2025).total, 999);
  assert.equal(yearlySummary(records, 2026).total, 100);
});

test('yearlySummary：2 月闰年正常归入', () => {
  const records = [rec('2024-02-29', 250)];
  const r = yearlySummary(records, 2024);
  assert.equal(r.months[1].total, 250);
});

// Review Focus 第 5 条：跨年后的年份选择器
test('allYears：空记录时仍然包含当前年份', () => {
  assert.deepEqual(allYears([], 2027), [2027]);
});

test('allYears：包含记录年份与当前年份，降序排列', () => {
  const records = [rec('2025-01-01', 1), rec('2024-01-01', 1), rec('2026-01-01', 1)];
  assert.deepEqual(allYears(records, 2027), [2027, 2026, 2025, 2024]);
});

test('allYears：当前年份已存在于记录中时不重复', () => {
  const records = [rec('2026-01-01', 1), rec('2026-05-01', 1)];
  assert.deepEqual(allYears(records, 2026), [2026]);
});

test('barHeights：全零时返回全零，不产生 NaN', () => {
  const months = yearlySummary([], 2026).months;
  const heights = barHeights(months);
  assert.equal(heights.length, 12);
  for (const h of heights) {
    assert.equal(h, 0);
    assert.ok(!Number.isNaN(h));
  }
});

test('barHeights：最高月份为 1，其余按比例', () => {
  const months = yearlySummary([
    rec('2026-01-10', 100),
    rec('2026-02-10', 50),
    rec('2026-03-10', 200),
  ], 2026).months;
  const heights = barHeights(months);
  assert.equal(heights[2], 1);
  assert.equal(heights[0], 0.5);
  assert.equal(heights[1], 0.25);
});

// spec §7：「年份选择器切换 → 概览卡「本年」跟随更新」
const NOW = new Date(2026, 9, 15); // 本地时间 2026-10-15
const CARDS = [rec('2025-03-10', 700), rec('2026-10-15', 400)];

test('summaryCards：本年卡跟随所选年份，而不是恒定显示当前年', () => {
  const c = summaryCards(CARDS, 2025, NOW);
  assert.equal(c.year.total, 700);
  assert.equal(c.year.count, 1);
});

test('summaryCards：选中当前年时本年卡就是当前年的数', () => {
  const c = summaryCards(CARDS, 2026, NOW);
  assert.equal(c.year.total, 400);
});

test('summaryCards：isCurrentYear 随所选年份变化', () => {
  assert.equal(summaryCards(CARDS, 2026, NOW).isCurrentYear, true);
  assert.equal(summaryCards(CARDS, 2025, NOW).isCurrentYear, false);
});

test('summaryCards：本月卡恒定看真实的当前月，不随所选年份变化', () => {
  assert.equal(summaryCards(CARDS, 2026, NOW).month.total, 400); // 2026-10
  assert.equal(summaryCards(CARDS, 2025, NOW).month.total, 400); // 仍是 2026-10
});

test('summaryCards：无记录时全零，不产生 NaN', () => {
  const c = summaryCards([], 2026, NOW);
  assert.deepEqual(c.month, { total: 0, count: 0, avg: 0 });
  assert.deepEqual(c.year, { total: 0, count: 0, avg: 0 });
  assert.ok(!Number.isNaN(c.year.avg));
});

test('summaryCards：本年平均金额走整数分，与项目不变量一致', () => {
  const records = [rec('2026-01-01', 100), rec('2026-01-02', 100), rec('2026-01-03', 100.01)];
  assert.equal(summaryCards(records, 2026, new Date(2026, 0, 5)).year.avg, 100);
});

// ---- 油耗 ----

const fill = (date, odometer, liters, amount, extra = {}) => ({
  id: `${date}-${odometer}`, date, amount, note: '', odometer, liters, ...extra,
});

test('economySegments：空数组 / 只有旧记录时没有区间', () => {
  assert.deepEqual(economySegments([]), []);
  assert.deepEqual(economySegments([rec('2026-10-01', 300), rec('2026-10-10', 300)]), []);
});

test('economySegments：第一次加满只是起点，第二次才出一段', () => {
  const segs = economySegments([
    fill('2026-10-01', 10000, 40, 300),
    fill('2026-10-10', 10500, 38.5, 290.5),
  ]);
  assert.deepEqual(segs, [
    { endId: '2026-10-10-10500', endDate: '2026-10-10', distance: 500, liters: 38.5, cost: 290.5 },
  ]);
});

test('economySegments：中间没加满的升数和花费累加进下一段', () => {
  const segs = economySegments([
    fill('2026-10-01', 10000, 40, 300),
    fill('2026-10-05', 10200, 10.1, 80.1, { full: false }),
    fill('2026-10-10', 10600, 30.2, 230.2),
  ]);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].distance, 600);
  assert.equal(segs[0].liters, 40.3);
  assert.equal(segs[0].cost, 310.3);
});

test('economySegments：未加满且没填里程也照样累加', () => {
  const segs = economySegments([
    fill('2026-10-01', 10000, 40, 300),
    fill('2026-10-05', undefined, 10, 80, { full: false }),
    fill('2026-10-10', 10500, 30, 230),
  ]);
  assert.equal(segs[0].liters, 40);
});

test('economySegments：中间有一次没填升数，链条打断', () => {
  const segs = economySegments([
    fill('2026-10-01', 10000, 40, 300),
    rec('2026-10-05', 80),
    fill('2026-10-10', 10500, 30, 230),
    fill('2026-10-20', 11000, 35, 260),
  ]);
  assert.deepEqual(segs.map((s) => s.endDate), ['2026-10-20']);
  assert.equal(segs[0].distance, 500);
});

test('economySegments：加满但没填里程，链条打断', () => {
  const segs = economySegments([
    fill('2026-10-01', 10000, 40, 300),
    fill('2026-10-05', undefined, 40, 300),
    fill('2026-10-10', 10500, 30, 230),
  ]);
  assert.deepEqual(segs, []);
});

test('economySegments：里程倒退时不出一段，并以它为新起点', () => {
  const segs = economySegments([
    fill('2026-10-01', 10000, 40, 300),
    fill('2026-10-05', 9000, 40, 300),
    fill('2026-10-10', 9400, 30, 230),
  ]);
  assert.deepEqual(segs.map((s) => s.distance), [400]);
});

test('economySegments：录入顺序乱了也按日期、同日按里程排', () => {
  const segs = economySegments([
    fill('2026-10-10', 10600, 30, 230),
    fill('2026-10-01', 10300, 20, 150),
    fill('2026-10-01', 10000, 40, 300),
  ]);
  assert.deepEqual(segs.map((s) => s.distance), [300, 300]);
});

test('economySegments：升数累加没有浮点漂移', () => {
  const records = [fill('2026-01-01', 1000, 40, 300)];
  for (let i = 0; i < 10; i++) {
    records.push(fill(`2026-01-${String(i + 2).padStart(2, '0')}`, undefined, 0.1, 0.1, { full: false }));
  }
  records.push(fill('2026-01-20', 1100, 0.2, 0.2));
  assert.equal(economySegments(records)[0].liters, 1.2);
});

test('segmentPer100km：升数÷里程×100', () => {
  assert.equal(segmentPer100km({ endId: 'a', endDate: '2026-10-01', distance: 500, liters: 38.5, cost: 0 }), 7.7);
});

test('economySummary：没有区间时油耗为 null，不是 NaN', () => {
  const s = economySummary([]);
  assert.equal(s.per100km, null);
  assert.equal(s.costPerKm, null);
});

test('economySummary：按总升数÷总里程加权，而不是各段平均', () => {
  const s = economySummary([
    { endId: 'a', endDate: '2026-10-01', distance: 100, liters: 10, cost: 80 },
    { endId: 'b', endDate: '2026-10-10', distance: 900, liters: 60, cost: 480 },
  ]);
  assert.equal(s.distance, 1000);
  assert.equal(s.per100km, 7);
  assert.equal(s.costPerKm, 0.56);
});

test('odometerBounds：只看其他日期，没有约束的一侧为 null', () => {
  const records = [
    fill('2026-10-01', 10000, 40, 300),
    fill('2026-10-10', 10500, 40, 300),
    fill('2026-10-20', 11000, 40, 300),
    rec('2026-10-15', 100),
  ];
  assert.deepEqual(odometerBounds(records, '2026-10-15'), { min: 10500, max: 11000 });
  assert.deepEqual(odometerBounds(records, '2026-10-10'), { min: 10000, max: 11000 });
  assert.deepEqual(odometerBounds(records, '2026-09-01'), { min: null, max: 10000 });
  assert.deepEqual(odometerBounds([], '2026-10-01'), { min: null, max: null });
});
