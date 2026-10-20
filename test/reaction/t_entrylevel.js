// 「記住個人最佳關卡，下次從最佳關卡 − 5 開始」（V1.34.0）的檢查：
//   · kit.noteLevel／levelBest／entryLevel 的算法（只增不減、最少第 1 關、舊玩家用最佳成績估一個）
//   · kit.result 一定會記下玩家停在第幾關（有給 o.level，或用 o.resume 反推）
//   · 所有闖關遊戲都真的接上了：kit.run 的遊戲（reaction_kit2.js 統一處理）＋ 舊式 round(startAt) 的遊戲（mount 最後一行呼叫 kit.enter）
const { game } = require('./load.js');
const fs = require('fs'), path = require('path');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };

// 用一個「記在記憶體裡」的假 localStorage 取代 load.js 預設的空殼，才看得出有沒有真的存進去
const mem = {};
UI.store = { get: (k, f) => (k in mem ? mem[k] : f), set: (k, v) => { mem[k] = v; } };
const kit = Reaction.kit;
const reset = () => { Object.keys(mem).forEach(k => delete mem[k]); Reaction.current = null; };

// ── 基本算法 ──
reset();
ok(kit.levelBest('x') === 0, '沒玩過 → 0');
ok(kit.entryLevel('x') === 1, '沒玩過 → 從第 1 關開始');
ok(kit.noteLevel('x', 30) === true && kit.levelBest('x') === 30, '記下第 30 關');
ok(kit.entryLevel('x') === 26, '最佳第 30 關 → 下次從第 26 關開始（使用者指定的例子：26～30 共 5 關）');
ok(kit.noteLevel('x', 28) === false && kit.levelBest('x') === 30, '只增不減：後來只玩到 28 關，紀錄還是 30');
ok(kit.noteLevel('x', 31) === true && kit.entryLevel('x') === 27, '破紀錄第 31 關 → 從第 27 關');
ok(kit.noteLevel('x', 1) === false && kit.noteLevel('x', 0) === false && kit.noteLevel('', 9) === false && kit.noteLevel('x', NaN) === false, '第 1 關以下、沒有 id、NaN 都不記');
reset(); kit.noteLevel('y', 4);
ok(kit.entryLevel('y') === 1, '最佳才第 4 關 → 不會小於第 1 關');
reset(); kit.noteLevel('y', 5);
ok(kit.entryLevel('y') === 1, '最佳第 5 關 → 第 1 關（5 − 4 ＝ 1）');
reset(); kit.noteLevel('y', 6);
ok(kit.entryLevel('y') === 2, '最佳第 6 關 → 第 2 關');
reset(); mem[kit.lvKey('z')] = 'abc';
ok(kit.levelBest('z') === 0 && kit.entryLevel('z') === 1, '存壞的值（不是數字）→ 當作沒玩過');
reset(); mem[kit.lvKey('z')] = 12.7;
ok(kit.levelBest('z') === 12, '小數無條件捨去');

// ── 舊玩家（這個功能上線前玩過，只有「最佳成績」）：用最佳成績估 ──
reset(); mem[Reaction.bestKey('old')] = 29;      // 成績 29 ＝ 過了 29 關 ＝ 停在第 30 關
ok(kit.entryLevel('old') === 26, '舊玩家：最佳成績 29（過 29 關）→ 第 30 關 → 從第 26 關開始');
ok(kit.levelBest('old') === 30, '估出來的關卡有存起來');
reset(); mem[Reaction.bestKey('old2')] = 30;     // 成績本身就是「撐到第幾關」的遊戲傳 legacyAdd = 0
ok(kit.entryLevel('old2', 0) === 26, '舊玩家（成績＝撐到第幾關）→ 從第 26 關');
reset(); mem[Reaction.bestKey('old3')] = 0.1234;
ok(kit.entryLevel('old3') === 1, '最佳成績是小數秒（不是關卡遊戲）也不會算出怪的關卡');
reset(); mem[Reaction.bestKey('old4')] = -3;
ok(kit.entryLevel('old4') === 1, '最佳成績是負數 → 第 1 關');

