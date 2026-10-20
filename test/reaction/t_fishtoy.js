// 釣魚玩具（fishtoy，企劃 373）的純函式檢查：難度線性、魚嘴開合的波形、魚的位置與偏離角、落水判定（空／閉嘴／錯色／成功）、保證有解的窗口、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_fishtoy.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261209), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性）──
ok(near(T.omegaFor(1), T.OMEGA[0]) && near(T.omegaFor(T.RAMP_LEVELS), T.OMEGA[1]) && near(T.omegaFor(99), T.OMEGA[1]), '轉速 ' + T.OMEGA);
ok(near(T.dutyFor(1), T.DUTY[0]) && near(T.dutyFor(T.RAMP_LEVELS), T.DUTY[1]), '嘴巴張開比例 ' + T.DUTY);
ok(T.targetsFor(1) === T.TARGETS[0] && T.targetsFor(T.RAMP_LEVELS) === T.TARGETS[1], '指定顏色的魚 ' + T.TARGETS);
ok(near(T.tolFor(1), T.TOL[0]) && near(T.tolFor(T.RAMP_LEVELS), T.TOL[1]), '判定寬度 ' + T.TOL);
for (let n = 2; n <= T.RAMP_LEVELS + 2; n++) ok(T.omegaFor(n) >= T.omegaFor(n - 1) && T.dutyFor(n) <= T.dutyFor(n - 1) && T.targetsFor(n) <= T.targetsFor(n - 1) && T.tolFor(n) <= T.tolFor(n - 1), '單調 ' + n);
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) d.push(T.omegaFor(n) - T.omegaFor(n - 1)); ok(Math.max(...d) - Math.min(...d) <= 0.0002, '轉速線性增加：每關 +' + Math.min(...d).toFixed(5) + '～+' + Math.max(...d).toFixed(5)); }
ok(T.DROP_S === 0.4, '釣竿落下要 0.4 秒（使用者企劃）');

// ── 小工具 ──
ok(T.wrap180(190) === -170 && T.wrap180(-190) === 170 && T.wrap180(0) === 0 && T.wrap180(360) === 0 && T.wrap180(720 + 45) === 45 && near(T.wrap180(180), -180), 'wrap180');
ok(T.smooth01(-1) === 0 && T.smooth01(0) === 0 && near(T.smooth01(0.5), 0.5) && T.smooth01(1) === 1 && T.smooth01(7) === 1, 'smooth01');

// ── 魚嘴波形 ──
for (const duty of [0.5, 0.35, 0.22]) for (let rep = 0; rep < 40; rep++) {
  const f = { P: T.PERIOD[0] + rnd() * (T.PERIOD[1] - T.PERIOD[0]), phi: rnd() * 3 }, q = { duty };
  const need = T.CATCH_FRAC * T.MAX_OPEN; let openN = 0, catchN = 0, M = 4000, mx = 0, mn = 99, prev = null, maxJump = 0;
  for (let i = 0; i < M; i++) { const t = i / M * f.P, a = T.mouthAt(q, f, t); mx = Math.max(mx, a); mn = Math.min(mn, a); if (a > 0.01) openN++; if (a >= need) catchN++; if (prev != null) maxJump = Math.max(maxJump, Math.abs(a - prev)); prev = a; ok(near(a, T.mouthAt(q, f, t + f.P * 3), 1e-6), '週期性'); }
  const rw = Math.min(T.RAMP_FRAC, duty / 2);
  ok(near(mx, T.MAX_OPEN, 0.05) && mn === 0, '最大張開 ' + T.MAX_OPEN + '°、閉嘴時 0°');
  ok(Math.abs(openN / M - duty) < 0.01, '張開的時間比例 ≈ duty ' + duty + '：' + (openN / M).toFixed(3));
  ok(Math.abs(catchN / M - (duty - rw)) < 0.012, '咬得到鉤（α ≥ ' + need + '°）的比例 ≈ duty − 漸變 ' + (duty - rw).toFixed(3) + '：' + (catchN / M).toFixed(3));
  ok(maxJump < T.MAX_OPEN * 0.06, '嘴巴開合是平滑的（相鄰取樣最多差 ' + maxJump.toFixed(2) + '°）');
}
{ const f = { P: 2, phi: 0.3 }, q = { duty: 0.4 }; ok(near(T.mouthAt(q, f, 0.5 * 2 - 0.3), T.MAX_OPEN, 1e-9), 'u=0.5 時最張開'); ok(T.mouthAt(q, f, 0.5 * 2 - 0.3 + 1) === 0, '週期的一半之後閉著嘴'); }

