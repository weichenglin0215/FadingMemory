// 畫眉毛（eyebrow，企劃 408）的純函式檢查：曲線重取樣、chamfer／相似度（獨立算法）、鏡射與臉座標、眉毛形狀、難度線性（及格線 70% → 93%）、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_eyebrow.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261220), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度 ──
ok(near(T.threshFor(1), T.THRESH[0]) && near(T.threshFor(T.RAMP_LEVELS), T.THRESH[1]) && near(T.threshFor(99), T.THRESH[1]), '及格線 ' + T.THRESH[0] + '% → ' + T.THRESH[1] + '%（參數 THRESH，使用者可調，測試跟著走）');
// 到頂關卡「標準答案整條往下偏幾 px」就會不及格：及格線越低、要偏越多（每偏 1px 約少 0.8%，再留一倍餘裕）
const PX_TOP = Math.max(7, Math.round((100 - T.THRESH[1]) * 1.6 + 4));
for (let n = 2; n <= T.RAMP_LEVELS + 2; n++) ok(T.threshFor(n) >= T.threshFor(n - 1) && T.tiltFor(n) >= T.tiltFor(n - 1) && T.shiftFor(n) >= T.shiftFor(n - 1) && T.typesFor(n).length >= T.typesFor(n - 1).length, '單調 ' + n);
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) d.push(T.threshFor(n) - T.threshFor(n - 1)); ok(Math.max(...d) - Math.min(...d) <= 0.0002, '及格線線性增加：每關 +' + Math.min(...d).toFixed(4) + '～+' + Math.max(...d).toFixed(4)); }
ok(T.tiltFor(1) === 0 && T.tiltFor(T.TILT_FROM - 1) === 0 && T.tiltFor(T.TILT_FROM) > 0 && near(T.tiltFor(T.RAMP_LEVELS), T.TILT_DEG[1]) && T.shiftFor(T.TILT_FROM - 1) === 0 && T.shiftFor(T.TILT_FROM) > 0 && near(T.shiftFor(T.RAMP_LEVELS), T.SHIFT_PX[1]), '第 ' + T.TILT_FROM + ' 關起臉會歪、會偏離正中間，到頂 ±' + T.TILT_DEG[1] + '°／±' + T.SHIFT_PX[1] + 'px（跟著參數）');
ok(T.typesFor(1).join() === 'moon,flat' && T.typesFor(8).length === 4 && T.typesFor(99).length === 5, '眉毛形狀種類越來越多');

// ── 曲線工具 ──
const P = (...a) => a.map(([x, y]) => ({ x, y }));
ok(near(T.pathLength(P([0, 0], [3, 4], [3, 10])), 11) && T.pathLength(P([1, 1])) === 0 && T.pathLength([]) === 0, 'pathLength');
{ const r = T.resample(P([0, 0], [10, 0]), 11); ok(r.length === 11 && r.every((p, i) => near(p.x, i, 1e-9) && near(p.y, 0)), '直線等距取 11 點'); const r2 = T.resample(P([0, 0], [10, 0], [10, 10]), 5); ok(r2.length === 5 && near(r2[0].x, 0) && near(r2[2].x, 10) && near(r2[2].y, 0) && near(r2[4].y, 10), '折線等弧長取點（轉角剛好在中間）'); const r3 = T.resample(P([2, 3]), 4); ok(r3.length === 4 && r3.every(p => p.x === 2 && p.y === 3), '單點'); }
for (let i = 0; i < 300; i++) { const n = 3 + Math.floor(rnd() * 20), pts = []; for (let k = 0; k < n; k++) pts.push({ x: rnd() * 300, y: rnd() * 300 }); const r = T.resample(pts, 40), L = T.pathLength(pts), L2 = T.pathLength(r); ok(r.length === 40 && near(r[0].x, pts[0].x) && near(r[39].x, pts[n - 1].x), '頭尾保留'); ok(L2 <= L + 1e-6 && L2 >= L * 0.5, '取樣後長度不會變長、也不會太短'); }
ok(near(T.distToPath({ x: 5, y: 5 }, P([0, 0], [10, 0])), 5) && near(T.distToPath({ x: -3, y: 4 }, P([0, 0], [10, 0])), 5) && near(T.distToPath({ x: 4, y: 3 }, P([0, 0], [10, 0], [10, 10])), 3) && near(T.distToPath({ x: 4, y: 3 }, P([1, 1])), Math.hypot(3, 2)), 'distToPath');

