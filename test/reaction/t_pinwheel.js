// 轉風車（pinwheel，企劃 378「打蛋白」換主題）的純函式檢查：難度線性、手指轉速的算法（合成圓軌跡）、風車慣性與陣風、進度與危險區、「完美玩家」能過關／不動會失敗／轉太快會壞、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_pinwheel.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261212), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性）──
ok(near(T.centerFor(1), T.CENTER[0]) && near(T.centerFor(T.RAMP_LEVELS), T.CENTER[1]) && near(T.centerFor(99), T.CENTER[1]), '中心轉速 ' + T.CENTER);
ok(near(T.halfBandFor(1), T.HALF_BAND[0]) && near(T.halfBandFor(T.RAMP_LEVELS), T.HALF_BAND[1]), '範圍半寬 ' + T.HALF_BAND);
ok(near(T.holdFor(1), T.HOLD_S[0]) && near(T.holdFor(T.RAMP_LEVELS), T.HOLD_S[1]) && near(T.gustFor(1), T.GUST[0]) && near(T.gustFor(T.RAMP_LEVELS), T.GUST[1]) && near(T.limitFor(1), T.LIMIT_S[0]) && near(T.limitFor(T.RAMP_LEVELS), T.LIMIT_S[1]), '撐的秒數／陣風／限時');
for (let n = 2; n <= T.RAMP_LEVELS + 2; n++) ok(T.centerFor(n) >= T.centerFor(n - 1) && T.halfBandFor(n) <= T.halfBandFor(n - 1) && T.holdFor(n) >= T.holdFor(n - 1) && T.gustFor(n) >= T.gustFor(n - 1) && (T.LIMIT_S[1] >= T.LIMIT_S[0] ? T.limitFor(n) >= T.limitFor(n - 1) : T.limitFor(n) <= T.limitFor(n - 1)), '單調（限時 LIMIT_S 由使用者調：往變長或變短都可以，只要方向一致） ' + n);
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) d.push(T.centerFor(n) - T.centerFor(n - 1)); ok(Math.max(...d) - Math.min(...d) <= 0.0015, '中心轉速線性增加：每關 +' + Math.min(...d).toFixed(4) + '～+' + Math.max(...d).toFixed(4)); }
{ const top = T.centerFor(T.RAMP_LEVELS) * (1 + T.halfBandFor(T.RAMP_LEVELS)); console.log('到頂的轉速上緣 ' + top.toFixed(2) + ' 圈／秒' + (top >= 5 ? '（提醒：超過 5 圈／秒，手指很難畫得出來；這是使用者調的參數 CENTER，照用）' : '（手指畫得出來）')); ok(top < 12, '到頂的轉速上緣 ' + top.toFixed(2) + ' 圈／秒沒有離譜（< 12）'); }

// ── 出題 ──
for (let lv = 1; lv <= 40; lv++) { const q = T.makeLevel(lv, rnd);
  ok(near(q.center, T.centerFor(lv)) && near(q.lo, q.center * (1 - q.half), 0.0006) && near(q.hi, q.center * (1 + q.half), 0.0006) && q.lo < q.center && q.hi > q.center, '綠色範圍 ' + q.lo + '～' + q.hi);
  ok(q.breakLine > q.hi && near(q.breakLine, q.hi * T.BREAK_RATIO, 0.002) && q.maxSpeed > q.breakLine * 0.8, '紅線 ' + q.breakLine + ' > 範圍上緣 ' + q.hi + '；速度表最大刻度 ' + q.maxSpeed);
  ok(q.gust.A === T.gustFor(lv) && q.gust.f1 >= 0.35 && q.gust.f1 <= 0.6 && q.gust.f2 >= 0.9 && q.gust.f2 <= 1.5, '陣風參數'); }

