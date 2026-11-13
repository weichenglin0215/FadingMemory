// 圈內圈外（inout，企劃 271；V1.57.0 改成「指紋螺旋」）的純函式檢查：
//   指紋帶子的中心線（V1.57.0：貼著前一段繩子往外長，一圈貼著一圈、縫寬固定、沒有大片空白；可以急速迴轉）、加寬成一圈封閉折線（繩圈）不自己交叉也不黏在一起、
//   螞蟻在畫面正中央、而且在「圓心與最外圍的正中間」（從外面數進來、從中央數出去都差不多遠）、射線法／數穿過幾條線都得到同樣的內外、沒有捷徑（從螞蟻往任何方向畫直線，穿過的線都夠多）、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_inout.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261113), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);
const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

// ── 難度（參數跟著檔案最前面走；使用者手調過）──
ok(T.ringsFor(1) === Math.round(T.RINGS[0]) && T.ringsFor(T.RAMP_LEVELS) === Math.round(T.RINGS[1]) && T.ringsFor(99) === Math.round(T.RINGS[1]), '圈數 ' + T.RINGS);
ok(near(T.reverseFor(1), T.REVERSE_P[0], 1e-4) && near(T.reverseFor(T.RAMP_LEVELS), T.REVERSE_P[1], 1e-4) && T.REVERSE_P.every(x => x >= 0 && x <= 1), '迴轉機率 ' + T.REVERSE_P);
ok(T.RAY_MIN.every(x => x >= 1) && T.rayMinFor(1) === Math.round(T.RAY_MIN[0]) && T.rayMinFor(T.RAMP_LEVELS) === Math.round(T.RAY_MIN[1]) && T.rayMinFor(99) === Math.round(T.RAY_MIN[1]), '最少穿過幾條線 ' + T.RAY_MIN);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
ok(T.varianceFor(1) === T.VARIANCE[0] && near(T.varianceFor(T.RAMP_LEVELS), T.VARIANCE[1]) && T.warpAFor(1) === T.WARP_A[0] && near(T.warpAFor(T.RAMP_LEVELS), T.WARP_A[1]), '紋路不均勻程度 ' + T.VARIANCE + '、扭曲幅度 ' + T.WARP_A);
{ const sg = p => Math.sign(p[1] - p[0]);
  for (let l = 2; l <= 60; l++) ok(T.ringsFor(l) * sg(T.RINGS) >= T.ringsFor(l - 1) * sg(T.RINGS) && T.reverseFor(l) * sg(T.REVERSE_P) >= T.reverseFor(l - 1) * sg(T.REVERSE_P) && T.rayMinFor(l) * sg(T.RAY_MIN) >= T.rayMinFor(l - 1) * sg(T.RAY_MIN) && T.timeMs(l) * sg(T.TIME_S) >= T.timeMs(l - 1) * sg(T.TIME_S) && T.warpAFor(l) * sg(T.WARP_A) >= T.warpAFor(l - 1) * sg(T.WARP_A), '難度單調 ' + l); }
ok(T.RINGS[1] > T.RINGS[0] && T.RAY_MIN[1] >= T.RAY_MIN[0], '越後面圈數越多、要數的線越多');

// ── 小工具：線段相交、折線自交、點在多邊形內、點到線段、射線、平滑 ──
ok(T.segCross([0, 0], [2, 2], [0, 2], [2, 0]) && !T.segCross([0, 0], [1, 1], [2, 2], [3, 3]) && !T.segCross([0, 0], [1, 0], [0, 1], [1, 1]) && !T.segCross([0, 0], [2, 0], [2, 0], [2, 2]), 'segCross：交叉、共線、平行、端點相接');
ok(T.selfCrosses([[0, 0], [4, 4], [4, 0], [0, 4]]) && !T.selfCrosses([[0, 0], [4, 0], [4, 4], [0, 4]]), 'selfCrosses：蝴蝶結（自己交叉）與正方形');
{ // 用「格子」加速的版本，結果要跟暴力比對一樣
  const brute = pts => { const n = pts.length; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (T.segCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true; } return false; };
  for (let k = 0; k < 300; k++) { const n = 4 + Math.floor(rnd() * 14), pts = []; for (let i = 0; i < n; i++) pts.push([rnd() * 10, rnd() * 10]); ok(T.selfCrosses(pts) === brute(pts), 'selfCrosses 跟暴力比對一樣（隨機 ' + n + ' 點）'); }
  const ang = []; for (let i = 0; i < 200; i++) ang.push([5 * Math.cos(i / 200 * 2 * Math.PI), 5 * Math.sin(i / 200 * 2 * Math.PI)]); ok(!T.selfCrosses(ang) && brute(ang) === false, '圓形折線不自交'); }
