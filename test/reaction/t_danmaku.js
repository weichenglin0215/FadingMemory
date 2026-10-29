// 彈幕找字（danmaku，企劃 346）的純函式檢查：難度隨「點到幾個」線性增加、目標字比例與「不會太久沒有目標」、形近字、點擊判定（重疊取最近）
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_danmaku.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261128), rnd = rng(SEED);
const S = global.SimilarChars || (global.window && global.window.SimilarChars);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（輸入是已經點到幾個）──
ok(near(T.rateFor(0), T.RATE[0]) && near(T.rateFor(T.RAMP_HITS), T.RATE[1]) && near(T.rateFor(999), T.RATE[1]), '每秒出現幾個字 ' + T.RATE);
ok(near(T.speedFor(0), T.SPEED[0]) && near(T.speedFor(T.RAMP_HITS), T.SPEED[1]), '速度 ' + T.SPEED);
ok(near(T.targetPx(0), T.TARGET_PX[0]) && near(T.targetPx(T.RAMP_HITS), T.TARGET_PX[1]), '目標字大小 ' + T.TARGET_PX);
ok(T.strokeRange(0).join() === T.STROKES_LO[0] + ',' + T.STROKES_HI[0] && T.strokeRange(T.RAMP_HITS).join() === T.STROKES_LO[1] + ',' + T.STROKES_HI[1], '筆劃範圍');
for (let k = 1; k <= 80; k++) ok(T.rateFor(k) >= T.rateFor(k - 1) && T.speedFor(k) >= T.speedFor(k - 1) && T.targetPx(k) <= T.targetPx(k - 1) && T.strokeRange(k)[1] >= T.strokeRange(k - 1)[1], '單調 ' + k);
{ const d = []; for (let k = 1; k <= T.RAMP_HITS; k++) d.push(T.speedFor(k) - T.speedFor(k - 1)); ok(Math.max(...d) - Math.min(...d) < 1e-9, '速度隨點到的個數線性增加'); }
ok(T.segmentOf(0) === 0 && T.segmentOf(T.SEGMENT - 1) === 0 && T.segmentOf(T.SEGMENT) === 1 && T.segmentOf(T.SEGMENT * 3 + 2) === 3, '每 ' + T.SEGMENT + ' 個換一個目標字');

// ── 目標字的比例與間隔 ──
{ let since = 0, maxRun = 0, run = 0, tg = 0, N = 200000; for (let i = 0; i < N; i++) { const t = T.nextIsTarget(since, rnd); if (t) { tg++; since = 0; run = 0; } else { since++; run++; maxRun = Math.max(maxRun, run); } }
  console.log('目標字佔 ' + (100 * tg / N).toFixed(1) + '%；連續不是目標最長 ' + maxRun);
  ok(maxRun <= T.MAX_GAP, '連續不是目標字最多 ' + T.MAX_GAP + ' 個（不會太久沒有目標）：' + maxRun);
  ok(tg / N > T.TARGET_P && tg / N < T.TARGET_P + 0.12, '目標字比例（含保證間隔）略高於 25%：' + (100 * tg / N).toFixed(1) + '%'); }
ok(T.nextIsTarget(T.MAX_GAP, () => 0.99) === true && T.nextIsTarget(0, () => 0.99) === false && T.nextIsTarget(0, () => 0.1) === true, 'nextIsTarget 邊界');

