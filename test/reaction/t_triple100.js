const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_triple100.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261013); const rnd = rng(SEED);
const key = t => t.slice().sort((a, b) => a - b).join('+');
const remove = (cards, vals) => cards.filter(c => vals.indexOf(c) < 0);

// ═══ 使用者提供的範例牌組：15 張、唯一正解 5 組、陷阱 9 組、全部三張組合 14 組 ═══
{ const a = T.analyze(T.EXAMPLE_DECK);
  ok(T.EXAMPLE_DECK.join() === '6,16,18,21,22,26,27,31,32,42,47,51,52,53,56', '範例牌組的 15 張牌');
  ok(a.partitions === 1 && a.triples === 14, '範例牌組：完整分法只有 1 種、全部三張組合 14 組：' + a.partitions + '／' + a.triples);
  const sol = ['16+31+53', '6+42+52', '21+32+47', '18+26+56', '22+27+51'].map(x => key(x.split('+').map(Number))).sort();
  ok(JSON.stringify(a.solution.map(key).sort()) === JSON.stringify(sol), '唯一正解 5 組：' + a.solution.map(key).sort().join(' | '));
  const traps = ['21+26+53', '27+31+42', '22+31+47', '18+31+51', '16+32+52', '26+32+42', '21+27+52', '22+26+52', '26+27+47'].map(x => key(x.split('+').map(Number))).sort();
  ok(JSON.stringify(a.traps.map(key).sort()) === JSON.stringify(traps), '陷阱組合 9 組：' + a.traps.map(key).sort().join(' | '));
  ok(a.traps.length / a.triples > 0.6, '隨手挑一組三張，掉進陷阱的機率超過六成：' + (a.traps.length / a.triples * 100).toFixed(1) + '%');
  // 先拿走任何一組陷阱，剩下的牌就不可能全部配完；先拿走正解的任何一組，剩下的還配得完
  a.traps.forEach(t => ok(!T.canStillSolve(remove(T.EXAMPLE_DECK, t)), '先消陷阱 ' + key(t) + ' → 剩下的牌配不完'));
  a.solution.forEach(t => ok(T.canStillSolve(remove(T.EXAMPLE_DECK, t)), '先消正解 ' + key(t) + ' → 剩下的牌還配得完'));
  // 使用者的例子：先挑 21+26+53 → 53 被拿走後，16 和 31 失去唯一的搭檔，最後一定剩下湊不起來的牌
  const afterTrap = remove(T.EXAMPLE_DECK, [21, 26, 53]);
  ok(!T.canStillSolve(afterTrap) && T.hasMove(afterTrap), '消掉 21+26+53 之後：還有別的三張湊得出 100（不會馬上卡住），但已經不可能全部配完');
  // 53 被拿走後，原本的正解 16+31+53 不存在了：16、31 剩下的組合全是陷阱組合（都不在唯一的分法裡）
  const solKeys = new Set(T.analyze(T.EXAMPLE_DECK).solution.map(key));
  const left = T.findTriples(afterTrap, 100).map(t => t.map(k => afterTrap[k])).filter(t => t.indexOf(16) >= 0 || t.indexOf(31) >= 0);
  ok(left.length > 0 && left.every(t => !solKeys.has(key(t))), '16、31 失去了正解的搭檔，剩下的組合都是陷阱：' + left.map(key).join(' | '));
  // 玩家一路走陷阱，最後卡住：模擬「一直選任何一組三張湊 100 的」直到沒路
  let stuckCount = 0, solvedCount = 0;
  for (let i = 0; i < 400; i++) { let cards = T.EXAMPLE_DECK.slice(), guard = 0; while (cards.length && T.hasMove(cards) && guard++ < 10) { const ts = T.findTriples(cards, 100), t = ts[Math.floor(rnd() * ts.length)]; cards = remove(cards, t.map(k => cards[k])); } if (cards.length) stuckCount++; else solvedCount++; }
  ok(stuckCount / 400 > 0.6 && solvedCount > 0, '隨手挑三張湊 100 的：超過六成會卡住（' + stuckCount + '／400），但也有人剛好走對（' + solvedCount + '）'); }

