// 「深思篇」14 款（數獨4／6入門／6中階／9入門／9中階／9高階、夾心數獨、黑白不連三、刪數湊和、魔方陣、取火柴、搶十五、田忌賽馬、翻牌湊十）的瀏覽器端驗證。
// 每款：①用真的滑鼠事件操作（點格、點數字鍵、點火柴…，驗證按鈕有接對）；②用各遊戲的 G.debug 走完「解開」；
//       ③失敗型的遊戲（取火柴、搶十五、田忌賽馬、翻牌湊十）故意走錯，確認會結算；自由解題的遊戲按「返回」確認會先結算、再按才離開；
//       ④全程沒有 JS 錯誤。
// 前置：本機伺服器已開（例如在專案根目錄執行  python -m http.server 8743）。
// 用法（在專案根目錄）：  node test/reaction/browser_think.mjs            全部
//                         node test/reaction/browser_think.mjs nim takuzu   指定幾款
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const FREE = ['sudoku4', 'sudoku6e', 'sudoku6m', 'sudoku9e', 'sudoku9m', 'sudoku9h', 'sandwich', 'takuzu', 'sumdel', 'magicsq'];
const FAIL_TYPE = ['nim', 'fifteen', 'tianji', 'flipten'];
const ALL = FREE.concat(FAIL_TYPE);
const only = process.argv.slice(2);
const ids = only.length ? only : ALL;
let cdp, bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v == null ? null : JSON.parse(v); };
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' ? 0 : 1, clickCount: 1 });
async function click(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await sleep(40); await mouse('mouseReleased', x, y); }
const rect = (css, i) => J('(function(){ var e = document.querySelectorAll(' + JSON.stringify(css) + ')[' + (i || 0) + ']; if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()');
async function clickEl(css, i) { const r = await rect(css, i); if (!r) throw new Error('找不到 ' + css + '[' + (i || 0) + ']'); await click(r.x, r.y); await sleep(80); }
async function waitFor(fn, ms, what) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(120); } ok(false, '等不到：' + what); return false; }
const state = () => J('Reaction.current.debug.state()');
const api = (expr) => J('(function(){ var a = Reaction.current.debug.api(); return ' + expr + '; })()');
const resultShown = () => J('!!document.querySelector(".dlg--result")');

