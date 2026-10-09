const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_maxexpr.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);
const val = f => f.n / f.d;

// 分數運算與乘除先算
ok(T.evalExpr(2, '+', 3, '*', 4).n === 14 && T.evalExpr(2, '*', 3, '+', 4).n === 10, '2＋3×4＝14、2×3＋4＝10');
ok(T.evalExpr(10, '-', 6, '/', 3).n === 8 && T.evalExpr(10, '/', 4, '-', 1).n === 3 && T.evalExpr(10, '/', 4, '-', 1).d === 2, '10－6÷3＝8、10÷4－1＝3/2');
ok(T.evalExpr(8, '/', 2, '/', 2).n === 2 && T.evalExpr(8, '/', 2, '/', 2).d === 1, '8÷2÷2＝2（由左到右）');
ok(T.evalExpr(1, '-', 9, '*', 2).n === -17, '1－9×2＝−17（可以是負數）');
{ const v = T.evalExpr(5, '/', 3, '+', 1); ok(v.n === 8 && v.d === 3, '5÷3＋1＝8/3'); ok(T.valText(v) === '8/3 ＝ 2.6667', '分數同時顯示 4 位小數：' + T.valText(v)); ok(T.valText(T.fr(6, 3)) === '2', '整數不加小數'); }
ok(T.cmp(T.fr(1, 3), T.fr(2, 6)) === 0 && T.cmp(T.fr(1, 2), T.fr(1, 3)) > 0 && T.cmp(T.fr(-1, 2), T.fr(-1, 3)) < 0, '分數比較');
// 窮舉：對照暴力（直接算 120 個排列）
for (let i = 0; i < 300; i++) {
  const l = 1 + (i % 20), q = T.makeLevel(l, rnd); let best = null;
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) { if (a === b || b === c || a === c) continue; const v = val(T.evalExpr(q.cards[a], q.ops[0], q.cards[b], q.ops[1], q.cards[c])); if (best == null || v > best) best = v; }
  ok(near(val(q.best), best, 1e-9), '窮舉結果＝暴力結果');
  ok(q.arrs.every(a => near(val(T.evalExpr(q.cards[a[0]], q.ops[0], q.cards[a[1]], q.ops[1], q.cards[a[2]])), best, 1e-9)), 'arrs 都達到最大值');
  ok(q.cards.length === 6 && new Set(q.cards).size === 6, '6 張不同的牌');
  ok(near(val(q.worst), (() => { let w = 1e18; for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) { if (a === b || b === c || a === c) continue; w = Math.min(w, val(T.evalExpr(q.cards[a], q.ops[0], q.cards[b], q.ops[1], q.cards[c]))); } return w; })(), 1e-9), '最小值');
}
// 難度曲線：限時、牌範圍、符號
ok(T.timeMs(1) === 40000 && T.timeMs(T.RAMP_LEVELS) === 20000, '限時端點');
{ const d = T.timeMs(1) - T.timeMs(2); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.timeMs(l) - T.timeMs(l + 1), d, 2), '限時線性 ' + l); }
ok(T.opsFor(3).indexOf('/') < 0 && T.opsFor(T.DIV_FROM).indexOf('/') >= 0, '第 4 關起才有 ÷');
ok(T.rangeFor(1)[1] === 9 && T.rangeFor(6)[1] === 20 && T.rangeFor(16)[1] === 99, '牌的範圍');
ok(T.greedyFailFrac(1) === 0 && T.greedyFailFrac(2) === 0 && near(T.greedyFailFrac(T.GREEDY_FROM), 0.3) && near(T.greedyFailFrac(T.RAMP_LEVELS), 0.8), '直覺失敗比例端點');
// 統計：各關直覺做法失敗的比例要接近設定（第 3 關起）
for (const l of [3, 10, 20]) {
  let fail = 0, n = 1500;
  for (let i = 0; i < n; i++) { const q = T.makeLevel(l, rnd); if (q.greedyFails) fail++; }
  const want = T.greedyFailFrac(l); ok(Math.abs(fail / n - want) < 0.06, '第 ' + l + ' 關直覺做法失敗比例 ' + (fail / n).toFixed(3) + '（目標 ' + want.toFixed(3) + '）');
}
// 第 1、2 關不控制（不論結果）
{ let div = 0; for (let i = 0; i < 400; i++) { const q = T.makeLevel(2, rnd); if (q.ops.indexOf('/') >= 0) div++; } ok(div === 0, '第 2 關沒有 ÷'); }
// greedyArr 是最大的三張由大到小
{ const g = T.greedyArr([5, 9, 1, 7, 3, 8]); ok(g.join() === '1,5,3', 'greedyArr'); }
// 除數不會是 0（牌都 ≥ 1）
for (let l = 1; l <= 20; l++) for (let i = 0; i < 50; i++) { const q = T.makeLevel(l, rnd); ok(q.cards.every(v => v >= 1), '牌都是正整數'); ok(Number.isFinite(val(q.best)), '最大值是有限數'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(9) && T.rating(9) !== T.rating(15) && T.rating(15) !== T.rating(20), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