// ═══ findTriples／findPartitions：對照暴力 ═══
{ for (let i = 0; i < 200; i++) {
    const cards = []; while (cards.length < 9) { const v = 5 + Math.floor(rnd() * 56); if (cards.indexOf(v) < 0) cards.push(v); }
    const tr = T.findTriples(cards, 100); let n = 0;
    for (let a = 0; a < 9; a++) for (let b = a + 1; b < 9; b++) for (let c = b + 1; c < 9; c++) if (cards[a] + cards[b] + cards[c] === 100) n++;
    ok(tr.length === n && tr.every(t => t[0] < t[1] && t[1] < t[2] && t.reduce((s, k) => s + cards[k], 0) === 100), 'findTriples 對照暴力');
    // 完整分法數量：暴力（9 張分成 3 組）
    const parts = T.findPartitions(9, tr, 99); let brute = 0;
    const ids = tr.map(t => t.join(','));
    for (let x = 0; x < tr.length; x++) for (let y = x + 1; y < tr.length; y++) for (let z = y + 1; z < tr.length; z++) { const all = new Set([...tr[x], ...tr[y], ...tr[z]]); if (all.size === 9) brute++; }
    ok(parts.length === brute, 'findPartitions 對照暴力（' + parts.length + ' vs ' + brute + '）');
  } }
ok(T.hasMove([10, 20, 30, 40]) === false && T.hasMove([10, 40, 50]) === true && T.hasMove([30, 30, 40]) === true && T.hasMove([]) === false, 'hasMove');
ok(T.canStillSolve([]) === true && T.canStillSolve([10, 40, 50]) === true && T.canStillSolve([10, 40, 51]) === false && T.canStillSolve([10, 40]) === false, 'canStillSolve');

// ═══ 產生器：每副牌都符合「唯一解＋至少 9 組陷阱」 ═══
{ let n = 0, minTraps = 99, maxTriples = 0, tooMany = 0; const first = {};
  for (let i = 0; i < 300; i++) {
    const d = T.generateDeck(rnd); ok(!!d, '產生器找得到牌組'); if (!d) continue; n++;
    const c = d.cards, a = T.analyze(c);
    ok(c.length === 15 && new Set(c).size === 15, '15 張都不同');
    ok(c.every(v => Number.isInteger(v) && v >= T.MIN_VALUE && v <= T.MAX_VALUE), '每張在 ' + T.MIN_VALUE + '～' + T.MAX_VALUE);
    ok(a.partitions === 1, '整副牌只有唯一一種完整分法');
    ok(a.solution.length === 5 && a.solution.every(t => t.reduce((s, v) => s + v, 0) === 100), '正解 5 組、每組 100');
    ok(JSON.stringify(a.solution.map(key).sort()) === JSON.stringify(d.solution.map(key).sort()) && JSON.stringify(a.traps.map(key).sort()) === JSON.stringify(d.traps.map(key).sort()), '回傳的正解與陷阱跟分析一致');
    ok(a.traps.length >= T.MIN_TRAPS, '陷阱至少 ' + T.MIN_TRAPS + ' 組：' + a.traps.length);
    ok(a.traps.every(t => t.reduce((s, v) => s + v, 0) === 100), '陷阱組合每組也是 100');
    // 每一組陷阱：先消掉就不可能全部配完
    a.traps.forEach(t => { if (T.canStillSolve(remove(c, t))) ok(false, '先消陷阱就配不完'); });
    a.solution.forEach(t => { if (!T.canStillSolve(remove(c, t))) ok(false, '先消正解還配得完'); });
    minTraps = Math.min(minTraps, a.traps.length); maxTriples = Math.max(maxTriples, a.triples);
    first[c[0]] = (first[c[0]] || 0) + 1;
    ok(a.traps.length / a.triples >= 0.6, '掉進陷阱的機率至少六成：' + a.traps.length + '／' + a.triples);
  }
  ok(n === 300 && minTraps >= 9, '300 副牌都合格（陷阱最少 ' + minTraps + '，全部三張組合最多 ' + maxTriples + '）');
  ok(Object.keys(first).length > 15, '洗牌後第一張牌有變化：' + Object.keys(first).length); }
