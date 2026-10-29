// 釣魚提竿（fishbite，企劃 361）的純函式檢查：難度線性、時間表（輕碰＋咬鉤）、深度曲線與判定一致（沉到 0.9 以下＝窗口）、往上滑判定、折線圖與重播、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_fishbite.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261205), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性）──
ok(near(T.windowFor(1), T.WINDOW_S[0]) && near(T.windowFor(T.RAMP_LEVELS), T.WINDOW_S[1]) && near(T.windowFor(99), T.WINDOW_S[1]), '咬鉤窗口 ' + T.WINDOW_S + ' 秒');
ok(near(T.fakeHiFor(1), T.FAKE_HI[0]) && near(T.fakeHiFor(T.RAMP_LEVELS), T.FAKE_HI[1]), '輕碰深度上限 ' + T.FAKE_HI);
ok(T.fakesFor(1) === T.FAKES[0] && T.fakesFor(T.RAMP_LEVELS) === T.FAKES[1], '輕碰次數 ' + T.FAKES);
ok(near(T.waveFor(1), T.WAVE_PX[0]) && near(T.waveFor(T.RAMP_LEVELS), T.WAVE_PX[1]), '波浪振幅 ' + T.WAVE_PX);
ok(T.FAKE_HI[1] < T.BITE_LINE && T.FAKE_HI[0] < T.FAKE_HI[1], '輕碰再深也到不了咬鉤線 ' + T.BITE_LINE);
for (let n = 2; n <= T.RAMP_LEVELS + 2; n++) ok(T.windowFor(n) <= T.windowFor(n - 1) && T.fakeHiFor(n) >= T.fakeHiFor(n - 1) && T.fakesFor(n) >= T.fakesFor(n - 1) && T.waveFor(n) >= T.waveFor(n - 1), '單調 ' + n);
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) d.push(T.windowFor(n - 1) - T.windowFor(n)); ok(Math.max(...d) - Math.min(...d) <= 0.002, '窗口線性縮短：每關 −' + Math.min(...d).toFixed(4) + '～−' + Math.max(...d).toFixed(4) + ' 秒'); }
ok(T.FISH.length >= 6 && new Set(T.FISH).size === T.FISH.length && T.fishFor(1) === T.FISH[0] && T.fishFor(7) === T.FISH[0] && T.fishFor(2) === T.FISH[1], '每關釣到的魚輪流');
ok(near(Math.pow(T.U_REC, 3) * 4, 1 - T.BITE_LINE, 1e-12), 'U_REC：回程曲線在 u 掉到 0.9');

// ── 出題：時間表 ──
const ST = { n: 0, maxEnd: 0, firstMin: 99, firstMax: 0, gapMin: 99, depthMax: 0 };
for (let lv = 1; lv <= 40; lv++) for (let rep = 0; rep < 100; rep++) {
  const q = T.makeLevel(lv, rnd); ST.n++;
  const ev = q.events, fakes = ev.slice(0, -1), b = ev[ev.length - 1];
  ok(ev.length === T.fakesFor(lv) + 1 && q.fakes === T.fakesFor(lv) && b === q.bite && b.kind === 'bite' && fakes.every(e => e.kind === 'fake'), '輕碰 ' + q.fakes + ' 次、最後一筆是咬鉤');
  ok(ev[0].t >= T.FIRST_AT[0] - 1e-9 && ev[0].t <= T.FIRST_AT[1] + 1e-9, '第一次動作在 ' + T.FIRST_AT + ' 秒之間：' + ev[0].t); ST.firstMin = Math.min(ST.firstMin, ev[0].t); ST.firstMax = Math.max(ST.firstMax, ev[0].t);
  const hi = T.fakeHiFor(lv);
  fakes.forEach((e, i) => {
    ok(e.dur >= T.FAKE_DUR[0] - 1e-9 && e.dur <= T.FAKE_DUR[1] + 1e-9, '輕碰持續時間');
    ok(e.depth >= 0.6 * hi - 1e-3 && e.depth <= hi + 1e-3 && e.depth < T.BITE_LINE, '輕碰深度 ' + e.depth + ' 在 [0.6hi, hi]、< ' + T.BITE_LINE); ST.depthMax = Math.max(ST.depthMax, e.depth);
    const nextT = (ev[i + 1]).t, gap = nextT - (e.t + e.dur); ok(gap >= T.GAP[0] - 1e-3 && gap <= T.GAP[1] + 1e-3, '兩次動作之間隔 ' + gap.toFixed(2)); ST.gapMin = Math.min(ST.gapMin, gap);
  });
  ok(near(b.tEnd - b.t90, q.window, 1e-9) && near(q.window, T.windowFor(lv)), '窗口長度 = tEnd − t90 = ' + q.window);
  ok(b.t90 > b.t && b.t90 - b.t < T.DESC_S && b.rec > b.t + T.DESC_S && b.rec < b.tEnd, '咬鉤的順序：開始沉 < 沉到 0.9 < 沉到底 < 開始回浮 < 回到 0.9：' + [b.t, b.t90, b.t + T.DESC_S, b.rec, b.tEnd].map(v => v.toFixed(3)));
  ST.maxEnd = Math.max(ST.maxEnd, b.tEnd + T.RECOVER_S);
  ok(q.wave.A === T.waveFor(lv) && q.wave.f1 > 0 && q.wave.f2 > 0, '波浪參數');
}
console.log('共 ' + ST.n + ' 關；第一次動作 ' + ST.firstMin.toFixed(2) + '～' + ST.firstMax.toFixed(2) + ' 秒；一關最久 ' + ST.maxEnd.toFixed(1) + ' 秒；輕碰最深 ' + ST.depthMax.toFixed(3));
ok(ST.maxEnd <= 18, '一關不會拖太久：' + ST.maxEnd.toFixed(1) + ' 秒');
ok(ST.depthMax < T.BITE_LINE, '所有輕碰都沒到咬鉤線');

