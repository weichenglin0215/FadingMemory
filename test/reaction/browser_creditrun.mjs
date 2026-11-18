// 瀏覽器實測：進場關卡優惠送的關卡，不算成績（V1.57.2.0 玩家意見）。用無頭 Chrome 開真的遊戲：
//   本機最佳關卡 21 → 進場從第 17 關開始（kit.run 的遊戲：反著滑 swipecopy；舊式：大家來找碴 spot）。
//   一、一關都沒通過、在第 17 關失敗（成績＝跳過的 16 關）：不記最佳、不送世界排行榜、結算卡片說明「還沒有通過新的關卡」
//   二、按「返回」（一關都沒通過）：直接離開、沒有記任何東西
//   三、真的通過第 17 關再失敗（成績 17）：照舊記成最佳、送排行榜
//   四、失敗後按「從第 12 關繼續」再失敗：還是不算；「從第 1 關重來」玩到 3 關：照常記（不被上一局的優惠誤擋）
// 用法：node test/reaction/browser_creditrun.mjs [埠號]   （先在專案根目錄開本機伺服器：python -m http.server 埠號）
import { connect, openGame, sleep } from './cdp.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..').replace(/\\/g, '/');
const PORT = process.argv[2] || '8743';
process.env.FM_PORT = PORT;
let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const cdp = await connect();
const js = (e) => cdp.evalJs(e);

// 開遊戲前先把本機最佳關卡寫好（本機伺服器同一個網址，localStorage 跟著走）
async function open(game, lv) {
  await cdp.send('Page.navigate', { url: 'http://localhost:' + PORT + '/reaction.html?game=' + game + '&t=' + Date.now() });
  await sleep(1500);
  await js(`localStorage.clear(); localStorage.setItem('fm.reaction.lvbest.${game}', '${lv}'); 1`);
  await openGame(cdp, game, { root: ROOT });
  await sleep(600);
  await js(`window.__subs = []; (function () { var o = Leaderboard.submit; Leaderboard.submit = function (g, s) { window.__subs.push(s); return o.apply(this, arguments); }; })(); 1`);
}
const store = (g) => js(`JSON.stringify({ best: localStorage.getItem('fm.reaction.best.${g}'), lv: localStorage.getItem('fm.reaction.lvbest.${g}') })`).then(JSON.parse);
const cardTexts = () => js(`JSON.stringify([].map.call(document.querySelectorAll('.dlg--result .rx-result__num, .dlg--result .rx-result__line, .dlg--result .hint'), function (e) { return e.textContent; }))`).then(JSON.parse);
const state = () => js('JSON.stringify(Reaction.current.debug.state())').then(JSON.parse);
const waitFor = async (expr, ms) => { for (let t = 0; t < (ms || 15000); t += 150) { if (await js(expr)) return true; await sleep(150); } return false; };   // 電腦忙的時候動畫慢，用等條件代替固定等待
const waitLevel = (n) => waitFor('(function(){ var a = Reaction.current.debug.api(); return !!a && a.level === ' + n + ' && !a.over; })()');   // 第 n 關的題目已經建好、可以作答
// 通過第 n 關：反覆呼叫 solve 直到真的過關（反著滑要等「看箭頭」的階段結束才能作答，太早呼叫沒效果）
const solveLevel = async (n) => { for (let i = 0; i < 60; i++) { await js('Reaction.current.debug.solve(); 1'); await sleep(150); if (await js('Reaction.current.debug.state().cleared >= ' + n)) return true; } return false; };
const waitCard = () => waitFor('!!document.querySelector(".dlg--result")');
const clickBtn = (t) => js(`(function(){ var b = [].slice.call(document.querySelectorAll('.dlg--result button')).filter(function (x) { return x.textContent.indexOf(${JSON.stringify(t)}) >= 0; })[0]; if (b) { b.click(); return 1; } return 0; })()`);

