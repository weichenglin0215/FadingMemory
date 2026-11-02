// 檢查畫面用：開某款遊戲、依序執行幾段 JavaScript（每段之間等指定的毫秒）、最後存整個舞台（500×850）的截圖。
// 用來看「按完之後」「判定中」「結算前」這類中間狀態（shot_level.mjs 只能看剛開局的畫面）。
// 前置：本機伺服器已開（python -m http.server 8743）。
// 用法（在專案根目錄）：  node test/reaction/shot_state.mjs <輸出檔.png> <遊戲id> [等待毫秒:JavaScript …]
//   例：node test/reaction/shot_state.mjs out.png fifteen "400:Reaction.current.debug.goto(8)" "2500:Reaction.current.debug.wrong()"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const [out, id, ...steps] = process.argv.slice(2);
if (!out || !id) { console.log('用法：node test/reaction/shot_state.mjs <輸出檔.png> <遊戲id> [等待毫秒:JavaScript …]'); process.exit(1); }
const cdp = await connect();
try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
  await openGame(cdp, id, { root: ROOT });
  for (const st of steps) {
    const i = st.indexOf(':');
    await sleep(Number(st.slice(0, i)) || 0);
    await cdp.evalJs('(function(){ try { return ' + st.slice(i + 1) + '; } catch (e) { return "ERR " + e.message; } })()');
  }
  await sleep(300);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('OK  ' + out);
} finally { cdp.close(); }
