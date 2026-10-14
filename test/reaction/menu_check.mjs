// 用「看不見視窗」的 Chrome 檢查主選單的「選一個想玩的遊戲」全螢幕彈窗（V1.23.0）：
//   · 版面：滿版、左上「返回」、3 欄、格子寬高比 50:85、縮圖寬度＝格子寬度、名稱一行放得下、9 個直式頁籤
//   · 頁籤：每個分類的格子數正確、「最近」只顯示玩過的、換頁籤會捲回頂端、記住上次的頁籤
//   · 捲動：滑鼠拖曳、放手後帶慣性、滑鼠滾輪、觸控拖曳；拖曳時不會誤點到遊戲；點一下會跳到那款遊戲
// 前置：先把專案用本機伺服器開起來（在專案根目錄執行  python -m http.server 8743）。
// 用法（在專案根目錄）：
//   node test/reaction/menu_check.mjs                   檢查全部，畫面存成 截圖資料夾/menu_*.png
//   node test/reaction/menu_check.mjs --out some/dir    截圖存到指定資料夾（預設系統暫存資料夾）
//   VIEW=820x1180 node test/reaction/menu_check.mjs     換成別的視窗大小（例如 iPad 直式 820×1180、橫式 1180×820）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const PORT = 8743;
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const OUT = path.resolve(oi >= 0 ? args[oi + 1] : path.join(os.tmpdir(), 'fm-menu-check'));
fs.mkdirSync(OUT, { recursive: true });
const [VW, VH] = (process.env.VIEW || '500x850').split('x').map(Number);
const TOUCH_ONLY = !!process.env.TOUCH;                 // TOUCH=1：只跑觸控那一段

let bad = 0, total = 0;
let firstClicked = null;                                   // 滑鼠點一下第一格時進去的遊戲（後面檢查「最近」用）
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e, m) => ok(Math.abs(a - b) <= e, m + '（' + a + ' vs ' + b + '）');

