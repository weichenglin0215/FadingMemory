// 字的顏色（inkword，企劃 315）的純函式檢查：字與墨色一定不同、三種問題（字／墨色／第幾個）的答案正確且唯一、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_inkword.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261120), rnd = rng(SEED);

// ── 難度 ──
ok(T.lenFor(1) === T.LEN[0] && T.lenFor(T.RAMP_LEVELS) === T.LEN[1] && T.lenFor(99) === T.LEN[1], '字數 ' + T.LEN);
ok(T.flashMsFor(1) === T.FLASH_MS[0] && T.flashMsFor(T.RAMP_LEVELS) === T.FLASH_MS[1], '停留 ' + T.FLASH_MS);
ok(T.gapMsFor(1) === T.GAP_MS[0] && T.gapMsFor(T.RAMP_LEVELS) === T.GAP_MS[1], '空檔 ' + T.GAP_MS);
ok(T.respMs(1) === T.RESP_S[0] * 1000 && T.respMs(T.RAMP_LEVELS) === T.RESP_S[1] * 1000, '作答時間 ' + T.RESP_S);
ok(T.whichPFor(T.WHICH_FROM - 1) === 0 && Math.abs(T.whichPFor(T.WHICH_FROM) - T.WHICH_P[0]) < 0.02 === false || T.whichPFor(T.WHICH_FROM) > 0, '「第幾個」題型：第 ' + T.WHICH_FROM + ' 關起才有');
ok(Math.abs(T.whichPFor(T.RAMP_LEVELS) - T.WHICH_P[1]) < 1e-9, '到頂機率 ' + T.WHICH_P[1]);
for (let l = 2; l <= 60; l++) ok(T.lenFor(l) >= T.lenFor(l - 1) && T.flashMsFor(l) <= T.flashMsFor(l - 1) && T.gapMsFor(l) <= T.gapMsFor(l - 1) && T.respMs(l) <= T.respMs(l - 1) && T.whichPFor(l) >= T.whichPFor(l - 1), '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.flashMsFor(l - 1) - T.flashMsFor(l)); ok(Math.max(...d) - Math.min(...d) <= 1, '停留時間線性縮短'); }
ok(T.COLORS.length === 6 && new Set(T.COLORS.map(c => c.id)).size === 6 && T.COLORS.every(c => c.name.length === 1), '六種顏色、名字一個字');

// ── 整關 ──
let total = 0, types = { word: 0, ink: 0, which: 0 }, whichLv = 0;
for (let i = 0; i < 3000; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  ok(q.len === T.lenFor(lv) && q.seq.length === q.len, '第 ' + lv + ' 關：' + q.len + ' 個字');
  ok(q.seq.every(s => s.w >= 0 && s.w <= 5 && s.c >= 0 && s.c <= 5 && s.w !== s.c), '每個字的字與墨色都不同（用另一種顏色寫）');
  ok(q.flashMs === T.flashMsFor(lv) && q.gapMs === T.gapMsFor(lv) && q.respMs === T.respMs(lv), '速度');
  const Q = q.q; types[Q.type]++;
  ok(['word', 'ink', 'which'].includes(Q.type) && Q.idx >= 0 && Q.idx < q.len, '題型與位置');
  if (Q.type === 'word') ok(Q.answer === q.seq[Q.idx].w, 'word 題的答案是被問那個字的字');
  if (Q.type === 'ink') ok(Q.answer === q.seq[Q.idx].c, 'ink 題的答案是被問那個字的墨色');
  if (Q.type === 'which') { whichLv = Math.min(whichLv || 99, lv); ok(Q.color === q.seq[Q.answer].c && q.seq.filter(s => s.c === Q.color).length === 1 && Q.idx === Q.answer, 'which 題：那個墨色整串只出現一次、答案是它的位置'); ok(lv >= T.WHICH_FROM, 'which 題只出現在第 ' + T.WHICH_FROM + ' 關之後'); }
  ok(typeof T.questionText(Q) === 'string' && T.questionText(Q).length > 4, '問題文字：' + T.questionText(Q));
}
console.log('題型分布 ' + JSON.stringify(types) + '；which 最早出現在第 ' + whichLv + ' 關');
ok(types.word > 500 && types.ink > 500 && types.which > 100, '三種題型都有');
{ const w = types.word / (types.word + types.ink); ok(w > 0.4 && w < 0.6, '問字與問墨色各半：' + (100 * w).toFixed(0) + '%'); }
// 問題文字
ok(T.questionText({ type: 'word', idx: 2 }) === '第 3 個字，寫的是什麼字？' && T.questionText({ type: 'ink', idx: 0 }) === '第 1 個字，是什麼顏色寫的？' && T.questionText({ type: 'which', idx: 4, color: 0 }) === '第幾個字是用「紅」色寫的？', '問題文字範例');
ok(T.ordinal(0) === '第 1 個' && T.ordinal(6) === '第 7 個', 'ordinal');
// 被問的位置分散（不是都問第一個或最後一個）
{ const pos = {}; for (let i = 0; i < 400; i++) { const q = T.makeLevel(24, rnd); pos[q.q.idx] = 1; } ok(Object.keys(pos).length >= 6, '被問的位置分散：' + Object.keys(pos).length + ' 種'); }
// 偷吃步：只記字或只記墨色，猜中的機率
{ let g = 0, n = 2000; for (let i = 0; i < n; i++) { const q = T.makeLevel(24, rnd); if (q.q.type === 'word') { if (q.seq[q.q.idx].c === q.q.answer) g++; } else if (q.q.type === 'ink') { if (q.seq[q.q.idx].w === q.q.answer) g++; } } ok(g === 0, '把墨色當成字（或反過來）一定錯：兩者永遠不同'); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_inkword.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3800/.test(src) && /ikw-cell--ask/.test(src), '失敗：整串字並排、被問的標起來、停格 2 秒以上');
  ok(/\.ikw-c--red \{[^}]*var\(--ikw-red\)/.test(css) && /\.ikw-bad \{[^}]*var\(--c-bad/.test(css), '六種顏色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_inkword.js'") > 0 && /兩樣都要記/.test(G.rule), 'boot.js 有載入、玩法說明提到兩樣都要記'); }
{ const css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction6.css'), 'utf8'); T.COLORS.forEach(c => { ok(css.indexOf('.ikw-c--' + c.id + ' ') >= 0 && css.indexOf('.ikw-sw--' + c.id + ' ') >= 0, 'CSS 有 ' + c.id + ' 的字色與按鈕色'); }); }
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(20), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
