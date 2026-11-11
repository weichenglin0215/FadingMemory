// 釣魚提竿（fishbite）V1.53 的新畫面：水面在畫面下方 1/3、浮標放大 300%、水面的線條從浮標往兩側以波形抖動、
// 浮標不定時左右傾斜、魚來拉（往下沉）時往「另一個方向」快速傾斜並被拉向一邊。
// （t_fishbite.js 檢查出題與判定；它在 WINDOW_S 調到很短時有些檢查本來就會失敗，所以新畫面的檢查獨立放在這裡。）
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_fishbite.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261120), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);
const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

// ── 畫面比例 ──
ok(near(T.WATER_AT, 2 / 3) && T.FLOAT_SCALE === 3, '水面在畫面由上往下 2/3（＝下方 1/3 的高度）、浮標放大 3 倍（300%）');

// ── 浮標平常不定時的傾斜 ──
let allDeg = [], gaps = [], anyLeft = false, anyRight = false, flips = 0, evN = 0, leanL = false, leanR = false;
for (let lv = 1; lv <= 40; lv++) for (let rep = 0; rep < 60; rep++) {
  const q = T.makeLevel(lv, rnd), sw = q.sways, end = q.bite.tEnd + T.RECOVER_S + 1;
  ok(sw.length >= 2 && sw[0].t >= 0.2 - 1e-9 && sw[0].t <= 1.0 + 1e-9 && sw[sw.length - 1].t < end, '傾斜從一開始就有，一直排到整關結束（' + sw.length + ' 次）');
  sw.forEach((s, i) => {
    ok(s.dur >= T.SWAY_DUR[0] - 1e-3 && s.dur <= T.SWAY_DUR[1] + 1e-3, '一次傾斜持續 ' + s.dur + ' 秒在 ' + T.SWAY_DUR + ' 之間');
    ok(Math.abs(s.deg) >= T.SWAY_DEG[0] - 1e-2 && Math.abs(s.deg) <= T.SWAY_DEG[1] + 1e-2, '傾斜角度 ' + s.deg + ' 在 ±' + T.SWAY_DEG + ' 之間');
    if (s.deg < 0) anyLeft = true; else anyRight = true; allDeg.push(s.deg);
    if (i > 0) { const g = s.t - (sw[i - 1].t + sw[i - 1].dur); ok(g >= T.SWAY_GAP[0] - 2e-3 && g <= T.SWAY_GAP[1] + 2e-3, '兩次傾斜之間隔 ' + g.toFixed(3) + ' 秒在 ' + T.SWAY_GAP + ' 之間'); gaps.push(Math.round(g * 100)); }
  });
  // swayAt：慢慢歪過去再慢慢回正，連續，絕對值不超過最大角度
  let prev = 0, maxA = 0, maxStep = 0;
  for (let t = 0; t <= end; t += 0.01) { const a = T.swayAt(q, t); maxA = Math.max(maxA, Math.abs(a)); maxStep = Math.max(maxStep, Math.abs(a - prev)); prev = a; }
  ok(maxA <= T.SWAY_DEG[1] + 1e-6 && maxA > 0, '平常的傾斜不超過 ±' + T.SWAY_DEG[1] + '°（實際最大 ' + maxA.toFixed(2) + '）');
  ok(maxStep < 1.2, '傾斜是慢慢變的（10 毫秒最多變 ' + maxStep.toFixed(2) + '°）');
  ok(T.swayAt(q, -1) === 0 && T.swayAt(q, 999) === 0, '沒有傾斜的時候是 0');
  // 魚來拉：lean／drift 的大小與方向
  q.events.forEach(e => {
    evN++;
    ok(Math.abs(e.lean) >= T.PULL_DEG[0] - 1e-2 && Math.abs(e.lean) <= T.PULL_DEG[1] + 1e-2, '魚拉的傾斜 ' + e.lean + '° 在 ' + T.PULL_DEG + ' 之間');
    ok(Math.abs(e.drift) >= T.PULL_DRIFT[0] - 1e-2 && Math.abs(e.drift) <= T.PULL_DRIFT[1] + 1e-2 && sgn(e.drift) === sgn(e.lean), '被拉開的水平位移 ' + e.drift + ' px 在 ' + T.PULL_DRIFT + ' 之間、方向跟傾斜一樣');
    if (e.lean < 0) leanL = true; else leanR = true;
    const idle = T.swayAt(q, e.t + Math.min(0.15, (e.dur || 0.3) / 2));
    if (Math.abs(idle) > 0.5) { ok(sgn(e.lean) === -sgn(idle), '魚拉的傾斜方向 ' + e.lean + ' 跟那一刻平常的傾斜 ' + idle.toFixed(2) + ' 相反'); flips++; }
  });
}
ok(anyLeft && anyRight && leanL && leanR, '左歪右歪都有（平常的傾斜、魚拉的傾斜）');
ok(new Set(gaps).size >= 20, '傾斜的間隔不固定（' + new Set(gaps).size + ' 種）');
ok(flips >= evN * 0.3, '很多動作發生時浮標本來就有點歪，魚拉的方向會跟它相反：' + flips + '／' + evN);

