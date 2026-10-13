/* 象棋电脑的后台线程。算棋要几百毫秒到两三秒,放主线程会卡住界面。
 * 收:{ id, board, side, level, history },回:{ id, move, score, depth, nodes }。 */
import { think } from '../lib/xqai.js';

self.onmessage = (e) => {
  const { id, board, side, level, history } = e.data;
  const r = think({ board, side, level, history });
  self.postMessage({ id, ...r });
};