const T = {
  /* 數獨系列（含夾心數獨）：點格＋點數字 */
  async sudokuLike(id) {
    const n = await api('a.ctl.grid().length === 16 ? 4 : a.ctl.grid().length === 36 ? 6 : 9');
    // 真的滑鼠：點一個空格、點數字鍵 1、再點同一個數字鍵（取消）
    const empty = await api('a.ctl.grid().findIndex(function (v) { return v === 0; })');
    await clickEl('.sudokulib-cell', empty); await sleep(100);
    ok((await api('a.ctl.state().sel')) === empty, id + '：點格子有選到');
    await clickEl('.sudokulib-key', 0); await sleep(100);
    ok((await api('a.ctl.grid()[' + empty + ']')) === 1, id + '：點數字鍵 1 填進去');
    await clickEl('.sudokulib-key', 0); await sleep(100);
    ok((await api('a.ctl.grid()[' + empty + ']')) === 0, id + '：同一個數字再點一次＝擦掉');
    // 筆記
    await clickEl('.sudokulib-tool', 0); await clickEl('.sudokulib-key', 1); await sleep(100);
    ok(await J('document.querySelectorAll(".sudokulib-cell")[' + empty + '].querySelector(".sudokulib-notes").style.display === "grid"'), id + '：筆記模式寫了筆記');
    await clickEl('.sudokulib-tool', 0);
    // 提示
    await clickEl('.sudokulib-tool', 1); await sleep(150);
    const hs = await api('a.ctl.state()');
    ok(hs.hintCell >= 0 && hs.hintsLeft === 2, id + '：提示標出一格、剩 2 次：' + JSON.stringify(hs));
    // 填錯＋重複會標紅、但遊戲不會結束
    await api('(a.wrong(), 1)'); await sleep(100);
    ok(!(await state()).over && !(await resultShown()), id + '：填錯不會結束');
    // 解開 → 下一題
    await api('(a.solve(), 1)');
    await waitFor(async () => (await state()).cleared === 1, 4000, id + ' 解開第 1 題');
    await waitFor(async () => (await state()).level === 2 && (await api('a.ctl.grid().some(function (v) { return v === 0; })')), 4000, id + ' 換第 2 題');
    return true;
  },
  async takuzu(id) {
    await api('(Reaction.current.debug.goto(5), 1)').catch(() => { });
    await J('(Reaction.current.debug.goto(5), 1)'); await sleep(500);
    const sol = await api('a.info.solution'), givens = await api('a.info.givens'), n = await api('a.info.n');
    // 真的點：選「白」，點一個空格；再點一次同色＝清除
    const e = givens.indexOf(0);
    await clickEl('.takuzu-tool', 1); await clickEl('.takuzu-cell', e); await sleep(100);
    const placed = await api('a.state ? 1 : 0');
    // 故意放會違規的格子 → 彈出說明
    const v = await api('(a.wrong() ? 1 : 0)'); await sleep(200);
    ok(v === 1 && (await api('a.explainOpen()')), id + '：違規的一步會彈出說明');
    ok(await J('!!document.querySelector(".takuzu-svg")'), id + '：說明附圖（svg）');
    await clickEl('.dlg .btn'); await sleep(200);
    ok(!(await api('a.explainOpen()')) && !(await state()).over, id + '：關掉說明後可以繼續');
    await api('(a.solve(), 1)');
    await waitFor(async () => (await state()).cleared === 1, 4000, id + ' 解開');
    return true;
  },
  async sumdel(id) {
    const info = await api('a.info');
    const first = info.keep.findIndex(k => !k);        // 一個要刪的格子
    await clickEl('.sumdel-cell', first); await sleep(100);
    ok((await api('a.state().keep[' + first + ']')) === false, id + '：點數字＝刪掉');
    await clickEl('.sumdel-cell', first); await sleep(100);
    ok((await api('a.state().keep[' + first + ']')) === true, id + '：再點一次＝恢復');
    await clickEl('.sumdel-tool', 0); await sleep(100);
    ok((await api('a.state().hintsLeft')) === 2, id + '：提示用掉一次');
    await api('(a.solve(), 1)');
    await waitFor(async () => (await state()).cleared === 1, 4000, id + ' 解開');
    return true;
  },
  async magicsq(id) {
    const pz = await api('a.info'), e = pz.givens.indexOf(0), need = pz.solution[e];
    await clickEl('.magicsq-cell', e); await sleep(100);
    await clickEl('.magicsq-key', need - 1); await sleep(100);
    ok((await api('a.state().grid[' + e + ']')) === need, id + '：點格、點數字');
    ok(await J('document.querySelectorAll(".magicsq-key")[' + (need - 1) + '].disabled'), id + '：用過的數字鍵變灰');
    await api('(a.solve(), 1)');
    await waitFor(async () => (await state()).cleared === 1, 4000, id + ' 解開');
    return true;
  },
  async nim(id) {
    // 真的操作：點最右邊那根火柴，按「拿走」（不論對錯，只驗證有接對：這一步會拿走火柴，可能直接失敗）
    await J('(Reaction.current.debug.goto(5), 1)'); await sleep(400);
    const before = await api('a.state().piles');
    await clickEl('.nim-row:first-of-type .nim-match:not(.nim-match--gone):last-of-type');
    ok(await J('document.querySelectorAll(".nim-match--sel").length') >= 1, id + '：點火柴會選取');
    await clickEl('.nim-btn.btn--primary'); await sleep(300);
    const after = await api('a.state().piles');
    ok(after.reduce((a, b) => a + b, 0) < before.reduce((a, b) => a + b, 0), id + '：按拿走後火柴變少');
    await J('(Reaction.current.debug.goto(5), 1)'); await sleep(400);
    for (let i = 0; i < 12 && (await state()).cleared < 1; i++) { await api('(a.solve(), 1)'); await sleep(2200); }
    ok((await state()).cleared >= 1, id + '：一路走必勝步，贏了過關');
    await waitFor(async () => (await state()).level >= 6, 4000, id + ' 換下一關');
    await api('(a.wrong(), 1)');
    await waitFor(resultShown, 9000, id + ' 走錯後結算');
    return true;
  },
  async fifteen(id) {
    await J('(Reaction.current.debug.goto(8), 1)'); await sleep(400);
    const free = await api('Object.keys(document.querySelectorAll(".fifteen-card")).length');
    const c0 = await api('(function(){ var g = Reaction.current.debug.api().info; return g.A; })()');
    await clickEl('.fifteen-card:not(.fifteen-card--taken)', 0); await sleep(100);
    ok(await J('document.querySelectorAll(".fifteen-card--sel").length') === 1, id + '：點牌會選取');
    await J('(Reaction.current.debug.goto(8), 1)'); await sleep(400);
    for (let i = 0; i < 10 && (await state()).cleared < 1; i++) { await api('(a.solve(), 1)'); await sleep(2000); }
    ok((await state()).cleared >= 1, id + '：走好步贏了過關');
    await waitFor(async () => (await state()).level >= 9, 4000, id + ' 換下一關');
    // V1.43.1：開局各一張牌；走錯之後玩到最後——電腦先湊成＝結算；牌拿完是和局＝不算失敗，同一關重新出題
    ok(await api('Reaction.current.debug.info().A.toString(2).split("1").length - 1 === 1 && Reaction.current.debug.info().B.toString(2).split("1").length - 1 === 1'), id + '：開局你和電腦各一張牌');
    const lv = (await state()).level;
    let ended = false, drawn = 0;
    for (let i = 0; i < 8 && !ended; i++) {
      await api('(a.wrong(), 1)');
      await waitFor(async () => (await resultShown()) || (await J('!!document.querySelector(".rx-passnext")')), 28000, id + ' 走錯後（玩到最後一步）結算或和局');
      if (await resultShown()) { ended = true; break; }
      drawn++;
      const keep = await state();
      ok(keep.cleared === 1 && !keep.finished, id + '：和局不算失敗、不算過關');
      await clickEl('.rx-passnext .btn'); await sleep(500);
      ok((await state()).level === lv && !(await J('!!document.querySelector(".rx-passnext")')), id + '：和局後同一關重新出題');
    }
    ok(ended, id + '：走錯會被電腦贏、結算（和局 ' + drawn + ' 次）');
    return true;
  },
  async tianji(id) {
    await J('(Reaction.current.debug.goto(7), 1)'); await sleep(400);
    const arr0 = await api('a.state().arr');
    await clickEl('.tianji-horse--mine', 0); await clickEl('.tianji-horse--mine', 1); await sleep(150);
    const arr1 = await api('a.state().arr');
    ok(arr1[0] === arr0[1] && arr1[1] === arr0[0], id + '：點兩匹馬互換位置');
    await J('(Reaction.current.debug.goto(7), 1)'); await sleep(400);
    await api('(a.solve(), 1)');
    await waitFor(async () => (await state()).cleared >= 1, 9000, id + ' 排對了過關');
    await waitFor(async () => (await state()).level >= 8, 4000, id + ' 換下一關');
    await api('(a.wrong(), 1)');
    await waitFor(resultShown, 12000, id + ' 排錯後結算');
    return true;
  },
  async flipten(id) {
    await J('(Reaction.current.debug.goto(1), 1)'); await sleep(400);
    // 真的點兩張：翻開兩張牌，次數 −1
    const lim0 = await api('a.info.limit');
    await clickEl('.flipten-card', 0); await clickEl('.flipten-card', 1); await sleep(100);
    ok(await api('a.state().used') === 1, id + '：翻兩張算 1 次');
    await sleep(1800);
    for (let i = 0; i < 20 && (await state()).cleared < 1; i++) { await api('(a.solve(), 1)'); await sleep(900); }
    ok((await state()).cleared >= 1, id + '：把牌都消完過關');
    await waitFor(async () => (await state()).level >= 2, 4000, id + ' 換下一關');
    for (let i = 0; i < 60 && !(await resultShown()); i++) { await api('(a.wrong(), 1)'); await sleep(1750); }
    ok(await resultShown(), id + '：翻牌次數用完會結算');
    return true;
  }
};

