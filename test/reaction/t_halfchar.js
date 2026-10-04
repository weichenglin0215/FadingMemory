const { game } = require('./load.js');
const G = game('reaction_halfchar.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 題庫資料檢查：每題的干擾字都含有露出的相似部件、都不含答案的差異部件
const problems = T.checkData();
ok(problems.length === 0, 'data problems: ' + problems.join(' | '));
ok(T.ENTRIES.length >= 40, 'at least 40 questions (' + T.ENTRIES.length + ')');
const sides = {}; T.ENTRIES.forEach(e => sides[e.side] = (sides[e.side] || 0) + 1);
ok(sides.left >= 10 && sides.right >= 15 && sides.top >= 3 && sides.bottom >= 5, 'all four sides covered ' + JSON.stringify(sides));
ok(new Set(T.ENTRIES.map(e => e.a + e.side)).size === T.ENTRIES.length, 'no duplicate (answer, side)');
// 相似處（整個露出）與差異處（大部分遮住）
const e1 = T.ENTRIES.find(e => e.a === '湖' && e.side === 'right'); ok(T.visiblePart(e1) === '氵' && T.hiddenPart(e1) === '胡' && T.exposedSide(e1) === 'left', 'similar/different for 湖 (diff on the right)');
const e2 = T.ENTRIES.find(e => e.a === '想' && e.side === 'top'); ok(T.visiblePart(e2) === '心' && T.hiddenPart(e2) === '相' && T.exposedSide(e2) === 'bottom', 'similar/different for 想 (diff on top)');
const e3 = T.ENTRIES.find(e => e.a === '草' && e.side === 'bottom'); ok(T.visiblePart(e3) === '艹' && T.hiddenPart(e3) === '早' && T.exposedSide(e3) === 'top', 'similar/different for 草 (diff at the bottom)');
// 所有干擾字都含有露出的相似部件、都不含答案的差異部件（checkData 已驗證）；這裡再數一次
let sameN = 0, diffN = 0, tot = 0;
T.ENTRIES.forEach(e => { const sim = T.visiblePart(e), dif = T.hiddenPart(e); e.d.forEach(c => { tot++; if (T.DECOMP[c].includes(sim)) sameN++; if (T.DECOMP[c].includes(dif)) diffN++; }); });
ok(sameN === tot && diffN === 0, 'every distractor shares the exposed part and none shares the hidden part');
// 分界線、露出區間與時間（相似部件整個露出 + 差異部件貼著分界線的一小段）
const eR = T.ENTRIES.find(e => e.a === '湖' && e.side === 'right'), eL = T.ENTRIES.find(e => e.a === '媽' && e.side === 'left'), eB = T.ENTRIES.find(e => e.a === '草' && e.side === 'bottom'), eT = T.ENTRIES.find(e => e.a === '想' && e.side === 'top');
ok(near(T.boundOf(eR), T.BOUNDS['氵']) && near(T.boundOf(eL), T.BOUNDS['女']) && near(T.boundOf(eB), T.BOUNDS['艹']) && near(T.boundOf({ a: '湖', side: 'right', b: 0.5 }), 0.5), 'bound lookup and override');
const f1 = T.revealOf(1), fN = T.revealOf(T.LEVEL_RAMP);
ok(near(f1, T.SLIVER_START) && near(fN, T.SLIVER_END) && f1 > fN && T.revealOf(99) === fN && near(T.revealOf(8) - T.revealOf(7), T.revealOf(3) - T.revealOf(2), 1e-9), 'sliver fraction ramps linearly then stays');
const bR = T.boundOf(eR), r1 = T.visRegion(eR, 1), rN = T.visRegion(eR, T.LEVEL_RAMP);
ok(near(r1.from, 0) && near(r1.to, bR + f1 * (1 - bR)) && near(rN.to, bR + fN * (1 - bR)), 'diff on the right: [0, b + f(1-b)]');
const bL = T.boundOf(eL), l1 = T.visRegion(eL, 1), lN = T.visRegion(eL, T.LEVEL_RAMP);
ok(near(l1.to, 1) && near(l1.from, bL - f1 * bL) && near(lN.from, bL - fN * bL), 'diff on the left: [b - f·b, 1]');
ok(near(T.visRegion(eB, 1).from, 0) && near(T.visRegion(eT, 1).to, 1), 'bottom/top region at level 1');
// 相似部件永遠整個露出；差異部件露出的比例只會隨關卡變少
T.ENTRIES.forEach(e => {
  const b = T.boundOf(e); let prev = 2;
  for (let lv = 1; lv <= T.LEVEL_RAMP; lv++) {
    const g = T.visRegion(e, lv), w = g.to - g.from; ok(w <= prev + 1e-9 && g.from >= -1e-9 && g.to <= 1 + 1e-9, 'region shrinks ' + e.a + e.side + lv); prev = w;
    if (e.side === 'right' || e.side === 'bottom') ok(g.from <= 1e-9 && g.to >= b - 1e-9, 'similar part fully visible (diff after b)'); else ok(g.to >= 1 - 1e-9 && g.from <= b + 1e-9 && g.from >= 0, 'similar part fully visible (diff before b)');
    ok(w < 0.95 && w > 0.3, 'about half the character is shown: ' + e.a + e.side + ' ' + w.toFixed(2));
  }
});
ok(near(T.timeFor(1), 8) && near(T.timeFor(T.LEVEL_RAMP), 3.5), 'time 8 -> 3.5');
ok(T.clipFor('right', { from: 0.32, to: 1 }) === 'inset(0 0 0 32.0%)' && T.clipFor('left', { from: 0, to: 0.44 }) === 'inset(0 56.0% 0 0)' && T.clipFor('bottom', { from: 0.5, to: 1 }) === 'inset(50.0% 0 0 0)' && T.clipFor('top', { from: 0, to: 0.5 }) === 'inset(0 0 50.0% 0)', 'clip-path insets');
// 選項
for (let k = 0; k < 500; k++) {
  const e = T.ENTRIES[k % T.ENTRIES.length], o = T.makeOptions(e);
  ok(o.options.length === 4 && new Set(o.options).size === 4 && o.options[o.answer] === e.a, 'options valid');
}
// 不重複出題
const recent = []; let rep = 0;
for (let k = 0; k < 2000; k++) { const i = T.pickEntry(recent); if (recent.includes(i)) rep++; recent.push(i); if (recent.length > 10) recent.shift(); }
ok(rep === 0, 'recent questions are not repeated');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
