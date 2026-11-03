// 照號切水果（ordercut，企劃 377）的純函式檢查：難度線性、算式（答案不重複、整除、獨立算法驗證）、拋物線與保證切得完、劃過判定與順序、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_ordercut.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261211), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性）──
if (T.EXPR_FROM > 1) ok(T.countFor(1) === T.NUM_COUNT[0] && T.countFor(T.NUM_RAMP) === T.NUM_COUNT[1] && T.countFor(T.EXPR_FROM - 1) === T.NUM_COUNT[1], '數字關水果數 ' + T.NUM_COUNT + '（第 ' + T.NUM_RAMP + ' 關到頂）');   // EXPR_FROM 是 1＝第 1 關就是算式，沒有純數字關（玩家自己調過）
ok(T.countFor(T.EXPR_FROM) === T.EXPR_COUNT[0] && T.countFor(T.EXPR_FROM + T.EXPR_RAMP - 1) === T.EXPR_COUNT[1] && T.countFor(99) === T.EXPR_COUNT[1], '算式關水果數 ' + T.EXPR_COUNT + '（從第 ' + T.EXPR_FROM + ' 關起算）');
ok(T.isExpr(T.EXPR_FROM) === true && (T.EXPR_FROM === 1 || T.isExpr(T.EXPR_FROM - 1) === false), '第 ' + T.EXPR_FROM + ' 關起改成算式（玩家自己調過）');
{ let prev = 0; for (let lv = 1; lv < T.EXPR_FROM; lv++) { const n = T.countFor(lv); ok(n >= prev, '數字關水果數單調'); prev = n; } prev = 0; for (let lv = T.EXPR_FROM; lv < T.EXPR_FROM + 20; lv++) { const n = T.countFor(lv); ok(n >= prev, '算式關水果數單調'); prev = n; } }
ok(near(T.flightFor(1), T.FLIGHT_S[0]) && near(T.flightFor(T.RAMP_LEVELS), T.FLIGHT_S[1]) && near(T.gapFor(1), T.GAP_CUT[0]) && near(T.gapFor(T.RAMP_LEVELS), T.GAP_CUT[1]) && near(T.chaosFor(1), T.CHAOS[0]) && near(T.chaosFor(T.RAMP_LEVELS), T.CHAOS[1]) && T.omegaFor(1) === T.OMEGA_DEG[0] && T.omegaFor(T.RAMP_LEVELS) === T.OMEGA_DEG[1], '飛行時間／間隔／混亂度／旋轉速度');
for (let n = 2; n <= T.RAMP_LEVELS + 2; n++) ok(T.flightFor(n) <= T.flightFor(n - 1) && T.gapFor(n) <= T.gapFor(n - 1) && T.chaosFor(n) >= T.chaosFor(n - 1) && T.omegaFor(n) >= T.omegaFor(n - 1), '單調 ' + n);
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) d.push(T.flightFor(n - 1) - T.flightFor(n)); ok(Math.max(...d) - Math.min(...d) <= 0.002, '飛行時間線性縮短：每關 −' + Math.min(...d).toFixed(4) + '～−' + Math.max(...d).toFixed(4)); }
ok((T.EXPR_FROM === 1 || T.radiusFor(1, 472) === T.R_NUM) && T.radiusFor(T.EXPR_FROM, 472) === T.R_EXPR && T.radiusFor(T.EXPR_FROM, 236) < T.R_EXPR, '算式關水果比較大、窄螢幕縮小');

