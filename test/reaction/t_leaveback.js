// 玩到一半按「返回」：把已經完成的關卡結算（V1.57.0 玩家意見）
//   玩家臨時有事、按「返回」離開，剛剛的最高紀錄不能就這樣消失（不限時／限時很長的遊戲特別需要）。
//   · Reaction.setBest 刷新個人最佳 → Reaction.pendingBest 記下「還沒結算」；kit.result 結算時清掉
//   · 按「返回」→ js/reaction.js 問 kit.settleOnLeave：刷新了而且有機會進前 30 名 → 先結算（結算卡片＋送排行榜，恭喜彈窗會跳），再按一次才離開；
//     進不了榜 → 個人最佳照樣記下、直接離開；沒刷新 → 直接離開
//   · kit.run 的闖關遊戲：Reaction.onLeave（reaction_kit2.js）用「已完成的關卡」算成績
//   · 結算前不會先 setBest 的遊戲（發票、視力表…）：登記 Reaction.leaveScore
const fs = require('fs');
const path = require('path');
const { game } = require('./load.js');
let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const rd = p => fs.readFileSync(path.resolve(__dirname, p), 'utf8');

// 假的 localStorage（讓 setBest／getBest 真的存得住）
const mem = {};
UI.store = { get: (k, f) => (k in mem ? mem[k] : f), set: (k, v) => { mem[k] = v; } };

const G = game('reaction_backnum.js');            // 越大越好（關卡）
const Gmin = game('reaction_speed.js');           // 越小越好（秒）
const kit = Reaction.kit;
const gt = (a, b) => a > b, lt = (a, b) => a < b;

// 假的排行榜：記下 submit 的呼叫；wouldQualify 的回答由測試決定
let answer = true; const sent = [];
const realWQ = Leaderboard.wouldQualify;
Leaderboard.wouldQualify = () => answer;
Leaderboard.submit = (g, v) => { sent.push([g.id, v]); return Promise.resolve({ status: 'x' }); };
const reset = () => { for (const k in mem) delete mem[k]; Reaction.pendingBest = null; Reaction.leaveScore = null; Reaction.leaveCard = null; sent.length = 0; Reaction.current = G; };
const root = { appendChild() { } };

// ── pendingBest：刷新個人最佳才有；kit.result 清掉 ──
reset();
ok(Reaction.pendingBest === null, '一開始沒有待結算的成績');
Reaction.setBest(G.id, 5, gt);
ok(Reaction.pendingBest && Reaction.pendingBest.id === G.id && Reaction.pendingBest.val === 5, '刷新個人最佳 → 記下待結算 { id, val }');
Reaction.pendingBest = null; Reaction.setBest(G.id, 3, gt);
ok(Reaction.pendingBest === null && Reaction.getBest(G.id) === 5, '沒有刷新（3 < 5）→ 不記待結算、最佳不變');
Reaction.setBest(G.id, 8, gt);
ok(Reaction.pendingBest.val === 8, '又刷新 → 待結算換成最新的 8');
kit.result(root, { score: 8, num: '8' });
ok(Reaction.pendingBest === null && Reaction.leaveScore === null, 'kit.result 結算之後清掉待結算（不會再被「返回」重複送）');
Reaction.setBest(G.id, 9, gt);
kit.result(root, { num: '小結', bgm: false });
ok(Reaction.pendingBest && Reaction.pendingBest.val === 9, '只是小結算（bgm:false）不清掉待結算');

// ── kit.leaveVerdict ──
reset();
answer = true;
ok(kit.leaveVerdict(G.id, 5, 'max') === 'card', '沒有舊紀錄、有機會進榜 → card');
answer = false;
ok(kit.leaveVerdict(G.id, 5, 'max') === 'silent', '刷新了、但進不了榜 → silent（記下就好）');
answer = null;
ok(kit.leaveVerdict(G.id, 5, 'max') === 'card', '手上沒有榜單、不知道 → card（寧可結算，免得漏掉）');
Reaction.setBest(G.id, 7, gt);
ok(kit.leaveVerdict(G.id, 7, 'max') === 'none' && kit.leaveVerdict(G.id, 6, 'max') === 'none', '沒有比個人最佳好（相等或更差）→ none');
ok(kit.leaveVerdict(G.id, 8, 'max') !== 'none', '比個人最佳好 → 要處理');
ok(kit.leaveVerdict(G.id, NaN, 'max') === 'none' && kit.leaveVerdict(G.id, null, 'max') === 'none' && kit.leaveVerdict(G.id, undefined, 'max') === 'none', '沒有成績（NaN／null）→ none');
Reaction.current = Gmin; reset(); Reaction.current = Gmin; Reaction.setBest(Gmin.id, 0.3, lt);
ok(kit.leaveVerdict(Gmin.id, 0.5, 'min') === 'none' && kit.leaveVerdict(Gmin.id, 0.2, 'min') !== 'none', '越小越好的遊戲：0.5 沒有比 0.3 好、0.2 才是新紀錄');

