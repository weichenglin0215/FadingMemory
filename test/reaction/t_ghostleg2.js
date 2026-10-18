// 鬼腳圖減一（js/reaction_ghostleg2.js）：點一下拿掉一條橫線，讓起點接到終點
// 檢查：難度曲線、獨立模擬「拿掉之後走到哪」、答案唯一、不碰起點終點的直線、前後合計藏得夠深、差一條的誘餌、
//       題目沒有「＝」、答案的位置平均（不會總在中間）、不留線索（拿掉會不會留下＝、答案那一縫是不是最少的、旁邊有沒有特別空）、
//       設計出來的三條路（起點的路線、終點那條路的上半段、新路線）真的照規則走、參數調很大也出得了題、點到哪一條、出題速度、接線
const fs = require('fs'), os = require('os'), path = require('path');
const { game, rng, seedOf } = require('./load.js');
game('reaction_ghostleg.js');
const G = game('reaction_ghostleg2.js'); const T = G.test, C = T.C;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261018); const rnd = rng(SEED);
const COLS = T.COLS, ROWS = T.ROWS, RIGHT = COLS - 1, zeros = () => new Array(COLS).fill(0);
const same = (a, b) => a.row === b.row && a.col === b.col;
// 獨立模擬：從 st 往下走到哪一欄（不用遊戲裡的函式）
const sim = (rg, st) => { const s = {}; rg.forEach(g => { s[g.row + ',' + g.col] = 1; }); let c = st; for (let r = 0; r < ROWS; r++) { if (s[r + ',' + c]) c++; else if (s[r + ',' + (c - 1)]) c--; } return c; };

// ── 難度曲線（線性、端點） ──
const L = T.RAMP_LEVELS;
ok(T.rungCount(1) === Math.min(T.RUNGS[0], T.rungCap()) && T.rungCount(L) === Math.min(T.RUNGS[1], T.rungCap()), '橫線數端點');
ok(T.turnsAt(1) === T.TURNS[0] && T.turnsAt(L) === T.TURNS[1], '候選（路線上的轉彎）數端點');
ok(T.hideAt(1).b === T.HIDE_BEFORE[0] && T.hideAt(L).a === T.HIDE_AFTER[1], '藏的轉彎數端點');
ok(T.nearAt(1) === T.NEAR_MISS[0] && T.nearAt(L) === T.NEAR_MISS[1], '差一條的誘餌數端點');
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(L) === T.TIME_S[1] * 1000, '限時端點');
for (let l = 2; l <= L; l++) ok(T.rungCount(l) >= T.rungCount(l - 1) && T.turnsAt(l) >= T.turnsAt(l - 1) && T.nearAt(l) >= T.nearAt(l - 1), '單調 ' + l);

// ── 純函式 ──
// pathRungs：從丙（2）出發：第 1 層乙～丙 → 乙；第 3 層甲～乙 → 甲；第 5 層丙～丁 碰不到
{ const rg = [{ row: 1, col: 1 }, { row: 3, col: 0 }, { row: 5, col: 2 }];
  ok(JSON.stringify(T.pathRungs(rg, 2)) === JSON.stringify([{ row: 1, col: 1 }, { row: 3, col: 0 }]), 'pathRungs');
  ok(T.pathCols(rg, 2).join('') === '210', 'pathCols');
  const p = T.pullOut(rg, 2, { row: 1, col: 1 }); ok(p.end === 3 && p.after === 1, 'pullOut：拿掉第 1 層 → 丙直走、第 5 層轉到丁 ' + JSON.stringify(p)); }
ok(T.rungText({ row: 4, col: 1 }) === '第 5 層的 乙～丙 之間那一條', 'rungText');
ok(T.clash([{ row: 2, col: 1 }, { row: 2, col: 2 }]) && !T.clash([{ row: 2, col: 1 }, { row: 2, col: 3 }, { row: 3, col: 2 }]), 'clash：同一層相鄰才算撞');
// mirror：左右翻面
{ const q = T.mirror({ rungs: [{ row: 1, col: 0 }], answer: { row: 1, col: 0 }, solutions: [{ row: 1, col: 0 }], start: 0, target: 2, endNow: 1 });
  ok(q.rungs[0].col === COLS - 2 && q.start === RIGHT && q.target === RIGHT - 2 && q.endNow === RIGHT - 1, 'mirror'); }
