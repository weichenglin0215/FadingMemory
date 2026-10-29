// 產生 PWA 要用的圖示與分享預覽圖，存在 icons/ 底下：
//   icon-192.png、icon-512.png          一般圖示（manifest 的 purpose: any）
//   icon-maskable-512.png               可被系統裁切的圖示（purpose: maskable，內容縮在中間 80%）
//   apple-touch-icon.png（180×180）      iPhone「加入主畫面」用（iOS 只認這個，會自己加圓角）
//   og.png（1200×630）                   LINE／臉書貼連結時的預覽卡片圖（index.html 的 og:image）
// 畫稿是 test/pwa/icon_art.html（用遊戲本身的 Noto Sans TC 字型，要連網載入 Google Fonts）。
//
// 做法跟 test/reaction/make_icons.mjs 一樣：啟動看不見視窗的 Edge／Chrome，用 CDP 遙控，不用裝任何 npm 套件。
// 用法（在專案根目錄）：node test/pwa/make_pwa_icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connect, sleep } from '../reaction/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const ART = pathToFileURL(path.join(ROOT, 'test/pwa/icon_art.html')).href;
const OUT = path.join(ROOT, 'icons');

const JOBS = [
  { file: 'icon-192.png', kind: 'any', w: 192, h: 192 },
  { file: 'icon-512.png', kind: 'any', w: 512, h: 512 },
  { file: 'icon-maskable-512.png', kind: 'maskable', w: 512, h: 512 },
  { file: 'apple-touch-icon.png', kind: 'any', w: 180, h: 180 },
  { file: 'og.png', kind: 'og', w: 1200, h: 630 }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    for (const j of JOBS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: j.w, height: j.h, deviceScaleFactor: 1, mobile: false });
      await cdp.send('Page.navigate', { url: ART + '?kind=' + j.kind + '&size=' + j.w });
      let ok = false;
      for (let i = 0; i < 120 && !ok; i++) { ok = await cdp.evalJs('!!window.__ready').catch(() => false); if (!ok) await sleep(100); }
      if (!ok) throw new Error(j.file + '：畫稿沒有在時限內準備好');
      const fontOk = await cdp.evalJs('window.__fontOk');
      if (!fontOk) console.log('警告：' + j.file + ' 的 Noto Sans TC 字型沒載到（沒網路？），用系統字型代替');
      await sleep(150);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: j.w, height: j.h, scale: 1 }, captureBeyondViewport: false });
      fs.writeFileSync(path.join(OUT, j.file), Buffer.from(shot.data, 'base64'));
      console.log('OK   ' + j.file.padEnd(24) + j.w + '×' + j.h);
    }
  } finally { cdp.close(); }
})().catch(e => { console.error(e); process.exit(1); });
