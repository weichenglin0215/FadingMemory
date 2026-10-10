const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_remainder.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261013); const rnd = rng(SEED);

// 限時、被除數大小：線性、到頂維持
ok(T.ansMs(1) === 12000 && T.ansMs(T.RAMP_LEVELS) === 7000 && T.ansMs(60) === 7000, '限時 12 → 7 秒');
ok(T.nMaxFor(1) === 300 && T.nMaxFor(T.RAMP_LEVELS) === 9999 && T.nMaxFor(60) === 9999, '被除數上限 300 → 9999');
for (let l = 2; l <= 60; l++) ok(T.ansMs(l) <= T.ansMs(l - 1) && T.nMaxFor(l) >= T.nMaxFor(l - 1), '單調 ' + l);
// 除數解鎖
ok(T.divsFor(1).join() === '5,10' && T.divsFor(3).join() === '5,10,6,9' && T.divsFor(6).indexOf(11) >= 0 && T.divsFor(11).indexOf(13) >= 0 && T.divsFor(21).indexOf(19) >= 0 && T.divsFor(20).indexOf(19) < 0, '除數解鎖');
// 選項：除數 5 → 0..4；其他除數 → 5 個不重複、含正解、全部在 0..d-1、由小到大
for (let r = 0; r < 5; r++) ok(T.makeOptions(5, r, rnd).join() === '0,1,2,3,4', 'd=5 選項');
for (const d of [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]) for (let r = 0; r < d; r++) for (let k = 0; k < 20; k++) {
  const o = T.makeOptions(d, r, rnd);
  ok(o.length === 5 && new Set(o).size === 5 && o.includes(r) && o.every(v => Number.isInteger(v) && v >= 0 && v < d) && o.every((v, i) => i === 0 || o[i - 1] < v), '選項合法 d=' + d + ' r=' + r + ' → ' + o);
}
// 錯誤選項大多緊貼正解：d=19 時，差 ≤3 的錯誤選項比例要高於隨機（隨機約 7/18≈39%）
{ let near = 0, tot = 0; for (let i = 0; i < 3000; i++) { const r = 4 + (i % 10), o = T.makeOptions(19, r, rnd); o.forEach(v => { if (v !== r) { tot++; if (Math.abs(v - r) <= 3) near++; } }); }
  ok(near / tot > 0.6, '錯誤選項貼近正解：' + (near / tot).toFixed(3)); }
// 整題：被除數＝商×除數＋餘數、餘數正確、範圍
const seen = {};
for (let i = 0; i < 9000; i++) {
  const lv = 1 + (i % 60), q = T.makeQuestion(lv, rnd);
  ok(q.n % q.d === q.r && Math.floor(q.n / q.d) === q.q, '餘數與商正確 ' + q.n + '÷' + q.d);
  ok(q.n >= T.N_MIN && q.n <= T.nMaxFor(lv), '被除數範圍 ' + q.n + ' 第 ' + lv + ' 題');
  ok(T.divsFor(lv).includes(q.d), '除數在解鎖範圍');
  ok(q.options.length === 5 && q.options.includes(q.r), '選項含正解');
  ok(q.explain === q.n + ' ＝ ' + q.d + ' × ' + q.q + ' ＋ ' + q.r, '揭曉文字');
  seen[q.d] = (seen[q.d] || 0) + 1;
}
ok(Object.keys(seen).length === 15, '所有除數都出現過：' + Object.keys(seen).join());
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
