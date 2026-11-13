// 玩到一半按「返回」（V1.57.0 玩家意見）的瀏覽器端驗證——用假的後端（test/leaderboard/fake_backend.js，榜是空的）：
//   ① 舊式闖關遊戲（倒背數字）：過一關、還沒結束就按「返回」→ 跳出結算卡片＋進榜的恭喜彈窗、成績送到排行榜、這次沒有離開；再按一次「返回」才離開
//   ② kit.run 的闖關遊戲（翻牌湊十）：過一關就按「返回」→ 同樣先結算
//   ③ 一關都還沒過就按「返回」→ 直接離開
//   ④ 進不了榜（把榜塞滿 30 個更強的）→ 個人最佳照樣記下、直接離開（不打斷、不送榜）
// 前置：本機伺服器已開（例如  python -m http.server 8900 --bind 127.0.0.1）。
// 用法（在專案根目錄）：  FM_PORT=8900 node test/reaction/browser_leaveback.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const PORT = Number(process.env.FM_PORT) || 8900;
let cdp, bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL', m); } };
const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v == null ? null : JSON.parse(v); };
const open = async (id, pre) => {
  for (let i = 0; i < 4; i++) {                                  // 本機 python 伺服器偶爾漏回 css／js：確認樣式有載入，沒有就重開
    await openGame(cdp, id, { port: PORT, root: ROOT });
    if (pre) await cdp.evalJs('(function(){ ' + pre + ' })()');
    if (await J('getComputedStyle(document.documentElement).getPropertyValue("--c-ink") !== ""')) break;
    console.log('（頁面沒載好，重開）'); await sleep(1000);
  }
};
// 只清掉這款的個人最佳（不能 localStorage.clear()：假後端剛登入的帳號也會被清掉，就變成要建帳號）
const CLEAR_BEST = 'Object.keys(localStorage).filter(function (k) { return k.indexOf("reaction.best.") >= 0 || k.indexOf("reaction.lvbest.") >= 0; }).forEach(function (k) { localStorage.removeItem(k); })';
const hasCard = () => J('!!document.querySelector(".dlg--result .rx-result__num")');
const href = () => cdp.evalJs('location.href').catch(() => 'NAVIGATED');
const clickBack = () => cdp.evalJs('document.getElementById("bar-back").click()');
const celebrating = () => J('!!document.querySelector(".lb-celebrate, .lb-cele, [class*=celebr]") || /名/.test(document.body.innerText) && !!document.querySelector(".dlg")');
const submitCalls = () => J('(window.__fake && window.__fake.calls || []).filter(function (c) { return c.name === "MF_submit_score"; }).map(function (c) { return c.body; })');