// 同種子同牌：（產生器吃自己傳入的亂數函式）
{ const a = T.generateDeck(rng(5)), b = T.generateDeck(rng(5)); ok(JSON.stringify(a.cards) === JSON.stringify(b.cards), '同一個亂數種子得到同一副牌'); }
// 範例牌組也是同樣的格式，洗牌後 15 張一樣
{ const e = T.exampleDeck(rnd); ok(e.cards.slice().sort((x, y) => x - y).join() === T.EXAMPLE_DECK.join() && e.solution.length === 5 && e.traps.length === 9, '範例牌組格式'); }

// ═══ V1.27 關卡制：第 1 關 6 張、每隔三關多 3 張、限時 180 秒起每關 +20 秒 ═══
ok(T.START_GROUPS === 2 && T.LEVEL_STEP === 3 && T.LIMIT_BASE_S === 180 && T.LIMIT_STEP_S === 20 && T.COLS === 3, '參數：6 張起、每三關多一組、180 秒起 +20、橫向 3 張');
for (let lv = 1; lv <= T.MAX_LEVEL; lv++) {
  const sp = T.levelSpec(lv), g = Math.min(T.MAX_GROUPS, 2 + Math.floor((lv - 1) / 3));
  ok(sp.groups === g && sp.cards === 3 * g, '第 ' + lv + ' 關 ' + sp.cards + ' 張');
  ok(sp.limitS === 180 + 20 * (lv - 1) && T.limitMs(lv) === sp.limitS * 1000, '第 ' + lv + ' 關限時 ' + sp.limitS + ' 秒');
  ok(sp.cards % 3 === 0 && sp.minTraps >= 0, '張數是 3 的倍數');
  if (lv > 1) { const pv = T.levelSpec(lv - 1); ok(sp.cards >= pv.cards, '張數不會減少'); ok(sp.cards - pv.cards === 0 || sp.cards - pv.cards === 3, '每次最多多 3 張'); }
}
ok(T.levelSpec(1).cards === 6 && T.levelSpec(3).cards === 6 && T.levelSpec(4).cards === 9 && T.levelSpec(6).cards === 9 && T.levelSpec(7).cards === 12 && T.levelSpec(10).cards === 15 && T.levelSpec(12).cards === 15 && T.levelSpec(13).cards === 18, '1～3 關 6 張、4～6 關 9 張…每隔三關加三張');
ok(T.levelSpec(25).cards === 30 && T.levelSpec(30).cards === 30, '最多 30 張');
ok(T.levelSpec(1).limitS === 180 && T.levelSpec(2).limitS === 200 && T.levelSpec(10).limitS === 360, '限時 180、200、…（每關多 20 秒）');
// 同一張數的三關，陷阱要求依序變多（6 張不可能有陷阱）
for (let g = 2; g <= T.MAX_GROUPS; g++) { const t = T.TRAPS[g]; ok(t.length === 3 && t[0] <= t[1] && t[1] <= t[2], g + ' 組的陷阱要求遞增 ' + t); if (g > 2) ok(T.TRAPS[g][0] >= T.TRAPS[g - 1][0], '張數更多，陷阱要求不減'); }
ok(T.TRAPS[2].every(x => x === 0) && T.levelSpec(12).minTraps === T.MIN_TRAPS && T.levelSpec(12).cards === 15, '第 12 關＝範例牌組的難度（15 張、陷阱 9 組）');
// 6 張牌：數學上不可能有陷阱（任何一組 100 的剩下三張也是 100）→ 一定只有 2 組三張組合
for (let i = 0; i < 400; i++) { const d = T.deckForLevel(1 + (i % 3), rnd), a = T.analyze(d.cards); ok(d.cards.length === 6 && a.partitions === 1 && a.triples === 2 && a.traps.length === 0 && a.solution.length === 2, '6 張牌只有一種分法、沒有陷阱'); }
// 每一關的牌組：張數正確、全部不同、範圍合理、唯一分法、陷阱 ≥ 要求、先消陷阱就配不完
for (let lv = 1; lv <= T.MAX_LEVEL; lv++) for (let i = 0; i < (lv > 24 ? 6 : 25); i++) {
  const sp = T.levelSpec(lv), d = T.deckForLevel(lv, rnd); ok(!!d, '第 ' + lv + ' 關找得到牌組'); if (!d) continue;
  const c = d.cards, a = T.analyze(c);
  ok(c.length === sp.cards && new Set(c).size === c.length, '第 ' + lv + ' 關 ' + sp.cards + ' 張都不同');
  ok(c.every(v => Number.isInteger(v) && v >= sp.lo && v <= sp.hi), '每張在 ' + sp.lo + '～' + sp.hi);
  ok(a.partitions === 1 && a.solution.length === sp.groups && a.solution.every(t => t.reduce((x, y) => x + y, 0) === 100), '唯一分法、每組 100');
  ok(a.traps.length >= sp.minTraps, '第 ' + lv + ' 關陷阱至少 ' + sp.minTraps + ' 組：' + a.traps.length);
  a.traps.slice(0, 6).forEach(t => ok(!T.canStillSolve(remove(c, t)), '先消陷阱就配不完'));
  a.solution.forEach(t => ok(T.canStillSolve(remove(c, t)), '先消正解還配得完'));
}
// 剩餘時間顯示
ok(T.fmtLeft(180000) === '3:00' && T.fmtLeft(59001) === '1:00' && T.fmtLeft(59000) === '0:59' && T.fmtLeft(0) === '0:00' && T.fmtLeft(-5) === '0:00' && T.fmtLeft(760000) === '12:40', 'fmtLeft');