// ── 算式：用獨立算法（從文字解析、重算）驗證；答案一定是 1、2、3…n，不能跳號 ──
function evalText(t) { const m = /^(\d+)([＋－×÷])(\d+)$/.exec(t); if (!m) return null; const a = +m[1], b = +m[3]; return m[2] === '＋' ? a + b : m[2] === '－' ? a - b : m[2] === '×' ? a * b : (a % b === 0 ? a / b : NaN); }
for (let v = 1; v <= 99; v++) for (let rep = 0; rep < 40; rep++) {
  const ops = [['+', '-'], ['+', '-', '*', '/']][rep % 2], e = T.makeExprFor(v, ops, rnd), r = evalText(e.text), m = /^(\d+)([＋－×÷])(\d+)$/.exec(e.text);
  ok(e.value === v && r === v, '算式 ' + e.text + ' 要等於 ' + v + '（獨立算：' + r + '）');
  ok(+m[1] <= 99 && +m[3] <= 99 && +m[1] >= 1 && +m[3] >= 1, '算式裡的數字都在 1～99：' + e.text);
  if (m[2] === '－') ok(+m[1] > +m[3], '減法不會是負的'); if (m[2] === '÷') ok(+m[3] >= 2 && +m[1] % +m[3] === 0, '除法整除');
  if (m[2] === '×') ok(+m[1] >= 2 && +m[1] <= 12 && +m[3] >= 2 && +m[3] <= 12, '乘法兩個數字都在 2～12');
  if (rep % 2 === 0) ok(m[2] === '＋' || m[2] === '－', '只有加減');
  if (v === 1) ok(m[2] === '－' || m[2] === '÷', '答案 1 湊不出加法／乘法');
}
{ const seen = new Set(); for (let i = 0; i < 4000; i++) { const m = /^(\d+)([＋－×÷])(\d+)$/.exec(T.makeExprFor(12, ['+', '-', '*', '/'], rnd).text); seen.add(m[2]); } ok(seen.size === 4, '答案 12 的算式四種運算都會出現'); }
ok(JSON.stringify(T.mulPairs(12)) === '[[2,6],[3,4],[4,3],[6,2]]' && T.mulPairs(7).length === 0 && T.mulPairs(1).length === 0 && T.mulPairs(144).length === 1, 'mulPairs');
for (let n = 1; n <= 40; n++) for (const ops of [['+', '-'], ['+', '-', '*', '/']]) { const es = T.makeExprs(n, ops, rnd); ok(es.length === n && es.every((e, i) => e.value === i + 1 && evalText(e.text) === i + 1), n + ' 個算式的答案剛好是 1～' + n + '（不跳號）'); }

