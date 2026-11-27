// 錄影工具用的瀏覽器控制：開一個「看不見視窗」的 Chrome／Edge，用 Chrome DevTools Protocol（CDP）遙控它。
//   跟 test/reaction/cdp.mjs 的差別：這裡多了「接收事件」、自訂畫面大小，而且**在瀏覽器層擋掉所有外部網路**。
//   不用安裝任何 npm 套件（需要 Node 22 以上）。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findBrowser, sleep } from '../../../test/reaction/cdp.mjs';

export { sleep };

// 只有這些主機連得出去，其他（包含世界排行榜、遊玩次數用的 Supabase）一律當作「查無此網站」。
//   fonts.gstatic.com 是遊戲字型（Noto Sans TC），擋掉的話影片裡的字型會跟真的遊戲不一樣。
const ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'fonts.gstatic.com'];

export async function openBrowser() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-video-'));   // 全新的暫存設定檔：沒有你的帳號、最佳紀錄
  const rules = 'MAP * ~NOTFOUND, ' + ALLOWED_HOSTS.map(h => 'EXCLUDE ' + h).join(', ');
  const proc = spawn(findBrowser(), [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check',
    '--mute-audio', '--disable-extensions', '--disable-component-extensions-with-background-pages', '--hide-scrollbars',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--host-resolver-rules=' + rules, 'about:blank'
  ], { stdio: 'ignore' });
  const kill = () => {
    try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); else proc.kill('SIGKILL'); } catch (e) { }
    try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600); } catch (e) { }
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 }); } catch (e) { }
  };
  let port = 0;
  for (let i = 0; i < 150 && !port; i++) {
    try { port = Number(fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch (e) { await sleep(150); }
  }
  if (!port) { kill(); throw new Error('瀏覽器啟動失敗（找不到 DevToolsActivePort）'); }

  const tab = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map(), handlers = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method && handlers.has(m.method)) handlers.get(m.method).forEach(fn => fn(m.params));
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const on = (method, fn) => { if (!handlers.has(method)) handlers.set(method, []); handlers.get(method).push(fn); };
  // 在頁面裡執行 JavaScript，回傳結果（會等 Promise）
  const evalJs = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''));
    return r.result.value;
  };

  // 頁面裡的錯誤收集起來，最後的檢查會用到
  const errors = [];
  on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception ? p.exceptionDetails.exception.description : p.exceptionDetails.text));
  await send('Page.enable');
  await send('Runtime.enable');

  return { send, on, evalJs, errors, close() { try { ws.close(); } catch (e) { } kill(); } };
}

// 設定畫面大小：cssWidth × cssHeight 是網頁看到的大小，scale 是放大倍率（輸出像素 ＝ CSS 大小 × scale）。
//   用「放大倍率」而不是「把網頁拉大」，畫布（canvas）畫的盤面才會是清晰的。
export async function setViewport(b, cssWidth, cssHeight, scale) {
  await b.send('Emulation.setDeviceMetricsOverride', { width: cssWidth, height: cssHeight, deviceScaleFactor: scale, mobile: false });
}
