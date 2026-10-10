const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_hiddendigit.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261014); const rnd = rng(SEED);

// 題型解鎖
ok(T.typesFor(1).join() === 'add2' && T.typesFor(5).join() === 'add2,sub2' && T.typesFor(6).indexOf('mul1') >= 0 && T.typesFor(10).indexOf('add3') >= 0 && T.typesFor(14).indexOf('mul2') >= 0 && T.typesFor(22).indexOf('mul31') >= 0 && T.typesFor(21).indexOf('mul31') < 0, '題型解鎖');
// 限時：各題型線性、到頂維持、都不低於 4 秒
for (const k of Object.keys(T.TYPES)) {
  ok(T.ansMs(1, k) === Math.round(T.TYPES[k].sec * 1.3 * 1000) && T.ansMs(T.RAMP_LEVELS, k) === Math.round(T.TYPES[k].sec * 0.8 * 1000) && T.ansMs(60, k) === T.ansMs(T.RAMP_LEVELS, k), '限時端點 ' + k);
  for (let l = 2; l <= 60; l++) ok(T.ansMs(l, k) <= T.ansMs(l - 1, k), '限時單調 ' + k + l);
  ok(T.ansMs(60, k) >= 4000, '限時下限 ' + k);
}
// 整題驗證
const hid = {};
for (let i = 0; i < 9000; i++) {
  const lv = 1 + (i % 60), q = T.makeQuestion(lv, rnd);
  ok(T.typesFor(lv).includes(q.type), '題型在解鎖範圍');
  ok(q.result === T.calc(q.type, q.a, q.b), '結果正確 ' + q.full);
  ok(q.digits.join('') === String(q.result) && q.digits.length >= 2, '每一位數字');
  ok(q.hidden >= 0 && q.hidden < q.digits.length && q.answer === q.digits[q.hidden], '遮住的位數與答案');
  ok(q.result > 0 && Number.isInteger(q.result), '結果是正整數');
  if (q.type === 'sub2') ok(q.a > q.b + 5, '減法不出負數');
  ok(q.full === q.text + ' ＝ ' + q.result, '完整算式');
  const key = lv <= 3 ? 'early' : 'late'; hid[key] = hid[key] || { last: 0, n: 0 };
  hid[key].n++; if (q.hidden === q.digits.length - 1) hid[key].last++;
}
// 前期較常遮住個位數、後期接近均勻
ok(hid.early.last / hid.early.n > hid.late.last / hid.late.n + 0.05, '個位數被遮住的比例隨題號下降：' + (hid.early.last / hid.early.n).toFixed(3) + ' → ' + (hid.late.last / hid.late.n).toFixed(3));
// 所有位置都會被遮到
const posSeen = new Set(); for (let i = 0; i < 3000; i++) posSeen.add(T.makeQuestion(40, rnd).hidden); ok(posSeen.size >= 3, '各位數都會被遮到：' + [...posSeen]);
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
