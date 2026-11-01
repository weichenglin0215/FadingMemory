// 按鍵搶三十（keypad30）：鍵盤鄰居、完整搜尋（對照獨立寫的 minimax）、實測數字（目標 30 第一鍵 1、3、9）、出題必勝＋步數曲線＋按最大的不行、整盤模擬
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_keypad30.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261109); const rnd = rng(SEED);

ok(G.id === 'keypad30' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
ok(T.NB[5].slice().sort().join() === '2,4,6,8' && T.NB[7].slice().sort().join() === '4,8' && T.NB[2].slice().sort().join() === '1,3,5', '鍵盤鄰居（7 8 9 在最上面）');
ok(T.legalKeys(27, 5, 30).join() === '2' && T.legalKeys(0, 0, 30).length === 9, '能按的鍵（不能超過目標）');
// 獨立的 minimax（只算勝負）對照
function win(s, l, t, memo = {}) {
  const k = s + ',' + l; if (k in memo) return memo[k];
  const keys = (l ? T.NB[l] : [1, 2, 3, 4, 5, 6, 7, 8, 9]).filter(x => s + x <= t);
  return (memo[k] = keys.some(x => s + x === t || !win(s + x, x, t, memo)));
}
for (const t of [20, 25, 30, 35, 40]) {
  let agree = 0, total = 0;
  for (let s = 0; s < t; s++) for (let l = 0; l <= 9; l++) { total++; if ((T.value(s, l, t) > 0) === win(s, l, t)) agree++; }
  ok(agree === total, '目標 ' + t + '：勝負跟獨立的搜尋一致（' + agree + '/' + total + '）');
  ok(T.value(0, 0, t) > 0, '目標 ' + t + '：從 0 開始先手必勝');
}
ok(T.winningKeys(0, 0, 30).join() === '1,3,9', '目標 30 的第一鍵只有 1、3、9 必勝（實測）');
ok(T.value(0, 0, 20) === 2 && T.value(0, 0, 30) === 4 && T.value(0, 0, 35) === 4, '從 0 開始的必勝步數（自己按幾下，電腦盡量拖）：目標 20 是 2 步、30 是 4 步、35 是 4 步');
// 出題
const depthAt = {};
for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < 20; k++) {
  const p = T.makePuzzle(lv, rnd), st = T.stageOf(lv);
  ok(st.targets.includes(p.target), '第 ' + lv + ' 關：目標 ' + p.target);
  ok(T.value(p.sum, p.last, p.target) > 0, '第 ' + lv + ' 關：輪到你、你必勝');
  if (st.full) ok(p.sum === 0 && p.last === 0, '第 ' + lv + ' 關：從 0 開始整盤');
  else {
    ok(p.sum >= p.last && p.last >= 1, '殘局：螢幕數字至少是上一鍵');
    const want = Math.round(Reaction.kit.ramp(lv, T.DEPTH[0], T.DEPTH[1], T.RAMP_LEVELS));
    (depthAt[lv] = depthAt[lv] || []).push(p.depth);
    if (p.depth >= 2) { const keys = T.legalKeys(p.sum, p.last, p.target); ok(!T.isWinningKey(p.sum, p.last, p.target, Math.max(...keys)), '第 ' + lv + ' 關：按最大的鍵不是必勝'); }
    ok(Math.abs(p.depth - want) <= 1, '第 ' + lv + ' 關：必勝步數 ' + p.depth + '（要 ' + want + '）');
  }
}
ok(depthAt[1].every(d => d === 1) && depthAt[24].every(d => d >= 4), '步數曲線：第 1 關 1 步、第 24 關 4 步以上');
// 整盤模擬：玩家每步都按必勝鍵、電腦照它的規則按 → 玩家一定贏；而且玩家按的次數不超過 value
for (let g = 0; g < 200; g++) {
  const lv = 1 + (g % 35), p = T.makePuzzle(lv, rnd); let s = p.sum, l = p.last, presses = 0, result = null;
  for (let turn = 0; turn < 60 && !result; turn++) {
    const mine = T.winningKeys(s, l, p.target).sort((a, b) => (s + a === p.target ? 0 : T.solveState(s + a, a, p.target).plies) - (s + b === p.target ? 0 : T.solveState(s + b, b, p.target).plies));
    if (!mine.length) { result = 'lose'; break; }
    s += mine[0]; l = mine[0]; presses++;      /* 挑最快贏的那一鍵 */
    if (s === p.target) { result = 'win'; break; }
    const ck = T.computerKey(s, l, p.target, rnd);
    if (!ck) { result = 'win'; break; }
    s += ck; l = ck; if (s === p.target) result = 'lose';
  }
  ok(result === 'win', '模擬第 ' + g + ' 盤：玩家照必勝鍵按一定贏');
  ok(presses <= p.depth, '模擬第 ' + g + ' 盤：按 ' + presses + ' 次，不超過必勝步數 ' + p.depth);
}
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