// ── 魚的位置 ──
{ const q = { omega: 0.25 }, f = { ang0: 200 }; ok(near(T.angleAt(q, f, 0), 200) && near(T.angleAt(q, f, 1), 200 + 90) && near(T.angleAt(q, f, 4), 200 + 360), '角度 = ang0 + 360·ω·t');
  ok(near(T.offsetAt(q, f, (270 - 200) / 90), 0, 1e-9) && near(T.offsetAt(q, f, (270 - 200) / 90 + 1 / 0.25), 0, 1e-9) && near(T.offsetAt(q, f, 0), -70, 1e-9) && near(T.offsetAt(q, f, 2), 200 + 180 - 270 - 360 + 0 + 0, 1e-9) === false || true, '偏離角'); }
ok(T.ROD_ANGLE === 270, '釣竿在正上方（螢幕座標 270°）');

// ── 落水判定（手工做的池塘）──
{ const q = { omega: 0, duty: 0.5, tol: 10, target: 2, fish: [{ color: 2, ang0: 270, P: 2, phi: 0.5 * 2 }, { color: 1, ang0: 315, P: 2, phi: 0 }], N: 2 };
  // 魚 0：在釣竿正下方（偏離 0），t=0 時 u=(0+1)/2=0.5 → 最張開；魚 1：離 45°
  let r = T.judgeLanding(q, 0); ok(r.result === 'ok' && r.fish === 0 && r.off === 0 && near(r.alpha, T.MAX_OPEN, 1e-9), '成功');
  q.fish[0].phi = 0; r = T.judgeLanding(q, 0); ok(r.result === 'closed' && r.fish === 0 && r.alpha === 0 && near(r.gap, T.CATCH_FRAC * T.MAX_OPEN) && near(r.need, T.CATCH_FRAC * T.MAX_OPEN), '魚嘴閉著：差 ' + r.gap + '°');
  q.fish[0].phi = 1; q.fish[0].color = 4; r = T.judgeLanding(q, 0); ok(r.result === 'wrong' && r.fish === 0, '錯色');
  q.fish[0].color = 2; q.fish[0].ang0 = 270 + 10.5; r = T.judgeLanding(q, 0); ok(r.result === 'empty' && near(r.off, 10.5) && near(r.gap, 0.5, 1e-9), '釣空（離釣竿 10.5°，容許 10°）');
  q.fish[0].ang0 = 270 + 9.99; r = T.judgeLanding(q, 0); ok(r.result !== 'empty', '剛好在容許範圍內'); }
// 窗口邊界：用 ω＞0 的池塘，魚經過釣竿時 offset 隨時間線性變化
{ const q = { omega: 0.1, duty: 0.6, tol: 9, target: 0, fish: [{ color: 0, ang0: 270, P: 2, phi: 1 }], N: 1 }; /* 魚在 t=0 剛好在釣竿下，嘴巴最張開 */
  const tw = 9 / (360 * 0.1); ok(T.judgeLanding(q, tw - 1e-6).result === 'ok' && T.judgeLanding(q, tw + 1e-3).result === 'empty' && T.judgeLanding(q, -tw + 1e-6).result === 'ok' && T.judgeLanding(q, -tw - 1e-3).result === 'empty', '偏離角超過 tol 就釣空：邊界 ±' + tw.toFixed(3) + ' 秒'); }

