// 「乘法表抓錯」的自動玩家：從表的開頭一列一列往下檢查，依序點出被改過的格子，越找越慢，最後只徘徊不點
import { disableHints, elementsAt, rectOf, shuffled, tapInOrder } from './common.mjs';

const N = 9;
const state = b => b.evalJs('(function () { var s = Reaction.current.debug.state(); return { tampered: s.tampered.map(function (c) { return { a: c.a, b: c.b, shown: c.shown }; }), found: s.found, errors: s.errors }; })()');

export default {
  ready: '!!(Reaction.current.debug && Reaction.current.debug.state)',
  fontText: '乘法表的答案被偷偷改過把它們全部找出來時間秒還有格點錯次每加裡有開始準備最佳×→（）。！，：',
  // 題目一進場就出好了，所以要在按「開始挑戰」之前固定亂數
  async beforeStart(b, o) { await disableHints(b); await b.evalJs(`__vt.reseed(${o.seed})`); },
  // 跳過「開始」遮罩，直接開始計時
  async start(b) { await b.evalJs('Reaction.current.debug.start(); for (var i = 0; i < 24; i++) __vt.advance(25); 1'); },
  boardRect: b => rectOf(b, '.timestable-table'),
  async snapshot(b) { const s = await state(b); return s.tampered.map(c => c.a + 'x' + c.b + '=' + c.shown).join(' '); },

  async tapOrder(take, seg) {
    // 表格是 10×10 個元素（含標題列、標題行），第 a 列第 b 行是第 a × 10 + b 個
    const all = await elementsAt(take.b, '.timestable-cell');
    const order = [];                              // 81 個答案格，照閱讀順序（第 1 列由左到右、再第 2 列…）
    for (let a = 1; a <= N; a++) for (let c = 1; c <= N; c++) order.push({ ...all[a * (N + 1) + c], key: a + ',' + c });
    const { tampered } = await state(take.b);
    const wrongKeys = new Set(tampered.map(c => c.a + ',' + c.b));
    const targets = order.map((cell, index) => ({ cell, index })).filter(x => wrongKeys.has(x.cell.key));   // 被改的格子，照閱讀順序
    // 至少留 2 格不點：全部找到會揭曉答案、跳結算
    const count = Math.min(seg.maxTaps ?? targets.length - 2, targets.length - 1);
    let clicked = 0;
    await tapInOrder(take, seg, {
      count, spread: true,
      target: i => targets[i].cell,
      // 思考：沿著閱讀順序，從上一個點到的位置往下一格一格檢查（不停在任何被改過的格子上）
      stops(i, n) {
        const from = i === 0 ? -1 : targets[i - 1].index, between = order.slice(from + 1, targets[i].index).filter(c => !wrongKeys.has(c.key));
        if (!between.length) return shuffled(order.filter(c => !wrongKeys.has(c.key)), take.rng).slice(0, n);
        const k = Math.min(n, between.length);
        return Array.from({ length: k }, (_, j) => between[Math.floor((j + 0.5) * between.length / k)]);
      },
      async verify(i) {
        const s = await state(take.b);
        if (s.found !== i + 1 || s.errors) throw new Error('自動玩家第 ' + (i + 1) + ' 格沒有點對（遊戲可能改版了）');
        clicked = i + 1;
      },
      // 最後的猶豫：在「還沒檢查到的後面幾列」附近看來看去，不停在還沒找到的錯格上
      finalSpots: async () => {
        const from = clicked ? targets[clicked - 1].index : 0;
        const rest = order.slice(from + 1).filter(c => !wrongKeys.has(c.key));
        const pool = rest.length >= 8 ? rest : order.filter(c => !wrongKeys.has(c.key));
        return shuffled(pool, take.rng).slice(0, 12);
      }
    });
    take.note += '（共 ' + tampered.length + ' 格被改）';
  }
};
