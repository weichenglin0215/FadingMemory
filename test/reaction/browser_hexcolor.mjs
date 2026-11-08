// 六角著色（V1.50.0）的瀏覽器端驗證：全部用「真的滑鼠事件」（Chrome DevTools Protocol 的 Input.dispatchMouseEvent）操作。
//   ① 點顏色再點格子會塗上；點同一個顏色兩次＝取消選取；用完的顏色不能再塗
//   ② 長按格子（按住 0.65 秒再放開）跳出記號彈窗：寬度＝畫面 2/5、不蓋住被按的格子、在畫面裡面；放開時不會順便塗色
//      3 色時有 ?、X、3 種兩色組合；4 色時 ?、X、6 種兩色＋4 種三色；選了會畫在格子上；「清除記號」拿掉；點彈窗外面＝關掉
//   ③「收回」：收回自己塗的；預填的格子不能收回
//   ④ 相鄰同色會打 ✕；空格四周用到所有顏色會變暗紅底＋白色「！」
//   ⑤ 提示按鈕只在前 4 關；按了會替你塗一格
//   ⑥ 塗完答案就過關、進下一關；時間到會失敗、亮出答案、跳出結算卡片
//   ⑦ 第 30 關（75 格）版面放得下、出題時間；手機大小的視窗（390×844）再跑一次長按與點擊
//   ⑧ 全程沒有 JS 錯誤
// 前置：本機伺服器已開（例如在專案根目錄執行  python -m http.server 8900 --bind 127.0.0.1）。
// 用法（在專案根目錄）：  FM_PORT=8900 node test/reaction/browser_hexcolor.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let cdp, bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL', m); } };
const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v == null ? null : JSON.parse(v); };
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' ? 0 : 1, clickCount: 1 });
async function click(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await sleep(50); await mouse('mouseReleased', x, y); await sleep(80); }
async function longPress(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await sleep(650); await mouse('mouseReleased', x, y); await sleep(120); }
const rect = (css, i) => J('(function(){ var e = document.querySelectorAll(' + JSON.stringify(css) + ')[' + (i || 0) + ']; if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; })()');
const cellRect = i => rect('.hexcolor-cell[data-i="' + i + '"] .hexcolor-hex');
async function clickEl(css, i) { const r = await rect(css, i); if (!r) throw new Error('找不到 ' + css + '[' + (i || 0) + ']'); await click(r.x, r.y); }
const st = () => J('Reaction.current.debug.api().state()');
const info = () => J('(function(){ var z = Reaction.current.debug.api().info; return { k: z.k, n: z.n, counts: z.counts, given: Array.from(z.given), sol: Array.from(z.sol), nbrs: z.nbrs, unique: z.unique, cells: z.cells }; })()');
async function waitBuilt(ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { if (await J('!!(Reaction.current.debug.api() && Reaction.current.debug.api().state)')) return Date.now() - t0; await sleep(50); } ok(false, '等不到出題完成'); return -1; }
async function gotoLevel(n) { await J('(Reaction.current.debug.goto(' + n + '), 1)'); await sleep(30); return waitBuilt(); }
/* 選工具：目前不是它才點（再點一次同一個＝取消） */
async function pick(c) { const s = await st(); if (s.tool !== c) await clickEl('.hexcolor-palbtn', c); }
const overflow = () => J('(function(){ var s = document.querySelector(".rx-stage").getBoundingClientRect(), out = []; document.querySelectorAll(".hexcolor-wrap, .hexcolor-board, .hexcolor-tip, .hexcolor-bar, .hexcolor-svg, .hexcolor-palbtn, .hexcolor-tool").forEach(function (e) { var r = e.getBoundingClientRect(); if (r.width && (r.bottom > s.bottom + 1 || r.right > s.right + 1 || r.left < s.left - 1 || r.top < s.top - 1)) out.push(String(e.className.baseVal != null ? e.className.baseVal : e.className)); }); return out; })()');