// rungAt：點在橫線上（兩條直線之間、上下 HIT_Y 以內）
{ const rg = [{ row: 4, col: 1 }, { row: 5, col: 3 }], x = (C.colX(1) + C.colX(2)) / 2, y = C.rowY(4);
  ok(T.rungAt(rg, x, y) === rg[0] && T.rungAt(rg, x, y + T.HIT_Y - 1) === rg[0] && T.rungAt(rg, x, y + T.HIT_Y + 2) === null, 'rungAt 上下範圍');
  ok(T.rungAt(rg, C.colX(0) + 20, y) === null && T.rungAt(rg, (C.colX(3) + C.colX(4)) / 2, C.rowY(5)) === rg[1], 'rungAt 左右範圍'); }
ok(T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(11) && T.rating(11) !== T.rating(15), '評語分級');

// ── 起點的路線（makeRoute）：答案之前不碰最右邊、答案往右轉、答案之後不碰最左邊、同方向最多連走 stair 步、不在邊緣來回、回頭夠多次、碰到兩邊 ──
{ let made = 0;
  for (let i = 0; i < 400; i++) {
    const m = 8 + (i % 4), k = 1 + (i % (m - 1)), o = { start: i % COLS, m, k, stair: 3, rev: 2, visit: COLS, sweep: true };
    const w = T.makeRoute(o, rnd); if (!w) continue; made++;
    ok(w.length === m + 1 && w[0] === o.start, '路線長度與起點');
    ok(w.every((c, j) => j === 0 || Math.abs(c - w[j - 1]) === 1), '每一步走一條');
    ok(w.slice(0, k + 1).every(c => c <= RIGHT - 1) && w.slice(k + 1).every(c => c >= 1) && w[k + 1] === w[k] + 1, '答案之前不碰最右、往右轉、之後不碰最左');
    ok(w.slice(0, k + 1).includes(0) && w.slice(k + 1).includes(RIGHT), '碰到兩邊（左邊在答案之前、右邊在答案之後）');
    ok(![w[k], w[k] + 1].includes(o.start), '答案不碰起點的直線');
    const sh = C.routeShape(w); ok(sh.maxRun <= o.stair && sh.rev >= o.rev, '之字形 ' + JSON.stringify(sh));
    for (let j = 1; j + 1 < w.length; j++) ok(!(w[j - 1] === w[j + 1] && (w[j - 1] === 0 || w[j - 1] === RIGHT)), '不在邊緣來回');
  }
  ok(made > 60, '路線做得出來 ' + made + ' / 400'); }

// ── 設計好的三條路（design）：Q 一直在 P 右邊、T 一直在舊路線左邊、不碰對方的橫線；其他橫線不碰它們 ──
{ let made = 0;
  for (let i = 0; i < 300 && made < 80; i++) {
    const m = 9, k = 1 + (i % (m - 1)), o = { start: i % COLS, m, k, need: 2, stair: 4, rev: 2, visit: COLS, sweep: true };
    const d = T.design(o, rnd); if (!d || d.failT) continue; made++;
    ok(!T.clash(d.base), '設計的橫線同一層不相鄰');
    ok(C.cancelPairs(d.base.concat([])) >= 0, 'cancelPairs 跑得動');
    const rg = T.fillRest(d, 20, { leave: null, xmin: null, gap: 9 }, rnd);
    // 撒完之後：起點的路線就是設計的 P（轉彎數＝m），答案是 P 的第 k 個轉彎
    const pr = T.pathRungs(rg, d.start); ok(pr.length === m && same(pr[k], d.x), '其他橫線沒有改到起點的路線');
    // 現在走到終點的那條路（從終點往上推）只在答案跟起點的路線交叉＝拿掉其他轉彎都到不了終點
    ok(pr.filter(g => sim(rg.filter(o2 => o2 !== g), d.start) === d.target).length === 1, '只有答案走得到終點');
    ok(sim(rg.filter(g => !same(g, d.x)), d.start) === d.target, '拿掉答案走到終點');
  }
  ok(made >= 60, '三條路設計得出來 ' + made); }

