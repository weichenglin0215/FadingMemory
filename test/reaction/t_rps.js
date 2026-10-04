const { game } = require('./load.js');
const G = game('reaction_rps.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
ok(T.judge('rock', 'scissors') === 1 && T.judge('scissors', 'paper') === 1 && T.judge('paper', 'rock') === 1, 'wins');
ok(T.judge('scissors', 'rock') === -1 && T.judge('paper', 'scissors') === -1 && T.judge('rock', 'paper') === -1, 'losses');
ok(T.judge('rock', 'rock') === 0 && T.judge('paper', 'paper') === 0 && T.judge('scissors', 'scissors') === 0, 'ties');
const cnt = { scissors: 0, rock: 0, paper: 0 }; const N = 30000;
for (let i = 0; i < N; i++) cnt[T.randomKind()]++;
console.log(JSON.stringify(cnt)); ok(Object.values(cnt).every(c => Math.abs(c / N - 1 / 3) < 0.015), 'uniform');
console.log(T.chanceText(0) === '', T.chanceText(1), T.chanceText(5), T.chanceText(12));
// 電腦出拳延遲：緩衝 0.5 → 0.03 秒（線性、20 關），延遲 = 0.5 − 緩衝
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
ok(T.WINDOW_MS === 500 && near(T.bufferFor(1), 0.5) && near(T.bufferFor(20), 0.03) && near(T.bufferFor(50), 0.03) && near(T.delayFor(1), 0) && near(T.delayFor(20), 0.47), 'buffer 0.5 → 0.03, delay 0 → 0.47');
let mono = true; for (let l = 2; l <= 25; l++) if (T.bufferFor(l) > T.bufferFor(l - 1) + 1e-12 || T.delayFor(l) < T.delayFor(l - 1) - 1e-12) mono = false; ok(mono, 'buffer shrinks, delay grows');
ok(near(T.bufferFor(11) - T.bufferFor(10), T.bufferFor(3) - T.bufferFor(2), 1e-9), 'linear');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
