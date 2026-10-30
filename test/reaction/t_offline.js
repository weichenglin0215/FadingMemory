// 「安裝與離線」彈窗（V1.38.0）：js/offline.js（資料與動作）、js/offline_ui.js（畫面）、sw.js 的 message 事件、漢堡選單的入口
//   · buildRows：六列（加到主畫面、離線遊玩、雲端同步、儲存空間、檢查更新、清除離線資料）在各種狀態下的文字與按鈕
//   · status／checkUpdate／applyUpdate／clearAll／syncNow：用假的 Service Worker、假的 caches、假的 fetch 驗證
//   · sw.js 的 STATUS／REFRESH 訊息在 t_sw.js 驗證；實際點擊、捲動在瀏覽器驗證
const fs = require('fs');
const path = require('path');
const { game } = require('./load.js');                  // 設定好 window／UI，並載入 js/leaderboard.js
const ROOT = path.resolve(__dirname, '../../') + '/';
const rd = p => fs.readFileSync(ROOT + p, 'utf8');

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };

const mem = new Map();
global.UI.store = { get: (k, f) => (mem.has(k) ? JSON.parse(mem.get(k)) : f), set: (k, v) => mem.set(k, JSON.stringify(v)), remove: k => mem.delete(k) };
global.UI.ready = () => { };
require(ROOT + 'js/offline.js');
const O = global.FMOffline, LB = global.Leaderboard;

// ═══ 1. 純函式 ═══
ok(O.formatBytes(0) === '0 B' && O.formatBytes(1023) === '1023 B' && O.formatBytes(2048) === '2 KB' && O.formatBytes(5.17 * 1048576) === '5.2 MB' && O.formatBytes(3 * 1073741824) === '3.00 GB' && O.formatBytes(NaN) === '?' && O.formatBytes(null) === '?', 'formatBytes');
ok(O.blockedReason({ hasSW: false, inApp: '', secure: true }) === 'unsupported' && O.blockedReason({ hasSW: true, inApp: 'LINE', secure: true }) === 'inapp' && O.blockedReason({ hasSW: true, inApp: '', secure: false }) === 'insecure' && O.blockedReason({ hasSW: true, inApp: '', secure: true }) === '', 'blockedReason');
ok(O.blockedReason({ hasSW: false, inApp: 'LINE', secure: false }) === 'unsupported', '不支援優先於其他原因');
ok(O.pendingText({ scores: 3, bests: 1, feedback: 2 }) === '3 筆成績、1 筆個人最佳、2 則意見' && O.pendingText({ scores: 1 }) === '1 筆成績' && O.pendingText({}) === '' && O.pendingText(null) === '', 'pendingText');
ok(O.isNewer('1.39.0', '1.38.0') && !O.isNewer('1.38.0', '1.38.0') && !O.isNewer('1.38.0', 'local-123') && !O.isNewer(null, '1.0') && !O.isNewer('1.0', undefined), 'isNewer（本機版 local- 不算有新版）');

