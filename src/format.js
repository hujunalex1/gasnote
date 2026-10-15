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
