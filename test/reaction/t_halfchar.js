// 半邊字（halfchar）：V1.57.0 改成「旋轉的白色遮片」——遮片形狀（比薩／條紋／黑白格／波紋／螺旋／emoji 方陣）、空隙比例、旋轉速度、五彩繽紛、
// 難度曲線；題庫（干擾字都含有相似部件、不含差異部件）、選項、不重複出題。畫面（canvas）靠 test/reaction/browser_halfchar.mjs 在瀏覽器裡驗證。
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_halfchar.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261117), rnd = rng(SEED);

ok(G.id === 'halfchar' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && /旋轉/.test(G.rule) && /遮片/.test(G.rule) && G.score.better === 'max', '登記資料與玩法說明（旋轉的白色遮片）');

// ── 題庫資料檢查：每題的干擾字都含有相似部件、都不含答案的差異部件 ──
const problems = T.checkData();
ok(problems.length === 0, 'data problems: ' + problems.join(' | '));
ok(T.ENTRIES.length >= 40, 'at least 40 questions (' + T.ENTRIES.length + ')');
const sides = {}; T.ENTRIES.forEach(e => sides[e.side] = (sides[e.side] || 0) + 1);
ok(sides.left >= 10 && sides.right >= 15 && sides.top >= 3 && sides.bottom >= 5, 'all four sides covered ' + JSON.stringify(sides));
ok(new Set(T.ENTRIES.map(e => e.a + e.side)).size === T.ENTRIES.length, 'no duplicate (answer, side)');
// 相似處／差異處（揭曉時的說明「大家都有 X，關鍵是 Y」還在用）
const e1 = T.ENTRIES.find(e => e.a === '湖' && e.side === 'right'); ok(T.visiblePart(e1) === '氵' && T.hiddenPart(e1) === '胡', 'similar/different for 湖 (diff on the right)');
const e2 = T.ENTRIES.find(e => e.a === '想' && e.side === 'top'); ok(T.visiblePart(e2) === '心' && T.hiddenPart(e2) === '相', 'similar/different for 想 (diff on top)');
const e3 = T.ENTRIES.find(e => e.a === '草' && e.side === 'bottom'); ok(T.visiblePart(e3) === '艹' && T.hiddenPart(e3) === '早', 'similar/different for 草 (diff at the bottom)');
let sameN = 0, diffN = 0, tot = 0;
T.ENTRIES.forEach(e => { const sim = T.visiblePart(e), dif = T.hiddenPart(e); e.d.forEach(c => { tot++; if (T.DECOMP[c].includes(sim)) sameN++; if (T.DECOMP[c].includes(dif)) diffN++; }); });
ok(sameN === tot && diffN === 0, 'every distractor shares the similar part and none shares the different part');

// ── 難度：時間、選項（玩家手調過，測試跟著參數走）──
ok(near(T.timeFor(1), T.TIME_START) && near(T.timeFor(T.LEVEL_RAMP), T.TIME_END) && near(T.timeFor(99), T.TIME_END), 'time ' + T.TIME_START + ' -> ' + T.TIME_END);
ok(T.optCount(1) === Math.round(T.OPT_START) && T.optCount(T.OPT_RAMP) === Math.round(T.OPT_END) && T.optCount(99) === Math.round(T.OPT_END), 'options ' + T.OPT_START + ' -> ' + T.OPT_END);
{ const d = Math.sign(T.OPT_END - T.OPT_START); let prev = T.optCount(1); for (let lv = 2; lv <= 30; lv++) { const n = T.optCount(lv); ok((n - prev) * d >= 0 && n >= 4 && n <= 6, 'option count monotone & within 4..6: lv' + lv + ' = ' + n); prev = n; } }
// 額外干擾字：每一題都找得到、都符合規則
ok(T.checkPool().length === 0, 'extra distractor pool problems: ' + T.checkPool().join(' | '));
T.ENTRIES.forEach(e => { ok(T.extraPool(e).length >= 2, 'at least 2 extra distractors for ' + e.a + e.side + ' (' + T.extraPool(e).length + ')'); });
// 選項
for (let k = 0; k < 600; k++) {
  const e = T.ENTRIES[k % T.ENTRIES.length], o = T.makeOptions(e);
  ok(o.options.length === 4 && new Set(o.options).size === 4 && o.options[o.answer] === e.a, 'options valid');
  for (const n of [4, 5, 6]) {
    const o2 = T.makeOptions(e, null, n), idx = T.SIDE_IDX[e.side];
    ok(o2.options.length === n && new Set(o2.options).size === n && o2.options[o2.answer] === e.a, 'n options valid n=' + n + ' ' + e.a + e.side);
    o2.options.forEach(c => { if (c === e.a) return; ok(T.DECOMP[c][1 - idx] === T.visiblePart(e) && T.DECOMP[c][idx] !== T.hiddenPart(e) && !!T.TB[c] === T.isTB(e), 'every distractor is consistent with the similar part: ' + e.a + e.side + ' ' + c); });
  }
}
T.ENTRIES.forEach(e => { const o = T.makeOptions(e, null, 6); e.d.forEach(c => ok(o.options.indexOf(c) >= 0, 'hand-picked distractor kept: ' + e.a + c)); });
const recent = []; let rep = 0;
for (let k = 0; k < 2000; k++) { const i = T.pickEntry(recent); if (recent.includes(i)) rep++; recent.push(i); if (recent.length > 10) recent.shift(); }
ok(rep === 0, 'recent questions are not repeated');