ok(near(T.ptSeg([1, 1], [0, 0], [2, 0]), 1) && near(T.ptSeg([3, 0], [0, 0], [2, 0]), 1) && near(T.ptSeg([-1, 0], [0, 0], [2, 0]), 1) && near(T.ptSeg([1, 0], [1, 0], [1, 0]), 0), 'ptSeg：點到線段的距離（投影在線上、超過兩端）');
{ const sq = [[0, 0], [4, 0], [4, 4], [0, 4]]; ok(T.pointInPoly(2, 2, sq) && !T.pointInPoly(5, 2, sq) && !T.pointInPoly(-1, -1, sq), 'pointInPoly：正方形');
  ok(T.rayCross(sq, 2, 2, 0.3) === 1 && T.rayCross(sq, 2, 2, 2) === 1 && T.rayCross(sq, 6, 2, Math.PI) === 2 && T.rayCross(sq, 6, 2, 0) === 0, 'rayCross：從裡面出去 1 次、從外面穿過去 2 次、背向 0 次');
  const rs = T.rayStats(sq, 2, 2, 60); ok(rs.min === 1 && rs.max === 1 && rs.odd === 60, 'rayStats：正方形裡面往任何方向都是 1 次（奇數）'); }
ok(T.smooth(0) === 0 && T.smooth(1) === 1 && near(T.smooth(0.5), 0.5) && T.smooth(-1) === 0 && T.smooth(2) === 1, 'smooth：0→1、中間 0.5、超出範圍夾住');
{ const u = [[0, 0], [10, 0], [10, 6], [5.4, 6], [5.4, 1], [5, 1], [5, 6], [0, 6]];       // 一個「U」：兩隻腳之間的縫寬 0.4（minGap 只找 0.5 以內的鄰居，縫比這寬就不用管）
  ok(!T.selfCrosses(u) && near(T.minGap(u, 0), 0.4, 0.05) && T.minGap([[0, 0], [10, 0], [10, 6], [0, 6]], 0) === 1e9, 'minGap：U 形兩隻腳之間的縫約 0.4（' + T.minGap(u, 0).toFixed(2) + '）、沒有鄰居＝很大'); }
{ const d = T.polyPath([[0, 0], [1, 0], [1, 1]], 10, 5, 7); ok(d === 'M5.00,7.00 L15.00,7.00 L15.00,17.00 Z', 'polyPath：縮放並平移：' + d); }