// ── 出題：全部關卡掃一遍 ──
const ST = { n: 0, mulLevels: 0, minSlack: 99, outOfOrder: {}, ooTot: {}, multi: 0 };
const geoms = [{ W: 472, H: 640 }, { W: 440, H: 560 }, { W: 500, H: 700 }];
for (let lv = 1; lv <= 40; lv++) for (let rep = 0; rep < 60; rep++) {
  const q = T.makeLevel(lv, rnd); ST.n++;
  ok(q.N === T.countFor(lv) && q.fruits.length === q.N && q.plan.length === q.N && q.expr === T.isExpr(lv) && near(q.flight, T.flightFor(lv)), '水果數與參數');
  ok(q.fruits.every((f, k) => f.rank === k + 1), '水果依要切的順序排好');
  for (let k = 1; k < q.N; k++) ok(q.fruits[k].value > q.fruits[k - 1].value, '依答案由小到大：' + q.fruits[k - 1].value + ' < ' + q.fruits[k].value);
  if (!q.expr) { ok(q.fruits.every((f, k) => f.value === k + 1 && f.label === String(k + 1)), '數字關：1～N 各一顆'); }
  else { ok(new Set(q.fruits.map(f => f.value)).size === q.N && q.fruits.every(f => evalText(f.label) === f.value), '算式關：答案都不一樣、標籤算出來就是答案'); if (lv < T.MULDIV_FROM) ok(q.fruits.every(f => !/[×÷]/.test(f.label)), '第 ' + T.MULDIV_FROM + ' 關前沒有乘除'); else if (q.fruits.some(f => /[×÷]/.test(f.label))) ST.mulLevels++; }
  ok(q.fruits.every(f => f.color >= 0 && f.color < T.FRUITS), '水果顏色');
  // 計畫切的時間表
  ok(q.plan[0] >= 0.2 + Math.max(T.U_MIN, T.RISE_FRAC) * q.flight - 0.002, '第一次切在第一波噴出、過了頂點之後：' + q.plan[0]);
  // 一波一波發射：每波顆數不超過設定（最後剩 1 顆時併進前一波，最多多 1 顆），加起來剛好 N 顆，號碼連續
  ok(q.volleys.reduce((a, b) => a + b, 0) === q.N && q.volleys.every(n => n >= 1 && n <= T.volleyFor(lv) + 1) && q.fruits.every((f, k) => f.volley >= 0 && f.volley < q.volleys.length && (k === 0 || f.volley >= q.fruits[k - 1].volley)), '分波：' + q.volleys.join(','));
  { let k0 = 0; q.volleys.forEach((n, vi) => {
      const grp = q.fruits.slice(k0, k0 + n); ok(grp.length === n && grp.every(f => f.volley === vi), '同一波的號碼連續');
      ok(Math.max(...grp.map(f => f.t)) - Math.min(...grp.map(f => f.t)) <= T.VOLLEY_SPREAD_S + 0.0015, '同一波的發射時間最多差 ' + T.VOLLEY_SPREAD_S + ' 秒');
      ok(new Set(grp.map(f => Math.floor((f.x0 - 0.18) / (0.64 / n) + 1e-9))).size === n, '同一波的水果各佔畫面寬度的一格');
      // 兩顆以上一起噴的那一波，第一次切的那一刻整波都在空中（畫面上同時有 n 顆）
      if (n >= 2) { const geom = { W: 472, H: 640, R: T.radiusFor(lv, 472) }, tc = q.plan[k0]; ok(grp.every(f => { const p = T.fruitPos(f, tc, geom); return p && T.onScreen(p, geom); }), '一波 ' + n + ' 顆在第一次切的時候同時在畫面上'); ST.multi++; }
      k0 += n; }); }
  for (let k = 1; k < q.N; k++) { const g = q.plan[k] - q.plan[k - 1]; ok(g >= T.gapFor(lv) * 0.85 - 0.0012 && g <= T.gapFor(lv) * 1.2 + 0.0012, '計畫切的間隔 ' + g.toFixed(3)); }
  q.fruits.forEach((f, k) => {
    ok(f.u >= Math.max(T.U_MIN, T.RISE_FRAC) - 0.002 && f.u <= T.U_MAX + 1e-9, 'u 在 [max(U_MIN, RISE_FRAC), U_MAX]（切的時候已經過了快速上衝的階段）：' + f.u);
    ok(near(f.t + f.u * f.T, q.plan[k], 0.002) && f.t >= -0.002 && f.T === q.flight, '拋出時間 ＋ u×飛行時間 ＝ 計畫切的時間；不會比 0 秒早拋');
    ok(f.x0 >= 0.18 && f.x0 <= 0.82 && Math.abs(f.vx) <= T.VX / 472 + 0.001 && Math.abs(f.vx) >= 0.02 - 0.001 && f.A >= T.APEX[0] - 1e-9 && f.A <= T.APEX[1] + 1e-9, '拋出參數在範圍內');
    ST.minSlack = Math.min(ST.minSlack, Math.min(f.u, 1 - f.u) * f.T);
    // 保證切得完：計畫切的那一刻，這顆水果在畫面上，而且完全露出來（不是半顆在螢幕外）
    geoms.forEach(gm => { const geom = { W: gm.W, H: gm.H, R: T.radiusFor(lv, gm.W) }, p = T.fruitPos(f, q.plan[k], geom); ok(p && T.onScreen(p, geom) && p.y <= geom.H - geom.R * 0.4 && p.y >= geom.R * 0.5 && p.x >= geom.R - 1e-9 && p.x <= geom.W - geom.R + 1e-9, '第 ' + (k + 1) + ' 顆在計畫切的時間完整在畫面上（' + gm.W + '×' + gm.H + '）：y=' + (p && p.y.toFixed(0))); });
  });
  for (let k = 0; k + 1 < q.N; k++) { ST.ooTot[lv] = (ST.ooTot[lv] || 0) + 1; if (q.fruits[k + 1].t < q.fruits[k].t) ST.outOfOrder[lv] = (ST.outOfOrder[lv] || 0) + 1; }
}
console.log('共 ' + ST.n + ' 關；計畫切的時刻離出現／落下最近 ' + ST.minSlack.toFixed(3) + ' 秒；算式關有乘除的 ' + ST.mulLevels + ' 關');
ok(ST.minSlack >= 0.15 * 1.8 - 1e-6, '每顆水果在計畫切之前和之後都至少還有 ' + (0.15 * 1.8).toFixed(2) + ' 秒（餘裕）：' + ST.minSlack.toFixed(3));
ok(ST.mulLevels > 500, '第 20 關起算式常有乘除');
// 同時發射：每一波的顆數隨關卡增加；兩顆以上的波很多（畫面上不會常常只剩一顆水果）
{ ok(T.volleyFor(1) === Math.max(1, Math.round(T.VOLLEY[0])) && T.volleyFor(T.RAMP_LEVELS) === Math.max(1, Math.round(T.VOLLEY[1])) && T.volleyFor(99) === T.volleyFor(T.RAMP_LEVELS), '每一波的顆數 ' + T.VOLLEY + '（第 ' + T.RAMP_LEVELS + ' 關到頂）');
  for (let n = 2; n <= 40; n++) ok(T.volleyFor(n) >= T.volleyFor(n - 1) || T.VOLLEY[1] < T.VOLLEY[0], '每波顆數隨關卡不減少');
  console.log("兩顆以上同時噴出的波：" + ST.multi + " 波（2400 關）"); ok(T.VOLLEY[0] < 2 && T.VOLLEY[1] < 2 || ST.multi > 2400, '大部分關卡都有好幾顆同時在空中'); }
{ // 每一關都不能只有「單獨一顆」的波佔多數：第 1 關起（VOLLEY[0] ≥ 2 時）最多只有最後一波可能是單顆
  if (T.VOLLEY[0] >= 2) for (let rep = 0; rep < 300; rep++) { const q = T.makeLevel(1 + (rep % 30), rnd); const singles = q.volleys.filter(n => n === 1).length; ok(singles <= 1 && (singles === 0 || q.volleys[q.volleys.length - 1] === 1 || q.N < 2), '單顆的波最多一個、而且只會在最後：' + q.volleys.join(',')); } }