// ── 深度曲線與判定一致：「提竿瞬間浮標沉在 0.9 以下」＝窗口 ──
for (const lv of [1, 5, 10, 20, 30]) for (let rep = 0; rep < 60; rep++) {
  const q = T.makeLevel(lv, rnd), b = q.bite, end = b.tEnd + T.RECOVER_S + 1;
  let prev = null, maxSlope = 0, inWinCount = 0;
  for (let t = 0; t <= end; t += 0.001) {
    const d = T.depthAt(q, t); ok(d >= 0 && d <= 1 + 1e-9, '深度在 0～1');
    if (prev != null) maxSlope = Math.max(maxSlope, Math.abs(d - prev));
    prev = d;
    const nearEdge = Math.abs(t - b.t90) < 0.0015 || Math.abs(t - b.tEnd) < 0.0015;
    if (!nearEdge) { const deep = d >= T.BITE_LINE, win = T.judgeSwipe(q, t) === 'ok'; if (deep !== win) { ok(false, 'lv' + lv + ' t=' + t.toFixed(3) + '：深度 ' + d.toFixed(3) + '，判定 ' + T.judgeSwipe(q, t)); break; } }
    if (T.judgeSwipe(q, t) === 'ok') inWinCount++;
  }
  ok(maxSlope < 0.032, '深度曲線連續（1 毫秒內最多變 ' + maxSlope.toFixed(4) + '）');
  ok(Math.abs(inWinCount / 1000 - q.window) < 0.003, '判定為 ok 的總時間 ≈ 窗口：' + (inWinCount / 1000).toFixed(3) + ' vs ' + q.window);
  ok(near(T.depthAt(q, b.t90), T.BITE_LINE, 1e-6) && near(T.depthAt(q, b.tEnd), T.BITE_LINE, 1e-6), '窗口兩端深度剛好是 0.9');
  ok(T.depthAt(q, b.t + T.DESC_S + 0.001) > 0.999 && T.depthAt(q, (b.t + T.DESC_S + b.rec) / 2) > 0.999, '咬鉤時浮標整個沉下去（深度 1.0）');
  ok(T.depthAt(q, 0) === 0 && T.depthAt(q, b.tEnd + T.RECOVER_S + 0.5) === 0, '沒事的時候浮在原位');
  q.events.slice(0, -1).forEach(e => { let mx = 0; for (let t = e.t; t <= e.t + e.dur; t += 0.002) mx = Math.max(mx, T.depthAt(q, t)); ok(near(mx, e.depth, 0.002), '輕碰的最深處 = depth'); ok(T.judgeSwipe(q, e.t + e.dur / 2) === 'early', '輕碰的時候提竿＝太早'); });
}
{ const q = T.makeLevel(5, rnd), b = q.bite;
  ok(T.judgeSwipe(q, 0) === 'early' && T.judgeSwipe(q, b.t90 - 0.001) === 'early' && T.judgeSwipe(q, b.t) === 'early', '剛開始沉、還沒到 0.9 就提＝太早');
  ok(T.judgeSwipe(q, b.t90) === 'ok' && T.judgeSwipe(q, (b.t90 + b.tEnd) / 2) === 'ok' && T.judgeSwipe(q, b.tEnd) === 'ok', '窗口內＝成功');
  ok(T.judgeSwipe(q, b.tEnd + 0.001) === 'late' && T.judgeSwipe(q, b.tEnd + 3) === 'late', '窗口後＝太慢'); }