// ── 魚來拉：往下沉就快速翻到另一邊（只檢查窗口夠長、咬鉤曲線完整的關卡；WINDOW_S 調很短時曲線本身就不完整，見 t_fishbite.js） ──
let checked = 0;
for (let lv = 1; lv <= 40; lv++) {
  if (T.windowFor(lv) < 0.2) continue;
  for (let rep = 0; rep < 40; rep++) {
    const q = T.makeLevel(lv, rnd), b = q.bite;
    ok(T.eventAt(q, b.t) === b && T.eventAt(q, b.rec + T.RECOVER_S) === b && T.eventAt(q, b.rec + T.RECOVER_S + 0.01) === null && T.eventAt(q, 0) === null, 'eventAt：咬鉤從開始沉算到浮回原位');
    const lean = b.lean, idle0 = T.swayAt(q, b.t + 0.1), tFull = b.tp + b.desc + 0.001;
    ok(near(T.pullTiltAt(q, tFull), lean, 1e-6) && near(T.driftAt(q, tFull), b.drift, 1e-6), '整個沉下去時：傾斜 ＝ lean（' + lean + '°）、位移 ＝ drift（' + b.drift + ' px）');
    ok(Math.abs(T.pullTiltAt(q, b.tp + 0.4 * b.desc)) >= 0.6 * Math.abs(lean), '一開始沉就很快歪過去：沉到 40% 時時間才過 ' + (0.4 * b.desc).toFixed(3) + ' 秒，已經歪了 ' + (Math.abs(T.pullTiltAt(q, b.tp + 0.4 * b.desc)) / Math.abs(lean) * 100).toFixed(0) + '%');
    const idleSel = T.swayAt(q, b.t + 0.15);
    ok(T.PULL_DEG[0] > T.SWAY_DEG[1] && sgn(T.tiltAt(q, tFull)) === sgn(lean) && (Math.abs(idleSel) <= 0.5 || sgn(lean) === -sgn(idleSel)), '沉下去時總傾斜翻到 lean 那一邊（魚拉的角度 ≥ ' + T.PULL_DEG[0] + '° 一定大過平常的 ' + T.SWAY_DEG[1] + '°），而且跟平常的方向相反：平常 ' + idleSel.toFixed(1) + '° → 沉下去 ' + T.tiltAt(q, tFull).toFixed(1) + '°');
    ok(near(T.pullTiltAt(q, b.rec + T.RECOVER_S + 0.5), 0) && near(T.driftAt(q, 0), 0), '沒有動作時沒有被拉');
    q.events.slice(0, -1).forEach(e => { const tm = e.t + e.dur / 2; ok(near(T.pullTiltAt(q, tm), e.lean * Math.sqrt(T.depthAt(q, tm)), 1e-9) && Math.abs(T.pullTiltAt(q, tm)) > 0, '輕碰也一樣會歪（跟咬鉤做法相同，不是線索）'); });
    checked++;
  }
}
ok(checked >= 300, '檢查了 ' + checked + ' 關咬鉤');

