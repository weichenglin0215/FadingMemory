const { game } = require('./load.js');
const G = game('reaction_witness.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

ok(T.SIZES.join() === '3,5,3,3,3,3,4' && T.SIZES.length === 7, '7 features with 3,5,3,3,3,3,4 values');
// 線性曲線
ok(T.dFor(1) > T.dFor(T.LEVEL_RAMP) && T.dFor(T.LEVEL_RAMP) === 1 && T.dFor(99) === 1, 'd shrinks to 1 and stays');
const ds = []; for (let l = 1; l <= 15; l++) ds.push(T.dFor(l)); ok(ds.every((v, i) => i === 0 || v <= ds[i - 1]), 'd monotone non-increasing');
ok(T.optsFor(1) === 4 && T.optsFor(T.LEVEL_RAMP) === 8, 'options 4 -> 8');
ok(T.lookSec(1) !== T.lookSec(T.LEVEL_RAMP) && T.pickSec(1) !== T.pickSec(T.LEVEL_RAMP) && T.lookSec(99) === T.lookSec(T.LEVEL_RAMP) && T.pickSec(99) === T.pickSec(T.LEVEL_RAMP) && near(T.lookSec(8) - T.lookSec(7), T.lookSec(3) - T.lookSec(2), 1e-9), 'look/pick time are linear then stay');
// 出題：每張干擾臉與目標恰好差 d 個特徵；彼此不同；正解唯一
for (let lv = 1; lv <= 20; lv++) {
  for (let k = 0; k < 400; k++) {
    const S = T.makeSuspects(lv), d = T.dFor(lv);
    ok(S.faces.length === T.optsFor(lv), 'option count lv' + lv + ' got ' + S.faces.length);
    ok(new Set(S.faces.map(f => f.join(','))).size === S.faces.length, 'all faces distinct');
    ok(S.faces[S.answer].join() === S.target.join(), 'answer index points to target');
    S.faces.forEach((f, i) => {
      ok(f.length === 7 && f.every((v, j) => v >= 0 && v < T.SIZES[j]), 'feature ranges');
      if (i !== S.answer) ok(T.hamming(f, S.target) === d, 'distractor differs by exactly d=' + d + ' got ' + T.hamming(f, S.target));
    });
    ok(S.faces.filter(f => T.hamming(f, S.target) === 0).length === 1, 'exactly one match');
  }
}
// 變體
for (let d = 1; d <= 7; d++) for (let k = 0; k < 200; k++) { const b = T.randFace(); ok(T.hamming(T.variant(b, d), b) === d, 'variant distance ' + d); }
// 差異說明
const a = [0, 0, 0, 0, 0, 0, 0], b = [0, 2, 0, 1, 0, 0, 3];
const dt = T.diffText(a, b); ok(dt.length === 2 && dt[0].indexOf('髮型') === 0 && dt[1].indexOf('眉毛') === 0 || dt.length === 3, 'diffText lists differing features ' + JSON.stringify(dt));
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
