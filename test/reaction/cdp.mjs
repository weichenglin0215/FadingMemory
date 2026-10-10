// 共用的「用 Chrome DevTools Protocol 遙控看不見視窗的 Edge／Chrome」小工具（make_icons.mjs、run_browser.mjs 都用它）。
//   不用安裝任何 npm 套件：需要電腦有 Chrome 或 Edge、Node 22 以上（內建 WebSocket、fetch）。
//   connect() 回傳 { send(method, params), evalJs(運算式), close() }：send 是 CDP 指令，evalJs 在頁面裡執行 JavaScript 並回傳結果（會等 Promise）。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ─── 找瀏覽器 ───
export function findBrowser() {
  const c = [
    process.env.BROWSER,
    // Chrome 排在 Edge 前面：有些電腦的 Edge 被管理政策強制裝了擴充功能（例如防毒軟體的網頁防護），它的提示視窗會出現在截圖裡
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'
  ].filter(Boolean);
  const hit = c.find(p => fs.existsSync(p));
  if (!hit) throw new Error('找不到 Edge 或 Chrome；可以用環境變數 BROWSER 指定瀏覽器執行檔的路徑');
  return hit;
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── 最小的 CDP 用戶端 ───
export async function connect() {
  const browser = findBrowser();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-icons-'));
  // 遠端除錯埠號用 0＝讓瀏覽器自己挑一個沒人用的，再從 DevToolsActivePort 檔讀回來（避免跟上次沒關乾淨的瀏覽器搶同一個埠）
  const proc = spawn(browser, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', '--mute-audio', '--disable-extensions', '--disable-component-extensions-with-background-pages', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
  let port = 0;
  for (let i = 0; i < 150 && !port; i++) {
    try { port = Number(fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch (e) { await sleep(150); }
  }
  const killAll = () => {
    // Windows 上瀏覽器會再開很多子行程，只殺主行程會留下一堆孤兒；用 taskkill /T 連整棵行程樹一起殺
    try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); else proc.kill('SIGKILL'); } catch (e) { }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { }
  };
  if (!port) { killAll(); throw new Error('瀏覽器啟動失敗（找不到 DevToolsActivePort）'); }
  const tab = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJs = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '')); return r.result.value; };
  return { send, evalJs, close() { try { ws.close(); } catch (e) { } killAll(); } };
}


// 開啟某一款遊戲並進到「遊戲開始」：載入頁面 → 換上假的排行榜資料庫（不連網路）→ 略過玩法說明與世界排行榜彈窗（按「下一步」「開始挑戰」）。
//   opts.port：本機伺服器埠號（預設 8743）；opts.root：專案根目錄（找 fake_backend.js 用）
export async function openGame(cdp, id, opts) {
  const port = (opts && opts.port) || 8743, root = (opts && opts.root) || process.cwd();
  await cdp.send('Page.navigate', { url: 'http://localhost:' + port + '/reaction.html?game=' + id + '&t=' + Date.now() });
  for (let i = 0; i < 200; i++) {
    const ok = await cdp.evalJs('!!(window.Reaction && Reaction.current && document.readyState === "complete" && window.Leaderboard && document.querySelector(".dlg"))').catch(() => false);
    if (ok) break;
    await sleep(100);
  }
  const fake = fs.readFileSync(path.join(root, 'test/leaderboard/fake_backend.js'), 'utf8');
  await cdp.evalJs('(function(){ try { (0, eval)(' + JSON.stringify(fake) + '); window.__fake.latency = 5; window.__fake.seed(' + JSON.stringify(id) + ', 0); Leaderboard.setNick("測試"); } catch (e) { } })()');
  await cdp.evalJs(`(async function(){
    var btn = function (t) { return [].slice.call(document.querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === t; })[0]; };
    if (btn('下一步')) { btn('下一步').click(); await new Promise(function (r) { setTimeout(r, 300); }); }
    if (btn('開始挑戰')) btn('開始挑戰').click();
  })()`);
  await sleep(400);
}
