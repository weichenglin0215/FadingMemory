// Service Worker（sw.js）「版本相同就直接用備份」的檢查（V1.53）：
//   · 在 Node 的 vm 沙盒裡執行 sw.js（自己做一個記憶體版的 caches／fetch），直接呼叫 versioned／cachedVersion／refreshAll
//   · 備份裡的 version.json＝這份備份的版本：網址 ?v= 跟它一樣 → 直接回備份、完全不連網；不一樣、沒帶 ?v=、不是 css／js、備份裡沒這個檔 → 網路優先
//   · 開發用網址（localhost）永遠網路優先；refreshAll 一開始先刪掉 version.json、全部抓完才放回去（更新到一半不能被當成同一版）
//   · boot.js：讀不到 version.json（太慢）又有上次的版本號就先用它；reaction.html／index.html 有 Supabase 的 preconnect
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '../../') + '/';
let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const SCOPE = 'https://x.github.io/FadingMemory/';
const src = fs.readFileSync(ROOT + 'sw.js', 'utf8');

// ── 記憶體版 caches ──
function makeCaches(log) {
  const stores = {};
  const keyStr = (k) => (typeof k === 'string' ? k : k.url);
  const mk = (name) => {
    const m = stores[name] || (stores[name] = new Map());
    return {
      match: async (k) => { const r = m.get(keyStr(k)); return r ? r.clone() : undefined; },
      put: async (k, r) => { log && log.push('put ' + keyStr(k).replace(SCOPE, '')); m.set(keyStr(k), r.clone()); },
      delete: async (k) => { log && log.push('delete ' + keyStr(k).replace(SCOPE, '')); return m.delete(keyStr(k)); },
      keys: async () => Array.from(m.keys()).map(u => ({ url: u }))
    };
  };
  return { open: async (n) => mk(n), keys: async () => Object.keys(stores), delete: async (n) => delete stores[n], _stores: stores };
}
function boot(hostname, fetchImpl, log) {
  const ctx = {
    URL, Request, Response, Headers, Promise, Date, JSON, Math, Object, Array, String, Error, console,
    setTimeout, clearTimeout, caches: makeCaches(log), fetch: fetchImpl,
    location: { hostname }, registration: { scope: SCOPE }, addEventListener() { }, skipWaiting() { }, clients: { claim() { } }
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}
const text = async (r) => (r ? r.text() : null);
const ev = { waitUntil() { } };
const keyOf = (rel) => SCOPE + rel;
const req = (rel) => new Request(SCOPE + rel);
const seed = async (ctx, rel, body) => { const c = await ctx.caches.open('fm-cache-v1'); await c.put(keyOf(rel), new Response(body)); };

(async () => {
  // ── 1. 備份是 1.0 版 ──
  { let calls = 0;
    const ctx = boot('x.github.io', async () => { calls++; return new Response('NEW'); });
    await seed(ctx, 'version.json', JSON.stringify({ version: '1.0' }));
    await seed(ctx, 'js/a.js', 'OLD-JS'); await seed(ctx, 'css/b.css', 'OLD-CSS');
    ok(await ctx.cachedVersion() === '1.0', '讀得到備份的版本號（1.0）');
    const k = (rel) => ctx.keyOf(SCOPE + rel);
    let r = ctx.versioned(ev, req('js/a.js?v=1.0'), k('js/a.js?v=1.0'));
    ok(r && (await text(await r)) === 'OLD-JS' && calls === 0, '版本相同的 js：直接回備份、一個請求都不送');
    r = ctx.versioned(ev, req('css/b.css?v=1.0'), k('css/b.css'));
    ok(r && (await text(await r)) === 'OLD-CSS' && calls === 0, '版本相同的 css：直接回備份');
    r = ctx.versioned(ev, req('js/a.js?v=2.0'), k('js/a.js'));
    ok(r && (await text(await r)) === 'NEW' && calls === 1, '版本不一樣（剛發佈新版）：網路優先，拿到新檔案');
    calls = 0;
    ok(ctx.versioned(ev, req('js/a.js'), k('js/a.js')) === null, '沒帶 ?v=：不走這條（回傳 null，照原本網路優先）');
    ok(ctx.versioned(ev, req('img/x.png?v=1.0'), k('img/x.png')) === null && ctx.versioned(ev, req('reaction.html?v=1.0'), k('reaction.html')) === null, '不是 css／js（圖片、頁面）：不走這條');
    r = ctx.versioned(ev, req('js/none.js?v=1.0'), k('js/none.js'));
    ok(r && (await text(await r)) === 'NEW' && calls === 1, '版本相同、但備份裡沒有這個檔：改走網路');
    ok(ctx.versioned(ev, req('js/boot.js?t=123'), k('js/boot.js')) === null, 'boot.js（?t=時間戳）永遠網路優先');
  }
  // ── 2. 沒有備份的 version.json／壞掉的 version.json ──
  { let calls = 0;
    const ctx = boot('x.github.io', async () => { calls++; return new Response('NEW'); });
    await seed(ctx, 'js/a.js', 'OLD-JS');
    ok(await ctx.cachedVersion() === null, '備份裡沒有 version.json＝不確定是哪一版（null）');
    let r = ctx.versioned(ev, req('js/a.js?v=1.0'), ctx.keyOf(SCOPE + 'js/a.js'));
    ok((await text(await r)) === 'NEW' && calls === 1, '沒有版本標記：網路優先（不敢直接用備份）');
    const ctx2 = boot('x.github.io', async () => new Response('NEW'));
    await seed(ctx2, 'version.json', 'not json{'); await seed(ctx2, 'js/a.js', 'OLD-JS');
    ok(await ctx2.cachedVersion() === null, 'version.json 壞掉：當作沒有');
  }
  // ── 3. 開發用網址永遠網路優先 ──
  for (const host of ['localhost', '127.0.0.1']) {
    let calls = 0;
    const ctx = boot(host, async () => { calls++; return new Response('NEW'); });
    await seed(ctx, 'version.json', JSON.stringify({ version: '1.0' })); await seed(ctx, 'js/a.js', 'OLD-JS');
    ok(ctx.DEV_HOST === true && ctx.versioned(ev, req('js/a.js?v=1.0'), ctx.keyOf(SCOPE + 'js/a.js')) === null, host + '：開發用網址不走「版本相同就用備份」（改了程式馬上看得到）');
  }
  { const ctx = boot('x.github.io', async () => new Response('x')); ok(ctx.DEV_HOST === false, '正式網站（github.io）會走');
    const c2 = boot('127.0.0.2', async () => new Response('x')); ok(c2.DEV_HOST === false, '其他網址也會走（只有 localhost、127.0.0.1、::1 算開發用）'); }
  // ── 4. refreshAll：先刪 version.json、全部抓完才放回去；途中不算同一版 ──
  { const log = []; let sawMarkerDuring = null, fetched = [], ctxRef;
    const ctx = boot('x.github.io', async (r) => {
      const u = (r.url || r).replace(SCOPE, ''); fetched.push(u);
      if (u !== 'version.json' && sawMarkerDuring === null) sawMarkerDuring = !!(await (await ctxRef.caches.open('fm-cache-v1')).match(keyOf('version.json')));
      return new Response(u === 'version.json' ? JSON.stringify({ version: '2.0' }) : 'body-' + u);
    }, log);
    ctxRef = ctx;
    await seed(ctx, 'version.json', JSON.stringify({ version: '1.0' })); await seed(ctx, 'js/a.js', 'OLD-JS');
    ok(await ctx.cachedVersion() === '1.0', '更新前：備份是 1.0');
    log.length = 0;
    const p = ctx.refreshAll();
    ok(await ctx.cachedVersion() === null, '更新一開始：version.json 立刻不算數（途中新舊檔案混在一起，不能當同一版）');
    await p;
    const li = log.findIndex(x => x === 'delete version.json'), lp = log.findIndex((x, i) => x === 'put version.json' && i > li), lo = log.findIndex(x => /^put (js|css|reaction)/.test(x));
    ok(li >= 0 && lp > li && (lo < 0 || (lo > li && lo < lp)), '順序：先刪 version.json → 抓其他檔案 → 最後才放回 version.json');
    ok(sawMarkerDuring === false, '抓其他檔案的時候，備份裡沒有 version.json');
    ok(fetched.length >= 100 && fetched[fetched.length - 1] === 'version.json', 'version.json 最後才抓（共 ' + fetched.length + ' 個檔案）');
    ok(await ctx.cachedVersion() === '2.0', '更新完：備份是 2.0（回到可以直接用備份）');
  }
  { // 更新途中失敗：version.json 不放回去 → 之後都走網路優先
    let n = 0;
    const ctx = boot('x.github.io', async (r) => { if (++n === 5) throw new Error('斷線'); return new Response('x'); });
    await seed(ctx, 'version.json', JSON.stringify({ version: '1.0' }));
    let failed = false; try { await ctx.refreshAll(); } catch (e) { failed = true; }
    ok(failed && await ctx.cachedVersion() === null, '更新失敗：version.json 不在備份裡（不會把半新半舊的備份當成同一版）');
  }
  // ── 5. boot.js、HTML ──
  const boot2 = fs.readFileSync(ROOT + 'js/boot.js', 'utf8'), html = ['reaction.html', 'index.html'].map(f => fs.readFileSync(ROOT + f, 'utf8'));
  ok(/var VERSION_WAIT_MS = 1500;/.test(boot2) && /Promise\.race\(\[versionP,/.test(boot2) && /known \|\| 'local-' \+ Date\.now\(\)/.test(boot2), 'boot.js：version.json 超過 1.5 秒沒回來、又有上次的版本號，就先用上次的');
  ok(/storeGet\('fm\.version'\)/.test(boot2) && /if \(slow\) versionP\.then\(/.test(boot2), 'boot.js：晚到的 version.json 照常處理（記下新版本）');
  ok(/var versionP = fetchVersion\(\)/.test(boot2) && !/signal/.test(boot2.split('function fetchVersion')[1].split('function storeGet')[0]), 'boot.js：不中斷 version.json 的請求（sw.js 靠它發現新版本）');
  ok(html.every(h => /<link rel="preconnect" href="https:\/\/[a-z0-9]+\.supabase\.co" crossorigin>/.test(h)), 'reaction.html、index.html 先跟 Supabase 打通連線（preconnect）');
  ok(/var NET_TIMEOUT_MS = 2000;/.test(src), '網路優先的逾時 2 秒（原本 4 秒）');
  console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS (' + total + ' checks)');
  process.exitCode = bad ? 1 : 0;
})();
