// 「進場關卡優惠送的關卡，不算成績」（V1.57.2.0 玩家意見）的檢查：
//   玩家的本機最佳關卡很高（例如 21），一進遊戲就從第 17 關開始（kit.entryLevel）；這一局一關都沒真的通過、直接在第 17 關失敗，
//   成績卻是「前面跳過的 16 關都算已過」＝ 16 關，被記成最高紀錄、還送上世界排行榜。
//   · Reaction.beginRun／creditOnly：登記這一局從第幾關開始、哪些成績只是優惠送的；
//   · Reaction.setBest、kit.leaveVerdict、kit.result 都不把它當成績；真的通過至少一關就照舊算；
//   · 「再玩一次」「從前面繼續」重新登記；成績不是「通過關數」的遊戲（視力）自己傳 credit；
//   · 接線：kit.run、kit.entryLevel、視力（landolt）、大家來找碴／圖形（spot、shapes：成績＝撐到第幾關）。
const { game } = require('./load.js');
const fs = require('fs'), path = require('path');
// 讓 kit.result 建出來的元素留得下文字（load.js 的 UI.h 是空殼）：換成會記下屬性的版本，再重新載入 reaction_kit.js
UI.h = (tag, props, kids) => ({ tag, props: props || {}, kids: kids || [] });
delete require.cache[require.resolve('../../js/reaction_kit.js')]; require('../../js/reaction_kit.js');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };

const mem = {};
UI.store = { get: (k, f) => (k in mem ? mem[k] : f), set: (k, v) => { mem[k] = v; } };
const kit = Reaction.kit;
const gt = (a, b) => a > b;
const reset = () => { Object.keys(mem).forEach(k => delete mem[k]); Reaction.current = null; Reaction.entryRun = null; Reaction.pendingBest = null; };
// 換掉世界排行榜的送出，記下有沒有送、送了什麼
const submitted = [];
Leaderboard.submit = (g, s) => { submitted.push([g && g.id, s]); };
const root = { appendChild() { } };
let lastDlg = null;
Dlg.open = (o) => { lastDlg = o; return { el: {}, card: {}, buttons: [], isOpen: () => true, close() { } }; };
const textsOf = (d) => (d.children || []).map(k => (k && k.props && k.props.text) || '');

// ── 1. 登記這一局與判斷 ──
reset();
ok(Reaction.entryRun === null && Reaction.creditOnly('a', 5) === false, '沒登記過：什麼都不算優惠送的');
Reaction.beginRun('a', 17, 1);
ok(Reaction.entryRun.from === 17 && Reaction.entryRun.add === 1 && Reaction.entryRun.credit === 16, '成績＝通過關數（add 1）：從第 17 關開始，優惠送的成績是 16');
ok(Reaction.creditOnly('a', 16) === true && Reaction.creditOnly('a', 1) === true && Reaction.creditOnly('a', 17) === false && Reaction.creditOnly('a', 25) === false, '成績 ≤ 16 是優惠送的；一關都沒過 ＝ 16、真的通過 1 關 ＝ 17 才算');
ok(Reaction.creditOnly('b', 3) === false, '別款遊戲不受影響');
ok(Reaction.creditOnly('a', NaN) === false && Reaction.creditOnly('a', '9') === false && Reaction.creditOnly('a', null) === false, '不是數字的成績不判斷');
Reaction.beginRun('a', 17, 0);
ok(Reaction.entryRun.credit === 17 && Reaction.creditOnly('a', 17) === true && Reaction.creditOnly('a', 18) === false, '成績＝撐到第幾關（add 0，大家來找碴、圖形）：第 17 關失敗成績就是 17，優惠送的是 17');
Reaction.beginRun('a', 17, 1, 0.8);
ok(Reaction.entryRun.credit === 0.8 && Reaction.creditOnly('a', 0.8) === true && Reaction.creditOnly('a', 0.81) === false, '成績不是關數的遊戲（視力）可以自己傳 credit');
ok(Reaction.beginRun('a', 1, 1) === null && Reaction.entryRun === null, '從第 1 關開始（沒有優惠）→ 清掉');
Reaction.beginRun('a', 9); ok(Reaction.entryRun.add === 1 && Reaction.entryRun.credit === 8, 'add 沒給 → 預設 1');
ok(Reaction.beginRun('', 9, 1) === null && Reaction.beginRun(null, 9, 1) === null, '沒有遊戲代號不登記');

