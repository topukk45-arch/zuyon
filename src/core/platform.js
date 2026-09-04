/* 跨端适配层。
 *
 * 工具只 import 这里导出的函数,永远不直接碰任何平台 API。
 * 三份实现(web / Capacitor / Tauri)在这一个文件里分支,换外壳只改这里。
 *
 * 两条纪律:
 *   1. 所有函数返回 Promise,哪怕 web 实现是同步的。否则换端时工具代码要变形。
 *   2. 能力差异用 can(name) 查询,不许在工具里写 if (isAndroid)。
 */

const g = typeof globalThis !== 'undefined' ? globalThis : {};

export const runtime =
  g.__TAURI__            ? 'tauri'     :
  g.Capacitor?.isNativePlatform?.() ? 'android' :
                           'web';

/** 能力查询。工具用它决定显示哪个按钮,而不是猜自己在哪个平台。 */
export function can(feature) {
  switch (feature) {
    case 'share':         return runtime !== 'web' || !!navigator.share;
    case 'readClipboard': return !!navigator.clipboard?.readText;
    case 'pickFile':      return true;
    case 'saveFile':      return true;
    default:              return false;
  }
}

/** 复制文本到剪贴板。 */
export async function copy(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  // 老 WebView 兜底
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand?.('copy') ?? false;
  ta.remove();
  return ok;
}

/** 读剪贴板。首页的「粘贴内容直达」靠它。可能被权限拒绝,调用方必须容错。 */
export async function readClipboard() {
  if (!can('readClipboard')) return null;
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;   // 无焦点、无权限、非安全上下文
  }
}

/**
 * 选文件。accept 用 input[type=file] 的语法。
 * @returns {Promise<File|null>}
 */
export async function pickFile({ accept = '*/*' } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    }, { once: true });
    // 用户取消时 change 不触发,靠窗口重新获得焦点收尾
    window.addEventListener('focus', () => {
      setTimeout(() => { if (input.isConnected) { resolve(null); input.remove(); } }, 400);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * 保存文件。
 * @param {Blob|string} data
 * @param {string} filename
 */
export async function saveFile(data, filename) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** 分享。不可用时返回 false,调用方据此降级为复制。 */
export async function share({ title, text, url } = {}) {
  if (!can('share')) return false;
  try {
    await navigator.share({ title, text, url });
    return true;
  } catch {
    return false;   // 用户取消也走这里
  }
}