// ── 中心線（V1.57.0：從一小段直線開始，每一步貼著前面的繩子往外長）──
{ let nul = 0, total = 0, okSp = 0;
  for (let i = 0; i < 120; i++) {
    const K = 3 + Math.floor(rnd() * 14), revP = [0, 0.3, 0.5, 1][i % 4], jit = rnd() * 0.45, sp = T.makeSpine(K, revP, jit, rnd); total++;
    if (!sp) { nul++; continue; }
    okSp++;
    ok(sp.pts.length === sp.hw.length && sp.pts.length === sp.S.length && sp.pts.length > 10, '中心線 ' + K + ' 圈：' + sp.pts.length + ' 個點');
    ok(sp.pts.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])) && sp.hw.every(x => x > 0.1 && x < 0.5), '點都是有限的數、半寬 ' + Math.min(...sp.hw).toFixed(2) + '～' + Math.max(...sp.hw).toFixed(2));
    ok(sp.S[0] === 0 && sp.S.every((s, k) => k === 0 || s > sp.S[k - 1]) && near(sp.len, sp.S[sp.S.length - 1]), '累計弧長由 0 開始、一路增加、len ＝ 總長（' + sp.len.toFixed(1) + '）');
    ok(sp.seed.length >= 2 && sp.seed[0][0] === 0 && sp.seed[0][1] === 0 && Math.abs(sp.seed[sp.seed.length - 1][0] - sp.seedLen) < 0.5 && sp.seed.every(p => Math.abs(p[1]) < 0.2), '圓心 seed ＝ 起點那一小段直線（' + sp.seed.length + ' 個點，長 ' + sp.seedLen.toFixed(2) + '）');
    ok(sp.seedLen >= T.SEED_LEN[0] - 1e-9 && sp.seedLen <= T.SEED_LEN[1] + 1e-9 && near(sp.pts[0][0], 0) && near(sp.pts[0][1], 0), '起點在原點、起點直線長 ' + sp.seedLen.toFixed(2) + '（範圍 ' + T.SEED_LEN + '）');
    // 起點是一小段直線（往東）
    let straight = true; for (let k = 0; k < sp.pts.length && sp.pts[k][0] <= sp.seedLen - 1.2; k++) if (Math.abs(sp.pts[k][1]) > 1e-9) straight = false;
    ok(straight, '起點那一小段是直線（接近掉頭的最後幾個點被磨平，不算）');
    // 離起點直線夠遠（繞了 K 圈）；最後一個點離起點直線大約 K 個圈距
    const seedPts = sp.pts.filter(p => p[1] === 0 && p[0] <= sp.seedLen + 1e-9), last = sp.pts[sp.pts.length - 1];
    let dEnd = 1e9; seedPts.forEach(p => { dEnd = Math.min(dEnd, Math.hypot(p[0] - last[0], p[1] - last[1])); });
    ok(dEnd >= K - 0.9 && dEnd <= K + 1.2, '最後一個點離起點直線 ' + dEnd.toFixed(2) + ' 圈距（K ＝ ' + K + '）');
    if (revP === 0) ok(sp.revs === 0, '迴轉機率 0：沒有迴轉');
    ok(sp.revs >= 0 && sp.revs <= K, '迴轉次數 ' + sp.revs);
  }
  ok(nul / total < 0.08, '造不出來（null）的比例很低：' + nul + '／' + total); }
// 迴轉機率：統計（每繞完一圈有 revP 的機會迴轉）
for (const revP of [0.3, 0.7]) { let revs = 0, laps = 0; for (let i = 0; i < 80; i++) { const sp = T.makeSpine(8, revP, 0.2, rnd); if (!sp) continue; revs += sp.revs; laps += 7; } ok(revs / laps > revP * 0.5 && revs / laps < revP * 1.4 + 0.1, '迴轉機率 ' + revP + '：每圈實際約 ' + (revs / laps).toFixed(2) + ' 次迴轉'); }
// ── 貼著前一段繩子長（玩家意見：不要有大片空白）──
{ const pct = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(p * (a.length - 1))]; };
  for (const [K, revP] of [[6, 0.3], [9, 0.5], [14, 0.66]]) {
    const dn = [], worstHole = []; let cnt = 0;
    for (let t = 0; t < 40 && cnt < 8; t++) {
      const sp = T.makeSpine(K, revP, 0.3, rnd); if (!sp) continue;
      const poly = T.ropePolygon(sp.pts, sp.hw); if (T.selfCrosses(poly) || T.minGap(poly) < T.MIN_GAP) continue; cnt++;
      const n = sp.pts.length;
      // ① 每一點離「別的一圈」（沿著繩子至少隔 3 圈距）最近的繩子多遠：應該都接近一個圈距（STRIP_W + 縫寬 = 1）
      for (let i = 0; i < n; i += 3) { let d = 1e9; for (let j = 0; j < n; j++) if (Math.abs(sp.S[j] - sp.S[i]) > 3) d = Math.min(d, Math.hypot(sp.pts[j][0] - sp.pts[i][0], sp.pts[j][1] - sp.pts[i][1])); if (d < 1e8) dn.push(d); }
      // ② 被繩子圍起來的地方（八個方向的射線都碰得到繩子），離最近的繩子中心線不會太遠＝沒有大片空白
      let mx = 0; sp.pts.forEach(p => { mx = Math.max(mx, Math.abs(p[0]), Math.abs(p[1])); });
      let w = 0; for (let x = -mx; x <= mx; x += 0.4) for (let y = -mx; y <= mx; y += 0.4) {
        let all = true; for (let a = 0; a < 8 && all; a++) if (T.rayCross(poly, x, y, 0.2 + a * Math.PI / 4) === 0) all = false;
        if (!all) continue;
        let d = 1e9; for (let j = 0; j < n; j += 2) d = Math.min(d, Math.hypot(sp.pts[j][0] - x, sp.pts[j][1] - y)); w = Math.max(w, d);
      }
      worstHole.push(w);
    }
    ok(cnt >= 5, K + ' 圈：造得出來（' + cnt + '）');
    ok(pct(dn, 0.5) > 0.9 && pct(dn, 0.5) < 1.12, K + ' 圈、迴轉 ' + revP + '：相鄰兩圈的中心線距離中位數 ' + pct(dn, 0.5).toFixed(2) + '（理想 1）');
    ok(pct(dn, 0.05) > 0.75 && pct(dn, 0.95) < 1.35, K + ' 圈：距離幾乎都在 0.75～1.35 之間（5%＝' + pct(dn, 0.05).toFixed(2) + '、95%＝' + pct(dn, 0.95).toFixed(2) + '）——一圈緊貼著一圈，縫寬不會忽寬忽窄');
    ok(Math.max(...worstHole) < 1.6, K + ' 圈：被繩子圍起來的地方，離最近的繩子最遠 ' + Math.max(...worstHole).toFixed(2) + ' 圈距（＜ 1.6，沒有大片空白；圈距 1 的話最寬的縫中心離兩邊各約 0.75）');
  } }

