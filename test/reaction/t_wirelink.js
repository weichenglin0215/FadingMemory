// 接電線（wirelink，企劃 222）的純函式檢查：出題一定有解（走遍棋盤的路切成 k 段）、接線規則（不交叉、可收回、可重拖、接通）、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_wirelink.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261102), rnd = rng(SEED);
const adj = (n, a, b) => Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs(a % n - b % n) === 1;

// ── 難度 ──
ok(T.sizeFor(1) === T.SIZE[0] && T.sizeFor(T.RAMP_LEVELS) === T.SIZE[1] && T.sizeFor(99) === T.SIZE[1], '棋盤大小 ' + T.SIZE + '，到頂維持');
ok(T.colorsFor(1) === T.COLORS[0] && T.colorsFor(T.RAMP_LEVELS) === T.COLORS[1] && T.PALETTE.length === 8, '顏色 ' + T.COLORS + '（8 種）');
for (let l = 2; l <= 60; l++) ok(T.sizeFor(l) >= T.sizeFor(l - 1) && T.colorsFor(l) >= T.colorsFor(l - 1) && T.timeMs(l) >= T.timeMs(l - 1), '單調 ' + l);
for (let l = 1; l <= 60; l++) { const n = T.sizeFor(l); ok(T.colorsFor(l) * T.MIN_SEG <= n * n, '第 ' + l + ' 關：每種顏色至少 ' + T.MIN_SEG + ' 格放得下（' + T.colorsFor(l) + ' 種、' + n * n + ' 格）'); }
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S + ' 秒');
// ── splitLengths ──
for (let i = 0; i < 300; i++) { const k = 2 + Math.floor(rnd() * 6), total = k * 3 + Math.floor(rnd() * 40), lens = T.splitLengths(total, k, 3, rnd); ok(lens.length === k && lens.reduce((a, b) => a + b, 0) === total && lens.every(x => x >= 3), 'splitLengths ' + lens); }
// ── 出題 ──
for (let i = 0; i < 700; i++) {
  const lv = 1 + (i % 40), q = T.makePuzzle(lv, rnd), n = T.sizeFor(lv), k = T.colorsFor(lv);
  ok(q.n === n && q.k === k && q.plugs.length === k && q.solution.length === k, '第 ' + lv + ' 關：棋盤 ' + n + '、顏色 ' + k);
  ok(new Set(q.plugs.map(p => p.c)).size === k && q.plugs.every(p => p.c >= 0 && p.c < 8), '顏色不重複');
  const seen = new Set();
  q.solution.forEach((seg, j) => {
    ok(seg.length >= T.MIN_SEG, '每條電線至少 ' + T.MIN_SEG + ' 格');
    ok(seg[0] === q.plugs[j].a && seg[seg.length - 1] === q.plugs[j].b, '電線兩端就是兩個插頭');
    seg.forEach((cell, t) => { ok(!seen.has(cell), '每一格只屬於一條電線'); seen.add(cell); if (t) ok(adj(n, seg[t - 1], cell), '電線每一步都在相鄰格'); });
  });
  ok(seen.size === n * n, '電線把整個棋盤填滿：' + seen.size + '／' + n * n);
}
// ── 照出題的解接完 → 過關；少接一條、少填一格 → 沒過關 ──
function solveAll(q, st, skip) {
  q.plugs.forEach((p, i) => { if (i === skip) return; const c = T.startDraw(st, q.solution[i][0]); ok(c === p.c, 'startDraw 在插頭上回傳那條電線的顏色'); q.solution[i].slice(1).forEach(k => { const a = T.applyDrag(st, c, k); ok(a === 'add' || a === 'connect', '照解走每一步都合法：' + a); }); });
}
for (let i = 0; i < 200; i++) {
  const lv = 1 + (i % 30), q = T.makePuzzle(lv, rnd), st = T.newState(q);
  ok(!T.isSolved(st) && T.linked(st) === 0, '一開始沒過關');
  solveAll(q, st, -1);
  ok(T.isSolved(st) && T.linked(st) === q.k && T.filled(st) === q.n * q.n, '照解接完 → 過關');
  const st2 = T.newState(q); solveAll(q, st2, 0);
  ok(!T.isSolved(st2) && T.linked(st2) === q.k - 1, '少接一條 → 沒過關');
}
// 規則（4×4、2 條電線）：手工擺一題
{ const q = { n: 4, k: 2, level: 1, plugs: [{ c: 0, a: 0, b: 3 }, { c: 1, a: 4, b: 7 }], solution: [[0, 1, 2, 3], [4, 5, 6, 7]] }, st = T.newState(q);
  ok(T.startDraw(st, 1) === -1 && T.startDraw(st, 9) === -1, '按在空格或不存在的線上不能開始');
  const c = T.startDraw(st, 0);
  ok(c === 0 && T.applyDrag(st, 0, 1) === 'add' && T.applyDrag(st, 0, 2) === 'add' && st.paths[0].join() === '0,1,2', '從插頭往相鄰空格拖，鋪出電線');
  ok(T.applyDrag(st, 0, 5) === null && T.applyDrag(st, 0, 11) === null && T.applyDrag(st, 0, 0) === null, '不相鄰（斜的、隔太遠）的格子不能鋪');
  ok(T.applyDrag(st, 0, 1) === 'back' && st.paths[0].join() === '0,1' && st.occ[2] === -1, '拖回上一格＝收回一格電線');
  ok(T.applyDrag(st, 0, 5) === 'add' && T.applyDrag(st, 0, 4) === null, '往旁邊空格鋪；別種顏色的插頭（4）擋住，不能穿過');
  ok(T.applyDrag(st, 0, 6) === 'add' && T.applyDrag(st, 0, 7) === null, '別種顏色的插頭（7）也擋住');
  // 重拖：按在插頭上＝整條收回
  ok(T.startDraw(st, 0) === 0 && st.paths[0].join() === '0' && st.occ[1] === -1 && st.occ[5] === -1 && st.occ[0] === 0 && st.occ[3] === 0, '按在插頭上＝整條電線收回，插頭那一格的顏色還在');
  // 從電線中間重拖：後面收回
  T.applyDrag(st, 0, 1); T.applyDrag(st, 0, 2); T.applyDrag(st, 0, 3);
  ok(st.done[0] && T.linked(st) === 1 && st.paths[0].join() === '0,1,2,3', '拖到同色的另一個插頭＝接通');
  ok(T.applyDrag(st, 0, 7) === null && T.applyDrag(st, 0, 2) === 'back' && !st.done[0], '接通之後只能往回收；收回之後 done 取消');
  T.applyDrag(st, 0, 3);
  ok(T.startDraw(st, 1) === 0 && st.paths[0].join() === '0,1' && st.occ[2] === -1 && st.occ[3] === 0 && !st.done[0], '按在電線中間（格 1）：那一格之後收回（插頭 3 的顏色不能清掉）、從這裡接著畫'); }