async function run(view) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: view[0], height: view[1], deviceScaleFactor: 1, mobile: view[0] < 500 });
  await openGame(cdp, 'hexcolor', { port: Number(process.env.FM_PORT) || 8900, root: ROOT });
  await J('(window.__errs = [], window.addEventListener("error", function (e) { window.__errs.push(e.message); }), 1)');
  ok(await waitBuilt() >= 0, view + '：出題完成');
  await gotoLevel(1);                                           // 第二輪時「高關卡優待」會從最佳關卡 − 4 進場，先回第 1 關
  let z = await info(), s = await st();
  ok(z.k === 3 && (await J('Reaction.current.debug.state().level')) === 1, view + '：第 1 關是 3 色');
  ok((await J('document.querySelectorAll(".hexcolor-palbtn").length')) === 4 && (await J('document.querySelectorAll(".hexcolor-palbtn--recall").length')) === 1, view + '：下方 3 種顏色＋「收回」');
  ok((await J('/收回/.test(document.querySelector(".hexcolor-palbtn--recall").textContent)')), view + '：「收回」按鈕寫著收回');
  ok((await J('getComputedStyle(document.querySelector(".hexcolor-palbtn--recall .hexcolor-hex")).fill === getComputedStyle(document.querySelector(".hexcolor-cell--empty .hexcolor-hex")).fill')), view + '：「收回」跟空格同色');
  ok((await overflow()).length === 0, view + '：第 1 關版面放得下 ' + JSON.stringify(await overflow()));

  // ① 塗色
  const empties = () => st().then(x => x.paint.map((v, i) => v < 0 && z.given[i] < 0 ? i : -1).filter(i => i >= 0));
  let e0 = (await empties())[0];
  await pick(0); let r0 = await cellRect(e0); await click(r0.x, r0.y);
  s = await st();
  ok(s.paint[e0] === 0, view + '：點藍色再點空格 → 塗上藍色');
  await clickEl('.hexcolor-palbtn', 0); s = await st();
  ok(s.tool === -1, view + '：再點一次同一個顏色＝取消選取');
  // ② 長按
  let e1 = (await empties()).find(i => i !== e0);
  let r1 = await cellRect(e1);
  await pick(1);
  await longPress(r1.x, r1.y);
  s = await st();
  ok(s.popOpen && s.paint[e1] < 0, view + '：長按跳出記號彈窗，放開時沒有順便塗色');
  let pr = await rect('.hexcolor-pop'), wr = await rect('.hexcolor-wrap');
  ok(pr && pr.w / wr.w <= 0.42 && pr.w / wr.w >= 0.33, view + '：彈窗寬度約畫面 2/5（' + (pr && (pr.w / wr.w).toFixed(3)) + '；格子很大又在正中間時會稍微變窄）');
  ok(pr && (pr.r <= r1.l + 0.5 || pr.l >= r1.r - 0.5 || pr.b <= r1.t + 0.5 || pr.t >= r1.b - 0.5), view + '：彈窗沒有蓋住被按的格子 ' + JSON.stringify({ cell: [r1.l, r1.r, r1.t, r1.b].map(Math.round), pop: pr && [pr.l, pr.r, pr.t, pr.b].map(Math.round), wrap: [wr.l, wr.r, wr.t, wr.b].map(Math.round) }));
  ok(pr && pr.t >= wr.t - 1 && pr.b <= wr.b + 1, view + '：彈窗在畫面裡面');
  ok((await J('document.querySelectorAll(".hexcolor-pop__item").length')) === 5, view + '：3 色時有 ?、X、3 種兩色組合');
  await clickEl('.hexcolor-pop__item', 0);                     // 「?」
  s = await st();
  ok(!s.popOpen && s.marks[e1] === 'q', view + '：選「?」→ 彈窗關掉、格子記上 ?');
  ok((await J('!!document.querySelector(".hexcolor-cell[data-i=\\"' + e1 + '\\"] .hexcolor-glyph--q")')), view + '：格子上畫出黑色的 ?');
  await longPress(r1.x, r1.y);
  ok((await J('document.querySelectorAll(".hexcolor-pop__item--on").length')) === 1, view + '：再長按，目前的記號會框起來');
  await clickEl('.hexcolor-pop__item', 2);                     // 第一種兩色組合
  s = await st();
  ok(Array.isArray(s.marks[e1]) && s.marks[e1].length === 2, view + '：選兩色組合 → 格子記上組合');
  ok((await J('!!document.querySelector(".hexcolor-cell[data-i=\\"' + e1 + '\\"] .hexcolor-combo")')), view + '：格子上畫出小的兩色六角形');
  await click(r1.x, r1.y);                                      // 有記號的格子也可以塗（記號只是參考）
  s = await st();
  ok(s.paint[e1] === 1 && Array.isArray(s.marks[e1]), view + '：有記號的格子照樣可以塗，記號疊在上面');
  await longPress(r1.x, r1.y);
  await clickEl('.hexcolor-pop__clear');
  s = await st();
  ok(s.marks[e1] === null && !s.popOpen, view + '：「清除記號」拿掉記號');
  await longPress(r1.x, r1.y);
  await click(wr.l + 6, wr.t + 6 > pr.t ? wr.b - 6 : wr.t + 6);  // 點彈窗外面
  ok(!(await st()).popOpen, view + '：點彈窗外面＝關掉');
  // 預填格長按：不跳彈窗
  const gIdx = z.given.findIndex(v => v >= 0), rg = await cellRect(gIdx);
  await longPress(rg.x, rg.y);
  ok(!(await st()).popOpen, view + '：預填的格子長按不跳彈窗');
  // ③ 收回
  await pick(z.k);
  await click(r1.x, r1.y);
  ok((await st()).paint[e1] === -1, view + '：「收回」→ 顏色拿掉');
  await click(rg.x, rg.y);
  ok((await st()).paint[gIdx] === z.given[gIdx] && /不能收回/.test(await J('document.querySelector(".hexcolor-tip").textContent')), view + '：預填的格子不能收回');
  // ④ 相鄰同色 ✕、「！」警示（3 色：把某個空格的鄰居塗成三種顏色）
  s = await st();
  let target = -1, plan = null;
  for (let i = 0; i < z.n && target < 0; i++) {
    if (s.paint[i] >= 0) continue;
    const have = new Set(z.nbrs[i].map(j => s.paint[j]).filter(v => v >= 0)), free = z.nbrs[i].filter(j => s.paint[j] < 0 && z.given[j] < 0);
    const need = [0, 1, 2].filter(c => !have.has(c));
    if (need.length && need.length <= free.length) { target = i; plan = need.map((c, t) => [free[t], c]); }
  }
  for (const [j, c] of plan) { await pick(c); const rj = await cellRect(j); await click(rj.x, rj.y); }
  ok((await J('document.querySelector(".hexcolor-cell[data-i=\\"' + target + '\\"]").classList.contains("hexcolor-cell--warn")')), view + '：四周用到 3 種顏色的空格 → 「！」警示');
  ok((await J('getComputedStyle(document.querySelector(".hexcolor-cell--warn .hexcolor-bang")).display !== "none"')), view + '：「！」看得到');
  const cf = await J('Reaction.current.debug.api().state().paint');
  let hasBad = false; for (let i = 0; i < z.n; i++) if (cf[i] >= 0 && z.nbrs[i].some(j => cf[j] === cf[i])) hasBad = true;
  ok(hasBad === ((await J('document.querySelectorAll(".hexcolor-cell--bad").length')) > 0), view + '：有相鄰同色才打 ✕');
  // ⑤ 提示
  ok((await J('!!document.querySelector(".hexcolor-tool") && /提示/.test(document.querySelector(".hexcolor-tools").textContent)')), view + '：第 1 關有提示按鈕');
  await J('(function(){ var b = [].slice.call(document.querySelectorAll(".hexcolor-tool")).filter(function (x) { return /重來/.test(x.textContent); })[0]; return 1; })()');
  await clickEl('.hexcolor-tool', 1);                          // 重來
  s = await st();
  ok(s.paint.every((v, i) => v === z.given[i]) && s.marks.every(m => m === null), view + '：「重來」恢復成一開始的樣子');
  const before = s.paint.filter(v => v >= 0).length;
  await clickEl('.hexcolor-tool', 0);                          // 提示
  s = await st();
  ok(s.hintsLeft === 2 && s.paint.filter(v => v >= 0).length === before + 1, view + '：提示替你塗了一格');
  // ⑥ 過關
  const cl0 = await J('Reaction.current.debug.state().cleared');
  await J('(Reaction.current.debug.api().solve(), 1)');
  await sleep(1900); await waitBuilt();
  ok((await J('Reaction.current.debug.state().level')) === 2 && (await J('Reaction.current.debug.state().cleared')) === cl0 + 1, view + '：塗完答案 → 過關、進第 2 關');
  // 4 色的彈窗
  await gotoLevel(4);
  z = await info(); s = await st();
  ok(z.k === 4 && !z.unique, view + '：第 4 關 4 色、自由擺');
  const e4 = s.paint.findIndex((v, i) => v < 0), r4 = await cellRect(e4);
  await longPress(r4.x, r4.y);
  ok((await J('document.querySelectorAll(".hexcolor-pop__item").length')) === 12, view + '：4 色時有 ?、X、6 種兩色、4 種三色＝12 個選項');
  pr = await rect('.hexcolor-pop'); wr = await rect('.hexcolor-wrap');
  ok(pr && pr.t >= wr.t - 1 && pr.b <= wr.b + 1 && (pr.r <= r4.l + 0.5 || pr.l >= r4.r - 0.5 || pr.b <= r4.t + 0.5 || pr.t >= r4.b - 0.5), view + '：12 個選項的彈窗放得下、不蓋住格子');
  await clickEl('.hexcolor-pop__item', 11);                    // 最後一個（三色組合）
  ok(((await st()).marks[e4] || []).length === 3, view + '：選三色組合');
  ok((await J('document.querySelectorAll(".hexcolor-cell[data-i=\\"' + e4 + '\\"] .hexcolor-combo polygon").length')) === 3, view + '：小六角形切成三塊');
  await gotoLevel(5);
  ok(!(await J('/提示/.test(document.querySelector(".hexcolor-tools").textContent)')), view + '：第 5 關起沒有提示按鈕');
  // ⑦ 第 30 關
  const ms30 = await gotoLevel(30);
  z = await info();
  ok(z.n === 75 && z.unique, view + '：第 30 關 75 格、唯一解');
  ok((await overflow()).length === 0, view + '：第 30 關版面放得下 ' + JSON.stringify(await overflow()));
  const hw = await J('(function(){ var h = document.querySelector(".hexcolor-cell .hexcolor-hex").getBoundingClientRect().width, s = document.getElementById("stage").getBoundingClientRect().width; return h / s * 500; })()');
  ok(hw >= 38, view + '：第 30 關一格寬 ' + hw.toFixed(1) + ' px（舞台 500 寬換算），手指點得到');
  console.log(view + '：第 30 關出題＋畫面 ' + ms30 + 'ms，一格寬 ' + hw.toFixed(1) + ' px');
  // 第 30 關點一格塗色（大盤面上的座標換算）
  s = await st();
  const e30 = s.paint.findIndex(v => v < 0), r30 = await cellRect(e30);
  await pick(0); await click(r30.x, r30.y);
  ok((await st()).paint[e30] === 0, view + '：第 30 關點得到格子');
  // 時間到：失敗、亮出答案、結算
  await J('(Reaction.current.debug.api().timeout(), 1)');
  await sleep(300);
  s = await st();
  ok(s.dead && s.paint.every((v, i) => v === z.sol[i]), view + '：時間到 → 亮出正確答案');
  ok((await J('document.querySelectorAll(".hexcolor-cell--revealed").length')) > 0, view + '：補上的答案有虛線框');
  const t0 = Date.now(); while (Date.now() - t0 < 9000 && !(await J('!!document.querySelector(".dlg--result")'))) await sleep(200);
  ok(await J('!!document.querySelector(".dlg--result")'), view + '：時間到之後跳出結算卡片');
  const errs = await J('window.__errs');
  ok(errs.length === 0, view + '：沒有 JS 錯誤 ' + JSON.stringify(errs));
}

(async () => {
  cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await run([500, 850]);
    await run([390, 844]);
  } finally { cdp.close(); }
  console.log(checks + ' checks');
  console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); try { cdp && cdp.close(); } catch (x) { } process.exit(1); });
