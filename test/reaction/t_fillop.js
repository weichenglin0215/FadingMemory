const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_fillop.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261018); const rnd = rng(SEED);
const jsVal = (nums, ops) => Function('return ' + nums.map((x, i) => (i ? ops[i - 1] : '') + x).join(''))();

ok(T.numsFor(1) === 3 && T.numsFor(T.RAMP_LEVELS) === 5 && T.numsFor(60) === 5, '數字個數 3 → 5');
ok(T.blanksFor(1) === 1 && T.blanksFor(T.RAMP_LEVELS) === 4 && T.blanksFor(60) === 4, '空格數 1 → 4');
for (let l = 1; l <= 60; l++) { ok(T.blanksFor(l) <= T.numsFor(l) - 1, '空格數不超過符號數 ' + l); if (l > 1) ok(T.numsFor(l) >= T.numsFor(l - 1) && T.blanksFor(l) >= T.blanksFor(l - 1), '單調 ' + l); ok(T.ansMs(l) >= 6000, '限時下限 ' + l + '：' + T.ansMs(l)); }
// 運算：跟 JavaScript 的運算順序一致
for (let i = 0; i < 20000; i++) {
  const n = 3 + (i % 3), nums = [], ops = [];
  for (let k = 0; k < n; k++) nums.push(1 + Math.floor(rnd() * 12));
  for (let k = 0; k < n - 1; k++) ops.push(T.OPS[Math.floor(rnd() * 4)]);
  const r = T.evalOps(nums, ops), j = jsVal(nums, ops);
  if (r == null) ok(!isFinite(j), '除以 0 時 JS 也是無限大');
  else ok(Math.abs(r.n / r.d - j) < 1e-9, 'evalOps 與 JS 一致 ' + nums + ops + ' → ' + r.n + '/' + r.d + ' vs ' + j);
}
ok(T.evalOps([8, 2, 2, 3], ['/', '+', '*']).n === 10 && T.evalOps([8, 2, 2, 3], ['/', '+', '*']).d === 1, '8÷2+2×3');
ok(T.evalOps([7, 2], ['/'], true) === null && T.evalOps([7, 2], ['/']).d === 2, 'exact 模式除不盡回 null');
ok(T.valueText(T.rat(7, 2)) === '≈ 3.5000' && T.valueText(T.rat(6, 1)) === '6' && T.valueText(null) === '不能算', 'valueText');
// 範例：8 ? 2 + 2 × 3 = 10 的唯一解是 ÷
ok(T.countSolutions([8, 2, 2, 3], ['/', '+', '*'], [0], 10) === 1, '範例唯一解');
// 整題驗證：唯一解、算術一致（每個關卡都測）
const stat = { blanks: {}, tgt: 0 };
for (let i = 0; i < 3000; i++) {
  const lv = 1 + (i % 60), q = T.makeQuestion(lv, rnd);
  const v = T.evalOps(q.nums, q.ops);
  ok(v && v.d === 1 && v.n === q.target && q.target >= 1 && q.target <= T.TARGET_MAX, '目標值正確 ' + q.text);
  ok(Math.abs(jsVal(q.nums, q.ops) - q.target) < 1e-9, '目標與 JS 一致 ' + q.text);
  ok(q.nums.length === T.numsFor(lv) && q.blanks.length === T.blanksFor(lv), '數字／空格個數 ' + lv + '：' + q.text + ' ' + q.blanks);
  ok(q.blanks.every((b, k) => b >= 0 && b < q.ops.length && (k === 0 || b > q.blanks[k - 1])), '空格位置遞增且合法');
  ok(T.countSolutions(q.nums, q.ops, q.blanks, q.target) === 1, '剛好一種填法：' + q.text + ' 空格 ' + q.blanks);
  ok(T.evalOps(q.nums, q.ops, true) !== null, '真正的算式每一步都是整數');
  ok(q.text === T.toText(q.nums, q.ops, q.target), '文字');
  ok(q.nums.every(x => x >= 1 && x <= 12) && (lv > 10 || true), '數字範圍');
  if (q.blanks.length >= 3) ok(q.nums.every(x => x <= 9), '空格多時數字只用個位數（版面放得下）');
  stat.blanks[q.blanks.length] = (stat.blanks[q.blanks.length] || 0) + 1;
}
ok(Object.keys(stat.blanks).length === 4, '空格 1～4 個都出現：' + JSON.stringify(stat.blanks));
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
