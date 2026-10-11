// 用「看不見視窗」的 Chrome 檢查舞台（js/stage.js）的縮放：舞台高度要「充滿瀏覽器高度」，
// 而且就算瀏覽器某個高度來源回報錯誤（iPad 上曾經出現畫面縮在上半部、重新載入也一樣），也要自己長回正確大小。（V1.23.0）
//   · 各種常見視窗大小（手機、iPad 直式／橫式、桌機）：舞台高度＝視窗高度（視窗夠寬時），或舞台寬度＝視窗寬度（視窗很窄時），置中、不超出
//   · 模擬 visualViewport 回報成一半高度：舞台仍然充滿
//   · 模擬 visualViewport 與 innerHeight 都回報成一半（只剩 CSS 的 100dvh 是對的）：舞台仍然充滿
//   · 模擬正在輸入文字（鍵盤彈出、visualViewport 縮小）：舞台縮進可見範圍；收起鍵盤後 1.5 秒內長回來
//   · 瀏覽器漏發 resize 事件：0.4 秒的監看會自己重算
//   · 縮小、再放大視窗：跟著變
// 前置：先把專案用本機伺服器開起來（在專案根目錄執行  python -m http.server 8743）。
// 用法：node test/reaction/stage_check.mjs [--out 截圖資料夾]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connect, sleep } from './cdp.mjs';

const PORT = 8743;
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const OUT = path.resolve(oi >= 0 ? args[oi + 1] : path.join(os.tmpdir(), 'fm-stage-check'));
fs.mkdirSync(OUT, { recursive: true });

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };

