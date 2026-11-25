// 拖曳湊十（sumten）的純函式檢查（V1.57.5 玩家回饋後的新規則）：
//   · 依拖的順序累加，必須剛好一段一段湊成 10：超過 10、最後不到 10 → 整串失敗、完全不計分（玩家列的成功／失敗例子逐一驗證）
//   · 畫面不能提示這串對不對：沒有「確定」按鈕也沒有預覽，拖的時候挑到的格子一律同一種顏色（瀏覽器測試量底色）；數字字色 1～4 綠、5 橘、6～9 黑
//   · 盤面不能出現 7373… 這種不用想的花樣：任何時候「互補兩數交替」最多 ALT_HARD 格；九個數字分布平均；同數字很少擠在一起
//   · 推算法（依停下來之後四周的數字挑新數字）：簡單關卡兩格湊十多、難的關卡比較少；任何時候都至少有 MIN_MOVES 個不同的「一段湊十」
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../') + '/';
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_sumten.js'); const T = G.test;
let bad = 0, total = 0; const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const rnd = rng(seedOf(20261125));
const G5 = T.gridOf(5, 7), G6 = T.gridOf(6, 9), G8 = T.gridOf(8, 11);

// 做一條蛇行的路（一列左到右、下一列右到左…），把 nums 依序寫上去；回傳 { vals（其他格子是 null）, cells（路的格子，依序） }
const snake = (nums, gr) => { gr = gr || G8; const v = new Array(gr.n).fill(null), cells = nums.map((x, i) => { const r = Math.floor(i / gr.w), c = r % 2 ? gr.w - 1 - (i % gr.w) : i % gr.w, k = r * gr.w + c; v[k] = x; return k; }); return { vals: v, cells }; };
const J = (expr) => { const s = snake(expr.split('+').map(Number)); return T.judge(G8, s.vals, s.cells); };

// ── 固定的東西 ──
ok(T.TEN === 10 && T.MIN_CELLS === 2, '每一段要剛好湊成 10（玩家指定）、至少 2 格');
ok(T.MAX_LEVEL === 90 && T.RAMP_LEVELS === 30, '標準難度曲線：RAMP_LEVELS 30、MAX_LEVEL 90');
ok(T.getOpts().loupe === false && !('fast' in T.getOpts()), '介面跟連號長龍一樣：「浮窗」預設不勾、沒有「快速拖曳」選項');
{ const d1 = T.dimsFor(1), d20 = T.dimsFor(20); ok(d1.w === 5 && d1.h === 7 && d20.w === 8 && d20.h === 11, '盤面：第 1 關 5×7、第 20 關 8×11'); }
ok(T.targetFor(1) === T.TARGET[0] && T.targetFor(T.RAMP_LEVELS) === T.TARGET[1] && T.targetFor(99) === T.TARGET[1], '目標分數 ' + T.TARGET + '，到頂後維持');
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S + ' 秒');
for (let l = 2; l <= 60; l++) {
  const p0 = T.fillParams(l - 1), p1 = T.fillParams(l);
  ok(p1.assist <= p0.assist + 1e-9 || T.ASSIST_P[0] < T.ASSIST_P[1], '第 ' + l + ' 關推算法機率不增加');
  ok(p1.aim >= p0.aim - 1e-9 || T.AIM_CELLS[0] > T.AIM_CELLS[1], '第 ' + l + ' 關湊十需要的格數不變少');
  ok(p1.brk >= p0.brk - 1e-9 || T.BREAK_P[0] > T.BREAK_P[1], '第 ' + l + ' 關搗蛋機率不降低');
  ok(p1.alt <= T.ALT_HARD && p1.alt >= 2, '第 ' + l + ' 關挑數字時的交替上限在 2～' + T.ALT_HARD);
}
ok(T.ALT_HARD <= 3, '整盤保證：互補兩數交替最多 ' + T.ALT_HARD + ' 格（不會出現 7373）');

