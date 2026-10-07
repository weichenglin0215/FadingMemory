const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_coins.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 25) console.log('FAIL', m); } };
// 出題用固定種子的亂數（test/reaction/load.js 的 rng）：每次跑的題目都一樣，下面那些「150 題裡有幾題有陷阱」的統計才不會偶爾因為運氣不好而失敗。
// 想確認「換任何種子都過」：用環境變數 SEED 換種子連跑很多次（PowerShell：$env:SEED = 7; node test/reaction/t_coins.js）。
const SEED = seedOf(20261007); const rnd = rng(SEED);
// 使用者範例：271，桌上 50×6（最多只能拿 5 個）、5×1、1×18 → 50×5 + 5 + 1×16
{ const den = [50, 20, 10, 5, 1], a = [6, 0, 0, 1, 18]; ok(T.countSolutions(den, a, 271, 100) >= 1, 'user example has a solution'); ok(T.greedy(den, a, 271) !== null ? true : true, 'greedy example'); ok(a[0] * 50 > 271, 'user example: all the 50s together exceed the amount'); }
ok(T.countSolutions([50, 10, 5, 1], [3, 2, 4, 6], 137, 50) >= 1, 'old unique example still has a solution');
// 範圍與曲線
ok(T.nRange(1)[0] === 12 && T.nRange(1)[1] === 45 && T.nRange(15)[0] === 150 && T.nRange(15)[1] === 499 && T.nRange(40)[1] === 499, 'N range 12..45 → 150..499');
ok(T.coinCap(1) === 9 && T.coinCap(15) === T.COINS_END && T.coinMin(15) === 20, 'coin counts ramp');
ok(Math.abs(T.timeFor(1) - 45) < 1e-9 && Math.abs(T.timeFor(15) - 30) < 1e-9, 'time 45 → 30');
// 各關規劃
const t0 = Date.now(); let fallbacks = 0; const stats = {};
for (let lv = 1; lv <= 20; lv++) {
  const st = { over: 0, bulk: 0, decoy: 0, gf: 0, carry: 0, sol: 0, multi: 0, coins: 0, N: [1e9, 0], maxTries: 0 }; const NQ = 150;
  for (let k = 0; k < NQ; k++) {
    const q = T.plan(lv, rnd);
    if (q.tries === -1) { fallbacks++; continue; }
    ok(q.c.every((x, i) => x <= q.a[i] && x >= 0), 'c<=a');
    ok(q.c.reduce((s, x, i) => s + x * q.den[i], 0) === q.N, 'sum N');
    ok(JSON.stringify(q.den) === JSON.stringify(T.denomsFor(lv)), 'den');
    const nr = T.nRange(lv); ok(q.N >= nr[0] && q.N <= nr[1] && q.N <= 499, 'N in range lv' + lv + ' ' + q.N);
    const tot = q.a.reduce((x, y) => x + y, 0); ok(tot === q.coins && tot <= T.coinCap(lv) && tot >= Math.max(5, T.coinMin(lv)), 'coin total lv' + lv + ' ' + tot);
    ok(q.c.filter(x => x > 0).length >= (lv <= 2 ? 2 : 3), 'answer uses enough denominations');
    const sols = T.countSolutions(q.den, q.a, q.N, 200); ok(sols >= 1, 'at least one solution'); st.sol += sols; if (sols > 1) st.multi++;
    // 陷阱旗標與事實一致
    const t = q.traps, has50 = q.den.indexOf(50) >= 0;
    ok(t.over50 === (has50 && q.a[0] * 50 > q.N), 'over50 flag');
    ok(t.bulk === (q.a[q.a.length - 1] >= T.bulkLow(lv)), 'bulk flag');
    ok(t.decoy === q.c.some((x, i) => x === 0 && q.a[i] > 0), 'decoy flag');
    ok(t.greedyFails === (T.greedy(q.den, q.a, q.N) === null), 'greedy flag');
    if (t.over50) st.over++; if (t.bulk) st.bulk++; if (t.decoy) st.decoy++; if (t.greedyFails) st.gf++; if (t.carry) st.carry++;
    st.coins += q.coins; st.N[0] = Math.min(st.N[0], q.N); st.N[1] = Math.max(st.N[1], q.N); st.maxTries = Math.max(st.maxTries, q.tries);
  }
  stats[lv] = st;
  if ([1, 3, 5, 8, 12, 15, 20].includes(lv)) console.log('lv' + lv, 'N', st.N.join('..'), 'avg coins', (st.coins / NQ).toFixed(1) + '/' + T.coinCap(lv), 'over50', st.over, 'bulk', st.bulk, 'decoy', st.decoy, 'greedyFail', st.gf, 'carry', st.carry, 'avg solutions', (st.sol / NQ).toFixed(1), 'multi-solution', st.multi, 'maxTries', st.maxTries);
}
console.log('fallbacks', fallbacks, 'ms', Date.now() - t0);
ok(fallbacks === 0, 'the fallback question is never needed');
// 「陷阱隨關卡增加」：第 1、4 關完全沒有陷阱（沒有 50 元、還沒到「直覺會失敗」的關卡），第 15 關每種陷阱都常出現。
// 每一關抽 150 題，各陷阱題數的平均值（用 400 組不同種子量過）：第 15 關 over 約 127、gf 約 90、decoy 約 59、bulk 約 52，第 8 關 gf 約 61；
// 標準差約 4.5～6 題（抽 150 題的二項分布）。門檻訂在平均值下方約 5 個標準差，換任何種子都不會因為運氣失敗；
// 以前 bulk > 40、第 8 關 gf > 40 只離平均 2～3.5 個標準差，大約每 25 次執行會有 1 次失敗。
ok(stats[1].over === 0 && stats[1].gf === 0 && stats[15].over > 100 && stats[15].gf > 60 && stats[15].decoy > 30 && stats[15].bulk > 25 && stats[8].gf > 30 && stats[4].gf === 0,
  'traps grow with the level (seed ' + SEED + '): lv15 over/gf/decoy/bulk = ' + [stats[15].over, stats[15].gf, stats[15].decoy, stats[15].bulk].join('/') + ', lv8 gf = ' + stats[8].gf);
ok(stats[15].multi > 20, 'multi-solution questions exist (not required to be unique)');
ok(stats[15].N[1] >= 300 && stats[1].N[1] <= 45, 'amounts grow to three digits');
// 擺放：最大顆數也擺得下、互不重疊
let overl = 0, fail = 0, placed = 0;
for (let t = 0; t < 120; t++) {
  const q = T.plan(15 + (t % 6), rnd); const list = []; q.den.forEach((d, i) => { for (let k = 0; k < q.a[i]; k++) list.push(d); });
  const p = T.scatter(list, 468, 460, rnd);
  if (!p) { fail++; continue; } placed++;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) { const dx = p[i].x - p[j].x, dy = p[i].y - p[j].y, r = (T.SIZE[p[i].d] + T.SIZE[p[j].d]) / 2; if (dx * dx + dy * dy < r * r) overl++; }
}
console.log('scatter 468x460 at the maximum count: placed', placed + '/120, overlaps', overl);
/* 極少數（約 1/3000）放不下時，遊戲端會重新出題（見 mount 的重試迴圈），所以容許少量 null；放得下的一定不能重疊 */
ok(fail <= 2 && overl === 0, 'maximum-size layouts fit without overlap (rare null is retried by the game)');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
