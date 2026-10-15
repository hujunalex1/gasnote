// 纯统计函数：只吃数组、只吐数字和对象。
// 不碰 DOM、不碰 localStorage、不读系统时间——因此可以完整单测。

/** "2026-10-15" → "2026-10"。纯字符串截取，天然没有时区问题。 */
export function monthKey(dateStr) {
  return String(dateStr).slice(0, 7);
}

// 金额一律转成整数「分」再累加，避免浮点误差在几十条记录后漂出来。
const toCents = (amount) => Math.round(Number(amount) * 100);
const fromCents = (cents) => cents / 100;

/** 某个月（"2026-10"）的合计、次数、平均每次。无记录时全部为 0，绝不是 NaN。 */
export function monthlyTotal(records, ym) {
  let cents = 0;
  let count = 0;
  for (const r of records) {
    if (monthKey(r.date) === ym) {
      cents += toCents(r.amount);
      count += 1;
    }
  }
  const avg = count === 0 ? 0 : fromCents(Math.round(cents / count));
  return { total: fromCents(cents), count, avg };
}

/**
 * 某一年的汇总。months 恒定返回 12 项，没记录的月份是 { total: 0, count: 0 }，
 * 这样柱状图永远画得出 12 根柱子。
 */
export function yearlySummary(records, year) {
  const prefix = `${year}-`;
  const buckets = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, cents: 0, count: 0 }));

  for (const r of records) {
    const key = monthKey(r.date);
    if (!key.startsWith(prefix)) continue;
    const index = Number(key.slice(5, 7)) - 1;
    if (!Number.isInteger(index) || index < 0 || index > 11) continue;
    buckets[index].cents += toCents(r.amount);
    buckets[index].count += 1;
  }

  let totalCents = 0;
  let count = 0;
  const months = buckets.map((b) => {
    totalCents += b.cents;
    count += b.count;
    return { month: b.month, total: fromCents(b.cents), count: b.count };
  });

  return { total: fromCents(totalCents), count, months };
}

/**
 * 年份选择器的选项，降序。
 * currentYear 作为参数传入而不是在这里读系统时间——保持本文件是纯函数。
 * 当前年份始终包含在内，否则用户在没有任何记录的年份里没法记账。
 */
export function allYears(records, currentYear) {
  const years = new Set([currentYear]);
  for (const r of records) {
    const y = Number(monthKey(r.date).slice(0, 4));
    if (Number.isInteger(y)) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

/** 每月合计 → 0..1 的柱高比例。全零时返回全零，不做除以 0。 */
export function barHeights(months) {
  const max = months.reduce((acc, m) => Math.max(acc, m.total), 0);
  if (max <= 0) return months.map(() => 0);
  return months.map((m) => m.total / max);
}