try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });

  // ═══ kit.run：反著滑 ═══
  await open('swipecopy', 21);
  let st = await state();
  ok(st.level === 17 && st.cleared === 16, '進場：從第 17 關開始（cleared 16）：' + JSON.stringify(st));
  // 二、一關都沒通過就按「返回」
  const back = await js('JSON.stringify({ onLeave: Reaction.onLeave ? Reaction.onLeave() : null, settle: Reaction.kit.settleOnLeave(document.body, Reaction.current) })').then(JSON.parse);
  ok(back.onLeave === false && back.settle === false, '一關都沒通過就按「返回」：直接離開（不結算）：' + JSON.stringify(back));
  ok((await store('swipecopy')).best === null, '返回：沒有記任何最佳成績');
  // 一、第 17 關失敗
  await js('Reaction.current.debug.wrong(); 1'); await waitCard(); await sleep(300);
  let s = await store('swipecopy'), subs = await js('JSON.stringify(window.__subs)').then(JSON.parse), card = await cardTexts();
  ok(s.best === null, '第 17 關失敗（成績 16）：不記最佳成績（本機最佳關卡 21、最佳成績沒有）：' + JSON.stringify(s));
  ok(subs.length === 0, '第 17 關失敗：不送世界排行榜：' + JSON.stringify(subs));
  ok(card.length >= 1 && /這次從第 17 關開始，還沒有通過新的關卡，不計入最佳紀錄/.test(card.join('｜')) && !/通過 16 關/.test(card.join('｜')) && !/新紀錄/.test(card.join('｜')), '結算卡片：說明「這次從第 17 關開始，還沒有通過新的關卡」，沒有「通過 16 關」「新紀錄」：' + card.join('｜'));
  ok(s.lv === '21', '最佳關卡仍是 21');
  // 四、從第 12 關繼續（21 - 5 的另一種：失敗關卡 17 − 5 ＝ 12）再失敗
  ok(await clickBtn('從第 12 關繼續') === 1, '有「從第 12 關繼續」按鈕');
  await waitLevel(12); st = await state();
  ok(st.level === 12 && st.cleared === 11, '從第 12 關繼續：cleared 11：' + JSON.stringify(st));
  await js('Reaction.current.debug.wrong(); 1'); await waitCard(); await sleep(300);
  s = await store('swipecopy');
  ok(s.best === null, '從第 12 關繼續、一關都沒通過就失敗（成績 11）：還是不記：' + JSON.stringify(s));
  // 「從第 1 關重來」：沒有優惠；通過 3 關再失敗 → 成績 3，照常記
  ok(await clickBtn('從第 1 關重來') === 1, '有「從第 1 關重來」按鈕');
  await waitLevel(1); st = await state();
  ok(st.level === 1 && st.cleared === 0, '從第 1 關重來：cleared 0：' + JSON.stringify(st));
  for (let i = 1; i <= 3; i++) { ok(await solveLevel(i), '從第 1 關重來：通過第 ' + i + ' 關'); await waitLevel(i + 1); }
  await js('Reaction.current.debug.wrong(); 1'); await waitCard(); await sleep(300);
  s = await store('swipecopy'); subs = await js('JSON.stringify(window.__subs)').then(JSON.parse);
  ok(s.best === '3', '從第 1 關重來、通過 3 關才失敗（成績 3）：照常記成最佳（沒有被上一局的優惠誤擋）：' + JSON.stringify(s));
  ok(subs.length === 1 && subs[0] === 3, '這一局照常送排行榜（3）：' + JSON.stringify(subs));

  // 三、重新開：真的通過第 17 關（成績 17）再失敗
  await open('swipecopy', 21);
  await waitLevel(17); ok(await solveLevel(17), '真的通過第 17 關'); await waitLevel(18);
  st = await state();
  ok(st.level === 18 && st.cleared === 17, '通過第 17 關 → 第 18 關（cleared 17）：' + JSON.stringify(st));
  await js('Reaction.current.debug.wrong(); 1'); await waitCard(); await sleep(300);
  s = await store('swipecopy'); subs = await js('JSON.stringify(window.__subs)').then(JSON.parse); card = await cardTexts();
  ok(s.best === '17', '真的通過第 17 關再失敗（成績 17）：照舊記成最佳：' + JSON.stringify(s));
  ok(subs.length === 1 && subs[0] === 17 && /17 關/.test(card.join('｜')) && !/還沒有通過新的關卡/.test(card.join('｜')), '照舊送排行榜（17），結算卡片照舊：' + card.join('｜') + ' ／ ' + JSON.stringify(subs));

  // ═══ 舊式遊戲（成績＝撐到第幾關）：大家來找碴 ═══
  let spotDone = false;
  for (let attempt = 0; attempt < 8 && !spotDone; attempt++) {
    await open('spot', 21);
    const head = await js('(document.querySelector(".hint") || {}).textContent');
    ok(/第 17 關/.test(head), '大家來找碴：從第 17 關開始：' + head);
    // 「返回」：舊式遊戲用 Reaction.leaveScore（已完成到第幾關 ＝ 第 17 關 − 1 ＝ 16）——玩家一關都沒答就按返回，16 是優惠送的、不能被記成最佳
    const spotBack = await js('JSON.stringify({ score: Reaction.leaveScore && Reaction.leaveScore(), settle: Reaction.kit.settleOnLeave(document.body, Reaction.current) })').then(JSON.parse);
    ok(spotBack.score === 16 && spotBack.settle === false && (await store('spot')).best === null, '大家來找碴：一關都沒答就按「返回」（leaveScore 回報 16）：不記最佳、直接離開：' + JSON.stringify(spotBack));
    // 點第 1 格：答錯（15/16）就結算；碰巧答對（1/16）就重開一次
    await js('(function(){ var t = document.querySelector(".spot-tile:not([disabled])"); if (t) t.click(); return 1; })()');
    await sleep(1500);
    if (!(await js('!!document.querySelector(".dlg--result")'))) continue;
    spotDone = true;
    const s2 = await store('spot'), subs2 = await js('JSON.stringify(window.__subs)').then(JSON.parse), card2 = await cardTexts();
    ok(s2.best === null && subs2.length === 0, '大家來找碴：第 17 關失敗（成績 17＝優惠送的）：不記最佳、不送排行榜：' + JSON.stringify(s2) + JSON.stringify(subs2));
    ok(/還沒有通過新的關卡/.test(card2.join('｜')), '大家來找碴：結算卡片說明「還沒有通過新的關卡」：' + card2.join('｜'));
  }
  ok(spotDone, '大家來找碴：8 次裡至少有一次第一格就答錯（機率 1 − (1/16)^8）');
} finally { cdp.close(); }
console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS（' + total + ' 項檢查）');
process.exit(bad ? 1 : 0);