// ── kit.settleOnLeave：闖關每過一關就 setBest 的遊戲（待結算）──
reset(); answer = true;
Reaction.setBest(G.id, 6, gt);                                  // 玩到第 6 關、還沒結束
let r = kit.settleOnLeave(root, G);
ok(r === true, '有機會進榜：跳出結算卡片，返回鈕這次不離開');
ok(sent.length === 1 && sent[0][0] === G.id && sent[0][1] === 6, '結算時把目前成績 6 送去排行榜：' + JSON.stringify(sent));
ok(Reaction.leaveCard !== null && Reaction.pendingBest === null, '記下這張卡片、待結算清掉');
Reaction.leaveCard = null;
ok(kit.settleOnLeave(root, G) === false && sent.length === 1, '結算之後再按一次「返回」→ 直接離開、不會重複送');
reset(); answer = false;
Reaction.setBest(G.id, 6, gt);
ok(kit.settleOnLeave(root, G) === false && sent.length === 0 && Reaction.getBest(G.id) === 6 && Reaction.pendingBest === null, '進不了榜：直接離開、個人最佳 6 已記下、不連網（沒有 submit）');
reset(); answer = true;
ok(kit.settleOnLeave(root, G) === false && sent.length === 0, '一關都還沒過（沒有成績）→ 直接離開');
reset(); answer = true;
Reaction.setBest('another', 3, gt); Reaction.pendingBest = { id: 'another', val: 3 };
ok(kit.settleOnLeave(root, G) === false, '待結算的是別款遊戲的 → 不處理');
ok(kit.settleOnLeave(root, null) === false && kit.settleOnLeave(root, {}) === false, '沒有遊戲資料 → 直接離開');

// ── 結算前不會先 setBest 的遊戲：Reaction.leaveScore ──
reset(); answer = true;
Reaction.leaveScore = () => 7;
ok(kit.settleOnLeave(root, G) === true && Reaction.getBest(G.id) === 7 && sent.length === 1 && sent[0][1] === 7, 'leaveScore 給 7：先記個人最佳、再結算送榜');
ok(Reaction.leaveScore === null, '用過就清掉');
reset(); answer = true; Reaction.setBest(G.id, 10, gt); Reaction.pendingBest = null; Reaction.leaveScore = () => 7;
ok(kit.settleOnLeave(root, G) === false && Reaction.getBest(G.id) === 10 && sent.length === 0, 'leaveScore 給 7、個人最佳是 10 → 沒刷新，什麼都不做');
reset(); answer = false; Reaction.leaveScore = () => 7;
ok(kit.settleOnLeave(root, G) === false && Reaction.getBest(G.id) === 7 && sent.length === 0, 'leaveScore 刷新了、但進不了榜 → 只記個人最佳、直接離開');
reset(); answer = true; Reaction.leaveScore = () => null;
ok(kit.settleOnLeave(root, G) === false && Reaction.getBest(G.id) == null, 'leaveScore 回 null（還沒有成績）→ 直接離開');
reset(); Reaction.current = Gmin; answer = true; Reaction.setBest(Gmin.id, 0.3, lt); Reaction.pendingBest = null; Reaction.leaveScore = () => 0.5;
ok(kit.settleOnLeave(root, Gmin) === false && Reaction.getBest(Gmin.id) === 0.3, '越小越好：leaveScore 0.5 比最佳 0.3 差 → 不處理');
Reaction.leaveScore = () => 0.2;
ok(kit.settleOnLeave(root, Gmin) === true && Reaction.getBest(Gmin.id) === 0.2, '越小越好：leaveScore 0.2 刷新了 → 結算');

// ── 結算卡片還在時，遊戲晚一步才跳出的結算不會再疊一張 ──
reset(); answer = true;
Reaction.leaveCard = { isConnected: true };
let opened = 0; const od = Dlg.open; Dlg.open = function (o) { opened++; return od.apply(this, arguments); };
const back = kit.result(root, { score: 3, num: '3' });
ok(back === Reaction.leaveCard && opened === 0 && sent.length === 0, '返回結算的卡片還在畫面上：遊戲自己的結算不再疊第二張、也不重複送');
Reaction.leaveCard = { isConnected: false };
kit.result(root, { score: 3, num: '3' });
ok(opened === 1, '卡片已經不在了：遊戲自己的結算照常');
Dlg.open = od; Reaction.leaveCard = null;

