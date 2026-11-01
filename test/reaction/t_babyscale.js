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
let distract = 0, used3 = 0, halves = 0;
for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < 25; k++) {
  const p = T.makePuzzle(lv, rnd), n = p.ws.length;
  ok(n === Math.round(Reaction.kit.ramp(lv, T.ITEMS[0], T.ITEMS[1], T.RAMP_LEVELS)), '第 ' + lv + ' 關：' + n + ' 個');
  ok(p.ws.every((w, i) => w >= p.things[i].w[0] && w <= p.things[i].w[1]), '重量在合理範圍');
  ok(p.eqs.every(e => e.sum === e.set.reduce((a, i) => a + p.ws[i], 0) && e.set.length >= 2), '每條紀錄的重量對、至少兩個一起');
  ok(T.determined(p.eqs.map(e => rowOf(e.set, n)), n, p.target), '第 ' + lv + ' 關：問的那一個算得出來');
  ok(T.checkCombo(p), '第 ' + lv + ' 關：算法的係數驗算正確');
  const usedEq = p.eqs.filter((e, k) => p.coef[k] !== 0);
  ok(usedEq.length === p.eqs.filter(e => e.used).length, '用到的紀錄＝有係數的紀錄');
  // 用到的紀錄每一條都少不了
  usedEq.forEach(e => { const rest = usedEq.filter(x => x !== e); ok(!T.determined(rest.map(x => rowOf(x.set, n)), n, p.target), '第 ' + lv + ' 關：每一條用到的紀錄都少不了'); });
  const hasTotal = p.eqs.some(e => e.set.length === n);
  if (lv <= T.TOTAL_TO) ok(hasTotal, '第 ' + lv + ' 關：有「全部一起」');
  if (lv < T.TRIPLE_FROM) ok(p.eqs.every(e => e.set.length === 2 || e.set.length === n), '第 ' + lv + ' 關前沒有三個一起');
  if (lv >= T.DISTRACT_FROM) { ok(p.eqs.some(e => !e.used), '第 ' + lv + ' 關：有一條用不到的紀錄'); distract++; }
  else ok(p.eqs.every(e => e.used), '第 ' + lv + ' 關：每條紀錄都用得到');
  if (lv >= T.MIN_USED_FROM) { ok(usedEq.length >= 3, '第 ' + lv + ' 關：至少用到 3 條（' + usedEq.length + '）'); used3++; }
  if (p.div > 1) halves++;
  ok(p.eqs.length <= T.MAX_EQS, '第 ' + lv + ' 關：紀錄最多 ' + T.MAX_EQS + ' 條（' + p.eqs.length + '）');
  ok(T.workText(p).endsWith('＝ ' + p.ws[p.target] + ' 公斤'), '算法文字');
}
ok(distract > 0 && used3 > 0 && halves > 30, '干擾紀錄 ' + distract + '、至少 3 條 ' + used3 + '、要除以 2 以上的題 ' + halves);
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
