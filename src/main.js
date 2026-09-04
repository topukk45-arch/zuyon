/* 启动。
 *
 * 这里必须是独立文件,不能内联进 index.html —— CSP 的 script-src 'self'
 * 会挡掉内联脚本,表现是一片纯白,而且很不容易看出是自己挡了自己。 */

import { start } from './shell/app.js';

const root = document.getElementById('app');
root.textContent = '';        // 清掉 index.html 里的启动失败兜底
start(root);
