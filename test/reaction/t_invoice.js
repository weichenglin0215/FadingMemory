const { game } = require('./load.js');
const G = game('reaction_invoice.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const want = [10, 8, 6, 4, 2, 1, 1, 1, 67];
for (let k = 0; k < 400; k++) {
  const { A, deck } = T.makeDeck();
  ok(deck.length === 100, 'deck 100 got ' + deck.length);
  const cnt = Array(9).fill(0); deck.forEach(d => cnt[d.btn]++);
  ok(JSON.stringify(cnt) === JSON.stringify(want), 'counts ' + cnt);
  ok(new Set(deck.map(d => d.num)).size === deck.length, 'unique numbers');
  deck.forEach(d => { ok(/^\d{8}$/.test(d.num), 'fmt'); ok(T.classify(d.num, A) === d.btn, 'classify consistent'); });
  ok(A.F !== A.S1 && A.F !== A.S2 && A.S1 !== A.S2, 'announce distinct');
  // 特別獎不應該同時中 F 的 3 碼
  ok(T.suffixMatch(A.S1, A.F) < 3 && T.suffixMatch(A.S2, A.F) < 3, 'special not suffix of F');
  // 前 20 張 vs 後 20 張的難度（near / sNear 比例）
  if (k === 0) {
    const hard = d => d.kind === 'near' || d.kind === 'sNear';
    const first = deck.slice(0, 33).filter(hard).length, last = deck.slice(67).filter(hard).length;
    console.log('hard-decoys in first third:', first, 'last third:', last);
    console.log('F', A.F, 'S1', A.S1, 'S2', A.S2);
    console.log(deck.slice(0, 12).map(d => d.num + ':' + d.kind).join('  '));
    console.log(deck.slice(88).map(d => d.num + ':' + d.kind).join('  '));
  }
}
// suffixMatch 基本
ok(T.suffixMatch('12345678', '99945678') === 5, 'suffix 5'); ok(T.suffixMatch('12345678', '12345679') === 0, 'suffix 0');
ok(T.classify('88888863', { F: '71524863', S1: '09375126', S2: '48260917' }) === 0, '六獎'); ok(T.classify('71524863', { F: '71524863', S1: '09375126', S2: '48260917' }) === 5, '一獎');
// 時間線性
ok(Math.abs(T.timeFor(1) - 10) < 1e-9 && Math.abs(T.timeFor(100) - 4) < 1e-9 && Math.abs(T.timeFor(50.5) - 7) < 1e-9, 'time linear');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
