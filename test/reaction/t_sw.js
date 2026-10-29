// sw.js（Service Worker）的行為測試：用假的 caches／fetch 在 Node 裡執行 sw.js，不需要瀏覽器。
//   · 安裝：把 PRECACHE 整份存起來（key 是去掉 ?query 的網址），並且 skipWaiting
//   · 有網路：回傳網路的檔案，並更新備份；備份的 key 不含 ?v=／?t=（boot.js 每次的網址都不一樣）
//   · 沒網路：用備份（不管 ?v= 是什麼）；沒有備份就是網路錯誤；網路太慢（逾時）而且有備份，先用備份
//   · 資料夾網址（…/FadingMemory/）當成 index.html
//   · 不攔：POST、其他網域（Supabase 排行榜）、admin/ test/ 等開發用資料夾、sw.js 自己
//   · Google Fonts：網路優先，離線時用存起來的
//   · version.json 內容變了 → 整份清單重新抓；抓不全就不更新備份的 version.json（下次再試）；沒變 → 不重抓
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '../../') + '/';
const SRC = fs.readFileSync(ROOT + 'sw.js', 'utf8');

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };

const ORIGIN = 'https://weichenglin0215.github.io';
const BASE = ORIGIN + '/FadingMemory/';

// 假的 Cache Storage：每個 cache 是 Map<網址, Response>，put／match 都用 clone，body 才能重複讀
function makeCaches() {
  const store = new Map();
  const keyOf = k => (typeof k === 'string' ? k : k.url);
  const cacheObj = name => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      match: async k => { const r = m.get(keyOf(k)); return r ? r.clone() : undefined; },
      put: async (k, r) => { m.set(keyOf(k), r.clone()); },
      keys: async () => Array.from(m.keys())
    };
  };
  return {
    store,
    open: async n => cacheObj(n),
    keys: async () => Array.from(store.keys()),
    delete: async n => store.delete(n)
  };
}

// 載入 sw.js，回傳 { ctx, fire(type, event), caches, fetchLog, setFetch(fn) }
function loadSw() {
  const caches = makeCaches();
  const listeners = {};
  const log = [];
  let fetchImpl = async () => new Response('net', { headers: { etag: '"n1"' } });
  const self = {
    registration: { scope: BASE },
    location: { origin: ORIGIN },
    addEventListener(t, f) { listeners[t] = f; },
    skipWaiting() { self.skipped = true; return Promise.resolve(); },
    clients: { claim() { self.claimed = true; return Promise.resolve(); } },
    caches,
    fetch: (req) => { log.push(typeof req === 'string' ? req : req.url); return fetchImpl(req); },
    URL, Request, Response, Promise, setTimeout, clearTimeout, console
  };
  self.self = self;
  const ctx = vm.createContext(self);
  vm.runInContext(SRC, ctx);
  return {
    ctx, caches, log, self,
    setFetch(fn) { fetchImpl = fn; },
    // 觸發 fetch 事件：回傳 { handled（有沒有呼叫 respondWith）, response（await 之後的結果）, settle()（等 waitUntil 的工作做完） }
    async fetchEvent(url, opt) {
      const req = new Request(url, opt || {});
      const ev = { request: req, waits: [], handled: false, respondWith(p) { ev.handled = true; ev.p = Promise.resolve(p); }, waitUntil(p) { ev.waits.push(Promise.resolve(p)); } };
      listeners.fetch(ev);
      const res = ev.handled ? await ev.p : null;
      await Promise.all(ev.waits);
      return { handled: ev.handled, res, text: res && res.type !== 'error' ? await res.clone().text() : null };
    },
    async lifecycle(type) {
      const waits = [];
      listeners[type]({ waitUntil(p) { waits.push(Promise.resolve(p)); } });
      await Promise.all(waits);
    },
    async cached(key) { const c = await caches.open('fm-cache-v1'); const r = await c.match(key); return r ? r.text() : null; },
    async cacheKeys() { const c = await caches.open('fm-cache-v1'); return c.keys(); }
  };
}