// ── 出題：每一關都檢查 ──
let n = 0, fallback = 0, relax = 0, short = 0, leaveAns = 0, wrongLeave = 0, wrongN = 0, gapNext = 0, candSum = 0, nearSum = 0, minA = 0, minW = 0, flip = [0, 0];
const startCnt = zeros(), bins = [0, 0, 0];
// 答案在「可以當答案的轉彎」（第 2 個～最後一個；第 1 個一定碰到起點那條直線）裡的哪一段：前／中／後三等分
const third = (idx, m) => Math.min(2, Math.floor((idx - 1) / Math.max(1, m - 1) * 3));
for (let l = 1; l <= L; l++) for (let k = 0; k < 20; k++) {
  const q = T.makeLevel(l, rnd); n++; startCnt[q.start]++;
  if (q.stage >= 5) { fallback++; continue; }
  const sset = {}; q.rungs.forEach(g => { ok(g.row >= 0 && g.row < ROWS && g.col >= 0 && g.col <= COLS - 2, '位置範圍'); ok(!sset[g.row + ',' + g.col], '不重複'); sset[g.row + ',' + g.col] = 1; });
  q.rungs.forEach(g => ok(!sset[g.row + ',' + (g.col + 1)], '同一層橫線不相鄰'));
  if (q.stage === 0) ok(q.rungs.length >= T.rungCount(l) - 2, '第 ' + l + ' 關橫線數 ' + q.rungs.length);
  ok(q.rungs.length <= T.rungCount(l) + T.BREAK_EXTRA + 6, '第 ' + l + ' 關橫線數不會太多 ' + q.rungs.length);
  // 現在走到 endNow ≠ 終點
  ok(sim(q.rungs, q.start) === q.endNow && q.endNow !== q.target, '現在走不到終點');
  // 獨立窮舉「拿掉每一條」：走到終點的只有答案那一條
  const sols = q.rungs.filter(g => sim(q.rungs.filter(o => o !== g), q.start) === q.target);
  ok(sols.length === 1 && same(sols[0], q.answer) && q.solutions.length === 1, '答案只有一個：' + sols.length);
  ok(![q.answer.col, q.answer.col + 1].some(c => c === q.start || c === q.target), '答案不碰起點終點的直線');
  const hd = T.hideAt(l), pathR = T.pathRungs(q.rungs, q.start), idx = pathR.findIndex(g => same(g, q.answer)), po = T.pullOut(q.rungs, q.start, q.answer);
  ok(idx >= 0 && idx === q.hide.before && po.after === q.hide.after, '藏的深度跟出題記錄一致');
  if (q.stage > 0) relax++;
  if (q.hide.before + q.hide.after < hd.b + hd.a) short++;
  ok(po.leaves === q.leave, '拿掉答案會不會留下＝，跟出題記錄一致');
  ok(C.cancelPairs(q.rungs) === 0, '題目沒有「＝」');
  // 統計
  if (q.leave) leaveAns++;
  pathR.filter(g => !same(g, q.answer)).forEach(g => { wrongN++; if (T.pullOut(q.rungs, q.start, g).leaves) wrongLeave++; });
  const cc = C.gapCounts(q.rungs), mn = Math.min(...cc);
  if (cc[q.answer.col] === mn) minA++;
  pathR.filter(g => !same(g, q.answer)).forEach(g => { if (cc[g.col] === mn) minW++; });
  const neighbor = g => q.rungs.some(o => !same(o, g) && Math.abs(o.row - g.row) === 1 && Math.abs(o.col - g.col) <= 1);
  if (neighbor(q.answer)) gapNext++;
  candSum += q.candidates; nearSum += q.near;
  bins[third(idx, pathR.length)]++;
  const dirOf = g => { let c = q.start; for (const h of pathR) { if (same(h, g)) return h.col === c ? 1 : -1; c = h.col === c ? c + 1 : c - 1; } return 0; };
  flip[dirOf(q.answer) > 0 ? 0 : 1]++;
}
const m0 = n - fallback;
ok(fallback === 0, '保底題沒有出現：' + fallback + ' / ' + n);
ok(relax / m0 < 0.2, '大多不用放寬條件：' + relax + ' / ' + m0);
ok(short / m0 < 0.15, '前後合計藏得夠深（不夠的 ' + short + ' / ' + m0 + '：答案很前面時，新路線轉不了那麼多次）');
{ const pa = leaveAns / m0, pw = wrongLeave / wrongN; ok(Math.abs(pa - T.LEAVE_EQ) < 0.12 && Math.abs(pa - pw) < 0.12, '拿掉答案會留下「＝」的比例 ' + (100 * pa).toFixed(1) + '%、拿錯的 ' + (100 * pw).toFixed(1) + '%（差不多＝沒辦法拿來猜）'); }
{ const pa = minA / m0, pw = minW / wrongN; ok(Math.abs(pa - pw) < 0.12, '答案在「橫線最少的那一縫」' + (100 * pa).toFixed(1) + '%、拿錯的 ' + (100 * pw).toFixed(1) + '%（差不多＝沒辦法拿來猜）'); }
ok(gapNext / m0 > 0.25, '答案旁邊沒有特別留白（上下一層、相鄰的縫有橫線的題目 ' + (100 * gapNext / m0).toFixed(1) + '%）');
ok(bins.every(b => b / m0 > 0.2 && b / m0 < 0.46), '答案在路線上的位置平均（前／中／後段：' + bins.join('/') + '）');
ok(flip[0] / m0 > 0.35 && flip[1] / m0 > 0.35, '答案往右轉、往左轉都有（左右翻面）' + flip.join('/'));
console.log('平均候選 ' + (candSum / m0).toFixed(1) + ' 個、差一條的誘餌 ' + (nearSum / m0).toFixed(1) + ' 個；答案拿掉留下＝ ' + (100 * leaveAns / m0).toFixed(1) + '%、拿錯的 ' + (100 * wrongLeave / wrongN).toFixed(1) + '%；放寬 ' + relax + '、藏不夠深 ' + short + '；答案位置 ' + bins.join('/') + '；起點分布 ' + startCnt.join(','));
// 答案的位置：同一關出很多題，每一段都會出現（不會「總是中間那一條」）
{ const b = [0, 0, 0], ks = {}; let mid = 0; const N = 300;
  for (let i = 0; i < N; i++) { const q = T.makeLevel(20, rnd), pr = T.pathRungs(q.rungs, q.start), idx = pr.findIndex(g => same(g, q.answer)); b[third(idx, pr.length)]++; ks[idx === 1 ? 'first' : idx === pr.length - 1 ? 'last' : 'mid'] = 1; if (Math.abs(idx - (pr.length - 1) / 2) <= 0.5) mid++; }
  ok(b.every(v => v / N > 0.2 && v / N < 0.46), '第 20 關 300 題：答案位置平均（前／中／後段）' + b.join('/'));
  ok(ks.first && ks.last, '可以當答案的第一個轉彎、最後一個轉彎都會是答案');
  ok(mid / N < 0.25, '答案剛好在路線正中間的不多：' + mid + ' / ' + N); }