// ── 水面波浪 ──
for (let i = 0; i < 200; i++) { const w = { A: 2 + rnd() * 6, f1: 0.55 + rnd() * 0.3, f2: 1.3 + rnd() * 0.6, p1: rnd() * 6.28, p2: rnd() * 6.28 }; let mx = 0; for (let t = 0; t < 20; t += 0.05) mx = Math.max(mx, Math.abs(T.waveAt(w, t))); ok(mx <= w.A + 1e-9 && mx > w.A * 0.4, '波浪振幅不超過 A：' + mx.toFixed(2) + '／' + w.A.toFixed(2)); }

// ── 往上滑 ──
ok(T.isUpSwipe(0, -60) && !T.isUpSwipe(0, -49) && T.isUpSwipe(0, -50) && T.isUpSwipe(40, -60) && T.isUpSwipe(-40, -60) && !T.isUpSwipe(80, -60) && !T.isUpSwipe(0, 60) && !T.isUpSwipe(60, 0) && !T.isUpSwipe(0, 0), '往上滑的判定');
ok(T.isUpSwipe(0, -20, 15) && !T.isUpSwipe(0, -14, 15), '可以指定最短位移');
{ let up = 0; for (let a = 0; a < 360; a++) { const r = a * Math.PI / 180; if (T.isUpSwipe(100 * Math.cos(r), -100 * Math.sin(r))) up++; } ok(up >= 95 && up <= 110, '往上的扇形約 ' + up + '°（偏離正上方 ±51° 內）'); }

// ── 折線圖與重播 ──
for (let rep = 0; rep < 100; rep++) {
  const q = T.makeLevel(1 + (rep % 25), rnd), total = q.bite.tEnd + T.RECOVER_S + 0.6, pts = T.chartPoints(q, 0, total, 440, 150, 240).split(' ').map(p => p.split(',').map(Number));
  ok(pts.length === 241 && pts[0][0] === 0 && near(pts[240][0], 440, 0.06), '折線圖 241 個點、x 從 0 到 w');
  ok(pts.every(p => p[1] >= 0 && p[1] <= 150.0001), 'y 在 0～h 之內');
  ok(Math.max(...pts.map(p => p[1])) >= 150 * 0.98, '咬鉤時折線一路沉到底');
  const rg = T.replayRange(q), ms = T.replayMs(q);
  ok(rg.t0 >= 0 && rg.t0 <= q.bite.t && rg.t1 > q.bite.tEnd + T.RECOVER_S, '重播範圍包含整個咬鉤');
  ok(ms === Math.round((rg.t1 - rg.t0) / T.REPLAY_SPEED * 1000) && ms >= 2000 && ms <= 7000, '重播時間 ' + ms + ' 毫秒（0.5 倍慢動作）');
}

// ── 說明文字 ──
{ const q = T.makeLevel(3, rnd); ok(/太早/.test(T.whyText('early', q)) && /太慢/.test(T.whyText('late', q)) && new RegExp(q.window.toFixed(2)).test(T.whyText('late', q)) && T.whyText('ok', q).includes(q.fish), 'whyText'); }

// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_fishbite.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: replayMs\(q\) \+ 1500/.test(src) && /showReplay\(kind, t\)/.test(src) && /chartPoints\(q, 0, total/.test(src) && /fbt-chart__you/.test(src), '失敗：折線圖＋咬鉤區＋你提竿的位置＋慢動作重播、停格夠久');
  ok(/judgeSwipe\(q, t\)/.test(src) && /api\.after\(Math\.round\(\(q\.bite\.tEnd \+ LATE_GRACE\)/.test(src) && /isUpSwipe/.test(src), '判定用 judgeSwipe、太慢用計時器、提竿用 isUpSwipe');
  ok(/api\.solve = /.test(src) && /api\.wrong = /.test(src) && /armed/.test(src), 'solve／wrong 自己排時間（只排一次）');
  ok(/\.fbt-water \{[^}]*var\(--fbt-water-top\)/.test(css) && /\.fbt-float__top \{[^}]*var\(--fbt-float-red\)/.test(css) && /\.fbt-chart__curve \{[^}]*var\(--fbt-curve\)/.test(css) && /\.fbt-fc0 \{[^}]*var\(--fbt-fish0\)/.test(css) && /\.fbt-clip \{[^}]*overflow: hidden/.test(css), '水、浮標、折線圖、魚的顏色用 CSS 變數；浮標有裁切框');
  ok(boot.indexOf("'js/reaction_fishbite.js'") > 0 && /往上滑/.test(G.rule) && /輕輕碰/.test(G.rule), 'boot.js 有載入、玩法說明提到輕碰與往上滑'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(10) && T.rating(10) !== T.rating(16), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