// ── 亂拖 5 萬步：狀態永遠一致（occ 與 paths 對得起來、插頭那格的顏色不會被清掉） ──
for (let rep = 0; rep < 60; rep++) {
  const q = T.makePuzzle(1 + Math.floor(rnd() * 30), rnd), st = T.newState(q), n = q.n;
  let cur = -1;
  for (let step = 0; step < 800; step++) {
    if (cur < 0 || rnd() < 0.05) cur = T.startDraw(st, Math.floor(rnd() * n * n));
    else { const head = st.paths[cur].length ? st.paths[cur][st.paths[cur].length - 1] : null; if (head != null) { const nb = [1, -1, n, -n].map(d => head + d).filter(x => x >= 0 && x < n * n); T.applyDrag(st, cur, nb[Math.floor(rnd() * nb.length)]); } }
    if (step % 50 === 0) {
      const owner = new Int8Array(n * n).fill(-1);
      Object.keys(st.paths).forEach(c => st.paths[c].forEach((k, t) => { ok(owner[k] === -1, '同一格只屬於一條電線'); owner[k] = Number(c); if (t) ok(adj(n, st.paths[c][t - 1], k), '電線連續相鄰'); }));
      q.plugs.forEach(p => { ok(st.occ[p.a] === p.c && st.occ[p.b] === p.c, '插頭那一格的顏色永遠在'); });
      for (let k = 0; k < n * n; k++) if (st.occ[k] >= 0 && st.plugOf[k] == null) ok(owner[k] === st.occ[k], '電線上的格子 occ 與 paths 一致');
      q.plugs.forEach(p => { if (st.done[p.c]) { const pa = st.paths[p.c]; ok(pa[pa.length - 1] !== pa[0] && st.plugOf[pa[pa.length - 1]] === p.c, 'done 的電線尾端是同色插頭'); } });
    }
  }
}
// ── 效能 ──
{ const t0 = Date.now(); for (let i = 0; i < 100; i++) T.makePuzzle(24 + (i % 20), rnd); const per = (Date.now() - t0) / 100; console.log('最高難度出題平均 ' + per.toFixed(2) + ' 毫秒'); ok(per < 100, '出題夠快：' + per.toFixed(2) + ' 毫秒'); }
// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_wirelink.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), theme = rd('../../css/theme.css'), boot = rd('../../js/boot.js');
  ok(/stageClass: 'wlk-stage'/.test(src) && /\.wlk-stage \{ touch-action: none;/.test(css), '舞台不捲動');
  for (let i = 0; i < 8; i++) ok(new RegExp('--wlk-' + i + ': hsl').test(theme) && new RegExp('\\.wlk-c' + i + ' \\{ --wc: var\\(--wlk-' + i + '\\); \\}').test(css), '電線顏色 ' + i + ' 有 CSS 變數');
  ok(/api\.fail\(\{ delay: 3000/.test(src) && /wlk-board--lit/.test(src), '失敗停格 3 秒、全部接好整塊板子亮燈');
  ok(boot.indexOf("'js/reaction_wirelink.js'") > 0 && boot.indexOf("'js/reaction_kit4.js'") > 0, 'boot.js 有載入遊戲檔與 kit4'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
