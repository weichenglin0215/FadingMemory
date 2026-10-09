const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_glyphspin.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 難度曲線（線性、端點、到頂後維持）
ok(near(T.spinAt(1), 40) && near(T.spinAt(T.RAMP_LEVELS), 300) && near(T.spinAt(T.MAX_LEVEL), 300), '旋轉速度端點');
{ const d = T.spinAt(2) - T.spinAt(1); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.spinAt(l + 1) - T.spinAt(l), d, 1e-9), '旋轉速度線性 ' + l); }
ok(T.showMs(1) === 3000 && T.showMs(T.RAMP_LEVELS) === 1200, '顯示時間端點');
ok(T.optCount(1) === 3 && T.optCount(T.RAMP_LEVELS) === 5, '按鈕數端點');
for (let l = 1; l <= T.MAX_LEVEL; l++) ok(T.ansMs(l) === T.showMs(l) + 2000, '作答限時＝顯示＋2 秒');
// 題庫：每組至少 2 個字、全是單一漢字、沒有數字與英文、不同組沒有重複字
const all = []; T.FAMILIES.forEach(f => { ok(f.length >= 2 && f.length <= 4, '每組 2～4 個字'); f.forEach(c => { ok(c.length === 1 && /[一-鿿]/.test(c), c + ' 是單一漢字'); all.push(c); }); });
ok(new Set(all).size === all.length, '不同組沒有重複字');
ok([...T.SYMMETRIC].every(c => all.indexOf(c) >= 0), '對稱字都在題庫裡');
// 出題
let mirrors = 0, total = 0, byLen = {};
for (let l = 1; l <= T.MAX_LEVEL; l++) for (let i = 0; i < 120; i++) {
  const q = T.makeLevel(l, rnd); total++;
  ok(q.options.length === T.optCount(l), '按鈕數 ' + q.options.length + ' @' + l);
  ok(q.options.indexOf(q.target) >= 0 && new Set(q.options).size === q.options.length, '正解在按鈕裡且不重複');
  ok(q.options.every(c => all.indexOf(c) >= 0), '按鈕字來自題庫');
  ok(!(q.mirror && T.SYMMETRIC.indexOf(q.target) >= 0), '對稱字不鏡射');
  ok(q.dir === 1 || q.dir === -1, '方向');
  ok(near(q.spin, T.spinAt(l)), '旋轉速度');
  // 正解所在的字群至少提供 min(n, 組大小) 個按鈕
  const fam = T.FAMILIES.find(f => f.indexOf(q.target) >= 0); const inFam = q.options.filter(c => fam.indexOf(c) >= 0).length;
  ok(inFam === Math.min(q.options.length, fam.length), '同組字優先當干擾項');
  if (q.mirror) mirrors++; byLen[q.options.length] = (byLen[q.options.length] || 0) + 1;
}
ok(mirrors > total * 0.3 && mirrors < total * 0.55, '鏡射比例 ' + mirrors / total);
// 旋轉角度：隨時間線性、方向正確
{ const q = { start: 10, dir: 1, spin: 90 }; ok(near(T.angleAt(q, 1000), 100) && near(T.angleAt({ start: 10, dir: -1, spin: 90 }, 1000), -80), 'angleAt'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(9) && T.rating(9) !== T.rating(16) && T.rating(16) !== T.rating(26), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
