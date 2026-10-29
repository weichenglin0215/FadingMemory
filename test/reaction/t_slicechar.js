// 切字（slicechar，企劃 341）的純函式檢查：目標字與形近字干擾、批次拋出（越後面一次越多）、拋物線飛行、線段碰圓判定、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_slicechar.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261126), rnd = rng(SEED);
const S = global.SimilarChars || (global.window && global.window.SimilarChars);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度 ──
ok(T.totalFor(1) === T.TOTAL[0] && T.totalFor(T.RAMP_LEVELS) === T.TOTAL[1] && T.totalFor(99) === T.TOTAL[1], '字數 ' + T.TOTAL);
ok(T.spawnMsFor(1) === T.SPAWN_MS[0] && T.spawnMsFor(T.RAMP_LEVELS) === T.SPAWN_MS[1], '間隔 ' + T.SPAWN_MS);
ok(T.batchMaxFor(1) === 1 && T.batchMaxFor(T.RAMP_LEVELS) === T.BATCH[1], '一批 ' + T.BATCH);
ok(T.strokeRange(1).join() === T.STROKES_LO[0] + ',' + T.STROKES_HI[0] && T.strokeRange(T.RAMP_LEVELS).join() === T.STROKES_LO[1] + ',' + T.STROKES_HI[1], '筆劃範圍');
for (let l = 2; l <= 60; l++) ok(T.totalFor(l) >= T.totalFor(l - 1) && T.spawnMsFor(l) <= T.spawnMsFor(l - 1) && T.batchMaxFor(l) >= T.batchMaxFor(l - 1) && T.strokeRange(l)[1] >= T.strokeRange(l - 1)[1], '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.totalFor(l) - T.totalFor(l - 1)); ok(Math.max(...d) - Math.min(...d) <= 1, '字數線性成長'); }

// ── 飛行、碰圓 ──
for (let i = 0; i < 300; i++) {
  const tz = { x0: 0.2 + rnd() * 0.6, vx: (rnd() - 0.5) * 0.2, ya: T.APEX[0] + rnd() * (T.APEX[1] - T.APEX[0]), ta: T.T_APEX[0] + rnd() * (T.T_APEX[1] - T.T_APEX[0]) };
  const p0 = T.flightPos(tz, 0), pa = T.flightPos(tz, tz.ta), lt = T.landTime(tz), pl = T.flightPos(tz, lt);
  ok(near(p0.y, T.BOTTOM, 1e-9) && near(pa.y, tz.ya, 1e-9) && near(pl.y, T.EXIT, 1e-6) && lt > 2 * tz.ta - 1e-9, '拋物線：起點、最高點、落地');
}
ok(T.segHitsCircle(0, 0, 100, 0, 50, 5, 10) && !T.segHitsCircle(0, 0, 100, 0, 50, 25, 10) && T.segHitsCircle(5, 5, 5, 5, 8, 9, 6), '線段碰圓（穿過／沒碰到／只按一下）');

// ── 整關 ──
let total = 0, tfrac = [], nearPairs = 0, nearBad = 0, bat = { 1: 0, 2: 0, 3: 0 }, inRange = 0;
for (let i = 0; i < 1500; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const F = T.totalFor(lv);
  ok(q.total === F && q.tosses.length === F, '第 ' + lv + ' 關：拋 ' + F + ' 顆');
  const tg = q.tosses.filter(t => t.onTarget), ds = q.tosses.filter(t => !t.onTarget);
  ok(tg.length >= 3 && tg.every(t => t.ch === q.target) && ds.every(t => t.ch !== q.target && q.group.indexOf(t.ch) >= 0), '目標字至少 3 顆；干擾字全是同群的形近字');
  tfrac.push(tg.length / F);
  ok(q.group.length >= T.MIN_GROUP && q.group.indexOf(q.target) >= 0 && q.mates.length === q.group.length - 1 && q.mates.indexOf(q.target) < 0, '字群與干擾字候選');
  ok(q.tosses.every((t, k) => k === 0 || t.t >= q.tosses[k - 1].t) && q.tosses[0].t >= T.LEAD_MS, '拋出時間不遞減、第一顆在 ' + T.LEAD_MS + ' 毫秒之後');
  ok(q.tosses.every(t => t.x0 >= T.X_RANGE[0] - 1e-9 && t.x0 <= T.X_RANGE[1] + 1e-9 && t.ya >= T.APEX[0] - 1e-9 && t.ya <= T.APEX[1] + 1e-9 && t.ta >= T.T_APEX[0] - 1e-9 && t.ta <= T.T_APEX[1] + 1e-9), '飛行參數在範圍內');
  // 幾乎同時拋出的（相隔不到 300 毫秒），橫向位置要拉開
  for (let a = 0; a < q.tosses.length; a++) for (let b = a + 1; b < q.tosses.length && q.tosses[b].t - q.tosses[a].t < 300; b++) { nearPairs++; if (Math.abs(q.tosses[a].x0 - q.tosses[b].x0) < 0.12) nearBad++; }
  const rg = T.strokeRange(lv), avg = q.group.reduce((a, c) => a + S.strokes(c), 0) / q.group.length; if (avg >= rg[0] - 1.5 && avg <= rg[1] + 1.5) inRange++;
  // 批次大小（把相隔 < 200 毫秒的連續拋出當同一批）
  let run = 1; for (let k = 1; k <= q.tosses.length; k++) { if (k < q.tosses.length && q.tosses[k].t - q.tosses[k - 1].t < 200) run++; else { bat[Math.min(3, run)]++; run = 1; } }
  ok(q.spawnMs === T.spawnMsFor(lv) && q.batchMax === T.batchMaxFor(lv), '難度參數');
}
console.log('目標字佔 ' + (100 * tfrac.reduce((a, b) => a + b, 0) / total).toFixed(0) + '%；批次大小 1/2/3：' + bat[1] + '/' + bat[2] + '/' + bat[3] + '；幾乎同時拋出的 ' + nearPairs + ' 對、橫向太近 ' + nearBad + ' 對；字群筆劃在範圍內 ' + inRange + '／' + total);
ok(tfrac.reduce((a, b) => a + b, 0) / total > 0.33 && tfrac.reduce((a, b) => a + b, 0) / total < 0.5, '目標字約 40%');
ok(bat[2] > 100 && bat[3] > 50, '越後面有一次拋 2、3 顆的批次');
ok(nearBad / Math.max(1, nearPairs) < 0.1, '同一批的橫向位置拉開');
ok(inRange / total > 0.9, '字群的筆劃落在這一關的範圍內');
{ let a = 0, b = 0, n = 300; for (let i = 0; i < n; i++) { a += S.strokes(T.makeLevel(1, rnd).target); b += S.strokes(T.makeLevel(24, rnd).target); } ok(b / n > a / n + 5, '越後面目標字筆劃越多：' + (a / n).toFixed(1) + ' → ' + (b / n).toFixed(1)); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_slicechar.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3600/.test(src) && /drawDiff/.test(src) && /compare\(/.test(src), '失敗：目標字與切錯的字並排、差異標紅、停格 2 秒以上');
  ok(/\.scc-dump \{[^}]*var\(--scc-dump\)/.test(css) && /\.scc-cmp__box--bad \{[^}]*var\(--c-bad/.test(css), '湯圓顏色、紅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_slicechar.js'") > 0 && /形近字/.test(G.rule), 'boot.js 有載入、玩法說明提到形近字'); }
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(20), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