// ── 加寬成繩圈：一條封閉折線，不自己交叉，兩條不相鄰的線不會黏在一起 ──
{ let n = 0, built = 0;
  for (let i = 0; i < 80; i++) {
    const K = 3 + Math.floor(rnd() * 12), sp = T.makeSpine(K, [0, 0.3, 0.5, 1][i % 4] * 0.7, Math.min(0.45, rnd() * 0.5), rnd); if (!sp) continue;
    const poly = T.ropePolygon(sp.pts, sp.hw);
    if (T.selfCrosses(poly) || T.minGap(poly) < T.MIN_GAP) continue;      // 這一條沒通過驗證，出題時會被丟掉重造（見下面「整關」）
    built++;
    ok(poly.length >= 2 * sp.pts.length && poly.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])), '繩圈的點 ' + poly.length);
    // 面積 ＝ 帶子的面積（中心線長 × 寬度）
    let area = 0; for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; } area = Math.abs(area) / 2;
    let len = 0, est = 0; for (let k = 0; k + 1 < sp.pts.length; k++) { const l = Math.hypot(sp.pts[k + 1][0] - sp.pts[k][0], sp.pts[k + 1][1] - sp.pts[k][1]); len += l; est += l * (sp.hw[k] + sp.hw[k + 1]); }
    ok(Math.abs(area - est) / est < 0.08, '繩圈圍起來的面積（' + area.toFixed(1) + '）≈ 中心線長 ' + len.toFixed(0) + ' × 寬度（' + est.toFixed(1) + '）');
    // 每個頂點離中心線的距離 ≈ 半寬（兩邊對稱加寬）
    if (i % 8 === 0) { let worst = 0; poly.forEach(p => { let d = 1e9; for (let k = 0; k + 1 < sp.pts.length; k++) d = Math.min(d, T.ptSeg(p, sp.pts[k], sp.pts[k + 1])); worst = Math.max(worst, d); }); ok(worst <= Math.max(...sp.hw) + 0.05, '繩圈上的每一點離中心線不超過半寬（最遠 ' + worst.toFixed(2) + '）'); }
    // 中心線上的點在帶子裡面：用射線法
    const mid = sp.pts[Math.floor(sp.pts.length / 2)]; ok(T.pointInPoly(mid[0], mid[1], poly), '中心線上的點在繩圈裡面'); n++;
  }
  ok(built >= 40, '造得出通過驗證（不自交、不黏在一起）的繩圈：' + built + '／80'); }