// ── 煙火式的高度曲線 ──
{ const geom = { W: 472, H: 640, R: 36 }, f = { t: 1, T: 2, x0: 0.5, vx: 0.05, A: 0.5, a0: 30, w: 100 }, yb = 640 + 36, ur = T.RISE_FRAC;
  ok(T.fruitPos(f, 0.99, geom) === null && T.fruitPos(f, 3.01, geom) === null && T.fruitPos(f, 1, geom) && T.fruitPos(f, 3, geom), '飛行之外是 null');
  const s = T.fruitPos(f, 1, geom), m = T.fruitPos(f, 1 + 2 * ur, geom), e = T.fruitPos(f, 3, geom);
  ok(near(s.y, yb) && near(e.y, yb) && near(m.y, yb - 0.5 * 640, 1e-9) && near(m.u, ur, 1e-9), '起點、終點在畫面底下，頂點（u＝RISE_FRAC）高 A×H');
  ok(near(T.lift(0), 0) && near(T.lift(ur), 1, 1e-9) && near(T.lift(1), 0) && T.lift(-1) === 0 && T.lift(2) === 0, 'lift：起點 0、頂點 1、終點 0');
  const mid = T.fruitPos(f, 2, geom); ok(near(mid.x, 472 * 0.5 + 472 * 0.05 * 1, 1e-9) && near(mid.ang, 30 + 100 * 1, 1e-9), 'x 隨時間飄、角度隨時間轉');
  const f2 = Object.assign({}, f, { vx: 0.5 }); ok(T.fruitPos(f2, 3, geom).x === 472 - 36, 'x 夾在 R～W−R 之內');
  let up = true, down = true, prev = 0; for (let u = 0; u <= ur + 1e-9; u += ur / 200) { const h = T.lift(u); if (h < prev - 1e-9) up = false; prev = h; } for (let u = ur; u <= 1; u += (1 - ur) / 200) { const h = T.lift(u); if (h > prev + 1e-9 && u > ur) down = false; prev = h; }
  ok(up && down, '上升時高度一路變大、到頂點後一路變小');
  // 速度（高度對進度的斜率）：上升一開始 ＝ RISE_EASE ÷ RISE_FRAC，到頂點是 0（RISE_EASE > 1）；下降到底 ＝ FALL_EASE ÷ (1 − RISE_FRAC)，剛離開頂點是 0（FALL_EASE > 1）
  const eps = 1e-6, sl = (a, b) => (T.lift(b) - T.lift(a)) / (b - a);
  ok(near(sl(1e-9, eps), T.RISE_EASE / ur, 1e-2 * T.RISE_EASE / ur) && near(-sl(1 - eps, 1 - 1e-9), T.FALL_EASE / (1 - ur), 1e-2 * T.FALL_EASE / (1 - ur)), '上升起始速度 ' + (T.RISE_EASE / ur).toFixed(2) + '、下降到底速度 ' + (T.FALL_EASE / (1 - ur)).toFixed(2) + '（高度／飛行進度）');
  if (T.RISE_EASE > 1) ok(Math.abs(sl(ur - eps, ur)) < 1e-3, '上升到頂點時速度 0（越爬越慢）');
  if (T.FALL_EASE > 1) ok(Math.abs(sl(ur, ur + eps)) < 0.01, '離開頂點時速度 0（慢慢開始掉）');
  // 玩家要的手感：噴上去比落下來快
  console.log('煙火曲線：上升 ' + (100 * ur).toFixed(0) + '% 時間、起始速度 ' + (T.RISE_EASE / ur).toFixed(1) + '；下降 ' + (100 * (1 - ur)).toFixed(0) + '% 時間、最快速度 ' + (T.FALL_EASE / (1 - ur)).toFixed(1));
  ok(T.RISE_EASE / ur > T.FALL_EASE / (1 - ur) && ur < 0.5, '噴上去比落下來快、而且上升的時間比下降短（煙火）；玩家把參數調成別的手感就看這行'); }
