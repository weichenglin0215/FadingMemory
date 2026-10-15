const { game, rng, seedOf } = require('./load.js');
const fs = require('fs');
const G = game('reaction_passersby.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 難度曲線
ok(near(T.speedAt(1), 150) && near(T.speedAt(T.RAMP_LEVELS), 400) && near(T.gapAt(1), 1.4) && near(T.gapAt(T.RAMP_LEVELS), 0.5), '速度與間隔端點');
ok(T.ansMs(1) === 8000 && T.ansMs(T.RAMP_LEVELS) === 4000, '作答限時端點');
{ const d = T.speedAt(2) - T.speedAt(1); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.speedAt(l + 1) - T.speedAt(l), d, 1e-9), '速度線性 ' + l); }
// V1.27：人數與有顏色變化的衣物件數慢慢增加（第 1 關 2 人 2 件；每隔 3 關多 1 人、每隔 2 關多 1 件）
ok(T.peopleAt(1) === 2 && T.peopleAt(3) === 2 && T.peopleAt(4) === 3 && T.peopleAt(6) === 3 && T.peopleAt(7) === 4 && T.peopleAt(10) === 5 && T.peopleAt(13) === 6, '人數 2 起、每隔 3 關 +1');
ok(T.partsFor(1).length === 2 && T.partsFor(2).length === 2 && T.partsFor(3).length === 3 && T.partsFor(4).length === 3 && T.partsFor(5).length === 4 && T.partsFor(15).length === 4, '有顏色變化的衣物 2 件起、每隔 2 關 +1、最多 4 件');
ok(T.partsFor(1).join() === T.VARY_ORDER.slice(0, 2).join() && T.partsFor(5).join() === T.VARY_ORDER.join(), '依序加入衣物');
for (let l = 2; l <= T.RAMP_LEVELS; l++) ok(T.peopleAt(l) >= T.peopleAt(l - 1) && T.partsFor(l).length >= T.partsFor(l - 1).length, '只增不減 ' + l);
// 七種顏色：名稱不同、色碼不同
ok(T.COLORS.length === 7 && new Set(T.COLORS.map(c => c.name)).size === 7 && new Set(T.COLORS.map(c => c.hex)).size === 7, '七種顏色');
// 出題
let sameAcross = 0, cnt = 0;
for (let l = 1; l <= T.RAMP_LEVELS; l++) for (let i = 0; i < 200; i++) {
  const q = T.makeLevel(l, rnd, 472), vary = T.partsFor(l), n = T.peopleAt(l);
  ok(q.people.length === n, '人數 ' + n);
  q.people.forEach((p, k) => {
    const cols = vary.map(key => p[key]);
    ok(new Set(cols).size === vary.length && cols.every(c => c >= 0 && c < 7), '同一個人有變化的衣物顏色不同');
    T.PARTS.filter(key => vary.indexOf(key) < 0).forEach(key => ok(p[key] === -1, '沒有變化的衣物是灰色（−1）'));
    if (k > 0) {
      const gap = p.t - q.people[k - 1].t;
      ok(gap >= T.MIN_SPACE / q.speed - 1e-9, '兩人間隔不會重疊 ' + gap);
      ok(gap <= Math.max(T.gapAt(l) * T.JITTER[1], T.MIN_SPACE / q.speed) + 1e-9, '間隔上限');
    } else ok(p.t === 0, '第一個人 t=0');
  });
  ok(q.who >= 1 && q.who <= n && vary.indexOf(q.part) >= 0, '被問的人與部位（只問有顏色變化的）');
  ok(q.answer === q.people[q.who - 1][q.part] && q.answer >= 0, '答案＝被問的那一件');
  // 不同人之間會有相同顏色（增加混淆）
  const col = q.people.map(p => p[q.part]); if (new Set(col).size < n) sameAcross++; cnt++;
  // 從右邊走進來、從左邊走出去：進場前在畫面右邊外面、走完在左邊外面，x 一路變小
  ok(T.xAt(q, 0, 0) === 472 && T.xAt(q, n - 1, q.duration) <= -T.PW + 1e-6, '從右邊進來、走完全部從左邊離開畫面');
  ok(T.xAt(q, n - 1, q.people[n - 1].t - 0.001) > 472 - 1, '還沒進場的人在畫面右邊外面');
  ok(T.xAt(q, 0, 1) < T.xAt(q, 0, 0.5), '往左走');
}
ok(sameAcross / cnt > 0.3, '不同人之間常有相同顏色：' + sameAcross / cnt);
{ const q = T.makeLevel(1, rnd, 472); ok(T.question({ who: 3, part: 'pants' }) === '第 3 個人的褲子是什麼顏色？', 'question 文字'); ok(q.duration > 3, '第 1 關走完要 3 秒以上：' + q.duration); }
// 人物放大成 150%、揭曉停 3 秒
ok(T.PW === 105 && T.PH === 240, '人物 105×240（原本 70×160 的 150%）');
ok(T.REVEAL_MS === 3000, '揭曉畫面停 3 秒');
{ const src = fs.readFileSync(require('path').resolve(__dirname, '../../js/reaction_passersby.js'), 'utf8');
  ok(/api\.fail\(\{ delay: REVEAL_MS/.test(src), '答錯：揭曉停 REVEAL_MS 才結算');
  ok(/translateX\(' \+ \(W \+ 10\)/.test(src), '一開始人都在右邊外面'); }
// 位置平均
{ const n5 = T.peopleAt(10), w = new Array(n5).fill(0); for (let i = 0; i < 5000; i++) w[T.makeLevel(10, rnd).who - 1]++; ok(w.every(c => c > 5000 / n5 * 0.8 && c < 5000 / n5 * 1.2), '被問的人平均 ' + w.join(',')); }
ok(/<svg/.test(T.personSvg({ hat: 0, shirt: 1, pants: 2, shoes: 3 })) && T.personSvg({ hat: 0, shirt: 1, pants: 2, shoes: 3 }, 'shirt').indexOf('stroke-dasharray') > 0, 'personSvg 與標示框');
ok(T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(11) && T.rating(11) !== T.rating(15), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
