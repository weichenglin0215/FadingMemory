const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_ghostleg.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261014); const rnd = rng(SEED);

// 難度曲線
ok(T.rungCount(1) === T.RUNGS[0] && T.rungCount(T.RAMP_LEVELS) === T.RUNGS[1] && T.RUNGS[1] <= 2 * T.ROWS - 4, '現有橫線數端點，且最後一關還留得下空位給玩家畫');
ok(T.maxSolAt(1) === T.MAX_SOL[0] && T.maxSolAt(T.RAMP_LEVELS) === T.MAX_SOL[1] && T.maxSolAt(T.RAMP_LEVELS) >= 1, '「畫對的位置數」上限端點');
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時端點');
for (let l = 2; l <= T.RAMP_LEVELS; l++) ok(T.rungCount(l) >= T.rungCount(l - 1) && T.maxSolAt(l) <= T.maxSolAt(l - 1), '單調 ' + l);
// snapRow／canPlace
for (let r = 0; r < T.ROWS; r++) ok(T.snapRow(T.rowY(r)) === r && T.snapRow(T.rowY(r) + 3) === r && T.snapRow(T.rowY(r) - 3) === r, 'snapRow ' + r);
ok(T.snapRow(-50) === 0 && T.snapRow(9999) === T.ROWS - 1, 'snapRow 夾在範圍內');
{ const rg = [{ row: 5, col: 1 }];
  ok(!T.canPlace(rg, 5, 1) && !T.canPlace(rg, 5, 0) && !T.canPlace(rg, 5, 2) && T.canPlace(rg, 5, 3) && T.canPlace(rg, 4, 1) && T.canPlace(rg, 6, 0), 'canPlace：同一層重疊或左右緊鄰的位置不行，其他層可以');
  ok(!T.canPlace(rg, -1, 0) && !T.canPlace(rg, T.ROWS, 0) && !T.canPlace(rg, 3, -1) && !T.canPlace(rg, 3, T.COLS - 1), 'canPlace：超出範圍不行'); }
