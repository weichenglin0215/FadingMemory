const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_scratch.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 牌面：12 格；目標 3 個；其餘每種最多 2 個、恰好 9 個；只有目標會出現 3 次
const posOfTarget = new Array(12).fill(0);
for (let i = 0; i < 4000; i++) {
  const b = T.makeBoard(rnd);
  ok(b.cells.length === T.COLS * T.ROWS, '12 格');
  const cnt = {}; b.cells.forEach(s => { cnt[s] = (cnt[s] || 0) + 1; });
  ok(cnt[b.target] === 3, '目標圖案剛好 3 個');
  ok(Object.keys(cnt).length === 6, '六種圖案都出現：' + JSON.stringify(cnt));
  Object.keys(cnt).forEach(k => { if (k !== b.target) ok(cnt[k] === 1 || cnt[k] === 2, k + ' 最多 2 個'); });
  ok(Object.keys(cnt).filter(k => cnt[k] === 1).length === 1, '只有一種圖案出現 1 次');
  b.cells.forEach((s, j) => { if (s === b.target) posOfTarget[j]++; });
}
ok(posOfTarget.every(c => c > 4000 * 3 / 12 * 0.8 && c < 4000 * 3 / 12 * 1.2), '目標位置平均分布：' + posOfTarget.join(','));
// winner：只有達到 3 個才算
const cells = ['circle', 'circle', 'heart', 'circle', 'heart', 'square'];
ok(T.winner(cells, [0, 1, 2]) === null && T.winner(cells, [0, 1, 3]) === 'circle' && T.winner(cells, [2, 4, 5]) === null, 'winner');
// 6 種圖案的標記都存在
T.SYMBOLS.forEach(s => ok(/<(circle|path|polygon|rect)/.test(T.symbolMarkup(s)), s + ' 圖案'));
ok(T.LOOKALIKE.every(g => g.length === 2) && T.LOOKALIKE.flat().sort().join() === T.SYMBOLS.slice().sort().join(), '三組相似碎片剛好涵蓋六種圖案');
// clearedRatio：整格不透明＝0；整格透明＝1；只刮左半＝約 0.5；窗內不算
const S = T.CELL, mk = (fn) => { const d = new Uint8ClampedArray(S * S * 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) d[(y * S + x) * 4 + 3] = fn(x, y); return d; };
ok(T.clearedRatio(mk(() => 255), S, T.WINDOW, 4) === 0, '全不透明 0');
ok(T.clearedRatio(mk(() => 0), S, T.WINDOW, 4) === 1, '全透明 1');
{ const r = T.clearedRatio(mk((x, y) => (x < S / 2 ? 0 : 255)), S, T.WINDOW, 1); const exp = (S / 2 * S - T.WINDOW * T.WINDOW) / (S * S - T.WINDOW * T.WINDOW); ok(Math.abs(r - exp) < 0.01, '刮左半（扣掉碎片窗）約 ' + exp.toFixed(3) + '：' + r); }
ok(T.clearedRatio(mk((x, y) => (x < T.WINDOW && y < T.WINDOW ? 0 : 255)), S, T.WINDOW, 1) === 0, '碎片窗本來就透明，不算刮掉');
ok(T.SCRATCH_PCT > 0.2 && T.SCRATCH_PCT < 0.6, '刮開門檻合理');
ok(T.rating(3) !== T.rating(4) && T.rating(4) !== T.rating(6) && T.rating(6) !== T.rating(10), '評語分級');
ok(T.COLS * T.CELL + (T.COLS - 1) * 10 <= 472 && T.ROWS * T.CELL + (T.ROWS - 1) * 10 <= 600, '牌面放得進舞台');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