// ── 手指轉速：用合成的圓軌跡驗證（取樣 60 Hz，半徑 100 px，順時針／逆時針、不同圈速）──
function circle(rev, dir, r, secs, hz, t0, cx0, cy0) { const out = [], n = Math.round(secs * hz); for (let i = 0; i <= n; i++) { const t = t0 + i / hz, a = dir * 2 * Math.PI * rev * (t - t0); out.push({ t, x: (cx0 || 0) + r * Math.cos(a), y: (cy0 || 0) + r * Math.sin(a) }); } return out; }
for (const rev of [0.5, 1, 1.5, 2, 3, 4, 5]) for (const dir of [1, -1]) {
  const s = circle(rev, dir, 100, 2, 60, 0), r = T.angularRate(s, 2);
  ok(Math.abs(r - rev) / rev < 0.02, '圈速 ' + rev + (dir > 0 ? '（順）' : '（逆）') + ' → 算出 ' + r.toFixed(3));
}
{ const s = circle(3, 1, 100, 2, 30, 0), r = T.angularRate(s, 2); ok(Math.abs(r - 3) / 3 < 0.03, '取樣 30 Hz 也算得準（3 圈／秒）：' + r.toFixed(3)); }
{ const s = circle(4, 1, 100, 2, 120, 0), r = T.angularRate(s, 2); ok(Math.abs(r - 4) / 4 < 0.02, '取樣 120 Hz：' + r.toFixed(3)); }
{ // 手指停住：最後一個點在 1 秒前 → 最近 0.3 秒沒有點 → 轉速 0
  const s = circle(3, 1, 100, 1, 60, 0); ok(T.angularRate(s, 2) === 0, '手指停住之後轉速 0'); }
{ // 手指來回晃（不是繞圈）：角度差正負抵銷 → 轉速接近 0
  const s = []; for (let i = 0; i <= 120; i++) { const t = i / 60, a = 0.5 * Math.sin(2 * Math.PI * 3 * t); s.push({ t, x: 100 * Math.cos(a), y: 100 * Math.sin(a) }); } ok(T.angularRate(s, 2) < 0.4, '左右來回晃不算繞圈：' + T.angularRate(s, 2).toFixed(3)); }
{ // 離中心太近的點不算
  const s = circle(3, 1, 20, 2, 60, 0); ok(T.angularRate(s, 2) === 0, '半徑小於 ' + T.R_MIN + ' px 的圈不算'); }
{ // 繞的不是風車中心（手指偏離中心）：只要仍然圍著中心的角度在變，就算；完全沒圍著中心的（在旁邊畫小圈）轉速很小
  const s = circle(3, 1, 30, 2, 60, 0, 120, 0); ok(T.angularRate(s, 2) < 0.5, '在風車旁邊畫小圈（沒圍著風車中心）轉速很小：' + T.angularRate(s, 2).toFixed(3)); }
{ // 跨過 ±180° 不會出現假的一整圈
  const s = [{ t: 1.9, x: -100, y: 5 }, { t: 1.95, x: -100, y: -5 }, { t: 2.0, x: -100, y: 5 }]; ok(T.angularRate(s, 2) < 0.3, '在 ±180° 附近小幅晃動不會算成一圈：' + T.angularRate(s, 2).toFixed(3)); }
// 剛開始畫的時候窗口還沒填滿，轉速偏低（不會偏高）
{ const s = circle(3, 1, 100, 0.1, 60, 1.9); ok(T.angularRate(s, 2) < 3.2, '開頭不會算過頭'); }

// ── 風車的物理 ──
{ let w = 0; for (let i = 0; i < 1000; i++) w = T.stepWheel(w, 3, 0.01, 0); ok(near(w, 3, 0.01), '沒有陣風時，轉速會追上手指轉速：' + w.toFixed(3)); }
{ let w = 0; const dt = 0.01; let t63 = null; for (let i = 1; i <= 300; i++) { w = T.stepWheel(w, 2, dt, 0); if (t63 == null && w >= 2 * 0.632) t63 = i * dt; } ok(Math.abs(t63 - T.TAU) < 0.03, '時間常數 TAU＝' + T.TAU + ' 秒：63% 在 ' + t63.toFixed(2) + ' 秒'); }
ok(T.stepWheel(0.01, 0, 0.1, -50) === 0 && T.stepWheel(1, 0, 0.01, 0) < 1, '轉速不會是負的、放手會減速');
for (let i = 0; i < 200; i++) { const g = { A: 1.2, f1: 0.35 + rnd() * 0.25, f2: 0.9 + rnd() * 0.6, p1: rnd() * 6.28, p2: rnd() * 6.28 }; let mx = 0; for (let t = 0; t < 30; t += 0.05) mx = Math.max(mx, Math.abs(T.gustAt(g, t))); ok(mx <= 1.2 + 1e-9 && mx > 0.5, '陣風不超過 A：' + mx.toFixed(3)); }
ok(T.gustAt({ A: 0, f1: 0.4, f2: 1, p1: 0, p2: 0 }, 1.3) === 0, 'A＝0 沒有陣風');

// ── 進度與危險區 ──
ok(near(T.progressStep(0, true, 0.5, 2), 0.25) && near(T.progressStep(0.5, false, 0.5, 2), 0.25) && T.progressStep(0.9, true, 1, 2) === 1 && T.progressStep(0.1, false, 1, 2) === 0, '進度：在範圍裡每秒 +1/hold、不在每秒 −DECAY/hold，夾在 0～1');
ok(near(T.breakStep(0, true, 0.3), 0.3) && near(T.breakStep(0.4, false, 0.2), 0.3) && T.breakStep(0.05, false, 1) === 0, '危險區累積：進去加、出來慢慢減');
{ const q = { lo: 2, hi: 3 }; ok(T.inBand(q, 2) && T.inBand(q, 3) && !T.inBand(q, 1.99) && !T.inBand(q, 3.01), 'inBand 含邊界'); }

