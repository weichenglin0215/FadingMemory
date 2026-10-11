const { game } = require('./load.js');
const G = game('reaction_invoice.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 25) console.log('FAIL', m); } };
const want = [10, 8, 6, 4, 2, 1, 1, 1, 67];
let randCount = [], kindsSeen = {}, lastDigitSame = 0, lastDigitN = 0, tail2ExcludeRate = 0, N = 0;
for (let k = 0; k < 400; k++) {
  const { A, deck } = T.makeDeck(); N++;
  ok(deck.length === 100 && T.BATCH === 100, 'deck 100 got ' + deck.length);
  const cnt = Array(9).fill(0); deck.forEach(d => cnt[d.btn]++);
  ok(JSON.stringify(cnt) === JSON.stringify(want), 'counts ' + cnt);
  ok(new Set(deck.map(d => d.num)).size === deck.length, 'unique numbers');
  deck.forEach(d => { ok(/^\d{8}$/.test(d.num), 'fmt'); ok(T.classify(d.num, A) === d.btn, 'classify consistent'); kindsSeen[d.kind] = (kindsSeen[d.kind] || 0) + 1; });
  // 開獎號碼：末 2 碼三組一樣、倒數第 3 碼三組各不同、前 5 碼彼此差很多、F 的末 3 碼三個數字都不同
  ok(A.F.slice(6) === A.S1.slice(6) && A.F.slice(6) === A.S2.slice(6), 'last two digits identical in F, S1, S2');
  ok(new Set([A.F[5], A.S1[5], A.S2[5]]).size === 3, 'third digit from the end all different');
  ok(T.hamming(A.F.slice(0, 5), A.S1.slice(0, 5)) >= T.ANNOUNCE_MIN_DIFF && T.hamming(A.F.slice(0, 5), A.S2.slice(0, 5)) >= T.ANNOUNCE_MIN_DIFF && T.hamming(A.S1.slice(0, 5), A.S2.slice(0, 5)) >= T.ANNOUNCE_MIN_DIFF, 'first five digits far apart');
  ok(new Set(A.F.slice(5).split('')).size === 3, 'F last three digits all different');
  ok(A.F !== A.S1 && A.F !== A.S2 && A.S1 !== A.S2, 'announce distinct');
  ok(T.suffixMatch(A.S1, A.F) === 2 && T.suffixMatch(A.S2, A.F) === 2, 'special numbers share exactly the last two digits with F');
  // 沒中獎的：隨機 20 張以上；其餘每張末 3 碼至少 2 個數字跟 F 一樣
  const non = deck.filter(d => d.btn === 8);
  const rnd = non.filter(d => d.kind === 'rand'); randCount.push(rnd.length);
  ok(rnd.length >= 20, 'at least 20 fully random invoices');
  non.filter(d => d.kind !== 'rand').forEach(d => ok(T.tailOverlap(d.num, A.F) >= 2, 'decoy last-3 overlap >= 2: ' + d.kind + ' ' + d.num + ' vs ' + A.F));
  Object.keys(T.DECOY_COUNTS).forEach(kd => ok(non.filter(d => d.kind === kd).length === T.DECOY_COUNTS[kd], 'decoy count ' + kd));
  // 只看最後一碼，排除不了多少：全部發票裡，最後一碼跟 F 一樣的比例
  deck.forEach(d => { lastDigitN++; if (d.num[7] === A.F[7]) lastDigitSame++; });
  // 「記 F 的末 3 碼＋兩個特別獎的末 1 碼」這種 5 個數字的策略：能排除幾成？（末 3 碼不等於 F 的末 3 碼、末 1 碼不等於 S1/S2 的末 1 碼 → 排除）
  const excluded = deck.filter(d => d.num.slice(5) !== A.F.slice(5) && d.num[7] !== A.S1[7] && d.num[7] !== A.S2[7]).length;
  tail2ExcludeRate += excluded / 100;
  // 前 20 張 vs 後 20 張的難度
  if (k === 0) {
    const hard = d => d.kind === 'near' || d.kind === 'sNear';
    const first = deck.slice(0, 33).filter(hard).length, last = deck.slice(67).filter(hard).length;
    console.log('hard-decoys in first third:', first, 'last third:', last);
    console.log('F', A.F, 'S1', A.S1, 'S2', A.S2);
    console.log(deck.slice(0, 12).map(d => d.num + ':' + d.kind).join('  '));
    console.log(deck.slice(88).map(d => d.num + ':' + d.kind).join('  '));
  }
}
console.log('kinds seen (400 decks):', JSON.stringify(kindsSeen));
console.log('share of invoices whose last digit equals F\'s last digit:', (lastDigitSame / lastDigitN * 100).toFixed(1) + '%');
console.log('invoices the "remember F last 3 + S1/S2 last 1" shortcut can rule out:', (tail2ExcludeRate / N * 100).toFixed(1) + '%');
ok(tail2ExcludeRate / N < 0.40, 'the 5-digit shortcut (was ~80%) now rules out well under half the invoices');
ok(lastDigitSame / lastDigitN > 0.55, 'the last digit alone rules out few invoices');
// suffixMatch 基本
ok(T.suffixMatch('12345678', '99945678') === 5, 'suffix 5'); ok(T.suffixMatch('12345678', '12345679') === 0, 'suffix 0');
ok(T.classify('88888863', { F: '71524863', S1: '09375126', S2: '48260917' }) === 0, '六獎'); ok(T.classify('71524863', { F: '71524863', S1: '09375126', S2: '48260917' }) === 5, '一獎');
ok(T.tailOverlap('00000123', '99999321') === 3 && T.tailOverlap('00000124', '99999321') === 2 && T.tailOverlap('00000999', '99999321') === 0, 'tailOverlap counts shared digits as a multiset');
// 時間：第 1 張 10 秒，每一張少 0.25 秒，最短 3 秒（原本 100 張才從 10 秒縮到 4 秒，現在縮得快很多、而且越後面越短）
ok(T.TIME_START === 10 && T.TIME_STEP === 0.25 && T.TIME_MIN === 3, 'time constants');
ok(Math.abs(T.timeFor(1) - 10) < 1e-9 && Math.abs(T.timeFor(2) - 9.75) < 1e-9 && Math.abs(T.timeFor(21) - 5) < 1e-9 && Math.abs(T.timeFor(29) - 3) < 1e-9 && T.timeFor(30) === 3 && T.timeFor(500) === 3, 'time 10 → 3 seconds, 0.25 s less per invoice');
for (let i = 2; i <= 60; i++) ok(T.timeFor(i) <= T.timeFor(i - 1) + 1e-12 && T.timeFor(i) >= 3, 'time never grows, never below 3 s');
ok(T.timeFor(100) > 2.9 && (T.timeFor(1) - T.timeFor(2)) > 0.06 * 3, 'the limit shrinks much faster than the old 0.06 s per invoice');
// 沒有張數上限：第一批 100 張用完會再補，開獎號碼不變、號碼不重複、不再含特別獎／一獎那三張
{
  for (let k = 0; k < 40; k++) {
    const D = T.makeDeck(), A = D.A, all = D.deck.slice();
    ok(all.length === 100 && D.used && Object.keys(D.used).length === 100, 'first batch of 100, used set is kept');
    for (let b = 1; b <= 3; b++) {
      const more = T.moreDeck(D);
      ok(more.length >= 90 && more.length <= 97, 'batch ' + (b + 1) + ' has about 97 invoices (the 3 exact-match ones are not repeated): ' + more.length);
      const cnt = Array(9).fill(0); more.forEach(d => cnt[d.btn]++);
      ok(cnt[5] === 0 && cnt[6] === 0 && cnt[7] === 0, 'no 一獎／特別獎 invoices in later batches');
      more.forEach(d => { ok(/^\d{8}$/.test(d.num) && T.classify(d.num, A) === d.btn, 'classify consistent in later batches'); });
      all.push.apply(all, more);
    }
    ok(new Set(all.map(d => d.num)).size === all.length, 'every invoice number is unique across batches (' + all.length + ')');
    ok(all.length >= 380, 'four batches give at least 380 invoices: ' + all.length);
  }
}
// 按鈕順序：沒中獎（索引 8）在最上面，接著六獎到一獎、兩個特別獎；每個按鈕只出現一次
ok(JSON.stringify(T.BTN_ORDER) === '[8,0,1,2,3,4,5,6,7]' && new Set(T.BTN_ORDER).size === 9 && T.BTNS[T.BTN_ORDER[0]].name === '沒中獎' && T.BTNS[T.BTN_ORDER[1]].name === '六獎', '沒中獎在最上面（最小獎六獎的上方）');
// 獎金：依統一發票的獎金，越大的獎金額越高；沒中獎 0；格式化加千分位
{
  const amt = {}; T.BTNS.forEach(b => amt[b.name] = b.amount);
  ok(amt['六獎'] === 200 && amt['五獎'] === 1000 && amt['四獎'] === 4000 && amt['三獎'] === 10000 && amt['二獎'] === 40000 && amt['一獎'] === 200000 && amt['一號特別獎'] === 10000000 && amt['二號特別獎'] === 2000000 && amt['沒中獎'] === 0, 'prize amounts');
  ok(amt['六獎'] < amt['五獎'] && amt['五獎'] < amt['四獎'] && amt['四獎'] < amt['三獎'] && amt['三獎'] < amt['二獎'] && amt['二獎'] < amt['一獎'] && amt['一獎'] < amt['二號特別獎'] && amt['二號特別獎'] < amt['一號特別獎'], 'bigger prize pays more');
  ok(T.fmtMoney(0) === '$0' && T.fmtMoney(200) === '$200' && T.fmtMoney(1000) === '$1,000' && T.fmtMoney(12345678) === '$12,345,678' && T.fmtMoney(200) !== T.fmtMoney(2000), 'fmtMoney');
}
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
