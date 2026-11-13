// 翻牌湊百（flipcent）、翻三湊百（flip3cent）的瀏覽器端驗證：全部用「真的滑鼠事件」翻牌。
//   ① 牌的張數、兩位數字放得進牌裡、整個方陣放得進遊戲區（第 1 關與第 30 關）
//   ② 翻對（兩張／三張加起來 100）：消掉、已消組數增加、全部消完過關進下一關
//   ③ 翻錯：數字露出（翻牌湊百約 1.5 秒、翻三湊百約 4.5 秒＝三倍）才蓋回；露出的時候不能再翻別張
//   ④ 次數用完：把剩下的牌翻開給你看、失敗
//   ⑤ 全程沒有 JS 錯誤
// 前置：本機伺服器已開（例如在專案根目錄執行  python -m http.server 8900 --bind 127.0.0.1）。
// 用法（在專案根目錄）：  FM_PORT=8900 node test/reaction/browser_flipsum.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let cdp, bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL', m); } };
const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v == null ? null : JSON.parse(v); };
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' ? 0 : 1, clickCount: 1 });
async function click(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await sleep(40); await mouse('mouseReleased', x, y); await sleep(60); }
const cardCenter = (P, i) => J('(function(){ var e = document.querySelectorAll(".' + P + '-card")[' + i + ']; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()');
async function tapCard(P, i) { const c = await cardCenter(P, i); await click(c.x, c.y); }
const info = () => J('(function(){ var z = Reaction.current.debug.api().info; return { n: z.n, deck: z.deck, perfect: z.perfect, limit: z.limit }; })()');
const st = () => J('Reaction.current.debug.api().state()');
const run = () => J('Reaction.current.debug.state()');
const infoText = (P) => J('document.querySelector(".' + P + '-info").textContent');
const tipText = (P) => J('document.querySelector(".' + P + '-tip").textContent');
async function goto(n) { await J('(Reaction.current.debug.goto(' + n + '), 1)'); await sleep(120); }
async function loadGame(id) {
  for (let i = 0; i < 4; i++) {                                // 本機 python 伺服器偶爾漏回 css／js：樣式沒載入就重開
    await openGame(cdp, id, { port: Number(process.env.FM_PORT) || 8900, root: ROOT });
    for (let k = 0; k < 40 && !(await J('!!document.querySelector(".' + id + '-board")')); k++) await sleep(100);
    if (await J('!!document.querySelector(".' + id + '-board") && getComputedStyle(document.querySelector(".' + id + '-board")).display === "grid"' + ' && getComputedStyle(document.documentElement).getPropertyValue("--c-ink").trim() !== ""')) break;
    console.log('（頁面沒載好，重開）'); await sleep(1000);
  }
  await J('(window.__errs = [], window.addEventListener("error", function (e) { window.__errs.push(e.message); }), 1)');
}
/* 版面：方陣放得進遊戲區、每張牌翻開的數字放得進牌裡 */
async function layout(P, tag) {
  const L = await J('(function(){ var s = document.querySelector(".rx-stage").getBoundingClientRect(), b = document.querySelector(".' + P + '-board").getBoundingClientRect(), t = document.querySelector(".' + P + '-tip").getBoundingClientRect(), cs = document.querySelectorAll(".' + P + '-card"); var w = cs[0].getBoundingClientRect(); return { stageB: s.bottom, boardB: b.bottom, tipB: t.bottom, boardR: b.right, stageR: s.right, boardL: b.left, stageL: s.left, cw: w.width, ch: w.height, n: cs.length, fs: parseFloat(getComputedStyle(cs[0]).fontSize) }; })()');
  ok(L.boardB <= L.stageB + 1 && L.boardR <= L.stageR + 1 && L.boardL >= L.stageL - 1, tag + '：方陣放得進遊戲區（底部 ' + Math.round(L.boardB) + '／' + Math.round(L.stageB) + '）');
  ok(L.tipB <= L.stageB + 30, tag + '：提示文字沒有掉出畫面（' + Math.round(L.tipB) + '／' + Math.round(L.stageB) + '）');
  // 兩位數字 99 放得進牌裡：量一個測試用的 span
  const fit = await J('(function(){ var c = document.querySelector(".' + P + '-card"), sp = document.createElement("span"); sp.textContent = "99"; sp.style.cssText = "position:absolute;visibility:hidden;font:inherit;font-weight:inherit;font-size:" + getComputedStyle(c).fontSize + ";"; c.appendChild(sp); var w = sp.getBoundingClientRect().width, cw = c.clientWidth; c.removeChild(sp); return { w: w, cw: cw }; })()');
  ok(fit.w <= fit.cw - 4, tag + '：兩位數字「99」放得進牌裡（字寬 ' + fit.w.toFixed(1) + '／牌 ' + fit.cw + '）');
  return L;
}
/* 把這一關找一組湊成 100 的牌（位置編號），不在 gone 裡 */
function groupOf(deck, gone, k) {
  const idx = deck.map((_, i) => i).filter(i => !gone.has(i));
  for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
    if (k === 2) { if (deck[idx[a]] + deck[idx[b]] === 100) return [idx[a], idx[b]]; continue; }
    for (let c = b + 1; c < idx.length; c++) if (deck[idx[a]] + deck[idx[b]] + deck[idx[c]] === 100) return [idx[a], idx[b], idx[c]];
  }
  return null;
}

