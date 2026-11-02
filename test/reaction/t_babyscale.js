// 抱著量體重（babyscale）：線性代數小工具、出題（問的那一個算得出來、每條紀錄都用得到、干擾紀錄、至少用幾條）、算法的係數驗算
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_babyscale.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261108); const rnd = rng(SEED);

ok(G.id === 'babyscale' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
// A+B、B+C、A+C → A＝(①−②+③)÷2
ok(T.rank([[1, 1, 0], [0, 1, 1], [1, 0, 1]]) === 3 && T.rank([[1, 1, 0], [2, 2, 0]]) === 1, 'rank');
ok(T.determined([[1, 1, 0], [0, 1, 1], [1, 0, 1]], 3, 0) && !T.determined([[1, 1, 0], [0, 1, 1]], 3, 0), '算不算得出來');
{
  const c = T.combo([[1, 1, 0], [0, 1, 1], [1, 0, 1]], 3, 0);
  ok(c && c.div === 2 && c.coef.join() === '1,-1,1', '係數 (1,−1,1)÷2：' + JSON.stringify(c));
}
const rowOf = (set, n) => { const r = new Array(n).fill(0); set.forEach(i => { r[i] = 1; }); return r; };
let distract = 0, halves = 0, inWin = 0, nPuz = 0; const sumD = {}, cntD = {};
for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < 25; k++) {
  const p = T.makePuzzle(lv, rnd), n = p.ws.length;
  ok(n === Math.round(Reaction.kit.ramp(lv, T.ITEMS[0], T.ITEMS[1], T.RAMP_LEVELS)), '第 ' + lv + ' 關：' + n + ' 個');
  ok(p.ws.every((w, i) => w >= p.things[i].w[0] && w <= p.things[i].w[1]), '重量在合理範圍');
  ok(p.eqs.every(e => e.sum === e.set.reduce((a, i) => a + p.ws[i], 0) && e.set.length >= 1), '每條紀錄的重量對');
  ok(p.eqs.every(e => e.set.length !== 1 || e.set[0] !== p.target), '問的那一個沒有「單獨量」的紀錄');
  ok(p.eqs.every(e => e.set.length >= 2 || lv <= T.SINGLE_TO), '單獨量的紀錄只在第 ' + T.SINGLE_TO + ' 關以前');
  nPuz++; if (Math.abs(p.D - p.goal) <= T.DIFF_WINDOW + 1e-9) inWin++; sumD[lv] = (sumD[lv] || 0) + p.D; cntD[lv] = (cntD[lv] || 0) + 1;
  ok(Math.abs(T.difficultyOf(n, p.eqs.filter(e => e.used).map(e => e.set), p.div) - p.D) < 1e-9, '難度分數照公式算');
  ok(T.determined(p.eqs.map(e => rowOf(e.set, n)), n, p.target), '第 ' + lv + ' 關：問的那一個算得出來');
  ok(T.checkCombo(p), '第 ' + lv + ' 關：算法的係數驗算正確');
  const usedEq = p.eqs.filter((e, k) => p.coef[k] !== 0);
  ok(usedEq.length === p.eqs.filter(e => e.used).length, '用到的紀錄＝有係數的紀錄');
  // 用到的紀錄每一條都少不了
  usedEq.forEach(e => { const rest = usedEq.filter(x => x !== e); ok(!T.determined(rest.map(x => rowOf(x.set, n)), n, p.target), '第 ' + lv + ' 關：每一條用到的紀錄都少不了'); });
  const hasTotal = p.eqs.some(e => e.set.length === n);
  if (lv <= T.TOTAL_TO) {
    ok(hasTotal, '第 ' + lv + ' 關：有「全部一起」');
    ok(p.eqs.some(e => e.set.length !== n && e.set.indexOf(p.target) >= 0), '第 ' + lv + ' 關：有「全部一起」時，問的那一個也出現在另一條紀錄裡（才知道有幾個角色）');
  } else ok(!hasTotal, '第 ' + lv + ' 關：「全部一起」只出現在前 ' + T.TOTAL_TO + ' 關');
  if (lv < T.TRIPLE_FROM) ok(p.eqs.every(e => e.set.length <= 2 || e.set.length === n), '第 ' + lv + ' 關前沒有三個一起');
  if (lv >= T.DISTRACT_FROM) { ok(p.eqs.some(e => !e.used), '第 ' + lv + ' 關：有一條用不到的紀錄'); distract++; }
  else ok(p.eqs.every(e => e.used || e.hint), '第 ' + lv + ' 關：每條紀錄都用得到（提示紀錄除外）');
  if (p.div > 1) halves++;
  ok(p.eqs.length <= T.MAX_EQS, '第 ' + lv + ' 關：紀錄最多 ' + T.MAX_EQS + ' 條（' + p.eqs.length + '）');
  ok(T.workText(p).endsWith('＝ ' + p.ws[p.target] + ' 公斤'), '算法文字');
}
ok(distract > 0 && halves > 30, '干擾紀錄 ' + distract + '、要除以 2 以上的題 ' + halves);
ok(inWin / nPuz > 0.98, '難度分數落在目標範圍內的比例：' + (inWin / nPuz).toFixed(3));
// 難度一關一關往上、沒有斷崖：每一關的平均 D 比前一關只高、或差一點點（抽樣誤差內），相差不超過 0.9；第 1 關到第 30 關差很多
{
  let prev = null, maxJump = 0, drops = 0;
  for (let lv = 1; lv <= 30; lv++) { const a = sumD[lv] / cntD[lv]; if (prev != null) { maxJump = Math.max(maxJump, a - prev); if (a < prev - 0.35) drops++; } prev = a; }
  ok(maxJump < 0.9 && drops === 0, '相鄰兩關的平均難度分數：最大跳升 ' + maxJump.toFixed(2) + '、明顯下降 ' + drops + ' 次');
  ok(sumD[30] / cntD[30] - sumD[1] / cntD[1] > 5.5, '第 30 關比第 1 關難很多：' + (sumD[1] / cntD[1]).toFixed(1) + ' → ' + (sumD[30] / cntD[30]).toFixed(1));
}
// V1.43.1：限時答題；紀錄越多時間越長，後面的關卡係數從 1 降到 0.8
{
  ok(Math.abs(T.timeFor(1, 3) - (T.TIME_BASE + 3 * T.TIME_EQ)) < 1e-9, '第 1 關 3 條紀錄：' + T.timeFor(1, 3));
  ok(Math.abs(T.timeFor(T.RAMP_LEVELS, 6) - (T.TIME_BASE + 6 * T.TIME_EQ) * T.TIME_SCALE[1]) < 1e-9, '第 ' + T.RAMP_LEVELS + ' 關 6 條紀錄：' + T.timeFor(T.RAMP_LEVELS, 6));
  ok(T.timeFor(5, 6) > T.timeFor(5, 3), '紀錄越多時間越長');
  for (const l of [1, 5, 10, 20, 30]) { const p = T.makePuzzle(l); const t = T.timeFor(l, p.eqs.length); ok(t >= 25 && t <= 150, '第 ' + l + ' 關限時合理（' + p.eqs.length + ' 條）：' + t.toFixed(1)); }
}
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