// 橫線：數量、同一層不相鄰、每層最多 2 條
for (let l = 1; l <= T.RAMP_LEVELS; l++) for (let k = 0; k < 40; k++) {
  const q = T.makeLevel(l, rnd);
  ok(q.rungs.length === T.rungCount(l) || q.rungs.length === 1, '第 ' + l + ' 關橫線數 ' + q.rungs.length);
  const seen = {}; q.rungs.forEach(g => { ok(g.col >= 0 && g.col <= T.COLS - 2 && g.row >= 0 && g.row < T.ROWS, '位置範圍'); ok(!seen[g.row + ',' + g.col], '不重複'); seen[g.row + ',' + g.col] = 1; });
  q.rungs.forEach(g => ok(!seen[g.row + ',' + (g.col + 1)], '同一層橫線不相鄰'));
  const perRow = {}; q.rungs.forEach(g => { perRow[g.row] = (perRow[g.row] || 0) + 1; }); ok(Object.values(perRow).every(v => v <= 2), '每層最多 2 條');
  // 題目條件：現有的線走不到終點；至少有一種畫法對；每一種「解」真的畫得上去、真的走到終點；其他位置不會走到終點的不算解
  ok(q.start >= 0 && q.start < T.COLS && q.target >= 0 && q.target < T.COLS, '起點終點範圍');
  const f0 = T.follow(q.rungs, q.start); ok(f0.end === q.end0 && q.end0 !== q.target, '現有的橫線走不到終點');
  ok(q.solutions.length >= 1, '至少有一種畫法');
  q.solutions.forEach(s => { ok(T.canPlace(q.rungs, s.row, s.col), '解可以畫'); ok(T.follow(q.rungs.concat([s]), q.start).end === q.target, '畫了之後真的走到終點'); });
  // 獨立窮舉：全部能畫的位置裡，走到終點的剛好就是 solutions
  let cnt = 0; for (let r = 0; r < T.ROWS; r++) for (let c = 0; c <= T.COLS - 2; c++) if (T.canPlace(q.rungs, r, c) && T.follow(q.rungs.concat([{ row: r, col: c }]), q.start).end === q.target) cnt++;
  ok(cnt === q.solutions.length, '解的數量與窮舉一致：' + cnt + ' vs ' + q.solutions.length);
  if (l >= T.RAMP_LEVELS - 2) ok(q.solutions.length <= Math.max(T.maxSolAt(l), 3), '後面的關卡只有少數畫法 ' + q.solutions.length);
  // 路徑：獨立模擬一次，終點相同
  let col = q.start; const s2 = {}; q.rungs.forEach(g => { s2[g.row + ',' + g.col] = 1; });
  for (let r = 0; r < T.ROWS; r++) { if (s2[r + ',' + col]) col++; else if (s2[r + ',' + (col - 1)]) col--; }
  ok(col === q.end0, '現有路徑終點一致');
  // 折線每一段不是垂直就是水平
  for (let i = 1; i < f0.route.length; i++) ok(f0.route[i].x === f0.route[i - 1].x || f0.route[i].y === f0.route[i - 1].y, '路線只有垂直與水平');
}
// 每一欄都有機會當起點與終點
{ const s = new Array(5).fill(0), t = new Array(5).fill(0); for (let i = 0; i < 2500; i++) { const q = T.makeLevel(8, rnd); s[q.start]++; t[q.target]++; } ok(s.every(v => v > 300), '起點平均分布 ' + s.join(',')); ok(t.every(v => v > 150), '終點每一欄都出現 ' + t.join(',')); }
// 評審動畫的線：從頭畫到 len 像素
{ const q = T.makeLevel(10, rnd), f = T.follow(q.rungs, q.start), L = T.routeLength(f.route);
  const p0 = T.partialRoute(f.route, 0); ok(p0.length === 1 && p0[0].x === f.route[0].x, '長度 0：只有起點');
  const pe = T.partialRoute(f.route, L); ok(near(T.routeLength(pe), L, 1e-6) && pe[pe.length - 1].y === T.Y_BOT, '畫滿：整條路線');
  let prev = -1; for (let k = 0; k <= 40; k++) { const part = T.partialRoute(f.route, L * k / 40), len = T.routeLength(part); ok(near(len, L * k / 40, 1e-6) && len >= prev - 1e-9, '部分路線長度 = 要求的長度'); prev = len; }
  ok(T.routeMs(f.route) >= T.ROUTE_MS[0] && T.routeMs(f.route) <= T.ROUTE_MS[1], '動畫時間在範圍內：' + T.routeMs(f.route)); ok(T.HOLD_MS === 1500, '動畫之後停一下'); }
ok(T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(11) && T.rating(11) !== T.rating(15), '評語分級');
// 接線（原始碼／樣式）：綠底黑字起終點、玩家按住直線往旁邊拖畫粗藍線、鉛筆提示、沒有手指提示
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_ghostleg.js'), css = rd('../../css/reaction3.css');
  ok(src.indexOf('fingerHint') < 0 && src.indexOf('0x270F') > 0 && /\.gl-pencil \{/.test(css), '提示改成鉛筆圖示，取消手指圖示');
  ok(/\.gl-user \{[^}]*c-blue[^}]*stroke-width: 14/.test(css.replace(/\r?\n/g, ' ')) , '玩家畫的橫線：很粗的藍線');
  ok(/\.gl-token--go \{[^}]*c-green/.test(css.replace(/\r?\n/g, ' ')) && /\.gl-token--go\+\.gl-label,\s*\.gl-end--go\+\.gl-label \{\s*fill: var\(--c-black\)/.test(css), '起點終點：綠底黑字');
  ok(/\.gl-route \{[^}]*c-green[^}]*stroke-dasharray/.test(css.replace(/\r?\n/g, ' ')), '評審動畫：綠色粗虛線');
  ok(src.indexOf('canPlace(q.rungs, row, col)') > 0 && src.indexOf("api.stopTimer()") > 0 && src.indexOf('judge();') > 0, '畫好橫線之後才開始評審動畫'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