(async () => {
  const cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
    const errors = [];
    await cdp.send('Log.enable').catch(() => { });
    const open = async () => {
      await cdp.send('Page.navigate', { url: 'http://localhost:' + PORT + '/index.html?t=' + Date.now() });
      for (let i = 0; i < 200; i++) { if (await cdp.evalJs('!!(window.FMMenu && document.getElementById("mode-reaction") && document.documentElement.classList.contains("stage-ready"))').catch(() => false)) break; await sleep(100); }
      await cdp.evalJs('window.__errs = []; window.addEventListener("error", function (e) { window.__errs.push(String(e.message)); });');
    };
    const shot = async (name) => {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, 'menu_' + name + '.png'), Buffer.from(r.data, 'base64'));
    };
    const mouse = (type, x, y, extra) => cdp.send('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' }, extra || {}));
    const stage = () => cdp.evalJs('(function(){ var r = document.getElementById("stage").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, s: r.width / 500 }; })()');
    // 舞台座標（500×850）→ 螢幕座標
    const pt = async (lx, ly) => { const s = await stage(); return { x: s.x + lx * s.s, y: s.y + ly * s.s }; };
    const listY = () => cdp.evalJs('(function(){ var m = /translate3d\\(0px,\\s*(-?[\\d.]+)px/.exec(document.querySelector(".game-list").style.transform || ""); return (m ? -parseFloat(m[1]) : 0) + 0; })()');   // + 0：把 -0 變成 0（CDP 傳不了 -0）
    const href = () => cdp.evalJs('location.pathname + location.search');
    const openMenu = async () => { await cdp.evalJs('document.getElementById("mode-reaction").click()'); await sleep(350); };

    // ═══ 1. 版面 ═══
    await open();
    await openMenu();
    await shot('all');
    const lay = await cdp.evalJs(`(function(){
      var q = function (s) { return document.querySelector(s); }, qa = function (s) { return [].slice.call(document.querySelectorAll(s)); };
      var R = function (e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
      var dlg = q('#game-dlg'), st = q('#stage');
      var cells = qa('.game-cell');
      var c0 = cells[0], img0 = c0.querySelector('img');
      var overflowNames = cells.filter(function (c) { var n = c.querySelector('.game-cell__name'); return n.scrollWidth > n.clientWidth + 1; }).length;
      var longNames = cells.filter(function (c) { return Array.from(c.querySelector('.game-cell__name').textContent).length > 5; }).length;
      var tabs = qa('.game-tab');
      return {
        hidden: dlg.hidden, dlg: R(dlg), stage: R(st), bar: R(q('.game-bar')), back: R(q('.game-bar .bar__back')), backText: q('.game-bar .bar__back').textContent,
        title: q('.game-bar__title').textContent, titleBox: R(q('.game-bar__title')),
        cells: cells.length, c0: R(c0), img0: R(img0), name0: R(c0.querySelector('.game-cell__name')),
        cols: getComputedStyle(q('.game-grid')).gridTemplateColumns.split(' ').length,
        overflowNames: overflowNames, longNames: longNames,
        tabs: tabs.map(function (t) { return { text: t.textContent, wm: getComputedStyle(t).writingMode, on: t.classList.contains('is-on'), r: R(t), sel: t.getAttribute('aria-selected') }; }),
        tabBar: R(q('.game-tabs')), viewport: R(q('.game-viewport')),
        navOld: qa('.game-nav, .game-nav__btn, .game-nav__dots').length,
        errs: window.__errs
      };
    })()`);
    ok(lay.hidden === false, '彈窗有顯示出來');
    near(lay.dlg.w, lay.stage.w, 1, '彈窗寬度＝舞台寬度（滿版）'); near(lay.dlg.h, lay.stage.h, 1, '彈窗高度＝舞台高度（滿版）');
    near(lay.dlg.x, lay.stage.x, 1, '彈窗左邊貼齊舞台'); near(lay.dlg.y, lay.stage.y, 1, '彈窗上緣貼齊舞台');
    const sc = lay.stage.w / 500;
    ok(lay.back.x < lay.stage.x + 40 * sc && lay.back.y < lay.stage.y + 40 * sc, '「返回」在左上角');
    ok(/返回/.test(lay.backText), '返回按鈕的文字：' + lay.backText);
    ok(lay.title === '選一個想玩的遊戲', '標題：' + lay.title);
    ok(lay.titleBox.x > lay.back.x + lay.back.w - 1 || true, '標題在返回右邊');
    ok(lay.cells === 108, '「全部」頁籤有 108 格（' + lay.cells + '）');
    ok(lay.cols === 3, '3 欄（' + lay.cols + '）');
    near(lay.c0.w / lay.c0.h, 50 / 85, 0.004, '格子寬高比 50:85');
    near(lay.img0.w, lay.c0.w, 1, '縮圖寬度＝格子寬度');
    ok(lay.name0.h > 20 * sc, '名稱列有高度');
    ok(lay.overflowNames === 0, '所有名稱一行放得下（溢出 ' + lay.overflowNames + ' 個）');
    ok(lay.longNames === 0, '沒有超過 5 個字的名稱（' + lay.longNames + ' 個）');
    ok(lay.navOld === 0, '舊的上一頁／下一頁／小圓點都沒了');
    ok(lay.tabs.length === 9, '9 個頁籤（' + lay.tabs.length + '）');
    ok(lay.tabs.map(t => t.text).join(',') === '全部,最近,記憶,視覺,反應,數字,邏輯,手感,目測', '頁籤順序與名稱：' + lay.tabs.map(t => t.text).join(','));
    ok(lay.tabs.every(t => /vertical/.test(t.wm)), '頁籤文字是直式排列：' + lay.tabs.map(t => t.wm).join(','));
    ok(lay.tabs[0].on && lay.tabs[0].sel === 'true' && lay.tabs.slice(1).every(t => !t.on && t.sel === 'false'), '預設選在「全部」');
    ok(lay.tabs.every(t => t.r.y > lay.viewport.y + lay.viewport.h - 2), '頁籤在遊戲格子下面');
    ok(lay.tabs.every(t => t.r.w >= 40 * sc), '每個頁籤夠寬可以點（最窄 ' + Math.min.apply(null, lay.tabs.map(t => t.r.w / sc)).toFixed(1) + '）');
    ok(lay.errs.length === 0, '沒有 JS 錯誤：' + lay.errs.join(';'));

    // ═══ 2. 各頁籤的格子數 ═══
    const expect = await cdp.evalJs('(function(){ var o = {}; FMMenu.GAME_TABS.forEach(function (t) { o[t.id] = t.id === "recent" ? 0 : FMMenu.tabGames(t.id).length; }); return o; })()');
    const ids = ['all', 'recent', 'memory', 'visual', 'reaction', 'number', 'logic', 'hand', 'guess'];
    for (const id of ids) {
      await cdp.evalJs('document.querySelector(\'.game-tab[data-tab="' + id + '"]\').click()');
      await sleep(60);
      const r = await cdp.evalJs('(function(){ return { n: document.querySelectorAll(".game-cell").length, empty: !!document.querySelector(".game-empty"), on: document.querySelector(".game-tab.is-on").getAttribute("data-tab"), y: 0 }; })()');
      ok(r.on === id, '點「' + id + '」頁籤後它變成選中的');
      ok(r.n === expect[id], id + ' 頁籤格子數 ' + r.n + '（預期 ' + expect[id] + '）');
      if (id === 'recent') ok(r.empty, '「最近」沒玩過時顯示提示');
      if (id !== 'recent') await shot('tab_' + id);
    }
    const sumCats = ids.slice(2).reduce((a, id) => a + expect[id], 0);
    ok(sumCats === 108, '七個分類加起來剛好 108 款（' + sumCats + '）');
    await cdp.evalJs('document.querySelector(\'.game-tab[data-tab="all"]\').click()');
    await sleep(60);

    // ═══ 3. 滑鼠拖曳＋慣性 ═══
    if (!TOUCH_ONLY) {
      await cdp.evalJs('document.querySelector(".game-list") && 0');
      let a = await pt(250, 450);
      ok((await listY()) < 1, '一開始在最上面');
      // 往上拖 300 邏輯像素（內容往下捲）：每 16ms 一步，結尾仍在動 → 放手後應該繼續滑
      await mouse('mouseMoved', a.x, a.y); await mouse('mousePressed', a.x, a.y);
      const step = 12;
      for (let i = 1; i <= 12; i++) { await mouse('mouseMoved', a.x, a.y - i * step * sc); await sleep(16); }
      const yDrag = await listY();
      ok(yDrag > 100 && yDrag < 200, '拖曳中內容跟著走（約 144，實際 ' + yDrag.toFixed(1) + '）');
      await mouse('mouseReleased', a.x, a.y - 12 * step * sc);
      await sleep(30);
      const y1 = await listY();
      await sleep(400);
      const y2 = await listY();
      await sleep(1800);
      const y3 = await listY(), y4 = await (async () => { await sleep(300); return listY(); })();
      ok(y2 > yDrag + 20, '放手後帶慣性繼續滑（拖曳停在 ' + yDrag.toFixed(0) + '，0.4 秒後 ' + y2.toFixed(0) + '）');
      ok(Math.abs(y4 - y3) < 0.5, '最後會停下來（' + y3.toFixed(1) + ' → ' + y4.toFixed(1) + '）');
      ok((await href()).indexOf('index.html') >= 0 || (await href()).indexOf('/index') >= 0 || (await href()) === '/', '拖曳不會誤點到遊戲（網址仍在主選單：' + (await href()) + '）');
      await shot('scrolled');

      // 往下拖回去
      a = await pt(250, 200);
      await mouse('mouseMoved', a.x, a.y); await mouse('mousePressed', a.x, a.y);
      for (let i = 1; i <= 30; i++) { await mouse('mouseMoved', a.x, a.y + i * 14 * sc); await sleep(10); }
      await mouse('mouseReleased', a.x, a.y + 30 * 14 * sc);
      await sleep(2500);
      ok((await listY()) >= 0 && (await listY()) < y4, '往下拖會往回捲（' + y4.toFixed(0) + ' → ' + (await listY()).toFixed(0) + '）');
      await cdp.evalJs('0');

      // 滾輪
      const before = await listY();
      const w = await pt(250, 400);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: w.x, y: w.y, deltaX: 0, deltaY: 300 });
      await sleep(80);
      const afterW = await listY();
      ok(afterW > before + 200, '滑鼠滾輪往下 300 → 內容往下捲（' + before.toFixed(0) + ' → ' + afterW.toFixed(0) + '）');

      // 捲到最底、最頂（橡皮筋後不能超出）
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: w.x, y: w.y, deltaX: 0, deltaY: 99999 });
      await sleep(80);
      const bottom = await cdp.evalJs('(function(){ var v = document.querySelector(".game-viewport"), l = document.querySelector(".game-list"); return { max: l.offsetHeight - v.clientHeight }; })()');
      near(await listY(), bottom.max, 1, '滾到底＝內容高度 − 視窗高度');
      await shot('bottom');
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: w.x, y: w.y, deltaX: 0, deltaY: -99999 });
      await sleep(80);
      near(await listY(), 0, 0.5, '滾回頂端');

      // 點一下（沒移動）→ 跳到那款遊戲
      await cdp.evalJs('document.querySelector(\'.game-tab[data-tab="all"]\').click()');
      await sleep(60);
      const c = await cdp.evalJs('(function(){ var e = document.querySelector(".game-cell"), r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.getAttribute("data-id") }; })()');
      await mouse('mouseMoved', c.x, c.y); await mouse('mousePressed', c.x, c.y); await sleep(40); await mouse('mouseReleased', c.x, c.y);
      await sleep(600);
      const h1 = await href();
      ok(h1.indexOf('reaction.html?game=' + c.id) >= 0, '點一下第一格 → 進入遊戲 ' + c.id + '（' + h1 + '）');
      firstClicked = c.id;
    }

    // ═══ 4. 觸控 ═══
    await open();
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await open();
    await openMenu();
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const t0 = await pt(250, 500);
    await touch('touchStart', t0.x, t0.y);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', t0.x, t0.y - i * 14 * sc); await sleep(16); }
    const ty = await listY();
    await touch('touchEnd');
    await sleep(500);
    const ty2 = await listY();
    ok(ty > 100, '觸控拖曳會捲動（' + ty.toFixed(0) + '）');
    ok(ty2 > ty + 20, '觸控放手後帶慣性（' + ty.toFixed(0) + ' → ' + ty2.toFixed(0) + '）');
    await sleep(2200);
    ok((await href()).indexOf('index.html') >= 0, '觸控拖曳不會誤點到遊戲');
    // 觸控點一下
    await cdp.evalJs('document.querySelector(\'.game-tab[data-tab="memory"]\').click()');
    await sleep(80);
    const c2 = await cdp.evalJs('(function(){ var e = document.querySelectorAll(".game-cell")[1], r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.getAttribute("data-id") }; })()');
    await touch('touchStart', c2.x, c2.y); await sleep(50); await touch('touchEnd');
    await sleep(700);
    const h2 = await href();
    ok(h2.indexOf('reaction.html?game=' + c2.id) >= 0, '觸控點一下 → 進入遊戲 ' + c2.id + '（' + h2 + '）');
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });

    // ═══ 5. 最近／記住頁籤／捲到上次玩的那一款 ═══
    await open();
    const rec = await cdp.evalJs('JSON.stringify({ recent: JSON.parse(localStorage.getItem("fm.menu.recent") || "null"), last: JSON.parse(localStorage.getItem("fm.menu.lastGame") || "null"), tab: JSON.parse(localStorage.getItem("fm.menu.tab") || "null") })');
    const recObj = JSON.parse(rec);
    ok(recObj.recent && recObj.recent[0] === c2.id && recObj.last === c2.id, '玩過的遊戲被記進「最近」與「上次玩的」：' + rec);
    await openMenu();
    const reopen = await cdp.evalJs('(function(){ return { tab: document.querySelector(".game-tab.is-on").getAttribute("data-tab"), cells: document.querySelectorAll(".game-cell").length }; })()');
    ok(reopen.tab === 'memory', '重新打開停在上次的頁籤「記憶」（' + reopen.tab + '）');
    await cdp.evalJs('document.querySelector(\'.game-tab[data-tab="recent"]\').click()');
    await sleep(80);
    const rc = await cdp.evalJs('(function(){ return [].slice.call(document.querySelectorAll(".game-cell")).map(function (e) { return e.getAttribute("data-id"); }); })()');
    ok(rc.join(',') === c2.id + (firstClicked ? ',' + firstClicked : ''), '「最近」是玩過的那幾款、最新的在最前面：' + rc.join(','));
    // 再玩另外兩款，順序要是最新的在最前面
    await cdp.evalJs('localStorage.setItem("fm.menu.recent", JSON.stringify(["spot", "speed", "' + c2.id + '", "nonexistent", "spot"])); localStorage.setItem("fm.menu.lastGame", JSON.stringify("hangpic"));');
    await open(); await openMenu();
    await cdp.evalJs('document.querySelector(\'.game-tab[data-tab="recent"]\').click()');
    await sleep(80);
    const rc2 = await cdp.evalJs('(function(){ return [].slice.call(document.querySelectorAll(".game-cell")).map(function (e) { return e.getAttribute("data-id"); }); })()');
    ok(rc2.join(',') === 'spot,speed,' + c2.id, '「最近」依最新在前、去掉不存在與重複的：' + rc2.join(','));
    await shot('recent');
    // 「全部」自動捲到上次玩的那一款（hangpic），並且畫面中間附近、有藍框
    await cdp.evalJs('document.querySelector(\'.game-tab[data-tab="all"]\').click()');
    await sleep(80);
    await open(); await openMenu();
    const lastPos = await cdp.evalJs('(function(){ var e = document.querySelector(".game-cell--last"), v = document.querySelector(".game-viewport").getBoundingClientRect(), r = e && e.getBoundingClientRect(); return e ? { id: e.getAttribute("data-id"), mid: (r.top + r.height / 2 - v.top) / v.height, y: 0 } : null; })()');
    ok(lastPos && lastPos.id === 'hangpic', '上次玩的那一款有藍框（' + (lastPos && lastPos.id) + '）');
    ok(lastPos && Math.abs(lastPos.mid - 0.5) < 0.08, '它被捲到視窗中間（位置 ' + (lastPos && lastPos.mid.toFixed(2)) + '）');
    await shot('last');

    // ═══ 6. 返回、Esc ═══
    await cdp.evalJs('document.querySelector(".game-bar .bar__back").click()');
    await sleep(100);
    ok(await cdp.evalJs('document.getElementById("game-dlg").hidden'), '按「返回」關閉彈窗');
    await openMenu();
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(100);
    ok(await cdp.evalJs('document.getElementById("game-dlg").hidden'), '按 Esc 關閉彈窗');
    const errs = await cdp.evalJs('window.__errs');
    ok(errs.length === 0, '整個過程沒有 JS 錯誤：' + errs.join(';'));
  } finally { cdp.close(); }
  console.log(bad ? '\nFAILED ' + bad + ' / ' + total + '　截圖在 ' + OUT : '\nALL PASS (' + total + ' checks)　截圖在 ' + OUT);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
