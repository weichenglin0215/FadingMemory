const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_passersby.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 難度曲線
ok(near(T.speedAt(1), 150) && near(T.speedAt(T.RAMP_LEVELS), 400) && near(T.gapAt(1), 1.4) && near(T.gapAt(T.RAMP_LEVELS), 0.5), '速度與間隔端點');
ok(T.ansMs(1) === 8000 && T.ansMs(T.RAMP_LEVELS) === 4000, '作答限時端點');
{ const d = T.speedAt(2) - T.speedAt(1); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.speedAt(l + 1) - T.speedAt(l), d, 1e-9), '速度線性 ' + l); }
ok(T.partsFor(1).join() === 'shirt' && T.partsFor(4).join() === 'shirt,pants' && T.partsFor(7).join() === 'shirt,pants,shoes' && T.partsFor(10).length === 4, '問的部位隨關卡增加');
// 七種顏色：名稱不同、色碼不同
ok(T.COLORS.length === 7 && new Set(T.COLORS.map(c => c.name)).size === 7 && new Set(T.COLORS.map(c => c.hex)).size === 7, '七種顏色');
// 出題
let sameAcross = 0, cnt = 0;
for (let l = 1; l <= T.RAMP_LEVELS; l++) for (let i = 0; i < 200; i++) {
  const q = T.makeLevel(l, rnd, 472);
  ok(q.people.length === 5, '5 個人');
  q.people.forEach((p, k) => {
    const cols = [p.hat, p.shirt, p.pants, p.shoes];
    ok(new Set(cols).size === 4 && cols.every(c => c >= 0 && c < 7), '同一個人的四件顏色不同');
    if (k > 0) {
      const gap = p.t - q.people[k - 1].t;
      ok(gap >= T.MIN_SPACE / q.speed - 1e-9, '兩人間隔不會重疊 ' + gap);
      ok(gap >= Math.min(T.gapAt(l) * T.JITTER[0], 1e9) - 1e-9 || gap >= T.MIN_SPACE / q.speed - 1e-9, '間隔下限');
      ok(gap <= Math.max(T.gapAt(l) * T.JITTER[1], T.MIN_SPACE / q.speed) + 1e-9, '間隔上限');
    } else ok(p.t === 0, '第一個人 t=0');
  });
  ok(q.who >= 1 && q.who <= 5 && T.partsFor(l).indexOf(q.part) >= 0, '被問的人與部位');
  ok(q.answer === q.people[q.who - 1][q.part], '答案＝被問的那一件');
  // 不同人之間會有相同顏色（增加混淆）
  const col = q.people.map(p => p[q.part]); if (new Set(col).size < 5) sameAcross++; cnt++;
  // 走過畫面：進場前在左邊畫面外、走完在右邊畫面外
  ok(T.xAt(q, 0, 0) === -T.PW && T.xAt(q, 4, q.duration) >= 472 - 1e-6, '走完全部離開畫面');
  ok(T.xAt(q, 4, q.people[4].t - 0.001) < -T.PW + 1, '還沒進場的人在畫面外');
}
ok(sameAcross / cnt > 0.4, '不同人之間常有相同顏色：' + sameAcross / cnt);
{ const q = T.makeLevel(1, rnd, 472); ok(T.question({ who: 3, part: 'pants' }) === '第 3 個人的褲子是什麼顏色？', 'question 文字'); ok(q.duration > 4, '第 1 關走完要 4 秒以上：' + q.duration); }
// 位置平均
{ const w = new Array(5).fill(0); for (let i = 0; i < 5000; i++) w[T.makeLevel(5, rnd).who - 1]++; ok(w.every(c => c > 800 && c < 1200), '被問的人平均 ' + w.join(',')); }
ok(/<svg/.test(T.personSvg({ hat: 0, shirt: 1, pants: 2, shoes: 3 })) && T.personSvg({ hat: 0, shirt: 1, pants: 2, shoes: 3 }, 'shirt').indexOf('stroke-dasharray') > 0, 'personSvg 與標示框');
ok(T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(11) && T.rating(11) !== T.rating(15), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