// ── 浮標姿勢與水面波的來源 ──
{ const q = T.makeLevel(5, rnd), b = q.bite, t = b.tp + b.desc + 0.001, P = T.poseAt(q, t), P0 = T.poseAt(q, 0.001), S = T.FLOAT_SCALE;
  ok(near(P.dy, T.VIS * S + T.waveAt(q.wave, t), 1e-6) && T.VIS * S === 252, '整個沉下去：往下 ' + T.VIS + ' × ' + S + ' ＝ ' + (T.VIS * S) + ' px（浮標放大後，露出水面的高度也跟著放大）');
  ok(near(P0.dy, T.waveAt(q.wave, 0.001), 1e-9) && P0.dx === 0, '沒事的時候只有水面波浪的晃動');
  ok(near(T.poseAt(q, t, 1).dy, T.VIS + T.waveAt(q.wave, t), 1e-6), '放大倍率 1 時沉下去 ' + T.VIS + ' px');
  ok(near(P.deg, T.tiltAt(q, t)) && near(P.dx, T.driftAt(q, t)), '姿勢的傾斜、位移來自 tiltAt、driftAt');
  for (let i = 0; i < 400; i++) { const tt = rnd() * 12, s = T.sourceAt(q, tt); ok(Math.abs(s) <= T.WAVE_MAX + 1e-9, '水面波的來源不超過 ±' + T.WAVE_MAX + '：' + s.toFixed(1)); }
  ok(near(T.sourceAt(q, 0.001), Math.max(-T.WAVE_MAX, Math.min(T.WAVE_MAX, T.waveAt(q.wave, 0.001))), 1e-9) && T.sourceAt(q, t) > T.waveAt(q.wave, t) - 1e-9 || T.waveAt(q.wave, t) + T.WAVE_PULL * T.VIS * S >= T.WAVE_MAX, '被拉下去時，水面被帶著凹下去（來源變大）'); }

