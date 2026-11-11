const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_alignchar.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261032); const rnd = rng(SEED);

// 玩家自己調過 STRIPS／OPTIONS／CYCLE_S／TIME_S／ALIGN_AT／KMAX（V1.53：KMAX 是 [第 1 關, 到頂] 兩個數字）：測試跟著參數走
ok(T.stripsFor(1) === T.STRIPS[0] && T.stripsFor(T.RAMP_LEVELS) === T.STRIPS[1] && T.stripsFor(60) === T.STRIPS[1], '直條 ' + T.STRIPS);
ok(T.optionsFor(1) === T.OPTIONS[0] && T.optionsFor(T.RAMP_LEVELS) === T.OPTIONS[1], '選項 ' + T.OPTIONS);
ok(near(T.cycleFor(1), T.CYCLE_S[0]) && near(T.cycleFor(T.RAMP_LEVELS), T.CYCLE_S[1]) && T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '週期 ' + T.CYCLE_S + ' 秒、限時 ' + T.TIME_S + ' 秒');
ok(Array.isArray(T.KMAX) && T.KMAX.length === 2 && near(T.kmaxFor(1), T.KMAX[0]) && near(T.kmaxFor(T.RAMP_LEVELS), T.KMAX[1]) && near(T.kmaxFor(99), T.KMAX[1]), 'KMAX ' + T.KMAX + '：第 1 關 → 到頂');
for (let l = 2; l <= 60; l++) ok(((T.KMAX[1] >= T.KMAX[0]) ? T.kmaxFor(l) >= T.kmaxFor(l - 1) - 1e-12 : T.kmaxFor(l) <= T.kmaxFor(l - 1) + 1e-12) && T.stripsFor(l) >= T.stripsFor(l - 1) && T.optionsFor(l) >= T.optionsFor(l - 1) && (T.CYCLE_S[1] <= T.CYCLE_S[0] ? T.cycleFor(l) <= T.cycleFor(l - 1) + 1e-12 : T.cycleFor(l) >= T.cycleFor(l - 1) - 1e-12) && (T.TIME_S[1] <= T.TIME_S[0] ? T.timeMs(l) <= T.timeMs(l - 1) : T.timeMs(l) >= T.timeMs(l - 1)), '單調 ' + l);
// 群組完整性
T.GROUPS.forEach((g, i) => ok(g.length >= 4 && new Set(g).size === g.length && g.every(c => [...c].length === 1), '群組 ' + i + ' 合法'));
ok(T.CHARS.length >= 60, '字數 ' + T.CHARS.length);
// ── 速度表（每一條直條的 segs＝[{ t0, v, x0 }]）：位置＝x0 ＋ v × (t − t0)，偏移＝取小數部分 × P ──
const P = T.PIC.h;
ok(near(T.frac(-0.25), 0.75) && near(T.frac(3.25), 0.25) && near(T.gapOf(0.9), 0.1) && near(T.gapOf(-0.3), 0.3) && near(T.gapOf(5), 0) && near(T.gapOf(0.5), 0.5), 'frac／gapOf');
{ const s = { segs: [{ t0: 0, v: 0.5, x0: 0.25 }, { t0: 2, v: -1, x0: 1.25 }] };
  ok(near(T.stripPos(s, 0), 0.25) && near(T.stripPos(s, 1), 0.75) && near(T.stripPos(s, 2), 1.25) && near(T.stripPos(s, 3), 0.25) && near(T.stripPos(s, 10), 1.25 - 8), 'stripPos：分段、換速度的那一刻位置連續');
  ok(near(T.stripOffset(s, 3, P), 0.25 * P) && near(T.stripOffset(s, 3.5, P), 0.75 * P) && T.stripOffset(s, 3.5, P) >= 0 && T.stripOffset(s, 3.5, P) < P, 'stripOffset：往上（負）也繞回 0～P');
  ok(near(T.misalign([s, { segs: [{ t0: 0, v: 0, x0: 0 }] }], 1, P), 0.25 * P) && T.alignedCount([s, { segs: [{ t0: 0, v: 0, x0: 0 }] }], 1, 0.01) === 1, 'misalign／alignedCount'); }
