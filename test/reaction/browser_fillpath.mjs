// 瀏覽器實測：一筆填滿（blockfill）、多色填滿（multifill）（V1.57.3.0）。用無頭 Chrome 開真的遊戲，用「真的滑鼠事件」拖曳：
//   一、各個難度級（第 1、8、16、24、30 關）：用解題器找出一個解，沿著格子中心一格一格拖過去 → 全部填滿 → 過關（進下一關）、終點出現星星；
//   二、收回與重來：往前拖 4 格、往回拖 2 格 → 路剩 3 格；按在起點 → 整條收回；「全部重來」鈕 → 全部收回；不能走進別條路、不能走空洞；
//   三、時間到（debug.wrong）：棋盤變淡、解題器的填法一條一條畫出來、終點標星星、結算有「時間到」。
// 用法：node test/reaction/browser_fillpath.mjs [埠號]   （先在專案根目錄開本機伺服器：python -m http.server 埠號）
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

// 這一關的畫面資料：棋盤在視窗裡的位置、每格大小、題目（格子、起點）
// 棋盤的位置：關卡剛換的時候畫面還在動，要等兩次量到的位置一樣才算穩定
async function geom() { let prev = null; for (let i = 0; i < 40; i++) { const g = await geom1(); if (g && prev && g.left === prev.left && g.top === prev.top && g.cell === prev.cell) return g; prev = g; await sleep(200); } return prev; }
const geom1 = () => js(`JSON.stringify((function () { var a = Reaction.current.debug.api(), f = a && a.fill; if (!f) return null; var r = f.board.getBoundingClientRect(), p = f.st.p; return { level: a.level, left: r.left, top: r.top, cell: f.cell, w: p.w, h: p.h, starts: p.starts, tiles: p.tiles, k: p.k, mask: Array.prototype.slice.call(p.mask) }; })())`).then(JSON.parse);
const stateOf = () => js(`JSON.stringify((function () { var a = Reaction.current.debug.api(), f = a.fill, st = f.st; return { filled: Reaction.fillPath.filled(st), solved: Reaction.fillPath.isSolved(st), lens: st.paths.map(function (p) { return p.length; }) }; })())`).then(JSON.parse);
const centerOf = (g, k) => ({ x: g.left + ((k % g.w) + 0.5) * g.cell, y: g.top + (Math.floor(k / g.w) + 0.5) * g.cell });
async function drag(g, path) {              // 沿著一串格子，用真的滑鼠拖過去（每格之間多一個中間點，像手指）
  const a = centerOf(g, path[0]); await mouse('mousePressed', a.x, a.y);
  for (let i = 1; i < path.length; i++) { const p0 = centerOf(g, path[i - 1]), p1 = centerOf(g, path[i]); await mouse('mouseMoved', (p0.x + p1.x) / 2, (p0.y + p1.y) / 2); await mouse('mouseMoved', p1.x, p1.y); }
  const e = centerOf(g, path[path.length - 1]); await mouse('mouseReleased', e.x, e.y);
}
const solutionOf = () => js(`JSON.stringify((function () { var f = Reaction.current.debug.api().fill, st = f.st, s = Reaction.fillPath.solve(st.g, st.p.starts, { limit: 1, budget: 5000000 }); return s.first; })())`).then(JSON.parse);
async function gotoLevel(n) { await js('Reaction.current.debug.goto(' + n + '); 1'); await waitFor('(function () { var a = Reaction.current.debug.api(); return !!a && a.level === ' + n + ' && !!a.fill && !a.over; })()'); await sleep(250); }