// ── 相似度（獨立算法：用暴力求每個點到每條線段的最近距離）──
function brute(A, B, n) { const ra = T.resample(A, n), rb = T.resample(B, n); const dist = (q, path) => { let best = 1e18; for (let i = 1; i < path.length; i++) { for (let t = 0; t <= 200; t++) { const s = t / 200, x = path[i - 1].x + (path[i].x - path[i - 1].x) * s, y = path[i - 1].y + (path[i].y - path[i - 1].y) * s; best = Math.min(best, Math.hypot(q.x - x, q.y - y)); } } return best; }; let s1 = 0, s2 = 0; ra.forEach(p => { s1 += dist(p, B); }); rb.forEach(p => { s2 += dist(p, A); }); return (s1 / n + s2 / n) / 2; }
for (let i = 0; i < 25; i++) { const mk = () => { const pts = []; for (let k = 0; k < 6; k++) pts.push({ x: k * 20 + rnd() * 8, y: 100 + rnd() * 40 }); return pts; }, A = mk(), B = mk(); const c = T.chamfer(A, B), b = brute(A, B, T.N_RES); ok(Math.abs(c - b) < 0.2, 'chamfer ' + c.toFixed(3) + ' ≈ 暴力 ' + b.toFixed(3)); }
{ const A = T.browShape('arch', { h: 0.15, slope: 0, peak: 0.6, drop: 0.3, waves: 1 }, 24).map(p => ({ x: p.u + 236, y: p.v + 300 })), L = T.pathLength(A);
  ok(T.similarity(A, A, L) === 100, '自己和自己：100%');
  ok(T.similarity(A, A.slice().reverse(), L) === 100, '畫的方向相反（從眉尾畫起）也是 100%');
  ok(T.similarity(A, T.resample(A, 17), L) > 99.5, '點取得稀疏一點也幾乎一樣');
  // 公式驗證：一條橫的直線，整條往下平移 s px，每個點的最近距離剛好是 s → 相似度 ＝ 100 × (1 − s ÷ (SIM_K × L))（兩端有一小段多出來，所以容許一點誤差）
  { const line = []; for (let k = 0; k <= 20; k++) line.push({ x: 100 + k * 5, y: 300 }); const LL = T.pathLength(line); for (const sft of [1, 3, 6, 10, 20]) { const B = line.map(p => ({ x: p.x, y: p.y + sft })), sim = T.similarity(line, B, LL), exp = 100 * (1 - sft / (T.SIM_K * LL)); ok(Math.abs(sim - exp) < 0.05, '直線往下平移 ' + sft + 'px：相似度 ' + sim.toFixed(3) + '% = 理論 ' + exp.toFixed(3) + '%'); } }
  // 沿著曲線的方向平移不會被扣很多分（眉毛大多是橫的，橫著平移 6px 還有 95% 以上）
  { const B = A.map(p => ({ x: p.x + 6, y: p.y })); ok(T.similarity(A, B, L) > 94, '橫著平移 6px：' + T.similarity(A, B, L).toFixed(2) + '%'); }
  ok(T.similarity(A, A.map(p => ({ x: p.x, y: p.y + T.SIM_K * L })), L) < 8 && T.similarity(A, A.map(p => ({ x: p.x, y: p.y + 2 * T.SIM_K * L })), L) === 0 && T.similarity(A, A.map(p => ({ x: p.x + 500, y: p.y })), L) === 0, '偏太遠（超過眉毛長度的一半）＝接近 0%');
  // 只畫了一半：另一半沒有對應的線 → 相似度明顯下降
  const half = A.slice(0, 13); ok(T.similarity(A, half, L) < 90, '只畫一半：' + T.similarity(A, half, L).toFixed(2) + '%');
  // 畫成直線（眉毛是拱形）：不及格
  const straight = [A[0], A[A.length - 1]]; ok(T.similarity(A, straight, L) < 93, '拱形眉畫成直線：' + T.similarity(A, straight, L).toFixed(2) + '%');
  // 同方向照抄（沒有鏡射）：因為眉毛不是對稱形狀，比鏡射答案差很多
  const lv = T.makeLevel(10, rnd), copy = lv.ref.map(p => ({ x: p.x + (lv.target[0].x - lv.ref[0].x), y: p.y + (lv.target[0].y - lv.ref[0].y) })); ok(T.similarity(copy, lv.target, lv.L) < 95, '同方向照抄的相似度 ' + T.similarity(copy, lv.target, lv.L).toFixed(2) + '%（< 95%，不是鏡射）'); }

// ── 鏡射與臉座標 ──
{ const F = { x: 236, y: 300 }; ok(near(T.toScreen({ u: 0, v: 0 }, F, 0).x, 236) && near(T.toScreen({ u: 10, v: 0 }, F, 0).x, 246) && near(T.toScreen({ u: 0, v: 10 }, F, 0).y, 310), '不歪的臉：u 往右、v 往下');
  const r = T.toScreen({ u: 10, v: 0 }, F, Math.PI / 2); ok(near(r.x, 236, 1e-9) && near(r.y, 310, 1e-9), '歪 90°：u 方向變成往下');
  const m = T.mirrorLocal([{ u: -30, v: -66 }, { u: -80, v: -80 }]); ok(m[0].u === 30 && m[0].v === -66 && m[1].u === 80 && m[1].v === -80, '鏡射：u 變號、v 不變');
  // 鏡射兩次回到原來；鏡射的兩點對「臉的中軸」對稱（用畫面座標驗證：兩點的中點在中軸上、連線垂直於中軸）
  for (let i = 0; i < 300; i++) { const th = (rnd() - 0.5) * 0.4, F2 = { x: 200 + rnd() * 80, y: 280 + rnd() * 40 }, p = { u: -(20 + rnd() * 120), v: -100 + rnd() * 100 }, a = T.toScreen(p, F2, th), b = T.toScreen(T.mirrorLocal([p])[0], F2, th);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, axis = { x: -Math.sin(th), y: Math.cos(th) }, d = { x: mid.x - F2.x, y: mid.y - F2.y }, cross = d.x * axis.y - d.y * axis.x, dot = (b.x - a.x) * axis.x + (b.y - a.y) * axis.y; ok(Math.abs(cross) < 1e-9 && Math.abs(dot) < 1e-9, '鏡射的兩點：中點在臉的中軸上、連線垂直於中軸'); }
}

