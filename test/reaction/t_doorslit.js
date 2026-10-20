// 門縫偷看（doorslit，企劃 331 依使用者修改）的純函式檢查：門縫的位置與掃過全字、每個位置露出多久、題目與四個形近字選項、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_doorslit.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261124), rnd = rng(SEED);
const S = global.SimilarChars || (global.window && global.window.SimilarChars);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度 ──
ok(T.gapFor(1) === T.GAP[0] && T.gapFor(T.RAMP_LEVELS) === T.GAP[1] && T.gapFor(99) === T.GAP[1], '縫寬 ' + T.GAP);
ok(T.speedFor(1) === T.SPEED[0] && T.speedFor(T.RAMP_LEVELS) === T.SPEED[1], '速度 ' + T.SPEED);
ok(T.respMs(1) === T.RESP_S[0] * 1000 && T.respMs(T.RAMP_LEVELS) === T.RESP_S[1] * 1000, '作答時間 ' + T.RESP_S);
ok(T.strokeRange(1).join() === T.STROKES_LO[0] + ',' + T.STROKES_HI[0] && T.strokeRange(T.RAMP_LEVELS).join() === T.STROKES_LO[1] + ',' + T.STROKES_HI[1], '筆劃範圍');
for (let l = 2; l <= 60; l++) ok(T.gapFor(l) <= T.gapFor(l - 1) && T.speedFor(l) >= T.speedFor(l - 1) && T.respMs(l) <= T.respMs(l - 1) && T.strokeRange(l)[1] >= T.strokeRange(l - 1)[1], '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.gapFor(l - 1) - T.gapFor(l)); ok(Math.max(...d) - Math.min(...d) <= 1, '縫寬線性縮小：每關 −' + Math.min(...d) + '～−' + Math.max(...d)); }
ok(T.speedFor(T.RAMP_LEVELS) / T.speedFor(1) < 1.7 && T.speedFor(T.RAMP_LEVELS) > T.speedFor(1), '速度只是「略增」：' + T.speedFor(1) + ' → ' + T.speedFor(T.RAMP_LEVELS));

// ── 門縫的位置 ──
ok(T.slitX(0, 40, 300) === -40 && near(T.slitX(1, 40, 300), 260) && near(T.slitX(2, 40, 300), 560), '門縫左緣 = −縫寬 + 速度 × 時間');
{ const W = 440; for (const gap of [60, 30, 8]) for (const sp of [300, 460]) { const T1 = T.sweepSeconds(W, gap, sp); ok(near(T.slitX(T1, gap, sp), W, 1e-9), '掃完的時候縫的左緣剛好在字的右邊緣：縫 ' + gap + '、速 ' + sp); ok(T1 > 0.8 && T1 < 2.4, '掃一趟 ' + T1.toFixed(2) + ' 秒'); } }
// 整個字每一條都會被縫掃到：把時間切成小格，縫蓋過的範圍聯集要覆蓋 [0, W]（沒有漏掉的條紋）
for (const [gap, sp] of [[60, 300], [30, 380], [8, 460]]) { const W = 440, total = T.sweepSeconds(W, gap, sp), covered = new Uint8Array(W); const dt = 1 / 120; for (let t = 0; t <= total + dt; t += dt) { const x = T.slitX(t, gap, sp); for (let px = Math.max(0, Math.floor(x)); px < Math.min(W, Math.ceil(x + gap)); px++) covered[px] = 1; } ok(covered.every(v => v === 1), '120 fps 取樣：縫 ' + gap + ' px、速度 ' + sp + '：整個字（0～' + W + '）每個位置都被縫掃過'); }
ok(near(T.exposureSeconds(8, 460), 8 / 460) && near(T.exposureSeconds(60, 300), 0.2), '每個位置在縫裡出現 縫寬／速度 秒');
{ const e = T.exposureSeconds(T.gapFor(T.RAMP_LEVELS), T.speedFor(T.RAMP_LEVELS)), e1 = T.exposureSeconds(T.gapFor(1), T.speedFor(1)); ok(e < 0.02 && e1 > 0.15 && e1 / e > 8, '第 1 關每條露出 ' + (e1 * 1000).toFixed(0) + ' 毫秒、到頂只有 ' + (e * 1000).toFixed(1) + ' 毫秒'); }

// ── 整關 ──
let total = 0, inRange = 0;
for (let i = 0; i < 2000; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  ok(q.options.length === T.N_OPT && new Set(q.options).size === T.N_OPT, '第 ' + lv + ' 關：' + T.N_OPT + ' 個不同的選項');
  ok(q.options[q.answerIdx] === q.answer && q.options.filter(c => c === q.answer).length === 1, '答案在選項裡（只有一個）');
  ok(q.options.every(c => q.group.indexOf(c) >= 0) && q.group.length >= T.MIN_GROUP, '選項全來自同一群形近字：' + q.options.join(''));
  ok(q.gap === T.gapFor(lv) && q.speed === T.speedFor(lv) && q.respMs === T.respMs(lv), '難度參數');
  const rg = T.strokeRange(lv), avg = q.group.reduce((a, c) => a + S.strokes(c), 0) / q.group.length; if (avg >= rg[0] - 1.5 && avg <= rg[1] + 1.5) inRange++;
}
console.log('字群平均筆劃落在這一關範圍內 ' + inRange + '／' + total);
ok(inRange / total > 0.95, '字群的筆劃落在這一關的範圍內');
{ let a = 0, b = 0; for (let i = 0; i < 300; i++) { a += T.makeLevel(1, rnd).answer.split('').reduce((s, c) => s + S.strokes(c), 0); b += T.makeLevel(24, rnd).answer.split('').reduce((s, c) => s + S.strokes(c), 0); } ok(b / 300 > a / 300 + 4, '越後面字的筆劃越多：' + (a / 300).toFixed(1) + ' → ' + (b / 300).toFixed(1)); }
{ const pos = {}; for (let i = 0; i < 300; i++) { const q = T.makeLevel(10, rnd); pos[q.answerIdx] = (pos[q.answerIdx] || 0) + 1; } ok(Object.keys(pos).length === 4 && Math.min(...Object.values(pos)) > 40, '答案的位置平均分布：' + JSON.stringify(pos)); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_doorslit.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3400/.test(src) && /drawDiff/.test(src) && /dsl-cover--open/.test(src), '失敗：兩片方塊打開、差異筆畫塗紅、停格 2 秒以上');
  ok(/\.dsl-cover \{[^}]*var\(--c-card\)/.test(css) && /\.dsl-glyph \{[^}]*var\(--c-ink\)/.test(css) && /\.dsl-bad \{[^}]*var\(--c-bad/.test(css), '白色方塊、黑字、紅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_doorslit.js'") > 0 && /白色方塊/.test(G.rule), 'boot.js 有載入、玩法說明提到白色方塊'); }
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(20), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
