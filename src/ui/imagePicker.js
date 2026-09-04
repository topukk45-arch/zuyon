/* 图片取色区。拖放 / 选择 / 粘贴 → 画到 canvas → 单击取该点颜色。
 *
 * 做成 ui/ 组件而不是塞进某个工具,是因为调色台和图片取色都要用它,
 * 而「tools/ 不许 import tools/」。它只碰 DOM,平台能力全从 ctx 收。
 *
 * 性能:手机照片动辄 4000×3000,先降采样到长边 1200 再处理,否则逐像素必卡。 */

import { el } from './index.js';

const MAX_EDGE = 1200;

/**
 * @param {object} ctx  工具上下文(要 platform 和 toast)
 * @param {object} opts { hint }
 * @param {(rgb:number[])=>void} onPick 单击取色时回调
 * @returns {{node, destroy, getPixels, hasImage}}
 */
export function imagePicker(ctx, { hint = '把图片拖到这里,或粘贴、点击选择' } = {}, onPick) {
  const canvas = el('canvas', { style: 'width:100%;height:auto;border-radius:var(--radius-sm);cursor:crosshair;display:none' });
  const g = canvas.getContext('2d', { willReadFrequently: true });

  const zone = el('div', {
    class: 'result',
    style: 'text-align:center;padding:var(--s5) var(--s3);cursor:pointer',
  }, hint);

  const status = el('p', { class: 'section-label', style: 'display:none' });
  const node = el('div', { class: 'field' }, zone, canvas, status);

  let loaded = false;

  const say = (msg) => { status.textContent = msg; status.style.display = msg ? '' : 'none'; };

  function draw(img) {
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    loaded = true;
    canvas.style.display = '';
    zone.textContent = '换一张';
    zone.style.padding = 'var(--s3)';
    say('单击图片取色');
  }

  function read(file) {
    if (!file) return;
    if (!file.type?.startsWith('image/')) { say('只能读图片文件'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => draw(img);
      img.onerror = () => say('这个文件读不出来,换一张试试');
      img.src = e.target.result;
    };
    reader.onerror = () => say('这个文件读不出来,换一张试试');
    reader.readAsDataURL(file);
  }

  zone.addEventListener('click', async () => {
    const f = await ctx.platform.pickFile({ accept: 'image/*' });
    if (f) read(f);
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); });
  zone.addEventListener('drop', (e) => { e.preventDefault(); read(e.dataTransfer?.files?.[0]); });

  // 全局粘贴监听 —— 卸载时必须摘掉,这正是工具契约要求返回清理函数的原因
  const onPaste = (e) => {
    for (const item of e.clipboardData?.items ?? []) {
      if (item.type.startsWith('image/')) { read(item.getAsFile()); return; }
    }
  };
  window.addEventListener('paste', onPaste);

  canvas.addEventListener('click', (e) => {
    if (!loaded) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) * canvas.width / r.width);
    const y = Math.floor((e.clientY - r.top) * canvas.height / r.height);
    const d = g.getImageData(x, y, 1, 1).data;
    onPick?.([d[0], d[1], d[2]]);
  });

  return {
    node,
    get hasImage() { return loaded; },
    /** 整图像素,交给 lib 里的纯函数算主色 */
    getPixels: () => (loaded ? g.getImageData(0, 0, canvas.width, canvas.height).data : null),
    say,
    destroy() { window.removeEventListener('paste', onPaste); },
  };
}
