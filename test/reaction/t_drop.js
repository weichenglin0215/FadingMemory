// 神準落下（drop）：V1.43.0 關卡制——第 n 關的目標區寬度＝畫面寬度的 1/(9＋n)（第 1 關 1/10、第 2 關 1/11…）、尺的版面、接觸點落在第幾格
const { game } = require('./load.js');
const G = game('reaction_drop.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);

ok(G.id === 'drop' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.format === '{v} 關', '登記資料：成績是「關」（關卡制）');
ok(near(T.targetFrac(1), 1 / 10) && near(T.targetFrac(2), 1 / 11) && near(T.targetFrac(3), 1 / 12) && near(T.targetFrac(10), 1 / 19), '目標區寬度：第 1 關 1/10、第 2 關 1/11、第 3 關 1/12 …');
ok(near(T.targetFrac(T.DEN_MAX), 1 / T.DEN_MAX) && near(T.targetFrac(500), 1 / T.DEN_MAX), '目標區最窄縮到 1/' + T.DEN_MAX);
for (let lv = 1; lv < 60; lv++) ok(T.targetFrac(lv + 1) <= T.targetFrac(lv), '越後面目標區越窄（不變寬）');
// 尺的版面：中間目標區＋兩邊各 4 格，寬度加起來剛好滿版
for (const W of [468, 500, 372]) for (const lv of [1, 2, 3, 10, 30, 90]) {
  const L = T.stripLayout(W, lv);
  ok(near(L.centerW, W * T.targetFrac(lv)) && near(L.sideW * 8 + L.centerW, W) && near(L.centerX, L.sideW * 4), '第 ' + lv + ' 關（寬 ' + W + '）：目標區 ' + L.centerW.toFixed(1) + ' px，兩邊各 4 格，加起來滿版');
  ok(near(L.centerX + L.centerW / 2, W / 2), '目標區在正中央');
}
// 接觸點落在第幾格：左邊 0～3、目標區 4、右邊 5～8、尺外 −1；邊界
{
  const W = 500, lv = 1, L = T.stripLayout(W, lv);
  ok(T.cellIndex(-1, W, lv) === -1 && T.cellIndex(W, W, lv) === -1 && T.cellIndex(W + 5, W, lv) === -1, '尺外面＝−1');
  ok(T.cellIndex(0, W, lv) === 0 && T.cellIndex(L.sideW - 0.01, W, lv) === 0 && T.cellIndex(L.sideW, W, lv) === 1 && T.cellIndex(L.centerX - 0.01, W, lv) === 3, '左邊 4 格');
  ok(T.cellIndex(L.centerX, W, lv) === 4 && T.cellIndex(L.centerX + L.centerW - 0.01, W, lv) === 4 && T.cellIndex(W / 2, W, lv) === 4, '目標區是 4');
  ok(T.cellIndex(L.centerX + L.centerW, W, lv) === 5 && T.cellIndex(W - 0.01, W, lv) === 8, '右邊 4 格');
  // 目標區真的只佔 1/10 寬：等距取樣數有幾點算 4
  for (const lv2 of [1, 2, 3, 20]) { let hit = 0, n = 20000; for (let i = 0; i < n; i++) if (T.cellIndex((i + 0.5) * W / n, W, lv2) === 4) hit++; ok(near(hit / n, T.targetFrac(lv2), 0.002), '第 ' + lv2 + ' 關：落在目標區的機率＝' + (hit / n).toFixed(4) + '（應為 ' + T.targetFrac(lv2).toFixed(4) + '）'); }
}
// 三角形反彈位置（純函式）：永遠在 [0, max] 之內、折返連續
for (let i = 0; i < 500; i++) { const p = T.bouncePos(Math.random() * 400, Math.random() < 0.5 ? -1 : 1, Math.random() * 0.2, Math.random() * 3000, 400); ok(p >= 0 && p <= 400, '反彈位置在範圍內：' + p); }
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
