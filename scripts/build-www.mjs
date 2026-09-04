/* 把网页产物拷进 www/,给 Capacitor 打包用。
 * 排除 src/dev/(设备沙盘是开发工具,不该进 APK)。跨平台,不依赖 shell。 */
import { rm, mkdir, cp } from 'node:fs/promises';
import { relative, sep } from 'node:path';

const EXCLUDE = ['dev'];   // src/ 下不进包的子目录

await rm('www', { recursive: true, force: true });
await mkdir('www', { recursive: true });
await cp('index.html', 'www/index.html');
await cp('src', 'www/src', {
  recursive: true,
  filter: (src) => {
    const parts = relative('src', src).split(sep);
    return !EXCLUDE.includes(parts[0]);
  },
});
console.log('www 就绪');
