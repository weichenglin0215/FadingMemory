// 檢查版面用：開某款遊戲、跳到指定的關卡，存整個舞台（500×850）的截圖。用來看「最難的關卡」東西放不放得下。
// 前置：本機伺服器已開（python -m http.server 8743）。
// 用法（在專案根目錄）：  node test/reaction/shot_level.mjs <輸出資料夾> 遊戲id:關卡 [遊戲id:關卡 …]
//   例：node test/reaction/shot_level.mjs shots timetable:30 expiry:30
// 檔名：<遊戲id>.L<關卡>.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const [outDir, ...jobs] = process.argv.slice(2);
if (!outDir || !jobs.length) { console.log('用法：node test/reaction/shot_level.mjs <輸出資料夾> 遊戲id:關卡 …'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const cdp = await connect();
try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
  for (const job of jobs) {
    const [id, lv] = job.split(':');
    await openGame(cdp, id, { root: ROOT });
    await sleep(400);
    await cdp.evalJs('Reaction.current.debug.goto(' + Number(lv || 1) + ')');
    await sleep(900);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const f = path.join(outDir, id + '.L' + (lv || 1) + '.png');
    fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
    console.log('OK  ' + f);
  }
} finally { cdp.close(); }
