const { game } = require('./load.js');
const G = game('reaction_polyrhythm.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 25) console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const byId = {}; T.COLORS.forEach(c => byId[c.id] = c);

// 六種顏色與拍數：紅 4、橙 2、黃 1、綠 1/2、藍 1/4、紫 1/8
ok(T.COLORS.map(c => c.id + ':' + c.beats).join() === 'red:4,orange:2,yellow:1,green:0.5,blue:0.25,purple:0.125', 'color → beats');
// BPM 越來越快、有上限
ok(near(T.bpmFor(0), T.BPM_START) && T.bpmFor(5) > T.bpmFor(4) && T.bpmFor(1000) === T.BPM_MAX && near(T.bpmFor(3) - T.bpmFor(2), T.BPM_STEP), 'bpm rises linearly then caps');
ok(near(T.measureSec(0), 4 * 60 / T.BPM_START) && T.measureSec(10) < T.measureSec(0), 'a measure is 4 beats and gets shorter');
// 小節鏈：第 0 小節固定「左黃、右綠」；每小節左右不同、跟自己這邊上一小節不同；小節一個接一個
let violations = { sameLR: 0, sameAsPrev: 0, locked: 0, tooDense: 0, rate: 0, gap: 0, count: 0, fixedFirst: 0, times: 0 };
const seenAt = {};
for (let run = 0; run < 400; run++) {
  const chart = T.makeChart(70);
  if (chart[0].L.color !== 'yellow' || chart[0].R.color !== 'green') violations.fixedFirst++;
  if (!near(chart[0].start, T.LEAD_S)) violations.gap++;
  chart.forEach((mm, i) => {
    if (i > 0) { const p = chart[i - 1]; if (!near(mm.start, p.start + p.dur, 1e-9)) violations.gap++; if (mm.L.color === p.L.color || mm.R.color === p.R.color) violations.sameAsPrev++; }
    if (mm.L.color === mm.R.color) violations.sameLR++;
    ['L', 'R'].forEach(side => {
      const c = byId[mm[side].color];
      if (mm.m < T.UNLOCK[c.id]) violations.locked++;
      if (c.beats * mm.bs < T.MIN_INTERVAL_S - 1e-9) violations.tooDense++;
      if (mm[side].times.length !== Math.round(4 / c.beats)) violations.count++;
      /* 每個方塊的時刻：這個小節內、等間隔（間隔＝拍數 × 一拍的秒數）*/
      mm[side].times.forEach((t, k) => { if (!near(t, mm.start + k * c.beats * mm.bs, 1e-9) || t >= mm.start + mm.dur - 1e-9) violations.times++; });
      (seenAt[mm.m] = seenAt[mm.m] || {})[mm[side].color] = 1;
    });
    if (T.laneRate(mm.L.color, mm.m) > T.MAX_LANE_RATE + 1e-9 || T.laneRate(mm.R.color, mm.m) > T.MAX_LANE_RATE + 1e-9 || T.laneRate(mm.L.color, mm.m) + T.laneRate(mm.R.color, mm.m) > T.MAX_TOTAL_RATE + 1e-9) violations.rate++;
  });
}
Object.keys(violations).forEach(k => ok(violations[k] === 0, 'no violations: ' + k + ' = ' + violations[k]));
// 顏色解鎖：前幾小節只有紅橙黃綠；藍和紫出現得比較晚（紫只在 BPM 還不快的時候）
const colorsAt = m => Object.keys(seenAt[m] || {});
ok([1, 2].every(m => colorsAt(m).every(c => ['red', 'orange', 'yellow', 'green'].includes(c))), 'early measures only use red/orange/yellow/green');
ok(Object.keys(seenAt).some(m => colorsAt(+m).includes('blue') && +m >= T.UNLOCK.blue), 'blue appears once unlocked');
ok(Object.keys(seenAt).some(m => colorsAt(+m).includes('purple') && +m >= T.UNLOCK.purple && byId.purple.beats * T.beatSec(+m) >= T.MIN_INTERVAL_S), 'purple appears while the tempo still allows it');
ok(Object.keys(seenAt).every(m => !colorsAt(+m).includes('purple') || byId.purple.beats * T.beatSec(+m) >= T.MIN_INTERVAL_S - 1e-9), 'purple never appears when the notes would be closer than MIN_INTERVAL_S');
// 越後面越密：每小節平均方塊數／秒
function density(m) { let s = 0, n = 0; for (let k = 0; k < 200; k++) { let prev = null; const ch = T.makeChart(m + 1); const mm = ch[m]; s += (mm.L.times.length + mm.R.times.length) / mm.dur; n++; } return s / n; }
const d3 = density(3), d20 = density(20), d45 = density(45);
console.log('notes per second (both lanes): m3', d3.toFixed(2), 'm20', d20.toFixed(2), 'm45', d45.toFixed(2));
ok(d20 > d3 && d45 > d20, 'later measures are denser');
// 判定視窗：間隔越密越小，上限 HIT_WIN
ok(near(T.windowFor(10), T.HIT_WIN) && near(T.windowFor(0.2), 0.09) && T.windowFor(0.1) < T.windowFor(0.2), 'window shrinks with the interval');
// matchTap：找最近、還沒處理、在視窗內的；重複點同一個方塊第二下找不到
const mk = (ts, w) => ts.map(t => ({ t, win: w, hit: false, miss: false }));
{ const ns = mk([1, 2, 3], 0.14);
  ok(T.matchTap(ns, 1.05) === 0 && T.matchTap(ns, 1.5) === -1 && T.matchTap(ns, 2.13) === 1 && T.matchTap(ns, 2.2) === -1, 'matchTap windows');
  ns[0].hit = true; ok(T.matchTap(ns, 1.01) === -1, 'a note already hit cannot be hit again');
  ns[1].miss = true; ok(T.matchTap(ns, 2.0) === -1, 'a missed note cannot be hit');
  const close = mk([1.0, 1.1], 0.05); ok(T.matchTap(close, 1.08) === 1 && T.matchTap(close, 1.03) === 0, 'picks the nearest of two close notes'); }
// 模擬玩家：完美的＝全部打中；抖動 ±0.06 的玩家在慢速下存活；亂點的很快死掉
function simulate(jit, skipP, spam, M, seed) {
  const chart = T.makeChart(M); const notes = { L: [], R: [] };
  chart.forEach(mm => ['L', 'R'].forEach(s => mm[s].times.forEach(t => notes[s].push({ t, win: T.windowFor(mm[s].interval), hit: false, miss: false }))));
  let health = T.HEALTH_MAX, streak = 0, hits = 0, misses = 0, extras = 0, tEnd = chart[chart.length - 1].start + chart[chart.length - 1].dur;
  const events = [];
  ['L', 'R'].forEach(s => notes[s].forEach(n => { if (Math.random() >= skipP) events.push({ s, t: n.t + (Math.random() * 2 - 1) * jit }); }));
  if (spam) for (let t = 0; t < tEnd; t += 0.07) { events.push({ s: 'L', t }); events.push({ s: 'R', t }); }
  events.sort((a, b) => a.t - b.t);
  let died = null;
  // 離散事件：點擊與「漏掉」（過了方塊時間 + 視窗）按時間排
  const marks = []; ['L', 'R'].forEach(s => notes[s].forEach(n => marks.push({ s, n, t: n.t + n.win + 1e-6 })));
  marks.sort((a, b) => a.t - b.t);
  let ei = 0, mi = 0;
  while ((ei < events.length || mi < marks.length) && health > 0) {
    const takeEvent = ei < events.length && (mi >= marks.length || events[ei].t <= marks[mi].t);
    if (takeEvent) { const e = events[ei++]; const i = T.matchTap(notes[e.s], e.t); if (i < 0) { extras++; health--; streak = 0; } else { notes[e.s][i].hit = true; hits++; streak++; if (streak % 12 === 0 && health < T.HEALTH_MAX) health++; } }
    else { const mk2 = marks[mi++]; if (!mk2.n.hit && !mk2.n.miss) { mk2.n.miss = true; misses++; health--; streak = 0; } }
    if (health <= 0) died = takeEvent ? events[ei - 1].t : marks[mi - 1].t;
  }
  return { died, hits, misses, extras, measures: died == null ? M : chart.filter(m => m.start + m.dur <= died).length };
}
const perfect = simulate(0, 0, false, 30), good = simulate(0.045, 0, false, 14), spam = simulate(0, 0, true, 30), idle = simulate(0, 1, false, 30);
console.log('perfect', JSON.stringify(perfect), '\ngood(±45ms, 14 measures)', JSON.stringify(good), '\nspam', JSON.stringify(spam), '\nidle', JSON.stringify(idle));
ok(perfect.died == null && perfect.misses === 0 && perfect.extras === 0, 'a perfect player never loses health');
ok(good.died == null || good.measures >= 10, 'a ±45 ms player survives the slow part');
ok(spam.died != null && spam.measures <= 3, 'mashing both lanes dies within a few measures (' + spam.measures + ')');
ok(idle.died != null && idle.measures <= 3, 'not playing dies quickly (' + idle.measures + ')');
ok(T.rating(1) !== T.rating(8) && T.rating(8) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(50), 'rating tiers');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