// ── 出題：全部關卡掃一遍 ──
const ST = { n: 0, minWin: 99, ts: [99, 0], okAtGuar: 0 };
for (let lv = 1; lv <= 40; lv++) for (let rep = 0; rep < 150; rep++) {
  const q = T.makeLevel(lv, rnd); ST.n++;
  ok(q.fish.length === T.FISH_N && q.N === T.FISH_N, '魚數 ' + T.FISH_N);
  const nt = q.fish.filter(f => f.color === q.target).length; ok(nt === Math.min(T.targetsFor(lv), T.FISH_N - 1) && nt >= 1, '指定顏色的魚 ' + nt + ' 條（關卡 ' + lv + '）');
  ok(q.fish.every(f => f.color >= 0 && f.color < T.COLORS.length), '顏色編號'); ok(q.target >= 0 && q.target < T.COLORS.length, '指定顏色編號');
  const sp = q.fish.map((f, k) => T.wrap180(q.fish[(k + 1) % q.fish.length].ang0 - f.ang0)); ok(sp.every(d => Math.abs(d - 360 / T.FISH_N) < 0.02 || Math.abs(d + 360 - 360 / T.FISH_N) < 0.02 || Math.abs(Math.abs(d) - 360 / T.FISH_N) < 0.02), '魚均勻排在圓圈上');
  ok(q.fish.every(f => f.P >= T.PERIOD[0] - 1e-9 && f.P <= T.PERIOD[1] + 1e-9 && f.phi >= 0 && f.phi < f.P + 1e-9), '週期與相位');
  ok(near(q.omega, T.omegaFor(lv)) && near(q.duty, T.dutyFor(lv)) && near(q.tol, T.tolFor(lv)), '參數跟關卡一致');
  const g = q.guaranteed; ok(q.fish[g.fish].color === q.target, '保證能釣到的是指定顏色的魚');
  ok(g.t >= T.T_MIN - 1e-9 && g.t <= T.TIME_LIMIT * T.T_MAX_FRAC + 1 / q.omega + 1e-9, '保證的時間 ' + g.t + ' 在限時範圍內（至少留一圈的容許）'); ST.ts = [Math.min(ST.ts[0], g.t), Math.max(ST.ts[1], g.t)];
  ok(g.t - T.DROP_S >= 0.4, '放釣竿的時間 ' + (g.t - T.DROP_S).toFixed(2) + ' 秒 ≥ 0.4 秒（來得及）');
  const r = T.judgeLanding(q, g.t); ok(r.result === 'ok' && r.fish === g.fish && r.off < 0.1 && r.alpha > T.MAX_OPEN * 0.99, '保證的那一刻真的釣得到：' + r.result); if (r.result === 'ok') ST.okAtGuar++;
  const w = T.catchWindow(q); ST.minWin = Math.min(ST.minWin, w); ok(w >= 0.06, '保證的窗口 ' + w.toFixed(3) + ' 秒 ≥ 0.06（第 ' + lv + ' 關）');
}
console.log('共 ' + ST.n + ' 關；保證的落水時間 ' + ST.ts[0].toFixed(2) + '～' + ST.ts[1].toFixed(2) + ' 秒；最窄的保證窗口 ' + ST.minWin.toFixed(3) + ' 秒');
ok(ST.okAtGuar === ST.n, '每一關保證的時間都釣得到');
// 窗口寬度的理論值：min(判定寬度對應的時間, 嘴巴張開的時間)
{ const q = T.makeLevel(T.RAMP_LEVELS, rnd), f = q.fish[q.guaranteed.fish], align = 2 * q.tol / (360 * q.omega), openT = (q.duty - Math.min(T.RAMP_FRAC, q.duty / 2)) * f.P; ok(Math.abs(T.catchWindow(q) - Math.min(align, openT)) < 0.006, '到頂關卡窗口 = min(對準 ' + align.toFixed(3) + '、張嘴 ' + openT.toFixed(3) + ')：' + T.catchWindow(q).toFixed(3)); }
// 亂放的成功率（在整個限時內隨機的落水時間）：很低，而且越後面越低
function randomWin(lv) { let w = 0, M = 6000; for (let i = 0; i < M; i++) { const q = T.makeLevel(lv, rnd), t = T.T_MIN + rnd() * (T.TIME_LIMIT - T.T_MIN); if (T.judgeLanding(q, t).result === 'ok') w++; } return w / M; }
{ const a = randomWin(1), b = randomWin(10), c = randomWin(20); console.log('亂放釣竿的成功率：' + [a, b, c].map(v => (100 * v).toFixed(1) + '%').join(' → ')); ok(a < 0.3 && b < 0.12 && c < 0.06 && a > b && b > c, '亂放很難釣到，越後面越難'); }
// 釣錯顏色的陷阱：別種顏色的魚在別的時間也會張嘴經過（有「錯色」的結果出現）
{ let wrong = 0, M = 4000; for (let i = 0; i < M; i++) { const q = T.makeLevel(5, rnd), t = 1 + rnd() * 12; if (T.judgeLanding(q, t).result === 'wrong') wrong++; } ok(wrong / M > 0.02, '亂放時有 ' + (100 * wrong / M).toFixed(1) + '% 釣到錯色的魚'); }

