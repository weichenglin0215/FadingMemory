// 幫每一款「秒反應」遊戲拍一張「遊戲圖示」：進遊戲、等到第 3 秒左右，把遊戲畫面（不含最上面的標題列）截下來，
// 縮成「高 256 像素」的 PNG，存成 img/reaction/<遊戲id>.png——「選一個想玩的遊戲」彈窗（js/menu.js 的 GAME_CELLS）會直接拿來當格子的縮圖。
//
// 做法：自己啟動一個「看不見視窗」的 Edge／Chrome（headless），用 Chrome DevTools Protocol（CDP）遙控它，
//       所以不用安裝任何 npm 套件，只要電腦有 Edge 或 Chrome、Node 22 以上（內建 WebSocket、fetch）。
// 前置：先把專案用本機伺服器開起來（例如在專案根目錄執行  python -m http.server 8743）。
//
// 用法（在專案根目錄）：
//   node test/reaction/make_icons.mjs                      全部遊戲（讀 js/menu.js 的 GAME_CELLS 清單）
//   node test/reaction/make_icons.mjs speed spot           只拍指定的幾款
//   node test/reaction/make_icons.mjs --wait 2400          等幾毫秒再拍（預設 2400：加上開頁面、截圖本身要花的約 0.6～0.9 秒，實際拍到的是遊戲開始後約第 3 秒；
//                                                         有些遊戲第 3 秒是空畫面或準備階段，下面 WAIT 表可以個別指定）
//   node test/reaction/make_icons.mjs --port 8743 --out img/reaction --height 256
//   node test/reaction/make_icons.mjs --full --keep-hints --out some/dir    檢查版面用：存整個舞台 500×850 的原尺寸截圖（含標題列、操作提示）
//
// 拍照時會做的事：用假的排行榜資料庫（test/leaderboard/fake_backend.js，不連網路）→ 略過玩法說明 → 按掉「開始／出發」遮罩 →
// 等待 → 把操作提示（手指圖示）藏起來（圖示要凸顯遊戲本身）→ 截圖。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const PORT = Number(opt('port', 8743)), WAIT_DEFAULT = Number(opt('wait', 2400)), OUT = path.resolve(ROOT, opt('out', 'img/reaction')), HEIGHT = Number(opt('height', 256));
const FULL = args.includes('--full') && !!args.splice(args.indexOf('--full'), 1);            // --full：存整個舞台（含標題列）的原尺寸截圖，檢查版面用，檔名加 .full
const KEEP_HINTS = args.includes('--keep-hints') && !!args.splice(args.indexOf('--keep-hints'), 1);   // --keep-hints：不藏操作提示
const only = args.filter(a => !a.startsWith('--'));

// 有些遊戲「第 3 秒」剛好是空畫面或準備階段，不夠有特色：在這裡個別指定要等幾毫秒（從按下「開始挑戰」那一刻起算）
const WAIT = {
  speed: 2000,          // 零秒出手：第 3 秒左右數字還看得清楚（4.0000 秒才開始漸漸變透明）
  rainbow: 1300,        // 七彩陷阱：太晚就變成「超時了」的結算畫面
  rps: 1300,            // 猜拳必贏：太晚就變成「慢出了」
  
  dicechange: 1500,     // 骰子少一點：前 2.6 秒是亮出骰子的記憶階段，之後會蓋住
  whosaid: 1900,        // 誰說的：第一個小人在 0.5～1.4 秒說話，第二個 1.6～2.5 秒
  tapback: 1300,        // 倒著點：圓圈依序亮起
  nthshape: 1300,       // 第幾個出現：圖形一個個閃現（0.7 秒起第一個，每個亮 0.8 秒）
  racefirst: 1750,      // 誰先衝線：1.75 秒後出發，約 1 秒跑完——拍在半途，四個圓點的位置才不一樣
  spinpick: 1500,       // 轉盤停哪格：指針還看得見的時候
  alignchar: 3000,
  spingap: 2000
};

// ─── 遊戲清單：讀 js/menu.js 的 GAME_CELLS（id 與名稱）───
function gameIds() {
  const src = fs.readFileSync(path.join(ROOT, 'js/menu.js'), 'utf8');
  return [...src.matchAll(/\{\s*id:\s*'([a-z0-9]+)',\s*name:\s*'([^']+)',\s*img:/g)].map(m => ({ id: m[1], name: m[2] }));
}

async function shoot(cdp, game) {
  await openGame(cdp, game.id, { port: PORT, root: ROOT });
  // 「開始」「出發」之類的遮罩：按掉（遊戲自己的開始卡片，按鈕文字是 開始／出發）
  await cdp.evalJs(`(function(){
    var bs = [].slice.call(document.querySelectorAll('#screen button, #screen .btn'));
    var b = bs.filter(function (x) { return /^(開始|出發|準備好了)$/.test(x.textContent.trim()); })[0];
    if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 5 }));
  })()`);
  await sleep((WAIT[game.id] != null ? WAIT[game.id] : WAIT_DEFAULT) - 400 > 0 ? (WAIT[game.id] != null ? WAIT[game.id] : WAIT_DEFAULT) - 400 : 0);
  // 把操作提示藏起來
  if (!KEEP_HINTS) await cdp.evalJs(`(function(){ var s = document.getElementById('icon-style'); if (!s) { s = document.createElement('style'); s.id = 'icon-style'; s.textContent = '.rx-hint,.rx-hint__label{display:none!important}'; document.head.appendChild(s); } })()`);
  await sleep(60);
  const rect = await cdp.evalJs(`(function(){ var s = document.getElementById('stage').getBoundingClientRect(), b = document.querySelector('.bar').getBoundingClientRect(); return { x: s.left, y: s.top, w: s.width, h: s.height, bar: b.height }; })()`);
  const clip = FULL ? { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } : { x: rect.x, y: rect.y + rect.bar, width: rect.w, height: rect.h - rect.bar, scale: HEIGHT / (rect.h - rect.bar) };
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
  const file = path.join(OUT, game.id + (FULL ? '.full' : '') + '.png');
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  return file;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let list = gameIds();
  if (only.length) list = list.filter(g => only.includes(g.id));
  if (!list.length) throw new Error('沒有要拍的遊戲');
  const cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
    let n = 0;
    for (const g of list) {
      try { const f = await shoot(cdp, g); n++; console.log('OK   ' + g.id.padEnd(14) + g.name + '  →  ' + path.relative(ROOT, f)); }
      catch (e) { console.log('FAIL ' + g.id + ' ' + e.message); }
    }
    console.log('完成：' + n + '／' + list.length + ' 張，存在 ' + path.relative(ROOT, OUT));
  } finally { cdp.close(); }
})().catch(e => { console.error(e); process.exit(1); });
