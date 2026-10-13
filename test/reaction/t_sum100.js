const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_sum100.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);
ok(T.nearMiss([47, 63, 37, 53]) === 2 || T.nearMiss([47, 63, 37, 53]) === 4, 'nearMiss 例');
ok(T.nearMiss([40, 60, 30, 70]) === 2 && T.nearMiss([40, 60]) === 0, 'nearMiss：40+70=110、30+60=90；互補不算');
let nearSum = 0, belowMin = 0;
for (let i = 0; i < 3000; i++) {
  const b = T.makeBoard(rnd), c = b.cards;
  ok(c.length === 30 && new Set(c).size === 30, '30 個不同的數字（5×6）');
  ok(c.every(n => n >= T.A_MIN && n <= 100 - T.A_MIN && n !== 50), '數字範圍、不含 50');
  // 每個數字的互補數剛好出現一次（配對唯一）
  c.forEach(n => ok(c.filter(m => n + m === 100).length === 1, n + ' 的互補數只有一張'));
  let pairs = 0; for (let x = 0; x < 30; x++) for (let y = x + 1; y < 30; y++) if (c[x] + c[y] === 100) pairs++;
  ok(pairs === 15, '剛好 15 對');
  ok(b.near === T.nearMiss(c), 'near 欄位正確');
  nearSum += b.near; if (b.near < T.NEAR_MIN) belowMin++;
}
ok(belowMin / 3000 < 0.02, '「差一點」不足的盤面比例 ' + belowMin / 3000);
console.log('平均「差一點」組數 ' + (nearSum / 3000).toFixed(2) + '；不足 ' + T.NEAR_MIN + ' 組的盤面 ' + belowMin + ' / 3000');
// 洗牌：每個位置的數字都有變化
{ const first = new Set(); for (let i = 0; i < 300; i++) first.add(T.makeBoard(rnd).cards[0]); ok(first.size > 20, '第一張牌的變化 ' + first.size); }
ok(T.PENALTY_MS === 3000, '罰 3 秒');
ok(T.LIMIT_S === 180 && G.score.max === 180 && G.name === '兩張成百', '限時 180 秒（成績上限同步）、遊戲名稱「兩張成百」');
ok(T.rating(20) !== T.rating(50) && T.rating(50) !== T.rating(90) && T.rating(90) !== T.rating(150), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