// ═══ 2. buildRows ═══
const base = () => ({
  online: true, standalone: false, inApp: '', canGuide: true, version: '1.38.0', blocked: '',
  cache: { precache: 390, cached: 390 }, storage: { usage: 5.2 * 1048576, quota: 2 * 1073741824, persisted: false },
  sync: { state: 'in', nick: '阿花', pending: { scores: 0, bests: 0, feedback: 0 } }
});
const by = rows => { const o = {}; rows.forEach(r => { o[r.id] = r; }); return o; };
{
  const rows = O.buildRows(base());
  ok(rows.map(r => r.id).join() === 'install,offline,sync,storage,update,clear', '六列的順序：' + rows.map(r => r.id));
  ok(rows.map(r => r.title).join() === '加到主畫面,離線遊玩,雲端同步,儲存空間,檢查更新,清除離線資料', '標題照使用者列的順序');
  ok(rows.every(r => typeof r.text === 'string' && r.text.length > 0 && typeof r.ok === 'boolean' && (r.action === null || (r.action.label && r.action.act))), '每一列都有文字；按鈕有名字與動作代號');
}
// 加到主畫面
{
  let r = by(O.buildRows(Object.assign(base(), { standalone: true }))).install;
  ok(r.ok && /已經加到主畫面/.test(r.text) && r.action === null, '已加到主畫面：✓、沒有按鈕');
  r = by(O.buildRows(Object.assign(base(), { inApp: 'LINE' }))).install;
  ok(!r.ok && /LINE/.test(r.text) && /無法加到主畫面/.test(r.text) && r.action.act === 'inapp' && r.action.label === '怎麼辦？', '內建瀏覽器：說明＋「怎麼辦？」');
  r = by(O.buildRows(base())).install;
  ok(!r.ok && r.action.act === 'guide' && r.action.label === '加到主畫面', '還沒加：「加到主畫面」按鈕');
  r = by(O.buildRows(Object.assign(base(), { canGuide: false }))).install;
  ok(!r.ok && r.action === null && /手機的瀏覽器/.test(r.text), '電腦等不適合給說明的環境：只有說明、沒有按鈕');
  r = by(O.buildRows(Object.assign(base(), { standalone: true, inApp: 'LINE' }))).install;
  ok(r.ok, '已安裝優先於內建瀏覽器的判斷');
}
// 離線遊玩
{
  let r = by(O.buildRows(base())).offline;
  ok(r.ok && /已就緒/.test(r.text) && /1\.38\.0/.test(r.text) && /390 個/.test(r.text) && r.action === null, '備份齊全：✓ 已就緒（版本、檔案數）');
  r = by(O.buildRows(Object.assign(base(), { cache: { precache: 390, cached: 120 } }))).offline;
  ok(!r.ok && /120／390/.test(r.text) && r.action.act === 'recheck', '備份到一半：顯示進度＋「重新檢查」');
  r = by(O.buildRows(Object.assign(base(), { cache: { precache: 0, cached: 0 } }))).offline;
  ok(!r.ok && /第一次開啟/.test(r.text) && r.action.act === 'recheck', '還沒有 Service Worker 回報：第一次開啟時會備份');
  for (const [why, re] of [['inapp', /內建瀏覽器不支援/], ['unsupported', /不支援離線/], ['insecure', /https/]]) {
    r = by(O.buildRows(Object.assign(base(), { blocked: why }))).offline;
    ok(!r.ok && re.test(r.text) && r.action === null, '不能離線的原因 ' + why);
  }
}
// 雲端同步
{
  let r = by(O.buildRows(base())).sync;
  ok(r.ok && /阿花/.test(r.text) && /都已同步/.test(r.text) && r.action === null, '已登入、沒有待傳：✓ 都已同步');
  r = by(O.buildRows(Object.assign(base(), { sync: { state: 'in', nick: '阿花', pending: { scores: 2, bests: 1, feedback: 0 } } }))).sync;
  ok(!r.ok && /2 筆成績、1 筆個人最佳/.test(r.text) && r.action.act === 'sync' && r.action.label === '立即同步', '有待傳、有網路：「立即同步」');
  r = by(O.buildRows(Object.assign(base(), { online: false, sync: { state: 'in', nick: '阿花', pending: { scores: 2, bests: 0, feedback: 1 } } }))).sync;
  ok(!r.ok && /連上網路後會自動上傳/.test(r.text) && r.action === null, '有待傳、沒網路：說明連上網路後會自動上傳，沒有按鈕');
  r = by(O.buildRows(Object.assign(base(), { sync: { state: 'guest', nick: '', pending: { scores: 0, bests: 0, feedback: 0 } } }))).sync;
  ok(!r.ok && /還沒有帳號/.test(r.text) && r.action.act === 'login' && r.action.label === '登入帳號', '訪客：說明何時會建立帳號＋「登入帳號」');
  r = by(O.buildRows(Object.assign(base(), { sync: { state: 'guest', nick: '', pending: { scores: 1, bests: 0, feedback: 0 } } }))).sync;
  ok(/1 筆成績/.test(r.text), '訪客有待傳的成績也會提到');
  r = by(O.buildRows(Object.assign(base(), { sync: { state: 'relogin', nick: '阿花', pending: {} } }))).sync;
  ok(/登入已經失效/.test(r.text) && r.action.act === 'relogin', '憑證失效：「重新登入」');
  r = by(O.buildRows(Object.assign(base(), { sync: { state: 'legacy', nick: '阿花', pending: {} } }))).sync;
  ok(/還沒有設密碼/.test(r.text) && r.action.act === 'legacy', '舊玩家：「建立密碼」');
}
// 儲存空間
{
  let r = by(O.buildRows(base())).storage;
  ok(/已使用 5\.2 MB/.test(r.text) && /上限約 2\.00 GB/.test(r.text) && /還沒有取得長期保留/.test(r.text) && r.action === null && !r.ok, '儲存空間：已使用、上限、還沒長期保留');
  r = by(O.buildRows(Object.assign(base(), { storage: { usage: 1048576, quota: 0, persisted: true } }))).storage;
  ok(/已使用 1\.0 MB/.test(r.text) && !/上限/.test(r.text) && /已申請長期保留/.test(r.text) && r.ok, '長期保留成功：✓');
  r = by(O.buildRows(Object.assign(base(), { storage: { usage: null, quota: null, persisted: null } }))).storage;
  ok(/沒有提供儲存空間/.test(r.text), '瀏覽器沒有提供儲存空間資訊');
}
// 檢查更新、清除離線資料
{
  let r = by(O.buildRows(base())).update;
  ok(/目前版本 1\.38\.0/.test(r.text) && r.action.act === 'update' && r.action.label === '檢查更新', '檢查更新：顯示目前版本');
  ok(by(O.buildRows(base(), { kind: 'latest', latest: '1.38.0' })).update.ok && /已是最新版本/.test(by(O.buildRows(base(), { kind: 'latest', latest: '1.38.0' })).update.text), '已是最新版本');
  r = by(O.buildRows(base(), { kind: 'newer', latest: '1.39.0' })).update;
  ok(/有新版本 1\.39\.0/.test(r.text) && r.action.act === 'apply' && r.action.label === '立即更新', '有新版：按鈕變成「立即更新」');
  ok(/沒有網路/.test(by(O.buildRows(base(), { kind: 'offline' })).update.text) && /沒有檢查成功/.test(by(O.buildRows(base(), { kind: 'error' })).update.text), '沒網路／失敗的說明');
  r = by(O.buildRows(base())).clear;
  ok(r.action.act === 'clear' && r.action.label === '清除離線資料' && /成績、暱稱與設定都不會被清掉/.test(r.text), '清除離線資料：說明玩家資料不受影響');
}

