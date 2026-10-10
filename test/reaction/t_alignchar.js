const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_alignchar.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261032); const rnd = rng(SEED);

ok(T.stripsFor(1) === 5 && T.stripsFor(T.RAMP_LEVELS) === 12 && T.stripsFor(60) === 12, '直條 5 → 12');
ok(T.optionsFor(1) === 4 && T.optionsFor(T.RAMP_LEVELS) === 6, '選項 4 → 6');
ok(near(T.cycleFor(1), 5) && near(T.cycleFor(T.RAMP_LEVELS), 2.8) && T.timeMs(1) === 14000 && T.timeMs(T.RAMP_LEVELS) === 9000, '週期 5 → 2.8 秒、限時 14 → 9 秒');
for (let l = 2; l <= 60; l++) ok(T.stripsFor(l) >= T.stripsFor(l - 1) && T.optionsFor(l) >= T.optionsFor(l - 1) && T.cycleFor(l) <= T.cycleFor(l - 1) + 1e-12 && T.timeMs(l) <= T.timeMs(l - 1), '單調 ' + l);
// 群組完整性
T.GROUPS.forEach((g, i) => ok(g.length >= 4 && new Set(g).size === g.length && g.every(c => [...c].length === 1), '群組 ' + i + ' 合法'));
ok(T.CHARS.length >= 60, '字數 ' + T.CHARS.length);
// 動作函式：偏移在 0～P；對準時刻全部是 0；對準之間不是 0
const P = T.PIC.h;
ok(near(T.offsetAt(1, 1, 1, 5, P), 0) && near(T.offsetAt(-2, 2, 1, 5, P), P - (2 * 1 / 5 * P) % P) && T.offsetAt(3, 0, 1, 5, P) >= 0 && T.offsetAt(3, 0, 1, 5, P) < P, 'offsetAt');
for (let i = 0; i < 2000; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, rnd);
  ok(q.ks.length === q.n && q.ks.every(k => k !== 0 && Math.abs(k) <= T.KMAX && Number.isInteger(k)), '速度倍數 ' + q.ks);
  ok(q.ks.some(k => k > 0) && q.ks.some(k => k < 0), '往上、往下都有');
  ok(new Set(q.ks.map(Math.abs)).size >= 2, '至少兩種速度');
  ok(q.tAlign >= q.cycle * 0.6 - 1e-9 && q.tAlign <= q.cycle * 1.0 + 1e-9, '第一次對準時刻');
  for (let m = 0; m < 4; m++) ok(T.misalign(q.ks, q.tAlign + m * q.cycle, q.tAlign, q.cycle, P) < 1e-6, '對準時刻全部對齊 m=' + m);
  ok(T.misalign(q.ks, q.tAlign + q.cycle / 2, q.tAlign, q.cycle, P) > 20, '週期一半時明顯沒對準：' + T.misalign(q.ks, q.tAlign + q.cycle / 2, q.tAlign, q.cycle, P).toFixed(1));
  ok(q.options.length === T.optionsFor(lv) && new Set(q.options).size === q.options.length && q.options[q.answer] === q.ch, '選項');
  ok(T.CHARS.includes(q.ch), '字在字庫');
  ok(q.options.filter(c => c !== q.ch).every(c => T.GROUPS.some(g => g.includes(q.ch) && g.includes(c))) || T.GROUPS.filter(g => g.includes(q.ch)).reduce((a, g) => a + g.length, 0) < 6, '選項優先同群');
}
// 對準的窗口：偏移容許 ±8% P 內的時間長度（毫秒）——最難的一關要 ≥ 80 ms，不能短到看不見
{ const q = T.makeLevel(T.RAMP_LEVELS, rnd); let w = 0; const dt = 0.001; for (let t = q.tAlign - q.cycle / 2; t < q.tAlign + q.cycle / 2; t += dt) if (T.misalign(q.ks, t, q.tAlign, q.cycle, P) <= 0.08 * P) w += dt;
  ok(w * 1000 >= 60, '最難一關的對準窗口 ' + (w * 1000).toFixed(0) + ' ms'); }
// 答案位置、字都會變化
const pos = new Set(), chs = new Set(); for (let i = 0; i < 400; i++) { const q = T.makeLevel(10, rnd); pos.add(q.answer); chs.add(q.ch); } ok(pos.size >= 5 && chs.size >= 30, '答案位置與字有變化 ' + pos.size + '/' + chs.size);
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(8) && T.rating(8) !== T.rating(14) && T.rating(14) !== T.rating(25), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
