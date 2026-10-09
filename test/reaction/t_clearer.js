const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_clearer.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 限時：第 1 關 8 秒 → 第 10 關 5 秒（線性）
ok(near(T.limitS(1), 8) && near(T.limitS(T.LEVELS), 5), '限時端點');
{ const d = T.limitS(1) - T.limitS(2); for (let l = 1; l < T.LEVELS; l++) ok(near(T.limitS(l) - T.limitS(l + 1), d, 1e-12), '限時線性 ' + l); }
// 模糊度與角速度：一開始最大、線性降到 0、到限時完全清晰且停止
for (let l = 1; l <= T.LEVELS; l++) {
  const T_ms = T.limitS(l) * 1000;
  ok(near(T.blurAt(l, 0), T.BLUR_MAX) && near(T.blurAt(l, T_ms), 0) && near(T.blurAt(l, T_ms / 2), T.BLUR_MAX / 2), '模糊度端點與線性 ' + l);
  ok(near(T.spinAt(l, 0), T.SPIN_MAX) && near(T.spinAt(l, T_ms), 0) && near(T.spinAt(l, T_ms / 4), T.SPIN_MAX * 0.75), '角速度端點與線性 ' + l);
  // 角度是角速度的積分：用數值積分驗證
  let ang = 0; const dt = 1; for (let ms = 0; ms < T_ms; ms += dt) ang += T.spinAt(l, ms + dt / 2) * dt / 1000;
  ok(Math.abs(T.angleAt(l, T_ms) - ang) < 0.5, '角度＝角速度的積分 ' + T.angleAt(l, T_ms) + ' vs ' + ang);
  ok(T.angleAt(l, T_ms + 5000) === T.angleAt(l, T_ms), '限時之後停止轉動');
  let prev = -1; for (let ms = 0; ms <= T_ms; ms += 100) { const a = T.angleAt(l, ms); ok(a >= prev - 1e-9, '角度只增不減'); prev = a; }
}
// 得分：越早越高；剛開始 ≈100、限時時 0；第 1 關搶答打折
ok(near(T.gainFor(2, 0), 100) && near(T.gainFor(2, T.limitS(2) * 1000), 0) && near(T.gainFor(2, T.limitS(2) * 500), 50), '得分端點與線性');
ok(near(T.gainFor(1, 500), (1 - 500 / 8000) * 100 * T.RUSH_K) && near(T.gainFor(1, 1000), (1 - 1000 / 8000) * 100) && T.gainFor(1, 999) < T.gainFor(1, 1000), '第 1 關搶答（< ' + T.RUSH_MS + ' ms）打折，剛過門檻不打折');
ok(near(T.gainFor(2, 500), (1 - 500 / T.limitS(2) / 1000) * 100), '第 2 關起不打折');
ok(near(T.clarityPct(3, T.limitS(3) * 250), 25), '清晰度百分比');
// 題庫：10 組、每組 5 個不同的字、全部單一漢字、組間不重複
{ const all = []; ok(T.FAMILIES.length === T.LEVELS, '每關一組'); T.FAMILIES.forEach(f => { ok(f.length === 5 && new Set(f).size === 5, '每組 5 個不同的字'); f.forEach(c => { ok(/^[一-鿿]$/.test(c), c + ' 是單一漢字'); all.push(c); }); }); ok(new Set(all).size === all.length, '組間沒有重複字'); }
// 出題
for (let l = 1; l <= T.LEVELS; l++) for (let i = 0; i < 100; i++) {
  const q = T.makeLevel(l, rnd), fam = T.FAMILIES[l - 1];
  ok(fam.indexOf(q.target) >= 0 && q.options.length === 5 && new Set(q.options).size === 5 && q.options.slice().sort().join() === fam.slice().sort().join(), '選項＝這一關的字群，正解在裡面');
  ok(q.dir === 1 || q.dir === -1 && q.start >= 0 && q.start < 360, '方向與起始角');
}
// 洗牌：正解位置平均
{ const pos = [0, 0, 0, 0, 0]; for (let i = 0; i < 5000; i++) { const q = T.makeLevel(5, rnd); pos[q.options.indexOf(q.target)]++; } ok(pos.every(c => c > 850 && c < 1150), '正解位置平均 ' + pos.join(',')); }
// 防亂按：蒙特卡羅模擬——亂按（一開始就按、答對 20%）的期望累計分數，遠低於「等到清晰度 50% 再按、答對率 90%」的認真玩家
{
  const sim = (pAt, pCorrect, n) => { let total = 0; for (let g = 0; g < n; g++) { let sum = 0; for (let l = 1; l <= T.LEVELS; l++) { const ms = T.limitS(l) * 1000 * pAt; if (rnd() < pCorrect) sum += T.gainFor(l, ms); else break; } total += sum; } return total / n; };
  const guess = sim(0.02, 0.2, 40000), careful = sim(0.5, 0.9, 40000), cautious = sim(0.7, 0.98, 40000);
  console.log('亂按（一開始就按）期望累計分數 ' + guess.toFixed(2) + '；有把握才按（清晰度 50%、答對率 90%）' + careful.toFixed(2) + '；很保守（清晰度 70%）' + cautious.toFixed(2));
  ok(guess < 40, '亂按的期望累計分數很低：' + guess); ok(careful > guess * 4, '認真玩遠高於亂按：' + careful + ' vs ' + guess);
  // 亂按連續矇對 10 關的機率
  ok(Math.pow(0.2, 10) < 1e-6, '亂按全對機率極小');
  // 亂按「一次」就矇到的最高單關分數（第 2 關以後 ≈ 98 分），但只有 20% 機率——累計分數才是成績
  let max = 0; for (let g = 0; g < 200000; g++) { let sum = 0; for (let l = 1; l <= T.LEVELS; l++) { if (rnd() < 0.2) sum += T.gainFor(l, T.limitS(l) * 1000 * 0.02); else break; } max = Math.max(max, sum); }
  ok(max < 600, '連玩 20 萬局亂按，最高累計分也遠低於滿分 1000：' + max.toFixed(1)); console.log('亂按 20 萬局最高累計分 ' + max.toFixed(1)); }
ok(T.rating(50) !== T.rating(150) && T.rating(150) !== T.rating(300) && T.rating(300) !== T.rating(500) && T.rating(500) !== T.rating(800), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