(async () => {
  // ═══ 3. 跟 Service Worker 講話（假的 registration）═══
  const nav = global.navigator;
  const def = (k, v) => Object.defineProperty(nav, k, { value: v, configurable: true, writable: true });
  let swMsgs = [];
  const makeReg = (reply) => ({
    active: { postMessage(msg, ports) { swMsgs.push(msg); if (reply) setTimeout(() => ports[0].postMessage(reply(msg)), 1); } },
    update() { swMsgs.push({ type: 'update()' }); return Promise.resolve(); }
  });
  let regs = [], unreg = 0;
  def('serviceWorker', { getRegistration: () => Promise.resolve(regs[0]), getRegistrations: () => Promise.resolve(regs) });
  regs = [makeReg(m => m.type === 'STATUS' ? { type: 'STATUS', cache: 'fm-cache-v1', precache: 390, cached: 388 } : { type: 'REFRESH', ok: true })];
  let a = await O.test.ask('STATUS', 500);
  ok(a && a.type === 'STATUS' && a.precache === 390 && a.cached === 388 && swMsgs[0].type === 'STATUS', 'ask STATUS：收到 Service Worker 的回覆');
  regs = [makeReg(null)];
  a = await O.test.ask('STATUS', 30);
  ok(a === null, 'Service Worker 沒回應：逾時回傳 null');
  regs = [];
  a = await O.test.ask('STATUS', 30);
  ok(a === null, '沒有 Service Worker：回傳 null');
  regs = [{ installing: { postMessage(msg, ports) { ports[0].postMessage({ type: 'STATUS', precache: 5, cached: 0 }); } } }];
  a = await O.test.ask('STATUS', 200);
  ok(a && a.precache === 5, '還在安裝中的 Service Worker 也問得到');

  // ═══ 4. status ═══
  mem.clear();
  global.Leaderboard.setSession({ player_id: '44444444-4444-4444-8444-444444444444', token: 'tok-offline-0123456789', nick: '阿花' });
  mem.set('fm.lb.pending', JSON.stringify({ speed: { score: 0.1, at: 1 }, spot: { score: 9, at: 2 } }));
  mem.set('fm.lb.fbpending', JSON.stringify([{ game: 'speed', text: 'hi', at: 1 }]));
  mem.set('fm.lb.bestpending', JSON.stringify({ chicks: 1 }));
  ok(JSON.stringify(LB.pendingCount()) === '{"scores":2,"feedback":1,"bests":1}', 'Leaderboard.pendingCount：成績、意見、個人最佳各幾筆');
  mem.clear();
  ok(JSON.stringify(LB.pendingCount()) === '{"scores":0,"feedback":0,"bests":0}', 'pendingCount：沒有待傳就是 0');
  global.FM_VERSION = { version: '1.38.0' };
  global.PWA = { state: () => ({ inApp: '', standalone: false, os: 'android' }), canGuide: () => true };
  regs = [makeReg(m => ({ type: 'STATUS', cache: 'fm-cache-v1', precache: 390, cached: 390 }))];
  def('storage', { estimate: () => Promise.resolve({ usage: 5000000, quota: 100000000 }), persisted: () => Promise.resolve(true) });
  let s = await O.status();
  ok(s.online === true && s.version === '1.38.0' && s.blocked === '' && s.cache.precache === 390 && s.cache.cached === 390 && s.storage.usage === 5000000 && s.storage.persisted === true && s.sync.state === 'guest' && s.canGuide === true && s.standalone === false, 'status：版本、備份數、儲存空間、身分、能不能給說明');
  global.PWA = { state: () => ({ inApp: 'LINE', standalone: false }), canGuide: () => false };
  s = await O.status();
  ok(s.blocked === 'inapp' && s.cache.precache === 0, 'status：內建瀏覽器不問 Service Worker（blocked＝inapp）');
  def('storage', undefined);
  global.PWA = { state: () => ({ inApp: '', standalone: true }), canGuide: () => false };
  s = await O.status();
  ok(s.storage.usage === null && s.standalone === true, 'status：瀏覽器沒有 storage API 也不會當掉');

  // ═══ 5. checkUpdate ═══
  global.PWA = undefined;
  global.FM_VERSION = { version: '1.38.0' };
  const fetched = [];
  const mkFetch = (body, okFlag) => (url, opt) => { fetched.push({ url, opt }); return okFlag === false ? Promise.reject(new TypeError('x')) : Promise.resolve({ ok: okFlag !== 'http', json: () => Promise.resolve(body) }); };
  swMsgs = []; regs = [makeReg(null)];
  global.fetch = mkFetch({ version: '1.38.0', date: 'x' });
  let u = await O.checkUpdate();
  ok(u.kind === 'latest' && u.latest === '1.38.0', 'checkUpdate：版本一樣 → latest');
  ok(/^version\.json\?_=\d+$/.test(fetched[0].url) && fetched[0].opt.cache === 'no-store' && swMsgs.some(m => m.type === 'update()'), '讀 version.json（不吃快取、加時間戳記），也請瀏覽器檢查 sw.js（registration.update）');
  global.fetch = mkFetch({ version: '1.39.0' });
  u = await O.checkUpdate();
  ok(u.kind === 'newer' && u.latest === '1.39.0', 'checkUpdate：版本不一樣 → newer');
  global.FM_VERSION = { version: 'local-17000000' };
  u = await O.checkUpdate();
  ok(u.kind === 'latest', 'checkUpdate：本機版（local-）不當成有新版');
  global.FM_VERSION = { version: '1.38.0' };
  global.fetch = mkFetch(null, 'http');
  ok((await O.checkUpdate()).kind === 'error', 'checkUpdate：HTTP 錯誤 → error');
  global.fetch = mkFetch(null, false);
  ok((await O.checkUpdate()).kind === 'error', 'checkUpdate：連不上 → error');
  global.fetch = mkFetch({ nope: 1 });
  ok((await O.checkUpdate()).kind === 'error', 'checkUpdate：version.json 沒有 version → error');
  def('onLine', false);
  fetched.length = 0;
  ok((await O.checkUpdate()).kind === 'offline' && fetched.length === 0, 'checkUpdate：離線不連網 → offline');
  def('onLine', true);

  // ═══ 6. applyUpdate／clearAll／syncNow ═══
  let reloads = 0;
  global.location = { reload() { reloads++; }, href: 'https://x/', protocol: 'https:' };
  swMsgs = []; regs = [makeReg(m => ({ type: 'REFRESH', ok: true }))];
  await O.applyUpdate();
  ok(swMsgs.some(m => m.type === 'REFRESH') && reloads === 1, 'applyUpdate：請 Service Worker 整份重新備份（REFRESH），然後重新載入');
  reloads = 0; regs = [];
  await O.applyUpdate();
  ok(reloads === 1, 'applyUpdate：沒有 Service Worker 也照樣重新載入');
  // clearAll：取消 Service Worker、只刪 fm- 開頭的快取、不碰 localStorage
  reloads = 0; unreg = 0;
  regs = [{ unregister() { unreg++; return Promise.resolve(true); } }, { unregister() { unreg++; return Promise.resolve(true); } }];
  const cacheNames = new Set(['fm-cache-v1', 'fm-cache-old', 'other-app']);
  global.caches = { keys: () => Promise.resolve([...cacheNames]), delete: n => { cacheNames.delete(n); return Promise.resolve(true); } };
  mem.set('fm.reaction.best.speed', '0.12'); mem.set('fm.lb.nick', '"阿花"');
  await O.clearAll();
  ok(unreg === 2 && [...cacheNames].join() === 'other-app' && reloads === 1, 'clearAll：取消全部 Service Worker、刪掉 fm- 開頭的快取（別人的不動）、重新載入');
  ok(mem.get('fm.reaction.best.speed') === '0.12' && mem.get('fm.lb.nick') === '"阿花"', 'clearAll：成績、暱稱（localStorage）完全不動');
  delete global.caches;
  reloads = 0; regs = [];
  await O.clearAll();
  ok(reloads === 1, 'clearAll：沒有 caches API 也不會當掉');
  // syncNow：補送成績與意見；已登入才同步個人最佳
  const calls = [];
  const realFlush = LB.flushAll, realLogged = LB.isLoggedIn;
  LB.flushAll = () => { calls.push('flushAll'); return Promise.resolve(); };
  global.Identity = { syncBests: o => { calls.push('syncBests:' + JSON.stringify(o)); return Promise.resolve(); } };
  LB.isLoggedIn = () => false;
  await O.syncNow();
  ok(calls.join() === 'flushAll', 'syncNow：沒登入只補送成績與意見');
  calls.length = 0; LB.isLoggedIn = () => true;
  await O.syncNow();
  ok(calls.join() === 'flushAll,syncBests:{"all":true}', 'syncNow：已登入再同步個人最佳');
  LB.flushAll = () => Promise.reject(new Error('net'));
  await O.syncNow();
  ok(true, 'syncNow：失敗也不會丟例外');
  LB.flushAll = realFlush; LB.isLoggedIn = realLogged;

  // ═══ 7. 頁面接線 ═══
  const ui = rd('js/offline_ui.js'), off = rd('js/offline.js'), sw = rd('sw.js'), pwa = rd('js/pwa.js'), boot = rd('js/boot.js'), css = rd('css/menu_nav.css').split(/\s+/).join(' '), lbsrc = rd('js/leaderboard.js');
  ok(/title: '安裝與離線'/.test(ui) && /tall: true/.test(ui) && /Scroller\.make\(viewport, list, thumb, \{ threshold: SCROLL_THRESHOLD \}\)/.test(ui) && /text: '關閉', kind: 'line', cls: 'nav-close'/.test(ui), '彈窗：標題「安裝與離線」、可慣性捲動、「關閉」白底藍框藍字 2/3 高');
  ok(/O\.buildRows\(s, upd\)/.test(ui) && /O\.status\(\)/.test(ui) && !/innerHTML = [^'']*\+/.test(ui.replace(/list\.innerHTML = ''/g, '')), '畫面只管畫：列的內容來自 buildRows、不拼 HTML');
  for (const a of ['guide', 'inapp', 'recheck', 'sync', 'login', 'relogin', 'legacy', 'update', 'apply', 'clear']) ok(new RegExp("a === '" + a + "'").test(ui), '按鈕動作 ' + a + ' 有接');
  ok(/PWA\.openGuide\(\)/.test(ui) && /PWA\.inAppNotice\(\)/.test(ui) && /ID\.askLogin\(\)/.test(ui) && /ID\.ensureLegacy\(\{\}\)/.test(ui) && /O\.syncNow\(\)/.test(ui) && /O\.checkUpdate\(\)/.test(ui) && /O\.applyUpdate\(\)/.test(ui) && /O\.clearAll\(\)/.test(ui), '動作接到 PWA／Identity／FMOffline');
  ok(/title: '清除離線資料？'/.test(ui) && /成績、暱稱與設定都不會被清掉/.test(ui) && /text: '取消'[\s\S]*?text: '清除'/.test(ui), '清除離線資料前先問一次（取消／清除）');
  ok(/addEventListener\('online', onNet\)/.test(ui) && /removeEventListener\('offline', onNet\)/.test(ui), '網路斷了／恢復了自動重畫，關掉彈窗時拿掉監聽');
  ok(/global\.FMOffline = \{/.test(off) && !/innerHTML/.test(off), 'offline.js：FMOffline，不碰 innerHTML');
  ok(/self\.addEventListener\('message'/.test(sw) && /d\.type !== 'STATUS' && d\.type !== 'REFRESH'/.test(sw) && /refreshAll\(\)\.then\(function \(\) \{ reply\(\{ type: 'REFRESH', ok: true \}\)/.test(sw) && /precache: PRECACHE\.length/.test(sw), 'sw.js：message 事件（STATUS／REFRESH）');
  ok(/inAppNotice: function/.test(pwa) && /function showInAppNotice\(name, force\)/.test(pwa), 'PWA.inAppNotice：「怎麼辦？」可以重複打開');
  ok(/Leaderboard\.pendingCount = pendingCount/.test(lbsrc) && /Leaderboard\.flushAll = flushAll/.test(lbsrc), 'Leaderboard.pendingCount／flushAll');
  ok(/\.off-row \{[^}]*border-radius: var\(--r-md\)/.test(css) && /\.off-row--ok \{[^}]*var\(--c-ok-soft\)/.test(css) && /\.off-row__x \{[^}]*white-space: pre-line/.test(css) && /\.btn\.off-btn \{[^}]*height: 56px/.test(css), 'CSS：每一列、做好了的綠底、說明可換行、按鈕');
  const sp = [...boot.match(/menu: \{[\s\S]*?js: BASE_JS\.concat\(\[([^\]]*)\]\)/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  ok(sp.indexOf('js/offline.js') > 0 && sp.indexOf('js/offline_ui.js') === sp.indexOf('js/offline.js') + 1 && sp.indexOf('js/pwa.js') < sp.indexOf('js/offline.js'), 'boot.js：選單頁載入 offline.js、offline_ui.js');

  console.log((bad ? bad + ' FAIL / ' : '') + total + ' checks');
  console.log(bad ? 'SOME FAILED' : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})();