async function game(id, k, showMs) {
  const P = id;
  await loadGame(id);
  await goto(1);
  let z = await info();
  ok(z.n === 6 && (await J('document.querySelectorAll(".' + P + '-card").length')) === z.n, id + ' 第 1 關 ' + z.n + ' 張牌');
  await layout(P, id + ' 第 1 關');
  ok(/還能翻 \d+ 次/.test(await infoText(P)) && new RegExp(k === 2 ? '兩張' : '三張').test(await tipText(P)), id + '：上方「還能翻 N 次」、提示寫「翻' + (k === 2 ? '兩' : '三') + '張」');
  // ③ 翻錯：先翻不湊 100 的 k 張
  let bad1 = null;
  for (let a = 0; a < z.n && !bad1; a++) for (let b = a + 1; b < z.n && !bad1; b++) { if (k === 2) { if (z.deck[a] + z.deck[b] !== 100) bad1 = [a, b]; } else for (let c = b + 1; c < z.n && !bad1; c++) if (z.deck[a] + z.deck[b] + z.deck[c] !== 100) bad1 = [a, b, c]; }
  for (const i of bad1) await tapCard(P, i);
  const tFlip = Date.now();
  ok((await J('document.querySelectorAll(".' + P + '-card--up").length')) === k, id + '：翻開 ' + k + ' 張，數字露出來');
  ok((await J('[].slice.call(document.querySelectorAll(".' + P + '-card--up")).map(function (e) { return e.textContent; }).join()')) === bad1.map(i => z.deck[i]).join(), id + '：露出的數字就是牌的內容');
  ok(/不是 100/.test(await tipText(P)), id + '：提示寫「不是 100，記住位置」：' + (await tipText(P)));
  // 露出的時候再點別張：不能翻
  const other = [...Array(z.n).keys()].find(i => bad1.indexOf(i) < 0);
  await tapCard(P, other);
  ok((await J('document.querySelectorAll(".' + P + '-card--up").length')) === k, id + '：數字露出的時候不能再翻別張');
  ok((await infoText(P)).indexOf('還能翻 ' + (z.limit - 1) + ' 次') >= 0, id + '：翻了一次，還能翻 ' + (z.limit - 1) + ' 次');
  // 等它蓋回去，量露出了多久
  let t1 = 0; for (let w = 0; w < 200; w++) { if ((await J('document.querySelectorAll(".' + P + '-card--up").length')) === 0) { t1 = Date.now() - tFlip; break; } await sleep(50); }
  ok(t1 >= showMs - 300 && t1 <= showMs + 700, id + '：露出 ' + t1 + ' 毫秒才蓋回（應該約 ' + showMs + '）');
  // ② 翻對
  let gone = new Set(), grp = groupOf(z.deck, gone, k);
  for (const i of grp) await tapCard(P, i);
  ok(new RegExp(grp.map(i => z.deck[i]).join(' \\+ ') + ' = 100').test(await tipText(P)), id + '：提示寫「' + grp.map(i => z.deck[i]).join(' + ') + ' = 100」');
  await sleep(900);
  ok((await J('document.querySelectorAll(".' + P + '-card--gone").length')) === k, id + '：翻對的 ' + k + ' 張消掉了');
  ok(/已消 1\/\d+/.test(await infoText(P)), id + '：已消 1 組：' + (await infoText(P)));
  grp.forEach(i => gone.add(i));
  // 把剩下的全部翻對 → 過關進第 2 關
  while (gone.size < z.n) { const g = groupOf(z.deck, gone, k); for (const i of g) await tapCard(P, i); await sleep(900); g.forEach(i => gone.add(i)); }
  await sleep(300);
  ok((await run()).cleared >= 1 || /全部消完/.test(await tipText(P)), id + '：全部消完 → 過關');
  await sleep(1600);
  ok((await run()).level === 2, id + '：進了第 2 關');
  // 第 30 關：最大張數的版面
  await goto(30); z = await info();
  { const want = await J('Reaction.list().filter(function (g) { return g.id === "' + id + '"; })[0].test.cardsFor(30)'); ok(z.n === want, id + ' 第 30 關 ' + z.n + ' 張（使用者調過張數，目前應該是 ' + want + '）'); }
  await layout(P, id + ' 第 30 關');
  // ④ 次數用完：用 api.wrong 一直翻錯
  await goto(1); z = await info();
  for (let t = 0; t < z.limit + 2; t++) {
    const s = await st(); if (s.over) break;
    await J('Reaction.current.debug.api().wrong()'); await sleep(showMs + 250);
  }
  await sleep(300);
  ok((await st()).over && /次數用完了/.test(await tipText(P)), id + '：次數用完 → 失敗，提示寫出完美記憶要幾次：' + (await tipText(P)));
  ok((await J('document.querySelectorAll(".' + P + '-card--reveal").length')) > 0, id + '：剩下的牌翻開給你看');
  // ⑤ 時間限制（V1.57.0 玩家意見）：第 1 關 1 分鐘；時間條會跑；把時間改成 2 秒，時間到 → 失敗、剩下的牌翻開、提示寫「時間到了」
  await goto(1);
  ok((await st()).timeMs === 60000, id + '：第 1 關的時間限制是 1 分鐘（' + (await st()).timeMs + ' 毫秒）');
  await sleep(600);
  { const w = await J('parseFloat(document.querySelector(".ld-time__fill").style.width)'); ok(w > 0 && w < 100, id + '：時間條在跑（剩 ' + w + '%）'); }
  await J('(function(){ var T = Reaction.list().filter(function (g) { return g.id === "' + id + '"; })[0].test; T.TIME_S[0] = 2; T.TIME_S[1] = 2; return 1; })()');
  await goto(1);
  ok((await st()).timeMs === 2000 && !(await st()).over, id + '：改成 2 秒之後，這一關限時 2000 毫秒、還沒結束');
  await sleep(2700);
  ok((await st()).over && /時間到了/.test(await tipText(P)), id + '：時間到 → 失敗，提示寫「時間到了」：' + (await tipText(P)));
  ok((await J('document.querySelectorAll(".' + P + '-card--reveal").length')) > 0 && (await J('Reaction.current.debug.api().over')), id + '：時間到之後，剩下的牌翻開給你看');
  ok((await J('window.__errs.length')) === 0, id + '：沒有 JS 錯誤 ' + JSON.stringify(await J('window.__errs')));
}

(async () => {
  cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
    await game('flipcent', 2, 1500);
    await game('flip3cent', 3, 4500);
  } finally { cdp.close(); }
  console.log(checks + ' checks');
  console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); try { cdp && cdp.close(); } catch (x) { } process.exit(1); });