ok(T.onScreen({ y: 300 }, { H: 640, R: 36 }) && !T.onScreen({ y: 700 }, { H: 640, R: 36 }) && !T.onScreen(null, { H: 640, R: 36 }), 'onScreen');

// ── 劃過判定 ──
ok(near(T.distToSeg(5, 5, 0, 0, 10, 0).d, 5) && near(T.distToSeg(5, 5, 0, 0, 10, 0).s, 0.5) && near(T.distToSeg(-3, 4, 0, 0, 10, 0).d, 5) && near(T.distToSeg(-3, 4, 0, 0, 10, 0).s, 0) && near(T.distToSeg(14, 3, 0, 0, 10, 0).d, 5) && near(T.distToSeg(14, 3, 0, 0, 10, 0).s, 1) && near(T.distToSeg(3, 4, 5, 5, 5, 5).d, Math.hypot(2, 1)), 'distToSeg');
{ const R = 36, cand = [{ id: 0, x: 100, y: 100 }, { id: 1, x: 200, y: 105 }, { id: 2, x: 300, y: 200 }, { id: 3, x: 150, y: 100 + R + T.HIT_PAD + 1 }];
  ok(T.sliceSegment(cand, 0, 100, 400, 100, R).join() === '0,1', '一刀劃過兩顆：依沿線順序 0 → 1（第 3 顆差 1px 沒碰到）');
  ok(T.sliceSegment(cand, 400, 100, 0, 100, R).join() === '1,0', '反方向劃：順序反過來');
  { const one = [{ id: 0, x: 100, y: 100 }]; ok(T.sliceSegment(one, 0, 100 + R + T.HIT_PAD, 400, 100 + R + T.HIT_PAD, R).join() === '0' && T.sliceSegment(one, 0, 100 + R + T.HIT_PAD + 0.01, 400, 100 + R + T.HIT_PAD + 0.01, R).length === 0, '剛好碰到邊緣（R＋HIT_PAD）算切到、再遠一點點就沒切到'); }
  ok(T.sliceSegment(cand, 0, 0, 50, 0, R).length === 0 && T.sliceSegment(cand, 100, 100, 100, 100, R).join() === '0', '沒碰到／原地點一下'); }
{ const rank = id => [0, 1, 2, 3, 4][id] + 1;                                       /* id 對應 rank = id + 1 */
  ok(JSON.stringify(T.judgeCuts([0, 1, 2], 1, rank)) === '{"ok":true,"cut":3,"wrong":null}', '依序切 1、2、3');
  ok(JSON.stringify(T.judgeCuts([1], 1, rank)) === '{"ok":false,"cut":0,"wrong":1}', '下一號是 1 卻先切到 2 → 錯');
  ok(JSON.stringify(T.judgeCuts([2, 3], 3, rank)) === '{"ok":true,"cut":2,"wrong":null}' && JSON.stringify(T.judgeCuts([2, 4], 3, rank)) === '{"ok":false,"cut":1,"wrong":4}', '一刀穿過兩顆：第二顆也要是下一號');
  ok(JSON.stringify(T.judgeCuts([], 1, rank)) === '{"ok":true,"cut":0,"wrong":null}', '沒切到東西不算錯'); }
