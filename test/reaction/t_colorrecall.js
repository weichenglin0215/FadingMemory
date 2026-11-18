const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_colorrecall.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// HSL→RGB 已知值
const rgb = (h, s, l) => T.hslToRgb(h, s, l).map(v => Math.round(v));
ok(rgb(0, 100, 50).join() === '255,0,0' && rgb(120, 100, 50).join() === '0,255,0' && rgb(240, 100, 50).join() === '0,0,255', '紅綠藍');
ok(rgb(0, 0, 100).join() === '255,255,255' && rgb(0, 0, 0).join() === '0,0,0' && rgb(0, 0, 50).join() === '128,128,128', '白黑灰');
ok(rgb(60, 100, 50).join() === '255,255,0' && rgb(180, 100, 50).join() === '0,255,255' && rgb(300, 100, 50).join() === '255,0,255' && rgb(360, 100, 50).join() === '255,0,0', '黃青洋紅、360°＝0°');
// Lab：白 L=100、黑 L=0、紅的 Lab（約 53.2, 80.1, 67.2）
{ const w = T.rgbToLab([255, 255, 255]), k = T.rgbToLab([0, 0, 0]), r = T.rgbToLab([255, 0, 0]);
  ok(near(w[0], 100, 0.01) && Math.abs(w[1]) < 0.01 && Math.abs(w[2]) < 0.01, '白 Lab ' + w);
  ok(near(k[0], 0, 0.01), '黑 Lab ' + k);
  ok(near(r[0], 53.24, 0.1) && near(r[1], 80.09, 0.2) && near(r[2], 67.20, 0.2), '紅 Lab ' + r); }