// ── 判定：玩家列的例子 ──
for (const [expr, sum] of [['1+2+3+4', 10], ['4+6', 10], ['5+5', 10], ['3+7', 10], ['8+2', 10], ['1+2+3+4+4+6', 20], ['5+5+3+7', 20], ['8+2+9+1', 20]]) {
  const r = J(expr); ok(r.ok && r.sum === sum && r.segs === sum / 10, '成功：' + expr + ' → ' + r.sum + ' 分（' + r.segs + ' 段）');
}
for (const [expr, why] of [['1+2+3', 'under'], ['4+5', 'under'], ['5+3', 'under'], ['3+6', 'under'], ['7+2', 'under'], ['1+2+3+4+6+2', 'under'], ['5+5+3+8', 'over'], ['8+2+9+8', 'over'], ['5+3+3', 'over'], ['8+9+8', 'over']]) {
  const r = J(expr); ok(!r.ok && r.why === why, '失敗：' + expr + ' → ' + r.why + '（應為 ' + why + '）');
}
ok(J('8+9+8').at === 1, '8＋9 就超過 10：在第 2 格就失敗，後面不用看');
ok(J('9+1+9+1+9+1').ok && J('9+1+9+1+9+1').sum === 30, '三段：9＋1 三次 → 30 分');
{ // 路徑的檢查
  const s = snake([3, 7, 4, 6]);
  ok(T.judge(G8, s.vals, s.cells).ok, '相鄰的 4 格：兩段');
  ok(T.judge(G8, s.vals, [s.cells[0], s.cells[2], s.cells[1], s.cells[3]]).why === 'path', '跳過一格（不相鄰）→ path');
  ok(T.judge(G8, s.vals, [s.cells[0], s.cells[1], s.cells[0]]).why === 'path', '同一格用兩次 → path');
  const v2 = s.vals.slice(); v2[s.cells[1]] = null; ok(T.judge(G8, v2, s.cells.slice(0, 2)).why === 'path', '空格 → path');
  ok(T.judge(G8, s.vals, []).why === 'short', '沒有挑選 → short');
  ok(T.judge(G8, s.vals, [s.cells[1], s.cells[0]]).ok, '順序反過來（7 → 3）也是 10');
}
// 順序很重要：同一組格子，換個順序就可能失敗
{ const s = snake([6, 4, 5, 5]); ok(T.judge(G8, s.vals, s.cells).ok, '6、4、5、5：兩段都剛好');
  const s2 = snake([6, 5, 4, 5]); ok(!T.judge(G8, s2.vals, s2.cells).ok, '6、5、4、5：6＋5＝11 超過 → 失敗（雖然總和一樣是 20）'); }

// ── 數字顏色（玩家指定：1～4 綠、5 橘、6～9 黑）──
{ const rgb = c => c.match(/\d+/g).map(Number), [lr, lg, lb] = rgb(T.COLOR_LOW), [fr, fg, fb] = rgb(T.COLOR_FIVE), [hr, hg, hb] = rgb(T.COLOR_HIGH);
  ok([1, 2, 3, 4].every(v => T.digitColor(v) === T.COLOR_LOW) && T.digitColor(5) === T.COLOR_FIVE && [6, 7, 8, 9].every(v => T.digitColor(v) === T.COLOR_HIGH), 'digitColor：1～4、5、6～9 各一種');
  ok(lg > 90 && lr < 60 && lb < 60, '1～4 是綠色：' + T.COLOR_LOW);
  ok(fr > 180 && fg > 80 && fg < 180 && fb < 60, '5 是橘色：' + T.COLOR_FIVE);
  ok(hr < 40 && hg < 40 && hb < 40, '6～9 是黑色：' + T.COLOR_HIGH); }

// ── 拖曳 ──
{ const vals = snake([2, 3, 5, 1, 8]).vals; const st = T.newState({ gr: G8, vals, level: 1 });
  T.beginDrag(st, 0);
  ok(T.dragStep(st, 1) === 'add' && T.dragStep(st, 2) === 'add' && st.sel.join() === '0,1,2', '數字沒有限制：2→3→5 都能拖');
  ok(T.dragStep(st, 4) === null, '要相鄰：不能跳格');
  ok(T.dragStep(st, 3) === 'add' && T.dragStep(st, 2) === 'back' && st.sel.join() === '0,1,2', '拖回上一格＝收回一格');
  T.beginDrag(st, 1); ok(st.sel.join() === '1', '手指重新按下去：開始新的一串');
  const r = T.commit(st, Math.random); ok(r && !r.ok && r.reason === 'short' && r.fail === false && st.score === 0, '只點一下（1 格）：不算失敗、不計分'); }