(async () => {
  cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });

    // ① 舊式：倒背數字
    await open('backnum', CLEAR_BEST);
    for (let k = 0; k < 80 && (await J('Reaction.current.debug.state().state')) !== 'input'; k++) await sleep(150);
    ok((await J('Reaction.current.debug.state().state')) === 'input', '① 倒背數字：出第一關了');
    for (let k = 0; k < 20 && (await J('Reaction.current.debug.state().state')) === 'input'; k++) { await J('Reaction.current.debug.tapNext()'); await sleep(40); }
    ok((await J('Reaction.current.debug.state().cleared')) >= 1, '① 過了一關（cleared ' + (await J('Reaction.current.debug.state().cleared')) + '）、遊戲還沒結束');
    ok(!(await hasCard()), '① 遊戲還沒結束：沒有結算卡片');
    ok(await J('Reaction.pendingBest && Reaction.pendingBest.val >= 1'), '① 刷新了個人最佳、還沒結算（pendingBest）');
    await clickBack(); await sleep(900);
    ok(/reaction\.html/.test(await href()), '① 按「返回」：沒有離開（先結算）');
    ok(await hasCard(), '① 跳出結算卡片');
    ok(await J('document.querySelector(".dlg--result .rx-result__label").textContent.indexOf("記下來") >= 0'), '① 卡片寫著成績已經記下來了');
    const calls = await submitCalls();
    ok(calls.length === 1 && calls[0].p_game_id === 'backnum' && calls[0].p_score >= 1, '① 成績送到排行榜：' + JSON.stringify(calls));
    ok(await J('document.querySelectorAll(".dlg").length >= 2'), '① 進榜的恭喜彈窗也跳出來了（結算卡片上面疊著恭喜）');
    ok(await J('Reaction.getBest("backnum") >= 1'), '① 個人最佳已記下');
    await clickBack(); await sleep(900);
    ok(/index\.html\?games=1/.test(await href()) || (await href()) === 'NAVIGATED', '① 再按一次「返回」：離開、回到選遊戲列表（' + (await href()) + '）');

    // ② kit.run：翻牌湊十
    await open('flipten', CLEAR_BEST);
    for (let k = 0; k < 60 && !(await J('Reaction.current.debug && Reaction.current.debug.api() && Reaction.current.debug.api().solve')); k++) await sleep(150);
    await J('Reaction.current.debug.api().pass({ gain: 0, delay: 60000 })');      // 直接宣告過了一關（過關之後 60 秒才換關，讓畫面停在這裡）
    await sleep(200);
    ok((await J('Reaction.current.debug.state().cleared')) >= 1 && !(await J('Reaction.current.debug.state().finished')), '② 翻牌湊十：過了一關、還沒結束');
    await clickBack(); await sleep(900);
    ok(/reaction\.html/.test(await href()) && await hasCard(), '② 按「返回」：先結算（結算卡片出現、沒有離開）');
    const c2 = await submitCalls();
    ok(c2.length === 1 && c2[0].p_game_id === 'flipten' && c2[0].p_score >= 1, '② 成績送到排行榜：' + JSON.stringify(c2));
    await clickBack(); await sleep(900);
    ok(/index\.html\?games=1/.test(await href()) || (await href()) === 'NAVIGATED', '② 再按一次「返回」：離開');

    // ③ 一關都還沒過
    await open('backnum', CLEAR_BEST);
    await sleep(600);
    await clickBack(); await sleep(900);
    ok(/index\.html\?games=1/.test(await href()) || (await href()) === 'NAVIGATED', '③ 一關都還沒過：按「返回」直接離開');

    // ④ 進不了榜：榜塞滿 30 個更強的
    await open('backnum', CLEAR_BEST + '; (function(){ var rows = []; for (var i = 0; i < 30; i++) rows.push({ rank: i + 1, nick: "強" + i, score: 90 - i }); Leaderboard.putBoard("backnum", { better: "max", limit: 30, top: rows }); })()');
    for (let k = 0; k < 80 && (await J('Reaction.current.debug.state().state')) !== 'input'; k++) await sleep(150);
    for (let k = 0; k < 20 && (await J('Reaction.current.debug.state().state')) === 'input'; k++) { await J('Reaction.current.debug.tapNext()'); await sleep(40); }
    ok((await J('Reaction.current.debug.state().cleared')) >= 1, '④ 過了一關');
    // 按「返回」做的第一件事就是 kit.settleOnLeave：先直接呼叫它，看個人最佳有沒有記下（離開頁面之後這支測試的假帳號會把本機最佳換成雲端的，讀不到）
    const r4 = await J('(function(){ var r = Reaction.kit.settleOnLeave(document.getElementById("screen"), Reaction.current); return [r, Reaction.getBest("backnum")]; })()');
    ok(r4[0] === false && r4[1] >= 1, '④ 進不了榜：不跳結算（回傳 false）、個人最佳已記下（' + r4[1] + '）');
    ok(!(await hasCard()) && (await submitCalls()).length === 0, '④ 沒有結算卡片、沒有送排行榜（進不了榜、不連網）');
    await clickBack(); await sleep(900);
    ok(/index\.html\?games=1/.test(await href()) || (await href()) === 'NAVIGATED', '④ 進不了榜：按「返回」直接離開（不打斷玩家）');
  } catch (e) { bad++; console.log('FAIL 例外', e && e.message || e); }
  console.log((bad ? bad + ' FAIL / ' : '') + checks + ' checks');
  console.log(bad ? 'SOME FAILED' : 'ALL PASS');
  try { cdp.close && cdp.close(); } catch (e) { }
  process.exit(bad ? 1 : 0);
})();
