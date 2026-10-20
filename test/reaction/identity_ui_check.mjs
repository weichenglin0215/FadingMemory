// 玩家身分（V1.35.0）的畫面驗證：用看不見視窗的 Chrome（500×850），真的點、真的打字，逐一檢查並截圖。
//   · 舊玩家一進 index.html 就跳「建立暱稱與密碼」：暱稱已帶入、游標在密碼欄、沒有關閉鈕；
//     暱稱沒人用／已被使用（同密碼＝同一個人、密碼錯、換個暱稱）／被保留／格式不合
//   · 新玩家成績進前 30 名才跳；按「先不要」下一次再跳；撞名；建立成功＋慶祝
//   · 世界排行榜彈窗的帳號列、「我的帳號」面板、改暱稱、設新密碼、合併帳號、登出
//   · 每一個彈窗都在 500×850 舞台內、沒有捲軸
// 後端用 test/leaderboard/fake_backend.js（簡化版的假資料庫，在頁面載入「之前」就注入，所以舊玩家一開頁面就查得到狀態）。
// 前置：專案用本機伺服器開起來（例如 python -m http.server 8743）。用法（專案根目錄）：node test/reaction/identity_ui_check.mjs [--shots 資料夾]
// 截圖預設存在 %TEMP%/fm-identity-check/。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connect, sleep } from './cdp.mjs';

const ROOT = process.cwd();
const PORT = 8743;
const argShots = process.argv.indexOf('--shots');
const SHOTS = argShots > 0 ? process.argv[argShots + 1] : path.join(os.tmpdir(), 'fm-identity-check');
fs.mkdirSync(SHOTS, { recursive: true });
const fakeSrc = fs.readFileSync(path.join(ROOT, 'test/leaderboard/fake_backend.js'), 'utf8');

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };

const T0 = Date.now();
const cdp = await connect();
const J = async (expr) => cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())').then(r => { try { return JSON.parse(r); } catch (e) { return null; } });
const shot = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64')); };
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' ? 0 : 1, clickCount: 1 });
async function mclickAt(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await sleep(30); await mouse('mouseReleased', x, y); }
// 找可見的按鈕（依文字）並用真滑鼠點它的中心
async function clickBtn(text) {
  const p = await J('(function(){ var b = [].slice.call(document.querySelectorAll("button")).filter(function (x) { return x.textContent.trim() === ' + JSON.stringify(text) + ' && !x.hidden && x.offsetParent !== null && !x.disabled; }).pop(); if (!b) return null; var r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
  if (!p) return false;
  await mclickAt(p[0], p[1]);
  await sleep(120);
  return true;
}
// 在輸入框打字：先聚焦、全選，再用 insertText（會觸發 input 事件，跟手機鍵盤輸入一樣）
async function typeInto(selector, text, which) {
  await cdp.evalJs('(function(){ var els = document.querySelectorAll(' + JSON.stringify(selector) + '); var el = els[' + (which || 0) + ']; el.focus(); el.select && el.select(); })()');
  if (text === '') await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }), await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  else await cdp.send('Input.insertText', { text });
  await sleep(80);
}
const text = (sel) => J('(function(){ var e = document.querySelector(' + JSON.stringify(sel) + '); return e ? e.textContent.replace(/\\s+/g, " ").trim() : null; })()');
const val = (sel, i) => J('(function(){ var e = document.querySelectorAll(' + JSON.stringify(sel) + ')[' + (i || 0) + ']; return e ? e.value : null; })()');
const state = () => J('window.Leaderboard.identityState()');
const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 6000)) { if (await J(expr)) return true; await sleep(100); } return false; };
// 彈窗是否完整在 500×850 舞台裡、有沒有捲軸
async function fits(label, sel) {
  const r = await J('(function(){ var ov = document.querySelector(' + JSON.stringify(sel || '.dlg--idn') + '); if (!ov) return null; var c = ov.querySelector(".dlg__card"), cr = c.getBoundingClientRect(), st = document.getElementById("stage").getBoundingClientRect(); return { top: cr.top - st.top, bottom: cr.bottom - st.top, h: st.height, over: ov.scrollHeight > ov.clientHeight + 1, cardOver: c.scrollHeight > c.clientHeight + 1, w: cr.width, stW: st.width }; })()');
  ok(r && r.top >= 0 && r.bottom <= r.h + 0.5 && !r.over && !r.cardOver, label + '：彈窗完整在舞台內、沒有捲軸 ' + JSON.stringify(r));
  return r;
}
async function setup() { await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false }); }
let scriptId = null;
// 開頁面：先注入假資料庫（頁面載入「之前」），再導航
async function openPage(url, setupJs) {
  if (scriptId) { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId }).catch(() => { }); scriptId = null; }
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await cdp.send('Storage.clearDataForOrigin', { origin: 'http://localhost:' + PORT, storageTypes: 'local_storage' }).catch(() => { });
  const r = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__FAKE_OPTS = { keep: true };\n' + fakeSrc + '\n;' + (setupJs || '') });
  scriptId = r.identifier;
  await cdp.send('Page.navigate', { url: 'http://localhost:' + PORT + '/' + url });
  await waitFor('document.readyState === "complete" && !!window.Identity && !!window.Leaderboard', 15000);
  await sleep(300);
}
async function startGame(id) {
  await J('window.__fake.latency = 5');
  await cdp.evalJs('(async function(){ var btn = function (t) { return [].slice.call(document.querySelectorAll("button")).filter(function (b) { return b.textContent.trim() === t; })[0]; }; for (var i = 0; i < 40 && !btn("下一步"); i++) await new Promise(function (r) { setTimeout(r, 100); }); if (btn("下一步")) btn("下一步").click(); await new Promise(function (r) { setTimeout(r, 300); }); if (btn("開始挑戰")) btn("開始挑戰").click(); })()');
  await sleep(400);
}