// ── 眉毛形狀 ──
// 規律的形狀與 V1.36.0 的四種奇怪形狀：u 一路往外（不會折回來）；V1.38.0 的三種會打圈的（LOOPY）會折回來，另外檢查
for (const type of T.TYPES) for (let i = 0; i < 200; i++) {
  const par = { h: 0.1 + rnd() * 0.2, slope: -0.1 + rnd() * 0.22, peak: 0.4 + rnd() * 0.32, drop: rnd() * 0.6, waves: rnd() < 0.5 ? 1 : 1.5 };
  if (T.WEIRD.includes(type)) Object.assign(par, T.weirdPar(type, rnd));
  const b = T.browShape(type, par, T.BROW_PTS), loopy = T.LOOPY.includes(type);
  ok(b.length === T.BROW_PTS && b.every(p => Number.isFinite(p.u) && Number.isFinite(p.v)), type + ' 點數');
  ok(b.every(p => p.v >= T.BROW_TOP - 0.05 && p.v <= T.BROW_BOTTOM + 0.05), type + '：高度在允許的範圍內：' + Math.min(...b.map(p => p.v)) + '～' + Math.max(...b.map(p => p.v)));
  ok(b.every(p => p.u < 0 && p.u >= -(T.BROW_GAP + T.BROW_LEN + 20)), type + '：在中軸左邊、不會長太遠');
  if (!loopy) {
    ok(near(b[0].u, -T.BROW_GAP, 0.06) && near(b[T.BROW_PTS - 1].u, -(T.BROW_GAP + T.BROW_LEN), 0.06), type + '：從內端往外長 ' + T.BROW_LEN + 'px');
    for (let k = 1; k < T.BROW_PTS; k++) ok(b[k].u < b[k - 1].u, type + '：u 一路往外（不會折回來）');
  } else {
    let back = 0; for (let k = 1; k < T.BROW_PTS; k++) if (b[k].u > b[k - 1].u) back++;
    ok(back >= 4, type + '：線會折回來（打圈）：折回 ' + back + ' 次');
    ok(T.pathLength(b.map(q => ({ x: q.u, y: q.v }))) >= T.BROW_LEN * 1.6, type + '：打圈的線比直線長很多');
  }
}