// 說明
{ const q = { expr: false }, e = { label: '3', value: 3 }, g = { label: '5', value: 5 }; ok(T.whyText('wrong', q, e, g) === '切錯順序了！先要切「3」，你切了「5」' && T.whyText('lost', q, e, e) === '「3」掉下去了，還沒被切到', '數字關說明');
  const q2 = { expr: true }, e2 = { label: '2＋3', value: 5 }, g2 = { label: '12÷4', value: 3 }; ok(/答案 5/.test(T.whyText('wrong', q2, e2, g2)) && /答案 3/.test(T.whyText('wrong', q2, e2, g2)), '算式關說明含答案'); }

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_ordercut.js'), css = rd('../../css/games/reaction_ordercut.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 4000/.test(src) && /ordercut-badge/.test(src) && /ordercut-fruit--bad/.test(src) && /ordercut-fruit--ok/.test(src), '失敗：水果停住、標第幾個要切、切錯的標紅、該切的標綠、停格夠久');
  ok(/sliceSegment\(cand, ax, ay, bx, by, R\)/.test(src) && /judgeCuts\(hits, nextRank, rankOf\)/.test(src) && /fruitPos\(f, t, geom\)/.test(src), '切的判定用 sliceSegment／judgeCuts、位置用 fruitPos');
  ok(/pointerdown/.test(src) && /pointermove/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src) && /armed/.test(src), '手指劃過；solve／wrong 只排一次');
  ok(/\.ordercut-f0 \{[^}]*var\(--ocf-f0\)/.test(css) && /\.ordercut-field \{[^}]*var\(--ocf-board\)/.test(css) && /\.ordercut-label \{[^}]*border-bottom: 4px solid var\(--ocf-num\)/.test(css) && /\.ordercut-fruit--ok \{[^}]*var\(--c-ok-light\)/.test(css), '水果、木板、數字（有底線）、標記用 CSS 變數');
  ok(boot.indexOf("'js/reaction_ordercut.js'") > 0 && /6 和 9/.test(G.rule) && /算式/.test(G.rule), 'boot.js 有載入、玩法說明提到 6 和 9、算式'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(8) && T.rating(8) !== T.rating(15) && T.rating(15) !== T.rating(25), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