// ── kit.result 一定會記關卡 ──
reset(); Reaction.current = { id: 'g1' };
const root = { appendChild() { } };
kit.result(root, { num: 1, level: 12 });
ok(kit.levelBest('g1') === 12, 'kit.result 有給 o.level → 記下');
kit.result(root, { num: 1, level: 9 });
ok(kit.levelBest('g1') === 12, '後來玩得比較差，不會把紀錄改小');
kit.result(root, { num: 1, resume: { level: 20, run() { } }, onAgain() { } });
ok(kit.levelBest('g1') === 25, '沒給 o.level 時用 o.resume 反推：從第 20 關繼續 ＝ 失敗在第 25 關');
reset(); Reaction.current = { id: 'g2' };
kit.result(root, { num: 1, resume: { level: 1, run() { } }, onAgain() { } });
ok(kit.levelBest('g2') === 0, 'o.resume.level 是 1（失敗關卡 ≤ 6）時不反推，下次本來就從第 1 關');
kit.result(root, { num: 1 });
ok(kit.levelBest('g2') === 0, '沒有任何關卡資訊的遊戲（單回合、累計分數）不會被記');
Reaction.current = null;
kit.result(root, { num: 1, level: 40 });
ok(Object.keys(mem).length === 0, '測試環境（沒有 Reaction.current）不會亂存');
reset();

// ── 接線：每一款闖關遊戲都接上了 ──
const dir = path.join(__dirname, '../../js');
const files = fs.readdirSync(dir).filter(f => /^reaction_.*\.js$/.test(f) && !/kit|core/.test(f));
let runGames = 0, oldGames = 0, skipped = [];
files.forEach(f => {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const usesRun = /kit\.run\(/.test(src), hasResume = /resume:\s*\{|resume:\s*allClear/.test(src);
  if (usesRun) {
    runGames++;
    // kit.run 的遊戲由 reaction_kit2.js 統一處理，遊戲檔案本身不用改
  } else if (hasResume) {
    oldGames++;
    ok(/kit\.enter\(ID, round\)/.test(src), f + '：舊式闖關遊戲 mount 最後要呼叫 kit.enter(ID, round)');
    ok(!/^\s+round\(1\);\s*$/m.test(src), f + '：不該還有「進場直接 round(1)」');
  } else skipped.push(f.replace(/^reaction_|\.js$/g, ''));
});
ok(runGames >= 45, 'kit.run 的遊戲數 ' + runGames);
ok(oldGames >= 24, '舊式闖關遊戲數 ' + oldGames);
// 沒有「從前 5 關繼續」按鈕、但也是闖關制的幾款，自己接線
['spot', 'shapes'].forEach(id => { const src = fs.readFileSync(path.join(dir, 'reaction_' + id + '.js'), 'utf8'); ok(/kit\.entryLevel\(ID, 0\)/.test(src) && /entryNotice\(ID, level\)/.test(src) && /level: level/.test(src), id + '：進場用 entryLevel、結算交出 level'); });
['bounce', 'dualtask'].forEach(id => { const src = fs.readFileSync(path.join(dir, 'reaction_' + id + '.js'), 'utf8'); ok(/kit\.enter\(ID, round\)/.test(src) && /level: level/.test(src) && /function round\(startAt\)/.test(src), id + '：round(startAt)＋kit.enter＋結算交出 level'); });
{ const src = fs.readFileSync(path.join(dir, 'reaction_cups.js'), 'utf8'); ok(/kit\.enter\(ID, round\)/.test(src) && /level: level,/.test(src), 'cups：kit.enter＋結算交出 level'); }
const kit2 = fs.readFileSync(path.join(dir, 'reaction_kit2.js'), 'utf8');
ok(/kit\.entryLevel\(o\.id/.test(kit2) && /kit\.entryNotice\(o\.id/.test(kit2), 'kit.run 進場呼叫 entryLevel／entryNotice');
ok(/level: leveled/.test(kit2), 'kit.run 結算把關卡交給 kit.result');
ok(/o\.resume !== false && !o\.scoreOf/.test(kit2), 'resume:false、scoreOf 的遊戲不套用');

// ── 模擬一整個玩家的歷程 ──
reset(); Reaction.current = { id: 'sim' };
let from = kit.entryLevel('sim');
ok(from === 1, '第一次玩 → 第 1 關');
kit.result(root, { num: 1, level: 30 });                      // 打到第 30 關失敗
from = kit.entryLevel('sim');
ok(from === 26, '隔天再玩 → 第 26 關（使用者的例子：最佳第 30 關 → 第 26 關）');
kit.result(root, { num: 1, level: 27 });                      // 從 25 關開始，玩到 27 關失敗
ok(kit.levelBest('sim') === 30, '從第 26 關開始只到第 27 關，最佳仍是第 30 關');
kit.result(root, { num: 1, level: 33 });
ok(kit.entryLevel('sim') === 29, '破紀錄第 33 關 → 從第 29 關開始');
reset();

console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exit(bad ? 1 : 0);