// ΔE：相同為 0、黑白為 100、對稱、色相差越大越大（在 0～180 之間）
const c0 = { h: 30, s: 70, l: 50 };
ok(T.deltaE(c0, c0) === 0 && near(T.deltaE({ h: 0, s: 0, l: 0 }, { h: 0, s: 0, l: 100 }), 100, 0.01), 'ΔE 基本');
ok(near(T.deltaE(c0, { h: 100, s: 40, l: 60 }), T.deltaE({ h: 100, s: 40, l: 60 }, c0)), 'ΔE 對稱');
for (let d = 10; d <= 350; d += 10) ok(T.deltaE(c0, { h: c0.h + d, s: c0.s, l: c0.l }) > 1, '色相不同 ΔE > 0（HSL 的色相差與 Lab 距離不是單調關係，所以只檢查有差）');
// 橫條與數值互換
for (const dim of T.DIMS) for (let t = 0; t <= 1.0001; t += 0.1) ok(near(T.tFor(dim, T.valueAt(dim, t)), t, 1e-9), dim + ' 互換');
ok(T.valueAt('hue', 0.5) === 180 && T.valueAt('sat', 1) === 100 && T.valueAt('light', 0) === T.L_MIN && T.valueAt('light', 1) === T.L_MAX, 'valueAt 端點');
ok(T.unitsPerT('hue') === 360 && T.unitsPerT('sat') === 100 && T.unitsPerT('light') === T.L_MAX - T.L_MIN, 'unitsPerT');
// 出題：維度三種都出現、目標色在範圍內、起始值離目標夠遠、起始值在橫條範圍內
const dimSeen = {};
for (let i = 0; i < 6000; i++) {
  const q = T.makeRound(rnd); dimSeen[q.dim] = (dimSeen[q.dim] || 0) + 1;
  ok(q.target.s >= T.TARGET_S[0] && q.target.s <= T.TARGET_S[1] && q.target.l >= T.TARGET_L[0] && q.target.l <= T.TARGET_L[1] && q.target.h >= 0 && q.target.h < 360, '目標色範圍');
  const tv = q.target[{ hue: 'h', sat: 's', light: 'l' }[q.dim]];
  const diff = q.dim === 'hue' ? Math.min(Math.abs(q.start - tv), 360 - Math.abs(q.start - tv)) : Math.abs(q.start - tv);
  ok(diff >= T.START_GAP[q.dim][0] - 1e-6, q.dim + ' 起始離目標至少 ' + T.START_GAP[q.dim][0] + '：' + diff);
  const lo = q.dim === 'hue' ? 0 : (q.dim === 'sat' ? 0 : T.L_MIN), hi = q.dim === 'hue' ? 360 : (q.dim === 'sat' ? 100 : T.L_MAX);
  ok(q.start >= lo && q.start <= hi, '起始值在橫條範圍內 ' + q.dim + ' ' + q.start);
  // 另外兩個維度與目標相同（withDim 只換一個）
  const m = T.withDim(q.target, q.dim, q.start); ok(['h', 's', 'l'].filter(k => m[k] !== q.target[k]).length === 1, '只換一個維度');
}
ok(T.DIMS.every(d => dimSeen[d] > 1800), '三個維度平均出現 ' + JSON.stringify(dimSeen));
ok(T.makeRound(rnd, 'sat').dim === 'sat', '指定維度');
// 同一個維度：差越遠，ΔE 越大（單調，至少在小範圍內）
{ const q = { h: 200, s: 60, l: 50 }; for (const dim of T.DIMS) { let prev = -1; const key = { hue: 'h', sat: 's', light: 'l' }[dim]; for (let d = 0; d <= 25; d += 5) { const e = T.deltaE(q, T.withDim(q, dim, q[key] + d)); ok(e > prev - 1e-9, dim + ' 差越大 ΔE 越大'); prev = e; } } }
// ΔE 的理論上限（整個色相／彩度／明度範圍的極端組合）：有限、不超過 260（舊版曾拿它當成績範圍；現在成績是通過幾關，不再用 ΔE）
{ let worst = 0; for (let i = 0; i < 4000; i++) { const a = { h: rnd() * 360, s: rnd() * 100, l: T.L_MIN + rnd() * 60 }, b = { h: rnd() * 360, s: rnd() * 100, l: T.L_MIN + rnd() * 60 }; worst = Math.max(worst, T.deltaE(a, b)); } ok(isFinite(worst) && worst > 0 && worst <= 260, '最壞 ΔE ' + worst.toFixed(1) + ' ≤ 260'); }
// ── 關卡制（V1.57.2.0 玩家意見：改成關卡制；以前是單回合、成績＝ΔE 越小越好）──
ok(G.score.better === 'max' && G.score.decimals === 0 && G.score.format === '{v} 關' && G.score.label === '關卡' && G.score.min === 1 && G.score.max === T.MAX_LEVEL, '成績改成「通過幾關」（越大越好）：' + JSON.stringify(G.score));
ok(T.RAMP_LEVELS === 30 && T.tolFor(1) === T.TOL[0] && T.tolFor(T.RAMP_LEVELS) === T.TOL[1] && T.tolFor(T.RAMP_LEVELS + 50) === T.TOL[1], '容許色差 ' + T.TOL + '：第 1 關 ' + T.TOL[0] + ' → 第 ' + T.RAMP_LEVELS + ' 關 ' + T.TOL[1] + '（之後維持）');
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) { ok(T.tolFor(n) <= T.tolFor(n - 1), '容許色差單調變小 ' + n); d.push(T.tolFor(n - 1) - T.tolFor(n)); } ok(Math.max(...d) - Math.min(...d) <= 0.011, '容許色差線性縮小：每關 −' + Math.min(...d).toFixed(3) + '～−' + Math.max(...d).toFixed(3)); }
ok(T.TOL[1] > 0 && T.TOL[0] > T.TOL[1], '容許色差越後面越小、而且大於 0');
// 評語依通過關數分級
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(20), '評語分級（依通過幾關）');
// 接線：過關／失敗用 api.pass／api.fail（不再有 api.finish）、單回合骨架換成 kit.run、舊的最佳紀錄（ΔE）第一次進來清掉
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_colorrecall.js'), code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/kit\.run\(root, ctx, \{/.test(code) && !/kit\.single\(/.test(code) && !/api\.finish\(/.test(code) && /maxLevel: MAX_LEVEL/.test(code), '用闖關骨架 kit.run（不再是 kit.single／api.finish）');
  ok(/var pass = real <= tol \+ 1e-12;/.test(code) && /api\.pass\(\{ delay: 200 \}\)/.test(code) && /api\.fail\(\{ delay: 500, lines:/.test(code), '差異 ≤ 這一關的容許色差 → api.pass；超過 → api.fail');
  ok(/tol = tolFor\(level\)/.test(code) && /makeRound\(api\.rand\)/.test(code) && /容許差異 ≤ ' \+ tol\.toFixed\(2\)/.test(code), '每一關用自己的容許色差、題目用 api.rand、畫面上寫出容許差異');
  ok(/Reaction\.bestKey\(ID\) \+ '\.levels'/.test(code) && /UI\.store\.set\(Reaction\.bestKey\(ID\), null\)/.test(code) && /\.sync', false\)/.test(code), '成績單位改了：舊的最佳紀錄（ΔE）第一次進來清掉（含 .sync 記號），只清一次');
  ok(/api\.solve = function/.test(code) && /api\.wrong = function/.test(code) && !/G\.debug/.test(code), 'solve／wrong 掛在 api 上（kit.run 的 debug 會呼叫它們）');
  ok(/msg\.classList\.add\('colorrecall-msg--on'\)/.test(code) && /過關！/.test(code), '數字停住後，畫面寫出過關／超過容許範圍');
  ok(/過關|容許範圍/.test(G.rule) && /一關比一關小/.test(G.rule), '玩法說明提到容許範圍一關比一關小'); }
// V1.27：揭曉動畫：兩塊靠攏併齊（右塊多蓋 1px）、去掉相鄰的白框線、下方大字從 0.0000% 升到最後的色差，停 1.5 秒才結算
{ const a = T.joinPos(0), b = T.joinPos(1), W2 = 216;
  ok(a.l === 10 && a.r === 246 && b.l === 20 && b.r === 235, '靠攏的起點與終點');
  ok(b.l + W2 - b.r === 1, '併齊：右塊多蓋左塊 1px（不露細縫）');
  for (let k = 0; k <= 20; k++) { const p = T.joinPos(k / 20); ok(p.l >= 10 && p.l <= 20 && p.r <= 246 && p.r >= 235, '位置在範圍內'); }
  ok(T.fmtDiffPct(0) === '0.0000%' && T.fmtDiffPct(12.34567) === '12.3457%' && T.fmtDiffPct(3.1) === '3.1000%', '數字格式 XX.XXXX%');
  ok(T.HOLD_MS === 1500 && T.COUNT_MS >= 1500 && T.JOIN_MS >= 500, '動畫時間');
  const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_colorrecall.js'), 'utf8'), css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/games/reaction_colorrecall.css'), 'utf8');
  ok(src.indexOf("left.classList.add('colorrecall-block--join-l'); right.classList.add('colorrecall-block--join-r');") > 0 && /\.colorrecall-block--join-l \{\s*border-right-width: 0;/.test(css) && /\.colorrecall-block--join-r \{\s*border-left-width: 0;/.test(css), '左圖去掉右邊白框、右圖去掉左邊白框');
  ok(src.indexOf('big.textContent = fmtDiffPct(real * e)') > 0 && src.indexOf('my.after(HOLD_MS') > src.indexOf('big.textContent = fmtDiffPct(real * e)'), '大字從 0 升到色差，停住後才結算'); }
// 玩家意見（V1.57.2.0）：橘色圓鈕要跟手指一對一（以前用 kit.dragDamp 打折，圓鈕比手指少動、像延遲）
{ const x0 = 46, W = 380;
  // 按在圓鈕正中央（off＝0）：圓鈕中心就在手指底下
  ok(near(T.tAtFinger(x0 + 0.3 * W, 0, x0, W), 0.3) && near(T.tAtFinger(x0, 0, x0, W), 0) && near(T.tAtFinger(x0 + W, 0, x0, W), 1), '手指在 x → 圓鈕中心就在 x（橫條兩端、中間都對）');
  // 按在圓鈕邊緣（off＝12px）：保持相對位置，按下去那一刻圓鈕不會跳
  ok(near(T.tAtFinger(x0 + 0.5 * W + 12, 12, x0, W), 0.5), '按在圓鈕邊緣：按下去那一刻圓鈕不動，之後保持相對位置');
  // 手指移動 d px，圓鈕就移動 d px（不管快慢）
  let allEq = true; for (let k = 0; k < 200; k++) { const off = (rnd() - 0.5) * 60, a = 100 + rnd() * 200, d = (rnd() - 0.5) * 80, t1 = T.tAtFinger(a, off, x0, W), t2 = T.tAtFinger(a + d, off, x0, W); if (t1 > 0 && t1 < 1 && t2 > 0 && t2 < 1 && !near((t2 - t1) * W, d, 1e-6)) allEq = false; }
  ok(allEq, '手指移動 d px，圓鈕就移動 d px（一對一，沒有打折）');
  ok(T.tAtFinger(x0 - 50, 0, x0, W) === 0 && T.tAtFinger(x0 + W + 50, 0, x0, W) === 1, '手指拖出橫條兩端：圓鈕停在端點');
  const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), code = rd('../../js/reaction_colorrecall.js').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/kit\.dragDamp\(/.test(code) && /tAtFinger\(pt\.x, grab\.off, x0, TRACK_W\)/.test(code) && /tAtFinger\(kit\.localPt\(e, stage\)\.x, grab\.off, x0, TRACK_W\)/.test(code), '拖曳不再用 kit.dragDamp（打折），按下與移動都用 tAtFinger（圓鈕黏在手指底下）');
  ok(/closest\('button'\)/.test(code) && /pointerup/.test(code) && /pointercancel/.test(code), '按鈕（◀ ▶ 確定）自己處理、不當拖曳；放開或被系統取消都結束拖曳'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
