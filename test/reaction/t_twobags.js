const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_twobags.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 重量與直徑：V1.32 起跟「面積」（直徑²）成正比；直徑 ×1.41 重量 ×2（玩家意見：立體容量人類很難判斷）
ok(near(T.weightOf(10), T.WEIGHT_K) && near(T.weightOf(20) / T.weightOf(10), 4) && near(T.weightOf(10 * Math.SQRT2) / T.weightOf(10), 2, 1e-9), '重量是直徑的二次方（面積）');
for (const d of [18, 30, 44.5, 66]) ok(near(T.diameterOf(T.weightOf(d)), d, 1e-9), 'diameterOf 是 weightOf 的反函數');
// 難度曲線：容許誤差 TOL[0] → TOL[1]（線性）；鑽石數 N0[0] → N0[1]（V1.32：兩個參數，第 1 關 → 極限關卡）。玩家會自己調參數，測試跟著參數走
ok(Array.isArray(T.N0) && T.N0.length === 2 && Array.isArray(T.TOL) && T.TOL.length === 2, 'N0、TOL 都是兩個數字的參數');
ok(near(T.tolAt(1), T.TOL[0]) && near(T.tolAt(T.RAMP_LEVELS), T.TOL[1]) && near(T.tolAt(T.RAMP_LEVELS + 20), T.TOL[1]), '容許誤差端點');
{ const d = T.tolAt(1) - T.tolAt(2); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.tolAt(l) - T.tolAt(l + 1), d, 1e-12), '容許誤差線性 ' + l); }
ok(T.countAt(1) === T.N0[0] && T.countAt(T.RAMP_LEVELS) === T.N0[1] && T.countAt(T.RAMP_LEVELS + 25) === T.N0[1], '鑽石數：第 1 關 ' + T.N0[0] + ' 顆、極限關卡 ' + T.N0[1] + ' 顆、之後維持');
{ let prev = T.countAt(1); for (let l = 2; l <= T.RAMP_LEVELS; l++) { const c = T.countAt(l); ok(c >= prev && c - prev <= 1 && Number.isInteger(c), '鑽石數只增不減、一次最多多 1 顆 lv' + l); prev = c; } }
// 分法函式
ok(near(T.diffOf([5, 3, 2], 0b001), 0) && near(T.diffOf([5, 3, 2], 0b110), 0) && near(T.diffOf([5, 3, 2], 0b011), 6), 'diffOf');
{ const b = T.bestPartition([5, 3, 2]); ok(b.diff === 0 && (b.mask === 1 || b.mask === 6), 'bestPartition'); }
ok(T.bestPartition([10, 1, 1, 1]).diff === 7, '最佳分法 10 對 3 → 差 7');
{ const d = [60, 20, 20, 20, 20], m = T.altPartition(d); ok((m & 1) === 1, '交錯放：最大的放左邊'); }
// 貪婪法：由大到小，每顆放進較輕的那邊
{ const w = [5, 4, 3, 3, 1], m = T.greedyPartition(w), l = w.reduce((s, x, i) => s + (m & (1 << i) ? x : 0), 0);
  ok((m & 1) === 1, '貪婪法：最大的放左邊'); ok(l === 8, '貪婪法 5,4,3,3,1 → 5+3 / 4+3+1 ＝ 8 對 8，左邊 ' + l); ok(T.diffOf(w, m) === 0, '貪婪法 5,4,3,3,1 剛好平分'); }
