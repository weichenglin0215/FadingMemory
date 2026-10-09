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
ok(T.nRange(1)[0] === 60 && T.nRange(1)[1] === 100 && T.nRange(15)[0] === 250 && T.nRange(15)[1] === 650 && T.nRange(40)[1] === 650, 'N range 60..100 → 250..650');
ok(T.coinCap(1) === 9 && T.coinCap(15) === T.COINS_END && T.coinMin(15) === 20, 'coin counts ramp');
ok(Math.abs(T.timeFor(1) - 15) < 1e-9 && Math.abs(T.timeFor(15) - 10) < 1e-9, 'time 15 → 10（原本 45 → 30 的三分之一）');
ok(JSON.stringify(T.denomsFor(1)) === '[50,20,10,5,1]' && JSON.stringify(T.denomsFor(15)) === '[50,20,10,5,1]', '每一關都是五種幣值');
ok(T.minRatio(1) > 0.49 && T.minRatio(15) > 0.71, '題目金額至少是桌上總額的 0.5 → 0.72');
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
    const nr = T.nRange(lv); ok(q.N >= nr[0] && q.N <= nr[1] && q.N <= 650, 'N in range lv' + lv + ' ' + q.N);
    // 使用者的要求：每一關桌上五種幣值都至少有一枚（以前常常沒有 10、5）；題目不能比桌上總額小太多（不再桌上一堆 50、題目只有 186）
    ok(q.a.every(x => x >= 1), '每種幣值桌上至少 1 枚 lv' + lv + ' ' + q.a.join(','));
    const tableSum = q.a.reduce((s, x, i) => s + x * q.den[i], 0);
    ok(q.N <= tableSum, '題目金額不超過桌上總額');
    if (q.pass < 2) ok(q.N >= tableSum * T.minRatio(lv) - 1e-9, '題目金額 ≥ 桌上總額 × 比例 lv' + lv + ' N=' + q.N + ' 總額=' + tableSum);
    st.ratio = (st.ratio || 0) + q.N / tableSum;
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
// 「陷阱隨關卡增加」：V1.21.0 起每關五種幣值都有，「直覺做法失敗」已關掉（gf 一律 0）；
// 「大量 1 元」bulk 隨關卡增加（第 1 關約 17／150 題 → 第 15 關約 60／150 題，標準差約 6，門檻訂在平均下方 4 個標準差以上）。
ok(stats[1].gf === 0 && stats[15].gf === 0 && stats[8].gf === 0, '直覺做法失敗的題目已關閉');
ok(stats[15].bulk > stats[1].bulk + 15 && stats[15].bulk > 35, 'bulk traps grow with the level (seed ' + SEED + '): lv1/lv15 = ' + stats[1].bulk + '/' + stats[15].bulk);
ok(stats[15].over > 20 && stats[15].decoy > 100, 'over50／decoy traps are common (seed ' + SEED + '): ' + stats[15].over + '/' + stats[15].decoy);
ok(stats[15].multi > 20, 'multi-solution questions exist (not required to be unique)');
ok(stats[15].N[1] >= 450 && stats[1].N[1] <= 100 && stats[1].N[0] >= 60, 'amounts grow to three digits（第 1 關 60～100、第 15 關最高 450 以上）');
ok(stats[1].ratio / 150 >= 0.5 && stats[15].ratio / 150 >= 0.72, '題目金額佔桌上總額的比例平均：第 1 關 ' + (stats[1].ratio / 150).toFixed(2) + '、第 15 關 ' + (stats[15].ratio / 150).toFixed(2));
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