// solveSpeed：結尾剛好落在對準位置（整數）、速度在 KMIN～KMAX 倍之內
for (let i = 0; i < 3000; i++) {
  const x = rnd() * 40 - 20, cyc = 3 + rnd() * 20, d = cyc * (0.24 + rnd() * 0.4), v = T.solveSpeed(x, d, cyc, rnd);
  ok(T.gapOf(x + v * d) < 1e-9, 'solveSpeed 結尾對準');
  if ((T.KMAX[1] - T.KMIN) * 0.24 >= 1) ok(Math.abs(v) * cyc >= T.KMIN - 1e-9 && Math.abs(v) * cyc <= T.KMAX[1] + 1e-9, 'solveSpeed 速度倍數 ' + (Math.abs(v) * cyc).toFixed(2) + ' 在 ' + T.KMIN + '～' + T.KMAX[1]);
  { const km = 5 + rnd() * 10, v2 = T.solveSpeed(x, d, cyc, rnd, km); ok(T.gapOf(x + v2 * d) < 1e-9, 'solveSpeed 指定這一關的 KMAX 也對準'); if ((km - T.KMIN) * 0.24 >= 1) ok(Math.abs(v2) * cyc <= km + 1e-9 && Math.abs(v2) * cyc >= T.KMIN - 1e-9, 'solveSpeed 速度倍數不超過這一關的 KMAX（' + km.toFixed(1) + '）'); }
}
// leftCount：至少 2 條、至多 n−1 條
for (let n = 3; n <= 80; n++) { const l = T.leftCount(n); ok(l >= 2 && l <= n - 1, 'leftCount(' + n + ')＝' + l); }
ok(T.leftCount(T.STRIPS[0]) >= 2 && T.leftCount(T.STRIPS[1]) >= 2 && T.leftCount(T.STRIPS[1]) < T.STRIPS[1], '最少、最多直條數的最左邊幾條');
// ── 出題：速度會變、方向有正有負、最左邊反向又快、任何時刻都不會完整對齊、接近對齊時只有最左邊幾條偏掉 ──
let leftSpd = 0, leftN = 0, normSpd = 0, normN = 0, inRange = 0, normSegs = 0, anyUp = false, anyDown = false;
for (let i = 0; i < 400; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, rnd), cyc = q.cycle, n = q.n;
  ok(q.strips.length === n && q.left === T.leftCount(n) && q.left >= 2 && q.left < n, '直條數 ' + n + '、最左邊 ' + q.left + ' 條');
  ok(q.horizon >= T.timeMs(lv) / 1000, '速度表排到限時之後');
  ok(near(q.kmax, T.kmaxFor(lv)), '這一關的 KMAX ＝ ' + q.kmax.toFixed(2));
  q.strips.forEach((s, idx) => {
    const sg = s.segs, left = idx < q.left;
    ok(sg.length >= 2 && sg[0].t0 === 0 && sg.every((x, k) => k === 0 || (x.t0 > sg[k - 1].t0 && near(x.x0, sg[k - 1].x0 + sg[k - 1].v * (x.t0 - sg[k - 1].t0), 1e-6))), '速度表時間遞增、位置連續');
    ok(new Set(sg.map(x => Math.round(Math.abs(x.v) * 1e6))).size >= 2, '每一條的速度會變（至少兩種）');
    const durs = sg.slice(0, -1).map((x, k) => sg[k + 1].t0 - x.t0); ok(new Set(durs.map(x => Math.round(x * 1000))).size >= 2, '每一段長度不等（變速的時間點不固定）');
    ok(T.stripOffset(s, rnd() * q.horizon, P) >= 0 && T.stripOffset(s, rnd() * q.horizon, P) < P, '偏移在 0～P');
    if (left) {
      ok(sg.every(x => (idx % 2 === 0 ? x.v < 0 : x.v > 0)), '最左邊第 ' + (idx + 1) + ' 條：相鄰兩條方向相反（單數往上、雙數往下）');
      ok(sg.every(x => Math.abs(x.v) * cyc >= q.kmax * T.LEFT_K[0] - 1e-6 && Math.abs(x.v) * cyc <= q.kmax * T.LEFT_K[1] + 1e-6), '最左邊的速度倍數在這一關的 KMAX（' + q.kmax.toFixed(1) + '）× ' + T.LEFT_K + ' 之內');
      sg.forEach(x => { leftSpd += Math.abs(x.v) * cyc; leftN++; });
    } else sg.forEach(x => { const m = Math.abs(x.v) * cyc; normSpd += m; normN++; normSegs++; if (m >= T.KMIN - 1e-6 && m <= q.kmax + 1e-6) inRange++; if (x.v > 0) anyDown = true; else anyUp = true; });
  });
  // 任何時刻都不會「所有直條同時對準」
  ok(T.neverAligned(q.strips, q.horizon), '第 ' + lv + ' 關：整個限時內不會完整對齊');
  { let worst = 1e9; for (let t = 0.001; t <= q.horizon; t += 0.007) worst = Math.min(worst, T.misalign(q.strips, t, P));
    ok(worst > T.FULL_TOL * P * 0.98, '第 ' + lv + ' 關：任何時刻都至少有一條偏離對準 ' + worst.toFixed(1) + ' px（> ' + (T.FULL_TOL * P).toFixed(1) + '）'); }
  // 接近對齊的時刻：第一次在 0.4～1 個週期、之後每隔 0.75～1.25 個週期（不等）；一般直條剛好對準、最左邊那幾條至少偏 MISS_MIN
  if (T.NEAR_ALIGN) {
    ok(q.peaks.length >= 1 && q.tAlign === q.peaks[0] && q.tAlign >= cyc * 0.4 - 1e-9 && q.tAlign <= cyc + 1e-9, '第一次接近對齊 ' + q.tAlign.toFixed(2) + ' 秒（週期 ' + cyc.toFixed(2) + '）');
    q.peaks.forEach((pk, k) => {
      if (k > 0) { const gp = pk - q.peaks[k - 1]; ok(gp >= cyc * 0.75 - 1e-9 && gp <= cyc * 1.25 + 1e-9, '兩次接近對齊相隔 ' + gp.toFixed(2) + ' 秒（週期 ' + cyc.toFixed(2) + '）'); }
      q.strips.forEach((s, idx) => { const gp = T.gapOf(T.stripPos(s, pk)); if (idx < q.left) ok(gp >= T.MISS_MIN - 1e-9, '接近對齊那一刻，最左邊第 ' + (idx + 1) + ' 條偏離 ' + gp.toFixed(3) + '（≥ ' + T.MISS_MIN + '）'); else ok(gp < 1e-6, '接近對齊那一刻，第 ' + (idx + 1) + ' 條剛好對準'); });
      ok(T.alignedCount(q.strips, pk, 1e-6) === n - q.left && T.misalign(q.strips, pk, P) >= T.MISS_MIN * P - 1e-6, '接近對齊那一刻：對準 ' + (n - q.left) + ' 條、最左邊 ' + q.left + ' 條沒對準，字不完整');
    });
    if (q.peaks.length >= 3) ok(new Set(q.peaks.slice(1).map((p, k) => Math.round((p - q.peaks[k]) * 1000))).size >= 2, '接近對齊的間隔不固定');
  }
  ok(q.options.length === T.optionsFor(lv) && new Set(q.options).size === q.options.length && q.options[q.answer] === q.ch, '選項');
  ok(T.CHARS.includes(q.ch), '字在字庫');
  ok(q.options.filter(c => c !== q.ch).every(c => T.GROUPS.some(g => g.includes(q.ch) && g.includes(c))) || T.GROUPS.filter(g => g.includes(q.ch)).reduce((a, g) => a + g.length, 0) < 6, '選項優先同群');
}
ok(anyUp && anyDown, '一般直條有往上也有往下的段');
ok(leftN > 0 && normN > 0 && leftSpd / leftN > normSpd / normN * 1.3, '最左邊的平均速度倍數 ' + (leftSpd / leftN).toFixed(1) + ' 明顯比其他直條 ' + (normSpd / normN).toFixed(1) + ' 快');
ok(inRange / normSegs >= 0.9, '一般直條的速度倍數 ≥ 90% 落在 ' + T.KMIN + '～（這一關的 KMAX）（算好對準用的最後一段偶爾超出）：' + (inRange / normSegs * 100).toFixed(1) + '%');
// 同一個種子出同一份速度表（動作是時間的純函式）
{ const a = T.makeLevel(12, rng(99)), b = T.makeLevel(12, rng(99)), c = T.makeLevel(12, rng(100)); ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a.strips) !== JSON.stringify(c.strips), '同一個種子＝同一份速度表'); }
// 答案位置、字都會變化
const pos = new Set(), chs = new Set(); for (let i = 0; i < 400; i++) { const q = T.makeLevel(10, rnd); pos.add(q.answer); chs.add(q.ch); } ok(pos.size >= 5 && chs.size >= 30, '答案位置與字有變化 ' + pos.size + '/' + chs.size);
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(8) && T.rating(8) !== T.rating(14) && T.rating(14) !== T.rating(25), '評語分級');
// V1.29：答案按鈕字形＝明體／宋體（--font-note），題目字形（canvas 用頁面黑體）不變
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), css = rd('../../css/games/reaction_alignchar.css').split(/s+/).join(' '), theme = rd('../../css/theme.css'), src = rd('../../js/reaction_alignchar.js');
  const i = css.indexOf('.alignchar-opt {');
  ok(i > 0 && css.slice(i, i + 160).indexOf('font-family: var(--font-note)') > 0, '答案按鈕用明體／宋體（--font-note）');
  ok(/--font-note: "Noto Serif TC"[^;]*(Songti TC|PMingLiU)[^;]*serif;/.test(theme) && /--font-ui: "Noto Sans TC"/.test(theme), '--font-note 是襯線字型、--font-ui 是黑體（兩者不同）');
  ok(src.indexOf("getComputedStyle(document.body).fontFamily") > 0, '題目的字形維持不變（頁面字型）'); }