(async () => {
  // ═══ 安裝 ═══
  let sw = loadSw();
  const pre = sw.ctx.PRECACHE;
  ok(Array.isArray(pre) && pre.length > 200, 'sw.js 有離線清單（' + pre.length + ' 個）');
  sw.setFetch(async req => new Response('file:' + new URL(req.url).pathname, { headers: { etag: '"a"' } }));
  await sw.lifecycle('install');
  let keys = await sw.cacheKeys();
  ok(keys.length === pre.length, '安裝時全部存進快取（' + keys.length + '／' + pre.length + '）');
  ok(keys.includes(BASE + 'index.html') && keys.includes(BASE + 'js/boot.js') && keys.includes(BASE + 'version.json'), '快取的 key 是完整網址（含 index.html、boot.js、version.json）');
  ok(keys.every(k => !/[?#]/.test(k)), '快取的 key 沒有 ?query');
  ok(sw.self.skipped === true, '安裝後 skipWaiting');
  sw.setFetch(async req => { throw new TypeError('offline'); });
  // 安裝失敗：任何一個檔案抓不到，install 就失敗（不會裝出缺檔案的 Service Worker）
  const swFail = loadSw();
  swFail.setFetch(async req => (/ui\.js$/.test(req.url) ? new Response('x', { status: 404 }) : new Response('ok')));
  let failed = false;
  try { await swFail.lifecycle('install'); } catch (e) { failed = true; }
  ok(failed, '清單裡有檔案抓不到（404）→ 安裝失敗');
  // 舊版快取清掉
  await sw.caches.open('fm-cache-old');
  await sw.lifecycle('activate');
  ok(!(await sw.caches.keys()).includes('fm-cache-old') && sw.self.claimed === true, 'activate：刪除舊的快取、clients.claim()');

  // ═══ 離線：忽略 ?v= ?t= ═══
  let r = await sw.fetchEvent(BASE + 'js/ui.js?v=local-12345');
  ok(r.handled && r.text === 'file:/FadingMemory/js/ui.js', '離線：?v= 跟存的不一樣也用得到備份');
  r = await sw.fetchEvent(BASE + 'js/boot.js?t=1700000000000');
  ok(r.handled && r.text === 'file:/FadingMemory/js/boot.js', '離線：boot.js?t=時間戳 用得到備份');
  r = await sw.fetchEvent(BASE + 'reaction.html?game=speed');
  ok(r.handled && r.text === 'file:/FadingMemory/reaction.html', '離線：reaction.html?game=speed 用 reaction.html 的備份');
  r = await sw.fetchEvent(BASE);
  ok(r.handled && r.text === 'file:/FadingMemory/index.html', '離線：資料夾網址（…/FadingMemory/）用 index.html 的備份');
  r = await sw.fetchEvent(BASE + 'js/nope.js');
  ok(r.handled && r.res.type === 'error', '離線＋沒有備份：回網路錯誤（不是掛住）');

  // ═══ 有網路：回網路的並更新備份 ═══
  sw.setFetch(async req => new Response('new:' + new URL(req.url).pathname, { headers: { etag: '"b"' } }));
  r = await sw.fetchEvent(BASE + 'js/ui.js?v=1.34.0');
  ok(r.text === 'new:/FadingMemory/js/ui.js', '有網路：回傳網路上的最新檔案');
  ok((await sw.cached(BASE + 'js/ui.js')) === 'new:/FadingMemory/js/ui.js', '有網路：備份被更新（key 不含 ?v=）');
  ok(!(await sw.cacheKeys()).some(k => /\?/.test(k)), '備份的 key 仍然沒有 ?query');
  // ETag 一樣就不重存（用一個會偷偷改內容但 ETag 不變的回應驗證「沒有重存」）
  sw.setFetch(async req => new Response('SAME-ETAG-DIFFERENT-BODY', { headers: { etag: '"b"' } }));
  await sw.fetchEvent(BASE + 'js/ui.js?v=1.34.1');
  ok((await sw.cached(BASE + 'js/ui.js')) === 'new:/FadingMemory/js/ui.js', 'ETag 沒變就不重存（省寫入）');
  sw.setFetch(async req => new Response('missing', { status: 404 }));
  r = await sw.fetchEvent(BASE + 'js/ui.js?v=1.34.2');
  ok(r.res.status === 404 && (await sw.cached(BASE + 'js/ui.js')) === 'new:/FadingMemory/js/ui.js', '404 的回應不會蓋掉備份');
  // 轉址的回應不存
  // 真正的瀏覽器裡 clone() 會保留 redirected；假的 Response 要自己讓 clone 也是「轉址過的」
  const redirResp = () => { const x = new Response('redir', { headers: { etag: '"r"' } }); Object.defineProperty(x, 'redirected', { value: true }); x.clone = redirResp; return x; };
  sw.setFetch(async req => redirResp());
  await sw.fetchEvent(BASE + 'css/theme.css');
  ok((await sw.cached(BASE + 'css/theme.css')) === 'file:/FadingMemory/css/theme.css', '轉址（redirected）的回應不存');

  // ═══ 網路太慢：逾時就先用備份 ═══
  sw.ctx.NET_TIMEOUT_MS = 40;
  let netResolved = false;
  sw.setFetch(() => new Promise(res => setTimeout(() => { netResolved = true; res(new Response('late', { headers: { etag: '"late"' } })); }, 300)));
  const t0 = Date.now();
  r = await sw.fetchEvent(BASE + 'css/menu.css?v=1');
  ok(r.text === 'file:/FadingMemory/css/menu.css' && Date.now() - t0 < 250, '網路太慢（逾時）＋有備份：先用備份（' + (Date.now() - t0) + ' ms）');
  await new Promise(res => setTimeout(res, 350));
  // 沒有備份時要等網路
  sw.setFetch(() => new Promise(res => setTimeout(() => res(new Response('waited', { headers: { etag: '"w"' } })), 120)));
  r = await sw.fetchEvent(BASE + 'js/brand-new.js');
  ok(r.text === 'waited', '網路慢但沒有備份：等網路回來');
  ok((await sw.cached(BASE + 'js/brand-new.js')) === 'waited', '新檔案第一次抓到就存進備份（清單沒列到的檔案也能離線）');
  sw.ctx.NET_TIMEOUT_MS = 4000;

  // ═══ 不攔的請求 ═══
  sw.setFetch(async () => new Response('x'));
  r = await sw.fetchEvent(BASE + 'js/ui.js', { method: 'POST', body: 'a' });
  ok(!r.handled, 'POST 不攔');
  r = await sw.fetchEvent('https://tpdznlutkzeficitudac.supabase.co/rest/v1/rpc/MF_get_board', {});
  ok(!r.handled, '其他網域（Supabase）不攔');
  r = await sw.fetchEvent(BASE + 'admin/feedback.html');
  ok(!r.handled, 'admin/ 不攔');
  r = await sw.fetchEvent(BASE + 'test/reaction/t_pwa.js');
  ok(!r.handled, 'test/ 不攔');
  r = await sw.fetchEvent(BASE + 'sw.js');
  ok(!r.handled, 'sw.js 自己不攔');
  r = await sw.fetchEvent(BASE + 'screen_adaptive.html');
  ok(!r.handled, 'screen_adaptive.html 不攔');
  r = await sw.fetchEvent(ORIGIN + '/OtherSite/index.html');
  ok(!r.handled, '同網域但不在 scope（/FadingMemory/）底下的不攔');

  // ═══ Google Fonts ═══
  const fontCss = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@500;700;900&display=swap';
  const fontFile = 'https://fonts.gstatic.com/s/notosanstc/v36/abc.woff2';
  let fetchedMode = [];
  sw.setFetch(async req => { fetchedMode.push(req.mode); return new Response('font:' + new URL(req.url).hostname, { headers: { 'content-type': 'text/css' } }); });
  r = await sw.fetchEvent(fontCss);
  ok(r.handled && r.text === 'font:fonts.googleapis.com', 'Google Fonts CSS：有網路時用網路');
  ok(fetchedMode.every(m => m === 'cors'), '字型用 CORS 模式抓（才存得進快取，不是 opaque）');
  r = await sw.fetchEvent(fontFile);
  ok(r.handled && r.text === 'font:fonts.gstatic.com', '字型檔：第一次用網路');
  sw.setFetch(async () => { throw new TypeError('offline'); });
  r = await sw.fetchEvent(fontCss);
  ok(r.text === 'font:fonts.googleapis.com', '離線：Google Fonts CSS 用存起來的');
  r = await sw.fetchEvent(fontFile);
  ok(r.text === 'font:fonts.gstatic.com', '離線：字型檔用存起來的');
  r = await sw.fetchEvent('https://fonts.gstatic.com/s/other.woff2');
  ok(r.handled && r.res.type === 'error', '離線＋沒存過的字型：網路錯誤（退回系統字型，不卡住）');

  // ═══ version.json 變了 → 整批更新 ═══
  const sw2 = loadSw();
  sw2.setFetch(async req => new Response('v1:' + new URL(req.url).pathname, { headers: { etag: '"1"' } }));
  await sw2.lifecycle('install');
  const N = sw2.ctx.PRECACHE.length;
  const vjsonUrl = BASE + 'version.json';
  sw2.setFetch(async req => new Response('v1:/FadingMemory/version.json'));          // 跟備份一樣
  sw2.log.length = 0;
  r = await sw2.fetchEvent(vjsonUrl + '?t=1', { cache: 'no-store' });
  ok(r.text === 'v1:/FadingMemory/version.json' && sw2.log.length === 1, 'version.json 沒變：只抓它自己一次，不整批重抓（' + sw2.log.length + ' 次）');
  sw2.setFetch(async req => new Response(/version\.json/.test(req.url) ? 'v2:/FadingMemory/version.json' : 'v2:' + new URL(req.url).pathname, { headers: { etag: '"2"' } }));
  sw2.log.length = 0;
  r = await sw2.fetchEvent(vjsonUrl + '?t=2', { cache: 'no-store' });
  ok(r.text === 'v2:/FadingMemory/version.json', 'version.json 變了：頁面拿到新的');
  ok(sw2.log.length >= N, 'version.json 變了：整份清單重新抓（' + sw2.log.length + ' 次，清單 ' + N + ' 個）');
  ok((await sw2.cached(BASE + 'js/ui.js')) === 'v2:/FadingMemory/js/ui.js' && (await sw2.cached(vjsonUrl)) === 'v2:/FadingMemory/version.json', '整批更新後備份都是新版');
  // 整批更新抓不全：備份的 version.json 不更新，下次再試
  const sw3 = loadSw();
  sw3.setFetch(async req => new Response('v1:' + new URL(req.url).pathname, { headers: { etag: '"1"' } }));
  await sw3.lifecycle('install');
  sw3.setFetch(async req => {
    if (/ui\.js$/.test(req.url) && req.cache === 'no-cache') return new Response('err', { status: 500 });
    return new Response('v2:' + new URL(req.url).pathname, { headers: { etag: '"2"' } });
  });
  r = await sw3.fetchEvent(vjsonUrl + '?t=3', { cache: 'no-store' });
  ok(r.text === 'v2:/FadingMemory/version.json', '整批更新失敗時，頁面仍然拿到新的 version.json');
  ok((await sw3.cached(vjsonUrl)) === 'v1:/FadingMemory/version.json', '整批更新失敗：備份的 version.json 維持舊的（下次開頁面會再試）');

  console.log((bad ? bad + ' FAIL / ' : '') + total + ' checks');
  console.log(bad ? 'SOME FAILED' : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
