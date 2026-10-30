// 後台資料分析頁（admin/stats.html）的瀏覽器測試：
//   · 啟動「假的 Supabase REST 伺服器」（mock_stats_rpc.mjs，不連網路）＋看不見視窗的 Chrome／Edge；
//   · 把網頁當成使用者那樣操作（改日期、切頁籤、點標題排序、滑鼠移到圖上…），檢查畫面與「網頁實際送出的請求」；
//   · 網頁是用 file:// 直接開的（跟你雙擊開啟一樣），用網址後面的 ?api=… 指到假伺服器。
// 用法（在專案根目錄）：node test/admin/check_stats_viewer.mjs [--out 截圖資料夾]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connect, sleep } from '../reaction/cdp.mjs';
import { startMock, MOCK_GAMES } from './mock_stats_rpc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE_FILE = path.resolve(HERE, '../../admin/stats.html');
const PAGE = pathToFileURL(PAGE_FILE).href;
const args = process.argv.slice(2);
const OUT = path.resolve(args.indexOf('--out') >= 0 ? args[args.indexOf('--out') + 1] : path.join(os.tmpdir(), 'fm-admin-stats-check'));
fs.mkdirSync(OUT, { recursive: true });

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };

const html = fs.readFileSync(PAGE_FILE, 'utf8');
const ANON = /var ANON_KEY = '([^']+)'/.exec(html)[1];
const gameKey = /KEY:\s*'([^']+)'/.exec(fs.readFileSync(path.resolve(HERE, '../../js/leaderboard.js'), 'utf8'))[1];
ok(ANON === gameKey && JSON.parse(Buffer.from(ANON.split('.')[1], 'base64url').toString()).role === 'anon', '網頁裡的金鑰跟遊戲用的是同一把公開的 anon 金鑰');
ok(!/service_role['"]?\s*[:=]\s*['"]eyJ/.test(html) && !/sb_secret_[A-Za-z0-9]/.test(html), '網頁裡沒有任何 service_role／secret 金鑰');
ok(/default-src 'none'/.test(html) && /connect-src https:\/\/\*\.supabase\.co/.test(html) && !/<script[^>]+src=/i.test(html) && !/<link[^>]+href=["']https?:/i.test(html), '網頁有 CSP、沒有載入任何外部程式或樣式');

const mock = await startMock({ goodKey: ANON });
const today = mock.today, p2 = n => String(n).padStart(2, '0');
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

const cdp = await connect();
try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs = []; window.addEventListener('error', function (e) { window.__errs.push('error: ' + e.message); }); window.addEventListener('unhandledrejection', function (e) { window.__errs.push('rejection: ' + (e.reason && e.reason.message)); }); document.addEventListener('securitypolicyviolation', function (e) { window.__errs.push('CSP: ' + e.violatedDirective + ' ' + e.blockedURI); });` });

  const ev = (js) => cdp.evalJs(js);
  const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v === undefined ? undefined : JSON.parse(v); };
  const q = JSON.stringify;
  const waitFor = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(60); } throw new Error('等不到：' + what); };
  const status = () => J('document.getElementById("status").textContent');
  const statusCls = () => J('document.getElementById("status").className');
  const shot = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); };
  const idle = () => waitFor(async () => !(await J('document.getElementById("btnQuery").disabled')) && !(await status()).includes('查詢中'), 15000, '查詢結束');
  const setVal = (id, v) => ev(`(function(){ var e = document.getElementById(${q(id)}); e.value = ${q(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const setCheck = (id, v) => ev(`(function(){ var e = document.getElementById(${q(id)}); if (e.checked !== ${!!v}) e.click(); })()`);
  const mouseAt = async (x, y, type) => cdp.send('Input.dispatchMouseEvent', { type: type || 'mouseMoved', x, y, button: 'none' });
  const mouseClick = async (selector) => {
    const r = await J(`(function(){ var e = document.querySelector(${q(selector)}); e.scrollIntoView({ block: 'center' }); var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
  };
  // 開網頁：先離開（about:blank）再進來，才不會在新頁面還沒載入時就讀到舊頁面的狀態
  const open = async (api, hash) => {
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(80);
    await cdp.send('Page.navigate', { url: PAGE + '?api=' + encodeURIComponent(api) + (hash || '') });
    await waitFor(async () => (await ev('document.readyState')) === 'complete' && (await ev('!!window.__SV')), 8000, '網頁載入');
    await idle();
  };
  const calls = (fn) => mock.requests.filter(r => !fn || r.fn === fn);
  const gameNames = () => J('[].slice.call(document.querySelectorAll("#gamesWrap tbody tr")).map(function (t) { return t.cells[0].textContent; })');
  const cellText = (row, col) => J(`document.querySelectorAll("#gamesWrap tbody tr")[${row}].cells[${col}].textContent`);
  const tabTo = async (t) => { await mouseClick('#tab-' + t); await idle(); };

  // ═══ A. 打開：自動查「30 天前到今天」的遊戲分析 ═══
  await open(mock.url);
  ok(await J('document.getElementById("dFrom").value') === addDays(today, -30) && await J('document.getElementById("dTo").value') === today, 'A 預設：起始＝30 天前、結束＝今天（台灣日期）：' + await J('document.getElementById("dFrom").value') + ' ～ ' + await J('document.getElementById("dTo").value'));
  ok(await J('document.querySelectorAll("input[type=password]").length') === 0, 'A 沒有任何密碼欄位');
  ok(calls().length === 1 && calls()[0].fn === 'MF_stats_games', 'A 一打開只查遊戲分析（其他頁籤用到才查）：' + q(calls().map(c => c.fn)));
  const c0 = calls()[0];
  ok(c0.args.p_from === addDays(today, -30) && c0.args.p_to === today && c0.headers.apikey === ANON && c0.headers.authorization === 'Bearer ' + ANON, 'A 請求帶著日期範圍與公開的 anon 金鑰：' + q(c0.args));
  ok(await J('document.getElementById("tab-games").getAttribute("aria-selected")') === 'true' && await J('document.getElementById("panel-players").hidden && document.getElementById("panel-time").hidden'), 'A 預設在「遊戲分析」頁籤');
  const heads = await J('[].slice.call(document.querySelectorAll("#gamesWrap thead th")).map(function (t) { var b = t.querySelector("button"); return b ? b.firstChild.textContent : t.textContent; })');
  ok(q(heads) === q(['遊戲名稱', '遊戲類型', '進行遊戲的人數', '遊戲總次數', '星星數量平均值', '最佳成績', '第一名的玩家']), 'A 欄位與順序（遊戲名稱、遊戲類型、人數、總次數、星星平均、最佳成績、第一名）：' + q(heads));
  const exp = mock.expected.games(addDays(today, -30), today).games;
  ok(await J('document.querySelectorAll("#gamesWrap tbody tr").length') === exp.length, 'A 每款遊戲一列（' + exp.length + ' 款，含沒人玩的）');
  // 預設依「遊戲總次數」由多到少
  const playsCol = await J('[].slice.call(document.querySelectorAll("#gamesWrap tbody tr")).map(function (t) { return Number(t.cells[3].textContent.replace(/,/g, "")); })');
  ok(playsCol.every((v, i) => i === 0 || playsCol[i - 1] >= v) && playsCol[0] === Math.max(...exp.map(g => g.plays)), 'A 預設依遊戲總次數由多到少：' + playsCol.slice(0, 6));
  ok(await J('document.querySelector("#gamesWrap th[aria-sort=descending] button").dataset.sort') === 'plays', 'A 「遊戲總次數」標題標示為降冪排序（aria-sort）');
  const top = exp.slice().sort((a, b) => b.plays - a.plays)[0], nameOf = (id) => MOCK_GAMES.find(g => g[0] === id)[1];
  ok(await cellText(0, 3) === top.plays.toLocaleString('en-US') && await cellText(0, 2) === String(top.players), 'A 第一列的次數與人數跟資料庫給的一致（' + top.game_id + ' ' + top.plays + ' 局 ' + top.players + ' 人）');
  ok(/^\S+$/.test(await cellText(0, 1)) && ['記憶', '視覺', '反應', '數字', '邏輯', '手感', '目測'].includes(await cellText(0, 1)), 'A 遊戲類型是七種之一：' + await cellText(0, 1));
  // 最佳成績用遊戲自己的格式說出來（零秒出手＝「x 秒」）
  const speedRow = await J('(function(){ var r = [].slice.call(document.querySelectorAll("#gamesWrap tbody tr")).filter(function (t) { return t.dataset.id === "speed"; })[0]; return [].slice.call(r.cells).map(function (c) { return c.textContent; }); })()');
  const speedExp = exp.find(g => g.game_id === 'speed');
  ok(speedRow[0] === '零秒出手' && speedRow[1] === '反應' && speedRow[5] === speedExp.best_score.toFixed(4) + ' 秒' && speedRow[6] === speedExp.best_nick, 'A 最佳成績用遊戲的格式（0.xxxx 秒）、第一名玩家暱稱：' + q(speedRow));
  ok(speedRow[4].startsWith('★ ' + speedExp.stars_avg.toFixed(2)) && speedRow[4].includes('(' + speedExp.stars_cnt + ')'), 'A 星星平均與評價次數：' + speedRow[4]);
  // 沒人上榜、沒評價、沒人玩的遊戲：破折號
  const zz = await J('(function(){ var r = [].slice.call(document.querySelectorAll("#gamesWrap tbody tr")).filter(function (t) { return t.dataset.id === "zz_test"; })[0]; return [].slice.call(r.cells).map(function (c) { return c.textContent; }); })()');
  ok(zz[0] === '（測試用，可刪）' && zz[1] === '—' && zz[2] === '0' && zz[3] === '0' && zz[4] === '—' && zz[5] === '—' && zz[6] === '—', 'A 分類表裡沒有的遊戲：用資料庫給的名稱、類型「—」，沒資料的欄位是「—」：' + q(zz));
  ok((await status()).includes('共') && (await status()).includes('款遊戲有人玩') && await statusCls() === 'status status--ok', 'A 狀態列：' + await status());
  ok((await ev('window.__errs.length')) === 0, 'A 沒有 JS 錯誤／CSP 違規：' + q(await ev('window.__errs')));
  await shot('01_games_default');

  // ═══ B. 遊戲分析：點標題排序 ═══
  const nReq = calls().length;
  await mouseClick('#gamesWrap button[data-sort=cat]');
  const catOrder = ['記憶', '視覺', '反應', '數字', '邏輯', '手感', '目測', '—'];
  const catCol = await J('[].slice.call(document.querySelectorAll("#gamesWrap tbody tr")).map(function (t) { return t.cells[1].textContent; })');
  ok(catCol.every((v, i) => i === 0 || catOrder.indexOf(catCol[i - 1]) <= catOrder.indexOf(v)) && catCol[0] === '記憶', 'B 點「遊戲類型」：依七種類型的順序（記憶、視覺、反應…）排：' + q([...new Set(catCol)]));
  ok(await J('document.querySelector("#gamesWrap th[aria-sort=ascending] button").dataset.sort') === 'cat', 'B 類型標題標示為升冪');
  await mouseClick('#gamesWrap button[data-sort=cat]');
  const catCol2 = await J('[].slice.call(document.querySelectorAll("#gamesWrap tbody tr")).map(function (t) { return t.cells[1].textContent; })');
  ok(catCol2[0] === '—' || catOrder.indexOf(catCol2[0]) === Math.max(...catCol2.map(c => catOrder.indexOf(c))), 'B 再點一次：反過來排：' + q([...new Set(catCol2)]));
  await mouseClick('#gamesWrap button[data-sort=players]');
  const playersCol = await J('[].slice.call(document.querySelectorAll("#gamesWrap tbody tr")).map(function (t) { return Number(t.cells[2].textContent); })');
  ok(playersCol.every((v, i) => i === 0 || playersCol[i - 1] >= v) && playersCol[0] === Math.max(...exp.map(g => g.players)), 'B 點「進行遊戲的人數」：由多到少：' + playersCol.slice(0, 6));
  await mouseClick('#gamesWrap button[data-sort=players]');
  const playersCol2 = await J('[].slice.call(document.querySelectorAll("#gamesWrap tbody tr")).map(function (t) { return Number(t.cells[2].textContent); })');
  ok(playersCol2.every((v, i) => i === 0 || playersCol2[i - 1] <= v) && playersCol2[0] === 0, 'B 再點一次：由少到多（沒人玩的在最前面）');
  await mouseClick('#gamesWrap button[data-sort=stars]');
  const starsCol = await J('[].slice.call(document.querySelectorAll("#gamesWrap tbody tr")).map(function (t) { var m = /★ ([\\d.]+)/.exec(t.cells[4].textContent); return m ? Number(m[1]) : null; })');
  const withStars = starsCol.filter(v => v !== null);
  ok(withStars.every((v, i) => i === 0 || withStars[i - 1] >= v) && starsCol.slice(withStars.length).every(v => v === null) && withStars.length > 3, 'B 點「星星數量平均值」：由高到低，沒有評價的永遠排在最後：' + q(starsCol));
  await mouseClick('#gamesWrap button[data-sort=stars]');
  const starsCol2 = await J('[].slice.call(document.querySelectorAll("#gamesWrap tbody tr")).map(function (t) { var m = /★ ([\\d.]+)/.exec(t.cells[4].textContent); return m ? Number(m[1]) : null; })');
  const ws2 = starsCol2.filter(v => v !== null);
  ok(ws2.every((v, i) => i === 0 || ws2[i - 1] <= v) && starsCol2.slice(ws2.length).every(v => v === null), 'B 再點一次：由低到高，沒有評價的還是在最後');
  ok(calls().length === nReq, 'B 排序不用重新連線（沒有新請求）');
  // 沒有排序功能的標題：最佳成績、第一名的玩家、遊戲名稱
  ok(await J('document.querySelectorAll("#gamesWrap thead th button").length') === 4, 'B 只有四個標題可以點（類型、人數、次數、星星）');
  await mouseClick('#gamesWrap button[data-sort=plays]');
  await mouseClick('#onlyPlayed');
  const shown = await J('document.querySelectorAll("#gamesWrap tbody tr").length');
  ok(shown === exp.filter(g => g.plays > 0).length && shown < exp.length, 'B 勾「只顯示期間內有人玩的遊戲」：' + shown + ' 款（沒人玩的 ' + (exp.length - shown) + ' 款隱藏）');
  await mouseClick('#onlyPlayed');

  // ═══ C. 改日期、按查詢 ═══
  await setVal('dFrom', addDays(today, -6)); await setVal('dTo', today);
  const n1 = calls().length;
  await mouseClick('#btnQuery'); await idle();
  ok(calls().length === n1 + 1 && calls().at(-1).args.p_from === addDays(today, -6) && calls().at(-1).args.p_to === today, 'C 改日期再按查詢：重新向資料庫要（帶新的範圍）：' + q(calls().at(-1).args));
  const exp7 = mock.expected.games(addDays(today, -6), today).games.reduce((s, g) => s + g.plays, 0);
  ok((await status()).includes(addDays(today, -6)) && (await status()).includes('共 7 天') && (await status()).includes(exp7.toLocaleString('en-US') + ' 局'), 'C 狀態列顯示新範圍與總次數：' + await status());
  await mouseClick('#btn30'); await idle();
  ok(await J('document.getElementById("dFrom").value') === addDays(today, -30) && calls().at(-1).args.p_from === addDays(today, -30), 'C 「最近 30 天」按鈕：改欄位並立刻查');
  await mouseClick('#btn0'); await idle();
  ok(await J('document.getElementById("dFrom").value') === today && await J('document.getElementById("dTo").value') === today && (await status()).includes('共 1 天'), 'C 「今天」按鈕：起訖都是今天');
  // 錯誤：起點比終點晚、空的
  await setVal('dFrom', today); await setVal('dTo', addDays(today, -3));
  const n2 = calls().length; await mouseClick('#btnQuery');
  ok((await status()).includes('起始日期比結束日期晚') && await statusCls() === 'status status--error' && calls().length === n2, 'C 起點比終點晚：狀態列提醒、不連線：' + await status());
  await setVal('dFrom', '');
  await mouseClick('#btnQuery'); ok((await status()).includes('請選好') && calls().length === n2, 'C 日期空白：提醒、不連線');
  // 超過 400 天：自動縮短
  await setVal('dFrom', addDays(today, -500)); await setVal('dTo', today);
  await mouseClick('#btnQuery'); await idle();
  ok(await J('document.getElementById("dFrom").value') === addDays(today, -399) && calls().at(-1).args.p_from === addDays(today, -399), 'C 超過 400 天：起始日期自動縮短成 400 天：' + await J('document.getElementById("dFrom").value'));
  await mouseClick('#btn30'); await idle();

  // ═══ D. 玩家分析 ═══
  await tabTo('players');
  ok(await J('document.getElementById("tab-players").getAttribute("aria-selected")') === 'true' && await J('document.getElementById("panel-games").hidden') === true, 'D 切到「玩家分析」');
  const pc = calls('MF_stats_players');
  ok(pc.length === 1 && pc[0].args.p_from === null && pc[0].args.p_to === null, 'D 預設不帶日期（目前榜上全部名次）：' + q(pc[0] && pc[0].args));
  const expP = mock.expected.players(null, null);
  const rowsP = await J('document.querySelectorAll("#playersWrap tbody tr").length');
  ok(rowsP === expP.length, 'D 每位上榜玩家一列：' + rowsP);
  const headP = await J('[].slice.call(document.querySelectorAll("#playersWrap thead th")).map(function (t) { return t.textContent; })');
  ok(headP[0] === '玩家暱稱' && headP[1].includes('前 30 名次數') && headP.length === 2 + (new Set(expP.flatMap(p => Object.keys(p.ranks)))).size, 'D 欄位：暱稱、前 30 名次數，後面是「有人上榜的遊戲」各一欄（' + (headP.length - 2) + ' 款）：' + q(headP.slice(0, 5)));
  const cntCol = await J('[].slice.call(document.querySelectorAll("#playersWrap tbody tr")).map(function (t) { return Number(t.cells[1].textContent); })');
  ok(cntCol.every((v, i) => i === 0 || cntCol[i - 1] >= v) && cntCol[0] === expP[0].cnt, 'D 玩家依「前 30 名的次數」由多到少排：' + cntCol.slice(0, 10));
  // 一格的內容：第一位玩家的名次對得上
  const firstRank = await J(`(function(){ var tr = document.querySelector("#playersWrap tbody tr"), th = [].slice.call(document.querySelectorAll("#playersWrap thead th")); var o = {}; for (var i = 2; i < tr.cells.length; i++) if (tr.cells[i].textContent) o[th[i].textContent] = Number(tr.cells[i].textContent); return o; })()`);
  const expRanks = Object.fromEntries(Object.entries(expP[0].ranks).map(([g, r]) => [nameOf(g), r]));
  ok(q(Object.keys(firstRank).sort()) === q(Object.keys(expRanks).sort()) && Object.keys(expRanks).every(k => firstRank[k] === expRanks[k]), 'D 第一位玩家各款遊戲的名次跟資料庫給的一致：' + q(firstRank));
  ok(await J('document.querySelectorAll("#playersWrap td.rk1").length') > 0 && await J('document.querySelector("#playersWrap td.rk").style.getPropertyValue("--a") !== ""'), 'D 有名次的格子有底色深淺，第 1 名有橘框');
  // 暱稱的 HTML 當一般文字、沒有暱稱顯示「（未命名）」
  const nicks = await J('[].slice.call(document.querySelectorAll("#playersWrap tbody tr")).map(function (t) { return t.cells[0].textContent; })');
  ok(nicks.some(n => n.includes('<img src=x onerror=')) && await ev('window.__xss') === undefined && await J('document.querySelectorAll("#playersWrap img").length') === 0, 'D 暱稱裡的 HTML 只是一般文字，不會被執行（沒有 img 元素、window.__xss 沒被設定）');
  ok(nicks.includes('（未命名）') || !expP.some(p => p.nick === ''), 'D 沒有暱稱的玩家顯示「（未命名）」');
  // 左邊兩欄與標題固定
  const stick = await J('(function(){ var n = document.querySelector("#playersWrap tbody td.c-nick"), c = document.querySelector("#playersWrap tbody td.c-cnt"), h = document.querySelector("#playersWrap thead th"); return [getComputedStyle(n).position, getComputedStyle(c).position, getComputedStyle(h).position]; })()');
  ok(q(stick) === q(['sticky', 'sticky', 'sticky']), 'D 暱稱欄、次數欄、標題列都固定（sticky）：' + q(stick));
  await shot('02_players');
  // 找玩家
  await setVal('pSearch', '玩家1');
  const found = await J('[].slice.call(document.querySelectorAll("#playersWrap tbody tr")).map(function (t) { return t.cells[0].textContent; })');
  ok(found.length > 0 && found.length < nicks.length && found.every(n => n.includes('玩家1')), 'D 找玩家：只剩暱稱含「玩家1」的（' + found.length + ' 位）');
  await setVal('pSearch', '不存在的暱稱xyz');
  ok(await J('document.querySelector("#playersWrap .empty").textContent') === '沒有符合的玩家。', 'D 找不到：提示「沒有符合的玩家」');
  await setVal('pSearch', '');
  // 依某一款的名次排序
  const gHead = await J('(function(){ var b = document.querySelector("#playersWrap thead th.g button"); return { id: b.dataset.game, name: b.textContent }; })()');
  await mouseClick('#playersWrap thead th.g button');
  const idx = await J(`(function(){ var th = [].slice.call(document.querySelectorAll("#playersWrap thead th")); for (var i = 0; i < th.length; i++) if (th[i].classList.contains("sorted")) return i; return -1; })()`);
  const gCol = await J(`[].slice.call(document.querySelectorAll("#playersWrap tbody tr")).map(function (t) { var v = t.cells[${idx}].textContent; return v === "" ? null : Number(v); })`);
  const gRanked = gCol.filter(v => v !== null);
  ok(idx > 1 && gRanked.length > 2 && gRanked.every((v, i) => i === 0 || gRanked[i - 1] <= v) && gCol.slice(gRanked.length).every(v => v === null) && gRanked[0] === 1, 'D 點遊戲名稱（' + gHead.name + '）：依這一款的名次排，沒名次的在後面：' + gCol.slice(0, 8));
  await mouseClick('#playersWrap thead th.g button');
  ok(await J('document.querySelectorAll("#playersWrap thead th.sorted").length') === 0 && q(await J('[].slice.call(document.querySelectorAll("#playersWrap tbody tr")).slice(0, 5).map(function (t) { return Number(t.cells[1].textContent); })')) === q(cntCol.slice(0, 5)), 'D 再點一次：回到依上榜次數排');
  // 也顯示沒人上榜的遊戲
  const colsBefore = (await J('document.querySelectorAll("#playersWrap thead th").length'));
  await mouseClick('#pEmpty');
  const colsAfter = (await J('document.querySelectorAll("#playersWrap thead th").length'));
  ok(colsAfter === 2 + (await J('window.__SV.meta.ORDER.length')) && colsAfter > colsBefore, 'D 勾「也顯示沒人上榜的遊戲」：欄位變成全部 160 款（' + colsBefore + ' → ' + colsAfter + '）');
  await mouseClick('#pEmpty');
  // 名次只算期間內創下的成績：重新查詢帶日期
  const np = calls('MF_stats_players').length;
  await mouseClick('#pRange'); await idle();
  const pcr = calls('MF_stats_players').at(-1);
  ok(calls('MF_stats_players').length === np + 1 && pcr.args.p_from === addDays(today, -30) && pcr.args.p_to === today, 'D 勾「名次只算期間內創下的成績」：重新查，帶目前的日期範圍：' + q(pcr.args));
  const expPr = mock.expected.players(addDays(today, -30), today);
  ok(await J('document.querySelectorAll("#playersWrap tbody tr").length') === expPr.length && expPr.length < expP.length, 'D 玩家變少了（' + expP.length + ' → ' + expPr.length + ' 位）');
  ok((await status()).includes('只算') && (await status()).includes('內創下的成績'), 'D 狀態列說明現在只算期間內的：' + await status());
  await mouseClick('#pRange'); await idle();
  ok(await J('document.querySelectorAll("#playersWrap tbody tr").length') === expP.length && calls('MF_stats_players').length === np + 1, 'D 取消勾選：用回快取（沒有再連線）');

  // ═══ E. 時間分析 ═══
  await tabTo('time');
  const dc = calls('MF_stats_daily');
  ok(dc.length === 1 && dc[0].args.p_from === addDays(today, -30) && dc[0].args.p_to === today, 'E 切到「時間分析」才查每天的數字，帶目前的日期範圍：' + q(dc[0] && dc[0].args));
  const expD = mock.expected.daily(addDays(today, -30), today);
  const kp = await J('[].slice.call(document.querySelectorAll("#kpis .kpi")).map(function (k) { return [k.children[0].textContent, k.children[1].textContent]; })');
  ok(kp[0][0] === '期間總局數' && kp[0][1] === expD.plays.toLocaleString('en-US') && kp[1][0] === '期間玩家數' && kp[1][1] === String(expD.players), 'E 數字卡：期間總局數 ' + expD.plays + '、玩家 ' + expD.players + '：' + q(kp.slice(0, 2)));
  const maxP = expD.days.reduce((m, d) => d.plays > m.plays ? d : m);
  ok(kp[3][1] === maxP.plays.toLocaleString('en-US'), 'E 單日最多局數 ' + maxP.plays);
  ok(await J('document.querySelectorAll("#charts .chartbox").length') === 2, 'E 兩張圖（遊戲總次數、遊戲總人數；不共用縱軸）');
  const titles = await J('[].slice.call(document.querySelectorAll("#charts .chartbox h3")).map(function (h) { return h.textContent; })');
  ok(q(titles) === q(['每天遊戲總次數', '每天遊戲總人數']), 'E 圖的標題：' + q(titles));
  const pathN = await J('[].slice.call(document.querySelectorAll("#charts .chartbox path.line")).map(function (p) { return p.getAttribute("d").split("L").length; })');
  ok(q(pathN) === q([31, 31]), 'E 橫軸每天一個點（31 天，沒人玩的日子補 0）：' + q(pathN));
  const colors = await J('[].slice.call(document.querySelectorAll("#charts .chartbox")).map(function (b) { return getComputedStyle(b.querySelector("path.line")).stroke; })');
  ok(colors[0] !== colors[1] && colors.every(c => /^rgb/.test(c)), 'E 兩張圖用不同的顏色（藍、橘）：' + q(colors));
  const ticks0 = await J('[].slice.call(document.querySelectorAll("#charts .chartbox")[0].querySelectorAll("text")).map(function (t) { return t.textContent; })');
  ok(ticks0.includes('0') && ticks0.some(t => /^\d{4}\/\d+\/\d+$/.test(t)) && ticks0.some(t => /^\d+\/\d+$/.test(t)) && ticks0.some(t => t === expD.days.at(-1).plays.toLocaleString('en-US')), 'E 縱軸刻度、橫軸日期、終點數字：' + q(ticks0));
  ok(await J('document.getElementById("tableView").hidden') === false, 'E 有「表格檢視」');
  // 滑鼠移到圖上：垂直線＋提示框，列出那一天兩個數字
  const box = await J('(function(){ var b = document.querySelector("#charts .chartbox svg").getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; })()');
  await ev('window.scrollTo(0, 0)');
  const box2 = await J('(function(){ var b = document.querySelector("#charts .chartbox svg").getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; })()');
  const plotL = 54, plotR = 64, W = await J('window.__SV.chartState.W'), sc = box2.w / W;
  const target = 10;                                                   // 第 11 天
  const mx = box2.l + (plotL + (W - plotL - plotR) * target / 30) * sc, my = box2.t + box2.h / 2;
  await mouseAt(mx, my);
  await waitFor(async () => !(await J('document.getElementById("tip").hidden')), 3000, '提示框出現');
  const tip = await J('document.getElementById("tip").innerText.replace(/\\n+/g, " | ")');
  const day10 = addDays(today, -30 + target), e10 = expD.days.find(d => d.day === day10) || { plays: 0, players: 0 };
  ok(tip.includes(day10) && tip.includes('週') && tip.includes(e10.plays.toLocaleString('en-US')) && tip.includes(e10.players.toLocaleString('en-US')), 'E 滑鼠移到第 11 天：提示框列出日期與兩個數字（' + day10 + ' ' + e10.plays + ' 局 ' + e10.players + ' 人）：' + tip);
  ok(await J('document.querySelectorAll("#charts .cross[visibility=visible]").length') === 2, 'E 兩張圖同時出現垂直線');
  await shot('03_time_hover');
  await mouseAt(5, 5);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 });
  // 鍵盤：Tab 到圖、左右鍵移動
  await ev('document.querySelector("#charts .chartbox").focus()');
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  const kbIdx = await J('window.__SV.chartState.idx');
  ok(kbIdx === 29 && await J('document.getElementById("tip").hidden') === false, 'E 鍵盤：Tab 到圖上按左鍵，從最後一天往前一天（第 30 天）並顯示提示：idx=' + kbIdx);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  ok(await J('document.getElementById("tip").hidden') === true, 'E Esc 收起提示框');
  // 表格檢視：每天一列、新的在前
  await ev('document.getElementById("tableView").open = true');
  const tv = await J('[].slice.call(document.querySelectorAll("#timeTable tbody tr")).map(function (t) { return [t.cells[0].textContent, t.cells[1].textContent, t.cells[2].textContent]; })');
  ok(tv.length === 31 && tv[0][0].startsWith(today) && tv[30][0].startsWith(addDays(today, -30)), 'E 表格檢視：31 列、今天在最前面（' + tv[0][0] + '）');
  const gap = tv.find(r => r[1] === '0');
  ok(!!gap && gap[2] === '0', 'E 沒人玩的日子是 0 局 0 人（' + q(gap) + '）');
  await shot('04_time_table');
  // 沒有紀錄的期間：不畫圖、提示
  await setVal('dFrom', addDays(today, -300)); await setVal('dTo', addDays(today, -200));
  await mouseClick('#btnQuery'); await idle();
  ok(await J('document.querySelectorAll("#charts .chartbox").length') === 0 && (await J('document.querySelector("#charts .empty").textContent')).includes('沒有遊玩紀錄') && await J('document.getElementById("tableView").hidden') === true && await statusCls() === 'status status--warn', 'E 期間內沒人玩：不畫圖、提示沒有紀錄（狀態列橘色）：' + await status());
  await mouseClick('#btn30'); await idle();
  ok(await J('document.querySelectorAll("#charts .chartbox").length') === 2, 'E 換回有資料的期間：圖畫回來');
  // 圖會跟著視窗寬度重畫
  const w1 = await J('window.__SV.chartState.W');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false });
  await waitFor(async () => (await J('window.__SV.chartState.W')) !== w1, 3000, '視窗變窄之後圖重畫');
  ok(await J('window.__SV.chartState.W') < w1, 'E 視窗變窄：圖跟著重畫（' + w1 + ' → ' + await J('window.__SV.chartState.W') + '）');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(200);

  // ═══ F. 頁籤操作（鍵盤）與記住的選項 ═══
  await ev('document.getElementById("tab-time").focus()');
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await idle();
  ok(await J('document.getElementById("tab-games").getAttribute("aria-selected")') === 'true' && await J('document.activeElement.id') === 'tab-games', 'F 鍵盤右鍵：從最後一個頁籤繞回第一個，焦點跟著移動');
  ok(await J('location.hash') === '#games', 'F 網址記著目前的頁籤（#games）');
  await open(mock.url, '#time');
  ok(await J('document.getElementById("tab-time").getAttribute("aria-selected")') === 'true' && calls('MF_stats_daily').length >= 2, 'F 網址帶 #time：直接開在時間分析');

  // ═══ G. 錯誤 ═══
  const nofunc = await startMock({ goodKey: ANON, mode: 'nofunc' });
  await open(nofunc.url);
  ok((await status()).includes('資料庫還沒有統計函式') && (await status()).includes('MF_leaderboard.sql') && await statusCls() === 'status status--error' && await J('document.getElementById("btnQuery").disabled') === false, 'G 資料庫還沒執行新版 SQL：提示要重新執行 supabase/MF_leaderboard.sql：' + await status());
  await nofunc.close();
  const denied = await startMock({ goodKey: ANON, mode: 'denied' });
  await open(denied.url);
  ok((await status()).includes('不接受這把公開金鑰') && await statusCls() === 'status status--error', 'G 金鑰不被接受：' + await status());
  await denied.close();
  const slow = await startMock({ goodKey: ANON, mode: 'slow' });
  await cdp.send('Page.navigate', { url: 'about:blank' }); await sleep(80);
  await cdp.send('Page.navigate', { url: PAGE + '?api=' + encodeURIComponent(slow.url) + '#games' });       // 網頁會記住上次停在哪個頁籤，這裡指定開在遊戲分析
  await waitFor(async () => (await ev('document.readyState')) === 'complete' && (await ev('!!window.__SV')), 8000, '網頁載入');
  ok((await status()).includes('查詢中') && await J('document.getElementById("btnQuery").disabled') === true && await J('document.getElementById("btnQuery").textContent') === '查詢中…', 'G 查詢中：按鈕變灰、顯示「查詢中…」，不能連按');
  await idle();
  ok(await J('document.querySelectorAll("#gamesWrap tbody tr").length') > 10, 'G 慢的伺服器：等到資料回來照樣畫出來');
  await slow.close();
  const dead = await startMock({ goodKey: ANON }); const deadUrl = dead.url; await dead.close();
  await open(deadUrl);
  ok((await status()).includes('連不上 Supabase') && await J('document.getElementById("btnQuery").disabled') === false, 'G 連不上：' + await status());
  ok(q(await J('(function(){ var c = window.__SV.cleanUrl; return [c("http://example.com"), c("ftp://x.supabase.co"), c("javascript:alert(1)"), c("abc"), c("https://abc.supabase.co/rest/v1/"), c("http://localhost:8000/x")]; })()')) === q([null, null, null, null, 'https://abc.supabase.co', 'http://localhost:8000']), 'G 網址檢查：只接受 https 或本機');

  // ═══ H. 純函式 ═══
  const fn = await J(`(function(){ var S = window.__SV; return {
      nice: [S.niceScale(0, 4), S.niceScale(3, 4), S.niceScale(37, 4), S.niceScale(1234, 4), S.niceScale(99999, 4)],
      comp: [S.fmtCompact(0), S.fmtCompact(950), S.fmtCompact(1000), S.fmtCompact(1500), S.fmtCompact(25000), S.fmtCompact(2000000)],
      score: [S.fmtScore({ decimals: 4, format: '{v} 秒' }, 0.12345), S.fmtScore({ decimals: 0, format: '第 {v} 關' }, 21), S.fmtScore({ decimals: 0, format: '{v} 分', group: true }, 117681), S.fmtScore(null, 5), S.fmtScore({ decimals: 0, format: '{v}' }, null), S.fmtScore({ decimals: 0, format: '{v}' }, NaN)],
      fill: S.fillDays('2026-10-01', '2026-10-05', [{ day: '2026-10-02', plays: 4, players: 2 }, { day: '2026-10-05', plays: 1, players: 1 }]),
      alpha: [S.rankAlpha(1), S.rankAlpha(30), S.rankAlpha(15)],
      add: [S.addDays('2026-10-31', 1), S.addDays('2026-01-01', -1), S.addDays('2026-03-01', -1)]
    }; })()`);
  ok(q(fn.nice[0]) === q({ max: 1, ticks: [0, 1] }) && q(fn.nice[1]) === q({ max: 4, ticks: [0, 1, 2, 3, 4] }) || fn.nice[1].max >= 3, 'H niceScale 小數字：' + q(fn.nice.slice(0, 2)));
  ok(fn.nice.every(s => s.ticks[0] === 0 && s.ticks.at(-1) === s.max && s.ticks.length >= 2 && s.ticks.length <= 8), 'H niceScale：從 0 開始、最後一格就是最大值、刻度數合理：' + q(fn.nice));
  ok(fn.nice[2].max >= 37 && fn.nice[3].max >= 1234 && fn.nice[4].max >= 99999, 'H niceScale：最大值一定涵蓋資料');
  ok(q(fn.comp) === q(['0', '950', '1K', '1.5K', '25K', '2M']), 'H fmtCompact：' + q(fn.comp));
  ok(q(fn.score) === q(['0.1235 秒', '第 21 關', '117,681 分', '5', '—', '—']), 'H fmtScore：' + q(fn.score));
  ok(q(fn.fill.map(d => [d.day.slice(8), d.plays, d.players])) === q([['01', 0, 0], ['02', 4, 2], ['03', 0, 0], ['04', 0, 0], ['05', 1, 1]]), 'H fillDays：沒人玩的日子補 0');
  ok(fn.alpha[0] > fn.alpha[2] && fn.alpha[2] > fn.alpha[1] && fn.alpha[0] <= 0.7 && fn.alpha[1] >= 0.1, 'H 名次越前面底色越深：' + q(fn.alpha));
  ok(q(fn.add) === q(['2026-11-01', '2025-12-31', '2026-02-28']), 'H addDays 跨月跨年：' + q(fn.add));
  ok(q(await J('window.__SV.meta.CATS.map(function (c) { return c.name; })')) === q(['記憶', '視覺', '反應', '數字', '邏輯', '手感', '目測']) && await J('window.__SV.meta.ORDER.length') === 160 && await J('Object.keys(window.__SV.meta.GAMES).length') === 160, 'H 七種分類、160 款遊戲的資料');

  // ═══ I. 版面與深色 ═══
  await open(mock.url);
  const lay = await J('(function(){ return { sw: document.documentElement.scrollWidth, iw: window.innerWidth }; })()');
  ok(lay.sw <= lay.iw, 'I 1366 寬的視窗沒有出現整頁的橫向捲軸：' + q(lay));
  await tabTo('players'); await shot('05_players_full');
  await tabTo('time');
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await sleep(200); await shot('06_time_dark');
  await tabTo('games'); await shot('07_games_dark');
  ok((await ev('window.__errs.length')) === 0, '整個過程沒有 JS 錯誤／CSP 違規：' + q(await ev('window.__errs')));
} finally {
  cdp.close();
  await mock.close();
}
console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS (' + total + ' checks)　截圖在 ' + OUT);
process.exit(bad ? 1 : 0);
