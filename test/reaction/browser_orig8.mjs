// 「原創篇」7 款（時刻表補字、撲滿有多少、保存期限、水果進出貨、疊箱子、形色不相鄰、抱著量體重；「按鍵搶三十」V1.43.1 已刪除）的瀏覽器端驗證。
// 每款：①用真的滑鼠事件操作（點格子、點數字鍵、點 −／＋、點標記鈕、點清單再點格子、點計算機的鍵…，驗證按鈕有接對）；
//       ②用各遊戲的 G.debug 走完「解開」；③判定型的遊戲故意答錯，確認會結算；自由解題的遊戲按「返回」確認會先結算、再按才離開；
//       ④全程沒有 JS 錯誤。
// 前置：本機伺服器已開（例如在專案根目錄執行  python -m http.server 8743）。
// 用法（在專案根目錄）：  node test/reaction/browser_orig8.mjs                 全部
//                         node test/reaction/browser_orig8.mjs expiry babyscale  指定幾款
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const FREE = ['timetable'];
const FAIL_TYPE = ['piggybank', 'expiry', 'fruitstock', 'boxstack', 'shapegrid', 'babyscale'];
const TIMED = ['expiry', 'fruitstock', 'boxstack', 'shapegrid', 'babyscale'];      /* V1.43.1：限時答題，超過時間就失敗 */
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
/* 共用數字鍵盤：7 8 9 ／ 4 5 6 ／ 1 2 3 ／ 清除 0 ⌫ */
const PAD = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'clr', '0', 'del'];
async function typeDigits(s) { for (const ch of s) await clickEl('.numpad-key', PAD.indexOf(ch)); await sleep(80); }
/* 舞台裡的東西有沒有跑出畫面（版面放得下） */
const overflow = () => J('(function(){ var s = document.querySelector(".rx-stage").getBoundingClientRect(), out = []; document.querySelectorAll(".rx-stage *").forEach(function (e) { var r = e.getBoundingClientRect(); if (r.width && (r.bottom > s.bottom + 1 || r.right > s.right + 1 || r.left < s.left - 1)) out.push(e.className && e.className.baseVal == null ? e.className : "svg"); }); return out.slice(0, 5); })()');
async function failRound(id, goLevel) {
  await J('(Reaction.current.debug.goto(' + goLevel + '), 1)'); await sleep(500);
  ok((await overflow()).length === 0, id + '：第 ' + goLevel + ' 關版面放得下 ' + JSON.stringify(await overflow()));
  await api('(a.wrong(), 1)');
  await waitFor(resultShown, 12000, id + ' 答錯後結算');
}