(async () => {
  cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errs = []; window.addEventListener("error", function (e) { window.__errs.push(String(e.message)); });' });
    for (const id of ids) {
      const t0 = Date.now();
      await openGame(cdp, id, { root: ROOT });
      await sleep(300);
      const before = bad;
      try {
        if (/^sudoku/.test(id) || id === 'sandwich') await T.sudokuLike(id); else await T[id](id);
        // 自由解題：按「返回」＝結算；再按一次才離開
        if (FREE.includes(id)) {
          const cleared = (await state()).cleared;
          await cdp.evalJs('document.getElementById("bar-back").click()'); await sleep(600);
          ok(await resultShown(), id + '：按返回會先結算（顯示結算卡片）');
          const num = await J('document.querySelector(".rx-result__num") && document.querySelector(".rx-result__num").textContent');
          ok(new RegExp('^' + cleared + ' (題|關)$').test(num || ''), id + '：結算顯示解開 ' + cleared + '：' + num);
          ok(await J('Reaction.onLeave() === false'), id + '：結算後再按返回就會離開（onLeave 回傳 false）');
        }
        const errs = await J('window.__errs');
        ok(!errs || !errs.length, id + '：沒有 JS 錯誤 ' + JSON.stringify(errs));
      } catch (e) { ok(false, id + '：例外 ' + e.message); }
      console.log((bad === before ? 'OK   ' : 'FAIL ') + id.padEnd(10) + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');
    }
  } finally { cdp.close(); }
  console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