// 帶子的中心線在繩圈裡面、帶子之間的縫在外面：兩條相鄰的帶子中間，離兩邊中心線都 ≥ 0.4 的點全部在繩圈外面
{ let sp = null, poly = null; for (let t = 0; t < 30 && !sp; t++) { const s = T.makeSpine(10, 0.3, 0.2, rnd); if (!s) continue; const pl = T.ropePolygon(s.pts, s.hw); if (!T.selfCrosses(pl) && T.minGap(pl) >= T.MIN_GAP) { sp = s; poly = pl; } }
  let mx = 0; sp.pts.forEach(p => { mx = Math.max(mx, Math.abs(p[0]), Math.abs(p[1])); });
  let gapPts = 0, outOk = 0, onStrip = 0, inOk = 0;
  for (let x = -mx; x <= mx; x += 0.3) for (let y = -mx; y <= mx; y += 0.3) { let d = 1e9, hwNear = 0; for (let j = 0; j < sp.pts.length; j++) { const dd = Math.hypot(sp.pts[j][0] - x, sp.pts[j][1] - y); if (dd < d) { d = dd; hwNear = sp.hw[j]; } } if (d > hwNear + 0.1 && d < 0.75) { gapPts++; if (!T.pointInPoly(x, y, poly)) outOk++; } if (d < hwNear * 0.6) { onStrip++; if (T.pointInPoly(x, y, poly)) inOk++; } }
  ok(gapPts > 100 && outOk === gapPts, '帶子旁邊的縫（' + gapPts + ' 個點）全部在繩圈外面');
  ok(onStrip > 100 && inOk === onStrip, '帶子上面（' + onStrip + ' 個點）全部在繩圈裡面'); }


// ── 扭曲：一對一的連續變形，幅度 0 ＝ 不扭曲 ──
{ let minDet = 9; const maxA = T.WARP_A[1];
  for (let k = 0; k < 400; k++) { const w = T.warpParams(maxA, rnd), x = rnd() * 24, y = rnd() * 24, e = 1e-5, p = T.warpPoint(x, y, w), px = T.warpPoint(x + e, y, w), py = T.warpPoint(x, y + e, w);
    const det = ((px[0] - p[0]) / e) * ((py[1] - p[1]) / e) - ((py[0] - p[0]) / e) * ((px[1] - p[1]) / e); minDet = Math.min(minDet, det); }
  ok(minDet > 0, '最大扭曲幅度 ' + maxA + ' 時，雅可比行列式最小 ' + minDet.toFixed(3) + ' > 0（一對一、不會翻過來）；若不成立，出題時的「不自交」驗證會把它擋掉');
  const w0 = T.warpParams(0, rnd), p0 = T.warpPoint(3.3, 4.4, w0); ok(near(p0[0], 3.3) && near(p0[1], 4.4), '幅度 0 ＝ 不扭曲'); }