// ── 出題：全部關卡掃一遍 ──
const ST = { n: 0, types: {}, maxTilt: 0, maxShift: 0, Lmin: 1e9, Lmax: 0 };
for (let lv = 1; lv <= 30; lv++) for (let rep = 0; rep < 60; rep++) {
  const q = T.makeLevel(lv, rnd); ST.n++;
  ok(q.kind === 'stache' ? (lv >= T.STACHE_FROM && T.STACHE_TYPES.includes(q.type)) : (T.typesFor(lv).includes(q.type) || (T.WEIRD.includes(q.type) && lv >= T.WEIRD_FROM)), '形狀在這一關可以出現的種類裡（' + q.kind + ' ' + q.type + '）'); ST.types[q.kind + ':' + q.type] = (ST.types[q.kind + ':' + q.type] || 0) + 1;
  ok(near(q.thresh, T.threshFor(lv)) && Math.abs(q.thetaDeg) <= T.tiltFor(lv) + 0.01 && (lv < T.TILT_FROM ? q.thetaDeg === 0 : Math.abs(q.thetaDeg) >= T.tiltFor(lv) * 0.5 - 0.01), '歪的角度 ' + q.thetaDeg + '°');
  ok(Math.abs(q.F.x - 236) <= T.shiftFor(lv) + 0.1 && (lv >= T.TILT_FROM || q.F.x === 236), '臉心偏離 ' + (q.F.x - 236).toFixed(1) + 'px'); ST.maxTilt = Math.max(ST.maxTilt, Math.abs(q.thetaDeg)); ST.maxShift = Math.max(ST.maxShift, Math.abs(q.F.x - 236));
  ok(q.ref.length === T.BROW_PTS && q.target.length === T.BROW_PTS && q.len === (q.kind === 'stache' ? T.STACHE_LEN : T.BROW_LEN) && near(q.L, Math.min(T.pathLength(q.ref), T.L_CAP * q.len)) && near(q.pathLen, T.pathLength(q.ref)), '兩條線各 ' + T.BROW_PTS + ' 點；相似度用的長度 L ＝ 路徑長度、最多 ' + T.L_CAP + ' 倍的長度（眉毛 BROW_LEN／鬍子 STACHE_LEN）');
  ok(q.ref.concat(q.target).every(p => p.x >= T.EDGE - 0.6 && p.x <= 472 - T.EDGE + 0.6 && p.y >= 4 && p.y <= 640 - 4), '第 ' + lv + ' 關：整條眉毛（含鏡射的）都在畫面裡'); ST.Lmin = Math.min(ST.Lmin, q.L); ST.Lmax = Math.max(ST.Lmax, q.L);
  ok(near(T.pathLength(q.target), q.pathLen, 0.01), '鏡射不改變長度');
  ok(T.similarity(q.target, q.target, q.L) === 100, '標準答案對自己 100%');
  // 完美玩家（加 1.2px 抖動）一定及格；偏 0.12 倍眉毛長度的玩家在高關卡不及格
  const good = q.target.map(p => ({ x: p.x + (rnd() - 0.5) * 2.4, y: p.y + (rnd() - 0.5) * 2.4 })); ok(T.similarity(good, q.target, q.L) >= q.thresh, '抖動 ±1.2px 的完美玩家第 ' + lv + ' 關過關（' + T.similarity(good, q.target, q.L).toFixed(2) + '% ≥ ' + q.thresh + '）');
  // 標準答案整條往下偏 7px（眉毛大多是橫的，往下偏就是垂直於曲線的誤差）：70% 關還過、93% 關過不了
  /* 迴紋針（clip）和梳子（comb）是上下重複的密集線條，整條往下偏 20px 還是跟自己很像，這個「平移」測試對它們不成立（直線作弊的測試另外檢查它們） */
  const t0 = q.target[0], t1 = q.target[q.target.length - 1], tl = Math.hypot(t1.x - t0.x, t1.y - t0.y) || 1, nx = -(t1.y - t0.y) / tl, ny = (t1.x - t0.x) / tl, dd = lv >= T.RAMP_LEVELS ? PX_TOP : 7;
  const sh = q.target.map(p => ({ x: p.x + nx * dd, y: p.y + ny * dd }));   /* 垂直於「起點到終點」的方向偏 dd px */ if (lv === 1) ok(T.similarity(sh, q.target, q.L) >= q.thresh, '第 1 關往下偏 7px 還是過關：' + T.similarity(sh, q.target, q.L).toFixed(2) + '%'); if (lv >= T.RAMP_LEVELS && q.type !== 'clip' && q.type !== 'comb') ok(T.similarity(sh, q.target, q.L) < q.thresh, '到頂關卡往下偏 ' + PX_TOP + 'px 就不及格（' + q.kind + ' ' + q.type + '）：' + T.similarity(sh, q.target, q.L).toFixed(2) + '%');
}
console.log('共 ' + ST.n + ' 關；形狀 ' + JSON.stringify(ST.types) + '；最大歪角 ' + ST.maxTilt.toFixed(1) + '°、最大偏移 ' + ST.maxShift.toFixed(1) + 'px；左眉長度 ' + ST.Lmin.toFixed(0) + '～' + ST.Lmax.toFixed(0) + ' px');
ok(Object.keys(ST.types).length === T.TYPES.length + T.STACHE_TYPES.length, '全部 ' + T.TYPES.length + ' 種眉毛 + ' + T.STACHE_TYPES.length + ' 種鬍子都會出現');
// 說明
ok(T.whyText(88.3142, 83) === '相似度 88.3142%（及格線 83.0000%）——過關！' && T.whyText(75.5, 83.1234) === '相似度 75.5000%，沒達到及格線 83.1234%', 'whyText（含使用者企劃的 88.3142%）');

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_eyebrow.js'), css = rd('../../css/games/reaction_eyebrow.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3000/.test(src) && /eyebrow-ghost/.test(src) && /similarity\(stroke, q\.target, q\.L\)/.test(src) && /whyText\(sim, q\.thresh\)/.test(src), '失敗：鏡射的左眉（紅色）疊在你畫的上面、寫出相似度、停格夠久');
  ok(/pointerdown/.test(src) && /pointermove/.test(src) && /pointerup/.test(src) && /MIN_LEN_FRAC/.test(src) && /畫長一點/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '手指放開才判定；太短不算可以重畫；solve／wrong');
  ok(/\.eyebrow-ref \{[^}]*var\(--ebw-brow\)/.test(css) && /\.eyebrow-ghost \{[^}]*var\(--ebw-ghost\)/.test(css) && /\.eyebrow-head \{[^}]*var\(--ebw-skin\)/.test(css), '眉毛、臉、淡紅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_eyebrow.js'") > 0 && /鏡射/.test(G.rule) && /相似度/.test(G.rule) && /轉正/.test(G.rule) && /奇怪/.test(G.rule), 'boot.js 有載入、玩法說明提到鏡射、相似度、轉正、奇怪的形狀'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(10) && T.rating(10) !== T.rating(16), '評語分級');
// ── V1.36.0 玩家意見：眉毛形狀太規律 → 奇怪形狀；揭曉時整張臉轉正 ──
ok(T.WEIRD.length === 7 && T.LOOPY.length === 3 && T.LOOPY.every(t => T.WEIRD.includes(t)) && T.TYPES.length === T.BASE_TYPES.length + T.WEIRD.length, '七種奇怪形狀（含彈簧、迴紋針、漩渦三種打圈的）+ 五種規律形狀');
ok(T.weirdPFor(T.WEIRD_FROM - 1) === 0 && T.weirdPFor(T.WEIRD_FROM) >= T.WEIRD_P[0] - 1e-9 && near(T.weirdPFor(T.RAMP_LEVELS), T.WEIRD_P[1], 1e-6), '奇怪形狀：第 ' + T.WEIRD_FROM + ' 關起出現，到頂 ' + T.WEIRD_P[1]);
for (let l = T.WEIRD_FROM + 1; l <= 60; l++) ok(T.weirdPFor(l) >= T.weirdPFor(l - 1), '奇怪形狀的機率單調 ' + l);
{ const dirChanges = b => { let c = 0, prev = 0; for (let k = 1; k < b.length; k++) { const d = Math.sign(b[k].v - b[k - 1].v); if (d && prev && d !== prev) c++; if (d) prev = d; } return c; };
  const stat = {}; T.WEIRD.forEach(type => { stat[type] = { n: 0, ch: 0, minV: 1e9, maxV: -1e9, kinks: 0 }; });
  for (const type of T.WEIRD) for (let i = 0; i < 400; i++) {
    const par = { h: 0.08 + rnd() * 0.14, slope: -0.1 + rnd() * 0.22, peak: 0.4 + rnd() * 0.32, drop: rnd() * 0.6, waves: 1 };
    Object.assign(par, T.weirdPar(type, rnd));
    const b = T.browShape(type, par, 24), b2 = T.browShape(type, par, 24);
    ok(JSON.stringify(b) === JSON.stringify(b2), type + '：同樣的參數畫出同樣的形狀（純函式）');
    ok(b.every(p => p.v >= T.BROW_TOP - 0.05 && p.v <= T.BROW_BOTTOM + 0.05), type + '：高度夾在眉毛的範圍內 ' + Math.min(...b.map(p => p.v)) + '～' + Math.max(...b.map(p => p.v)));
    const s = stat[type]; s.n++; s.ch += dirChanges(b); s.minV = Math.min(s.minV, ...b.map(p => p.v)); s.maxV = Math.max(s.maxV, ...b.map(p => p.v));
  }
  console.log('奇怪形狀的平均起伏次數（上下轉折）：' + T.WEIRD.map(k => k + ' ' + (stat[k].ch / stat[k].n).toFixed(2)).join('　'));
  ok(stat.zigzag.ch / stat.zigzag.n >= 2 && stat.twin.ch / stat.twin.n >= 2 && stat.odd.ch / stat.odd.n >= 1.2, '鋸齒、雙峰平均至少 2 個轉折，隨機曲線至少 1.2 個（不是簡單的一座山）');
  // 規律的形狀（彎月、拱形…）轉折次數只有 0～1 次，奇怪形狀明顯比較亂
  const reg = {}; T.BASE_TYPES.forEach(type => { let c = 0; for (let i = 0; i < 200; i++) c += dirChanges(T.browShape(type, { h: 0.08 + rnd() * 0.14, slope: rnd() * 0.1, peak: 0.4 + rnd() * 0.3, drop: rnd() * 0.5, waves: 1 }, 24)); reg[type] = c / 200; });
  ok(reg.moon <= 1.01 && reg.arch <= 1.2, '規律形狀（彎月、拱形）只有一座山：' + JSON.stringify(reg)); }
// 沒有給 par 的奇怪欄位時也畫得出來（舊程式或測試傳來的 par）
for (const type of T.WEIRD) { const b = T.browShape(type, { h: 0.15, slope: 0.05, peak: 0.6, drop: 0.3, waves: 1 }, T.BROW_PTS); ok(b.length === T.BROW_PTS && b.every(p => Number.isFinite(p.u) && Number.isFinite(p.v)), type + '：沒有專用參數時有預設值'); }
ok(near(T.catmull([0, 1, 0, -1, 0], 0), 0, 1e-9) && near(T.catmull([0, 1, 0, -1, 0], 0.25), 1, 1e-9) && near(T.catmull([0, 1, 0, -1, 0], 1), 0, 1e-9) && near(T.piecewise([0, 0.5, 1], [0, 2, 0], 0.25), 1, 1e-9), 'catmull 通過控制點；piecewise 折線插值');
// 揭曉時整張臉轉正
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_eyebrow.js'), 'utf8'), css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/games/reaction_eyebrow.css'), 'utf8').split(/\s+/).join(' ');
  ok(T.TURN_MS > 0 && src.indexOf("turn.style.transform = 'rotate(' + (-q.thetaDeg) + 'deg)'") > 0 && src.indexOf("axis.classList.add('eyebrow-axis--on')") > 0, '揭曉時整組（臉、你畫的線、淡紅色的線）繞臉心轉 ' + '−歪的角度（轉正）');
  ok(src.indexOf("var mine = kit.svg('polyline', { 'class': 'eyebrow-mine' + sc.replace('ref', 'mine'), points: '' }, turn), ghost = kit.svg('polyline', { 'class': 'eyebrow-ghost' + sc.replace('ref', 'ghost'), points: '' }, turn)") > 0 && src.indexOf("var face = kit.svg('g', { transform: 'translate(' + q.F.x + ',' + q.F.y + ') rotate(' + q.thetaDeg + ')' }, turn)") > 0, '臉、你畫的線、淡紅色的線在同一個會轉的群組裡');
  ok(css.indexOf('.eyebrow-turn { transition-property: transform;') >= 0 && css.indexOf('.eyebrow-axis--on { opacity: 0.45;') >= 0, '轉正的轉場動畫與中軸有樣式'); }
