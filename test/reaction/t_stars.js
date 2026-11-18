// 找星座（stars，企劃 339 依使用者修改）的純函式檢查：字切成 N×N 小方塊、每塊的延遲與速度不同、全部在回位時間內到位、時限（80%）時還有不少沒到、選項是同群形近字、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_stars.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261125), rnd = rng(SEED);
const S = global.SimilarChars || (global.window && global.window.SimilarChars);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度 ──
ok(T.tilesFor(1) === T.TILES[0] && T.tilesFor(T.RAMP_LEVELS) === T.TILES[1] && T.tilesFor(99) === T.TILES[1], '小方塊 ' + T.TILES);
ok(T.returnS(1) === T.RETURN_S[0] && T.returnS(T.RAMP_LEVELS) === T.RETURN_S[1], '回位時間 ' + T.RETURN_S);
ok(T.limitMs(1) === T.RETURN_S[0] * T.LIMIT * 1000 && T.limitMs(T.RAMP_LEVELS) === Math.round(T.RETURN_S[1] * T.LIMIT * 1000), '時限 ＝ 回位時間 × ' + T.LIMIT + '：' + T.limitMs(1) + '、' + T.limitMs(T.RAMP_LEVELS));
ok(T.optsFor(T.FIVE_FROM - 1) === 4 && T.optsFor(T.FIVE_FROM) === 5, '第 ' + T.FIVE_FROM + ' 關起 5 個選項');
ok(T.strokeRange(1).join() === T.STROKES_LO[0] + ',' + T.STROKES_HI[0] && T.strokeRange(T.RAMP_LEVELS).join() === T.STROKES_LO[1] + ',' + T.STROKES_HI[1], '筆劃範圍（都是筆劃多的字）');
for (let l = 2; l <= 60; l++) ok(T.tilesFor(l) >= T.tilesFor(l - 1) && T.returnS(l) <= T.returnS(l - 1) && T.limitMs(l) <= T.limitMs(l - 1) && T.optsFor(l) >= T.optsFor(l - 1) && T.strokeRange(l)[1] >= T.strokeRange(l - 1)[1], '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.tilesFor(l) - T.tilesFor(l - 1)); ok(Math.max(...d) - Math.min(...d) <= 1, '小方塊數線性成長：每關 +' + Math.min(...d) + '～' + Math.max(...d)); }
ok(T.limitMs(1) / (T.returnS(1) * 1000) === T.LIMIT, '時限正好是回位時間的 80%');

// ── 動畫 ──
ok(T.easeInOut(0) === 0 && T.easeInOut(1) === 1 && near(T.easeInOut(0.5), 0.5), 'easeInOut 的端點');
{ let prev = -1; for (let p = 0; p <= 1.0001; p += 0.01) { const v = T.easeInOut(Math.min(1, p)); ok(v >= prev - 1e-12, 'easeInOut 單調'); prev = v; } }
{ const tile = { d: 2, m: 4 }, s = { x: 0, y: 100 }, e = { x: 300, y: 0 };
  ok(T.tilePos(tile, s, e, 0).x === 0 && T.tilePos(tile, s, e, 1.9).x === 0, '還沒開始（延遲中）：在起點');
  ok(near(T.tilePos(tile, s, e, 6).x, 300) && near(T.tilePos(tile, s, e, 6).y, 0) && T.tilePos(tile, s, e, 99).x === 300, '走完：在終點');
  ok(near(T.tilePos(tile, s, e, 4).x, 150) && near(T.tilePos(tile, s, e, 4).y, 50), '走到一半（時間過半）：在中點'); }
{ const tiles = [{ d: 0, m: 1 }, { d: 1, m: 1 }, { d: 2, m: 2 }, { d: 3, m: 1 }]; ok(T.arrivedFraction(tiles, 0.5) === 0 && T.arrivedFraction(tiles, 1) === 0.25 && T.arrivedFraction(tiles, 2) === 0.5 && T.arrivedFraction(tiles, 4) === 1, 'arrivedFraction'); }

// ── 整關 ──
let total = 0, lastCount = 0, fracAtLimit = [], fracHalf = [], dSet = new Set(), startMean = [0, 0, 0];
for (let i = 0; i < 1500; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const N = T.tilesFor(lv), Tt = T.returnS(lv);
  ok(q.N === N && q.tiles.length === N * N && q.tret === Tt && q.limitMs === T.limitMs(lv), '第 ' + lv + ' 關：' + N + '×' + N + ' 個小方塊');
  ok(q.tiles.every(t => t.d >= -1e-9 && t.m >= T.MOVE[0] * Tt - 1e-9 && t.m <= T.MOVE[1] * Tt + 1e-9 && t.d + t.m <= Tt + 1e-9), '每塊：延遲 ≥ 0、花的時間在範圍內、全部在 ' + Tt + ' 秒內到位');
  ok(q.tiles.every(t => t.d + t.m >= T.ARRIVE_MIN * Tt - 1e-9 || t.d + t.m >= t.m - 1e-9), '到位時間不會太早');
  ok(q.tiles.every(t => t.sx >= 0 && t.sx <= 1 && t.sy >= 0 && t.sy <= 1), '起點在畫面內');
  ok(T.arrivedFraction(q.tiles, Tt + 1e-6) === 1 && T.arrivedFraction(q.tiles, Tt * 0.99) < 1, '到 ' + Tt + ' 秒才全部到位（之前還有沒到的）');
  const lim = Tt * T.LIMIT, fl = T.arrivedFraction(q.tiles, lim); fracAtLimit.push(fl); fracHalf.push(T.arrivedFraction(q.tiles, Tt * 0.5));
  ok(1 - fl >= T.STRAGGLE - 1e-9, '第 ' + lv + ' 關：時限（' + lim.toFixed(1) + ' 秒）時還有 ' + ((1 - fl) * 100).toFixed(0) + '% 沒到位（至少 ' + T.STRAGGLE * 100 + '%）');
  lastCount += q.tiles.filter(t => near(t.d + t.m, Tt, 1e-9)).length > 0 ? 1 : 0;
  ok(q.options.length === T.optsFor(lv) && new Set(q.options).size === q.options.length && q.options[q.answerIdx] === q.answer && q.options.every(c => q.group.indexOf(c) >= 0), '選項：' + q.options.join('') + '（同一群形近字，含答案）');
  ok(q.group.length >= T.MIN_GROUP, '字群至少 ' + T.MIN_GROUP + ' 個字');
  q.tiles.forEach(t => { dSet.add(Math.round(t.d * 10)); startMean[0] += t.sx; startMean[1] += t.sy; startMean[2]++; });
}
console.log('時限時已到位的比例：平均 ' + (100 * fracAtLimit.reduce((a, b) => a + b, 0) / total).toFixed(0) + '%；過一半時間已到位 ' + (100 * fracHalf.reduce((a, b) => a + b, 0) / total).toFixed(0) + '%；起點平均 (' + (startMean[0] / startMean[2]).toFixed(2) + ', ' + (startMean[1] / startMean[2]).toFixed(2) + ')');
ok(lastCount === total, '每一關都有小方塊剛好在最後才到');
ok(dSet.size > 30, '延遲長短不一：' + dSet.size + ' 種');
ok(Math.abs(startMean[0] / startMean[2] - 0.5) < 0.03 && Math.abs(startMean[1] / startMean[2] - 0.5) < 0.03, '起點平均散在畫面中央附近（隨機分布）');
// 字都是筆劃多的字
{ let a = 0, b = 0, n = 300; for (let i = 0; i < n; i++) { a += S.strokes(T.makeLevel(1, rnd).answer); b += S.strokes(T.makeLevel(24, rnd).answer); } console.log('答案字的平均筆劃：第 1 關 ' + (a / n).toFixed(1) + '、第 24 關 ' + (b / n).toFixed(1)); ok(a / n >= 10 && b / n > a / n + 2, '題目是筆劃很多的字，越後面越多'); }
{ const pos = {}; for (let i = 0; i < 300; i++) { const q = T.makeLevel(20, rnd); pos[q.answerIdx] = (pos[q.answerIdx] || 0) + 1; } ok(Object.keys(pos).length === 5 && Math.min(...Object.values(pos)) > 30, '答案的位置平均分布（5 選 1）：' + JSON.stringify(pos)); }
// 效能
{ const t0 = Date.now(); for (let i = 0; i < 300; i++) T.makeLevel(1 + (i % 40), rnd); ok((Date.now() - t0) / 300 < 5, '出題夠快'); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_stars.js'), css = rd('../../css/games/reaction_stars.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: revealMs \+ Math\.round\(FAIL_HOLD_S \* 1000\)/.test(src) && /api\.pass\(\{ delay: revealMs \+ Math\.round\(PASS_HOLD_S \* 1000\)/.test(src) && /snapAt/.test(src) && /drawImage/.test(src), '失敗／過關：等「定住＋慢動作」做完（revealMs）再加停留秒數；小方塊飛回原位、標出正確的字');
  // 玩家意見（V1.57.2.0）：點答案或時間到 → 小方塊先定住 FREEZE_S 秒 → 慢動作 SLOWMO_S 秒移到最後位置；秒數都是參數
  ok(T.FREEZE_S === 1.5 && T.SLOWMO_S === 4 && T.PASS_HOLD_S > 0 && T.FAIL_HOLD_S > 0, '揭曉參數：定住 FREEZE_S＝1.5 秒、慢動作 SLOWMO_S＝4 秒（預設，使用者可調）、停留 PASS_HOLD_S／FAIL_HOLD_S：' + [T.FREEZE_S, T.SLOWMO_S, T.PASS_HOLD_S, T.FAIL_HOLD_S]);
  ok(/var FREEZE_S = [\d.]+;/.test(src) && /var SLOWMO_S = [\d.]+;/.test(src), '參數寫在檔案最前面的參數區');
  ok(/el - FREEZE_S \* 1000\) \/ span/.test(src) && /draw\(0, \{ from: snapAt\.from, k: easeInOut\(p\) \}\)/.test(src), '揭曉的畫面：前 FREEZE_S 秒停在點答案那一刻的位置，之後用 SLOWMO_S 秒（easeInOut）移到終點');
  ok(/done = true; phase = 'end'; api\.stopTimer\(\);/.test(src), '點答案（或時間到）就停下時間條');
  ok(/judge\(-1\)/.test(src) && /judge\(i\)/.test(src), '時間到（judge(-1)）與點答案（judge(i)）走同一個揭曉流程');
  // 玩家意見（V1.57.2.0）：拼好的字偏下、下緣被切掉 → 用筆畫外框置中，過大的字縮小
  ok(/kit\.drawGlyph\(ox, q\.answer, S \/ 2, S \/ 2\)/.test(src) && !/ox\.textBaseline = 'middle'/.test(src) && !/S \* 0\.04/.test(src), '題目字用 kit.drawGlyph 以筆畫外框置中（不再用 textBaseline=middle 再往下偏 4%）');
  ok(T.GLYPH_FIT > 0.8 && T.GLYPH_FIT < 1 && /Math\.max\(gw, gh\) > S \* GLYPH_FIT/.test(src), '字太滿（筆畫外框超過 GLYPH_FIT）就縮小，才不會被畫布邊緣切掉');
  ok(/\.stars-ok \{[^}]*var\(--c-ok/.test(css) && /\.stars-bad \{[^}]*var\(--c-bad/.test(css), '綠色、紅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_stars.js'") > 0 && /80%/.test(G.rule), 'boot.js 有載入、玩法說明提到 80%'); }
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(20), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