// ── 收走（commit）──
{ const mk = (nums) => { const s = snake(nums, G5); const st = T.newState({ gr: G5, vals: s.vals.map((v, i) => v == null ? 1 + (i % 9) : v), level: 1 }); return { st, cells: s.cells }; };
  let { st, cells } = mk([1, 2, 3, 4, 4, 6]);
  ok(T.commit(st, rnd) === null, '沒有挑選：回傳 null');
  st.sel = [cells[0]]; let r = T.commit(st, rnd); ok(!r.ok && r.reason === 'short' && r.fail === false && st.sel.length === 1, '只挑 1 格：至少 2 格（不算失敗、挑選留著）');
  const before = st.vals.slice();
  st.sel = cells.slice(0, 5); r = T.commit(st, rnd); ok(!r.ok && r.reason === 'under' && r.fail === true && st.score === 0 && st.vals.join() === before.join(), '1＋2＋3＋4＋4：第二段只有 4 → 整串失敗（前面的 10 也不算），盤面不動、fail＝true');
  st.sel = cells.slice(0, 6); r = T.commit(st, rnd);
  ok(r.ok && r.sum === 20 && r.segs === 2 && r.gain === 20 && st.score === 20 && st.done === 1 && st.sel.length === 0 && r.cells.join() === cells.join(), '1＋2＋3＋4＋4＋6 → 兩段、得 20 分、整串收走');
  ok(st.vals.every(v => Number.isInteger(v) && v >= 1 && v <= 9) && r.fresh.length === 6 && r.moves.length === G5.n - 6, '缺的格子補上新數字');
  const m2 = mk([5, 5, 3, 8]); m2.st.sel = m2.cells.slice(); r = T.commit(m2.st, rnd); ok(!r.ok && r.reason === 'over' && r.fail && m2.st.score === 0, '5＋5＋3＋8 → 第二段超過 → 失敗，5＋5 也不算'); }
ok(T.scoreOf(30, 5) === 30 + T.LEN_BONUS * 3 && T.scoreOf(10, 2) === 10, '得分＝總和（＋長度加分 LEN_BONUS＝' + T.LEN_BONUS + '）');

// ── 掉落（共用的 collapse）──
for (const gr of [G5, G6, G8]) for (let t = 0; t < 40; t++) {
  const vals = Array.from({ length: gr.n }, () => 1 + Math.floor(rnd() * 9));
  const removed = new Set(); const cnt = 2 + Math.floor(rnd() * 8); while (removed.size < cnt) removed.add(Math.floor(rnd() * gr.n));
  const cz = T.collapse(gr, vals, [...removed]);
  ok(cz.fresh.length === removed.size && cz.moves.length === gr.n - removed.size && cz.fresh.every(i => cz.vals[i] === null), gr.w + '×' + gr.h + '：每一欄剩下的方格掉到底、上面留空');
}

// ── 花樣的偵測與禁止 ──
{ const row = (nums) => { const v = new Array(G8.n).fill(null); nums.forEach((x, i) => { v[i] = x; }); return v; };
  ok(T.altRun(G8, row([7, 3, 7, 3, 7]), 0, 7, 40) === 5 && T.altRun(G8, row([7, 3, 7, 3, 7]), 2, 7, 40) === 5, 'altRun：7、3、7、3、7 是 5 格交替');
  ok(T.altRun(G8, row([5, 5, 5, 5]), 1, 5, 40) === 4, 'altRun：5、5、5、5 也算交替（4 格）');
  ok(T.altRun(G8, row([7, 3, 6, 4]), 0, 7, 40) === 2, 'altRun：7、3、6、4 只有 7、3 兩格交替');
  ok(T.longestAlt(G8, row([1, 9, 1, 9, 1, 9, 1, 9])) === 8, 'longestAlt 看整個盤面');
  ok(T.violation(G8, row([7, 3, 7]), 3, 3, 3) > 0 && T.violation(G8, row([7, 3, 7]), 3, 4, 3) === 0, '第 4 格寫 3 會變成 7、3、7、3（超過 3）→ 違反；寫 4 沒問題');
  const same = new Array(G8.n).fill(null); same[0] = 6; same[2] = 6; ok(T.violation(G8, same, 1, 6, 3) > 0 && T.violation(G8, same, 1, 5, 3) === 0, '左右都是 6 的格子再寫 6 → 同數字擠在一起');
  const v = new Array(G8.n).fill(0).map((_, i) => (i + Math.floor(i / 8)) % 2 ? 3 : 7);           // 整盤 7、3 棋盤格：最糟的花樣
  ok(T.longestAlt(G8, v) > 20, '（測試資料：整盤 7、3 相間）');
  const all = v.map((_, i) => i); let guard = 0; while (T.longestAlt(G8, v) > T.ALT_HARD && guard++ < 5) T.breakPatterns(G8, v, [all], rnd);
  ok(T.longestAlt(G8, v) <= T.ALT_HARD, 'breakPatterns：整盤 7、3 相間也能拆到最多 ' + T.ALT_HARD + ' 格（剩 ' + T.longestAlt(G8, v) + '）'); }