// 轉正的數學：turn 轉 −θ（繞臉心），再加上臉本身的 +θ，合起來是 0——臉的中軸變成垂直
{ for (const th of [-170, -45, 0, 12, 90, 179]) { const total = (-th) + th; ok(total === 0, '轉正：歪 ' + th + '° → 揭曉後 0°'); } }
// ── V1.38.0 玩家意見：眉毛要加大、形狀變化要大（可以超出臉部；彈簧、迴紋針、漩渦…）；評審動畫先轉正、再顯示紅色的正確眉毛 ──
ok(T.BROW_LEN >= 130 && T.BROW_GAP + T.BROW_LEN > 150 + 10, '眉毛加大（' + T.BROW_LEN + 'px），眉尾超出臉的輪廓（頭的半寬 150）');
ok(T.BROW_TOP <= -180, '眉毛可以高過頭頂（BROW_TOP ' + T.BROW_TOP + '）');
{ // 形狀的變化量：每種形狀的上下起伏（最高到最低）至少要有 BROW_LEN 的 15%，而且彈簧、迴紋針、漩渦起碼 12px
  const span = {}; T.TYPES.forEach(type => { let mn = 1e9, mx = -1e9, tot = 0; for (let i = 0; i < 200; i++) { const par = { h: 0.1 + rnd() * 0.2, slope: rnd() * 0.1, peak: 0.4 + rnd() * 0.3, drop: rnd() * 0.5, waves: 1 }; if (T.WEIRD.includes(type)) Object.assign(par, T.weirdPar(type, rnd)); const b = T.browShape(type, par, T.BROW_PTS), vs = b.map(q => q.v), sp = Math.max(...vs) - Math.min(...vs); tot += sp; mn = Math.min(mn, sp); mx = Math.max(mx, sp); } span[type] = { avg: tot / 200, min: mn, max: mx }; });
  console.log('各形狀上下起伏（平均 px）：' + T.TYPES.map(k => k + ' ' + span[k].avg.toFixed(0)).join('　'));
  ok(T.TYPES.filter(k => k !== 'flat').every(k => span[k].avg >= T.BROW_LEN * 0.12), '除了本來就平的一字眉，每種形狀的平均起伏至少 ' + Math.round(T.BROW_LEN * 0.12) + 'px'); }
// 打圈的形狀：螺旋要真的繞圈（累計轉角），彈簧一圈一圈
{ const turnsOf = b => { let tot = 0, prev = null; for (let k = 1; k < b.length; k++) { const a = Math.atan2(b[k].v - b[k - 1].v, b[k].u - b[k - 1].u); if (prev != null) { let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; tot += d; } prev = a; } return Math.abs(tot) / (2 * Math.PI); };
  const sw = [], cl = [], sp = [];
  for (let i = 0; i < 100; i++) { const w = T.weirdPar('swirl', rnd), c = T.weirdPar('clip', rnd), g = T.weirdPar('spring', rnd);
    sw.push(turnsOf(T.browShape('swirl', w, 200))); cl.push(turnsOf(T.browShape('clip', c, 200))); sp.push(turnsOf(T.browShape('spring', g, 200))); }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  ok(Math.min(...sw) >= 1.3 && Math.min(...cl) >= 1.2 && Math.min(...sp) >= 2.5, '漩渦、迴紋針繞了 1 圈以上、彈簧繞了 3 圈左右：' + avg(sw).toFixed(2) + '／' + avg(cl).toFixed(2) + '／' + avg(sp).toFixed(2)); }