// ── Leaderboard.wouldQualify（用手上的榜單判斷，不連網）──
Leaderboard.wouldQualify = realWQ;
ok(typeof realWQ === 'function', 'Leaderboard.wouldQualify 有匯出');
reset();
const spec = G.score;
ok(realWQ(G, 5) === null, '手上沒有榜單 → null（不知道）');
ok(realWQ({ id: 'nope', name: 'x' }, 5) === false, '沒有排行榜設定的遊戲 → false');
ok(realWQ(G, NaN) === false && realWQ(G, 'a') === false, '成績不是數字 → false');
ok(realWQ(G, (spec.min != null ? spec.min : 1) - 1) === false, '成績低於有效範圍 → false');
const top = []; for (let i = 0; i < 30; i++) top.push({ rank: i + 1, nick: 'p' + i, score: 100 - i });
Leaderboard.putBoard(G.id, { better: spec.better, limit: 30, top });
ok(realWQ(G, 200) === true, '榜單滿 30 名、成績比第 1 名還好 → true');
ok(realWQ(G, 72) === true && realWQ(G, 71) === false && realWQ(G, 5) === false, '榜單滿 30 名：要比第 30 名（71）好才進得去（72 true／71 false／5 false）');
Leaderboard.putBoard(G.id, { better: spec.better, limit: 30, top: top.slice(0, 10) });
ok(realWQ(G, 3) === true, '榜單還沒滿 30 名：任何有效成績都進得去');
const mine = top.map(x => Object.assign({}, x)); mine[4].mine = true;       // 我自己在第 5 名，分數 96
Leaderboard.putBoard(G.id, { better: spec.better, limit: 30, top: mine });
ok(realWQ(G, 96) === false && realWQ(G, 97) === true, '我已經在榜上（96）：要比自己的紀錄好才算（96 false／97 true）');

// ── 程式裡的接線 ──
const rx = rd('../../js/reaction.js'), k1 = rd('../../js/reaction_kit.js'), k2 = rd('../../js/reaction_kit2.js'), core = rd('../../js/reaction_core.js');
ok(/Reaction\.onLeave && Reaction\.onLeave\(\) === true\) return;\s*\/\*[^*]*\*\/\s*if \(Reaction\.kit && Reaction\.kit\.settleOnLeave && Reaction\.kit\.settleOnLeave\(screen, game\) === true\) return;\s*Sfx\.stopBgm\(\)/.test(rx), 'reaction.js：返回鈕依序問 Reaction.onLeave、kit.settleOnLeave，都沒處理才離開');
ok(/Reaction\.pendingBest = \{ id: id, val: val \}/.test(core), 'setBest 刷新時記下待結算');
ok(/if \(o\.bgm !== false\) \{ Reaction\.pendingBest = null; Reaction\.leaveScore = null; \}/.test(k1), 'kit.result 結算時清掉待結算');
ok(/leavePage[\s\S]*index\.html\?games=1/.test(k1) && /againText: '離開遊戲', onAgain: leavePage/.test(k1), '結算卡片上有「離開遊戲」鈕（回到選遊戲列表）');
ok(/\} : function \(\) \{[\s\S]*kit\.leaveVerdict\(o\.id, score, 'max'\)[\s\S]*finish\(\{\}, false\);\s*return true;/.test(k2), 'kit.run 的一般闖關遊戲：按「返回」用已完成的關卡算成績、有機會進榜就 finish 結算');
ok(/verdict === 'silent'[\s\S]*Reaction\.setBest\(o\.id, score, gt\)[\s\S]*kit\.noteLevel\(o\.id, S\.level\)/.test(k2), 'kit.run：進不了榜時也記下個人最佳與到過第幾關');
ok(/S\.cleared < startAt/.test(k2.slice(k2.indexOf('} : function () {'))), 'kit.run：一題都還沒解開 → 直接離開');

// ── 結算前不會先 setBest 的遊戲，都要登記 leaveScore（掃所有遊戲檔：結算才 setBest、而且多關卡累積成績的）──
const REG = { invoice: /right > 0 \? right/, landolt: /acuityShown\(passed\)/, polyrhythm: /doneMeasures > 0/, rainbow: /hits > 0 \? hits/, seven: /passed > \(startAt \|\| 1\) - 1/, teacher: /streak > \(startAt \|\| 1\) - 1/, shapes: /level > 1 \? level - 1/, spot: /level > 1 \? level - 1/ };
for (const f of Object.keys(REG)) { const src = rd('../../js/reaction_' + f + '.js'); ok(/Reaction\.leaveScore = function \(\)/.test(src) && REG[f].test(src), f + '：登記了 Reaction.leaveScore（玩到一半按「返回」的目前成績）'); }
// 每款遊戲的結算都是「先 setBest 再 kit.result」或「每過一關就 setBest」，所以不會漏：掃所有遊戲，凡是 setBest 的檔案都不該自己 location.href 離開
{
  const dir = path.resolve(__dirname, '../../js'); let n = 0;
  for (const f of fs.readdirSync(dir).filter(x => /^reaction_.*\.js$/.test(x) && !/^reaction_(kit\d*|core)\.js$/.test(x))) { const src = rd('../../js/' + f); if (/Reaction\.setBest\(/.test(src)) { n++; ok(!/location\.href/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), f + '：不會自己跳轉頁面（離開一律走返回鈕）'); } }
  ok(n > 40, '掃過 ' + n + ' 款有個人最佳的遊戲');
}

console.log((bad ? bad + ' FAIL / ' : '') + total + ' checks');
console.log(bad ? 'SOME FAILED' : 'ALL PASS');
process.exit(bad ? 1 : 0);