// ── 實際出題與一直玩下去：花樣、分布、路數、只改動過的格子 ──
{ const digit = new Array(10).fill(0); let cells = 0, crowded = 0, worst = 0, staticChanged = 0, checks = 0, minMovesBad = 0;
  for (const lv of [1, 3, 8, 14, 20, 26, 30, 45]) {
    for (let g = 0; g < 4; g++) {
      const q = T.makePuzzle(lv, rnd), st = T.newState(q);
      ok(q.w === T.dimsFor(lv).w && q.h === T.dimsFor(lv).h && q.vals.every(v => Number.isInteger(v) && v >= 1 && v <= 9) && q.target === T.targetFor(lv), '第 ' + lv + ' 關：盤面 ' + q.w + '×' + q.h + '、每格 1～9');
      for (let m = 0; m < 20; m++) {
        checks++;
        worst = Math.max(worst, T.longestAlt(st.gr, st.vals));
        const segs = T.segments(st.gr, st.vals, 999); if (segs.length < T.minMovesFor(lv)) minMovesBad++;
        st.vals.forEach((v, i) => { digit[v]++; cells++; if (T.sameCount(st.gr, st.vals, i, v) >= 2) crowded++; });
        const p = segs[Math.floor(rnd() * segs.length)]; if (!p) break;
        const old = st.vals.slice(); st.sel = p.slice(); const r = T.commit(st, rnd);
        if (!r.ok) { ok(false, '第 ' + lv + ' 關：一段湊十被拒收 ' + JSON.stringify(r)); break; }
        const movedTo = new Set(r.moves.filter(x => x.from !== x.to).map(x => x.to).concat(r.fresh));
        r.moves.filter(x => x.from === x.to).forEach(x => { if (st.vals[x.to] !== old[x.from] && !movedTo.has(x.to)) staticChanged++; });
      }
    }
  }
  ok(worst <= T.ALT_HARD, '出題＋連續收走（共 ' + checks + ' 個盤面）：互補兩數交替最長 ' + worst + ' 格（上限 ' + T.ALT_HARD + '）——不會出現 7373…');
  const share = digit.slice(1).map(d => d / cells);
  ok(share.every(s => s > 0.07 && s < 0.16), '九個數字分布平均（每個 7%～16%）：' + share.map(s => (100 * s).toFixed(0)).join('/'));
  ok(crowded / cells < 0.05, '一格被兩個以上同數字包圍的比例很低：' + (100 * crowded / cells).toFixed(1) + '%');
  ok(staticChanged <= checks * 0.02, '沒動過的格子數字不會自己變（' + staticChanged + ' 次）');
  ok(minMovesBad <= checks * 0.01, '盤面上幾乎永遠至少有 MIN_MOVES 個不同的「一段湊十」（不足 ' + minMovesBad + '／' + checks + '）'); }

// ── 難度：簡單關卡兩格湊十多，難的關卡少 ──
{ const pairPerCell = (lv) => { let pairs = 0, n = 0; for (let i = 0; i < 30; i++) { const q = T.makePuzzle(lv, rnd); const gr = q.gr; for (let k = 0; k < gr.n; k++) { n++; if (gr.nb[k].some(m => q.vals[k] + q.vals[m] === 10)) pairs++; } } return pairs / n; };
  const e = pairPerCell(1), h = pairPerCell(30);
  ok(e > h + 0.1, '旁邊就有「兩格湊十」的格子比例：第 1 關 ' + (e * 100).toFixed(0) + '% > 第 30 關 ' + (h * 100).toFixed(0) + '%（難關要心算比較多格）'); }