// 臉心的偏移：眉毛越大、能偏的越少，整條眉毛一定留在畫面裡（歪到任何角度都一樣，因為只看離臉心最遠的距離）
{ ok(T.shiftLimit(100, 472) === 472 / 2 - T.EDGE - 100 && T.shiftLimit(228, 472) < 1, 'shiftLimit');
  for (let i = 0; i < 400; i++) { const lv = 1 + Math.floor(rnd() * 40), q = T.makeLevel(lv, rnd), r = T.browRadius(q.brow); ok(Math.abs(q.F.x - 236) <= Math.max(0, T.shiftLimit(r, 472)) + 0.1, '偏移不超過 shiftLimit：' + (q.F.x - 236).toFixed(1) + ' ≤ ' + T.shiftLimit(r, 472).toFixed(1)); }
  // 窄的畫面（W 小）也要放得進去：重抽到放得下的眉毛
  for (let i = 0; i < 200; i++) { const q = T.makeLevel(30, rnd, 440, 640); ok(q.ref.concat(q.target).every(p => p.x >= T.EDGE - 0.6 && p.x <= 440 - T.EDGE + 0.6), '窄畫面 440 也放得進去'); } }
// 評審動畫的順序：臉先轉正（TURN_MS）→ 停一下（REVEAL_GAP_MS）→ 紅色的正確眉毛淡入（GHOST_MS）→ 才顯示相似度與結算
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_eyebrow.js'), 'utf8'), css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/games/reaction_eyebrow.css'), 'utf8').split(/\s+/).join(' ');
  const iJudge = src.indexOf('function judge(stroke)'), iTurn = src.indexOf("turn.style.transform = 'rotate('", iJudge), iAfter = src.indexOf('api.after(revealAt', iJudge), iGhost = src.indexOf("ghost.setAttribute('points'", iJudge), iInfo = src.indexOf('info.textContent = why', iJudge), iPass = src.indexOf('api.pass(', iJudge), iFail = src.indexOf('api.fail(', iJudge);
  ok(iJudge > 0 && iTurn > iJudge && iAfter > iTurn && iGhost > iAfter && iInfo > iGhost && iPass > iInfo && iFail > iInfo, '順序：先轉正（turn.style.transform）→ 等 revealAt → 才畫紅色眉毛（ghost）→ 才寫相似度、過關／失敗');
  ok(/var turnMs = q\.thetaDeg \? TURN_MS : 0, revealAt = turnMs \+ REVEAL_GAP_MS/.test(src) && T.REVEAL_GAP_MS > 0 && T.TURN_MS > 0, '紅色眉毛在「轉正的時間＋停頓」之後才出現（臉本來就正的就不用等轉）');
  ok(/\.eyebrow-ghost \{[^}]*opacity: 0;[^}]*transition: opacity 0\.6s/.test(css) && /\.eyebrow-ghost--on \{[^}]*opacity: 0\.8/.test(css) && T.GHOST_MS === 600, '紅色眉毛一開始看不見、淡入 0.6 秒（跟 GHOST_MS 一致）'); }