// ── 水面的波：從浮標往左右兩側傳出去 ──
{ const W = 472, wv = T.makeWaves(W), n = wv.n, fi = wv.fi, dt = 1 / 60, dx = T.WAVE_DX;
  ok(n === Math.ceil(W / dx) + 1 && wv.h.every(v => v === 0) && fi === Math.round((n - 1) / 2), '水面切成 ' + n + ' 個點、一開始是平的、浮標在中間');
  // 一次短脈衝：浮標往下拉 20 px 又回來（0.15 秒）
  const pulse = (t) => (t < 0.15 ? 20 * Math.pow(Math.sin(Math.PI * t / 0.15), 2) : 0);
  const peak = {}, arrive = {}, sym = { max: 0 }; const ks = [8, 25, 45];
  ks.forEach(k => { peak[k] = 0; arrive[k] = 0; });
  let early = 0, late = 0;
  for (let t = 0, i = 0; t < 8; t += dt, i++) {
    T.stepWaves(wv, dt, pulse(t));
    ks.forEach(k => { const a = Math.abs(wv.h[fi + k]); if (a > peak[k]) { peak[k] = a; arrive[k] = t; } });
    for (let k = 1; k < 55; k++) sym.max = Math.max(sym.max, Math.abs(wv.h[fi + k] - wv.h[fi - k]));
    if (t > 1.6 && t < 3) late = Math.max(late, Math.abs(wv.h[fi + 10]));
    if (t < 0.12) early = Math.max(early, Math.abs(wv.h[fi + 25]));
  }
  ok(sym.max < 1e-6, '左右兩側完全對稱（最大差 ' + sym.max.toExponential(1) + '）');
  ks.forEach(k => { const lag = arrive[k] - 0.075, want = Math.max(0.03, (k * dx - 18) / T.WAVE_C); ok(Math.abs(lag - want) <= 0.15, '波傳到 ' + k * dx + ' px 外的時間 ' + lag.toFixed(2) + ' 秒 ≈ （距離 − 浮標拉水面的範圍約 18 px）÷ 波速 ' + want.toFixed(2) + ' 秒'); });
  ok(early < 0.03 * 20, '波還沒傳到的時候，遠處是平的（' + early.toFixed(2) + ' px）');
  ok(peak[8] > peak[25] && peak[25] > peak[45] && peak[45] > 0.5, '離浮標越遠波越小、但整個畫面都傳得到：' + ks.map(k => k * dx + 'px:' + peak[k].toFixed(1)).join('、'));
  ok(late < 0.1 * peak[8], '波不會從邊緣彈回來（浮標旁 1.6 秒之後只剩 ' + late.toFixed(2) + ' px，原本 ' + peak[8].toFixed(1) + ' px）');
  ok(wv.h.every(v => Math.abs(v) < 0.2), '浮標不動之後，水面慢慢平靜（8 秒後最大 ' + Math.max(...wv.h.map(Math.abs)).toFixed(3) + ' px）');
  // 持續的上下晃動（水面波浪）：兩側都有波形，距離越遠相位越晚、振幅越小
  const wv2 = T.makeWaves(W), A = 10, f = 0.7; let amp25 = 0, amp45 = 0, ampL = 0, ampR = 0;
  for (let t = 0; t < 12; t += dt) { T.stepWaves(wv2, dt, A * Math.sin(2 * Math.PI * f * t)); if (t > 8) { amp25 = Math.max(amp25, Math.abs(wv2.h[fi + 25])); amp45 = Math.max(amp45, Math.abs(wv2.h[fi + 45])); ampL = Math.max(ampL, Math.abs(wv2.h[fi - 30])); ampR = Math.max(ampR, Math.abs(wv2.h[fi + 30])); } }
  ok(amp25 > 0.4 * A && amp25 < A * 1.05 && amp45 > 0.2 * A && amp45 < amp25, '持續晃動時，水面線在 100 px 處 ' + amp25.toFixed(1) + ' px、180 px 處 ' + amp45.toFixed(1) + ' px（原本 ' + A + ' px）：從浮標往兩側延展、越遠越小');
  ok(near(ampL, ampR, 1e-6), '左右兩側一樣');
  // 很用力地晃 60 秒也不會算爆
  const wv3 = T.makeWaves(W); let mx = 0, fin = true;
  for (let t = 0; t < 60; t += dt) { T.stepWaves(wv3, dt, (Math.floor(t * 6.6) % 2 ? 1 : -1) * T.WAVE_MAX); wv3.h.forEach(v => { if (!isFinite(v)) fin = false; mx = Math.max(mx, Math.abs(v)); }); }
  ok(fin && mx <= 2 * T.WAVE_MAX, '用力晃 60 秒也穩定：最大 ' + mx.toFixed(1) + ' px（上限 ' + 2 * T.WAVE_MAX + '）');
  // 一個畫面特別久（卡頓 50 毫秒）也不會算歪
  const wv4 = T.makeWaves(W); for (let i = 0; i < 100; i++) T.stepWaves(wv4, 0.05, i % 2 ? 20 : -20); ok(wv4.h.every(v => isFinite(v) && Math.abs(v) <= 2 * T.WAVE_MAX), 'dt ＝ 0.05 秒（卡頓）也穩定'); }