// 出題：每關 200 題，驗證全部規則
let fail = 0, total = 0, greedyOK = 0, altOK = 0, passBy = {}, trials = {};
for (let l = 1; l <= T.RAMP_LEVELS; l++) for (let k = 0; k < 200; k++) {
  const q = T.makeLevel(l, rnd); total++;
  ok(q.n === T.countAt(l) && q.d.length === q.n && q.w.length === q.n, '鑽石數');
  ok(q.d.every(x => x >= T.D_MIN - 1e-9 && x <= T.D_MAX + 1e-9), '直徑範圍 ' + q.d.map(x => x.toFixed(1)));
  ok(q.w.every((w, i) => near(w, T.weightOf(q.d[i]), 1e-9)), '重量與直徑一致');
  ok(Math.max.apply(null, q.d) / Math.min.apply(null, q.d) >= 1, '最大／最小直徑比（條件太嚴時會逐階段放寬，V1.27：保證出得了題）');
  ok(T.fitArea(q.d) <= T.FIT_AREA * T.RELAX[T.RELAX.length - 1][1] + 1e-9, '鑽石放得進秤盤：' + T.fitArea(q.d));
  ok(near(q.total, q.w.reduce((a, b) => a + b, 0), 1e-9) && near(q.tol, T.tolAt(l)), 'total／tol');
  const best = T.bestPartition(q.w); ok(near(best.diff, q.best.diff, 1e-9), '最佳分法');
  const solvable = best.diff <= q.tol * q.total + 1e-9; if (!solvable) fail++;
  if (q.n >= T.HEUR_FROM) {
    const a = T.diffOf(q.w, T.greedyPartition(q.w)) <= q.tol * q.total, b = T.diffOf(q.w, T.altPartition(q.d)) <= q.tol * q.total;
    if (a) greedyOK++; if (b) altOK++;
  }
  // 容許範圍內的分法不能多到「亂放也過」：隨機分法通過的比例（n≥5）
  if (q.n >= 5) { let pass = 0; for (let r = 0; r < 100; r++) { const m = Math.floor(rnd() * (1 << q.n)); if (T.diffOf(q.w, m) <= q.tol * q.total) pass++; } passBy[q.n] = (passBy[q.n] || 0) + pass; trials[q.n] = (trials[q.n] || 0) + 1; }
}
ok(fail === 0, '每一題都有解：無解 ' + fail + ' / ' + total);
ok(greedyOK === 0 && altOK === 0, '鑽石數達到 HEUR_FROM 顆時，貪婪法、交錯分法都不能過：' + greedyOK + ' / ' + altOK);
{ const rows = Object.keys(passBy).map(n => n + ' 顆：' + (passBy[n] / trials[n]).toFixed(2)); console.log('隨機分法能過的平均比例（每 100 次）：' + rows.join('、'));
  Object.keys(passBy).forEach(n => ok(passBy[n] / trials[n] < 25, '亂放通過的機率要低（' + n + ' 顆）：' + (passBy[n] / trials[n]).toFixed(2))); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(5) && T.rating(5) !== T.rating(8) && T.rating(8) !== T.rating(10), '評語分級');

// V1.32：確認後天秤傾斜——範圍內微傾（≤ TILT_PASS 度）、範圍外明顯傾斜（TILT_FAIL[0]～[1] 度）；右邊重＝正（順時針）、左邊重＝負
{ const tol = 0.05, tot = 20, lim = tol * tot;
  ok(T.tiltOf(10, 10, tol) === 0, '剛好平衡：水平');
  ok(T.tiltOf(10 - 0.3, 10 + 0.3, tol) > 0, '右邊重：正的角度');
  ok(T.tiltOf(10 + 0.3, 10 - 0.3, tol) < 0, '左邊重：負的角度');
  // 範圍內：|角度| ≤ TILT_PASS，差越多越斜
  let prev = 0;
  for (let k = 1; k <= 20; k++) { const diff = lim * k / 20, a = Math.abs(T.tiltOf(10 - diff / 2, 10 + diff / 2, tol)); ok(a <= T.TILT_PASS + 1e-9 && a >= prev - 1e-12, '範圍內微傾：差 ' + diff.toFixed(3) + ' → ' + a.toFixed(3) + '°'); prev = a; }
  ok(near(Math.abs(T.tiltOf(10 - lim / 2, 10 + lim / 2, tol)), T.TILT_PASS), '差剛好在容許邊緣 ＝ TILT_PASS');
  // 範圍外：TILT_FAIL[0] ≤ |角度| ≤ TILT_FAIL[1]，超出越多越斜，而且一定比範圍內明顯
  prev = 0;
  for (let k = 1; k <= 40; k++) { const diff = lim * (1 + k * 0.1), a = Math.abs(T.tiltOf(10 - diff / 2, 10 + diff / 2, tol)); ok(a >= T.TILT_FAIL[0] - 1e-9 && a <= T.TILT_FAIL[1] + 1e-9 && a >= prev - 1e-12 && a > T.TILT_PASS, '範圍外明顯傾斜：差 ' + diff.toFixed(3) + ' → ' + a.toFixed(3) + '°'); prev = a; }
  ok(near(Math.abs(T.tiltOf(0, 20, tol)), T.TILT_FAIL[1]), '差到最大 ＝ TILT_FAIL[1]');
  ok(T.tiltOf(0, 20, 0) === T.TILT_FAIL[1] && T.tiltOf(10, 10, 0) === 0, '容許誤差 0 也不會出錯');
}
// 出題後的每一種分法：範圍內一定微傾、範圍外一定明顯（用實際關卡驗證）
{ for (let l = 1; l <= T.RAMP_LEVELS; l += 3) { const q = T.makeLevel(l, rnd);
    for (let m = 0; m < (1 << q.n); m++) { let L = 0, R = 0; q.w.forEach((w, i) => { if (m & (1 << i)) L += w; else R += w; });
      const a = Math.abs(T.tiltOf(L, R, q.tol)), pass = Math.abs(L - R) <= q.tol * q.total;
      ok(pass ? a <= T.TILT_PASS + 1e-9 : a >= T.TILT_FAIL[0] - 1e-9, '傾斜角度跟過不過關一致 lv' + l); } } }