// ── 目標字與形近字 ──
let inRange = 0, N0 = 600;
for (let i = 0; i < N0; i++) {
  const hits = Math.floor(rnd() * 80), seg = T.pickTarget(hits, rnd);
  ok(seg.group.indexOf(seg.target) >= 0 && seg.mates.length === seg.group.length - 1 && seg.mates.indexOf(seg.target) < 0 && seg.group.length >= T.MIN_GROUP, '目標與形近字：' + seg.target + ' / ' + seg.mates.join(''));
  const avg = seg.group.reduce((a, c) => a + S.strokes(c), 0) / seg.group.length, rg = T.strokeRange(hits); if (avg >= rg[0] - 1.5 && avg <= rg[1] + 1.5) inRange++;
}
ok(inRange / N0 > 0.9, '字群筆劃落在範圍內：' + (100 * inRange / N0).toFixed(0) + '%');
{ let a = 0, b = 0; for (let i = 0; i < 300; i++) { a += S.strokes(T.pickTarget(0, rnd).target); b += S.strokes(T.pickTarget(40, rnd).target); } ok(b / 300 > a / 300 + 5, '越後面目標字筆劃越多：' + (a / 300).toFixed(1) + ' → ' + (b / 300).toFixed(1)); }
{ let same = 0; for (let i = 0; i < 300; i++) { const seg = T.pickTarget(10, rnd), seg2 = T.pickTarget(10, rnd, seg.target); if (seg2.group.indexOf(seg.target) >= 0) same++; } ok(same === 0, '換目標字時避開上一個字所在的字群：' + same); }
// ── 生字 ──
{ const seg = T.pickTarget(0, rnd); let since = 0, tcount = 0, nT = 0, szT = new Set(), spd = [1e9, 0];
  for (let i = 0; i < 3000; i++) { const hits = i % 60, it = T.makeItem(hits, seg, since, rnd); since = it.isTarget ? 0 : since + 1; nT += it.isTarget ? 1 : 0;
    ok(it.isTarget ? it.ch === seg.target : seg.mates.indexOf(it.ch) >= 0, '目標字是目標、干擾字是形近字');
    ok(it.isTarget ? it.size === Math.round(T.targetPx(hits)) : it.size >= T.DECOY_PX[0] && it.size <= T.DECOY_PX[1], '大小：目標字依難度、干擾字在範圍內');
    ok(it.speed >= T.speedFor(hits) * 0.75 - 1e-9 && it.speed <= T.speedFor(hits) * 1.25 + 1e-9 && it.lane >= 0 && it.lane <= 1, '速度在 ±25% 內、行在 0～1'); spd[0] = Math.min(spd[0], it.speed); spd[1] = Math.max(spd[1], it.speed); }
  ok(spd[1] > spd[0] * 2, '字的速度不一樣：' + spd.map(x => x.toFixed(0))); }
// ── 點擊判定 ──
{ const items = [{ x: 100, y: 100, size: 60 }, { x: 130, y: 100, size: 60 }, { x: 400, y: 300, size: 80 }];
  ok(T.hitItem(items, 100, 100) === 0 && T.hitItem(items, 135, 100) === 1, '重疊時取離中心最近的');
  ok(T.hitItem(items, 118, 100) === 1 || T.hitItem(items, 118, 100) === 0, '兩個中間點的是其中之一');
  ok(T.hitItem(items, 400 + 80 * 0.75 + 11, 300) === 2 && T.hitItem(items, 400 + 80 * 0.75 + 20, 300) === -1, '範圍＝字大小的 0.75 倍 + 12：剛好在邊緣內命中、外面不中');
  ok(T.hitItem(items, 250, 200) === -1 && T.hitItem([], 1, 1) === -1, '點到空白處不算'); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_danmaku.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3000/.test(src) && /dmk-ch--target/.test(src) && /dmk-ch--bad/.test(src) && /scoreOf/.test(src), '失敗：目標字圈綠、點錯的圈紅、停格 2 秒以上；成績用 scoreOf');
  ok(/\.dmk-ch--target \{[^}]*var\(--c-ok/.test(css) && /\.dmk-ch--bad \{[^}]*var\(--c-bad/.test(css), '綠色、紅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_danmaku.js'") > 0 && /彈幕/.test(G.rule), 'boot.js 有載入、玩法說明提到彈幕');
  ok(/max: 300/.test(src) && /decimals: 0/.test(src), '成績設定：整數、上限 300'); }
ok(T.rating(3) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(40) && T.rating(40) !== T.rating(70), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
