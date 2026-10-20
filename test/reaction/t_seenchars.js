// 看過的字（seenchars，企劃 324）的純函式檢查：看過的字與字格（全是形近字）、判定（集合要剛好相等）、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_seenchars.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261123), rnd = rng(SEED);
const S = global.SimilarChars || (global.window && global.window.SimilarChars);

// ── 難度 ──
ok(T.kFor(1) === T.K[0] && T.kFor(T.RAMP_LEVELS) === T.K[1] && T.kFor(99) === T.K[1], '字數 ' + T.K);
ok(T.gridFor(1) === T.GRID[0] && T.gridFor(T.RAMP_LEVELS) === T.GRID[1], '字格邊長 ' + T.GRID);
ok(T.viewMs(1) === T.VIEW_S[0] * 1000 && T.viewMs(T.RAMP_LEVELS) === T.VIEW_S[1] * 1000, '看的時間 ' + T.VIEW_S);
ok(T.respMs(1) === T.RESP_S[0] * 1000 && T.respMs(T.RAMP_LEVELS) === T.RESP_S[1] * 1000, '作答時間 ' + T.RESP_S);
ok(T.strokeRange(1).join() === T.STROKES_LO[0] + ',' + T.STROKES_HI[0] && T.strokeRange(T.RAMP_LEVELS).join() === T.STROKES_LO[1] + ',' + T.STROKES_HI[1], '筆劃範圍');
for (let l = 2; l <= 60; l++) ok(T.kFor(l) >= T.kFor(l - 1) && T.gridFor(l) >= T.gridFor(l - 1) && T.viewMs(l) <= T.viewMs(l - 1) && T.respMs(l) <= T.respMs(l - 1) && T.strokeRange(l)[1] >= T.strokeRange(l - 1)[1], '單調 ' + l);
ok(S && S.groups({ minSize: T.MIN_GROUP }).length >= 60, '共用字庫有足夠的字群：' + (S && S.groups({ minSize: T.MIN_GROUP }).length));

// ── 判定 ──
{ const q = { seenIdx: [2, 5, 7] };
  let r = T.judgePick(q, [7, 2, 5]); ok(r.ok && !r.missed.length && !r.wrong.length, '剛好相等（順序無關）→ 對');
  r = T.judgePick(q, [2, 5]); ok(!r.ok && r.missed.join() === '7' && !r.wrong.length, '少點一個 → 錯，漏掉 7');
  r = T.judgePick(q, [2, 5, 7, 0]); ok(!r.ok && !r.missed.length && r.wrong.join() === '0', '多點一個 → 錯，多點 0');
  r = T.judgePick(q, [2, 5, 4]); ok(!r.ok && r.missed.join() === '7' && r.wrong.join() === '4', '點錯一個 → 漏 7、錯 4');
  r = T.judgePick(q, []); ok(!r.ok && r.missed.length === 3, '什麼都沒點 → 錯'); }

// ── 整關 ──
let total = 0, mateShare = [], inRange = 0, strokeSum = { lo: 0, hi: 0 };
for (let i = 0; i < 1500; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const G2 = T.gridFor(lv), k = T.kFor(lv);
  ok(q.k === k && q.G === G2 && q.grid.length === G2 * G2 && q.seen.length === k, '第 ' + lv + ' 關：看 ' + k + ' 個字、字格 ' + G2 + '×' + G2);
  ok(new Set(q.grid).size === q.grid.length, '字格裡的字不重複：' + q.grid.join(''));
  ok(q.seen.every(c => q.grid.indexOf(c) >= 0) && q.seenIdx.every((x, j) => q.grid[x] === q.seen[j]), '看過的字都在字格裡，位置對得上');
  ok(new Set(q.seen).size === k && q.groups.length === k && new Set(q.groups.map(g => g.join(''))).size === k, '看過的字來自不同的字群');
  ok(q.groups.every((g, j) => g.indexOf(q.seen[j]) >= 0 && g.length >= T.MIN_GROUP), '每個看過的字都有至少 ' + (T.MIN_GROUP - 1) + ' 個形近字夥伴');
  // 每個看過的字，至少有一個同組的形近字也在字格裡（干擾）
  ok(q.seen.every((c, j) => q.groups[j].some(x => x !== c && q.grid.indexOf(x) >= 0)), '每個看過的字，字格裡都有它的形近字');
  // 干擾字有多少來自「看過的字的同組」
  const dist = q.grid.filter(c => q.seen.indexOf(c) < 0), mates = dist.filter(c => q.groups.some(g => g.indexOf(c) >= 0)); mateShare.push(mates.length / dist.length);
  ok(q.grid.every(c => typeof S.strokes(c) === 'number'), '字格裡每個字都查得到筆劃數');
  const rg = T.strokeRange(lv); const avg = q.groups.map(g => g.reduce((a, c) => a + S.strokes(c), 0) / g.length); if (avg.every(a => a >= rg[0] - 1.5 && a <= rg[1] + 1.5)) inRange++;
  ok(q.viewMs === T.viewMs(lv) && q.respMs === T.respMs(lv), '時間');
  strokeSum.lo += Math.min(...avg); strokeSum.hi += Math.max(...avg);
}
console.log('干擾字來自看過的字的同組：平均 ' + (100 * mateShare.reduce((a, b) => a + b, 0) / mateShare.length).toFixed(0) + '%；字群平均筆劃落在這一關範圍內 ' + inRange + '／' + total);
ok(mateShare.reduce((a, b) => a + b, 0) / mateShare.length > 0.7, '大部分干擾字都是看過的字的形近字');
ok(inRange / total > 0.9, '字群的筆劃落在這一關的範圍內');
// 越後面筆劃越多
{ let a = 0, b = 0; for (let i = 0; i < 200; i++) { const q1 = T.makeLevel(1, rnd), q2 = T.makeLevel(24, rnd); a += q1.seen.reduce((s, c) => s + S.strokes(c), 0) / q1.k; b += q2.seen.reduce((s, c) => s + S.strokes(c), 0) / q2.k; } ok(b / 200 > a / 200 + 3, '越後面字的筆劃越多：' + (a / 200).toFixed(1) + ' → ' + (b / 200).toFixed(1)); }
// 看過的字在格子裡的位置分散
{ const pos = {}; for (let i = 0; i < 300; i++) { const q = T.makeLevel(12, rnd); q.seenIdx.forEach(x => { pos[x] = 1; }); } ok(Object.keys(pos).length >= 14, '看過的字的位置分散：' + Object.keys(pos).length + ' 種（共 16 格）'); }
// 效能
{ const t0 = Date.now(); for (let i = 0; i < 2000; i++) T.makeLevel(1 + (i % 40), rnd); ok((Date.now() - t0) / 2000 < 3, '出題夠快'); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_seenchars.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 4000/.test(src) && /drawDiff/.test(src) && /skc-cell--miss/.test(src), '失敗：並排比對、差異筆畫標紅、漏掉的字標出來、停格 2 秒以上');
  ok(/\.skc-cell--ok \{[^}]*var\(--c-ok/.test(css) && /\.skc-cell--bad \{[^}]*var\(--c-bad/.test(css) && /\.skc-cell \{[^}]*var\(--skc-paper\)/.test(css), '綠色、紅色、字帖紙用 CSS 變數');
  ok(boot.indexOf("'js/reaction_seenchars.js'") > 0 && /形近字/.test(G.rule), 'boot.js 有載入、玩法說明提到形近字'); }
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(20), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