// 到頂：候選夠多、誘餌夠多
{ let cs = 0, ns = 0; for (let i = 0; i < 60; i++) { const q = T.makeLevel(L, rnd); cs += q.candidates; ns += q.near; }
  ok(cs / 60 >= T.TURNS[1] - 0.5, '到頂平均候選 ' + (cs / 60).toFixed(1) + ' 個（≥ ' + T.TURNS[1] + '）'); ok(ns / 60 >= T.NEAR_MISS[1], '到頂平均差一條的誘餌 ' + (ns / 60).toFixed(1) + ' 個'); }
// 每一個起點都會出現
{ const s = zeros(); for (let i = 0; i < 600; i++) s[T.makeLevel(6, rnd).start]++; ok(s.every(v => v > 10), '第 6 關每一個起點都會出現 ' + s.join(',')); }
// 出題夠快（最難的關卡）：每一題都不會太慢
{ let worst = 0; const t0 = Date.now(); for (let i = 0; i < 60; i++) { const t1 = Date.now(); T.makeLevel(L, rnd); worst = Math.max(worst, Date.now() - t1); }
  ok(Date.now() - t0 < 3000 && worst < 300, '最難的關卡出題夠快：' + (Date.now() - t0) + ' ms / 60 題、最慢一題 ' + worst + ' ms'); }