// 選項再多（6 個）也排成一橫排貼在畫面下方，不拆成上下兩排；字的大小＝按鈕短邊的 4/5
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src2 = rd('../../js/reaction_alignchar.js'), css2 = rd('../../css/games/reaction_alignchar.css').replace(/[ 	]*\/\*[\s\S]*?\*\//g, '');
  ok(/cols: q\.options\.length, h: 84, gap: 8/.test(src2) && !/options\.length <= 5 \? q\.options\.length : 3/.test(src2), '選項有幾個就幾欄：一橫排（6 個也不拆成兩排）');
  ok(T.OPT_FONT === 0.8 && /Math\.min\(b\.offsetWidth \|\| 72, b\.offsetHeight \|\| 84\) \* OPT_FONT/.test(src2), '答案的字＝按鈕短邊 × OPT_FONT（4/5）');
  ok(/\.rx-grid \.alignchar-opt\s*\{[^}]*padding:\s*0;/.test(css2), '答案按鈕左右不留內縮（大字放得下）');
  // 6 個選項、一橫排：每顆按鈕寬 (472 − 5×8) ÷ 6 ≈ 72 px，字約 58 px、放得進按鈕
  const w6 = (472 - 5 * 8) / 6, fs6 = Math.round(Math.min(w6, 84) * T.OPT_FONT); ok(fs6 >= 56 && fs6 <= w6 - 10, '6 個選項：按鈕寬 ' + w6.toFixed(1) + ' px、字 ' + fs6 + ' px，放得進去'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
