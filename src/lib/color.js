/* 色彩纯函数。
 * 从 color-mixer.html 搬来,一行 DOM 都不带,因此可以在 node 里直接测。
 * 三个混色模型、色相关系判断、主色提取都在这里。 */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** '#abc' / 'abc' / '#aabbcc' → [r,g,b] */
export function parseHex(input) {
  let s = String(input).trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) throw new Error('颜色写成 #RGB 或 #RRGGBB');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}

/** [r,g,b] → '#RRGGBB'(大写,越界会夹住) */
export function toHex(rgb) {
  return '#' + rgb
    .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'))
    .join('').toUpperCase();
}

/** 宽松解析,失败返回 null,不抛。给输入框实时校验用。 */
export function tryParseHex(input) {
  try { return parseHex(input); } catch { return null; }
}

/* ── sRGB 与线性光 ──────────────────────────── */

export const srgbToLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export const linearToSrgb = (c) => {
  const v = clamp(c, 0, 1);
  return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
};

/** WCAG 相对亮度 */
export function luminance([r, g, b]) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** 对比度,1 ~ 21 */
export function contrastRatio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** WCAG 判定 */
export function wcagLevels(ratio) {
  return {
    normalAA:  ratio >= 4.5,
    normalAAA: ratio >= 7,
    largeAA:   ratio >= 3,
    largeAAA:  ratio >= 4.5,
  };
}

/** 压在这个色上,黑字还是白字更清楚 */
export function readableOn(rgb) {
  return contrastRatio(rgb, [255, 255, 255]) >= contrastRatio(rgb, [0, 0, 0])
    ? '#FFFFFF' : '#111111';
}

/* ── 三个混色模型 ───────────────────────────── */

/**
 * 颜料混合。Kubelka–Munk 单常数模型,逐通道在线性反射率上做。
 * 把颜色当成反射率、混合的是吸收系数,所以互补色相遇会明显变暗变灰 —— 也就是「调脏」。
 * @param {number[][]} colors  [[r,g,b], ...]
 * @param {number[]}   weights 归一化权重,和为 1
 */
export function mixPigment(colors, weights) {
  const out = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    let k = 0;
    for (let i = 0; i < colors.length; i++) {
      // 夹住两端,避免 R→0 时 K/S 爆炸、R→1 时全零
      const R = clamp(srgbToLinear(colors[i][ch]), 0.004, 0.996);
      k += weights[i] * ((1 - R) * (1 - R) / (2 * R));
    }
    out[ch] = linearToSrgb(1 + k - Math.sqrt(k * k + 2 * k));
  }
  return out.map(Math.round);
}

/** 光的混合。每盏灯亮度 w×n,通道相加后削顶,颜色越多越接近白。 */
export function mixLight(colors, weights) {
  const n = colors.length, out = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += srgbToLinear(colors[i][ch]) * weights[i] * n;
    out[ch] = linearToSrgb(s);
  }
  return out.map(Math.round);
}

/** 算术平均。大多数人脑子里的「混合」,但真实颜料不这么工作。 */
export function mixAverage(colors, weights) {
  const out = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    let s = 0;
    for (let i = 0; i < colors.length; i++) s += colors[i][ch] * weights[i];
    out[ch] = s;
  }
  return out.map(Math.round);
}

/** 权重归一化。全零时退化成平均。 */
export function normalize(weights) {
  const total = weights.reduce((a, w) => a + w, 0);
  return total <= 0 ? weights.map(() => 1 / weights.length) : weights.map((w) => w / total);
}

/* ── 色相与彩度 ─────────────────────────────── */

/** 色相角 0~360。接近灰时返回 null(色相无意义)。 */
export function hue([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  if (d < 0.02) return null;
  let h;
  if (mx === R) h = ((G - B) / d) % 6;
  else if (mx === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return (h * 60 + 360) % 360;
}

/** 彩度 0~1(HSV 意义上的 S) */
export function chroma(rgb) {
  const mx = Math.max(...rgb), mn = Math.min(...rgb);
  return mx === 0 ? 0 : (mx - mn) / mx;
}

/** 两个色相角之间的最短夹角,0~180 */
export function hueDelta(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

/**
 * 色相关系判断。返回结构化结果,文案由调用方拼 —— 这样阈值可测。
 * 阈值:≥150° 算近互补,≤60° 算邻近色。
 */
export function hueRelation(colors, mixed) {
  const hs = colors.map(hue).filter((h) => h !== null);
  if (hs.length < 2) return { kind: 'unknown', maxDelta: null, chroma: chroma(mixed) };

  let maxDelta = 0;
  for (let i = 0; i < hs.length; i++)
    for (let j = i + 1; j < hs.length; j++)
      maxDelta = Math.max(maxDelta, hueDelta(hs[i], hs[j]));

  const kind = maxDelta >= 150 ? 'complementary' : maxDelta <= 60 ? 'analogous' : 'medium';
  return { kind, maxDelta, chroma: chroma(mixed) };
}

/** HSL → '#RRGGBB'。h 0~360,s/l 0~1。随机配色用。 */
export function hslHex(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return toHex([f(0), f(8), f(4)]);
}

/* ── 图片主色 ───────────────────────────────── */

/**
 * 整图主色。跳过近灰、近黑与透明像素后求均值。
 * 收的是 ImageData.data 那样的扁平数组,所以这个函数在 node 里也能测。
 * @returns {number[]|null} 没有足够鲜艳的像素时返回 null
 */
export function dominantColor(data, { minSpread = 60, minLevel = 25, alphaCut = 128 } = {}) {
  let n = 0;
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaCut) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < minSpread || (r + g + b) / 3 < minLevel) continue;
    sum[0] += r; sum[1] += g; sum[2] += b; n++;
  }
  return n ? sum.map((v) => Math.round(v / n)) : null;
}
