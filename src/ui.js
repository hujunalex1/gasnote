import { parseAmountInput, formatMoney, isValidDate, todayISO } from './format.js';
import { monthKey, yearlySummary, allYears, barHeights, summaryCards } from './stats.js';
import { load, save, probeStorage, newId, serialize, parseImport, CORRUPT_KEY } from './store.js';

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
    el.textContent = `检测到本工具更新版本写入的数据，当前版本读不懂。原始副本已原样保留在 localStorage 的 ${CORRUPT_KEY} 键下，没有被删除。注意：点「导出」导出的是当前列表，不包含这份副本。`;
  } else {
    el.textContent = `本地数据已损坏，无法读取。原始副本已原样保留在 localStorage 的 ${CORRUPT_KEY} 键下，没有被删除。注意：点「导出」导出的是当前列表，不包含这份副本。`;
  }
}

/** 落盘并把结果如实反映到横幅上。返回 save() 的结果供调用方决定怎么措辞。 */
function persist() {
  const result = save(storage, state.records);
  const el = $('banner');

  if (result.ok) {
    // 只撤掉「保存失败」这条自己发的警告，别顺手清掉损坏数据的横幅
    if (el.dataset.kind === 'save-failed') {
      el.hidden = true;
      el.textContent = '';
      delete el.dataset.kind;
    }
    return result;
  }

  el.hidden = false;
  el.dataset.kind = 'save-failed';
  el.textContent = result.error;
  return result;
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

  renderAll();
}

function currentMonthKey() {
  return `${state.year}-${String(state.month).padStart(2, '0')}`;
}

function renderCards() {
  // 本月卡恒定看「真实的当前月」；本年卡跟随年份选择器（spec §7）。
  const cards = summaryCards(state.records, state.year, new Date());

  $('month-total').textContent = formatMoney(cards.month.total);
  $('month-meta').textContent = `${cards.month.count} 次 · 均 ${formatMoney(cards.month.avg)}`;

  // 看的是往年时标题还写「本年」会让人误读成今年
  $('year-card-title').textContent = cards.isCurrentYear ? '本年' : `${state.year} 年`;
  $('year-total').textContent = formatMoney(cards.year.total);
  $('year-meta').textContent = `${cards.year.count} 次 · 均 ${formatMoney(cards.year.avg)}`;
}

function renderYearSelect() {
  const select = $('year-select');
  const years = allYears(state.records, new Date().getFullYear());
  if (!years.includes(state.year)) state.year = years[0];

  select.textContent = '';
  for (const y of years) {
    const option = document.createElement('option');
    option.value = String(y);
    option.textContent = `${y} 年`;
    if (y === state.year) option.selected = true;
    select.append(option);
  }
}

function renderChart() {
  const summary = yearlySummary(state.records, state.year);
  const heights = barHeights(summary.months);
  const chart = $('chart');
  chart.textContent = '';

  for (let i = 0; i < summary.months.length; i++) {
    const m = summary.months[i];
    const month = m.month;
    const bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'bar';
    bar.setAttribute('aria-pressed', String(month === state.month));
    bar.title = `${month} 月 ${formatMoney(m.total)} · ${m.count} 次`;
    bar.setAttribute('aria-label', `${state.year} 年 ${month} 月，${formatMoney(m.total)}，${m.count} 次`);

    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    // 零高柱子保留 2px 基线（由 CSS 的 min-height 保证），表达"这个月没有记录"而不是渲染失败
    fill.style.height = `${heights[i] * 100}%`;

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = String(month);

    bar.append(fill, label);
    bar.addEventListener('click', () => {
      state.month = month;
      renderChart();
      renderDetail();
    });

    chart.append(bar);
  }
}

function onYearChange(event) {
  state.year = Number(event.target.value);
  // 保持相同月份：年份选择器的全部意义就是同比，跳回 1 月会把这个用途毁掉
  renderYearSelect();
  renderChart();
  renderCards();
  renderDetail();
}

function renderAll() {
  renderCards();
  renderYearSelect();
  renderChart();
  renderDetail();
}