// ── 整關 ──
let inside = 0, tot = 0, tries = 0, short = 0, fb = 0;
const AR = [];       // 每一題螞蟻離圓心的比例
const perLevel = {};
for (let i = 0; i < 400; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); tot++; tries += q.tries;
  ok(q.K === T.ringsFor(lv) && q.level === lv && Array.isArray(q.rope) && q.rope.length > 100 && q.rope.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])), '第 ' + lv + ' 關：' + q.K + ' 圈、繩圈 ' + q.rope.length + ' 個點');
  ok(q.antXY[0] === 0 && q.antXY[1] === 0, '螞蟻在原點（＝畫面正中央）');
  ok(!T.selfCrosses(q.rope), '第 ' + lv + ' 關：繩圈沒有自己穿過自己');
  ok(T.minGap(q.rope) >= T.MIN_GAP * 0.6 - 1e-9, '第 ' + lv + ' 關：兩條不相鄰的線沒有黏在一起（最近 ' + T.minGap(q.rope).toFixed(3) + '）');
  ok(T.pointInPoly(0, 0, q.rope) === q.ant.inside, '第 ' + lv + ' 關：射線法驗證，螞蟻在繩圈' + (q.ant.inside ? '裡面' : '外面'));
  // 往各個方向數穿過幾條線：裡面都是奇數、外面都是偶數
  const rs = T.rayStats(q.rope, 0, 0, 120); ok(rs.odd === (q.ant.inside ? 120 : 0), '第 ' + lv + ' 關：往 120 個方向數穿過幾條線，' + (q.ant.inside ? '全部是奇數（裡面）' : '全部是偶數（外面）'));
  ok(rs.min === q.minRay && rs.max === q.maxRay && near(rs.mean, q.meanRay, 1e-9), '題目記的射線資料跟重算的一樣');
  // 沒有捷徑
  if (rs.min >= q.needRay) short++;
  ok(rs.min >= Math.min(q.needRay, 2), '第 ' + lv + ' 關：沒有直線捷徑——最少的一個方向也穿過 ' + rs.min + ' 條線（要求 ' + q.needRay + '、平均 ' + rs.mean.toFixed(1) + '）');
  ok(q.needRay === T.rayMinFor(lv) && q.minRay >= 1, '第 ' + lv + ' 關：這一關要求任何方向至少穿過 ' + q.needRay + ' 條線');
  // 螞蟻離繩子有空隙、朝向順著紋路
  let d = 1e9, bi = 0; for (let k = 0; k < q.rope.length; k++) { const dd = T.ptSeg([0, 0], q.rope[k], q.rope[(k + 1) % q.rope.length]); if (dd < d) { d = dd; bi = k; } }
  ok(d >= 0.25 * T.ANT_SIZE - 1e-9, '第 ' + lv + ' 關：螞蟻離繩子至少 ' + d.toFixed(3) + ' 圈距（螞蟻身長 ' + T.ANT_SIZE + '）');
  const nb = q.rope[(bi + 1) % q.rope.length], tang = Math.atan2(nb[1] - q.rope[bi][1], nb[0] - q.rope[bi][0]) * 180 / Math.PI; let df = Math.abs(((q.ant.deg - tang) % 180 + 180) % 180); df = Math.min(df, 180 - df); ok(df < 1e-6, '螞蟻朝向順著附近的紋路（差 ' + df.toFixed(3) + '°）');
  // 螞蟻在「圓心與最外圍的正中間」（玩家意見：從最外面數、從最中央數，都要數差不多多的圈）
  const tc = T.segCount(q.rope, 0, 0, q.center[0], q.center[1]);
  ok(tc === q.toCenter && near(q.depth, q.toCenter / Math.max(1, q.minRay + q.toCenter), 1e-9), '第 ' + lv + ' 關：從螞蟻走直線到圓心要穿過 ' + tc + ' 條線，記在題目裡的一樣；位置深度 ' + q.depth.toFixed(2) + ' ＝ 往圓心的線數 ÷（往圓心 ＋ 往外最少 ' + q.minRay + '）');
  ok(q.depth >= T.ANT_DEPTH[0] - 0.1 - 1e-9 && q.depth <= T.ANT_DEPTH[1] + 0.1 + 1e-9, '第 ' + lv + ' 關：螞蟻在「圓心 → 最外面」的 ' + (100 * q.depth).toFixed(0) + '% 處（範圍 ' + T.ANT_DEPTH + '，扭曲之後容許誤差 0.1）');
  ok(q.toCenter >= 2, '第 ' + lv + ' 關：往圓心至少要穿過 2 條線（螞蟻不貼著圓心）：' + q.toCenter);
  AR.push(q.depth);
  // 範圍：extent ＝ 整個圖形離螞蟻最遠；viewR ＝ 畫面的半邊長（遠的一邊可以裁掉一點）
  let ext = 0, bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9; q.rope.forEach(p => { ext = Math.max(ext, Math.abs(p[0]), Math.abs(p[1])); bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]); }); ok(near(ext + 0.3, q.extent, 1e-9), '範圍 extent 就是最遠的點 ＋ 0.3');
  const dnear = Math.min(-bx0, bx1, -by0, by1); ok(near(q.dnear, dnear, 1e-9) && q.viewR <= q.extent + 1e-9 && q.viewR >= Math.min(q.extent, dnear + T.VIEW_MARGIN) - 1e-9 && q.viewR >= Math.min(q.extent, T.VIEW_FRAC * q.extent) - 1e-9, '第 ' + lv + ' 關：畫面半邊長 ' + q.viewR.toFixed(1) + ' 圈距（整個圖形 ' + q.extent.toFixed(1) + '）：不比整個圖形大、最近的外面（' + dnear.toFixed(1) + ' ＋ ' + T.VIEW_MARGIN + '）一定看得到');
  if (q.ant.inside) inside++; if (q.tries > 30) fb++;
  ok(q.revs >= 0 && q.revs <= q.K && q.minRay >= 1, '迴轉 ' + q.revs + ' 次');
}
console.log('在裡面 ' + inside + '／' + tot + '；平均嘗試 ' + (tries / tot).toFixed(2) + ' 次；沒有捷徑（≥ 該關要求）的 ' + short + '／' + tot + '；退回最簡單版本 ' + fb + ' 次');
ok(inside / tot > 0.4 && inside / tot < 0.6, '裡面／外面各約一半：' + (100 * inside / tot).toFixed(0) + '% 在裡面');
ok(short / tot > 0.9, '絕大多數題目都沒有捷徑（任何方向至少穿過該關要求的線數）：' + (100 * short / tot).toFixed(0) + '%');
ok(fb === 0, '沒有退回最簡單版本');
// 螞蟻在正中間：位置深度平均約 0.5、而且每題不一樣（不是永遠同一圈）；往圓心數的線跟往外數的線差不多多
{ const m = avg(AR), sd = Math.sqrt(avg(AR.map(x => (x - m) * (x - m)))); console.log('螞蟻在圓心 → 最外面的位置：平均 ' + m.toFixed(3) + '、標準差 ' + sd.toFixed(3) + '（範圍 ' + T.ANT_DEPTH + '）');
  const mid = (T.ANT_DEPTH[0] + T.ANT_DEPTH[1]) / 2; ok(Math.abs(m - mid) < 0.04 && sd > (T.ANT_DEPTH[1] - T.ANT_DEPTH[0]) * 0.15, '位置深度平均 ' + m.toFixed(2) + '（目標中間 ' + mid.toFixed(2) + '），每題會變（標準差 ' + sd.toFixed(3) + '）');
  for (const lv of [10, 25]) {
    const A = [], B = []; for (let i = 0; i < 40; i++) { const q = T.makeLevel(lv, rnd); A.push(q.minRay); B.push(q.toCenter); }
    const ra = avg(A), rb = avg(B), inCnt = new Set(B).size; console.log('第 ' + lv + ' 關：往外最少要穿過 ' + ra.toFixed(1) + ' 條線、往圓心要穿過 ' + rb.toFixed(1) + ' 條（比 ' + (rb / ra).toFixed(2) + '）；往圓心的線數有 ' + inCnt + ' 種');
    ok(rb / ra > 0.8 && rb / ra < 1.25 && inCnt >= 3, '第 ' + lv + ' 關：從外面數、從中央數要數的線差不多多（' + ra.toFixed(1) + ' 對 ' + rb.toFixed(1) + '），而且不是永遠固定幾條（' + inCnt + ' 種）');
  } }