// ═══ V1.40.0 玩家意見：只有畫眉毛很容易單調 → 增加畫鬍子（各種創意鬍子） ═══
{
  const halfW = v => 150 * Math.sqrt(Math.max(0, 1 - Math.pow((v - 8) / 188, 2)));        // 臉（頭的橢圓 rx 150、ry 188、圓心 (0, 8)）在高度 v 的半寬
  ok(T.STACHE_BASE.length === 4 && T.STACHE_WEIRD.length === 9 && T.STACHE_TYPES.length === 13 && T.LOOPY.every(t => T.STACHE_WEIRD.includes(t)), '鬍子 13 種：規律 4（鉛筆、海象、八字翹、長八字）＋奇怪 9（含彈簧、迴紋針、漩渦）');
  ok(T.STACHE_BASE.join() === 'pencil,walrus,handlebar,fumanchu' && ['wave', 'comb', 'zigzag', 'twin', 'scallop', 'stairs'].every(t => T.STACHE_WEIRD.includes(t)), '鬍子的種類名稱');
  ok(T.STACHE_GAP + T.STACHE_LEN <= halfW(T.STACHE_V) + 1, '鬍子的長度放得進臉（' + (T.STACHE_GAP + T.STACHE_LEN) + ' ≤ 臉寬的一半 ' + halfW(T.STACHE_V).toFixed(0) + '）');
  ok(T.STACHE_TOP > -22 + 13 && T.STACHE_TOP < T.STACHE_V && T.STACHE_BOTTOM > T.STACHE_V && T.STACHE_BOTTOM < 196, '鬍子的高度範圍在眼睛下面、下巴上面（' + T.STACHE_TOP + '～' + T.STACHE_BOTTOM + '）');
  // 出現的機率：第 1 關一定是眉毛，第 STACHE_FROM 關起 STACHE_P[0] → 到頂 STACHE_P[1]
  ok(T.stachePFor(1) === 0 && T.stachePFor(T.STACHE_FROM - 1) === 0 && T.stachePFor(T.STACHE_FROM) >= T.STACHE_P[0] - 1e-9 && near(T.stachePFor(T.RAMP_LEVELS), T.STACHE_P[1], 1e-6) && near(T.stachePFor(99), T.STACHE_P[1], 1e-6), '鬍子機率：第 1 關 0，第 ' + T.STACHE_FROM + ' 關 ' + T.stachePFor(T.STACHE_FROM).toFixed(3) + ' → 到頂 ' + T.STACHE_P[1]);
  for (let l = 2; l <= 40; l++) ok(T.stachePFor(l) >= T.stachePFor(l - 1) - 1e-12, '鬍子機率單調 ' + l);
  { let s1 = 0; for (let i = 0; i < 300; i++) if (T.makeLevel(1, rnd).kind === 'stache') s1++; ok(s1 === 0, '第 1 關一定是眉毛');
    for (const lv of [2, 10, 30]) { let n = 0, N = 1500; for (let i = 0; i < N; i++) if (T.makeLevel(lv, rnd).kind === 'stache') n++; const p = n / N, want = T.stachePFor(lv); ok(Math.abs(p - want) < 0.06, '第 ' + lv + ' 關畫鬍子的比例 ' + p.toFixed(3) + '（目標 ' + want + '）'); } }
  // 形狀：每種鬍子都畫得出來、在臉上、u 一路往外（打圈的除外）、純函式、不同形狀真的不一樣
  const stat = {}, cmpAB = {};
  for (const type of T.STACHE_TYPES) {
    const loopy = T.LOOPY.includes(type); stat[type] = { span: 0, ch: 0, len: 0, n: 0 };
    for (let i = 0; i < 300; i++) {
      const par = T.stachePar(type, rnd), b = T.stacheShape(type, par, T.BROW_PTS), b2 = T.stacheShape(type, par, T.BROW_PTS);
      ok(JSON.stringify(b) === JSON.stringify(b2), type + '：同樣的參數畫出同樣的形狀（純函式）');
      ok(b.length === T.BROW_PTS && b.every(p => Number.isFinite(p.u) && Number.isFinite(p.v)), '鬍子 ' + type + ' 點數');
      ok(b.every(p => p.v >= T.STACHE_TOP - 0.05 && p.v <= T.STACHE_BOTTOM + 0.05), '鬍子 ' + type + '：高度在允許的範圍內：' + Math.min(...b.map(p => p.v)) + '～' + Math.max(...b.map(p => p.v)));
      ok(b.every(p => p.u < 0 && p.u >= -(T.STACHE_GAP + T.STACHE_LEN + 20)), '鬍子 ' + type + '：在中軸左邊、不會長太遠');
      ok(b.every(p => Math.pow(p.u / (150 * 1.12), 2) + Math.pow((p.v - 8) / (188 * 1.12), 2) <= 1), '鬍子 ' + type + '：整條都在臉上（頭的橢圓放大 12% 以內）');
      if (!loopy) {
        ok(near(b[0].u, -T.STACHE_GAP, 0.06), '鬍子 ' + type + '：內端離中軸 ' + T.STACHE_GAP + 'px');
        if (type === 'fumanchu') ok(b[T.BROW_PTS - 1].u <= -(T.STACHE_GAP + 0.55 * T.STACHE_LEN) && b[T.BROW_PTS - 1].u >= -(T.STACHE_GAP + T.STACHE_LEN) - 0.06, '長八字鬍：外端在中間偏外（往下垂，不飄出臉）');
        else ok(near(b[T.BROW_PTS - 1].u, -(T.STACHE_GAP + T.STACHE_LEN), 0.06), '鬍子 ' + type + '：從內端往外長 ' + T.STACHE_LEN + 'px');
        for (let k = 1; k < T.BROW_PTS; k++) ok(b[k].u < b[k - 1].u, '鬍子 ' + type + '：u 一路往外（不會折回來）');
      } else {
        let back = 0; for (let k = 1; k < T.BROW_PTS; k++) if (b[k].u > b[k - 1].u) back++;
        ok(back >= 4 && T.pathLength(b.map(q => ({ x: q.u, y: q.v }))) >= T.STACHE_LEN * 1.5, '鬍子 ' + type + '：線會打圈（折回 ' + back + ' 次、線比直線長很多）');
      }
      const vs = b.map(q => q.v), s = stat[type]; s.n++; s.span += Math.max(...vs) - Math.min(...vs); s.len += T.pathLength(b.map(q => ({ x: q.u, y: q.v })));
      let ch = 0, prev = 0; for (let k = 1; k < b.length; k++) { const d = Math.sign(b[k].v - b[k - 1].v); if (d && prev && d !== prev) ch++; if (d) prev = d; } s.ch += ch;
    }
  }
  console.log('鬍子各形狀：平均上下起伏 px／上下轉折次數／線長 px：' + T.STACHE_TYPES.map(k => k + ' ' + (stat[k].span / stat[k].n).toFixed(0) + '/' + (stat[k].ch / stat[k].n).toFixed(1) + '/' + (stat[k].len / stat[k].n).toFixed(0)).join('　'));
  ok(['walrus', 'handlebar', 'fumanchu', 'wave', 'comb', 'zigzag', 'twin', 'scallop', 'stairs', 'spring', 'clip', 'swirl'].every(k => stat[k].span / stat[k].n >= 18), '每種鬍子（鉛筆鬍除外）都有明顯起伏：平均至少 18px');
  ok(stat.pencil.span / stat.pencil.n < 25 && stat.wave.span / stat.wave.n > stat.pencil.span / stat.pencil.n, '鉛筆鬍比較平、波浪鬍起伏比較大');
  ok(stat.comb.ch / stat.comb.n >= 6 && stat.zigzag.ch / stat.zigzag.n >= 2 && stat.scallop.ch / stat.scallop.n >= 3 && stat.stairs.ch / stat.stairs.n <= 1.01 && stat.fumanchu.ch / stat.fumanchu.n <= 1.5, '梳子鬍轉折很多（≥ 6）、閃電鬍 ≥ 2、扇貝鬍 ≥ 3、階梯鬍只有爬上去再走下來一次轉折（≤ 1）、長八字鬍至多轉一次');
  // 直線作弊：從內端到外端畫一條直線，在到頂的關卡不能輕易過關（鉛筆鬍本來就是一條直線，不在此限）
  { const by = {}; for (let r = 0; r < 3000; r++) { const q = T.makeLevel(T.RAMP_LEVELS, rnd); if (q.kind !== 'stache') continue; const a = q.target[0], b = q.target[q.target.length - 1], st = []; for (let i = 0; i <= 20; i++) st.push({ x: a.x + (b.x - a.x) * i / 20, y: a.y + (b.y - a.y) * i / 20 }); (by[q.type] = by[q.type] || []).push(T.similarity(st, q.target, q.L) >= q.thresh ? 1 : 0); }
    const rate = k => by[k].reduce((x, y) => x + y, 0) / by[k].length, bads = Object.keys(by).filter(k => k !== 'pencil' && rate(k) > 0.3);
    console.log('到頂關卡，直線能過關的比例：' + Object.keys(by).sort().map(k => k + ' ' + (rate(k) * 100).toFixed(0) + '%').join('　'));
    ok(bads.length === 0, '鬍子不能靠一條直線就過關（除鉛筆鬍外，比例都 ≤ 30%）：' + bads.join(',')); }
  // 兩種不同形狀畫出來的線真的不一樣（鬍子種類不是換名字而已）：不同形狀之間的平均 chamfer 距離要有 4px 以上
  const protos = {}; T.STACHE_TYPES.forEach(k => { protos[k] = T.stacheShape(k, T.stachePar(k, rnd), T.BROW_PTS).map(q => ({ x: q.u, y: q.v })); });
  let minPair = 1e9, minName = ''; for (let i = 0; i < T.STACHE_TYPES.length; i++) for (let j = i + 1; j < T.STACHE_TYPES.length; j++) { let tot = 0; for (let r = 0; r < 20; r++) { const A = T.stacheShape(T.STACHE_TYPES[i], T.stachePar(T.STACHE_TYPES[i], rnd), T.BROW_PTS).map(q => ({ x: q.u, y: q.v })), B = T.stacheShape(T.STACHE_TYPES[j], T.stachePar(T.STACHE_TYPES[j], rnd), T.BROW_PTS).map(q => ({ x: q.u, y: q.v })); tot += T.chamfer(A, B); } const m = tot / 20; if (m < minPair) { minPair = m; minName = T.STACHE_TYPES[i] + '／' + T.STACHE_TYPES[j]; } }
  ok(minPair >= 4, '任兩種鬍子形狀的平均差距 ≥ 4px（最像的一對 ' + minName + '：' + minPair.toFixed(1) + 'px）');
  // 出題：鬍子關卡的左邊那撇（臉座標）與鏡射都在臉上；鬍子的標準答案對自己 100%，抖動的完美玩家過關，隨便亂畫不及格
  { let nSt = 0, goodFail = 0, wrongPass = 0, offFace = 0;
    for (let lv = 2; lv <= 30; lv++) for (let rep = 0; rep < 40; rep++) {
      const q = T.makeLevel(lv, rnd); if (q.kind !== 'stache') continue; nSt++;
      if (!q.brow.every(p => Math.pow(p.u / 168, 2) + Math.pow((p.v - 8) / 211, 2) <= 1) || !q.mirror.every(p => p.u > 0)) offFace++;
      const good = q.target.map(p => ({ x: p.x + (rnd() - 0.5) * 2.4, y: p.y + (rnd() - 0.5) * 2.4 })); if (T.similarity(good, q.target, q.L) < q.thresh) goodFail++;
      const line = []; for (let k = 0; k < 20; k++) line.push({ x: q.F.x + 30 + k * 6, y: q.F.y + 150 }); if (T.similarity(line, q.target, q.L) >= q.thresh) wrongPass++;
    }
    ok(nSt > 400, '掃過的關卡裡有 ' + nSt + ' 關是鬍子'); ok(offFace === 0 && goodFail === 0 && wrongPass === 0, '鬍子關卡：在臉上 ' + offFace + '、完美玩家不過關 ' + goodFail + '、亂畫的橫線居然過關 ' + wrongPass); }
  // 臉的歪角與偏移對鬍子一樣有效；鏡射的兩條對「臉的中軸」對稱
  { for (let i = 0; i < 200; i++) { const q = T.makeLevel(20, rnd); if (q.kind !== 'stache') continue; const th = q.theta, ax = { x: -Math.sin(th), y: Math.cos(th) }; for (let k = 0; k < q.ref.length; k += 9) { const a = q.ref[k], b = q.target[k], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d = { x: mid.x - q.F.x, y: mid.y - q.F.y }, cross = d.x * ax.y - d.y * ax.x; ok(Math.abs(cross) < 1e-6, '鬍子的鏡射兩點的中點在臉的中軸上'); } } }
  // 接線（原始碼／樣式）：鬍子的線條畫粗一點、玩法說明提到鬍子
  const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_eyebrow.js'), 'utf8'), css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/games/reaction_eyebrow.css'), 'utf8').split(/\s+/).join(' ');
  ok(/\.eyebrow-ref--stache \{ stroke-width: 1[0-9];/.test(css) && /\.eyebrow-mine--stache \{ stroke-width: 1[0-9];/.test(css) && /\.eyebrow-ghost--stache \{ stroke-width: 1[0-9];/.test(css), '鬍子的左邊那撇、你畫的、紅色答案的線條都比眉毛粗（css）');
  ok(/q\.kind === 'stache' \? ' eyebrow-ref--stache' : ''/.test(src) && /var noun = q\.kind === 'stache' \? '鬍子' : '眉毛'/.test(src), '畫面依 kind 換用語（noun）與粗線 class');
  ok(/鬍子/.test(G.rule) && /鏡射/.test(G.rule) && /第 2 關起/.test(G.rule) && T.STACHE_FROM === 2, '玩法說明提到鬍子（第 2 關起）');
}
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
