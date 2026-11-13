// 翻牌湊十（flipten）：發牌（成對湊十）、完美記憶策略的翻牌次數、上限、難度曲線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_flipten.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261109); const rnd = rng(SEED);

ok(G.id === 'flipten' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
// 張數與寬限曲線
T.STAGES.forEach((st, i) => { const from = i === 0 ? 1 : T.STAGES[i - 1].to + 1; ok(T.cardsFor(from) === st.cards && T.cardsFor(Math.min(st.to, from + 2)) === st.cards, '階段 ' + st.cards + ' 張'); ok(st.cards >= 2 && st.cards % 2 === 0, st.cards + ' 張是偶數（兩張一組；使用者調過張數，最後一列可以不滿）'); });
ok(T.slackFor(1) === T.SLACK[0] && T.slackFor(T.RAMP_LEVELS) === T.SLACK[1] && T.slackFor(200) === T.SLACK[1], '寬限 ' + T.SLACK);
// 玩家自己調過 SLACK（目前 2 → 12，後面寬限反而變多）：測試跟著參數走，不假設是變多還是變少
const slackDir = Math.sign(T.SLACK[1] - T.SLACK[0]);
for (let l = 2; l <= 50; l++) ok((T.slackFor(l) - T.slackFor(l - 1)) * slackDir >= 0 && T.cardsFor(l) >= T.cardsFor(l - 1), '單調 ' + l);
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
ok(T.SHOW_MS >= 1000 && T.rating(30) !== T.rating(1) && T.MAX_LEVEL >= 30, '常數與評語（MAX_LEVEL 玩家調過，目前 ' + T.MAX_LEVEL + '）');

// ── V1.47（玩家意見）：盡量不要讓「加起來是 10 的兩張牌」左右或上下相鄰，但不完全避免——每發現一組有 KEEP_ADJ_P（30%）的機會保留 ──
ok(T.KEEP_ADJ_P === 0.3, '保留相鄰的機率是 30%（參數 KEEP_ADJ_P）');
// 鄰居：每列 6 張、共 8 張（最後一列只有 2 張）
ok(T.neighborsOf(0, 24, 6).sort((a, b) => a - b).join() === '1,6' && T.neighborsOf(5, 24, 6).sort((a, b) => a - b).join() === '4,11' && T.neighborsOf(7, 24, 6).sort((a, b) => a - b).join() === '1,6,8,13', '鄰居＝左右上下（左右不跨列）');
ok(T.neighborsOf(6, 8, 6).sort((a, b) => a - b).join() === '0,7' && T.neighborsOf(7, 8, 6).sort((a, b) => a - b).join() === '1,6', '最後一列不滿：超出張數的不算');
ok(T.adjacentPairs([1, 9, 5, 5, 2, 3], 6).length === 2 && T.adjacentPairs([1, 5, 9, 5, 2, 3], 6).length === 0, 'adjacentPairs：左右相鄰的湊十（1,9 與 5,5）');
ok(T.adjacentPairs([1, 2, 3, 4, 5, 6, 9, 7, 8, 1, 1, 1], 6).map(p => p.join('-')).join() === '0-6', 'adjacentPairs：上下相鄰也算（1 與 9 在同一欄、其他都不湊十）');
{
  // spread：牌的內容不變（只是換位置）、不改傳進去的陣列、同一個亂數結果相同
  for (const n of [6, 12, 24, 48]) for (let i = 0; i < 40; i++) {
    const base = T.deal(n, rnd, T.COLS), s0 = base.slice(), s1 = T.spread(base, T.COLS, rng(i + 1)), s2 = T.spread(base, T.COLS, rng(i + 1));
    ok(base.join() === s0.join(), 'spread 不改原陣列');
    ok(s1.slice().sort().join() === base.slice().sort().join(), n + ' 張：spread 後牌的內容不變');
    ok(s1.join() === s2.join(), '同一個亂數，結果一樣');
    ok(T.adjacentPairs(s1, T.COLS).length <= T.adjacentPairs(base, T.COLS).length, 'spread 不會讓相鄰的湊十變多');
  }
  // 統計：用同一副洗好的牌，拆之前有幾組相鄰湊十、拆之後留下幾組。留下的比例應該接近 30%（拆不開的也算保留，所以略高；
  //       有時拆別組順便拆掉另一組，所以略低）——門檻訂得很寬：0.15～0.5（實測 24～39%，每種張數 400 副牌）
  for (const n of [12, 24, 48]) {
    let before = 0, after = 0;
    for (let t = 0; t < 400; t++) {
      const deck = []; for (let i = 0; i < n / 2; i++) { const a = 1 + Math.floor(rnd() * 5); deck.push(a, 10 - a); }
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      before += T.adjacentPairs(deck, T.COLS).length; after += T.adjacentPairs(T.spread(deck, T.COLS, rnd), T.COLS).length;
    }
    ok(before > 400 && after / before >= 0.15 && after / before <= 0.5, n + ' 張：相鄰湊十 ' + (before / 400).toFixed(2) + ' → ' + (after / 400).toFixed(2) + ' 組，保留 ' + (after / before * 100).toFixed(0) + '%（目標約 30%）');
  }
  // deal 預設就會 spread：相鄰湊十的組數比完全不處理（隨機洗牌）少很多
  let rawSum = 0, dealSum = 0;
  for (let t = 0; t < 300; t++) {
    const n = 24, raw = []; for (let i = 0; i < n / 2; i++) { const a = 1 + Math.floor(rnd() * 5); raw.push(a, 10 - a); }
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [raw[i], raw[j]] = [raw[j], raw[i]]; }
    rawSum += T.adjacentPairs(raw, T.COLS).length; dealSum += T.adjacentPairs(T.deal(n, rnd), T.COLS).length;
  }
  ok(dealSum < rawSum * 0.5, 'deal(24)：相鄰湊十平均 ' + (dealSum / 300).toFixed(2) + ' 組，完全隨機是 ' + (rawSum / 300).toFixed(2) + ' 組');
  // 還是每個數字都有搭檔、全部可以消完
  for (const n of [6, 24, 48]) for (let i = 0; i < 30; i++) { const d = T.deal(n, rnd), c = new Array(11).fill(0); d.forEach(v => c[v]++); ok([1, 2, 3, 4].every(a => c[a] === c[10 - a]) && c[5] % 2 === 0, n + ' 張 spread 後每個數字還是有搭檔'); }
}