// ── 2. kit.entryLevel 一進場就登記 ──
reset(); mem[kit.lvKey('g')] = 21;
ok(kit.entryLevel('g') === 17 && Reaction.entryRun.id === 'g' && Reaction.entryRun.from === 17 && Reaction.entryRun.credit === 16, 'kit.entryLevel：最佳關卡 21 → 從第 17 關，優惠送的成績 16');
reset(); mem[kit.lvKey('g')] = 21;
ok(kit.entryLevel('g', 0) === 17 && Reaction.entryRun.credit === 17, 'kit.entryLevel(id, 0)（成績＝撐到第幾關）→ 優惠送的成績 17');
reset(); mem[kit.lvKey('g')] = 3;
ok(kit.entryLevel('g') === 1 && Reaction.entryRun === null, '最佳關卡很低 → 從第 1 關、沒有優惠');

// ── 3. 玩家回報的情形：最佳關卡 21、最佳成績沒有（或比 16 低）→ 第 17 關失敗 ＝ 16 → 不能被記成最高紀錄 ──
reset(); mem[kit.lvKey('swipecopy')] = 21;
Reaction.current = { id: 'swipecopy' };
let from = kit.entryLevel('swipecopy');
ok(from === 17, '進場從第 17 關開始');
ok(Reaction.setBest('swipecopy', 16, gt) === false && Reaction.getBest('swipecopy') === null && Reaction.pendingBest === null, '第 17 關失敗（成績 16）：不記最佳（最佳成績還是沒有）、也不會變成「待結算」');
ok(kit.leaveVerdict('swipecopy', 16, 'max') === 'none', '按「返回」：成績 16 是優惠送的 → 當作沒有刷新個人最佳');
submitted.length = 0;
kit.result(root, { score: 16, num: '16 關', label: '很準', isNew: true, lines: ['正確答案是「甲」'], level: 17, onAgain() { } });
ok(submitted.length === 0, '結算：沒有送世界排行榜');
{ const t = textsOf(lastDlg).join('｜');
  ok(!/16 關/.test(t) && /正確答案是「甲」/.test(t) && /這次從第 17 關開始，還沒有通過新的關卡，不計入最佳紀錄/.test(t) && !/新紀錄/.test(t), '結算畫面：沒有大數字與「新紀錄」、遊戲自己的說明行（正確答案…）留著，加上說明「這次從第 17 關開始，還沒有通過新的關卡」：' + t); }
ok(kit.levelBest('swipecopy') === 21, '最佳關卡沒被改（仍是 21）');
// 最佳成績比優惠送的低（本機成績被清過、在另一台同步來的…）也一樣不能被優惠蓋過去
mem[Reaction.bestKey('swipecopy')] = 9;
ok(Reaction.setBest('swipecopy', 16, gt) === false && Reaction.getBest('swipecopy') === 9, '最佳成績 9 比優惠送的 16 低，也不能被蓋成 16');
// 真的通過了一關（成績 17）：照舊算
ok(Reaction.setBest('swipecopy', 17, gt) === true && Reaction.getBest('swipecopy') === 17 && Reaction.pendingBest.val === 17, '真的通過第 17 關（成績 17）→ 照舊記成新紀錄');
ok(kit.leaveVerdict('swipecopy', 18, 'max') !== 'none', '返回：真的通過了新的關卡（18）→ 照舊判斷進榜');
submitted.length = 0;
kit.result(root, { score: 18, num: '18 關', isNew: true, level: 19, onAgain() { } });
ok(submitted.length === 1 && submitted[0][1] === 18, '結算：真的通過了 → 照舊送世界排行榜（18）');

// ── 4. 一般狀態（最佳成績跟最佳關卡對得上）：行為跟以前一樣 ──
reset(); mem[kit.lvKey('c')] = 21; mem[Reaction.bestKey('c')] = 20; Reaction.current = { id: 'c' };
kit.entryLevel('c');
ok(Reaction.setBest('c', 16, gt) === false && Reaction.getBest('c') === 20, '最佳成績 20：成績 16 本來就不會刷新');
ok(Reaction.setBest('c', 21, gt) === true && Reaction.getBest('c') === 21, '玩過頭（21）照舊刷新');
// 沒有優惠的遊戲（單回合、累計分數）：不受影響
reset(); Reaction.current = { id: 'single' };
ok(Reaction.setBest('single', 0.2, (a, b) => a < b) === true && Reaction.setBest('single', 3, (a, b) => a < b) === false, '沒登記優惠的遊戲：setBest 跟以前一樣');
submitted.length = 0; kit.result(root, { score: 0.15, num: '0.15 秒', isNew: true });
ok(submitted.length === 1, '沒登記優惠的遊戲：結算照常送世界排行榜');

