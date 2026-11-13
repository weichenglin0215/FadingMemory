// 瞬間識字（blinkchar，V1.57.0）：難度曲線（亮多久／濃度／大小／選項數／筆劃／作答限時）、1 幀、選項、按鈕版面、出題、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_blinkchar.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261115), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

ok(G.id === 'blinkchar' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
ok(/3 秒/.test(G.rule) && /0\.2 秒/.test(G.rule) && /16 個/.test(G.rule), '玩法說明提到 3 秒、0.2 秒、16 個選項');
// ── 難度曲線：兩端的值是使用者指定的（第 1 關 → 到頂）──
ok(near(T.flashMsFor(1), T.FLASH_MS[0]) && near(T.flashMsFor(T.RAMP_LEVELS), T.FLASH_MS[1]) && near(T.flashMsFor(999), T.FLASH_MS[1]), '字亮多久：第 1 關 → 到頂（使用者調過，目前 ' + T.FLASH_MS + '）');
ok(T.oneFrame(T.flashMsFor(T.RAMP_LEVELS)) && T.oneFrame(16.7) && T.oneFrame(17) && !T.oneFrame(18), '到頂的亮的時間只亮「1 幀」');
ok(near(T.opacityFor(1), T.OPACITY[0]) && near(T.opacityFor(T.RAMP_LEVELS), T.OPACITY[1]) && near(T.opacityFor(999), T.OPACITY[1]), '濃度：第 1 關 → 到頂（使用者調過，目前 ' + T.OPACITY + '）');
ok(near(T.sizeFor(1), T.SIZE[0]) && near(T.sizeFor(T.RAMP_LEVELS), T.SIZE[1]) && near(T.sizeFor(999), T.SIZE[1]), '字的大小：第 1 關 → 到頂（使用者調過，目前 ' + T.SIZE + '）');
ok(T.optionsFor(1) === T.OPTIONS[0] && T.optionsFor(T.RAMP_LEVELS) === T.OPTIONS[1] && T.optionsFor(999) === T.OPTIONS[1], '答案按鈕：第 1 關 → 到頂（使用者調過，目前 ' + T.OPTIONS + '）');
ok(T.WAIT_S === 3 && T.WAIT_MIN_S > 0 && T.WAIT_MIN_S < T.WAIT_S, '字在開局後 ' + T.WAIT_S + ' 秒之內不定時閃出（最早 ' + T.WAIT_MIN_S + ' 秒）');
ok(T.OPT_FONT === 0.8, '答案按鈕的字寬是按鈕（寬、高較小的那一邊）的 80%');
{ const dir = (p) => Math.sign(p[1] - p[0]), mono = (f, p) => (f(l) - f(l - 1)) * dir(p) >= -1e-9; var l;
  for (l = 2; l <= 60; l++) ok(mono(T.flashMsFor, T.FLASH_MS) && mono(T.opacityFor, T.OPACITY) && mono(T.sizeFor, T.SIZE) && mono(T.optionsFor, T.OPTIONS) && mono(T.strokesMaxFor, T.STROKES_MAX) && mono(T.answerMsFor, T.ANSWER_S), '難度單調（往各參數指定的方向，使用者可以調成變大或變小） ' + l); }
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.flashMsFor(l - 1) - T.flashMsFor(l)); ok(Math.max(...d) - Math.min(...d) < 1e-9, '亮的時間線性縮短：每關 −' + d[0].toFixed(2) + ' 毫秒'); }
ok(T.strokesMaxFor(1) === T.STROKES_MAX[0] && T.strokesMaxFor(T.RAMP_LEVELS) === T.STROKES_MAX[1] && T.answerMsFor(1) === T.ANSWER_S[0] * 1000 && T.answerMsFor(T.RAMP_LEVELS) === T.ANSWER_S[1] * 1000, '筆劃上限、作答限時兩端');