try {
  await setup();

  // ═══ A. 舊玩家（暱稱沒人用）：一進 index.html 就跳 ═══
  console.log('[' + ((Date.now() - T0) / 1000).toFixed(0) + 's] 場景 A');
  await openPage('index.html', "__fake.legacyDevice('老玩家');");
  ok(await waitFor('!!document.querySelector(".dlg--idn")', 8000), 'A 舊玩家：一進 index.html 就跳出「建立暱稱與密碼」');
  await sleep(500);
  await shot('A1_legacy_free');
  ok((await text('.dlg--idn .dlg__title')) === '建立暱稱與密碼', 'A 標題「建立暱稱與密碼」：' + await text('.dlg--idn .dlg__title'));
  ok(/排行榜升級了/.test(await text('.idn-intro')) && /4 位數密碼/.test(await text('.idn-intro')), 'A 說明一句話講清楚這次改版的用意：' + await text('.idn-intro'));
  ok((await val('.idn-input', 0)) === '老玩家', 'A 暱稱自動帶入原有的暱稱：' + await val('.idn-input', 0));
  ok(await J('document.activeElement && document.activeElement.classList.contains("idn-pin")'), 'A 輸入焦點直接在密碼欄');
  ok(!(await J('[].slice.call(document.querySelectorAll(".dlg--idn button")).some(function (b) { return !b.hidden && b.textContent.trim() === "先不要"; })')), 'A 沒有「先不要」之類的關閉鈕（不可略過）');
  ok(await J('[].slice.call(document.querySelectorAll(".dlg--idn button")).filter(function (b) { return !b.hidden; }).map(function (b) { return b.textContent.trim(); }).join() === "建立"'), 'A 畫面上只有一顆按鈕「建立」');
  ok(await J('document.querySelector(".dlg--idn .btn--primary").disabled'), 'A 密碼還沒填：「建立」按不下去');
  ok((await J('document.querySelector(".idn-pin").getAttribute("inputmode")')) === 'numeric' && (await J('document.querySelector(".idn-pin").type')) === 'text', 'A 密碼欄：數字鍵盤、明碼顯示（type=text）');
  await fits('A 舊玩家彈窗');
  // 點背景、按 Esc 都關不掉
  await mclickAt(10, 10); await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(150);
  ok(!!(await J('document.querySelector(".dlg--idn")')), 'A 點背景、按 Esc 都關不掉');
  await typeInto('.idn-pin', 'ab12');
  ok((await val('.idn-pin')) === '12', 'A 密碼欄只收數字：輸入 ab12 → ' + await val('.idn-pin'));
  await typeInto('.idn-pin', '3');
  ok(await J('document.querySelector(".dlg--idn .btn--primary").disabled'), 'A 密碼不到 4 位：還是按不下去');
  await typeInto('.idn-pin', '2468');
  ok(!(await J('document.querySelector(".dlg--idn .btn--primary").disabled')), 'A 密碼 4 位：可以按「建立」');
  await shot('A2_legacy_filled');
  ok(await clickBtn('建立'), 'A 真滑鼠按「建立」');
  ok(await waitFor('!document.querySelector(".dlg--idn")', 5000), 'A 建立成功：彈窗關掉');
  ok((await state()) === 'in' && (await J('Leaderboard.getNick()')) === '老玩家', 'A 建立成功：已登入，暱稱「老玩家」');
  const acc = await J('Object.keys(__fake.accounts).map(function (p) { var a = __fake.accounts[p]; return [a.nick, a.pin, Object.keys(a.tokens).length]; })');
  ok(JSON.stringify(acc) === JSON.stringify([['老玩家', '2468', 1]]), 'A 假資料庫裡有這個帳號（密碼 2468、一把憑證）：' + JSON.stringify(acc));
  ok(/帳號建立好了/.test(await text('.dlg-toast') || ''), 'A 跳出提示「帳號建立好了」：' + await text('.dlg-toast'));
  await shot('A3_after');
  // 重新整理：已經是登入狀態，不會再跳
  const lsSnap = await J('JSON.stringify(Object.keys(localStorage).filter(function (k) { return k.indexOf("fm.lb.") === 0; }).reduce(function (o, k) { o[k] = localStorage.getItem(k); return o; }, {}))');
  ok(/fm\.lb\.token/.test(lsSnap) && /fm\.lb\.pid/.test(lsSnap), 'A 瀏覽器存了 player_id 與憑證');

  // ═══ B. 舊玩家，暱稱已被別的帳號用了 ═══
  console.log('[' + ((Date.now() - T0) / 1000).toFixed(0) + 's] 場景 B');
  await openPage('index.html', "__fake.addAccount('老玩家', '4321'); __fake.legacyDevice('老玩家');");
  ok(await waitFor('!!document.querySelector(".dlg--idn")', 8000), 'B 跳出認領彈窗');
  ok(await waitFor('document.querySelector(".idn-msg") && /已經有人使用/.test(document.querySelector(".idn-msg").textContent)', 5000), 'B 暱稱已被使用 → 顯示橘色提示：' + await text('.idn-msg'));
  await sleep(300);
  await shot('B1_taken');
  ok((await J('document.querySelector(".idn-msg").classList.contains("idn-msg--warn")')), 'B 提示是警告色（橘）');
  ok(/登入（我就是本人）/.test(await text('.dlg--idn .btn--primary')), 'B 主按鈕變成「登入（我就是本人）」：' + await text('.dlg--idn .btn--primary'));
  ok(await J('[].slice.call(document.querySelectorAll(".dlg--idn button")).some(function (b) { return !b.hidden && b.textContent.trim() === "不是我，換個暱稱"; })'), 'B 有「不是我，換個暱稱」');
  await fits('B 暱稱已被使用');
  // 密碼錯
  await typeInto('.idn-pin', '0000');
  await clickBtn('登入（我就是本人）');
  ok(await waitFor('/還可以試 4 次/.test(document.querySelector(".idn-msg").textContent)', 3000), 'B 密碼打錯 → 「密碼不對，還可以試 4 次」：' + await text('.idn-msg'));
  ok((await val('.idn-pin')) === '', 'B 打錯之後密碼欄清空');
  await shot('B2_wrong_pin');
  // 換個暱稱：暱稱欄變成「原暱稱＋3 位數」，提示照使用者指定的文字
  await clickBtn('不是我，換個暱稱');
  await sleep(300);
  const nn = await val('.idn-input', 0);
  ok(/^老玩家\d{3}$/.test(nn), 'B 按「不是我，換個暱稱」→ 暱稱欄自動加上隨機 3 位數：' + nn);
  ok(/該暱稱與其他玩家重複，請輸入新暱稱/.test(await text('.idn-msg')), 'B 提示字：「該暱稱與其他玩家重複，請輸入新暱稱」：' + await text('.idn-msg'));
  ok(/建立/.test(await text('.dlg--idn .btn--primary')) && !/登入/.test(await text('.dlg--idn .btn--primary')), 'B 主按鈕回到「建立」');
  await shot('B3_suggested');
  await typeInto('.idn-pin', '1357');
  await clickBtn('建立');
  ok(await waitFor('!document.querySelector(".dlg--idn")', 5000) && (await state()) === 'in' && (await J('Leaderboard.getNick()')) === nn, 'B 用建議的暱稱建立成功：' + nn);

  // ═══ C. 同暱稱＋同密碼＝同一個人的另一台裝置 ═══
  console.log('[' + ((Date.now() - T0) / 1000).toFixed(0) + 's] 場景 C');
  await openPage('index.html', "__fake.addAccount('老玩家', '4321'); __fake.legacyDevice('老玩家');");
  await waitFor('document.querySelector(".idn-msg") && /已經有人使用/.test(document.querySelector(".idn-msg").textContent)', 8000);
  await typeInto('.idn-pin', '4321');
  await clickBtn('登入（我就是本人）');
  ok(await waitFor('!document.querySelector(".dlg--idn")', 5000), 'C 輸入同一組密碼 → 彈窗關掉');
  ok((await state()) === 'in' && (await J('Leaderboard.getNick()')) === '老玩家', 'C 認定同一個人，改用第一台的帳號');
  ok(/已連上你的帳號/.test(await text('.dlg-toast') || ''), 'C 提示「已連上你的帳號」：' + await text('.dlg-toast'));
  ok((await J('Object.keys(__fake.accounts).length')) === 1, 'C 沒有多出新帳號（兩台共用同一個）');

  // ═══ D. 暱稱被保留、格式不合 ═══
  console.log('[' + ((Date.now() - T0) / 1000).toFixed(0) + 's] 場景 D');
  await openPage('index.html', "__fake.reserve('保留名', 7); __fake.legacyDevice('別名');");
  await waitFor('!!document.querySelector(".dlg--idn")', 8000); await sleep(600);
  await typeInto('.idn-input', '保留名', 0);
  ok(await waitFor('/保留給另一位舊玩家/.test(document.querySelector(".idn-msg").textContent)', 4000), 'D 暱稱被保留 → 「目前保留給另一位舊玩家（到 M 月 D 日）」：' + await text('.idn-msg'));
  await typeInto('.idn-pin', '1234');
  ok(await J('document.querySelector(".dlg--idn .btn--primary").disabled'), 'D 保留中的暱稱：「建立」按不下去（要先換名字）');
  await shot('D1_reserved');
  ok(await J('[].slice.call(document.querySelectorAll(".dlg--idn button")).some(function (b) { return !b.hidden && b.textContent.trim() === "換個暱稱"; })'), 'D 有「換個暱稱」');
  await typeInto('.idn-input', 'admin', 0);
  ok(await waitFor('/不能使用這個名字/.test(document.querySelector(".idn-msg").textContent)', 4000), 'D 保留字（admin）→ 提示不能使用：' + await text('.idn-msg'));
  ok(await J('document.querySelector(".dlg--idn .btn--primary").disabled'), 'D 保留字：按不下去');
  await typeInto('.idn-input', '', 0);
  ok(await J('document.querySelector(".dlg--idn .btn--primary").disabled'), 'D 暱稱清空：按不下去');

  // ═══ E. 新玩家：成績進前 30 名才跳；先不要之後下一次還會跳；撞名；建立成功＋慶祝 ═══
  console.log('[' + ((Date.now() - T0) / 1000).toFixed(0) + 's] 場景 E');
  await openPage('reaction.html?game=speed', '');
  await startGame('speed');
  await J('(function(){ Reaction.resultShowing = function () { return true; }; return 1; })()');      /* 模擬「結算卡片還在畫面上」：進榜才會跳大的恭喜彈窗（不然只跳小提示） */
  await J('__fake.seed("speed", 0)');
  ok((await state()) === 'guest', 'E 新玩家是訪客');
  // 先把榜單弄成滿 30 名：差的成績完全不問
  await J('__fake.seed("speed", 34)');
  await cdp.evalJs('(function(){ Leaderboard.load("speed", { force: true }); return 1; })()');
  await sleep(300);
  await cdp.evalJs('(function(){ window.__r = null; Leaderboard.submit(Reaction.current, 59.9).then(function (r) { window.__r = r; }); return 1; })()');
  await sleep(300);
  ok((await J('window.__r && window.__r.status')) === 'not-qualified' && !(await J('document.querySelector(".dlg--idn")')), 'E 成績進不了前 30 名 → 完全不問');
  await cdp.evalJs('(function(){ window.__r = null; Leaderboard.submit(Reaction.current, 0.0123).then(function (r) { window.__r = r; }); return 1; })()');
  ok(await waitFor('!!document.querySelector(".dlg--idn")', 5000), 'E 成績進前 30 名 → 跳「建立暱稱與密碼」');
  await sleep(300);
  await shot('E1_new');
  ok(/恭喜進榜/.test(await text('.dlg--idn .dlg__title')) && /世界前 30 名/.test(await text('.idn-intro')), 'E 新玩家標題與說明：' + await text('.dlg--idn .dlg__title') + '／' + await text('.idn-intro'));
  ok((await val('.idn-input', 0)) === '' && await J('document.activeElement === document.querySelectorAll(".idn-input")[0]'), 'E 暱稱空白、焦點在暱稱欄');
  ok(await J('[].slice.call(document.querySelectorAll(".dlg--idn button")).filter(function (b) { return !b.hidden; }).map(function (b) { return b.textContent.trim(); }).join("|") === "建立並上傳成績|我已經有帳號，改用登入|先不要"'), 'E 三顆按鈕：建立並上傳成績／我已經有帳號，改用登入／先不要：' + await J('[].slice.call(document.querySelectorAll(".dlg--idn button")).filter(function (b) { return !b.hidden; }).map(function (b) { return b.textContent.trim(); }).join("|")'));
  await fits('E 新玩家彈窗');
  // 先不要
  await clickBtn('先不要');
  ok(await waitFor('!document.querySelector(".dlg--idn") && window.__r', 4000) && (await J('window.__r.status')) === 'skipped', 'E 按「先不要」→ 彈窗關掉、成績不上傳（skipped）');
  ok((await J('Object.keys(__fake.accounts).length')) === 0, 'E 先不要：沒有建任何帳號 → ' + await J('Object.keys(__fake.accounts).length'));
  await cdp.evalJs('(function(){ window.__r = null; Leaderboard.submit(Reaction.current, 0.0123).then(function (r) { window.__r = r; }); return 1; })()');
  ok(await waitFor('!!document.querySelector(".dlg--idn")', 5000), 'E 先不要之後，下一次又進前 30 名 → 再跳一次');
  // 撞名：先在假資料庫放一個「快樂阿嬤」
  await J('__fake.addAccount("快樂阿嬤", "9999")');
  await typeInto('.idn-input', '快樂阿嬤', 0);
  ok(await waitFor('/已經有人使用/.test(document.querySelector(".idn-msg").textContent)', 4000), 'E 撞名 → 提示已經有人使用：' + await text('.idn-msg'));
  await typeInto('.idn-pin', '1234');
  await shot('E2_taken');
  ok(/登入（我就是本人）/.test(await text('.dlg--idn .btn--primary')), 'E 撞名：主按鈕變成「登入（我就是本人）」');
  await clickBtn('不是我，換個暱稱');
  await sleep(300);
  ok(/^快樂阿嬤\d{3}$/.test(await val('.idn-input', 0)) || /^快樂阿嬤\d{2}$/.test(await val('.idn-input', 0)), 'E 換個暱稱 → 建議的暱稱（超過 8 字會先截短）：' + await val('.idn-input', 0));
  await typeInto('.idn-input', '新手王', 0);
  await sleep(700);
  ok(/建立並上傳成績/.test(await text('.dlg--idn .btn--primary')) && !(await J('document.querySelector(".dlg--idn .btn--primary").disabled')), 'E 換成沒人用的暱稱：「建立並上傳成績」可以按');
  await shot('E3_ready');
  await clickBtn('建立並上傳成績');
  ok(await waitFor('window.__r && window.__r.status', 6000), 'E 建立後有結果');
  ok((await J('window.__r.status')) === 'saved' && (await state()) === 'in' && (await J('Leaderboard.getNick()')) === '新手王', 'E 建立帳號成功＋成績進榜：' + JSON.stringify(await J('window.__r')));
  ok(await waitFor('!!document.querySelector(".dlg--congrats")', 4000), 'E 進榜 → 跳恭喜彈窗');
  await shot('E4_congrats');
  await clickBtn('太棒了');

  // ═══ F. 世界排行榜彈窗的帳號列與「我的帳號」面板 ═══
  console.log('[' + ((Date.now() - T0) / 1000).toFixed(0) + 's] 場景 F');
  await J('Reaction.current && Leaderboard.showBoard(Reaction.current, {})');
  await sleep(500);
  ok(/暱稱：新手王/.test(await text('.lb-nickline')), 'F 榜單上面帳號列：「暱稱：新手王」＋「帳號」鈕：' + await text('.lb-nickline'));
  await shot('F1_board_in');
  await clickBtn('帳號');
  await sleep(300);
  ok(!!(await J('document.querySelector(".dlg--idn-acct")')) && /我的帳號/.test(await text('.dlg--idn-acct .dlg__title')), 'F 按「帳號」→ 我的帳號面板');
  await shot('F2_account');
  await fits('F 帳號面板', '.dlg--idn-acct');
  const accBtns = await J('[].slice.call(document.querySelectorAll(".dlg--idn-acct button")).map(function (b) { return b.textContent.trim(); }).join("|")');
  ok(accBtns === '改暱稱|設定新密碼|合併到另一個帳號|登出|關閉', 'F 面板按鈕：' + accBtns);
  // 改暱稱
  await clickBtn('改暱稱');
  await sleep(250);
  await shot('F3_rename');
  await fits('F 改暱稱', '.dlg--idn-form');
  await typeInto('.dlg--idn-form .idn-input', '快樂阿嬤');
  await clickBtn('儲存');
  ok(await waitFor('/已經有人使用/.test((document.querySelector(".dlg--idn-form .idn-msg") || {textContent:""}).textContent)', 3000), 'F 改成別人用的暱稱 → 「已經有人使用了」：' + await text('.dlg--idn-form .idn-msg'));
  await typeInto('.dlg--idn-form .idn-input', '新手王二號');
  await clickBtn('儲存');
  ok(await waitFor('!document.querySelector(".dlg--idn-form")', 3000) && (await J('Leaderboard.getNick()')) === '新手王二號', 'F 改成沒人用的暱稱 → 成功，本機暱稱更新');
  ok(/暱稱：新手王二號/.test(await text('.idn-acct__nick')), 'F 面板上的暱稱立刻換成新名字：' + await text('.idn-acct__nick'));
  // 設新密碼
  await clickBtn('設定新密碼');
  await sleep(250);
  await shot('F4_pin');
  await fits('F 設新密碼', '.dlg--idn-form');
  ok(await J('document.querySelector(".dlg--idn-form .btn--primary").disabled'), 'F 新密碼沒填：按不下去');
  await typeInto('.dlg--idn-form .idn-pin', '8642');
  await clickBtn('儲存');
  ok(await waitFor('!document.querySelector(".dlg--idn-form")', 3000), 'F 設新密碼成功（關掉）');
  ok((await J('Object.keys(__fake.accounts).map(function (p) { return __fake.accounts[p]; }).filter(function (a) { return a.nick === "新手王二號"; })[0].pin')) === '8642', 'F 假資料庫裡的密碼已換成 8642');
  // 合併到另一個帳號
  await clickBtn('合併到另一個帳號');
  await sleep(250);
  await shot('F5_merge');
  await fits('F 合併帳號', '.dlg--idn-form');
  await typeInto('.dlg--idn-form .idn-input', '快樂阿嬤', 0);
  await typeInto('.dlg--idn-form .idn-pin', '1111');
  await clickBtn('合併');
  ok(await waitFor('/還可以試/.test((document.querySelector(".dlg--idn-form .idn-msg") || {textContent:""}).textContent)', 3000), 'F 合併：目標帳號密碼打錯 → 提示還可以試幾次：' + await text('.dlg--idn-form .idn-msg'));
  await typeInto('.dlg--idn-form .idn-pin', '9999');
  await clickBtn('合併');
  ok(await waitFor('!document.querySelector(".dlg--idn-form")', 3000) && (await J('Leaderboard.getNick()')) === '快樂阿嬤', 'F 合併成功：這支瀏覽器改用「快樂阿嬤」');
  // 登出
  await clickBtn('登出');
  await sleep(250);
  await shot('F6_logout');
  await fits('F 登出確認', '.dlg--idn-form');
  ok(/登出後，這支手機上的個人最佳會清掉/.test(await text('.dlg--idn-form .dlg__text')), 'F 登出確認文字說明會清掉個人最佳');
  const logoutBtns = await J('[].slice.call(document.querySelectorAll(".dlg--idn-form button")).map(function (b) { return b.textContent.trim(); }).join("|")');
  ok(logoutBtns === '取消|登出', 'F 登出確認的按鈕：' + logoutBtns);
  await J('(function(){ localStorage.setItem("fm.reaction.best.speed", "0.5"); localStorage.setItem("fm.reaction.lvbest.cake", "9"); return 1; })()');
  await clickBtn('登出');
  ok(await waitFor('(window.Leaderboard.identityState() === "guest")', 4000), 'F 登出 → 回到訪客');
  ok((await J('localStorage.getItem("fm.reaction.best.speed")')) === null && (await J('localStorage.getItem("fm.reaction.lvbest.cake")')) === null, 'F 登出：本機個人最佳清掉');
  await sleep(300);
  await shot('F7_after_logout');

  // ═══ G. 訪客：榜單上有「我已有帳號，登入」→ 登入彈窗 ═══
  console.log('[' + ((Date.now() - T0) / 1000).toFixed(0) + 's] 場景 G');
  await sleep(4000);        // 等提示消失
  await J('(function(){ document.querySelectorAll(".dlg").forEach(function (d) { if (!d.classList.contains("dlg--board")) d.remove(); }); return 1; })()');
  ok(/還沒有帳號/.test(await text('.lb-nickline')), 'G 訪客的榜單帳號列：「還沒有帳號」＋登入鈕：' + await text('.lb-nickline'));
  await shot('G1_board_guest');
  await clickBtn('我已有帳號，登入');
  await sleep(300);
  ok(/登入/.test(await text('.dlg--idn .dlg__title')) && (await J('document.querySelectorAll(".idn-input").length')) === 2, 'G 登入彈窗：暱稱＋密碼');
  await shot('G2_login');
  await fits('G 登入彈窗');
  await typeInto('.idn-input', '快樂阿嬤', 0);
  await typeInto('.idn-pin', '0000');
  await clickBtn('登入');
  ok(await waitFor('/還可以試/.test(document.querySelector(".idn-msg").textContent)', 3000), 'G 登入密碼錯 → 還可以試幾次：' + await text('.idn-msg'));
  for (let i = 0; i < 3; i++) { await typeInto('.idn-pin', '0000'); await clickBtn('登入'); await sleep(150); }
  await typeInto('.idn-pin', '0000'); await clickBtn('登入');
  ok(await waitFor('/分鐘後再試/.test(document.querySelector(".idn-msg").textContent)', 3000), 'G 連錯 5 次 → 「密碼輸入錯誤太多次，請 10 分鐘後再試」：' + await text('.idn-msg'));
  await shot('G3_locked');
  await clickBtn('先不要');
  ok(!(await J('document.querySelector(".dlg--idn")')), 'G 登入彈窗可以按「先不要」關掉');
  await clickBtn('關閉');

  // ═══ H. 舊玩家直接開 reaction.html：認領彈窗疊在玩法說明上面、可以操作 ═══
  console.log('[' + ((Date.now() - T0) / 1000).toFixed(0) + 's] 場景 H');
  await openPage('reaction.html?game=speed', "__fake.legacyDevice('老玩家');");
  ok(await waitFor('!!document.querySelector(".dlg--idn") && !!document.querySelector(".dlg--rule")', 8000), 'H 直接開 reaction.html：玩法說明與認領彈窗都在');
  await sleep(500);
  await shot('H1_reaction_legacy');
  ok(await J('(function(){ var r = document.querySelector(".dlg--idn .dlg__card").getBoundingClientRect(); var e = document.elementFromPoint(r.left + r.width / 2, r.top + 20); return !!(e && e.closest(".dlg--idn")); })()'), 'H 認領彈窗疊在玩法說明上面（最上層）');
  await typeInto('.idn-pin', '2468');
  await clickBtn('建立');
  ok(await waitFor('!document.querySelector(".dlg--idn")', 5000) && (await state()) === 'in', 'H 在 reaction.html 認領成功');
  ok(!!(await J('document.querySelector(".dlg--rule")')), 'H 認領之後玩法說明還在（遊戲流程沒被打斷）');

  const errs = await J('window.__errs || []');
  ok(true, '（截圖都在 ' + SHOTS + '）');
} finally {
  cdp.close();
}
console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS ' + total);
process.exit(bad ? 1 : 0);