// 傾斜動畫的緩動：0 → 1，過衝不多，最後停在 1
ok(T.settle(0) === 0 && T.settle(1) === 1 && T.settle(-1) === 0 && T.settle(2) === 1, '緩動端點');
{ let mx = 0, any = false; for (let i = 0; i <= 1000; i++) { const v = T.settle(i / 1000); mx = Math.max(mx, v); if (v > 1.01) any = true; ok(Number.isFinite(v) && v > -0.01 && v < 1.3, '緩動值合理'); }
  ok(any && mx < 1.25, '擺過頭一點再回來，過衝 ' + ((mx - 1) * 100).toFixed(1) + '%'); ok(Math.abs(T.settle(0.999) - 1) < 0.01, '快結束時已經停在終點'); }
// 吊點位移：右邊重（順時針）→ 右邊吊點下降、左邊吊點上升；兩邊都往中間靠；傾斜 0 度不動；左右對稱
{ const s0 = T.hangShift(0, 118), s = T.hangShift(10, 118), s2 = T.hangShift(-10, 118);
  ok(s0.l.dx === 0 && s0.l.dy === 0 && s0.r.dx === 0 && s0.r.dy === 0, '水平時不位移');
  ok(s.r.dy > 0 && s.l.dy < 0 && s.l.dx > 0 && s.r.dx < 0, '順時針：右邊下降、左邊上升、兩邊往中間靠');
  ok(near(s.r.dy, -s.l.dy) && near(s.l.dx, -s.r.dx), '左右對稱');
  ok(near(s.r.dy, 118 * Math.sin(10 * Math.PI / 180)), '下降量 ＝ 吊點離支點的水平距離 × sin(角度)');
  ok(s2.l.dy > 0 && s2.r.dy < 0, '逆時針：左邊下降'); }
// 文字與介面
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_twobags.js'), 'utf8');
  ok(T.GEM === '💎' && G.rule.indexOf('石頭') < 0 && src.indexOf('把鑽石拖到左右秤盤') > 0, '文字是「鑽石」，圖案是 💎'); ok(T.gemPx(100) > 70 && T.gemPx(100) < 100 && G.rule.indexOf('鑽石') > 0, '💎 的字級跟著直徑');
  ok(G.rule.indexOf('面積') > 0 && G.rule.indexOf('三次方') < 0 && G.rule.indexOf('電子秤') < 0 && G.rule.indexOf('天秤') > 0, '規則文字：重量跟面積成正比、天秤（不再說三次方、電子秤）');
  ok(src.indexOf('Math.pow(d / 10, 2)') > 0 && src.indexOf('Math.cbrt') < 0 && src.indexOf('Math.pow(d / 10, 3)') < 0, '實作：不再用三次方');
  ok(src.indexOf("'tb-beam'") > 0 && src.indexOf('tiltTo(tiltOf(s.l, s.r, q.tol))') > 0 && src.indexOf("'tb-bal--bad'") > 0 && src.indexOf('tb-disp') < 0, '實作：水平天秤，確認後依重量傾斜，超出範圍變紅');
  ok(src.indexOf('var N0 = [') > 0 && src.indexOf('N0[0], N0[1], RAMP_LEVELS') > 0, '實作：N0 是兩個參數'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