// ── 找最好的一串（依新規則）──
{ const gr = G8, empty = new Array(gr.n).fill(null);
  ok(T.bestMove(gr, empty).length === 0 && T.bestScore(gr, empty) === 0 && T.segments(gr, empty, 99).length === 0, '空盤面沒有任何一串');
  const a = snake([4, 6, 3, 7, 4]); ok(T.bestScore(gr, a.vals) === 20, '4、6、3、7、4：最多兩段 20 分（尾巴的 4 湊不成段）');
  const b = snake([1, 9]); ok(T.bestMove(gr, b.vals).length === 2 && T.segments(gr, b.vals, 99).length === 1, '1、9：一段');
  for (let t = 0; t < 60; t++) {                          // 跟暴力解比一比
    const v = new Array(gr.n).fill(null); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) v[r * gr.w + c] = 1 + Math.floor(rnd() * 9);
    let best = 0, segKeys = new Set(); const cs = []; for (let i = 0; i < gr.n; i++) if (v[i] != null) cs.push(i);
    const go = (p, mark) => { const j = T.judge(gr, v, p); if (j.ok) { best = Math.max(best, T.scoreOf(j.sum, p.length)); if (j.segs === 1 && p.length <= T.SEG_MAX) segKeys.add(p.slice().sort((x, y) => x - y).join()); } T.neighbors(gr, p[p.length - 1]).forEach(k => { if (!mark.has(k) && v[k] != null && p.length < T.SEARCH_LEN) { mark.add(k); p.push(k); go(p, mark); p.pop(); mark.delete(k); } }); };
    cs.forEach(s => go([s], new Set([s])));
    ok(T.bestScore(gr, v) === best, '最好的一串跟暴力解一樣（' + best + '）');
    ok(T.segments(gr, v, 999).length === segKeys.size, '「一段湊十」的個數跟暴力解一樣（' + segKeys.size + '）');
    const bm = T.bestMove(gr, v); ok(!bm.length || T.judge(gr, v, bm).ok, 'bestMove 找到的一串一定合規則');
  } }

// ── 評語、登記資料 ──
ok(T.rating(25) !== T.rating(12) && T.rating(12) !== T.rating(6) && T.rating(6) !== T.rating(3) && T.rating(3) !== T.rating(0), '評語依關數分級');
ok(G.id === 'sumten' && G.name === '拖曳湊十', '登記資料：代號 sumten、名稱「拖曳湊十」');
ok(/剛好湊成一段一段的 10/.test(G.rule) && /失敗/.test(G.rule) && /不會告訴你/.test(G.rule) && /手指一離開/.test(G.rule) && /浮窗/.test(G.rule) && !/確定|快速拖曳|點一下|用點的/.test(G.rule) && !/放棄、留在盤面上/.test(G.rule) && (G.rule.match(/\*\*/g) || []).length % 2 === 0, '玩法說明：照順序剛好湊成段、手指一離開就計算、失敗不計分、不提示、浮窗；沒有提到確定／快速拖曳／點選');
// ── 檔案接線 ──
{ const boot = fs.readFileSync(ROOT + 'js/boot.js', 'utf8'), menu = fs.readFileSync(ROOT + 'js/menu.js', 'utf8'), src = fs.readFileSync(ROOT + 'js/reaction_sumten.js', 'utf8'), ui = fs.readFileSync(ROOT + 'js/numgrid_ui.js', 'utf8');
  ok(boot.indexOf("'js/numgrid_ui.js'") < boot.indexOf("'js/reaction_sumten.js'") && boot.indexOf("'js/reaction_sumten.js'") > 0, 'boot.js：numgrid_ui.js 在 reaction_sumten.js 之前載入');
  ok(/id: 'sumten', name: '拖曳湊十', cat: 'number'/.test(menu), 'menu.js 有這款（數字）');
  ok(/r\.fail/.test(ui) && !/state === 'drop'/.test(ui) && !/spec\.preview/.test(ui) && /digitColor: digitColor/.test(src) && /spec\.digitColor/.test(ui), '共用介面：拖的時候不做任何預覽、失敗會閃紅清掉、數字字色用各遊戲的 digitColor');
  ok(/NG\.mount\(root, ctx/.test(src), '拖曳湊十把規則交給共用介面 NG.mount'); }
console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS ' + total);
process.exit(bad ? 1 : 0);
