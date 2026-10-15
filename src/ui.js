import { parseAmountInput, isValidDate, todayISO } from './format.js';
import { load, save, probeStorage, newId } from './store.js';

// ---- 存储：不可用时降级为内存，功能照常，只是刷新即丢 ----
function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

let storage = null;
try {
  storage = globalThis.localStorage ?? null;
} catch {
  storage = null;
}

let notice = null;
if (!probeStorage(storage)) {
  storage = createMemoryStorage();
  notice = { kind: 'storage-unavailable' };
}

const state = {
  records: [],
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
};

const $ = (id) => document.getElementById(id);

function renderBanner() {
  const el = $('banner');
  if (!notice) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.dataset.kind = notice.kind;
  if (notice.kind === 'storage-unavailable') {
    el.textContent = '浏览器不允许保存数据（可能是无痕模式）。本次记录只在当前页面有效，刷新即丢 —— 请点「导出」保存。';
  } else if (notice.kind === 'corrupt-version') {
    el.textContent = '检测到本工具更新版本写入的数据，当前版本读不懂，已保留原始副本（导出后可见）。为避免覆盖，列表暂时是空的。';
  } else {
    el.textContent = '本地数据已损坏，无法读取。原始副本已保留，未被覆盖。';
  }
}

function persist() {
  const result = save(storage, state.records);
  if (!result.ok) {
    const el = $('banner');
    el.hidden = false;
    el.dataset.kind = 'save-failed';
    el.textContent = result.error;
  }
}

function showEntryError(message) {
  const el = $('entry-error');
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function handleSubmit(event) {
  event.preventDefault();
  showEntryError('');

  const dateValue = $('entry-date').value;
  if (!dateValue) {
    showEntryError('请选择日期');
    return;
  }
  // <input type="date"> 正常只会给出合法值，这里是兜底：
  // 非法日期一旦落库，会污染整条按月份分组的统计链。
  if (!isValidDate(dateValue)) {
    showEntryError('日期格式不对，应为 YYYY-MM-DD');
    return;
  }

  const parsed = parseAmountInput($('entry-amount').value);
  if (!parsed.ok) {
    showEntryError(parsed.error);
    return;
  }

  state.records.push({
    id: newId(),
    date: dateValue,
    amount: parsed.amount,
    note: $('entry-note').value.trim(),
  });

  persist();

  // 日期重置为今天而不是保留上次的值——避免用户忘了改日期而把账记进错误的月份
  $('entry-date').value = todayISO();
  $('entry-amount').value = '';
  $('entry-note').value = '';
  $('entry-amount').focus();
}

function init() {
  const loaded = load(storage);
  state.records = loaded.records;
  if (loaded.notice) notice = { ...loaded.notice, ...(notice ?? {}) };

  renderBanner();

  $('entry-date').value = todayISO();
  $('entry-form').addEventListener('submit', handleSubmit);
}

init();
