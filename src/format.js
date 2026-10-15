// 金额文本层：用户输入的文本 ↔ 数字 ↔ 显示文本。
// 这一层存在的意义是把"人会打错字"这件事挡在业务逻辑之外。

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/**
 * 把输入框里的文本解析成金额（元）。
 * 只接受裸数字，最多两位小数。千分位、货币符号、全角数字一律拒绝，
 * 而不是"尽力猜"——静默地把 1,240.50 解析成 1 比报错危险得多。
 */
export function parseAmountInput(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return { ok: false, error: '请填写金额' };
  if (!AMOUNT_RE.test(text)) {
    return { ok: false, error: '金额只能是最多两位小数的数字，例如 320.50' };
  }
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: '金额必须大于 0' };
  }
  return { ok: true, amount };
}

/**
 * 金额 → 显示文本，带 ¥ 前缀与千分位，固定两位小数。
 * 全程走整数"分"，避免浮点误差漏到界面上。
 */
export function formatMoney(amount) {
  const cents = Math.round(Number(amount) * 100);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const grouped = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}¥${grouped}.${frac}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Date 对象 → "YYYY-MM-DD"。
 * 一律读本地年月日分量，绝不碰 toISOString()——那是 UTC，
 * 会让晚上 23:50 记的账跑到第二天去。
 */
export function toISODate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 本地时区的今天。这是全项目唯一一处读系统时间的地方。 */
export function todayISO() {
  return toISODate(new Date());
}

/**
 * 校验 "YYYY-MM-DD"，并且确认这个日期在日历上真实存在
 * （2 月 30 日、4 月 31 日一律拒绝，闰年 2 月 29 日接受）。
 */
export function isValidDate(value) {
  const m = DATE_RE.exec(String(value ?? ''));
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // new Date(y, m, 0) 得到第 m 个月的最后一天（m 是 1-based）
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}