// ── 5. 「再玩一次」「從前面繼續」重新登記 ──
reset(); mem[kit.lvKey('r')] = 30; Reaction.current = { id: 'r' };
kit.entryLevel('r');                                   // 從第 26 關
let ran = [];
kit.result(root, { score: 24, level: 31, onAgain() { ran.push(['again', Reaction.entryRun]); }, resume: { level: 26, run() { ran.push(['resume', Reaction.entryRun && Reaction.entryRun.from]); } } });
const btns = lastDlg.buttons;
ok(btns.length === 2 && /從第 26 關繼續/.test(btns[0].text) && /從第 1 關重來/.test(btns[1].text), '失敗後還是「從第 26 關繼續」「從第 1 關重來」兩顆按鈕');
btns[0].onClick();
ok(ran[0][0] === 'resume' && ran[0][1] === 26 && Reaction.entryRun.from === 26 && Reaction.entryRun.credit === 25, '「從第 26 關繼續」：新的一局從第 26 關，優惠送的成績 25');
btns[1].onClick();
ok(ran[1][0] === 'again' && ran[1][1] === null && Reaction.entryRun === null, '「從第 1 關重來」：沒有優惠（登記清掉）');
// 重來之後的真實成績（例如最佳成績很低、這次重新從第 1 關玩到 12 關）不會被舊的優惠誤擋
ok(Reaction.setBest('r', 12, gt) === true, '從第 1 關重來玩到 12 關 → 照常記（沒有被上一局的優惠誤擋）');
// 成績＝撐到第幾關的遊戲，繼續時沿用 add 0
reset(); mem[kit.lvKey('s')] = 30; Reaction.current = { id: 's' };
kit.entryLevel('s', 0);
kit.result(root, { score: 31, level: 31, onAgain() { }, resume: { level: 26, run() { } } });
lastDlg.buttons[0].onClick();
ok(Reaction.entryRun.from === 26 && Reaction.entryRun.add === 0 && Reaction.entryRun.credit === 26, '成績＝撐到第幾關的遊戲：從前面繼續沿用 add 0（優惠送的成績 26）');
reset();

// ── 6. 接線（靜態檢查）──
const dir = path.join(__dirname, '../../js');
const rd = f => fs.readFileSync(path.join(dir, f), 'utf8');
const core = rd('reaction_core.js'), kitSrc = rd('reaction_kit.js'), kit2 = rd('reaction_kit2.js'), landolt = rd('reaction_landolt.js');
const nc = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
ok(/Reaction\.beginRun = function/.test(core) && /Reaction\.creditOnly = function/.test(core) && /if \(Reaction\.creditOnly\(id, val\)\) return false;/.test(nc(core)), 'reaction_core：beginRun、creditOnly，Reaction.setBest 先問 creditOnly');
ok(/Reaction\.beginRun\(id, from, legacyAdd\)/.test(nc(kitSrc)) && /Reaction\.creditOnly\(id, score\)\) return 'none'/.test(nc(kitSrc)), 'kit.entryLevel 登記這一局、kit.leaveVerdict 不算優惠送的成績');
ok(/Reaction\.creditOnly\(cid, o\.score\)/.test(nc(kitSrc)) && /o2\.score = null/.test(nc(kitSrc)) && /Reaction\.entryRun = null; return againFn\.apply/.test(nc(kitSrc)) && /Reaction\.beginRun\(cid, resumeObj\.level, add0\)/.test(nc(kitSrc)), 'kit.result：優惠送的成績不送排行榜、「再玩一次」清掉登記、「從前面繼續」重新登記');
ok(/Reaction\.beginRun\(o\.id, from, o\.scoreBase \? 0 : 1\)/.test(nc(kit2)) && /var credit = Reaction\.creditOnly\(o\.id, score\)/.test(nc(kit2)) && /!credit && score >= \(o\.goodAt \|\| 5\)/.test(nc(kit2)), 'kit.run：每一局開始登記（成績＝過關數＋scoreBase 時優惠送的成績不同）、結算不放「通過 N 關」、不播過關音效');
ok(/Reaction\.beginRun\(ID, from \|\| 1, 1, \(from \|\| 1\) > 1 \? acuityShown\(\(from \|\| 1\) - 1\) : 0\)/.test(nc(landolt)), '視力（landolt）：成績是視力，優惠送的成績＝前面跳過的 E 的視力');
['spot', 'shapes'].forEach(id => ok(/kit\.entryLevel\(ID, 0\)/.test(rd('reaction_' + id + '.js')), id + '：成績＝撐到第幾關，entryLevel(ID, 0)（第 17 關失敗成績是 17，優惠送的成績也是 17）'));
{ // 舊式闖關遊戲：一律「通過關數」＝ cleared 從 from − 1 起算，所以預設的 add 1 是對的
  const files = fs.readdirSync(dir).filter(f => /^reaction_.*\.js$/.test(f) && !/kit|core/.test(f));
  let n = 0; files.forEach(f => { const src = rd(f); if (/kit\.enter\(ID, round\)/.test(src) && f !== 'reaction_landolt.js') n++; });
  ok(n >= 24, '舊式闖關遊戲 ' + n + ' 款，都用 kit.enter(ID, round)（預設 add 1：cleared 從 from − 1 起算）');
}

console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exit(bad ? 1 : 0);