function renderDetail() {
  const list = $('record-list');
  const empty = $('detail-empty');
  list.textContent = '';

  $('detail-title').textContent = `${state.year} 年 ${state.month} 月明细`;

  // 排序：日期降序；同一天内按录入顺序倒序（后录入的在前）。
  // 带上原始下标是必需的——同一天多条时只比日期会得到 0，
  // 稳定排序会原样保留插入顺序，也就是「最旧的在最前」，与 spec 相反。
  const rows = state.records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => monthKey(record.date) === currentMonthKey())
    .sort((a, b) => {
      if (a.record.date !== b.record.date) return a.record.date < b.record.date ? 1 : -1;
      return b.index - a.index;
    })
    .map(({ record }) => record);

  if (rows.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const record of rows) {
    const li = document.createElement('li');
    li.className = 'record-row';

    const date = document.createElement('span');
    date.className = 'record-date';
    date.textContent = record.date.slice(5); // "10-15"

    const amount = document.createElement('span');
    amount.className = 'record-amount';
    amount.textContent = formatMoney(record.amount);

    li.append(date, amount);

    if (record.note) {
      const note = document.createElement('span');
      note.className = 'record-note';
      note.textContent = record.note;
      li.append(note);
    }

    const actions = document.createElement('span');
    actions.className = 'record-actions';
    actions.append(makeDeleteControls(record.id));
    li.append(actions);

    list.append(li);
  }
}

/**
 * 删除采用行内二次确认，不用原生 confirm()：样式割裂、且容易误触。
 * 点「删除」后按钮就地变成「确认删除？ [是] [否]」，点「否」原样恢复。
 */
function makeDeleteControls(id) {
  const wrap = document.createElement('span');
  wrap.className = 'record-actions';

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'danger';
  del.textContent = '删除';

  del.addEventListener('click', () => {
    wrap.textContent = '';

    const prompt = document.createElement('span');
    prompt.className = 'record-prompt';
    prompt.textContent = '确认删除？';

    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'danger';
    yes.textContent = '是';
    yes.addEventListener('click', () => {
      state.records = state.records.filter((r) => r.id !== id);
      persist();
      renderAll();
    });

    const no = document.createElement('button');
    no.type = 'button';
    no.textContent = '否';
    no.addEventListener('click', () => {
      wrap.textContent = '';
      wrap.append(del);
    });

    wrap.append(prompt, yes, no);
  });

  wrap.append(del);
  return wrap;
}

function handleExport() {
  const blob = new Blob([serialize(state.records)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gasnote-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 导入是唯一可能一次性毁掉全部数据的操作，所以：
 * 先全量解析校验（parseImport），通过了才覆盖。任何一步失败都保持现状不动。
 */
async function handleImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = ''; // 允许连续导入同一个文件
  if (!file) return;

  let text;
  try {
    text = await file.text();
  } catch {
    window.alert('读取文件失败。');
    return;
  }

  const parsed = parseImport(text);
  if (!parsed.ok) {
    window.alert(`导入失败，你的数据没有任何改动。\n\n原因：${parsed.error}`);
    return;
  }

  const confirmed = window.confirm(
    `将用文件里的 ${parsed.records.length} 条记录替换当前的 ${state.records.length} 条记录。\n\n此操作不可撤销，确定继续？`,
  );
  if (!confirmed) return;

  state.records = parsed.records;
  // 用 persist() 而不是直接 save()：落盘失败必须同时进横幅，不能只闪一个 alert。
  // 更不能在没落盘的情况下说「已导入成功」——那会让用户以为数据已经安全了。
  const result = persist();
  renderAll();
  window.alert(result.ok
    ? `已导入 ${parsed.records.length} 条记录。`
    : `已导入 ${parsed.records.length} 条记录，但保存失败，刷新后会丢失。\n\n${result.error}`);
}

function initImportExport() {
  $('export-btn').addEventListener('click', handleExport);
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', handleImportFile);
}

function init() {
  const loaded = load(storage);
  state.records = loaded.records;
  if (loaded.notice) notice = { ...loaded.notice, ...(notice ?? {}) };
  renderBanner();

  $('entry-date').value = todayISO();
  $('entry-form').addEventListener('submit', handleSubmit);
  $('year-select').addEventListener('change', onYearChange);

  initImportExport();
  renderAll();
}

init();
