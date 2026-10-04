const { game } = require('./load.js');
const G = game('reaction_pillbox.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 難度曲線
ok(T.slotCount(1) === 2 && T.slotCount(5) === 2 && T.slotCount(6) === 3 && T.slotCount(10) === 3 && T.slotCount(11) === 4 && T.slotCount(40) === 4, 'slots unlock 2/3/4 at levels 1/6/11');
ok(T.kindCount(1) === 2 && T.kindCount(T.LEVEL_RAMP) === 4 && T.maxCnt(1) === 1 && T.maxCnt(T.LEVEL_RAMP) === 3, 'kinds 2->4, maxCnt 1->3');
ok(near(T.showSec(1), 10) && near(T.showSec(T.LEVEL_RAMP), 5) && near(T.showSec(8), 7.5, 1e-9) && T.showSec(99) === 5, 'show time 10 -> 5 linear');
ok(T.extraMax(1) === 1 && T.extraMax(T.LEVEL_RAMP) === 3 && T.decoyKinds(1) === 1 && T.decoyKinds(T.LEVEL_RAMP) === 4 && T.extraMax(99) === 3 && T.decoyKinds(99) === 4, 'extras 1 -> 3, decoy kinds 1 -> 4');
ok(T.fillSec([[1, 1], [2, 0]]) > T.fillSec([[1, 0], [1, 0]]) && T.fillSec([[0, 0]]) === T.fillSec([[0]]), 'fill time grows with the number of pills needed');

let nearPairOk = 0, total = 0;
for (let lv = 1; lv <= 20; lv++) {
  for (let k = 0; k < 800; k++) {
    const S = T.makeSheet(lv), sh = S.sheet;
    total++;
    ok(S.slots === T.slotCount(lv) && sh.length === S.slots, 'slot count lv' + lv);
    ok(S.kinds === T.kindCount(lv) && sh.every(r => r.length === S.kinds), 'kind count lv' + lv);
    ok(sh.every(r => T.total(r) >= 1), 'every slot has at least one pill');
    ok(sh.every(r => r.every(c => c >= 0 && c <= T.maxCnt(lv))), 'counts within maxCnt lv' + lv);
    /* 至少一對時段只差 1 顆（近似干擾）*/
    let hasNear = false;
    for (let a = 0; a < sh.length; a++) for (let b = a + 1; b < sh.length; b++) if (T.rowDiff(sh[a], sh[b]) === 1) hasNear = true;
    ok(hasNear, 'has a near pair (differ by exactly 1 pill)');
    if (hasNear) nearPairOk++;
    ok(T.rowDiff(sh[S.nearPair[0]], sh[S.nearPair[1]]) === 1, 'nearPair indexes point at the near pair');
    ok(!sh.every(r => T.sameRow(r, sh[0])), 'not all slots identical');
    ok(T.judge(sh, sh.map(r => r.slice())), 'judge accepts exact copy');
    const wrong = sh.map(r => r.slice()); wrong[0][0] = wrong[0][0] === 0 ? 1 : wrong[0][0] - 1;
    ok(!T.judge(sh, wrong), 'judge rejects a one-pill difference');
  }
}
ok(nearPairOk === total, 'every sheet has a near pair');
// 藥丸盤：每種單子上的藥丸「夠用還多放」、干擾藥丸只有 4～7、答案一定湊得出來
let extraSeen = 0, decoyKindsSeen = {}, trayN = 0;
for (let lv = 1; lv <= 20; lv++) {
  for (let k = 0; k < 300; k++) {
    const S = T.makeSheet(lv), tray = T.makeTray(S.sheet, lv), K = S.kinds;
    trayN++;
    const cnt = Array(T.N_KINDS).fill(0); tray.forEach(c => cnt[c]++);
    for (let kind = 0; kind < K; kind++) { let need = 0; S.sheet.forEach(r => need += r[kind]); ok(cnt[kind] >= need, 'enough pills of kind ' + kind + ' (need ' + need + ', have ' + cnt[kind] + ')'); if (cnt[kind] > need && need > 0) extraSeen++; ok(need === 0 || cnt[kind] - need <= T.extraMax(lv), 'extras bounded'); }
    const decoys = new Set(tray.filter(c => c >= 4)); ok(decoys.size <= Math.min(4, T.decoyKinds(lv)) && decoys.size >= Math.max(1, Math.min(4, T.decoyKinds(lv)) - 1), 'decoy kinds ' + decoys.size + ' want ' + T.decoyKinds(lv) + ' (a very full tray may drop one)');
    decoys.forEach(d => { ok(cnt[d] >= 1 && cnt[d] <= 3, 'decoy count 1..3'); decoyKindsSeen[d] = 1; });
    ok(tray.every(c => c >= 0 && c < T.N_KINDS), 'kind ids valid');
    // 把需要的藥丸放進對的格子就答對；多放一顆干擾藥丸就答錯
    const box = S.sheet.map(r => T.pad(r)); ok(T.judge(S.sheet, box), 'exact fill is accepted');
    if (decoys.size) { const bad2 = box.map(r => r.slice()); bad2[0][[...decoys][0]]++; ok(!T.judge(S.sheet, bad2), 'one decoy pill makes it wrong'); }
    const bad3 = box.map(r => r.slice()); bad3[0][0]++; ok(!T.judge(S.sheet, bad3), 'one extra correct-kind pill makes it wrong');
    ok(tray.length <= T.MAX_TRAY, 'tray fits on screen: ' + tray.length);
  }
}
ok(extraSeen > trayN * 0.5, 'surplus pills of the right kinds appear often (' + extraSeen + ')');
ok(Object.keys(decoyKindsSeen).length === 4, 'all four decoy kinds appear');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