// ═══ 版面、參數、接線（原始碼／樣式）═══
ok(T.GROUPS * 3 === 15 && T.TARGET === 100 && T.PENALTY_MS === 3000, '預設 15 張、目標 100、罰 3 秒');
ok(G.name === '三張成百' && G.score.better === 'max' && G.score.min === 1 && G.score.max === 30 && G.score.decimals === 0, '遊戲名稱與成績規格（通過關數、越大越好、上限 30）');
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(8) && T.rating(8) !== T.rating(15) && T.rating(15) !== T.rating(25), '評語分級');
{ const path = require('path'), rd = p => require('fs').readFileSync(path.resolve(__dirname, p), 'utf8');
  const src = rd('../../js/reaction_triple100.js'), css = rd('../../css/reaction5.css'), boot = rd('../../js/boot.js'), kit2 = rd('../../js/reaction_kit2.js'), menu = rd('../../js/menu.js');
  ok(/if \(!hasMove\(remainingValues\(\)\)\) api\.after\(500, function \(\) \{ fail\('stuck'\); \}\)/.test(src), '消除之後剩下的牌湊不出任何 100 → 卡住結束');
  ok(src.indexOf("fail('time')") > 0 && src.indexOf('api.timer(spec.limitS * 1000') > 0, '超過時間限制結束');
  ok(src.indexOf('tm.cut(PENALTY_MS)') > 0 && /cut: function \(d\)/.test(kit2), '選錯一組從剩餘時間扣 3 秒（kit.run 的 timer.cut）');
  ok(src.indexOf('api.pass(') > 0 && src.indexOf('maxLevel: MAX_LEVEL') > 0, '全部消完過關、關卡制');
  ok(src.indexOf("addEventListener('click'") > 0, '牌用 click（上下捲動時不誤選）');
  ok(src.indexOf("migrateBest(ID, function () { return null; }, '.v127')") > 0, '舊版（用時）的最佳紀錄清掉一次');
  ok(/\.t3-wrap \{[^}]*overflow-y: auto/.test(css) && /grid-template-columns: repeat\(3, 1fr\)/.test(css) && /\.t3-card--sel/.test(css) && /\.t3-card--gone/.test(css) && /\.t3-card--bad/.test(css), '樣式：橫向 3 欄、往下捲動、選取／消除／錯誤');
  ok(boot.indexOf("'js/reaction_triple100.js'") > boot.indexOf("'js/reaction_alignchar.js'") && boot.indexOf("'js/reaction_triple100.js'") < boot.indexOf("'js/reaction.js'"), 'boot.js 有載入（在 reaction.js 之前）');
  ok(/id: 'triple100', name: '三張成百'/.test(menu), '選單有這一款'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