try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
  for (const game of ['blockfill', 'multifill']) {
    for (let tr = 0; tr < 3; tr++) { await openGame(cdp, game, { root: ROOT }); if (await js('!!(window.Reaction && Reaction.current && Reaction.current.debug)')) break; }
    // ═══ 一、各級用真的拖曳解開 ═══
    for (const lv of [1, 8, 16, 24, 30]) {
      await gotoLevel(lv);
      const g = await geom(), sol = await solutionOf();
      ok(g && sol && sol.length === g.k, game + ' 第 ' + lv + ' 關：' + g.w + '×' + g.h + '、' + g.tiles + ' 格、' + g.k + ' 條路；解題器找到解');
      ok(g.cell * g.w <= 480 && g.cell * g.h <= 640 && g.cell >= 40, game + ' 第 ' + lv + ' 關：棋盤放得進畫面（每格 ' + g.cell + 'px，' + g.w + '×' + g.h + '）、每格至少 40px 才好拖');
      for (const path of sol) await drag(g, path);
      const s = await stateOf();
      ok(s.solved && s.filled === g.tiles, game + ' 第 ' + lv + ' 關：用滑鼠拖完 → 全部填滿（' + s.filled + '／' + g.tiles + '）');
      const stars = await js('document.querySelectorAll(".fillpath-star").length');
      ok(stars === g.k && await js('!!document.querySelector(".fillpath-board--lit")'), game + ' 第 ' + lv + ' 關：過關：每條路的終點一顆星星（' + stars + '）、整塊板子發亮');
      ok(await waitFor('Reaction.current.debug.state().level === ' + (lv + 1)), game + ' 第 ' + lv + ' 關：過關後進下一關');
    }
    // ═══ 二、收回與重來 ═══
    await gotoLevel(12);
    let g = await geom(), sol = await solutionOf();
    const p0 = sol[0], s0 = p0[0];
    // 往前拖 4 格、再往回拖 2 格
    { const a = centerOf(g, p0[0]); await mouse('mousePressed', a.x, a.y);
      for (let i = 1; i <= 4; i++) { const c = centerOf(g, p0[i]); await mouse('mouseMoved', c.x, c.y); }
      let s = await stateOf(); ok(s.lens[0] === 5, game + '：往前拖 4 格 → 路有 5 格（含起點）：' + s.lens);
      for (let i = 3; i >= 2; i--) { const c = centerOf(g, p0[i]); await mouse('mouseMoved', c.x, c.y); }
      s = await stateOf(); ok(s.lens[0] === 3, game + '：往回拖 2 格 → 路剩 3 格：' + s.lens);
      const e = centerOf(g, p0[2]); await mouse('mouseReleased', e.x, e.y); }
    // 空洞不能走：找一個空洞，從路的最前端試著拖過去
    { const head = p0[2], voids = []; for (let k = 0; k < g.w * g.h; k++) if (!g.mask[k]) voids.push(k);
      const adjV = voids.find(v => Math.abs(Math.floor(v / g.w) - Math.floor(head / g.w)) + Math.abs(v % g.w - head % g.w) === 1);
      if (adjV != null) { const a = centerOf(g, head), b = centerOf(g, adjV); await mouse('mousePressed', a.x, a.y); await mouse('mouseMoved', b.x, b.y); await mouse('mouseReleased', b.x, b.y); const s = await stateOf(); ok(s.lens[0] === 3, game + '：空洞不能走（路還是 3 格）'); } }
    // 按在起點：整條收回
    { const a = centerOf(g, s0); await mouse('mousePressed', a.x, a.y); await mouse('mouseReleased', a.x, a.y); const s = await stateOf(); ok(s.lens[0] === 1, game + '：按在起點 → 整條收回：' + s.lens); }
    // 「全部重來」鈕
    { for (const path of sol) await drag(g, path.slice(0, 3));
      let s = await stateOf(); ok(s.filled > g.k, game + '：先鋪幾格（' + s.filled + '）');
      await js('document.querySelector(".fillpath-reset").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7 })); 1');
      s = await stateOf(); ok(s.filled === g.k && s.lens.every(l => l === 1), game + '：「全部重來」→ 全部收回、只剩起點（' + s.filled + '）'); }
    // ═══ 三、時間到 ═══
    await gotoLevel(20);
    g = await geom();
    await js('Reaction.current.debug.wrong(); 1'); await sleep(700);
    ok(await js('!!document.querySelector(".fillpath-board--reveal")') && await js('document.querySelectorAll(".fillpath-sol").length') === g.k, game + '：時間到：棋盤變淡、解題器的填法畫出來（' + g.k + ' 條）');
    ok(await js('document.querySelectorAll(".fillpath-star").length') === g.k, game + '：時間到：每條路的終點標星星');
    ok(/時間到/.test(await js('(document.querySelector(".fillpath-tip") || {}).textContent')), game + '：時間到的提示文字');
    ok(await waitFor('!!document.querySelector(".dlg--result")', 12000), game + '：時間到之後跳出結算');
    const card = await js('JSON.stringify([].map.call(document.querySelectorAll(".dlg--result .rx-result__line, .dlg--result .rx-result__num"), function (e) { return e.textContent; }))').then(JSON.parse);
    ok(card.join('｜').indexOf('時間到') >= 0, game + '：結算說明：' + card.join('｜'));
  }
} finally { cdp.close(); }
console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS（' + total + ' 項檢查）');
process.exit(bad ? 1 : 0);
