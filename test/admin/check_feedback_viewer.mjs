// 玩家意見查閱頁（admin/feedback.html）的瀏覽器測試：
//   · 啟動「假的 Supabase REST 伺服器」（mock_postgrest.mjs，不連網路）＋看不見視窗的 Chrome／Edge；
//   · 把網頁當成使用者那樣操作（設時間與 id 範圍、勾選、按複製…），檢查畫面與「網頁實際送出的請求」；
//   · 不需要本機網站伺服器：網頁是用 file:// 直接開的（跟你雙擊開啟一樣），用網址後面的 ?api=… 指到假伺服器。
// 用法（在專案根目錄）：node test/admin/check_feedback_viewer.mjs [--out 截圖資料夾]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connect, sleep } from '../reaction/cdp.mjs';
import { startMock, makeRows } from './mock_postgrest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE_FILE = path.resolve(HERE, '../../admin/feedback.html');
const PAGE = pathToFileURL(PAGE_FILE).href;
const args = process.argv.slice(2);
const OUT = path.resolve(args.indexOf('--out') >= 0 ? args[args.indexOf('--out') + 1] : path.join(os.tmpdir(), 'fm-admin-check'));
fs.mkdirSync(OUT, { recursive: true });

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };

// 網頁裡寫死的公開 anon 金鑰（跟遊戲 js/leaderboard.js 裡的同一把）
const html = fs.readFileSync(PAGE_FILE, 'utf8');
const ANON = /var ANON_KEY = '([^']+)'/.exec(html)[1];
const gameKey = /KEY:\s*'([^']+)'/.exec(fs.readFileSync(path.resolve(HERE, '../../js/leaderboard.js'), 'utf8'))[1];
const role = JSON.parse(Buffer.from(ANON.split('.')[1], 'base64url').toString()).role;
ok(ANON === gameKey && role === 'anon', '網頁裡的金鑰跟遊戲用的是同一把公開的 anon 金鑰（role=' + role + '）');
ok(!/service_role['"]?\s*[:=]\s*['"]eyJ/.test(html) && !/sb_secret_[A-Za-z0-9]/.test(html), '網頁裡沒有任何 service_role／secret 金鑰');

// 資料：60 筆，每筆差 4 小時，從 12 天前排到 2 天前 → 預設的「7 天前到今天」只會看到後面一部分
const NOW = Date.now();
const mock = await startMock({ rows: makeRows(60, { startMs: NOW - 12 * 86400000, stepMin: 240 }), goodKey: ANON });
const rows = mock.rows;

// 預設時間範圍（跟網頁的規則一樣：7 天前 00:00 到今天 23:59，用這台電腦的時區；終點再加 59.999 秒）
const d0 = new Date();
const defFrom = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - 7, 0, 0);
const defTo = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 23, 59);
const p2 = n => String(n).padStart(2, '0');
const inputStr = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());
const inDefault = r => { const t = Date.parse(r.created_at); return t >= defFrom.getTime() && t <= defTo.getTime() + 59999; };
const expectIds = rows.filter(inDefault).map(r => r.id).sort((a, b) => b - a);     // 預設會看到的 id（由大到小）
ok(expectIds.length > 10 && expectIds.length < 60, '測試資料設計：預設範圍看得到一部分（' + expectIds.length + ' 筆），不是全部');

