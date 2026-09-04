/* 本地存储。
 * 外壳用 scoped(toolId) 造一个受限句柄交给工具,
 * 工具拿到的 key 会自动加前缀,物理上够不着别的工具的数据。 */

const PREFIX = 'zy:';

function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;   // 隐私模式 / 配额满
  }
}

function drop(key) {
  try { localStorage.removeItem(PREFIX + key); return true; } catch { return false; }
}

/** 外壳自己的存储:最近使用、置顶等。 */
export const shellStore = {
  get: (k, fallback = null) => read('shell.' + k) ?? fallback,
  set: (k, v) => write('shell.' + k, v),
};

/** 交给工具的受限句柄。 */
export function scoped(toolId) {
  const ns = `tool.${toolId}.`;
  return {
    get: (k, fallback = null) => read(ns + k) ?? fallback,
    set: (k, v) => write(ns + k, v),
    remove: (k) => drop(ns + k),
  };
}
