// 瀏覽器實測：接電線（wirelink，V1.57.3.2 改成題庫出題）。用無頭 Chrome 開真的遊戲，用「真的滑鼠事件」拖曳：
//   一、各個關卡（第 1、8、15、22、30 關）：題目來自題庫（9×9 也是）、照答案一條一條拖過去 → 全部接通、填滿 → 過關（進下一關）；
//   二、時間到（debug.wrong）：正確接法畫出來、結算有「時間到」。
// 用法：node test/reaction/browser_wirelink.mjs [埠號]   （先在專案根目錄開本機伺服器：python -m http.server 埠號）
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
const waitFor = async (expr, ms) => { for (let t = 0; t < (ms || 15000); t += 150) { if (await js(expr)) return true; await sleep(150); } return false; };
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
// 這一關的畫面資料：棋盤在視窗裡的位置、每格大小、題目（等兩次量到的位置一樣才算穩定）
const geom1 = () => js(`JSON.stringify((function () { var a = Reaction.current.debug.api(), b = document.querySelector('.wirelink-board'); if (!a || !a.info || !b) return null; var r = b.getBoundingClientRect(), q = a.info; return { level: a.level, left: r.left, top: r.top, size: r.width, w: q.w, h: q.h, k: q.k, fromBank: !!q.info.fromBank, tier: q.info.tier, guess: q.info.guess, solution: q.solution }; })())`).then(JSON.parse);
async function geom() { let prev = null; for (let i = 0; i < 40; i++) { const g = await geom1(); if (g && prev && g.left === prev.left && g.top === prev.top && g.size === prev.size) return g; prev = g; await sleep(200); } return prev; }
const centerOf = (g, k) => { const cell = g.size / g.w; return { x: g.left + ((k % g.w) + 0.5) * cell, y: g.top + (Math.floor(k / g.w) + 0.5) * cell }; };
async function drag(g, p) {
  const a = centerOf(g, p[0]); await mouse('mousePressed', a.x, a.y);
  for (let i = 1; i < p.length; i++) { const p0 = centerOf(g, p[i - 1]), p1 = centerOf(g, p[i]); await mouse('mouseMoved', (p0.x + p1.x) / 2, (p0.y + p1.y) / 2); await mouse('mouseMoved', p1.x, p1.y); }
  const e = centerOf(g, p[p.length - 1]); await mouse('mouseReleased', e.x, e.y);
}
async function gotoLevel(n) { await js('Reaction.current.debug.goto(' + n + '); 1'); await waitFor('(function () { var a = Reaction.current.debug.api(); return !!a && a.level === ' + n + ' && !!a.info && !a.over; })()'); await sleep(300); }

try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
  for (let tr = 0; tr < 3; tr++) { await openGame(cdp, 'wirelink', { root: ROOT }); if (await js('!!(window.Reaction && Reaction.current && Reaction.current.debug && window.FM_WIRELINK_BANK && FM_WIRELINK_BANK.length)')) break; }
  ok(await js('FM_WIRELINK_BANK.length === 11'), '題庫載入了（11 級）');
  for (const lv of [1, 8, 15, 22, 30]) {
    await gotoLevel(lv);
    const g = await geom();
    ok(g && g.fromBank, '第 ' + lv + ' 關：' + g.w + '×' + g.h + '、' + g.k + ' 色，題目來自題庫第 ' + g.tier + ' 級（要猜的路口 ' + g.guess + '）');
    ok(g.size / g.w >= 44, '第 ' + lv + ' 關：每格 ' + (g.size / g.w).toFixed(0) + 'px，好拖');
    for (const p of g.solution) await drag(g, p);
    const st = await js(`JSON.stringify((function () { var b = document.querySelector('.wirelink-board'); return { lit: b.classList.contains('wirelink-board--lit'), tip: document.querySelector('.wirelink-tip').textContent }; })())`).then(JSON.parse);
    ok(st.lit, '第 ' + lv + ' 關：用滑鼠照答案拖完 → 全部接好、整塊板子亮燈（' + st.tip + '）');
    ok(await waitFor('Reaction.current.debug.state().level === ' + (lv + 1)), '第 ' + lv + ' 關：過關後進下一關');
  }
  await gotoLevel(20);
  await js('Reaction.current.debug.wrong(); 1'); await sleep(700);
  ok(await js('!!document.querySelector(".wirelink-board--reveal")') && await js('document.querySelectorAll(".wirelink-sol").length') >= 7, '時間到：正確接法畫出來');
  ok(await waitFor('!!document.querySelector(".dlg--result")', 12000), '時間到之後跳出結算');
  const card = await js('JSON.stringify([].map.call(document.querySelectorAll(".dlg--result .rx-result__line"), function (e) { return e.textContent; }))').then(JSON.parse);
  ok(card.join('｜').indexOf('時間到') >= 0, '結算說明：' + card.join('｜'));
} finally { cdp.close(); }
console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS（' + total + ' 項檢查）');
process.exit(bad ? 1 : 0);
