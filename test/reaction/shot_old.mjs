// 檢查版面用（舊式闖關遊戲：沒有 G.debug.goto 的那些，例如分藥盒、撥時鐘、零錢分類、誰先到？、神準落下、鬼腳圖）：
// 先把「到過的最高關卡」設成 關卡＋4，開局就會從指定的關卡開始（kit.entryLevel），再存整個舞台（500×850）的截圖。
// 前置：本機伺服器已開（python -m http.server 8743）。
// 用法（在專案根目錄）：  node test/reaction/shot_old.mjs <輸出資料夾> 遊戲id:關卡 [遊戲id:關卡 …]
// 檔名：<遊戲id>.L<關卡>.png；每張圖前等待 WAIT_MS（預設 2500，看單子的遊戲可以用環境變數 WAIT_MS 拉長）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const [outDir, ...jobs] = process.argv.slice(2);
if (!outDir || !jobs.length) { console.log('用法：node test/reaction/shot_old.mjs <輸出資料夾> 遊戲id:關卡 …'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const WAIT = Number(process.env.WAIT_MS || 2500);
const cdp = await connect();
try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
  for (const job of jobs) {
    const [id, lv] = job.split(':');
    await cdp.send('Page.navigate', { url: 'http://localhost:8743/version.json' });       /* 很小的同源檔案，只為了寫 localStorage（先開遊戲頁再馬上換頁，伺服器會塞車、第二頁的檔案載入失敗） */
    await sleep(600);
    await cdp.evalJs('localStorage.setItem("fm.reaction.lvbest.' + id + '", ' + (Number(lv || 1) + 4) + ')');
    await openGame(cdp, id, { root: ROOT });
    await sleep(WAIT);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const f = path.join(outDir, id + '.L' + (lv || 1) + '.png');
    fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
    console.log('OK  ' + f);
  }
} finally { cdp.close(); }