// ══ V1.57.0 旋轉的遮片 ══
const SHAPES = ['pizza', 'stripes', 'checker', 'wave', 'spiral', 'emoji'];
// ── 形狀的出現時機 ──
ok(Object.keys(T.SHAPE_FROM).sort().join() === SHAPES.slice().sort().join(), '六種遮片：' + Object.keys(T.SHAPE_FROM).join('、'));
ok(T.shapesFor(1).length >= 1 && T.shapesFor(1).every(s => T.SHAPE_FROM[s] <= 1), '第 1 題只有一開始就有的形狀：' + T.shapesFor(1));
for (let q = 2; q <= 40; q++) ok(T.shapesFor(q).length >= T.shapesFor(q - 1).length, '形狀只增不減 ' + q);
ok(SHAPES.every(s => T.shapesFor(60).indexOf(s) >= 0), '後面六種都會出現');
// ── 難度曲線：空隙越來越小、轉速加快到最難的速度、五彩繽紛機率增加、emoji 格數增加 ──
ok(near(T.openFor(1), T.OPEN[0]) && near(T.openFor(T.LEVEL_RAMP), T.OPEN[1]) && near(T.openFor(99), T.OPEN[1]) && T.OPEN[0] <= 0.5 && T.OPEN[1] > 0 && T.OPEN[1] < T.OPEN[0], '遮片空隙 ' + T.OPEN + '（越小越難）');
ok(near(T.speedFor(1), T.SPEED[0]) && near(T.speedFor(T.LEVEL_RAMP), T.SPEED[1]) && near(T.speedFor(99), T.SPEED[1]), '轉速 ' + T.SPEED + ' 度／秒');
ok(T.SPEED[0] < T.SPEED[1] && T.SPEED[1] <= 360 && T.SPEED[1] >= 60, '轉速要適中：從慢加快到最難的速度（到頂 ' + T.SPEED[1] + ' 度／秒，不超過每秒一圈）；太慢或太快都比較好認');
ok(near(T.colorPFor(1), T.COLOR_P[0]) && near(T.colorPFor(T.LEVEL_RAMP), T.COLOR_P[1]) && T.COLOR_P[1] > T.COLOR_P[0], '五彩繽紛的機率 ' + T.COLOR_P);
ok(T.emojiNFor(1) === T.EMOJI_N[0] && T.emojiNFor(T.LEVEL_RAMP) === T.EMOJI_N[1] && T.emojiNFor(99) === T.EMOJI_N[1] && T.EMOJI_N[0] === 2 && T.EMOJI_N[1] === 7, 'emoji 方陣每邊 2 → 7 個（4 宮格 → 49 宮格）');
for (let q = 2; q <= 50; q++) ok(T.openFor(q) <= T.openFor(q - 1) + 1e-12 && T.speedFor(q) >= T.speedFor(q - 1) - 1e-12 && T.colorPFor(q) >= T.colorPFor(q - 1) - 1e-12 && T.emojiNFor(q) >= T.emojiNFor(q - 1), '難度單調 ' + q);
{ const ns = new Set(); for (let q = 1; q <= T.LEVEL_RAMP; q++) ns.add(T.emojiNFor(q)); ok([2, 3, 4, 5, 6, 7].every(n => ns.has(n)), 'emoji 方陣 4、9、16、25、36、49 宮格都會出現：' + [...ns]); }
// ── 每一題的遮片 ──
for (let i = 0; i < 1500; i++) {
  const q = 1 + (i % 45), m = T.makeMask(q, rnd);
  ok(T.shapesFor(q).indexOf(m.shape) >= 0, '第 ' + q + ' 題的形狀 ' + m.shape + ' 已經出現');
  ok(near(m.open, T.openFor(q)) && m.dir * m.dir === 1 && m.theta0 >= 0 && m.theta0 < 2 * Math.PI + 1e-9, '遮片基本欄位');
  ok(Math.abs(m.speed / T.speedFor(q) - 1) <= T.SPEED_JITTER + 1e-9, '轉速在基準 ±' + T.SPEED_JITTER * 100 + '% 內：' + m.speed.toFixed(1));
  if (m.shape === 'emoji') { ok(!m.colorful && m.n === T.emojiNFor(q) && m.cells.length === m.n * m.n && m.cells.every(c => T.EMOJI_CATS[m.cat].indexOf(c) >= 0), 'emoji 方陣 ' + m.n + '×' + m.n + '，圖案都是「' + m.cat + '」這一類'); }
  else if (m.shape !== 'pizza') { ok(m.pitch >= T.PITCH[m.shape][0] - 1e-12 && m.pitch <= T.PITCH[m.shape][1] + 1e-12, m.shape + ' 紋路間距在範圍內'); }
}
{ let c1 = 0, cT = 0, N = 3000; for (let i = 0; i < N; i++) { if (T.makeMask(1, rnd).colorful) c1++; const m = T.makeMask(T.LEVEL_RAMP + 20, rnd); if (m.shape !== 'emoji' && m.colorful) cT++; } ok(c1 / N < 0.05, '第 1 題幾乎都是白色遮片（' + (c1 / N * 100).toFixed(1) + '%）'); const nonEmojiShare = 1 - 1 / T.shapesFor(60).length; ok(Math.abs(cT / N / nonEmojiShare - T.COLOR_P[1]) < 0.06, '到頂的非 emoji 遮片有 ' + (cT / N / nonEmojiShare * 100).toFixed(0) + '% 是五彩繽紛（參數 ' + T.COLOR_P[1] * 100 + '%）'); }
{ let cw = 0, ccw = 0; for (let i = 0; i < 1000; i++) { if (T.makeMask(10, rnd).dir > 0) cw++; else ccw++; } ok(cw > 400 && ccw > 400, '順時針、逆時針各一半（' + cw + '／' + ccw + '）'); }
ok(near(T.maskAngle({ theta0: 1, dir: 1, speed: 90 }, 2), 1 + Math.PI) && near(T.maskAngle({ theta0: 1, dir: -1, speed: 90 }, 2), 1 - Math.PI), '轉的角度＝起始角度 ± 轉速 × 時間');
// ── 遮片真的露出「空隙」那麼多（pure 幾何 coverAt；畫圖的程式用同一組幾何）──
const U = 240;
for (const shape of ['stripes', 'checker', 'wave', 'spiral', 'pizza']) for (const open of [0.5, 0.35, 0.15]) {
  const fr = []; for (let i = 0; i < 12; i++) { const m = T.makeMask(40, rnd); m.shape = shape; m.open = open; m.pitch = (T.PITCH[shape] || [0.12, 0.12])[0] + 0.02 * (i % 4); if (shape === 'wave') { m.amp = m.pitch * 0.8; m.lambda = 0.4; m.phase = i; } m.theta0 = i; fr.push(T.visibleFraction(m, U, 80)); }
  const avg = fr.reduce((a, b) => a + b, 0) / fr.length, tol = shape === 'pizza' ? 0.1 : (shape === 'spiral' ? 0.07 : 0.06);
  ok(Math.abs(avg - open) <= tol, shape + '：空隙 ' + open + ' → 實際露出 ' + (avg * 100).toFixed(1) + '%');
}
{ const m = T.makeMask(40, rnd); m.shape = 'emoji'; m.n = 5; m.cells = new Array(25).fill('😀'); const f = T.visibleFraction(m, U, 100); ok(Math.abs(f - (1 - Math.PI / 4)) < 0.06, 'emoji 方陣（圓形圖案緊貼）：只剩四個角落的縫，露出約 ' + (f * 100).toFixed(1) + '%（理論 21.5%）'); }
// 同一種遮片：越後面（空隙越小）露出越少
for (const shape of ['stripes', 'checker', 'wave', 'spiral', 'pizza']) {
  const at = q => { const m = T.makeMask(60, rnd); m.shape = shape; m.open = T.openFor(q); m.pitch = (T.PITCH[shape] || [0.12])[0]; if (shape === 'wave') { m.amp = m.pitch * 0.8; m.lambda = 0.4; m.phase = 0; } return T.visibleFraction(m, U, 80); };
  ok(at(1) > at(15) && at(15) > at(T.LEVEL_RAMP), shape + '：露出的比例 ' + (at(1) * 100).toFixed(0) + '% → ' + (at(15) * 100).toFixed(0) + '% → ' + (at(T.LEVEL_RAMP) * 100).toFixed(0) + '%（越後面越少）');
}
// 白色遮片轉到哪裡，字的中心附近都被遮片的「周期」蓋住一部分（不是整個空的）：每種形狀的露出都不是 0 或 100%
for (const shape of SHAPES) { const m = T.makeMask(40, rnd); m.shape = shape; m.open = 0.3; m.pitch = (T.PITCH[shape] || [0.12])[0]; if (shape === 'emoji') { m.n = 3; m.cells = new Array(9).fill('🍎'); } if (shape === 'wave') { m.amp = 0.08; m.lambda = 0.4; m.phase = 0; } const f = T.visibleFraction(m, U, 60); ok(f > 0.05 && f < 0.95, shape + '：露出 ' + (f * 100).toFixed(0) + '%（不是全擋也不是全露）'); }
// ── 彩色遮片的顏色：相鄰的部分色相差很多 ──
{ let minD = 360; for (let k = 0; k < 60; k++) { const d = Math.abs(T.hueOf(k) - T.hueOf(k + 1)), dd = Math.min(d, 360 - d); minD = Math.min(minD, dd); } ok(minD >= 40, '彩色遮片：相鄰的兩個部分色相至少差 ' + minD.toFixed(0) + '°'); }
// ── 畫圖不會出錯：用假的 ctx 把每種形狀（白色與彩色）都畫一遍，有真的畫東西 ──
function fakeCtx() { const calls = { fill: 0, stroke: 0, fillRect: 0, emoji: 0 }; const c = new Proxy({}, { get(t, k) { if (k === 'calls') return calls; if (k === 'fill') return () => calls.fill++; if (k === 'stroke') return () => calls.stroke++; if (k === 'fillRect') return () => calls.fillRect++; return () => { }; }, set() { return true; } }); return c; }
for (const shape of SHAPES) for (const colorful of [false, true]) {
  if (shape === 'emoji' && colorful) continue;
  const m = T.makeMask(40, rnd); m.shape = shape; m.colorful = colorful; m.open = 0.3; m.pitch = (T.PITCH[shape] || [0.12])[0]; if (shape === 'wave') { m.amp = 0.08; m.lambda = 0.4; m.phase = 0; } if (shape === 'emoji') { m.n = 4; m.cells = new Array(16).fill('🍎'); }
  const cx = fakeCtx(); let emojis = 0;
  T.drawMask(cx, m, 220, 0.7, { white: '#fff', edge: '#888' }, () => { emojis++; });
  const calls = cx.calls;
  if (shape === 'emoji') ok(emojis === 16, 'emoji 方陣 4×4 畫了 ' + emojis + ' 個圖案');
  else ok(calls.fill + calls.stroke + calls.fillRect >= 1, shape + (colorful ? '（彩色）' : '') + '：有畫東西 ' + JSON.stringify(calls));
}
// ── V1.57.0 玩家意見：比薩改成多個切口、平均分擔空隙（轉速慢時，只有一個窄切口慢慢掃，看不清全貌）──
ok(Array.isArray(T.PIZZA_CUTS) && T.PIZZA_CUTS.length === 2 && T.PIZZA_CUTS.every(x => x >= 2), '比薩切口數 PIZZA_CUTS 是 [第 1 題, 到頂]，至少 2 個：' + T.PIZZA_CUTS);
ok(T.pizzaCutsFor(1) === Math.max(2, Math.round(T.PIZZA_CUTS[0])) && T.pizzaCutsFor(T.LEVEL_RAMP) === Math.max(2, Math.round(T.PIZZA_CUTS[1])) && T.pizzaCutsFor(99) === T.pizzaCutsFor(T.LEVEL_RAMP) && T.pizzaCutsFor(1) >= 2, '切口數：第 1 題 ' + T.pizzaCutsFor(1) + '、到頂 ' + T.pizzaCutsFor(T.LEVEL_RAMP) + '（至少 2 個）');
{ const sg = Math.sign(T.PIZZA_CUTS[1] - T.PIZZA_CUTS[0]); for (let q = 2; q <= 60; q++) ok((T.pizzaCutsFor(q) - T.pizzaCutsFor(q - 1)) * sg >= 0, '切口數隨題號單調 ' + q); }
{ let seen = 0; for (let i = 0; i < 3000 && seen < 200; i++) { const q = 1 + (i % 40), m = T.makeMask(q, rnd); if (m.shape === 'pizza') { seen++; ok(m.cuts === T.pizzaCutsFor(q) && m.cuts >= 2, '第 ' + q + ' 題的比薩有 ' + m.cuts + ' 個切口'); } else ok(m.cuts === undefined, '只有比薩有切口'); } ok(seen >= 100, '出過很多比薩（' + seen + '）'); }
for (const n of [2, 3, 4, 6, 8]) for (const open of [0.5, 0.3, 0.15, 0.05]) {
  const m = { shape: 'pizza', open, cuts: n, colorful: false }, step = 2 * Math.PI / n, hw = open * Math.PI / n;
  // 切口：沿著一個圓走一圈，連續「看得到」的一段就是一個切口——剛好 n 個、一樣寬、平均分布
  const N = 36000, r = 60, runs = []; let cur = null, first = null;
  for (let i = 0; i < N; i++) { const a = i / N * 2 * Math.PI, vis = !T.coverAt(m, r * Math.cos(a), r * Math.sin(a), 240); if (vis) { if (!cur) cur = { s: a, e: a }; cur.e = a; } else if (cur) { runs.push(cur); cur = null; } }
  if (cur) { if (runs.length && runs[0].s === 0) { runs[0].s = cur.s - 2 * Math.PI; } else runs.push(cur); }
  ok(runs.length === n, n + ' 個切口、空隙 ' + open + '：沿圓走一圈看到 ' + runs.length + ' 段開口');
  if (runs.length === n) {
    const wd = runs.map(x => x.e - x.s), ctr = runs.map(x => (x.s + x.e) / 2).sort((a, b) => a - b);
    ok(wd.every(w => Math.abs(w - 2 * hw) < 0.01), n + ' 個切口、空隙 ' + open + '：每個切口一樣寬（' + (2 * hw * 180 / Math.PI).toFixed(1) + '°）');
    ok(ctr.every((c, i) => Math.abs(((ctr[(i + 1) % n] - c) + 2 * Math.PI) % (2 * Math.PI) - step) < 0.01 || n === 1), n + ' 個切口：中心每隔 ' + (step * 180 / Math.PI).toFixed(0) + '° 一個，平均分布');
    ok(Math.max(...wd) <= 2 * Math.PI * open / n + 0.01 && Math.max(...wd) <= 2 * Math.PI * open / 2 + 0.01, '最寬的切口只有 ' + (Math.max(...wd) * 180 / Math.PI).toFixed(1) + '°（單一切口要 ' + (open * 360).toFixed(0) + '°）：空隙平均分給每個切口');
  }
  // 轉 step 的整數倍，整片遮片一模一樣
  let same = true; for (let k = 0; k < 200; k++) { const a = rnd() * 6.28, rr = 10 + rnd() * 100, x = rr * Math.cos(a), y = rr * Math.sin(a), a2 = a + step * (1 + Math.floor(rnd() * 5)); if (T.coverAt(m, x, y, 240) !== T.coverAt(m, rr * Math.cos(a2), rr * Math.sin(a2), 240)) same = false; } ok(same, n + ' 個切口：轉 360°÷' + n + ' 之後遮片完全重合（旋轉對稱）');
  // 字的範圍是正方形：切口剛好對著邊的中間時，露出的面積比對著角落時少，所以要把遮片轉一圈（取 16 個角度）平均，才等於空隙
  let sum = 0, cnt = 0, mn = 1, mx = 0; for (let t = 0; t < 16; t++) { const al = t / 16 * step; let o = 0, tot = 0; for (let i = 0; i < 70; i++) for (let j = 0; j < 70; j++) { const x = (i + 0.5) / 70 * 240 - 120, y = (j + 0.5) / 70 * 240 - 120, c = Math.cos(al), s = Math.sin(al); if (!T.coverAt(m, x * c + y * s, -x * s + y * c, 240)) o++; tot++; } const f = o / tot; sum += f; cnt++; mn = Math.min(mn, f); mx = Math.max(mx, f); }
  ok(Math.abs(sum / cnt - open) <= 0.025, n + ' 個切口、空隙 ' + open + '：轉一圈平均露出 ' + (sum / cnt * 100).toFixed(1) + '%（最少 ' + (mn * 100).toFixed(1) + '%、最多 ' + (mx * 100).toFixed(1) + '%）');
}
// 比薩的畫法：每個切口之間是一塊比薩（白色或彩色），塊數＝切口數
for (const n of [2, 3, 5, 8]) for (const colorful of [false, true]) {
  const m = { shape: 'pizza', open: 0.2, cuts: n, colorful }; const fills = [], cx = new Proxy({}, { get(t, k) { if (k === 'fillStyle') return t.fs; return () => { if (k === 'fill') fills.push(t.fs); }; }, set(t, k, v) { t[k] = k === 'fillStyle' ? v : t[k]; if (k === 'fillStyle') t.fs = v; return true; } });
  T.drawMask(cx, m, 220, 0.3, { white: '#fff', edge: '#888' }, () => { });
  ok(fills.length === n, n + ' 個切口、' + (colorful ? '彩色' : '白色') + '：畫了 ' + fills.length + ' 塊比薩（＝切口數）');
  if (colorful) ok(new Set(fills).size === n, '彩色：每一塊顏色不同'); else ok(new Set(fills).size === 1 && fills[0] === '#fff', '白色：每一塊都是白色');
}
// ── V1.57.0 玩家意見：盡量放大題目字（畫面寬度的 90%）──
ok(T.CHAR_W > 0.5 && T.CHAR_W <= 1, '題目字的大小是畫面寬度的 CHAR_W 倍（預設 0.9，目前 ' + T.CHAR_W + '）');
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_halfchar.js'), cssNc = rd('../../css/games/reaction_halfchar.css').replace(/\/\*[\s\S]*?\*\//g, '').split(/\s+/).join(' '), code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/U = Math\.floor\(Math\.min\(CHAR_W \* charBox\.offsetWidth, side\)\)/.test(src), '字的大小 ＝ 畫面寬度 × CHAR_W（放不進畫布才縮小）');
  ok(!/CHAR_FRAC/.test(code) && !/halfchar-prompt/.test(code), '舊的 CHAR_FRAC（字占畫布的幾成）與單獨一行的題目提示都拿掉了（把高度讓給題目字）');
  ok(/root\.classList\.add\('halfchar-screen'\)/.test(src) && /root\.classList\.remove\('halfchar-screen'\)/.test(src) && /\.screen\.halfchar-screen \{[^}]*gap: 6px[^}]*padding-top: 4px/.test(cssNc), '標題與字框的空隙縮小（halfchar-screen）、離開時拿掉');
  ok(/\.halfchar-opt \{[^}]*height: (\d+)px/.test(cssNc) && Number(/\.halfchar-opt \{[^}]*height: (\d+)px/.exec(cssNc)[1]) <= 100, '選項按鈕不超過 100 px 高（讓出高度給題目字）'); }

// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_halfchar.js'), css = rd('../../css/games/reaction_halfchar.css').replace(/\/\*[\s\S]*?\*\//g, '').split(/\s+/).join(' ');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/EP\.whenReady\(root, function \(\) \{ if \(!my\.dead\) begin\(my, startAt\); \}\)/.test(src), 'emoji 圖片載好才開始（限時遊戲要公平）');
  ok(/drawMask\(g2, M, U, maskAngle\(M, tSec\), pal, drawEmoji\)/.test(src) && /my\.loop\(function \(now\)/.test(src), '每個畫面更新把遮片轉一點');
  ok(!/clipPath/.test(code) && !/clip-path/.test(code), '不再用 CSS clip-path 遮字');
  ok(/draw\(0, false\);/.test(src), '揭曉時拿掉遮片、整個字亮出來');
  ok(/\.halfchar-canvas \{[^}]*display: block/.test(css) && !/\.halfchar-char/.test(css), 'css 有畫布、沒有舊的大字');
  ok(src.indexOf("'js/emoji_png.js'") < 0 && /Reaction\.emojiPng/.test(src), '用共用的 emoji 圖片庫'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
