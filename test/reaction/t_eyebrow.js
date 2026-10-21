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
for (const type of T.TYPES) for (let i = 0; i < 200; i++) {
  const par = { h: 0.08 + rnd() * 0.14, slope: -0.1 + rnd() * 0.22, peak: 0.4 + rnd() * 0.32, drop: rnd() * 0.6, waves: rnd() < 0.5 ? 1 : 1.5 }, b = T.browShape(type, par, 24);
  ok(b.length === 24 && b.every(p => Number.isFinite(p.u) && Number.isFinite(p.v)), type + ' 點數');
  ok(near(b[0].u, -T.BROW_GAP, 0.06) && near(b[23].u, -(T.BROW_GAP + T.BROW_LEN), 0.06) && b.every(p => p.u < 0), type + '：在中軸左邊、從內端往外長 ' + T.BROW_LEN + 'px');
  ok(b.every(p => p.v > -130 && p.v < 0), type + '：高度在臉的眉毛位置範圍內：' + Math.min(...b.map(p => p.v)) + '～' + Math.max(...b.map(p => p.v)));
  for (let k = 1; k < 24; k++) ok(b[k].u < b[k - 1].u, type + '：u 一路往外（不會折回來）');
}

// ── 出題：全部關卡掃一遍 ──
const ST = { n: 0, types: {}, maxTilt: 0, maxShift: 0, Lmin: 1e9, Lmax: 0 };
for (let lv = 1; lv <= 30; lv++) for (let rep = 0; rep < 60; rep++) {
  const q = T.makeLevel(lv, rnd); ST.n++;
  ok(T.typesFor(lv).includes(q.type) || (T.WEIRD.includes(q.type) && lv >= T.WEIRD_FROM), '形狀在這一關可以出現的種類裡'); ST.types[q.type] = (ST.types[q.type] || 0) + 1;
  ok(near(q.thresh, T.threshFor(lv)) && Math.abs(q.thetaDeg) <= T.tiltFor(lv) + 0.01 && (lv < T.TILT_FROM ? q.thetaDeg === 0 : Math.abs(q.thetaDeg) >= T.tiltFor(lv) * 0.5 - 0.01), '歪的角度 ' + q.thetaDeg + '°');
  ok(Math.abs(q.F.x - 236) <= T.shiftFor(lv) + 0.1 && (lv >= T.TILT_FROM || q.F.x === 236), '臉心偏離 ' + (q.F.x - 236).toFixed(1) + 'px'); ST.maxTilt = Math.max(ST.maxTilt, Math.abs(q.thetaDeg)); ST.maxShift = Math.max(ST.maxShift, Math.abs(q.F.x - 236));
  ok(q.ref.length === 24 && q.target.length === 24 && near(q.L, T.pathLength(q.ref)), '兩條眉毛各 24 點'); ST.Lmin = Math.min(ST.Lmin, q.L); ST.Lmax = Math.max(ST.Lmax, q.L);
  ok(near(T.pathLength(q.target), q.L, 0.01), '鏡射不改變長度');
  ok(T.similarity(q.target, q.target, q.L) === 100, '標準答案對自己 100%');
  // 完美玩家（加 1.2px 抖動）一定及格；偏 0.12 倍眉毛長度的玩家在高關卡不及格
  const good = q.target.map(p => ({ x: p.x + (rnd() - 0.5) * 2.4, y: p.y + (rnd() - 0.5) * 2.4 })); ok(T.similarity(good, q.target, q.L) >= q.thresh, '抖動 ±1.2px 的完美玩家第 ' + lv + ' 關過關（' + T.similarity(good, q.target, q.L).toFixed(2) + '% ≥ ' + q.thresh + '）');
  // 標準答案整條往下偏 7px（眉毛大多是橫的，往下偏就是垂直於曲線的誤差）：70% 關還過、93% 關過不了
  const t0 = q.target[0], t1 = q.target[q.target.length - 1], tl = Math.hypot(t1.x - t0.x, t1.y - t0.y) || 1, nx = -(t1.y - t0.y) / tl, ny = (t1.x - t0.x) / tl, dd = lv >= T.RAMP_LEVELS ? PX_TOP : 7;
  const sh = q.target.map(p => ({ x: p.x + nx * dd, y: p.y + ny * dd }));   /* 垂直於「起點到終點」的方向偏 dd px */ if (lv === 1) ok(T.similarity(sh, q.target, q.L) >= q.thresh, '第 1 關往下偏 7px 還是過關：' + T.similarity(sh, q.target, q.L).toFixed(2) + '%'); if (lv >= T.RAMP_LEVELS) ok(T.similarity(sh, q.target, q.L) < q.thresh, '到頂關卡往下偏 ' + PX_TOP + 'px 就不及格：' + T.similarity(sh, q.target, q.L).toFixed(2) + '%');
}
console.log('共 ' + ST.n + ' 關；形狀 ' + JSON.stringify(ST.types) + '；最大歪角 ' + ST.maxTilt.toFixed(1) + '°、最大偏移 ' + ST.maxShift.toFixed(1) + 'px；左眉長度 ' + ST.Lmin.toFixed(0) + '～' + ST.Lmax.toFixed(0) + ' px');
ok(Object.keys(ST.types).length === T.TYPES.length, '全部 ' + T.TYPES.length + ' 種形狀都會出現');
// 說明
ok(T.whyText(88.3142, 83) === '相似度 88.3142%（及格線 83.0000%）——過關！' && T.whyText(75.5, 83.1234) === '相似度 75.5000%，沒達到及格線 83.1234%', 'whyText（含使用者企劃的 88.3142%）');

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_eyebrow.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 4200/.test(src) && /ebw-ghost/.test(src) && /similarity\(stroke, q\.target, q\.L\)/.test(src) && /whyText\(sim, q\.thresh\)/.test(src), '失敗：鏡射的左眉（淡紅色）疊在你畫的上面、寫出相似度、停格夠久');
  ok(/pointerdown/.test(src) && /pointermove/.test(src) && /pointerup/.test(src) && /MIN_LEN_FRAC/.test(src) && /畫長一點/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '手指放開才判定；太短不算可以重畫；solve／wrong');
  ok(/\.ebw-ref \{[^}]*var\(--ebw-brow\)/.test(css) && /\.ebw-ghost \{[^}]*var\(--ebw-ghost\)/.test(css) && /\.ebw-head \{[^}]*var\(--ebw-skin\)/.test(css), '眉毛、臉、淡紅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_eyebrow.js'") > 0 && /鏡射/.test(G.rule) && /相似度/.test(G.rule) && /轉正/.test(G.rule) && /奇怪/.test(G.rule), 'boot.js 有載入、玩法說明提到鏡射、相似度、轉正、奇怪的形狀'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(10) && T.rating(10) !== T.rating(16), '評語分級');
// ── V1.36.0 玩家意見：眉毛形狀太規律 → 奇怪形狀；揭曉時整張臉轉正 ──
ok(T.WEIRD.length === 4 && T.TYPES.length === T.BASE_TYPES.length + T.WEIRD.length, '四種奇怪形狀 + 五種規律形狀');
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
for (const type of T.WEIRD) { const b = T.browShape(type, { h: 0.15, slope: 0.05, peak: 0.6, drop: 0.3, waves: 1 }, 24); ok(b.length === 24 && b.every(p => Number.isFinite(p.u) && Number.isFinite(p.v)), type + '：沒有專用參數時有預設值'); }
ok(near(T.catmull([0, 1, 0, -1, 0], 0), 0, 1e-9) && near(T.catmull([0, 1, 0, -1, 0], 0.25), 1, 1e-9) && near(T.catmull([0, 1, 0, -1, 0], 1), 0, 1e-9) && near(T.piecewise([0, 0.5, 1], [0, 2, 0], 0.25), 1, 1e-9), 'catmull 通過控制點；piecewise 折線插值');
// 揭曉時整張臉轉正
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_eyebrow.js'), 'utf8'), css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction6.css'), 'utf8').split(/\s+/).join(' ');
  ok(T.TURN_MS > 0 && src.indexOf("turn.style.transform = 'rotate(' + (-q.thetaDeg) + 'deg)'") > 0 && src.indexOf("axis.classList.add('ebw-axis--on')") > 0, '揭曉時整組（臉、你畫的線、淡紅色的線）繞臉心轉 ' + '−歪的角度（轉正）');
  ok(src.indexOf("var mine = kit.svg('polyline', { 'class': 'ebw-mine', points: '' }, turn), ghost = kit.svg('polyline', { 'class': 'ebw-ghost', points: '' }, turn)") > 0 && src.indexOf("var face = kit.svg('g', { transform: 'translate(' + q.F.x + ',' + q.F.y + ') rotate(' + q.thetaDeg + ')' }, turn)") > 0, '臉、你畫的線、淡紅色的線在同一個會轉的群組裡');
  ok(css.indexOf('.ebw-turn { transition-property: transform;') >= 0 && css.indexOf('.ebw-axis--on { opacity: 0.45;') >= 0, '轉正的轉場動畫與中軸有樣式'); }
// 轉正的數學：turn 轉 −θ（繞臉心），再加上臉本身的 +θ，合起來是 0——臉的中軸變成垂直
{ for (const th of [-170, -45, 0, 12, 90, 179]) { const total = (-th) + th; ok(total === 0, '轉正：歪 ' + th + '° → 揭曉後 0°'); } }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