// 評審動畫時間
{ const q = T.makeLevel(10, rnd), f = C.follow(q.rungs, q.start); ok(T.routeMs(f.route) >= T.ROUTE_MS[0] && T.routeMs(f.route) <= T.ROUTE_MS[1], '動畫時間在範圍內'); }

// ── 參數調很大也出得了題（不會出不來、不會只剩兩條橫線）：把參數改掉、另存一份到暫存資料夾載入 ──
{ const src = fs.readFileSync(path.resolve(__dirname, '../../js/reaction_ghostleg2.js'), 'utf8');
  const sets = [['TURNS = [8, 12]'], ['HIDE_BEFORE = [5, 5]', 'HIDE_AFTER = [5, 5]'], ['TURNS = [6, 6]', 'HIDE_BEFORE = [6, 6]', 'HIDE_AFTER = [6, 6]'], ['TURNS = [10, 10]', 'REVERSE = [5, 5]'], ['TURNS = [12, 12]', 'HIDE_BEFORE = [7, 7]', 'HIDE_AFTER = [7, 7]', 'NEAR_MISS = [3, 3]']];
  sets.forEach((set, si) => {
    let s2 = src.replace("var ID = 'ghostleg2'", "var ID = 'ghostleg2x" + si + "'");
    set.forEach(o => { const name = o.split('=')[0].trim(), re = new RegExp('var ' + name + ' = [^;]*;'); ok(re.test(s2), '找得到參數 ' + name); s2 = s2.replace(re, 'var ' + o + ';'); });
    const tmp = path.join(os.tmpdir(), 'gl2_params_' + process.pid + '_' + si + '.js');
    fs.writeFileSync(tmp, s2);
    try {
      const before = Reaction.list().length; require(tmp); const X = Reaction.list()[before].test;
      let worst = 0, few = 0, fb = 0;
      for (const l of [1, 15, 30]) for (let i = 0; i < 12; i++) {
        const t1 = Date.now(), q = X.makeLevel(l, rnd); worst = Math.max(worst, Date.now() - t1);
        if (q.stage >= 5) fb++;
        if (q.rungs.length < 15) few++;
        ok(q.rungs.filter(g => sim(q.rungs.filter(o => o !== g), q.start) === q.target).length === 1, '參數 ' + set.join('、') + '：答案只有一個');
      }
      ok(fb === 0 && few === 0 && worst < 400, '參數 ' + set.join('、') + '：出得了題（保底 ' + fb + '、少於 15 條 ' + few + '、最慢 ' + worst + ' ms）');
    } finally { fs.unlinkSync(tmp); }
  }); }

// ── 接線（原始碼／樣式） ──
{ const rd = p => fs.readFileSync(path.resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_ghostleg2.js'), css = rd('../../css/reaction3.css').replace(/\r?\n/g, ' ');
  ok(/\.gl-rung\.gx-gone \{[^}]*c-bad/.test(css) && /\.gl-rung\.gx-answer \{[^}]*c-ok/.test(css) && /\.gx-route \{[^}]*c-green/.test(css) && !/gx-pulled|gx-hold/.test(css), '拿掉橫線的樣式（沒有拖曳用的舊樣式）');
  ok(src.indexOf("kit.hintOn(stage, null, { mode: 'tap'") > 0 && src.indexOf('pointermove') < 0 && src.indexOf('PULL_PX') < 0, '點一下就拿掉（沒有拖曳）、第一次進遊戲有手指點擊提示');
  ok(src.indexOf('GhostlegCore(') > 0, '用共用的工具畫棋盤');
  const boot = rd('../../js/boot.js'); ok(boot.indexOf("'js/ghostleg_core.js'") > 0 && boot.indexOf("'js/ghostleg_core.js'") < boot.indexOf("'js/reaction_ghostleg2.js'"), 'boot.js：ghostleg_core.js 先載入');
  ok(/\['ghostleg2', 'tap', \d+, 1\]/.test(rd('browser_hints.js')), 'browser_hints：鬼腳圖減一的提示是點擊'); }

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