(async () => {
  const cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    const size = (w, h, dpr, mobile) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr || 1, mobile: !!mobile });
    const load = async (url) => {
      await cdp.send('Page.navigate', { url: 'http://localhost:' + PORT + '/' + url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now() });
      for (let i = 0; i < 200; i++) { if (await cdp.evalJs('document.documentElement.classList.contains("stage-ready") && !!window.Stage').catch(() => false)) break; await sleep(100); }
    };
    const rect = () => cdp.evalJs('(function(){ var r = document.getElementById("stage").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; })()');
    // 舞台高度要充滿：視窗比 500:850 寬 → 舞台高度＝視窗高度；視窗比 500:850 窄 → 舞台寬度＝視窗寬度；而且完全在視窗裡、置中
    const fits = (r, tag, vw, vh) => {
      vw = vw || r.vw; vh = vh || r.vh;
      const heightLimited = vw / vh >= 500 / 850;
      if (heightLimited) ok(Math.abs(r.h - vh) <= 1.5, tag + '：舞台高度 ' + r.h.toFixed(1) + ' ＝ 視窗高度 ' + vh);
      else ok(Math.abs(r.w - vw) <= 1.5, tag + '：舞台寬度 ' + r.w.toFixed(1) + ' ＝ 視窗寬度 ' + vw);
      ok(r.x >= -1 && r.y >= -1 && r.x + r.w <= vw + 1.5 && r.y + r.h <= vh + 1.5, tag + '：舞台完全在視窗裡（' + [r.x, r.y, r.w, r.h].map(n => n.toFixed(0)).join(',') + '）');
      ok(Math.abs((r.x + r.w / 2) - vw / 2) <= 1.5, tag + '：水平置中');
      ok(Math.abs((r.y + r.h / 2) - vh / 2) <= 1.5, tag + '：垂直置中');
    };

    // ═══ 1. 各種視窗大小 ═══
    const VIEWS = [[500, 850], [390, 844], [375, 667], [430, 932], [820, 1180], [1180, 820], [768, 1024], [1024, 768], [1366, 1024], [1024, 1366], [1920, 1080], [600, 400]];
    for (const [w, h] of VIEWS) {
      await size(w, h);
      await load('reaction.html?game=speed');
      await sleep(150);
      const r = await rect();
      fits(r, w + '×' + h, w, h);
    }
    // iPad 直式／橫式截圖（舞台要充滿高度）
    for (const [w, h, name] of [[820, 1180, 'ipad_portrait'], [1180, 820, 'ipad_landscape']]) {
      await size(w, h, 2);
      await load('index.html');
      await sleep(200);
      const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, 'stage_' + name + '.png'), Buffer.from(s.data, 'base64'));
    }

    // ═══ 2. 模擬 iPad 的壞數字 ═══
    await size(820, 1180);
    await load('reaction.html?game=speed');
    await sleep(200);
    ok((await rect()).h > 1170, '正常狀態舞台充滿高度');
    // (a) visualViewport 回報成一半高度，innerHeight 與 100dvh 是對的
    await cdp.evalJs('Object.defineProperty(window.visualViewport, "height", { get: function () { return 590; }, configurable: true }); 0;');
    await sleep(700);
    let r = await rect();
    ok(r.h > 1170, '(a) visualViewport 只有一半高 → 舞台仍充滿（' + r.h.toFixed(0) + '）');
    // (b) visualViewport 與 innerHeight 都回報成一半，只有 CSS 的 100dvh 是對的
    await cdp.evalJs('Object.defineProperty(window, "innerHeight", { get: function () { return 590; }, configurable: true }); 0;');
    await sleep(700);
    r = await rect();
    const dvh = await cdp.evalJs('document.querySelector(".vh-probe").offsetHeight');
    ok(dvh === 1180, '100dvh 探針量到 1180（' + dvh + '）');
    ok(r.h > 1170, '(b) visualViewport 與 innerHeight 都只有一半 → 靠 100dvh 仍充滿（' + r.h.toFixed(0) + '）');
    
    // ═══ 3. 輸入文字（鍵盤）時縮進可見範圍，收起後長回來 ═══
    await size(820, 1180);
    await load('reaction.html?game=speed');
    await sleep(200);
    await cdp.evalJs(`(function(){
      var i = document.createElement('input'); i.id = 'kb-test'; i.style.cssText = 'position:fixed;left:0;top:0;width:10px;height:10px;opacity:0.01';
      document.body.appendChild(i); i.focus();
      Object.defineProperty(window.visualViewport, 'height', { get: function () { return 600; }, configurable: true });
    })()`);
    await sleep(700);
    r = await rect();
    ok(await cdp.evalJs('document.activeElement && document.activeElement.id') === 'kb-test', '輸入框有焦點');
    ok(Math.abs(r.h - 600) <= 2, '鍵盤彈出（visualViewport 只剩 600）→ 舞台縮進可見範圍：' + r.h.toFixed(0));
    await cdp.evalJs('document.getElementById("kb-test").blur(); delete window.visualViewport.height;');
    await sleep(1500);
    r = await rect();
    ok(r.h > 1170, '收起鍵盤後 1.5 秒內舞台長回充滿高度（' + r.h.toFixed(0) + '）');

    // ═══ 4. 漏發 resize：不靠事件，0.4 秒的監看自己會重算 ═══
    await size(820, 1180);
    await load('reaction.html?game=speed');
    await sleep(200);
    // 直接改視窗大小，但把 resize 事件通通吃掉（模擬瀏覽器漏發）
    await cdp.evalJs('window.addEventListener("resize", function (e) { e.stopImmediatePropagation(); }, true); window.visualViewport.addEventListener("resize", function (e) { e.stopImmediatePropagation(); }, true);');
    await size(600, 700);
    await sleep(900);
    r = await rect();
    ok(Math.abs(r.h - 700) <= 1.5 || Math.abs(r.w - 600) <= 1.5, '漏發 resize 事件，監看仍把舞台調成新大小（' + r.w.toFixed(0) + '×' + r.h.toFixed(0) + '，視窗 600×700）');
    fits(r, '漏發事件後', 600, 700);

    // ═══ 5. 縮小再放大 ═══
    await load('reaction.html?game=speed');
    for (const [w, h] of [[400, 700], [820, 1180], [500, 850]]) {
      await size(w, h);
      await sleep(250);
      fits(await rect(), '縮放到 ' + w + '×' + h, w, h);
    }

    // ═══ 6. ?debug 資訊 ═══
    await size(820, 1180);
    await load('reaction.html?game=speed&debug');
    await sleep(300);
    const text = await cdp.evalJs('(document.querySelector(".stage-debug") || {}).textContent || ""');
    ok(/visualViewport/.test(text) && /100dvh/.test(text) && /inner/.test(text), '?debug 顯示各來源的數字：' + text.replace(/\n/g, ' | '));
    const s2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, 'stage_debug.png'), Buffer.from(s2.data, 'base64'));
  } finally { cdp.close(); }
  console.log(bad ? '\nFAILED ' + bad + ' / ' + total : '\nALL PASS (' + total + ' checks)　截圖在 ' + OUT);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