const T = {
  async timetable(id) {
    const pz = await api('a.info'), k = pz.shown.findIndex((v, i) => !v && !pz.skip[i]);
    await clickEl('.timetable-cell', k);
    ok((await api('a.state().sel')) === k, id + '：點糊掉的格子有選到');
    const m = pz.times[k], s = String(Math.floor(m / 60) * 100 + m % 60);
    await typeDigits(s.length === 3 ? s : s);
    ok((await api('a.state().answers[' + k + ']')) === m, id + '：用數字鍵填進 ' + s);
    await clickEl('.timetable-tool', 1); await sleep(100);                  /* 檢查 */
    ok(!(await state()).over, id + '：按檢查不會結束');
    await clickEl('.timetable-tool', 0); await sleep(150);                  /* 提示 */
    ok((await api('a.state().hintsLeft')) === 2, id + '：提示用掉一次');
    await J('(Reaction.current.debug.goto(30), 1)'); await sleep(500);
    ok((await overflow()).length === 0, id + '：第 30 關（7 站 × 6 班）版面放得下 ' + JSON.stringify(await overflow()));
    await api('(a.solve(), 1)');
    await waitFor(async () => (await state()).cleared >= 1, 4000, id + ' 解開');
  },
  async piggybank(id) {
    const r0 = await api('a.state().cs[0]');
    await clickEl('.piggybank-step', 1); await sleep(80);                  /* 第一種的「＋」 */
    ok((await api('a.state().cs[0]')) !== r0, id + '：按「＋」枚數會變');
    await api('(a.solve(), 1)');
    await waitFor(async () => (await state()).cleared === 1, 4000, id + ' 打開撲滿過關');
    await failRound(id, 25);
  },
  async expiry(id) {
    ok((await J('[].map.call(document.querySelectorAll(".expiry-btn"), function (b) { return b.textContent; }).join()')) === '已過期,未過期', id + '：最下面左「已過期」右「未過期」');
    const exp = await api('a.info.items[0].expired');
    await clickEl('.expiry-btn', exp ? 0 : 1);
    await waitFor(async () => (await state()).cleared === 1, 4000, id + ' 按對過關');
    const due = await J('document.querySelector(".expiry-due__t").textContent');
    ok(/^到期 /.test(due), id + '：審判後亮出到期日：' + due);
    const col = await J('getComputedStyle(document.querySelector(".expiry-due__t")).color');
    ok(exp ? /rgb\(2\d\d, \d{1,2}, \d{1,2}\)/.test(col) : /rgb\(\d+, 1[2-9]\d/.test(col), id + '：到期日顏色（過期紅、沒過期綠）' + col);
    const sp = await J('(function(){ var s = document.querySelector(".expiry-stamp--on"); if (!s) return null; var a = s.getBoundingClientRect(), b = document.querySelector(".expiry-due__t").getBoundingClientRect(); var t = document.createRange(); t.selectNodeContents(document.querySelector(".expiry-due__t")); var c = t.getBoundingClientRect(); return { overlap: !(a.right <= c.left + 1 || a.left >= c.right - 1 || a.bottom <= c.top || a.top >= c.bottom) }; })()');
    ok(exp ? (sp && sp.overlap === false) : sp === null, id + '：過期才蓋鋼印、而且不蓋住到期日 ' + JSON.stringify(sp));
    const fs = await J('parseFloat(document.querySelector(".expiry-today__d").style.fontSize)');
    const wr = await J('(function(){ var d = document.querySelector(".expiry-today__d").getBoundingClientRect(), s = document.querySelector(".rx-stage").getBoundingClientRect(); return d.width / s.width; })()');
    ok(wr > 0.88, id + '：今天的日期佔滿寬度（' + wr.toFixed(2) + '）');
    await failRound(id, 30);
  },
  async fruitstock(id) {
    const ans = await api('a.info.answer'), asks = await api('a.info.asks'), a0 = asks[asks.length - 1];
    ok((await J('document.querySelectorAll(".fruitstock-input").length')) === asks.length, id + '：只有被問到的 ' + asks.length + ' 種水果有收攤的填空格');
    await clickEl('.fruitstock-input', asks.length - 1);
    ok((await api('a.state().sel')) === a0, id + '：點收攤的格子有選到');
    await typeDigits(String(ans[a0]));
    ok((await api('a.state().ans[' + a0 + ']')) === String(ans[a0]), id + '：用數字鍵填進 ' + ans[a0]);
    ok(/[^ -]/.test(await J('document.querySelector(".fruitstock-ev").textContent')), id + '：進出貨每一行有 emoji');
    await api('(a.solve(), 1)');
    await waitFor(async () => (await state()).cleared === 1, 4000, id + ' 對帳過關');
    await failRound(id, 30);
  },
  async boxstack(id) {
    const pz = await api('a.info'), k = pz.given.findIndex(v => !v), v = await J('+document.querySelectorAll(".boxstack-chip")[0].textContent');
    await clickEl('.boxstack-chip', 0); await clickEl('.boxstack-cell', k); await sleep(100);
    ok((await api('a.state().g[' + k + ']')) === v, id + '：點清單的重量、再點空格，放進去了');
    await clickEl('.boxstack-cell', k); await sleep(100);
    ok((await api('a.state().g[' + k + ']')) === 0, id + '：點自己放的箱子會拿回清單');
    await clickEl('.boxstack-tool', 0); await sleep(100);
    ok((await api('a.state().hintsLeft')) === 2, id + '：提示用掉一次');
    await J('(Reaction.current.debug.goto(25), 1)'); await sleep(800);
    ok((await overflow()).length === 0, id + '：第 25 關（4×5）版面放得下 ' + JSON.stringify(await overflow()));
    await api('(a.solve(), 1)');
    await waitFor(async () => (await state()).cleared >= 1, 4000, id + ' 解開');
  },
  async shapegrid(id) {
    const pz = await api('a.info'), k = pz.given.findIndex(v => v < 0);
    await clickEl('.shapegrid-chip', 0); await clickEl('.shapegrid-cell', k); await sleep(100);
    ok((await api('a.state().g[' + k + ']')) >= 0, id + '：點圖形、再點格子，放進去了');
    await api('(a.wrong(), 1)'); await sleep(100);
    ok(await J('!!document.querySelector(".shapegrid-cell--bad")') && /不能相鄰/.test(await J('document.querySelector(".shapegrid-tip").textContent')), id + '：違規的兩格變紅、寫出原因');
    await clickEl('.shapegrid-tool', 0); await sleep(300);
    ok((await api('a.state().hintsLeft')) === 2, id + '：提示用掉一次');
    await J('(Reaction.current.debug.goto(25), 1)'); await sleep(1200);
    ok((await overflow()).length === 0, id + '：第 25 關（5×5 含斜角）版面放得下 ' + JSON.stringify(await overflow()));
    await api('(a.solve(), 1)');
    await waitFor(async () => (await state()).cleared >= 1, 4000, id + ' 解開');
  },
  async babyscale(id) {
    const pz = await api('a.info'), w = String(pz.ws[pz.target]);
    await typeDigits(w);
    ok((await api('a.state().typed')) === w, id + '：用數字鍵填進 ' + w);
    await clickEl('.babyscale-ok', 0);
    await waitFor(async () => (await state()).cleared === 1, 4000, id + ' 按確定過關');
    await failRound(id, 30);
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
        ok((await overflow()).length === 0, id + '：第 1 關版面放得下 ' + JSON.stringify(await overflow()));
        await T[id](id);
        if (TIMED.includes(id)) {
          /* 限時：開局時間條在倒數（這一關有限時）；時間到了＝失敗（結算），不是不限時 */
          await openGame(cdp, id, { root: ROOT }); await sleep(600);
          ok(await J('(function(){ var b = document.querySelector(".rx-timebar"); return !!b && b.getBoundingClientRect().height > 0; })()'), id + '：有時間條');
          ok(!(await state()).over && !(await resultShown()), id + '：開局還沒結束');
          await api('(a.timeout(), 1)');
          await waitFor(resultShown, 12000, id + ' 時間到了之後結算（失敗）');
          ok((await state()).cleared === 0, id + '：時間到了＝失敗，沒有過關');
        }
        if (FREE.includes(id)) {
          const cleared = (await state()).cleared;
          await cdp.evalJs('document.getElementById("bar-back").click()'); await sleep(600);
          ok(await resultShown(), id + '：按返回會先結算（顯示結算卡片）');
          const num = await J('document.querySelector(".rx-result__num") && document.querySelector(".rx-result__num").textContent');
          ok(new RegExp('^' + cleared + ' 關$').test(num || ''), id + '：結算顯示解開 ' + cleared + '：' + num);
          ok(await J('Reaction.onLeave() === false'), id + '：結算後再按返回就會離開（onLeave 回傳 false）');
        }
        const errs = await J('window.__errs');
        ok(!errs || !errs.length, id + '：沒有 JS 錯誤 ' + JSON.stringify(errs));
      } catch (e) { ok(false, id + '：例外 ' + e.message); }
      console.log((bad === before ? 'OK   ' : 'FAIL ') + id.padEnd(11) + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');
    }
  } finally { cdp.close(); }
  console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
