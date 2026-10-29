const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_spingap.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261026); const rnd = rng(SEED);

// 難度：轉速、缺口線性；到頂維持
// （基準轉速 omegaDeg 與缺口 gapFor 跟著檔案裡的 OMEGA_REV／GAP_DEG 參數走；使用者手調過，不寫死數字）
const O0 = T.OMEGA_REV[0] * 360, O1 = T.OMEGA_REV[1] * 360;
ok(near(T.omegaDeg(1), O0) && near(T.omegaDeg(T.RAMP_LEVELS), O1) && near(T.omegaDeg(100), O1), '基準轉速 ' + T.OMEGA_REV[0] + ' → ' + T.OMEGA_REV[1] + ' 圈/秒');
ok(near(T.gapFor(1), T.GAP_DEG[0]) && near(T.gapFor(T.RAMP_LEVELS), T.GAP_DEG[1]) && near(T.gapFor(100), T.GAP_DEG[1]), '缺口 ' + T.GAP_DEG[0] + ' → ' + T.GAP_DEG[1] + ' 度');
for (let l = 2; l <= 100; l++) ok(T.omegaDeg(l) >= T.omegaDeg(l - 1) - 1e-12 && T.gapFor(l) <= T.gapFor(l - 1) + 1e-12, '單調 ' + l);
{ const mid = (T.RAMP_LEVELS + 1) / 2; ok(near(T.omegaDeg(mid) - (O0 + O1) / 2, 0, 7), '基準轉速中點約等於平均（線性）：第 ' + mid + ' 關（跟著 RAMP_LEVELS 走）'); }
// 人類做得到：每一發容許的時間誤差（毫秒）都要 ≥ 40 ms；起點很寬鬆
for (let l = 1; l <= 100; l++) ok(T.tolMs(l) >= 40, '容許時間誤差 ≥ 40ms：第 ' + l + ' 發 ' + T.tolMs(l).toFixed(1));
ok(T.tolMs(1) > 300 && T.tolMs(T.RAMP_LEVELS) < 80 && T.tolMs(T.RAMP_LEVELS) > 40, '起點 ±' + T.tolMs(1).toFixed(0) + 'ms，終點 ±' + T.tolMs(T.RAMP_LEVELS).toFixed(0) + 'ms');
// 角度正規化
ok(T.norm180(190) === -170 && T.norm180(-190) === 170 && T.norm180(0) === 0 && T.norm180(360) === 0 && T.norm180(180) === 180 && T.norm180(-180) === 180 && near(T.norm180(725), 5), 'norm180');
// 砲彈幾何：飛行時間 0.6 秒到環內緣
const g = T.ballGeom();
ok(near((g.y0 - g.yc) / g.v, 0.6, 1e-9) && g.yc < g.y0, '飛行 0.6 秒');
ok(near(T.ballHalfDeg(), Math.asin(12 / 178) * 180 / Math.PI), '砲彈半徑對應角度');
// 判定邊界：差距剛好等於容許誤差算過，超過一點點就撞
for (const lv of [1, 10, 30]) {
  const tol = T.tolDeg(lv);
  ok(T.judgeShot(lv, -90).pass && T.judgeShot(lv, -90 + tol).pass && T.judgeShot(lv, -90 - tol).pass, '邊界內 lv' + lv);
  ok(!T.judgeShot(lv, -90 + tol + 0.01).pass && !T.judgeShot(lv, -90 - tol - 0.01).pass && !T.judgeShot(lv, 90).pass, '邊界外 lv' + lv);
  ok(T.judgeShot(lv, 270).pass, '角度差 360 度也算（270 ≡ −90）');
}
// perfectDelay：在那一刻發射，抵達時缺口剛好在正上方；晚一個容許誤差就撞
for (let i = 0; i < 4000; i++) {
  const lv = 1 + Math.floor(rnd() * 100), om = T.omegaDeg(lv), phi = (rnd() - 0.5) * 720;
  const d = T.perfectDelay(phi, om);
  ok(d >= 0 && d < 360 / om + 1e-9, '延遲範圍');
  const arrive = T.gapAt(phi, om, d + T.FLIGHT_S);
  ok(Math.abs(T.norm180(arrive - T.TOP_DEG)) < 1e-6, '抵達時缺口在正上方：lv' + lv);
  ok(T.judgeShot(lv, arrive).pass, 'perfect 一定過');
  const lateMs = T.tolMs(lv) + 12, late = T.gapAt(phi, om, d + T.FLIGHT_S + lateMs / 1000);
  ok(!T.judgeShot(lv, late).pass, '晚超過容許時間一定撞');
  const earlyMs = T.tolMs(lv) - 6, early = T.gapAt(phi, om, d + T.FLIGHT_S - earlyMs / 1000);
  ok(T.judgeShot(lv, early).pass, '在容許時間內提早也過');
  const half = T.gapAt(phi, om, d + T.FLIGHT_S + 180 / om);
  ok(!T.judgeShot(lv, half).pass, '差半圈一定撞');
}
// ───────── V1.34 玩家意見：每一圈的速度不能相同、也不能每一關線性加快（容易被抓到節奏）；每一圈要有 5%～20% 的速度變化 ─────────
ok(near(T.SPEED_STEP[0], 0.05) && near(T.SPEED_STEP[1], 0.20) && T.SPEED_BAND > 0.1, '參數：每圈變化 5%～20%、轉速限制在基準 ±' + T.SPEED_BAND);
{ // 連續 40 萬圈的統計：從第 1 發一路玩到第 100 發，重複很多次
  let prevAll = [], ups = 0, downs = 0, runMax = 0, steps = 0, outBand = 0, minRatio = 9, maxRatio = 0, sameDir = 0, flips = 0, tolWorst = 1e9;
  const byLevelSum = {}, byLevelN = {};
  for (let rep = 0; rep < 4000; rep++) {
    let prev = null, run = 0, lastUp = null;
    for (let lv = 1; lv <= 100; lv++) {
      const om = T.nextOmega(prev, lv, rnd), base = T.omegaDeg(lv);
      ok(om > 0 && isFinite(om), '轉速是正的有限數');
      ok(om >= base * (1 - T.SPEED_BAND) - 1e-9 && om <= base * (1 + T.SPEED_BAND) + 1e-9, '第 ' + lv + ' 發轉速 ' + om.toFixed(2) + ' 在基準 ' + base.toFixed(2) + ' 的 ±' + T.SPEED_BAND * 100 + '% 之內');
      if (prev != null) {
        const ratio = om / prev; steps++;
        const ch = Math.abs(ratio - 1);
        // 每一圈跟上一圈的變化都在 5%～20%（含邊界）
        ok(ch >= T.SPEED_STEP[0] - 1e-9 && ch <= T.SPEED_STEP[1] + 1e-9, '第 ' + lv + ' 發跟上一圈差 ' + (ch * 100).toFixed(2) + '%（要 5%～20%）');
        minRatio = Math.min(minRatio, ratio); maxRatio = Math.max(maxRatio, ratio);
        const up = ratio > 1; if (up) ups++; else downs++;
        if (lastUp === up) run++; else { if (lastUp != null) flips++; run = 1; }
        runMax = Math.max(runMax, run); lastUp = up;
      }
      byLevelSum[lv] = (byLevelSum[lv] || 0) + om; byLevelN[lv] = (byLevelN[lv] || 0) + 1;
      tolWorst = Math.min(tolWorst, T.tolDeg(lv) / om * 1000);
      prev = om;
    }
  }
  console.log('每圈變化：變快 ' + ups + ' 次、變慢 ' + downs + ' 次；連續同方向最長 ' + runMax + ' 圈；轉速比上一圈 ' + minRatio.toFixed(3) + '～' + maxRatio.toFixed(3) + '；最嚴格的時間誤差 ±' + tolWorst.toFixed(1) + ' ms');
  ok(Math.abs(ups / (ups + downs) - 0.5) < 0.06, '變快、變慢各約一半（不是一路加快）：' + (ups / (ups + downs)).toFixed(3));
  ok(runMax <= 14, '不會連續很多圈都同方向（最長 ' + runMax + '）');
  ok(minRatio >= 0.8 - 1e-9 && maxRatio <= 1.2 + 1e-9, '每圈轉速倍率 0.8～1.2：' + minRatio.toFixed(3) + '～' + maxRatio.toFixed(3));
  ok(tolWorst >= 36, '即使轉速剛好在最快的上界，容許的時間誤差仍 ≥ 36 ms（人類做得到）：' + tolWorst.toFixed(1));
  // 整體仍然慢慢加難：平均轉速隨關卡上升（每 10 發的平均比前 10 發高）
  const avg = lv => byLevelSum[lv] / byLevelN[lv];
  let up10 = true; for (let lv = 1; lv + 10 <= 41; lv += 10) if (!(avg(lv + 10) > avg(lv))) up10 = false;
  ok(up10 && avg(40) > avg(1) * 1.5, '平均轉速整體上升：第 1 發 ' + avg(1).toFixed(1) + ' → 第 40 發 ' + avg(40).toFixed(1) + ' 度/秒');
  // 相鄰兩圈轉速絕不相同、也不會三圈排成等差（線性加快）
  let exactSame = 0, linear3 = 0, tot3 = 0;
  for (let rep = 0; rep < 3000; rep++) { let p2 = null, p1 = null; for (let lv = 1; lv <= 60; lv++) { const om = T.nextOmega(p1, lv, rnd); if (p1 != null && Math.abs(om - p1) < 1e-9) exactSame++; if (p2 != null) { tot3++; if (Math.abs((om - p1) - (p1 - p2)) < 1e-9 * p1) linear3++; } p2 = p1; p1 = om; } }
  ok(exactSame === 0 && linear3 / tot3 < 0.001, '相鄰兩圈不一樣、三圈不會剛好等差：相同 ' + exactSame + '、等差比例 ' + (linear3 / tot3).toFixed(5));
}
// 第一圈（prev＝null）在基準 ±SPEED_BAND 之內隨機
{ const xs = []; for (let i = 0; i < 2000; i++) xs.push(T.nextOmega(null, 10, rnd)); const b = T.omegaDeg(10);
  ok(Math.min(...xs) >= b * (1 - T.SPEED_BAND) - 1e-9 && Math.max(...xs) <= b * (1 + T.SPEED_BAND) + 1e-9 && Math.max(...xs) - Math.min(...xs) > b * 0.25, '第一圈在基準附近隨機（範圍 ' + Math.min(...xs).toFixed(1) + '～' + Math.max(...xs).toFixed(1) + '，基準 ' + b.toFixed(1) + '）'); }
// 程式裡的接線：setup 用 nextOmega（接著上一圈 carry.om）、carry 記著上一圈的轉速與關卡
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_spingap.js'), 'utf8');
  ok(/var om = nextOmega\(carry && carry\.level === level - 1 \? carry\.om : null, level, api\.rand\)/.test(src) && /carry = \{ phi: phiNow\(t\), om: om, t: t, level: level \}/.test(src), 'setup：這一圈的轉速由 nextOmega 決定，carry 記著上一圈的轉速與關卡');
  ok(/每一圈的轉速都不一樣/.test(G.rule), '玩法說明有寫每一圈轉速都不一樣'); }
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(12) && T.rating(12) !== T.rating(20) && T.rating(20) !== T.rating(35), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
