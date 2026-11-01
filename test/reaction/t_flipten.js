// 翻牌湊十（flipten）：發牌（成對湊十）、完美記憶策略的翻牌次數、上限、難度曲線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_flipten.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261109); const rnd = rng(SEED);

ok(G.id === 'flipten' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
// 張數與寬限曲線
T.STAGES.forEach((st, i) => { const from = i === 0 ? 1 : T.STAGES[i - 1].to + 1; ok(T.cardsFor(from) === st.cards && T.cardsFor(Math.min(st.to, from + 2)) === st.cards, '階段 ' + st.cards + ' 張'); ok(st.cards % T.COLS === 0, st.cards + ' 張排得成 ' + T.COLS + ' 欄'); });
ok(T.slackFor(1) === T.SLACK[0] && T.slackFor(T.RAMP_LEVELS) === T.SLACK[1] && T.slackFor(200) === T.SLACK[1], '寬限 ' + T.SLACK);
for (let l = 2; l <= 50; l++) ok(T.slackFor(l) <= T.slackFor(l - 1) && T.cardsFor(l) >= T.cardsFor(l - 1), '單調 ' + l);
// 發牌：一半是成對湊十，所有牌可以全部消完
for (const n of [8, 16, 24]) for (let i = 0; i < 60; i++) {
  const d = T.deal(n, rnd), c = new Array(11).fill(0);
  d.forEach(v => c[v]++);
  ok(d.length === n && d.every(v => v >= 1 && v <= 9), n + ' 張都是 1～9');
  ok([1, 2, 3, 4].every(a => c[a] === c[10 - a]) && c[5] % 2 === 0, n + ' 張：每個數字都有搭檔，可以全部消完');
}
// 完美記憶策略：人工算幾個小例子
ok(T.perfectFlips([1, 9]) === 1, '2 張 1、9：翻 1 次');
ok(T.perfectFlips([1, 2, 9, 8]) === 3 || T.perfectFlips([1, 2, 9, 8]) === 2, '4 張：2～3 次（運氣好的排法 2 次）：' + T.perfectFlips([1, 2, 9, 8]));
ok(T.perfectFlips([1, 9, 2, 8]) === 2, '1,9,2,8：左邊兩兩成對，直接翻 2 次');
ok(T.perfectFlips([1, 2, 8, 9]) === 3, '1,2,8,9：翻 1,2（不是）→ 翻 8（記得 2 在哪）→ 找到 2 消掉、再翻 1,9：3 次');
// 完美策略 ≥ 湊對數、≤ 全部亂翻；上限＝完美＋寬限
for (const n of [8, 16, 24]) for (let i = 0; i < 100; i++) {
  const d = T.deal(n, rnd), pf = T.perfectFlips(d);
  ok(pf >= n / 2 && pf <= n * 1.5, n + ' 張的完美翻牌次數 ' + pf + ' 在合理範圍');
  ok(T.limitFor(1, d) === pf + T.slackFor(1) && T.limitFor(30, d) === pf + T.slackFor(30), '上限＝完美＋寬限');
}
// 完美策略真的能把牌翻完（模擬玩一遍，實際翻牌次數 ≤ perfectFlips）
function simulate(deck) {
  const n = deck.length, gone = new Array(n).fill(false), known = new Array(n).fill(false); let flips = 0, left = n, guard = 0;
  while (left > 0 && guard++ < 1000) {
    let pair = null;
    for (let i = 0; i < n && !pair; i++) if (known[i] && !gone[i]) for (let j = i + 1; j < n; j++) if (known[j] && !gone[j] && deck[i] + deck[j] === 10) { pair = [i, j]; break; }
    if (pair) { flips++; gone[pair[0]] = gone[pair[1]] = true; left -= 2; continue; }
    let u = -1; for (let i = 0; i < n; i++) if (!known[i] && !gone[i]) { u = i; break; }
    if (u < 0) return -1;
    known[u] = true;
    let mate = -1; for (let j = 0; j < n; j++) if (known[j] && !gone[j] && j !== u && deck[j] + deck[u] === 10) { mate = j; break; }
    if (mate >= 0) { flips++; gone[u] = gone[mate] = true; left -= 2; continue; }
    let u2 = -1; for (let i = 0; i < n; i++) if (!known[i] && !gone[i] && i !== u) { u2 = i; break; }
    known[u2] = true; flips++;
    if (deck[u] + deck[u2] === 10) { gone[u] = gone[u2] = true; left -= 2; }
  }
  return left === 0 ? flips : -1;
}
for (let i = 0; i < 100; i++) { const d = T.deal(8 * (1 + (i % 3)), rnd); ok(simulate(d) === T.perfectFlips(d), '模擬玩一遍＝完美翻牌次數'); }
// 亂翻比完美策略差很多（遊戲有意義：記憶有用）
{
  let rsum = 0, psum = 0;
  for (let i = 0; i < 100; i++) {
    const d = T.deal(16, rnd), n = d.length, gone = new Array(n).fill(false); let left = n, f = 0;
    while (left > 0 && f < 2000) { const idx = []; for (let k = 0; k < n; k++) if (!gone[k]) idx.push(k); const a = idx.splice(Math.floor(rnd() * idx.length), 1)[0], b = idx[Math.floor(rnd() * idx.length)]; f++; if (d[a] + d[b] === 10) { gone[a] = gone[b] = true; left -= 2; } }
    rsum += f; psum += T.perfectFlips(d);
  }
  ok(rsum > psum * 2, '16 張：亂翻平均 ' + (rsum / 100).toFixed(1) + ' 次，完美記憶 ' + (psum / 100).toFixed(1) + ' 次');
}
// 出題
for (const lv of [1, 5, 6, 15, 16, 30, 60]) { const p = T.makePuzzle(lv, rnd); ok(p.n === T.cardsFor(lv) && p.deck.length === p.n && p.limit === p.perfect + T.slackFor(lv), '第 ' + lv + ' 關'); }
ok(T.SHOW_MS >= 1000 && T.rating(30) !== T.rating(1) && T.MAX_LEVEL === 90, '常數與評語');

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
