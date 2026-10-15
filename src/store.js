import { isValidDate } from './format.js';

export const STORAGE_KEY = 'gasnote.records.v1';
export const CORRUPT_KEY = 'gasnote.records.v1.corrupt';
export const SCHEMA_VERSION = 1;

let idSeq = 0;

/**
 * id 生成的回退路径：毫秒 + 自增序号 + 随机数。
 * 自增序号是关键 —— 它保证同一毫秒内连续调用也不会撞号。
 *
 * 导出它**只是为了让测试能真的跑到这条分支**：Node 里 crypto.randomUUID 必然存在，
 * 如果把它藏在 newId 内部，测试就永远只覆盖 UUID 那条路，回退路径写错了也发现不了。
 * 业务代码请用 newId()，不要直接调这个。
 */
export function newIdFallback() {
  idSeq += 1;
  return `r${Date.now().toString(36)}-${idSeq}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 生成记录 id。
 * crypto.randomUUID 只在 secure context 可用（http://localhost 算，局域网 IP 不算），
 * 所以必须有回退。
 */
export function newId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return typeof uuid === 'string' ? uuid : newIdFallback();
}

/** 单条记录的字段校验。返回错误描述，合法则返回 null。 */
function validateRecord(r) {
  if (typeof r !== 'object' || r === null || Array.isArray(r)) {
    return '不是一个对象';
  }
  if (typeof r.date !== 'string' || !isValidDate(r.date)) {
    return `日期不是合法的 YYYY-MM-DD：${JSON.stringify(r.date)}`;
  }
  if (typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount <= 0) {
    return `金额不是大于 0 的数字：${JSON.stringify(r.amount)}`;
  }
  return null;
}

/**
 * 校验并规整记录数组。
 *
 * 拒绝（整体失败，绝不返回半截结果）：元素不是对象、日期非法、金额非法。
 * 修补（不拒绝）：id 缺失或重复 → 补发；note 非字符串 → 补空串；金额归整到分。
 *
 * 为什么 id 只修补不拒绝：id 是内部实现细节，用户看不见也不该关心。
 * 它坏掉不该让整份备份作废——那会让用户手里唯一的一份备份变成废纸。
 */
export function normalizeRecords(input) {
  if (!Array.isArray(input)) return { ok: false, error: '`records` 不是数组' };

  const seen = new Set();
  const records = [];

  for (let i = 0; i < input.length; i++) {
    const r = input[i];
    const problem = validateRecord(r);
    if (problem) return { ok: false, error: `第 ${i + 1} 条记录有问题：${problem}` };

    let id = typeof r.id === 'string' && r.id !== '' ? r.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);

    records.push({
      id,
      date: r.date,
      amount: Math.round(r.amount * 100) / 100,
      note: typeof r.note === 'string' ? r.note : '',
    });
  }

  return { ok: true, records };
}

/** 把 JSON 文本解析成记录数组，全部校验通过才返回 ok。 */
export function parseImport(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { ok: false, error: '这不是一个合法的 JSON 文件' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: '文件顶层应该是一个对象' };
  }
  if (parsed.version !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `文件版本是 ${JSON.stringify(parsed.version)}，本工具只认识版本 ${SCHEMA_VERSION}`,
    };
  }
  return normalizeRecords(parsed.records);
}

/** 记录数组 → 存储/导出用的 JSON 文本。 */
export function serialize(records) {
  return JSON.stringify({ version: SCHEMA_VERSION, records }, null, 2);
}