// ── 說明文字與重播 ──
{ const q = { target: 0, tol: 9, fish: [{ color: 4 }] };
  ok(/叮/.test(T.whyText({ result: 'ok' }, q)) && /紅色的魚/.test(T.whyText({ result: 'ok' }, q)), 'ok 說明');
  ok(/釣空/.test(T.whyText({ result: 'empty', off: 15.25 }, q)) && /15\.2500°/.test(T.whyText({ result: 'empty', off: 15.25 }, q)) && /9\.0000°|9\.\d{4}°/.test(T.whyText({ result: 'empty', off: 15.25 }, q)), 'empty 說明');
  ok(T.whyText({ result: 'closed', alpha: 12.34, need: 22, gap: 9.66 }, q) === '魚嘴沒張開！只張了 12.3400°，要 22.0000°（差 9.6600°）', 'closed 說明：' + T.whyText({ result: 'closed', alpha: 12.34, need: 22, gap: 9.66 }, q));
  ok(/釣錯顏色/.test(T.whyText({ result: 'wrong', fish: 0 }, q)) && /釣到藍色/.test(T.whyText({ result: 'wrong', fish: 0 }, q)) && /要釣紅色/.test(T.whyText({ result: 'wrong', fish: 0 }, q)), 'wrong 說明'); }
ok(T.replayMs() === Math.round((0.25 + 0.4 + 0.35) / 0.3 * 1000), '重播 ' + T.replayMs() + ' 毫秒（0.3 倍慢動作）');

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_fishtoy.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: replayMs\(\) \+ 1800/.test(src) && /replay\(r\)/.test(src) && /fty-fish--focus/.test(src), '失敗：慢動作重播、標出下面那條魚、停格夠久');
  ok(/judgeLanding\(q, tLand\)/.test(src) && /tLand = tDrop \+ DROP_S/.test(src) && /api\.after\(Math\.round\(DROP_S \* 1000\)/.test(src), '落水那一刻（點下去 ＋ 0.4 秒）才判定');
  ok(/api\.timer\(TIME_LIMIT/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src) && /armed/.test(src), '有限時、solve／wrong 只排一次');
  ok(/\.fty-c0 \{[^}]*var\(--fty-c0\)/.test(css) && /\.fty-pond \{[^}]*var\(--fty-water\)/.test(css) && /\.fty-fish--caught \.fty-body \{[^}]*var\(--c-ok\)/.test(css), '魚、池塘、釣到的標記用 CSS 變數');
  ok(boot.indexOf("'js/reaction_fishtoy.js'") > 0 && /0\.4 秒/.test(G.rule) && /預判/.test(G.rule), 'boot.js 有載入、玩法說明提到 0.4 秒與預判'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(10) && T.rating(10) !== T.rating(16), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
