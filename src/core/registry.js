/* 工具注册表。
 *
 * 这是首屏唯一全量加载的模块,所以它里面只有「描述」,没有「实现」。
 * 实现藏在 load() 后面,点开某个工具才会拉那个 chunk。
 * 搜索因此不需要加载任何工具就能工作。
 *
 * ── 加一个工具 ────────────────────────────
 *   1. 新建 src/tools/xxx.js
 *   2. 在下面数组里加一条
 *   没有第三步。shell/ 永远不认识具体工具。
 *
 * 字段:
 *   id        唯一,同时是路由片段和存储命名空间
 *   name      显示名
 *   desc      一句话,列表里显示
 *   keywords  搜索用。中文别名一定要写全,「摩斯」和「莫尔斯」都得能搜到
 *   sniff     可选。纯函数,判断一段粘贴内容是否该由本工具接管。
 *             返回 0~1 的置信度。必须极快且无副作用 —— 它在输入时同步跑。
 *   load      动态 import,返回 { default: 工具模块 }
 */

const tools = [
  {
    id: 'timestamp',
    name: '时间戳',
    desc: 'Unix 时间与日期互转',
    keywords: ['时间', '时间戳', '日期', 'unix', 'timestamp', 'epoch', '转换'],
    sniff: (s) => (/^\d{10}$|^\d{13}$/.test(s.trim()) ? 0.95 : 0),
    load: () => import('../tools/timestamp.js'),
  },
  {
    id: 'color-mixer',
    name: '调色台',
    desc: '颜料混合、光混合、算术平均三模型对比',
    keywords: ['调色', '配色', '混色', '颜料', '光', '互补', 'kubelka', 'color', 'mix'],
    load: () => import('../tools/color-mixer.js'),
  },
  {
    id: 'color-picker',
    name: '图片取色',
    desc: '从图片单击取色,或提取整图主色',
    keywords: ['取色', '吸管', '主色', '拾色', '图片', 'picker', 'eyedropper', 'color'],
    load: () => import('../tools/color-picker.js'),
  },
  {
    id: 'contrast',
    name: '对比度检查',
    desc: '前景背景色对比度与 WCAG 判定',
    keywords: ['对比度', '颜色', '配色', '可读性', 'contrast', 'wcag', 'a11y', '无障碍'],
    sniff: (s) => (/^#?[0-9a-f]{3}$|^#?[0-9a-f]{6}$/i.test(s.trim()) ? 0.8 : 0),
    load: () => import('../tools/contrast.js'),
  },
];

export default tools;

export const byId = (id) => tools.find((t) => t.id === id) ?? null;