// ── 浮標帶動水面的那一點（彈簧）：慢慢動就跟著走，猛拉一下會晃幾下 ──
{ const dt = 1 / 60, st = T.makeSource();
  for (let t = 0; t < 6; t += dt) T.stepSource(st, dt, 20);
  ok(near(st.x, 20, 0.2) && Math.abs(st.v) < 0.5, '目標不變就停在目標：' + st.x.toFixed(2));
  // 突然拉下去 30 px：先衝過頭、再來回晃、逐漸變小
  const s2 = T.makeSource(); const xs = []; for (let t = 0; t < 3; t += dt) xs.push(T.stepSource(s2, dt, 30));
  const over = Math.max(...xs); let cross = 0; for (let i = 1; i < xs.length; i++) if ((xs[i - 1] - 30) * (xs[i] - 30) < 0) cross++;
  ok(over > 30 * 1.4 && over < 30 * 1.9, '猛拉一下，水面衝過頭到 ' + over.toFixed(1) + ' px（目標 30）');
  ok(cross >= 5, '來回晃了 ' + cross + ' 次才停（一圈一圈的水波）');
  ok(Math.abs(xs[xs.length - 1] - 30) < 3, '3 秒後幾乎停了：' + xs[xs.length - 1].toFixed(2));
  // 水面波浪（慢慢上下）：跟著走，振幅不會被放大太多
  const s3 = T.makeSource(); let mx = 0; for (let t = 0; t < 20; t += dt) { const v = T.stepSource(s3, dt, 10 * Math.sin(2 * Math.PI * 0.7 * t)); if (t > 10) mx = Math.max(mx, Math.abs(v)); }
  ok(mx > 8 && mx < 18, '0.7 Hz 的水面波浪（10 px）帶動水面 ' + mx.toFixed(1) + ' px');
  // 用力亂拉 60 秒也穩定
  const s4 = T.makeSource(); let big = 0, fin = true; for (let t = 0; t < 60; t += dt) { const v = T.stepSource(s4, dt, (Math.floor(t * 5) % 2 ? 1 : -1) * T.WAVE_MAX); if (!isFinite(v)) fin = false; big = Math.max(big, Math.abs(v)); }
  ok(fin && big < T.WAVE_MAX * 2, '亂拉 60 秒也穩定：最大 ' + big.toFixed(1) + ' px');
  const s5 = T.makeSource(); T.stepSource(s5, 0.05, 30); ok(isFinite(s5.x) && Math.abs(s5.x) < 100, 'dt ＝ 0.05 秒（卡頓）也穩定'); }
// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_fishbite.js'), css = rd('../../css/games/reaction_fishbite.css').replace(/[ \t]*\/\*[\s\S]*?\*\//g, '');
  ok(/waterY = Math\.round\(H \* WATER_AT\), S = FLOAT_SCALE/.test(src), '水面位置 ＝ 畫面高度 × WATER_AT、浮標放大 FLOAT_SCALE');
  ok(/'translate\(' \+ px\.toFixed\(1\) \+ 'px,' \+ py\.toFixed\(1\) \+ 'px\) rotate\(' \+ deg\.toFixed\(2\) \+ 'deg\) scale\(' \+ S \+ '\) translate\(' \+ \(-FW \/ 2\) \+ 'px,' \+ \(-VIS\) \+ 'px\)'/.test(src), '浮標以水面那一點為軸心：先放大、再傾斜、最後移到位置');
  ok(/stepWaves\(wv, dt, stepSource\(src, dt, sourceAt\(q, t\)\)\)/.test(src) && /water\.style\.clipPath = cp/.test(src) && /wline\.setAttribute\('points'/.test(src), '每個畫面：水面的波往前算、水的上緣照波形剪、水面線畫在波形上');
  ok(!/ripple/i.test(src) && !/ripple|fishbite-surface/.test(css), '舊的「一圈半透明白線」波紋圈與固定的水面線拿掉了');
  ok(/\.fishbite-wave__line\s*\{[^}]*stroke:\s*var\(--fbt-surface\)/.test(css) && /\.fishbite-float\s*\{[^}]*transform-origin:\s*0 0/.test(css) && /\.fishbite-water\s*\{[^}]*var\(--fbt-water-top\)/.test(css), '水面線、浮標軸心、水的顏色在 css');
  ok(/info\.style\.top = '54px'/.test(src) && /top:' \+ \(waterY \+ 8\)/.test(src), '結果文字放到上方、折線圖放進水面下方');
  ok(/var VIS = 84, FW = 36;/.test(src) && /\.fishbite-float__top\s*\{[^}]*width:\s*36px/.test(css) && /\.fishbite-float__body\s*\{[^}]*top:\s*84px/.test(css), '浮標沒放大前的尺寸（露出 84、寬 36）跟 css 一致'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
