// PWA／離線／分享連結（V1.37）的靜態檢查，不需要瀏覽器：
//   1. manifest.webmanifest：欄位齊全、圖示檔存在、實際尺寸跟宣告的一樣（192／512／maskable）
//   2. 四個頁面（index／quiz／reaction／world）都有 manifest、apple-touch-icon、theme-color；index 有 og 標籤、og:image 是完整網址、尺寸對
//   3. 沒有「必要的」外部資源：四個頁面的 <script src>／<link href> 只准連 Google Fonts；QR Code 程式庫在 vendor/、share.js 優先用它
//   4. 分享出去的網址（QR／複製／分享）都帶 ?openExternalBrowser=1；boot.js 會把這個參數拿掉、會註冊 sw.js
//   5. sw.js 的離線清單（PRECACHE）跟專案同步（新增遊戲檔案忘了跑 node test/pwa/gen_sw.cjs --write 會在這裡失敗）
//   6. js/pwa.js：內建瀏覽器／iOS／Android 偵測，以及「第 3 次回到選單才提示、14 天內不再煩人、內建瀏覽器每次只提醒一次、已安裝不打擾」
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '../../') + '/';
const read = f => fs.readFileSync(ROOT + f, 'utf8');

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

(async () => {
  // ═══ 1. manifest ═══
  const man = JSON.parse(read('manifest.webmanifest'));
  ok(man.name === '記憶模糊' && man.short_name === '記憶模糊', 'manifest 名稱');
  ok(man.display === 'standalone', 'display 是 standalone');
  ok(man.start_url === './' && man.scope === './', 'start_url／scope 用相對路徑 ./（網站在 GitHub Pages 的子路徑 /FadingMemory/ 底下，用 / 會跑錯）');
  ok(/^#[0-9a-f]{6}$/i.test(man.background_color) && /^#[0-9a-f]{6}$/i.test(man.theme_color), '背景色／主題色是 #RRGGBB');
  const has = (size, purpose) => man.icons.some(i => i.sizes === size + 'x' + size && i.purpose === purpose && i.type === 'image/png');
  ok(has(192, 'any') && has(512, 'any') && has(512, 'maskable'), 'manifest 有 192／512 一般圖示與 512 maskable 圖示');
  man.icons.forEach(i => {
    const f = ROOT + i.src;
    ok(fs.existsSync(f), i.src + ' 存在');
    const s = fs.existsSync(f) && pngSize(f);
    ok(s && i.sizes === s.w + 'x' + s.h, i.src + ' 實際尺寸跟宣告一樣（' + (s ? s.w + 'x' + s.h : '不是 PNG') + '）');
  });
  const apple = pngSize(ROOT + 'icons/apple-touch-icon.png');
  ok(apple && apple.w === 180 && apple.h === 180, 'apple-touch-icon 是 180×180');
  const og = pngSize(ROOT + 'icons/og.png');
  ok(og && og.w === 1200 && og.h === 630, 'og.png 是 1200×630');

  // ═══ 2. 四個頁面的 <head> ═══
  const pages = ['index.html', 'quiz.html', 'reaction.html', 'world.html'];
  pages.forEach(p => {
    const s = read(p);
    ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(s), p + ' 有 manifest');
    ok(/<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/.test(s), p + ' 有 apple-touch-icon');
    ok(/<meta name="theme-color" content="#[0-9A-Fa-f]{6}">/.test(s), p + ' 有 theme-color');
    ok(/<meta name="apple-mobile-web-app-capable" content="yes">/.test(s), p + ' 有 apple-mobile-web-app-capable');
    // 沒有必要的外部資源：src／href 如果是 http(s)，只准是 Google Fonts
    [...s.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].forEach(m => {
      ok(/^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/.test(m[1]), p + ' 不該依賴外部資源：' + m[1]);
    });
  });
  const idx = read('index.html');
  const ogImg = (idx.match(/property="og:image" content="([^"]+)"/) || [])[1] || '';
  ok(/^https:\/\/weichenglin0215\.github\.io\/FadingMemory\/icons\/og\.png$/.test(ogImg), 'og:image 是完整網址且指向 icons/og.png：' + ogImg);
  ok(/property="og:title"/.test(idx) && /property="og:description"/.test(idx) && /name="description"/.test(idx), 'index 有 og:title／og:description／description');

  // ═══ 3. QR Code 程式庫放在專案裡 ═══
  const share = read('js/share.js');
  ok(fs.existsSync(ROOT + 'vendor/qrcode.min.js') && fs.statSync(ROOT + 'vendor/qrcode.min.js').size > 10000, 'vendor/qrcode.min.js 存在');
  ok(/QR_LIB_SRCS\s*=\s*\[\s*'vendor\/qrcode\.min\.js'/.test(share), 'share.js 優先用 vendor/qrcode.min.js');
  ok(!/QR_LIB_SRC\b(?!S)/.test(share.replace(/QR_LIB_SRCS/g, '')), 'share.js 沒有殘留舊的 QR_LIB_SRC（單一 CDN 來源）');

  // ═══ 4. 分享連結帶 ?openExternalBrowser=1 ═══
  ok(/SHARE_LINK\s*=\s*SHARE_URL\s*\+\s*'\?openExternalBrowser=1'/.test(share), 'SHARE_LINK = SHARE_URL + ?openExternalBrowser=1');
  ok(/text:\s*SHARE_LINK/.test(share), 'QR Code 內容是 SHARE_LINK');
  ok(/writeText\(SHARE_LINK\)/.test(share) && /ta\.value\s*=\s*SHARE_LINK/.test(share), '複製連結複製的是 SHARE_LINK（clipboard 與備援兩條路）');
  ok(/url:\s*SHARE_LINK/.test(share), '「分享出去」分享的是 SHARE_LINK');
  ok(/h\('div', \{ 'class': 'share-dlg__url', text: SHARE_URL \}\)/.test(share), '畫面上顯示的是乾淨網址 SHARE_URL');
  const boot = read('js/boot.js');
  ok(/openExternalBrowser/.test(boot) && /replaceState/.test(boot), 'boot.js 會把 openExternalBrowser 參數從網址列拿掉');
  ok(/serviceWorker\.register\('sw\.js', \{ updateViaCache: 'none' \}\)/.test(boot), 'boot.js 註冊 sw.js（updateViaCache none）');
  ok(/'js\/pwa\.js'/.test(boot), 'boot.js 的選單頁載入 js/pwa.js');
  // boot.js 唯一允許的遠端 JS 是 three.js 的 CDN 備援（本機 vendor/three.min.js 優先）
  const remote = [...boot.matchAll(/'(https?:\/\/[^']+)'/g)].map(m => m[1]);
  ok(remote.every(u => /three/.test(u)), 'boot.js 的遠端網址只有 three.js 備援：' + remote.join(' '));

  // ═══ 5. sw.js 離線清單跟專案同步 ═══
  const gen = require('../pwa/gen_sw.cjs');
  const want = await gen.build();
  const have = gen.current(read('sw.js'));
  ok(want.join('\n') === have.join('\n'), 'sw.js 的 PRECACHE 跟專案同步（請執行 node test/pwa/gen_sw.cjs --write）：缺 ' +
    want.filter(f => !have.includes(f)).slice(0, 5).join(',') + ' 多 ' + have.filter(f => !want.includes(f)).slice(0, 5).join(','));
  want.forEach(f => ok(fs.existsSync(ROOT + f), '離線清單的檔案存在：' + f));
  ['js/pwa.js', 'vendor/three.min.js', 'vendor/qrcode.min.js', 'js/world/story.js', 'js/reaction_triple100.js', 'js/boot.js', 'version.json', 'index.html', 'world.html'].forEach(f => {
    ok(want.includes(f), '離線清單包含 ' + f);
  });
  ok(!want.some(f => /^(admin|test|note|supabase)\//.test(f) || /^screen_adaptive/.test(f) || f === 'icons/og.png'), '離線清單不含開發用資料夾與 og.png');

  // ═══ 6. pwa.js 偵測 ═══
  const pwaSrc = read('js/pwa.js');
  // 用假的瀏覽器環境執行 pwa.js；回傳 { w（window）, dialogs（開過的彈窗）, ready（UI.ready 排進的函式）, fire（觸發 window 事件）, store }
  function load(env) {
    const listeners = {}, mem = new Map(), ses = new Map(), dialogs = [];
    let readyFn = null, persisted = 0;
    const w = {
      navigator: { userAgent: env.ua || '', platform: env.platform || 'Win32', maxTouchPoints: env.touch || 0, standalone: !!env.iosStandalone, storage: { persist() { persisted++; return Promise.resolve(true); } } },
      matchMedia: () => ({ matches: !!env.standalone }),
      location: { origin: 'https://weichenglin0215.github.io', pathname: '/FadingMemory/index.html' },
      isSecureContext: false,
      sessionStorage: { getItem: k => (ses.has(k) ? ses.get(k) : null), setItem: (k, v) => { ses.set(k, String(v)); } },
      addEventListener(n, f) { listeners[n] = f; },
      setTimeout: (f) => { f(); return 0; },
      UI: {
        ready(f) { readyFn = f; },
        wait: () => Promise.resolve(),
        h: (t, o) => ({ tag: t, o }),
        icon: () => '<svg/>',
        store: { get: (k, f) => (mem.has(k) ? mem.get(k) : f), set: (k, v) => mem.set(k, v) }
      },
      Dlg: { open(o) { dialogs.push(o); return { close() { } }; }, richText: t => ({ rich: t }) }
    };
    w.window = w;
    const ctx = vm.createContext(Object.assign(w, { document: { querySelector: () => null, createElement: () => ({ style: {}, select() { } }), body: { appendChild() { }, removeChild() { } }, execCommand: () => true } }));
    vm.runInContext(pwaSrc, ctx);
    return { w, dialogs, mem, ses, listeners, persisted: () => persisted, run: async () => { readyFn(); for (let i = 0; i < 5; i++) await Promise.resolve(); await new Promise(r => setImmediate(r)); } };
  }
  const UA = {
    lineIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.5.0',
    lineAnd: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Line/14.5.0',
    safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    crios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
    ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    androidChrome: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    fb: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/430.0]',
    ig: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 Instagram 300.0.0.0 Android',
    wx: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 MicroMessenger/8.0.40',
    winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  const det = (ua, extra) => load(Object.assign({ ua }, extra)).w.PWA.test.detect(Object.assign({ ua, platform: 'iPhone', maxTouchPoints: 5 }, extra));
  let d = det(UA.lineIos);       ok(d.inApp === 'LINE' && d.os === 'ios' && !d.iosSafari, 'LINE（iPhone）是內建瀏覽器，不算 Safari');
  d = det(UA.lineAnd);           ok(d.inApp === 'LINE' && d.os === 'android', 'LINE（Android）');
  d = det(UA.safari);            ok(d.inApp === '' && d.os === 'ios' && d.iosSafari, 'iPhone Safari');
  d = det(UA.crios);             ok(d.os === 'ios' && !d.iosSafari && d.inApp === '', 'iPhone Chrome（CriOS）不算 Safari');
  d = det(UA.fb);                ok(d.inApp === 'Facebook', 'Facebook 內建瀏覽器');
  d = det(UA.ig);                ok(d.inApp === 'Instagram', 'Instagram 內建瀏覽器');
  d = det(UA.wx);                ok(d.inApp === '微信', '微信內建瀏覽器');
  d = det(UA.androidChrome);     ok(d.inApp === '' && d.os === 'android', 'Android Chrome');
  d = load({}).w.PWA.test.detect({ ua: UA.ipadDesktop, platform: 'MacIntel', maxTouchPoints: 5 });
  ok(d.os === 'ios' && d.iosSafari, 'iPad（桌面版 UA）靠 MacIntel＋多點觸控認出是 iOS');
  d = load({}).w.PWA.test.detect({ ua: UA.ipadDesktop, platform: 'MacIntel', maxTouchPoints: 0 });
  ok(d.os === 'other', '真的 Mac（沒有觸控）不是 iOS');
  d = load({}).w.PWA.test.detect({ ua: UA.androidChrome, standalone: true });
  ok(d.standalone === true, 'standalone 原樣帶回');

  // canGuide：哪些環境適合給「加到主畫面」
  const can = (env, withPrompt) => { const t = load(env); if (withPrompt) t.listeners.beforeinstallprompt({ preventDefault() { } }); return t.w.PWA.canGuide(); };
  ok(can({ ua: UA.safari, platform: 'iPhone', touch: 5 }) === true, 'iPhone Safari 適合');
  ok(can({ ua: UA.androidChrome }) === true, 'Android 適合（沒有 beforeinstallprompt 也給手動說明）');
  ok(can({ ua: UA.lineIos, platform: 'iPhone', touch: 5 }) === false, 'LINE 內建瀏覽器不適合（要先請他用瀏覽器開）');
  ok(can({ ua: UA.androidChrome, standalone: true }) === false, '已經安裝（standalone）不適合');
  ok(can({ ua: UA.winChrome }) === false, '桌機沒有安裝事件不適合');
  ok(can({ ua: UA.winChrome }, true) === true, '桌機 Chrome 有 beforeinstallprompt 就適合（一鍵安裝）');

  // 自動提示的時機
  async function visit(t0, n) {                // 模擬「第 n 次新開瀏覽器工作階段回到選單」：同一份 localStorage、新的 sessionStorage
    const t = load(t0.env); t.mem = t0.mem; t.w.UI.store.get = (k, f) => (t0.mem.has(k) ? t0.mem.get(k) : f); t.w.UI.store.set = (k, v) => t0.mem.set(k, v);
    await t.run();
    return t;
  }
  const mem = new Map();
  const env = { ua: UA.safari, platform: 'iPhone', touch: 5 };
  let r1 = await visit({ env, mem }), r2 = await visit({ env, mem });
  ok(r1.dialogs.length === 0 && r2.dialogs.length === 0, '第 1、2 次回到選單不提示');
  let r3 = await visit({ env, mem });
  ok(r3.dialogs.length === 1 && r3.dialogs[0].title === '加到手機主畫面', '第 3 次回到選單提示一次「加到手機主畫面」');
  ok(mem.get('fm.pwa.visits') === 3, '回訪次數存在 localStorage（fm.pwa.visits）');
  let r4 = await visit({ env, mem });
  ok(r4.dialogs.length === 0, '提示過之後 14 天內不再自動跳出');
  mem.set('fm.pwa.asked', Date.now() - 15 * 24 * 3600 * 1000);
  let r5 = await visit({ env, mem });
  ok(r5.dialogs.length === 1, '超過 14 天又會提示一次');
  // 同一個工作階段（沒關掉瀏覽器）重複進選單只算一次回訪
  const mem2 = new Map(), t = load({ ua: UA.safari, platform: 'iPhone', touch: 5 });
  t.w.UI.store.get = (k, f) => (mem2.has(k) ? mem2.get(k) : f); t.w.UI.store.set = (k, v) => mem2.set(k, v);
  await t.run(); await t.run();
  ok(mem2.get('fm.pwa.visits') === 1, '同一個工作階段重複進選單只算 1 次回訪');

  // iOS Safari 的說明內容；Android 有 beforeinstallprompt 時有「安裝」按鈕
  const g1 = load({ ua: UA.safari, platform: 'iPhone', touch: 5 }); g1.w.PWA.openGuide();
  ok(g1.dialogs.length === 1 && JSON.stringify(g1.dialogs[0].children).indexOf('加入主畫面') >= 0, 'iOS Safari 說明提到「加入主畫面」');
  const g2 = load({ ua: UA.androidChrome }); let prompted = 0;
  g2.listeners.beforeinstallprompt({ preventDefault() { }, prompt() { prompted++; } });
  g2.w.PWA.openGuide();
  const inst = g2.dialogs[0].buttons.find(b => b.text === '安裝');
  ok(!!inst, 'Android 有 beforeinstallprompt 時說明彈窗有「安裝」按鈕');
  inst && inst.onClick();
  ok(prompted === 1, '按「安裝」呼叫瀏覽器的 prompt()');
  ok(g2.w.PWA.state().hasPrompt === false, '安裝事件只能用一次，用掉就清掉');

  // 內建瀏覽器：每個工作階段只提醒一次；已安裝：不提示、請求持久儲存
  const line = load({ ua: UA.lineIos, platform: 'iPhone', touch: 5 });
  await line.run(); await line.run();
  ok(line.dialogs.length === 1 && line.dialogs[0].title === '用瀏覽器開啟比較好', 'LINE 內建瀏覽器提醒一次（同工作階段不重複）');
  ok(line.dialogs[0].buttons.some(b => b.text === '複製連結') && line.dialogs[0].buttons.some(b => b.text === '先在這裡玩'), '提示有「複製連結」與「先在這裡玩」');
  ok(JSON.stringify(line.dialogs[0].children).indexOf('LINE') >= 0, '提示裡寫出是哪個 App');
  const sa = load({ ua: UA.androidChrome, standalone: true });
  await sa.run();
  ok(sa.dialogs.length === 0 && sa.persisted() === 1, '已安裝：不打擾，並請求持久儲存');
  const desk = load({ ua: UA.winChrome });
  await desk.run(); await desk.run();
  ok(desk.dialogs.length === 0, '桌機不跳任何提示');

  console.log((bad ? bad + ' FAIL / ' : '') + total + ' checks');
  console.log(bad ? 'SOME FAILED' : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
