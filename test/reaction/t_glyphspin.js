const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_glyphspin.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 難度曲線（線性、端點、到頂後維持）：起始轉速是 V1.24 的 10 倍（40→300 變 400→3000）
ok(near(T.spinAt(1), 400) && near(T.spinAt(T.RAMP_LEVELS), 3000) && near(T.spinAt(T.MAX_LEVEL), 3000), '起始旋轉速度端點 400→3000');
{ const d = T.spinAt(2) - T.spinAt(1); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.spinAt(l + 1) - T.spinAt(l), d, 1e-9), '起始旋轉速度線性 ' + l); }
ok(T.ansMs(1) === 10000 && T.ansMs(T.RAMP_LEVELS) === 6000 && T.ansMs(T.MAX_LEVEL) === 6000, '作答限時 10→6 秒');
ok(T.optCount(1) === 3 && T.optCount(T.RAMP_LEVELS) === 5, '按鈕數端點');
// 旋轉速度隨時間降低：剛出現＝起始值，SLOW_S 秒之後＝每秒一圈（360），中間單調下降、不低於 360
ok(T.SPIN_MIN === 360, '最慢每秒一圈');
for (const v0 of [400, 1200, 3000]) {
  ok(near(T.speedAt(v0, 0), v0) && near(T.speedAt(v0, T.SLOW_S * 1000), 360) && near(T.speedAt(v0, 60000), 360), '速度端點 v0=' + v0);
  let prev = Infinity; for (let ms = 0; ms <= 8000; ms += 50) { const v = T.speedAt(v0, ms); ok(v <= prev + 1e-9 && v >= 360 - 1e-9, '速度單調下降 ' + ms); prev = v; }
}
// 旋轉角度：speedAt 的積分（用數值積分核對）、方向正確、SLOW_S 秒之後等速
for (const dir of [1, -1]) {
  const q = { start: 10, dir, spin: 3000 }; let ang = 0; const dt = 1;
  for (let ms = 0; ms < 9000; ms += dt) ang += T.speedAt(3000, ms + dt / 2) * dt / 1000;
  ok(near(T.angleAt(q, 9000), 10 + dir * ang, 0.5), '角度＝速度的積分 dir=' + dir + '：' + T.angleAt(q, 9000) + ' vs ' + (10 + dir * ang));
}
ok(near(T.angleAt({ start: 7, dir: 1, spin: 3000 }, 0), 7), '角度起點');
{ const q = { start: 0, dir: 1, spin: 800 }; ok(near(T.angleAt(q, 10000) - T.angleAt(q, 9000), 360, 1e-6), 'SLOW_S 秒之後每秒剛好一圈'); }
// 字寬：90% → 作答時間用完 10%，線性
ok(near(T.sizeFrac(0, 8000), 0.9) && near(T.sizeFrac(8000, 8000), 0.1) && near(T.sizeFrac(4000, 8000), 0.5) && near(T.sizeFrac(99999, 8000), 0.1), '字寬 90% → 10%');
ok(T.SIZE_PCT[0] === 90 && T.SIZE_PCT[1] === 10, '字寬百分比參數');
// 筆劃目標：線性、端點
ok(near(T.strokeTarget(1), 3) && near(T.strokeTarget(T.MAX_LEVEL), 26) && near(T.strokeTarget(99), 26), '目標筆劃端點 3→26');
// 題庫：每組 2～4 個字、全是單一漢字、沒有數字與英文、不同組沒有重複字、筆劃數 2～28 且涵蓋大量高筆劃
const all = []; T.FAMILIES.forEach(f => { ok(f.c.length >= 2 && f.c.length <= 4, '每組 2～4 個字'); ok(f.s >= 2 && f.s <= 28, '筆劃數合理 ' + f.s); f.c.forEach(c => { ok(c.length === 1 && /[一-鿿]/.test(c), c + ' 是單一漢字'); all.push(c); }); });
ok(new Set(all).size === all.length, '不同組沒有重複字');
ok([...T.SYMMETRIC].every(c => all.indexOf(c) >= 0), '對稱字都在題庫裡');
ok(T.FAMILIES.length >= 45, '字群至少 45 組：' + T.FAMILIES.length);
ok(T.FAMILIES.filter(f => f.s >= 15).length >= 20, '15 劃以上的字群至少 20 組：' + T.FAMILIES.filter(f => f.s >= 15).length);
// 每一關都有足夠的候選字群（目標筆劃 ± 範圍）：連「最近 8 組都排除」之後也要有得選（不會一直抽到同一組）
for (let l = 1; l <= T.MAX_LEVEL; l++) {
  const tg = T.strokeTarget(l), n = T.FAMILIES.filter(f => Math.abs(f.s - tg) <= T.STROKE_SPREAD).length;
  ok(n >= 3, '第 ' + l + ' 關（目標 ' + tg.toFixed(1) + ' 劃）至少 3 組候選：' + n);
}
// 出題
let mirrors = 0, total = 0, sumStroke = {}, rec = [];
for (let l = 1; l <= T.MAX_LEVEL; l++) { rec = []; for (let i = 0; i < 120; i++) {
  const q = T.makeLevel(l, rnd, rec); total++;
  ok(q.options.length === T.optCount(l), '按鈕數 ' + q.options.length + ' @' + l);
  ok(q.options.indexOf(q.target) >= 0 && new Set(q.options).size === q.options.length, '正解在按鈕裡且不重複');
  ok(q.options.every(c => all.indexOf(c) >= 0), '按鈕字來自題庫');
  ok(!(q.mirror && T.SYMMETRIC.indexOf(q.target) >= 0), '對稱字不鏡射');
  ok(q.dir === 1 || q.dir === -1, '方向');
  ok(near(q.spin, T.spinAt(l)), '起始旋轉速度');
  ok(Math.abs(q.strokes - T.strokeTarget(l)) <= T.STROKE_SPREAD, '字群筆劃 ' + q.strokes + ' 在目標 ' + T.strokeTarget(l).toFixed(1) + ' ± ' + T.STROKE_SPREAD + ' 之內 @' + l);
  ok(!rec.slice(-T.RECENT_KEEP).includes(q.fam) || T.FAMILIES.filter(f => Math.abs(f.s - T.strokeTarget(l)) <= T.STROKE_SPREAD).length <= T.RECENT_KEEP, '不抽最近用過的字群 @' + l);
  rec.push(q.fam); if (rec.length > T.RECENT_KEEP) rec.shift();
  // 正解所在的字群至少提供 min(n, 組大小) 個按鈕
  const fam = T.FAMILIES[q.fam].c; ok(fam.indexOf(q.target) >= 0, '正解屬於所選字群');
  const inFam = q.options.filter(c => fam.indexOf(c) >= 0).length;
  ok(inFam === Math.min(q.options.length, fam.length), '同組字優先當干擾項');
  if (q.mirror) mirrors++; sumStroke[l] = (sumStroke[l] || 0) + q.strokes;
} }
ok(mirrors > total * 0.3 && mirrors < total * 0.55, '鏡射比例 ' + mirrors / total);
// 筆劃隨關卡越來越多：後面的關卡平均筆劃遠高於前面
ok(sumStroke[T.MAX_LEVEL] / 120 > sumStroke[1] / 120 + 15, '第 30 關平均筆劃 ' + (sumStroke[30] / 120).toFixed(1) + ' 遠高於第 1 關 ' + (sumStroke[1] / 120).toFixed(1));
for (let l = 1; l + 3 <= T.MAX_LEVEL; l += 3) ok(sumStroke[l + 3] >= sumStroke[l] - 120 * 1.5, '筆劃大致隨關卡上升 ' + l);
// 一局 30 關裡，同一個字群出現的次數不會很多（前面的抱怨：「就幾個字一直重複」）
{ const cnt = {}; let r2 = []; for (let l = 1; l <= T.MAX_LEVEL; l++) { const q = T.makeLevel(l, rnd, r2); r2.push(q.fam); if (r2.length > T.RECENT_KEEP) r2.shift(); cnt[q.fam] = (cnt[q.fam] || 0) + 1; }
  ok(Math.max(...Object.values(cnt)) <= 3, '一局 30 關同一字群最多 3 次：' + JSON.stringify(cnt)); ok(Object.keys(cnt).length >= 18, '一局 30 關至少用到 18 個不同字群：' + Object.keys(cnt).length); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(9) && T.rating(9) !== T.rating(16) && T.rating(16) !== T.rating(26), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