// ── 牌（答案格子）的高度參數 CARD_H（預設 0.95＝牌寬的 0.95 倍；翻牌湊十）──
{ const size = T.cardSize, def = 0.95, W = 472, H = 700, base = size(W, H, 6, T.COLS, def);
  ok(T.CARD_H > 0.3 && T.CARD_H < 3, '牌高參數 CARD_H 是牌寬的幾倍（預設 0.95；使用者可以調，目前 ' + T.CARD_H + '）');
  ok(base.cw === Math.floor(W * 0.96 / T.COLS) - 8 && base.ch === Math.floor(base.cw * def) && base.rows === 1, '預設：6 張一列，牌寬 ' + base.cw + '、牌高 ' + base.ch + '＝牌寬 × 0.95');
  ok(size(W, H, 6, T.COLS, 1.3).ch === Math.floor(base.cw * 1.3) && size(W, H, 6, T.COLS, 0.5).ch === Math.floor(base.cw * 0.5) && size(W, H, 6, T.COLS, 1.3).cw === base.cw, '調大／調小 CARD_H：牌高跟著變、牌寬不變');
  for (const n of [6, 12, 24, 36, 48]) for (const hr of [0.4, 0.95, 1.3, 2, 5]) { const s = size(W, H, n, T.COLS, hr); ok(s.rows * (s.ch + 8) <= H - 200 && s.ch >= 20 && s.ch <= Math.floor(s.cw * hr), n + ' 張、CARD_H ' + hr + '：所有 ' + s.rows + ' 列放得進畫面（牌高 ' + s.ch + '，共 ' + s.rows * (s.ch + 8) + '／' + (H - 200) + '）'); }
  { let prev = 0; for (const hr of [0.3, 0.6, 0.95, 1.2, 1.6, 3]) { const s = size(W, H, 30, T.COLS, hr); ok(s.ch >= prev, '牌高隨 CARD_H 增加（不會變矮）'); prev = s.ch; } }
  ok(size(W, H, 48, T.COLS, 5).ch === Math.floor((H - 200) / 8) - 8 && size(W, H, 48, T.COLS, 5).ch < size(W, H, 6, T.COLS, 5).ch, '牌太多、調太高放不下時，縮到所有列放得進畫面：48 張最高 ' + size(W, H, 48, T.COLS, 5).ch + ' px');
  { const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_flipten.js');
    ok(/sz = cardSize\(W, H, n, COLS\)/.test(src) && /cardH == null \? CARD_H : cardH/.test(src), '遊戲真的用 CARD_H 算牌高'); } }
// ── V1.57.0 玩家意見：加上時間限制，給得很寬鬆，第 1 關 1 分鐘 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8');
  ok(Array.isArray(T.TIME_S) && T.TIME_S.length === 2 && T.TIME_S.every(x => x > 0), '時間限制參數 TIME_S 是 [第 1 關, 到頂] 秒：' + T.TIME_S);
  ok(T.timeFor(1) === 60000, '第 1 關給 1 分鐘（' + T.timeFor(1) + ' 毫秒）');
  ok(T.TIME_S[1] >= T.TIME_S[0], '到頂的時間不比第 1 關短（給得很寬鬆）');
  for (let lv = 2; lv <= 60; lv++) ok(T.timeFor(lv) >= T.timeFor(lv - 1), '時間限制隨關卡不減少：第 ' + lv + ' 關 ' + T.timeFor(lv) / 1000 + ' 秒');
  ok(T.timeFor(T.RAMP_LEVELS) === T.TIME_S[1] * 1000 && T.timeFor(99) === T.timeFor(T.RAMP_LEVELS), '到第 ' + T.RAMP_LEVELS + ' 關到頂（' + T.TIME_S[1] + ' 秒），之後維持不變');
  ok(Number.isInteger(T.timeFor(7)) && T.timeFor(7) % 1000 === 0, '時間限制是整數秒');
  const src = rd('../../js/reaction_flipten.js'), core = rd('../../js/flipsum_core.js');
  ok(/api\.timer\(timeMs, function \(\) \{ if \(!over\) failNow\(true\); \}\)/.test(src) && /timeUp \? '時間到了！/.test(src), '畫面真的啟動時間限制（api.timer）、時間到就失敗');
  ok(/rule: '[^']*每一關有時間限制/.test(src) && !/沒有計時/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), '玩法說明改成有時間限制（不再寫「沒有計時」）'); }

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