// 越後面越難：要數的線越多、迴轉越多
{ const cnt = lv => { let s = 0, r = 0, n = 100; for (let i = 0; i < n; i++) { const q = T.makeLevel(lv, rnd); s += q.meanRay; r += q.revs; } return { ray: s / n, revs: r / n }; };
  const a1 = cnt(1), a15 = cnt(15), a30 = cnt(T.RAMP_LEVELS); console.log('平均要穿過的線：第 1 關 ' + a1.ray.toFixed(1) + '、第 15 關 ' + a15.ray.toFixed(1) + '、第 30 關 ' + a30.ray.toFixed(1) + '；迴轉次數 ' + a1.revs.toFixed(1) + ' → ' + a15.revs.toFixed(1) + ' → ' + a30.revs.toFixed(1));
  ok(a30.ray > a1.ray * 2 && a15.ray > a1.ray * 1.3 && a30.ray > a15.ray, '越後面，螞蟻要穿過的線越多（' + a1.ray.toFixed(1) + ' → ' + a30.ray.toFixed(1) + '）');
  ok(a30.revs > a1.revs + 2, '越後面，迴轉越多（' + a1.revs.toFixed(1) + ' → ' + a30.revs.toFixed(1) + '）'); }
// 有迴轉的題目確實有「掉頭」：髮夾彎處中心線掉頭（行進方向轉了約 180 度）
{ let turns = 0, sps = 0; for (let i = 0; i < 40; i++) { const sp = T.makeSpine(12, 0.6, 0.2, rnd); if (!sp || !sp.revs) continue; sps++; /* 每次迴轉都有一段「半圓形髮夾彎」：連續 6 點以上、行進方向累計轉了 180 度左右 */ let acc = 0, run = 0, hp = 0; for (let k = 2; k < sp.pts.length; k++) { const a1 = Math.atan2(sp.pts[k - 1][1] - sp.pts[k - 2][1], sp.pts[k - 1][0] - sp.pts[k - 2][0]), a2 = Math.atan2(sp.pts[k][1] - sp.pts[k - 1][1], sp.pts[k][0] - sp.pts[k - 1][0]); let d = a2 - a1; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > 0.1) { acc += d; run++; } else { if (run >= 6 && Math.abs(Math.abs(acc) - Math.PI) < 0.6) hp++; acc = 0; run = 0; } } turns += hp >= 1 ? 1 : 0; } ok(sps > 10 && turns / sps > 0.8, '迴轉機率 0.6：' + sps + ' 條中 ' + turns + ' 條找得到半圓形的髮夾彎掉頭'); }
// 效能
for (const lv of [1, 12, 24, 40]) { const t0 = Date.now(); let worst = 0; for (let i = 0; i < 60; i++) { const t1 = Date.now(); T.makeLevel(lv, rnd); worst = Math.max(worst, Date.now() - t1); } const per = (Date.now() - t0) / 60; console.log('第' + lv + '關 出題平均 ' + per.toFixed(1) + ' 毫秒、最慢 ' + worst); ok(per < 150 && worst < 700, '第 ' + lv + ' 關出題夠快：' + per.toFixed(1) + '／' + worst); }

// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_inout.js'), cssNc = rd('../../css/games/reaction_inout.css').replace(/\/\*[\s\S]*?\*\//g, '').split(/\s+/).join(' '), boot = rd('../../js/boot.js'), code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/api\.fail\(\{ delay: 3000/.test(src) && /inout-fill--show/.test(src), '失敗停格 3 秒、裡面塗上淡綠色');
  ok(/\.inout-fill \{[^}]*var\(--c-ok/.test(cssNc) && /\.inout-rope \{[^}]*var\(--iof-rope\)/.test(cssNc) && /\.inout-btn--ok \{[^}]*var\(--c-ok/.test(cssNc), '綠色、紅色繩子用 CSS 變數');
  ok(boot.indexOf("'js/reaction_inout.js'") > 0 && /螞蟻/.test(G.rule) && /指紋/.test(G.rule) && /掉頭/.test(G.rule) && /螺旋/.test(G.rule) && /數穿過/.test(G.rule) && /正中央/.test(G.rule), 'boot.js 有載入、玩法說明提到指紋、螺旋、掉頭、正中央、數穿過幾條線');
  ok(/polyPath\(q\.rope, u, BS \/ 2, BS \/ 2\)/.test(src) && /drawAnt\(svg, BS \/ 2, BS \/ 2, u \* ANT_SIZE, q\.ant\.deg\)/.test(src), '畫面用繩圈折線；螞蟻畫在畫面正中央、大小是 ANT_SIZE 圈距、朝向順著紋路');
  ok(!/makeMaze|boundaryLoop|ROOMS|DEPTH_MIN|gridLines/.test(code), '迷宮的程式（makeMaze／boundaryLoop／ROOMS／DEPTH_MIN）都拿掉了');
  ok(/rayStats\(tp, 0, 0, 120\)/.test(src) && /strict && cand\.minRay >= needRay/.test(src), '出題時驗證沒有捷徑（至少穿過 RAY_MIN 條線）、不夠好就重造');
  ok(/var seed = sp\.seed/.test(src) && /ANT_DEPTH\[0\]/.test(src) && /ANT_DEPTH\[1\]/.test(src) && /segCount\(poly, pc\.p\[0\], pc\.p\[1\], cen\[0\], cen\[1\]\)/.test(src) && !/ANT_NEAR|ANT_RADIUS|sp\.mid|ANT_ZONE|CENTER_R|RAMP_LEN|OPEN_FRAC/.test(code), '螞蟻放在圓心與最外圍的正中間（往圓心的線數 ÷ 總線數落在 ANT_DEPTH）；「繩子長度一半」與舊的缺口／中央圓圈參數都拿掉了');
  ok(/var u = \(BS \/ 2 - 3\) \/ q\.viewR/.test(src) && /VIEW_FRAC/.test(src), '畫面的比例用 viewR（遠的一邊可以裁掉一點）'); }
ok(T.ANT_SIZE > 0.2 && T.ANT_SIZE <= 0.6, '螞蟻大小是圈距的 ' + T.ANT_SIZE + ' 倍');
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