// ── 純模擬：完美玩家、不動的玩家、轉太快的玩家 ──
const ST = { pass: 0, n: 0, tMax: 0, tMin: 99, none: 0, brk: 0 };
for (let lv = 1; lv <= 40; lv++) for (let rep = 0; rep < 12; rep++) {
  const q = T.makeLevel(lv, rnd);
  const good = T.simulate(q, (t, w, qq) => Math.max(0, qq.center + 3 * (qq.center - w)), 0.01);
  ST.n++; if (good.result === 'pass') ST.pass++; ST.tMax = Math.max(ST.tMax, good.t); ST.tMin = Math.min(ST.tMin, good.t);
  ok(good.result === 'pass', '完美控制器第 ' + lv + ' 關過關（結果 ' + good.result + '）');
  ok(good.t >= q.hold - 1e-6 && good.t <= q.limit - 2, '過關時間 ' + good.t.toFixed(2) + ' 秒 ≥ 要撐的 ' + q.hold + ' 秒、離限時 ' + q.limit + ' 秒還有 2 秒以上的餘裕');
  const idle = T.simulate(q, () => 0, 0.01); if (idle.result === 'time') ST.none++; ok(idle.result === 'time' && idle.progress === 0, '完全不動：時間到、進度 0');
  const fast = T.simulate(q, () => q.breakLine * 1.6, 0.01); if (fast.result === 'break') ST.brk++; ok(fast.result === 'break', '一直轉太快：風車壞掉（' + fast.result + '）');
  // 太保守（轉速設在範圍下緣以下）：進度一直是 0，時間到
  const slow = T.simulate(q, () => q.lo * 0.7, 0.01); ok(slow.result === 'time', '轉太慢：時間到');
}
console.log('完美控制器 ' + ST.pass + '／' + ST.n + ' 關都過；過關時間 ' + ST.tMin.toFixed(2) + '～' + ST.tMax.toFixed(2) + ' 秒');
// 比較粗糙的「人」：看到的轉速是 0.3 秒前的（反應時間），手指轉速每 0.15 秒隨機抖動 ±50%，用比例回饋（增益 1.5）修正。低關卡幾乎都過、最高關卡（範圍只有 ±12%）很難
function human(lv, amp, delay, gain, N) { let pass = 0; for (let i = 0; i < N; i++) { const q = T.makeLevel(lv, rnd); let jit = 1, nextJ = 0; const hist = [];
    const r = T.simulate(q, (t, w, qq) => { hist.push([t, w]); let seen = 0; for (let k = hist.length - 1; k >= 0; k--) if (hist[k][0] <= t - delay) { seen = hist[k][1]; break; }
      if (t >= nextJ) { jit = 1 + (rnd() * 2 - 1) * amp; nextJ = t + 0.15; } return Math.max(0, (qq.center + gain * (qq.center - seen)) * jit); }, 0.01); if (r.result === 'pass') pass++; } return pass / N; }
{ const a = human(1, 0.5, 0.3, 1.5, 60), b = human(10, 0.5, 0.3, 1.5, 60), c = human(T.RAMP_LEVELS, 0.5, 0.3, 1.5, 60); console.log('反應慢、手指抖 ±50% 的玩家過關率：第 1 關 ' + (100 * a).toFixed(0) + '%、第 10 關 ' + (100 * b).toFixed(0) + '%、第 ' + T.RAMP_LEVELS + ' 關 ' + (100 * c).toFixed(0) + '%');
  ok(a > 0.9 && a >= b - 0.05 && b >= c, '越後面越難（過關率遞減）'); ok(c < 0.6, '到頂的關卡（範圍只有 ±12%）對粗糙的玩家不是穩過：' + c); }
// 說明
{ const q = T.makeLevel(5, rnd); ok(/壞掉/.test(T.whyText('break', q)) && /時間到/.test(T.whyText('time', q)) && /穩穩/.test(T.whyText('pass', q)), '說明文字'); }

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_pinwheel.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 4200/.test(src) && /showChart\(kind\)/.test(src) && /pwl-chart__curve/.test(src), '失敗：轉速折線圖＋綠色範圍＋紅線、停格夠久');
  ok(/angularRate\(samples, t\)/.test(src) && /stepWheel\(w, wIn, dt/.test(src) && /progressStep\(p/.test(src) && /breakStep\(br/.test(src) && /gustAt\(q\.gust, t\)/.test(src), '畫面用的就是純函式（angularRate／stepWheel／progressStep／breakStep／gustAt）');
  ok(/pointerdown/.test(src) && /pointermove/.test(src) && /pointerup/.test(src) && /pointercancel/.test(src) && /api\.timer\(/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '畫圈用 pointer 事件；有限時；solve／wrong');
  ok(/\.pwl-blade0 \{[^}]*var\(--pwl-b0\)/.test(css) && /\.pwl-band \{[^}]*var\(--pwl-band\)/.test(css) && /\.pwl-needle--ok \{[^}]*var\(--c-ok\)/.test(css) && /\.pwl-chart__curve \{[^}]*var\(--pwl-curve\)/.test(css), '風車、速度表、折線用 CSS 變數');
  ok(boot.indexOf("'js/reaction_pinwheel.js'") > 0 && /綠色範圍/.test(G.rule) && /陣風/.test(G.rule) && /畫圈/.test(G.rule), 'boot.js 有載入、玩法說明提到畫圈、綠色範圍、陣風'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(10) && T.rating(10) !== T.rating(16), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