// ── 字庫與出題 ──
ok(T.CHARS.length >= 300 && new Set(T.CHARS).size === T.CHARS.length, '字庫 ' + T.CHARS.length + ' 個字（不重複）');
for (const lv of [1, 5, 15, 30, 80]) {
  const pool = T.poolFor(lv), cap = T.strokesMaxFor(lv);
  ok(pool.length >= 50 && pool.every(c => { const s = SimilarChars.strokes(c); return s == null || s <= cap; }), '第 ' + lv + ' 關可考的字 ' + pool.length + ' 個，都 ≤ ' + cap + ' 劃');
}
ok(T.poolFor(1).length < T.poolFor(T.RAMP_LEVELS).length && T.poolFor(T.RAMP_LEVELS).length === T.CHARS.length, '越後面，可考的字越多（到頂＝全部）');
for (let i = 0; i < 400; i++) {
  const lv = 1 + (i % 45), q = T.makeLevel(lv, rnd), n = T.optionsFor(lv);
  ok(q.options.length === n && new Set(q.options).size === n && q.options.indexOf(q.ch) === q.answer && q.options[q.answer] === q.ch, '第 ' + lv + ' 關：' + n + ' 個選項不重複、含答案');
  ok(T.poolFor(lv).indexOf(q.ch) >= 0, '第 ' + lv + ' 關的字（' + q.ch + '）在這一關的字庫裡');
  ok(q.flashAtMs >= T.WAIT_MIN_S * 1000 - 1 && q.flashAtMs <= T.WAIT_S * 1000 + 1, '閃的時刻 ' + q.flashAtMs + ' 毫秒在 ' + T.WAIT_MIN_S + '～' + T.WAIT_S + ' 秒內');
  ok(q.u >= 0 && q.u < 1 && q.v >= 0 && q.v < 1 && q.flashMs === T.flashMsFor(lv) && q.one === T.oneFrame(q.flashMs) && q.opacity === T.opacityFor(lv) && q.size === T.sizeFor(lv) && q.answerMs === T.answerMsFor(lv), '題目欄位');
}
// 閃的時刻是「不定時」：同一關多次出題，時刻分散
{ const ts = []; for (let i = 0; i < 300; i++) ts.push(T.makeLevel(5, rnd).flashAtMs); ok(Math.max(...ts) - Math.min(...ts) > 1800 && new Set(ts).size > 100, '閃的時刻不固定（' + Math.min(...ts) + '～' + Math.max(...ts) + ' 毫秒）'); }
// 選項盡量挑長得像的字：答案有同群的字時，干擾字優先從同群挑
{ let withNear = 0, similar = 0;
  for (let i = 0; i < 300; i++) { const c = T.CHARS[Math.floor(rnd() * T.CHARS.length)], near4 = SimilarChars.near(c), o = T.makeOptions(c, 4, 30, rnd); withNear++; if (o.filter(x => x !== c && near4.indexOf(x) >= 0).length >= Math.min(3, near4.length)) similar++; }
  ok(similar / withNear > 0.95, '4 個選項時，干擾字都從「長得像」的字挑（' + (similar / withNear * 100).toFixed(0) + '%）'); }
// 16 個選項也湊得滿（字庫夠大）
for (let i = 0; i < 100; i++) { const c = T.CHARS[Math.floor(rnd() * T.CHARS.length)], o = T.makeOptions(c, 16, 30, rnd); ok(o.length === 16 && new Set(o).size === 16 && o.indexOf(c) >= 0, '16 個選項湊得滿'); }
// ── V1.57.0 玩家意見：答案按鈕寬度固定是畫面的 1/6，高度依排數調整（盡量正方形）──
ok(T.OPT_COLS === 6, '答案按鈕的寬度是畫面寬度的 1/6（OPT_COLS ＝ ' + T.OPT_COLS + '）');
for (let n = 2; n <= 24; n++) {
  const W = 472, availH = 220, g = T.gridFor(n, W, availH, T.GAP);
  ok(g.cols === T.OPT_COLS && g.rows === Math.ceil(n / T.OPT_COLS), n + ' 個按鈕：一排 ' + g.cols + ' 個、' + g.rows + ' 排');
  ok(g.bw === Math.floor((W - T.GAP * (T.OPT_COLS - 1)) / T.OPT_COLS), n + ' 個按鈕：寬度固定 ' + g.bw + ' px（＝畫面寬度的 1/6 扣掉空隙，不隨數量變）');
  ok(g.hh <= availH && g.bh <= g.bw && g.bh >= 24, n + ' 個按鈕：高 ' + g.bh + ' px 放得進高度 ' + availH + '（整體 ' + g.hh + '），不超過寬度（盡量正方形）');
  ok(g.gw <= W && g.side === Math.min(g.bw, g.bh) && Math.floor(g.side * T.OPT_FONT) <= g.side * 0.8 + 1e-9, n + ' 個按鈕：方陣寬 ' + g.gw + ' 放得進畫面；字級＝較小邊 × 80%');
}
{ const W = 472, g1 = T.gridFor(6, W, 400, T.GAP), g2 = T.gridFor(12, W, 400, T.GAP);
  ok(g1.bh === g1.bw && g2.bh === g2.bw, '高度夠的時候按鈕是正方形（寬 ' + g1.bw + '、高 ' + g1.bh + '）');
  const t1 = T.gridFor(6, W, 80, T.GAP), t2 = T.gridFor(12, W, 80, T.GAP), t3 = T.gridFor(18, W, 80, T.GAP);
  ok(t1.bw === t2.bw && t2.bw === t3.bw, '按鈕寬度固定：6／12／18 個都是 ' + t1.bw + ' px');
  ok(t1.bh >= t2.bh && t2.bh >= t3.bh && t3.bh < t3.bw, '高度不夠時：排數越多（1、2、3 排）按鈕越矮（' + t1.bh + '、' + t2.bh + '、' + t3.bh + '），依數量調整'); }