const cdp = await connect();
try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 800, deviceScaleFactor: 1, mobile: false });
  // 主要流程用淺色配色（多數人的電腦），最後再換深色拍一張
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  // 記錄 JS 錯誤與 CSP 違規（網頁一載入就開始記）
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs = []; window.addEventListener('error', function (e) { window.__errs.push('error: ' + e.message); }); window.addEventListener('unhandledrejection', function (e) { window.__errs.push('rejection: ' + (e.reason && e.reason.message)); }); document.addEventListener('securitypolicyviolation', function (e) { window.__errs.push('CSP: ' + e.violatedDirective + ' ' + e.blockedURI); });` });
  try { await cdp.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }); } catch (e) { /* 不支援就用假的剪貼簿測 */ }

  // ── 小工具 ──
  const ev = (js) => cdp.evalJs(js);
  const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v === undefined ? undefined : JSON.parse(v); };
  const q = JSON.stringify;
  const setVal = (id, v) => ev(`(function(){ var e = document.getElementById(${q(id)}); e.value = ${q(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const setCheck = (id, v) => ev(`(function(){ var e = document.getElementById(${q(id)}); if (e.checked !== ${!!v}) e.click(); })()`);
  const waitFor = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(60); } throw new Error('等不到：' + what); };
  const status = () => J('document.getElementById("status").textContent');
  const rowCount = () => J('document.querySelectorAll("#tableWrap tbody tr").length');
  const headers = () => J('[].slice.call(document.querySelectorAll("#tableWrap thead th")).slice(1).map(function (t) { return t.firstChild.textContent; })');
  const idsShown = () => J('[].slice.call(document.querySelectorAll("#tableWrap tbody tr")).map(function (t) { return Number(t.dataset.id); })');
  const idle = () => waitFor(async () => !(await J('document.getElementById("btnQuery").disabled')), 15000, '查詢結束');
  // 等到「查詢完成」：按鈕恢復、狀態列不是「查詢中」
  const settled = async () => { await idle(); await waitFor(async () => !(await status()).includes('查詢中'), 15000, '狀態列更新'); };
  // 真的滑鼠點一下某個元件的中心（確認它看得到、沒有被別的東西蓋住）
  const mouseClick = async (selector) => {
    const r = await J(`(function(){ var e = document.querySelector(${q(selector)}); e.scrollIntoView({ block: 'center' }); var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
  };
  const shot = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); };
  // 開網頁；api 指到假伺服器（?api=…）。回傳時網頁已經載入完、第一次查詢也跑完了
  const open = async (api) => {
    await cdp.send('Page.navigate', { url: PAGE + '?api=' + encodeURIComponent(api) });
    await waitFor(async () => (await ev('document.readyState')) === 'complete' && (await ev('!!window.__FV')), 8000, '網頁載入');
    await settled();
  };
  const param = (req, name) => new URLSearchParams(req.query).getAll(name);
  const reqsOf = (m) => m.requests;
  const lastTwo = () => mock.requests.slice(-2);           // 一次查詢＝兩個請求（第一頁、再試下一頁拿到空的）
  const local = (iso) => J(`(function(){ var d = new Date(${q(iso)}.replace(/(\\.\\d{3})\\d+/, '$1')); function p(n){ return n < 10 ? '0' + n : '' + n; } return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); })()`);

  // ═══ A. 打開：不需要金鑰，自動查「7 天前到今天」 ═══
  await open(mock.url);
  ok(await J('document.getElementById("key") === null && document.getElementById("conn") === null && document.querySelectorAll("input[type=password]").length === 0'), 'A 沒有任何金鑰／密碼欄位，也沒有「連線設定」');
  ok(await J('document.getElementById("tFrom").value') === inputStr(defFrom) && await J('document.getElementById("tTo").value') === inputStr(defTo), 'A 預設時間範圍＝7 天前 00:00 到今天 23:59：' + await J('document.getElementById("tFrom").value') + ' ～ ' + await J('document.getElementById("tTo").value'));
  ok(mock.requests.length === 2, 'A 一打開就自動查（一頁讀到、再試下一頁拿到空的收工＝2 個請求）：' + mock.requests.length);
  const r0 = mock.requests[0];
  ok(r0.path === '/rest/v1/MF_feedback_public' && !mock.requests.some(r => r.path === '/rest/v1/MF_feedback'), 'A 查的是公開檢視表 MF_feedback_public（不碰被鎖的資料表）：' + r0.path);
  ok(r0.apikey === ANON && r0.authorization === 'Bearer ' + ANON, 'A 只用公開的 anon 金鑰');
  const gte = param(r0, 'created_at').find(v => v.startsWith('gte.')), lte = param(r0, 'created_at').find(v => v.startsWith('lte.'));
  ok(gte === 'gte.' + defFrom.toISOString() && lte === 'lte.' + new Date(defTo.getTime() + 59999).toISOString(), 'A 請求帶著預設的時間範圍：' + gte + ' ' + lte);
  ok(param(r0, 'order')[0] === 'id.desc' && param(r0, 'limit')[0] === '1000' && param(r0, 'offset')[0] === '0' && param(r0, 'id').length === 0, 'A 其他參數：' + r0.query.replace(/created_at=[^&]*&?/g, ''));
  ok(JSON.stringify(await idsShown()) === JSON.stringify(expectIds), 'A 只顯示 7 天內的意見（' + expectIds.length + ' 筆，新的在前）：' + JSON.stringify((await idsShown()).slice(0, 5)) + '…');
  ok(JSON.stringify(await headers()) === JSON.stringify(['id', 'created_at', 'game_id', 'game_title', 'message', 'nickname', 'app_version']), 'A 預設顯示每一個欄位（公開檢視表沒有 player_id）：' + JSON.stringify(await headers()));
  ok((await status()).startsWith('共 ' + expectIds.length + ' 筆') && await J('document.getElementById("status").className') === 'status status--ok', 'A 狀態列：' + await status());
  ok(await J('document.getElementById("only3").checked') === false && await J('document.getElementById("copyHeader").checked') === true && await J('document.getElementById("prefixOn").checked') === false, 'A 勾選框的預設值（只顯示三欄＝不勾）');
  ok(await J('document.getElementById("prefixText").value') === '請根據以下玩家回饋建議去修改程式碼', 'A 預設的開頭一句話');
  const first = await J('[].slice.call(document.querySelectorAll("#tableWrap tbody tr")[0].cells).slice(1).map(function (c) { return c.textContent; })');
  ok(first[0] === '60' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(first[1]) && first[2] === 'coins' && first[3] === '零錢分類', 'A 第一列內容：' + JSON.stringify(first));
  ok(await J('document.getElementById("conn")') === null && (await ev('window.__errs.length')) === 0, 'A 沒有 JS 錯誤／CSP 違規：' + q(await ev('window.__errs')));
  await shot('01_default_last7days');

  // ═══ B. 只顯示 game_id game_title message ═══
  const nReq = mock.requests.length;
  await mouseClick('#only3');                                 // 真的用滑鼠點勾選框
  ok(await J('document.getElementById("only3").checked') === true, 'B 勾選框被勾起來');
  ok(JSON.stringify(await headers()) === JSON.stringify(['game_id', 'game_title', 'message']), 'B 只剩三個欄位：' + JSON.stringify(await headers()));
  ok(await rowCount() === expectIds.length && mock.requests.length === nReq, 'B 切換欄位不用重新查（列數不變、沒有新請求）');
  await shot('02_three_columns');
  // 不按「複製」，直接用滑鼠選取整個表格再 Ctrl+C：勾選欄與標題的中文小字不能跟進去，每列也是乾淨的 Tab 分隔
  const sel = await ev(`(function(){ var t = document.querySelector('#tableWrap table'); var s = getSelection(); s.removeAllRanges(); var r = document.createRange(); r.selectNodeContents(t); s.addRange(r); var out = String(s); s.removeAllRanges(); return out; })()`);
  const selLines = sel.split('\n');
  ok(selLines[0] === 'game_id\tgame_title\tmessage' && selLines[1].split('\t').length === 3 && selLines[1].startsWith('coins\t零錢分類\t'), 'B 用滑鼠選取整個表格再複製，也是乾淨的 Tab 分隔：' + q(selLines.slice(0, 2)));

  // ═══ C. 複製 ═══
  const N = expectIds.length;
  // C1 真的剪貼簿（真的滑鼠按一下複製，再用 clipboard.readText 讀回來）
  let realClip = null;
  try { await mouseClick('#btnCopy'); await sleep(300); realClip = await ev('navigator.clipboard.readText()'); } catch (e) { realClip = null; }
  // C2 假的剪貼簿：攔下網頁要複製的文字
  await ev('window.__clip = null; Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: function (t) { window.__clip = t; return Promise.resolve(); } } });');
  await mouseClick('#btnCopy');
  await waitFor(async () => (await ev('window.__clip')) !== null, 3000, '複製的文字');
  const clip = await ev('window.__clip');
  const lines = clip.split('\n');
  ok(lines.length === N + 1, 'C 標題列＋' + N + ' 列＝' + (N + 1) + ' 行：' + lines.length);
  ok(lines[0] === 'game_id\tgame_title\tmessage', 'C 標題列只有三個欄位：' + q(lines[0]));
  ok(lines[1].split('\t').length === 3 && lines[1].startsWith('coins\t零錢分類\t第 60 則意見'), 'C 第一列（id 60）：' + q(lines[1]));
  const l54 = lines.find(l => l.includes('第 54 則'));      // id 54：訊息本來有三行
  ok(l54 && l54.includes('第一行 ⏎ 第二行（有換行） ⏎ 第三行') && l54.split('\t').length === 3, 'C 意見裡的換行變成「 ⏎ 」，一列一行：' + q(l54));
  const realNorm = realClip === null ? null : realClip.replace(/\r\n/g, '\n');     // Windows 的剪貼簿換行是 CRLF，讀回來時可能多了 \r
  ok(realNorm === null || realNorm === clip, 'C 真的剪貼簿的內容跟攔到的一樣');
  console.log('（真的剪貼簿：' + (realNorm === null ? '這個環境讀不到，只測了攔截版' : '有讀回來並且比對過') + '）');
  ok((await J('document.getElementById("toast").textContent')).includes('已複製 ' + N + ' 列'), 'C 有「已複製」的小提示');
  // C3 取消兩列勾選（id 60、59）
  await ev('document.querySelectorAll("#tableWrap tbody tr")[0].querySelector("input.pick").click(); document.querySelectorAll("#tableWrap tbody tr")[1].querySelector("input.pick").click();');
  ok((await J('document.getElementById("btnCopy").textContent')) === '複製（' + (N - 2) + ' 列）', 'C 複製按鈕的數字跟著變：' + await J('document.getElementById("btnCopy").textContent'));
  ok(await J('document.getElementById("pickAll").indeterminate') === true, 'C 表頭的全選框變半勾');
  ok((await J('document.getElementById("pickInfo").textContent')) === '已勾選 ' + (N - 2) + ' / ' + N + ' 列', 'C 已勾選 ' + (N - 2) + ' / ' + N + ' 列');
  await ev('window.__clip = null'); await mouseClick('#btnCopy');
  await waitFor(async () => (await ev('window.__clip')) !== null, 3000, '複製的文字');
  const clip2 = (await ev('window.__clip')).split('\n');
  ok(clip2.length === N - 1 && !clip2.some(l => l.includes('第 60 則') || l.includes('第 59 則')), 'C 被取消勾選的列不會被複製：' + clip2.length);
  // C4 全選／全不選
  await ev('document.getElementById("pickAll").click()');
  ok((await J('document.getElementById("btnCopy").textContent')) === '複製（' + N + ' 列）', 'C 全選');
  await ev('document.getElementById("pickAll").click()');
  ok(await J('document.getElementById("btnCopy").disabled') === true && (await J('document.getElementById("btnCopy").textContent')) === '複製（0 列）', 'C 全不選時複製按鈕反灰');
  await ev('document.getElementById("pickAll").click()');
  // C5 選項：不加欄位名稱、最前面加一句話
  await setCheck('copyHeader', false);
  await setCheck('prefixOn', true);
  await ev('window.__clip = null'); await mouseClick('#btnCopy');
  await waitFor(async () => (await ev('window.__clip')) !== null, 3000, '複製的文字');
  const clip3 = (await ev('window.__clip')).split('\n');
  ok(clip3[0] === '請根據以下玩家回饋建議去修改程式碼' && clip3.length === N + 1 && clip3[1].startsWith('coins\t'), 'C 最前面加一句話、沒有欄位名稱：' + q(clip3.slice(0, 2)));
  ok(await J('JSON.parse(localStorage.getItem("mf.fbview.v1")).prefixOn') === true && await J('JSON.parse(localStorage.getItem("mf.fbview.v1")).copyHeader') === false, 'C 複製選項有記住');
  await setCheck('copyHeader', true); await setCheck('prefixOn', false);
  // C6 全部欄位時複製
  await setCheck('only3', false);
  await ev('window.__clip = null'); await mouseClick('#btnCopy');
  await waitFor(async () => (await ev('window.__clip')) !== null, 3000, '複製的文字');
  const clip4 = (await ev('window.__clip')).split('\n');
  ok(clip4[0] === 'id\tcreated_at\tgame_id\tgame_title\tmessage\tnickname\tapp_version' && clip4[1].split('\t').length === 7, 'C 全部欄位的標題列：' + q(clip4[0]));
  ok(clip4[1].split('\t')[5] === '', 'C 暱稱是空的（id 60 是 3 的倍數，沒有暱稱）：' + q(clip4[1]));

  // ═══ D. id 範圍 ═══（先把時間範圍清掉，才看得到 7 天以前的）
  await mouseClick('#btnAllTime'); await settled();
  ok(await rowCount() === 60 && await J('document.getElementById("tFrom").value') === '', 'D 「不限時間」：清掉時間範圍並重新查，60 筆全部出現');
  await setVal('idFrom', '10'); await setVal('idTo', '20');
  await mouseClick('#btnQuery'); await settled();
  ok(JSON.stringify(await idsShown()) === JSON.stringify([20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10]), 'D id 10～20（含頭尾）共 11 列：' + JSON.stringify(await idsShown()));
  ok(lastTwo().every(r => param(r, 'id').join() === 'gte.10,lte.20' && param(r, 'created_at').length === 0), 'D 每個請求都帶 id=gte.10&id=lte.20（時間不限就不帶）：' + lastTwo()[0].query);
  ok((await status()).includes('共 11 筆') && (await status()).includes('id 10 ～ 20'), 'D 狀態列：' + await status());
  await setVal('idFrom', '58'); await setVal('idTo', '');
  await mouseClick('#btnQuery'); await settled();
  ok(JSON.stringify(await idsShown()) === JSON.stringify([60, 59, 58]), 'D 只填起點：id ≥ 58 → ' + JSON.stringify(await idsShown()));
  await setVal('idFrom', '1'); await setVal('idTo', '5'); await setVal('order', 'asc');
  await mouseClick('#btnQuery'); await settled();
  ok(JSON.stringify(await idsShown()) === JSON.stringify([1, 2, 3, 4, 5]) && param(lastTwo()[0], 'order')[0] === 'id.asc', 'D 舊的在前：' + JSON.stringify(await idsShown()));
  await setVal('order', 'desc');

  // ═══ E. 時間範圍（用這台電腦的時區） ═══
  await setVal('idFrom', ''); await setVal('idTo', '');
  await setVal('tFrom', await local(rows[19].created_at)); await setVal('tTo', await local(rows[29].created_at));   // id 20 ～ id 30 那一分鐘
  await mouseClick('#btnQuery'); await settled();
  ok(JSON.stringify(await idsShown()) === JSON.stringify([30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20]), 'E 時間範圍（起訖都含）→ id 20～30：' + JSON.stringify(await idsShown()));
  const g2 = param(lastTwo()[0], 'created_at').find(v => v.startsWith('gte.')), l2 = param(lastTwo()[0], 'created_at').find(v => v.startsWith('lte.'));
  ok(/^gte\.\d{4}-\d\d-\d\dT\d\d:\d\d:00\.000Z$/.test(g2) && /^lte\.\d{4}-\d\d-\d\dT\d\d:\d\d:59\.999Z$/.test(l2), 'E 起點取 0 秒、終點取 59.999 秒（換成 UTC）：' + g2 + ' ' + l2);
  // 快速按鈕：「今天」「最近 7 天」「最近 30 天」按了就查
  rows.push(Object.assign({}, rows[0], { id: 61, message: '剛剛才寄的意見', created_at: new Date(Date.now()).toISOString().replace(/\.\d{3}Z$/, '.5+00:00') }));
  await mouseClick('#btnToday'); await settled();
  ok((await J('document.getElementById("tFrom").value')) === inputStr(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 0, 0)) && (await J('document.getElementById("tTo").value')) === inputStr(defTo), 'E 「今天」＝今天 00:00 到 23:59');
  ok(JSON.stringify(await idsShown()) === JSON.stringify([61]), 'E 「今天」查得到剛剛新增的那一筆：' + JSON.stringify(await idsShown()));
  await mouseClick('#btn7'); await settled();
  ok((await J('document.getElementById("tFrom").value')) === inputStr(defFrom) && JSON.stringify(await idsShown()) === JSON.stringify([61].concat(expectIds)), 'E 「最近 7 天」＝7 天前到今天（跟預設一樣）：' + (await idsShown()).length + ' 筆');
  await mouseClick('#btn30'); await settled();
  ok((await J('document.getElementById("tFrom").value')) === inputStr(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - 30, 0, 0)) && (await rowCount()) === 61, 'E 「最近 30 天」：全部 61 筆');
  await mouseClick('#btnAllTime'); await settled();
  ok(await rowCount() === 61 && await J('document.getElementById("tFrom").value') === '' && await J('document.getElementById("tTo").value') === '', 'E 「不限時間」');
  rows.pop();

  // ═══ F. 不合理的範圍：不送請求，直接提醒 ═══
  const n0 = mock.requests.length;
  await setVal('idFrom', '30'); await setVal('idTo', '10');
  await mouseClick('#btnQuery'); await sleep(200);
  ok((await status()).includes('id 的起點比終點大') && mock.requests.length === n0, 'F id 起點比終點大：' + await status());
  await setVal('idFrom', ''); await setVal('idTo', '');
  await setVal('tFrom', '2026-10-05T10:00'); await setVal('tTo', '2026-10-04T10:00');
  await mouseClick('#btnQuery'); await sleep(200);
  ok((await status()).includes('時間的起點比終點晚') && mock.requests.length === n0, 'F 時間起點比終點晚：' + await status());
  await setVal('idFrom', '7');
  await mouseClick('#btnClear'); await settled();                  // 「恢復預設」：時間改回 7 天前到今天、id 清空
  ok(await J('document.getElementById("idFrom").value') === '' && await J('document.getElementById("tFrom").value') === inputStr(defFrom) && await J('document.getElementById("tTo").value') === inputStr(defTo), 'F 「恢復預設」：時間回到 7 天前到今天、id 清空');
  ok(JSON.stringify(await idsShown()) === JSON.stringify(expectIds), 'F 「恢復預設」之後重新查：' + (await idsShown()).length + ' 筆');

  // ═══ G. 沒有符合的資料 ═══
  await setVal('idFrom', '1000'); await mouseClick('#btnQuery'); await settled();
  ok((await status()) === '沒有符合條件的意見。' && await rowCount() === 0 && (await J('document.getElementById("btnCopy").disabled')) === true, 'G 沒有資料：沒有表格、複製按鈕反灰');
  await setVal('idFrom', '');

  // ═══ H. 惡意內容只是文字（XSS） ═══
  await mouseClick('#btnAllTime'); await settled();
  const xss = await J('(function(){ var td = document.querySelector("#tableWrap tr[data-id=\\"7\\"] td.col-message"); return { text: td.textContent, imgs: document.querySelectorAll("#tableWrap img, #tableWrap script").length, flag: window.__xss === undefined }; })()');
  ok(xss.text.includes('<img src=x onerror=') && xss.text.includes('<script>window.__xss=2</script>') && xss.imgs === 0 && xss.flag, 'H 意見裡的 <img onerror>、<script> 只是文字，沒有執行：' + q(xss));
  ok((await ev('window.__errs.length')) === 0, 'H 到目前為止沒有 JS 錯誤／CSP 違規：' + q(await ev('window.__errs')));

  // ═══ I. 接續上次（已處理到 id） ═══
  await mouseClick('#btnClear'); await settled();
  ok(await J('document.getElementById("btnNext").hidden') === true, 'I 還沒記錄時沒有「從 id N 開始查」');
  ok((await J('document.getElementById("btnMark").textContent')).includes('（60）'), 'I 記錄按鈕顯示目前最大 id：' + await J('document.getElementById("btnMark").textContent'));
  await mouseClick('#btnMark');
  ok(await J('JSON.parse(localStorage.getItem("mf.fbview.v1")).seenId') === 60, 'I 記住了最大 id 60');
  ok((await J('document.getElementById("btnNext").textContent')) === '從 id 61 開始查' && (await J('document.getElementById("seenText").textContent')) === '已處理到 id 60', 'I 出現「從 id 61 開始查」');
  await mouseClick('#btnNext'); await settled();
  ok(await J('document.getElementById("idFrom").value') === '61' && await J('document.getElementById("idTo").value') === '' && (await status()) === '沒有符合條件的意見。', 'I 按下去：id 起點 61、終點空白，而且馬上查（目前沒有新意見）');
  const fresh = (id, msg) => Object.assign({}, rows[0], { id, message: msg, created_at: new Date(Date.now()).toISOString().replace(/\.\d{3}Z$/, '.5+00:00') });
  rows.push(fresh(61, '新的意見'), fresh(62, '又一則新的意見'));
  await mouseClick('#btnNext'); await settled();
  ok(JSON.stringify(await idsShown()) === JSON.stringify([62, 61]), 'I 有新意見就只查到新的：' + JSON.stringify(await idsShown()));
  rows.length = 60;
  await mouseClick('#btnClearSeen');
  ok(await J('document.getElementById("btnNext").hidden') === true, 'I 清除記錄後按鈕消失');

  // ═══ J. 重新整理：選項有記住；以前記住過的金鑰會被清掉 ═══
  await setCheck('only3', true);
  await ev('localStorage.setItem("mf.fbview.v1", JSON.stringify(Object.assign(JSON.parse(localStorage.getItem("mf.fbview.v1")), { key: "OLD_SERVICE_KEY_SHOULD_BE_ERASED", remember: true, url: "https://old.example" })))');
  const nBefore = mock.requests.length;
  await open(mock.url);
  const stored = await J('JSON.parse(localStorage.getItem("mf.fbview.v1"))');
  ok(stored.key === undefined && stored.remember === undefined && stored.url === undefined, 'J 舊版存的金鑰、網址被清掉了：' + JSON.stringify(Object.keys(stored)));
  ok(mock.requests.slice(nBefore).every(r => r.apikey === ANON), 'J 重新整理之後還是只用公開金鑰');
  ok(await J('document.getElementById("only3").checked') === true && JSON.stringify(await headers()) === JSON.stringify(['game_id', 'game_title', 'message']), 'J 「只顯示三欄」的選擇有記住');
  ok(JSON.stringify(await idsShown()) === JSON.stringify(expectIds), 'J 重新整理之後自動查 7 天內的意見');
  await setCheck('only3', false);

  // ═══ K. 資料很多：分頁讀完／超過上限會提醒 ═══
  const big = await startMock({ rows: makeRows(2500, { startMs: NOW - 3 * 86400000, stepMin: 1 }), goodKey: ANON, maxRows: 1000 });
  await open(big.url);
  ok(await rowCount() === 2500, 'K 2500 筆都讀到了：' + await rowCount());
  ok(big.requests.map(r => param(r, 'offset')[0]).join() === '0,1000,2000,2500', 'K 伺服器一次只給 1000 筆：分 3 頁讀完，第 4 次拿到空的收工（offset ' + big.requests.map(r => param(r, 'offset')[0]).join() + '）');
  ok(new Set(await idsShown()).size === 2500, 'K 2500 列都不重複');
  await big.close();
  const huge = await startMock({ rows: makeRows(6200, { startMs: NOW - 4 * 86400000, stepMin: 1 }), goodKey: ANON, maxRows: 1000 });
  await open(huge.url);
  ok(await rowCount() === 5000 && (await status()).includes('只讀了前 5000 筆') && await J('document.getElementById("status").className') === 'status status--warn', 'K 超過 5000 筆：只顯示 5000 筆並用橘色提醒縮小範圍：' + await status());
  await huge.close();

  // ═══ L. 資料庫還沒執行新版 SQL／連不上／金鑰不被接受 ═══
  const noview = await startMock({ rows: makeRows(5), goodKey: ANON, mode: 'noview' });
  await open(noview.url);
  ok((await status()).includes('重新執行最新的 supabase/MF_leaderboard.sql') && (await status()).includes('MF_feedback_public') && await J('document.getElementById("status").className') === 'status status--error' && await rowCount() === 0, 'L 找不到檢視表（還沒執行新版 SQL）：' + await status());
  await shot('03_error_need_sql');
  await noview.close();
  const locked = await startMock({ rows: makeRows(5), goodKey: ANON, mode: 'locked' });
  await open(locked.url);
  ok((await status()).includes('重新執行最新的 supabase/MF_leaderboard.sql'), 'L 有檢視表但沒開放讀取：' + await status());
  await locked.close();
  const wrongKey = await startMock({ rows: makeRows(5), goodKey: 'SOME_OTHER_KEY' });
  await open(wrongKey.url);
  ok((await status()).includes('不接受這把公開金鑰') && (await status()).includes('Invalid API key'), 'L 金鑰不被接受（網址指到別的專案）：' + await status());
  await wrongKey.close();
  await open(mock.url);                                            // 伺服器正常
  const dead = await startMock({ rows: makeRows(5), goodKey: ANON });
  const deadUrl = dead.url; await dead.close();
  await open(deadUrl);
  ok((await status()).includes('連不上 Supabase') && await J('document.getElementById("btnQuery").disabled') === false, 'L 連不上：' + await status());
  // 網址參數只接受 https 或本機
  ok(await J('(function(){ var f = window.__FV; return f.config.base === ' + q(deadUrl) + '; })()'), 'L ?api= 指到本機的網址有生效');
  ok(JSON.stringify(await J('(function(){ var c = window.__FV.cleanUrl; return [c("http://example.com"), c("ftp://x.supabase.co"), c("javascript:alert(1)"), c("abc"), c("https://abc.supabase.co/rest/v1/"), c("http://localhost:8000/x")]; })()')) === JSON.stringify([null, null, null, null, 'https://abc.supabase.co', 'http://localhost:8000']), 'L 網址檢查：只接受 https 或本機，其他（http 外部網站、ftp、javascript:）一律不要，多貼的路徑會被去掉');
  await open(mock.url);

  // ═══ M. 版面 ═══
  const lay = await J('(function(){ return { sw: document.documentElement.scrollWidth, iw: window.innerWidth }; })()');
  ok(lay.sw <= lay.iw, 'M 1366 寬的視窗沒有出現整頁的橫向捲軸：' + q(lay));
  await setCheck('only3', true);
  await shot('04_three_columns_final');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
  await setCheck('only3', false);
  await sleep(150);
  await shot('05_narrow_all_columns');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await sleep(150);
  await shot('06_dark_mode');
  ok((await ev('window.__errs.length')) === 0, '整個過程沒有 JS 錯誤／CSP 違規：' + q(await ev('window.__errs')));
} finally {
  cdp.close();
  await mock.close();
}
console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS (' + total + ' checks)　截圖在 ' + OUT);
process.exit(bad ? 1 : 0);
