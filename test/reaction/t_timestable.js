const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_timestable.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);
const typeSeen = {};
// V1.32：過關標準從 3 格改成 FOUND（9）格；第一次進遊戲多改 HINT_EXTRA 格（系統引導 1 格、玩家找 9 格）。測試跟著參數走
ok(T.FOUND === 9 && T.HINT_EXTRA === 1, '預設找 9 格、第一次多改 1 格（玩家自己找 9 格）');
for (let i = 0; i < 6000; i++) {
  const first = i % 3 === 0, cnt = T.FOUND + (first ? T.HINT_EXTRA : 0), tb = T.makeTable(rnd, cnt), t = tb.tampered;
  ok(t.length === cnt, '被改 ' + cnt + ' 格');
  { const rowN = {}, colN = {}; t.forEach(c => { rowN[c.a] = (rowN[c.a] || 0) + 1; colN[c.b] = (colN[c.b] || 0) + 1; });
    ok(Math.max(...Object.values(rowN)) <= T.LINE_MAX && Math.max(...Object.values(colN)) <= T.LINE_MAX, '同一列、同一行最多 ' + T.LINE_MAX + ' 格被改：' + JSON.stringify(rowN) + JSON.stringify(colN));
    ok(new Set(t.map(c => c.a + ',' + c.b)).size === cnt, '被改的格子不重複'); }
  t.forEach(c => {
    ok(c.a >= 2 && c.b >= 2 && c.a <= T.N && c.b <= T.N, '不在第 1 列／行');
    ok(c.a !== c.b, '不在對角線（要有對稱格可以交叉檢查）');
    ok(c.truth === c.a * c.b && c.shown !== c.truth && c.shown > 0, '改後 ≠ 正解、為正數');
    ok(!t.some(d => d !== c && d.a === c.b && d.b === c.a), '對稱格不是被改的格子');
    typeSeen[c.type] = (typeSeen[c.type] || 0) + 1;
  });
}
ok(T.TYPES.every(k => typeSeen[k] > 3000 * T.FOUND / 3), '四種改法都常出現 ' + JSON.stringify(typeSeen));
// 平均分散：每一列、每一行都有機會被改；格數多的時候也不會集中在少數幾列
{ const rowSeen = {}, colSeen = {}; for (let i = 0; i < 2000; i++) T.makeTable(rnd).tampered.forEach(c => { rowSeen[c.a] = (rowSeen[c.a] || 0) + 1; colSeen[c.b] = (colSeen[c.b] || 0) + 1; });
  const rv = Object.values(rowSeen), cv = Object.values(colSeen); ok(rv.length === T.N - 1 && cv.length === T.N - 1, '第 2～N 列、行都會被改到'); ok(Math.max(...rv) / Math.min(...rv) < 1.3 && Math.max(...cv) / Math.min(...cv) < 1.3, '各列、各行被改的機會差不多：' + JSON.stringify(rowSeen)); }
// 數量超過上限時夾住（28 組不同的乘數組合）；數量 1 也行
ok(T.makeTable(rnd, 99).tampered.length === (T.N - 1) * (T.N - 2) / 2 && T.makeTable(rnd, 1).tampered.length === 1, 'count 夾在 1～組合數');
ok(T.makeTable(rnd).tampered.length === T.FOUND, '不傳 count ＝ FOUND');
// tamper：各改法的結果
ok(T.tamper(6, 7, 'swap', () => 0) === 24, '42 對調成 24');
ok(T.tamper(5, 5, 'swap', () => 0) === 52 && T.tamper(1, 1, 'swap', () => 0) === 2 && T.tamper(5, 11, 'swap', () => 0) === 56, '25→52；個位數或十位＝個位時改成 +1');
ok([43, 41].includes(T.tamper(6, 7, 'ones', rnd)) && [52, 32].includes(T.tamper(6, 7, 'tens', rnd)), 'ones／tens');
for (let i = 0; i < 50; i++) ok([36, 48, 35, 49].includes(T.tamper(6, 7, 'neighbor', rnd)), 'neighbor 是隔壁格的答案');
for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (const ty of T.TYPES) for (let k = 0; k < 6; k++) { const v = T.tamper(a, b, ty, rnd); ok(v !== a * b && v >= 1, 'tamper ' + a + '×' + b + ' ' + ty + ' → ' + v); }
ok(T.rating(20) !== T.rating(40) && T.rating(40) !== T.rating(70) && T.rating(70) !== T.rating(120), '評語分級（找 9 格，用時比以前長）');
// V1.27：找齊之後，被改的答案紅底白字閃爍 1.5 秒、再維持 1.5 秒，才結算
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_timestable.js'), css = rd('../../css/reaction3.css').split('\r\n').join(' ').split('\n').join(' ');
  ok(T.BLINK_MS === 1500 && T.HOLD_MS === 1500, '閃爍 1.5 秒、維持 1.5 秒');
  ok(/\.tt-cell--wrong \{[^}]*c-bad-light[^}]*c-on-accent/.test(css), '紅底白字');
  ok(/\.tt-cell--blink \{\s*animation: tt-blink 0\.3s steps\(1, end\) 5;/.test(css), '閃爍 0.3 秒 × 5 次 = 1.5 秒');
  ok(src.indexOf('my.after(BLINK_MS + HOLD_MS') > src.indexOf("el.classList.add('tt-cell--wrong', 'tt-cell--blink')") && src.indexOf('api.finish(sec') > src.indexOf('my.after(BLINK_MS + HOLD_MS'), '先閃爍、維持，之後才結算'); }
// V1.32：第一次進遊戲的公平性、舊紀錄清掉、結算不會列出 9～10 行
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_timestable.js');
  ok(src.indexOf("var first = kit.once('timestable.hint'), total = FOUND + (first ? HINT_EXTRA : 0)") > 0 && src.indexOf('makeTable(null, total)') > 0 && src.indexOf('if (first) hint =') > 0, '第一次進遊戲：多改 HINT_EXTRA 格，系統引導第一格');
  ok(src.indexOf("Reaction.migrateBest(ID, function () { return null; }, '.v132')") > 0, '舊的最佳紀錄清掉');
  ok(src.indexOf('tb.tampered.slice(0, 3)') > 0 && G.rule.indexOf('9 格') > 0 && G.rule.indexOf('第一次') > 0, '結算只列前 3 格當例子；規則說明 9 格與第一次的 10 格'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