// ── 題目框：正方形，寬度維持畫面寬度；字只閃在下緣 MSG_H 以上的範圍 ──
ok(T.ZONE_RATIO === 1 && T.MSG_H > 0, '題目框固定是正方形（ZONE_RATIO ' + T.ZONE_RATIO + '），下緣留 ' + T.MSG_H + ' px 給說明文字');
ok(T.flashBox(1, 472, 466, 400) === Math.floor(Math.min(T.sizeFor(1) * 472, 466, 400)) && T.flashBox(T.RAMP_LEVELS, 472, 466, 400) === Math.max(8, Math.floor(Math.min(T.sizeFor(T.RAMP_LEVELS) * 472, 466, 400))) && T.flashBox(15, 472, 466, 400) === Math.floor(Math.min(T.sizeFor(15) * 472, 466, 400)), '字框邊長：畫面寬度 × SIZE，放不進白底就縮（至少 8 px）');
for (const lv of [1, 10, 30]) for (let i = 0; i < 50; i++) { const q = T.makeLevel(lv, rnd), areaH = 472 - 6 - T.MSG_H, S = T.flashBox(lv, 472, 466, areaH), left = Math.round(q.u * (466 - S)), top = Math.round(q.v * (areaH - S)); ok(left >= 0 && top >= 0 && left + S <= 466 && top + S <= areaH, '字框整個放得進（下緣留給說明文字的那一條以上的）白底（' + left + ',' + top + ',' + S + '）'); }

// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_blinkchar.js'), boot = rd('../../js/boot.js'), menu = rd('../../js/menu.js'), css = rd('../../css/games/reaction_blinkchar.css').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(boot.indexOf("'js/reaction_blinkchar.js'") > 0 && boot.indexOf("'css/games/reaction_blinkchar.css'") > 0, 'boot.js 有載入');
  ok(/id: 'blinkchar', name: '瞬間識字', cat: 'visual'/.test(menu), '選單有瞬間識字（視覺類）');
  ok(/q\.one \? frames >= 1 : now - shownAt >= q\.flashMs/.test(src) && /api\.my\.loop\(function \(now\)/.test(src), '亮的時間用畫面更新（rAF）計：到頂只亮 1 幀');
  ok(src.indexOf('ask();') > src.indexOf('hide();') && /function ask\(\)/.test(src) && /api\.timer\(q\.answerMs/.test(src), '字消失之後才長出答案按鈕、才開始作答倒數');
  ok(/g\.side \* OPT_FONT/.test(src) && /b\.style\.width = g\.bw/.test(src) && /b\.style\.height = g\.bh/.test(src), '答案按鈕：寬＝g.bw（畫面的 1/6）、高＝g.bh（依排數）、字級＝較小邊 × OPT_FONT');
  ok(/zoneH = Math\.round\(W \* ZONE_RATIO\)/.test(src) && /var areaH = zoneH - 6 - MSG_H/.test(src), '題目框是正方形（高＝寬度 × ZONE_RATIO）、字的位置扣掉下緣的 MSG_H');
  ok(/msg\.className = 'blinkchar-msg blinkchar-msg--bottom'/.test(src) && src.indexOf('blinkchar-msg--bottom') > src.indexOf('function judge'), '作答之後，說明文字移到題目框下緣（judge 裡加 blinkchar-msg--bottom）');
  ok(/\.blinkchar-msg--bottom \{[^}]*top: auto[^}]*bottom: \d+px[^}]*transform: none/.test(css) && /\.blinkchar-btns \{[^}]*display: flex[^}]*flex-wrap: wrap[^}]*justify-content: center/.test(css), '下緣說明文字的樣式、按鈕排成可換行置中的一排排（flex-wrap）');
  ok(/\.blinkchar-zone \{[^}]*var\(--c-on-accent\)/.test(css) && /\.blinkchar-ch \{[^}]*var\(--c-black\)[^}]*opacity: 0/.test(css), '白底、黑色字（平常濃度 0）用 CSS 變數'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
