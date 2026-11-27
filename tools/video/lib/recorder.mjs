// 錄一段原始畫面：開遊戲 → 跳到指定關卡 → 讓「自動玩家」操作，時間每前進一格就拍一張。
import fs from 'node:fs';
import path from 'node:path';
import { sleep, setViewport } from './browser.mjs';

export const STAGE_W = 500;                       // 遊戲舞台的寬（js/stage.js：500×850）

// 輸出大小 → 網頁看到的大小與放大倍率（例如 1080×1920 → 500×889、2.16 倍）
export function viewportFor(output) {
  return { cssW: STAGE_W, cssH: Math.round(STAGE_W * output.height / output.width), scale: output.width / STAGE_W };
}

// 同樣的文字永遠得到同樣的數字（拿來當亂數種子）
export function hashSeed(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const easeInOut = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

class TakeDone extends Error { }                  // 錄滿指定的張數時丟出來，讓自動玩家停下來

const frameFile = (dir, n) => path.join(dir, String(n).padStart(5, '0') + '.jpg');

// 一次錄影。自動玩家用 moveTo／press／drag／release／wait 操作；遊戲時間一次前進一格（1/fps 秒）。兩種收畫面的方式：
//   逐格截圖（預設）：每前進一格就拍一張原尺寸的圖。畫質最好，慢。
//   即時錄影（live）：照真實時間的速度前進，同時讓瀏覽器把畫面一張張送過來。快，但畫面只有網頁大小（500×889）。
//   兩種的遊戲時間都由工具控制，所以題目、每一串、出現的時間點都一樣，差別只在畫面清晰度。
export class Take {
  constructor(b, o) {
    Object.assign(this, { b, fps: o.fps, dir: o.dir, maxFrames: o.maxFrames, fingerOpts: o.fingerOpts, rng: o.rng, live: !!o.live });
    this.ticks = []; this.startedAt = null;       // 即時錄影用：每一格做完的真實時間、開始的時間
    this.n = 0;                                   // 已經走了幾格
    this.x = o.startX; this.y = o.startY; this.down = false;
    this.sounds = []; this.gains = []; this.moves = [];
    this.marks = {}; this.note = '';              // 重要時間點（合成要用）、這一段做了什麼（印在畫面上）
    this.hidden = false;                          // true＝暫時不顯示手指（例如觀眾要專心看移動的時候）
  }
  get t() { return this.n / this.fps; }           // 目前錄到第幾秒
  get total() { return this.maxFrames / this.fps; }

  // 時間前進一格（逐格截圖：順便拍一張；即時錄影：等到真實時間也到了才前進）
  async frame() {
    if (this.n >= this.maxFrames) throw new TakeDone();
    if (this.live) {
      if (this.startedAt === null) this.startedAt = performance.now();
      const wait = this.startedAt + this.n * 1000 / this.fps - performance.now();
      if (wait > 1) await sleep(wait);
      else if (wait < -100) this.startedAt -= wait;  // 電腦落後太多：不趕進度（趕了會漏畫面），整體往後延
    }
    const sounds = await this.b.evalJs(`__finger(${this.x}, ${this.y}, ${this.down}, ${JSON.stringify(this.hidden ? { show: false } : this.fingerOpts)}); __vt.advance(${1000 / this.fps}); __rec.drain()`);
    this.sounds.push(...sounds);
    if (this.live) this.ticks.push(Date.now() / 1000);
    else {
      const shot = await this.b.send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
      fs.writeFileSync(frameFile(this.dir, this.n), Buffer.from(shot.data, 'base64'));
    }
    this.n++;
  }
  async wait(sec) { for (let i = 0, k = Math.round(sec * this.fps); i < k; i++) await this.frame(); }

  mouse(type, x, y, buttons) { return this.b.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 }); }

  // 手指（沒按著，或按著不放）滑到 (x, y)，花 sec 秒
  async moveTo(x, y, sec) {
    const x0 = this.x, y0 = this.y, k = Math.max(1, Math.round(sec * this.fps));
    for (let i = 1; i <= k; i++) {
      const p = easeInOut(i / k);
      this.x = x0 + (x - x0) * p; this.y = y0 + (y - y0) * p;
      if (this.down) await this.mouse('mouseMoved', this.x, this.y, 1);
      await this.frame();
    }
  }
  async press() { this.down = true; await this.mouse('mousePressed', this.x, this.y, 1); await this.frame(); }
  async release() { await this.mouse('mouseReleased', this.x, this.y, 0); this.down = false; }

  // 按著手指依序經過 points（每一段花 secPerStep 秒）。每經過一個轉折點都一定送出那個點，手指再快也不會斜切到別的格子
  async drag(points, secPerStep) {
    const way = [{ x: this.x, y: this.y }, ...points], segs = way.length - 1;
    const frames = Math.max(1, Math.round(segs * secPerStep * this.fps));
    let passed = 0;
    for (let i = 1; i <= frames; i++) {
      const s = segs * i / frames;
      while (passed + 1 <= Math.floor(s + 1e-9)) { passed++; await this.mouse('mouseMoved', way[passed].x, way[passed].y, 1); }
      const a = Math.min(segs - 1, Math.floor(s)), f = Math.min(1, s - a);
      this.x = way[a].x + (way[a + 1].x - way[a].x) * f; this.y = way[a].y + (way[a + 1].y - way[a].y) * f;
      if (f > 1e-6) await this.mouse('mouseMoved', this.x, this.y, 1);
      await this.frame();
    }
  }

  // 點一下（目前手指的位置）
  async tap() { await this.press(); await this.wait(0.07); await this.release(); }
  mark(name) { this.marks[name] = this.t; }

  // 停在原地小幅晃動（像在猶豫）
  async jiggle(sec) {
    const x0 = this.x, y0 = this.y;
    for (let i = 1, k = Math.round(sec * this.fps); i <= k; i++) {
      this.x = x0 + 4 * Math.sin(i / this.fps * 9); this.y = y0 + 3 * Math.sin(i / this.fps * 7);
      await this.frame();
    }
    this.x = x0; this.y = y0;
  }
  // 作勢要點下去、又縮回來
  async feint(sec) {
    const x0 = this.x, y0 = this.y;
    for (let i = 1, k = Math.max(2, Math.round(sec * this.fps)); i <= k; i++) {
      const a = Math.sin(Math.PI * i / k);
      this.x = x0 - 5 * a; this.y = y0 - 14 * a;
      await this.frame();
    }
    this.x = x0; this.y = y0;
  }
  // 徘徊思考：在 spots（[{x, y}]）之間移來移去、停頓、偶爾作勢要點，但**不會按下去**。持續 sec 秒（Infinity＝直到錄滿）
  async wander(spots, sec) {
    const end = this.n + Math.round(sec * this.fps), left = () => Math.max(0, (end - this.n) / this.fps);
    let bag = [], last = null;
    while (this.n < end) {
      if (!bag.length) {                            // 每一輪每個位置都去一次，順序隨機
        bag = spots.slice();
        for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      }
      let s = bag.pop();
      if (s === last && bag.length) { bag.unshift(s); s = bag.pop(); }
      last = s;
      // 指尖停在目標偏下方一點，觀眾看得到目標本身
      await this.moveTo(s.x + 6 + (this.rng() - 0.5) * 14, s.y + 16 + (this.rng() - 0.5) * 10, Math.min(left(), 0.32 + this.rng() * 0.28));
      const dwell = Math.min(left(), 0.15 + this.rng() * 0.5);
      if (dwell > 0.25 && this.rng() < 0.35) await this.feint(dwell); else await this.jiggle(dwell);
    }
  }
}

// 開啟遊戲頁、按掉玩法說明，停在「遊戲進行中」
//   o.beforeStart：按「開始挑戰」之前要先做的事（遊戲畫面是按下去才建立的）；o.ready：怎樣算「遊戲開始了」
export async function openGame(b, baseUrl, gameId, o = {}) {
  await b.send('Page.navigate', { url: baseUrl + '/reaction.html?game=' + gameId + '&t=' + Date.now() });
  const until = async (expr, what) => {
    for (let i = 0; i < 300; i++) { if (await b.evalJs(expr).catch(() => false)) return; await sleep(100); }
    throw new Error('等不到：' + what);
  };
  await until('!!(window.Reaction && Reaction.current && document.readyState === "complete" && window.__fake && document.querySelector(".dlg"))', '遊戲頁載入');
  await b.evalJs('window.__fake.latency = 5; window.__fake.loginAs("示範玩家")');
  if (o.beforeStart) await o.beforeStart();
  await b.evalJs(`(async function () {
    var sleepV = function () { return new Promise(function (r) { setTimeout(r, 300); }); };
    var btn = function (t) { return [].slice.call(document.querySelectorAll('button')).filter(function (x) { return x.textContent.trim() === t; })[0]; };
    if (btn('下一步')) { btn('下一步').click(); await sleepV(); }
    if (btn('開始挑戰')) btn('開始挑戰').click();
  })()`);
  await until((o.ready || '!!(Reaction.current.debug && Reaction.current.debug.api && Reaction.current.debug.api())') + ' && !document.querySelector(".dlg")', '遊戲開始');
}

// JPEG 圖片的寬高（讀檔頭）
function jpegSize(buf) {
  for (let i = 2; i + 9 < buf.length;) {
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return [0, 0];
}

// 即時錄影：開始讓瀏覽器送畫面，直到收到第一張「尺寸正確」的。
//   瀏覽器偶爾（實測每次開新瀏覽器的第一段約 3 次有 1 次）送來整個視窗的畫面（橫的，只看得到網頁上半部），
//   合成後畫面會被壓扁、下半部的動作也看不到。遇到就重新設定畫面大小再開始一次。
async function startScreencast(b, vp, received) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt) { await b.send('Emulation.clearDeviceMetricsOverride'); await sleep(150); }
    await setViewport(b, vp.cssW, vp.cssH, vp.scale);
    b.screencast = { list: received, width: vp.cssW, height: vp.cssH, wrong: 0 };
    await b.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
    for (let i = 0; i < 75 && !received.length; i++) await sleep(20);   // 等開局的第一張畫面
    if (received.length) return attempt;
    await b.send('Page.stopScreencast');
    b.screencast = null;
    await sleep(250);
  }
  throw new Error('即時錄影一直收不到尺寸正確的畫面（再執行一次，或拿掉 --live 用逐格截圖）');
}

// 準備瀏覽器：畫面大小、載入前注入虛擬時鐘與假資料庫、記下有沒有嘗試連到外面
export async function prepareBrowser(b, root, output) {
  const vp = viewportFor(output);
  await setViewport(b, vp.cssW, vp.cssH, vp.scale);
  await b.send('Network.enable');
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  b.outside = [];
  b.on('Network.requestWillBeSent', p => {
    const u = new URL(p.request.url);
    if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost', 'fonts.gstatic.com'].includes(u.hostname)) b.outside.push(u.hostname);
  });
  // 即時錄影時瀏覽器送來的畫面（b.screencast 有值的時候才收）
  b.screencast = null;
  b.on('Page.screencastFrame', p => {
    b.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => { });
    const cast = b.screencast;
    if (!cast) return;
    const data = Buffer.from(p.data, 'base64'), [w, h] = jpegSize(data);
    if (w === cast.width && h === cast.height) cast.list.push({ at: p.metadata.timestamp, data }); else cast.wrong++;
  });
  const read = f => fs.readFileSync(path.join(root, f), 'utf8');
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: read('tools/video/lib/inject.js') });
  // 假的排行榜資料庫：遊戲頁一開始就用假的，成績和遊玩次數不會送到真的伺服器
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__FAKE_OPTS = { keep: true };\n' + read('test/leaderboard/fake_backend.js') });
}

// 即時錄影：畫面是瀏覽器自己陸續送來的，要幫每一格找對應的那張——「下一格做完之前，最後送到的那張」
function writeLiveFrames(take, received) {
  let j = 0, used = new Set();
  for (let k = 0; k < take.n; k++) {
    const before = (k + 1 < take.n ? take.ticks[k + 1] : take.ticks[k] + 0.1) - 0.004;
    while (j + 1 < received.length && received[j + 1].at < before) j++;
    used.add(j);
    fs.writeFileSync(frameFile(take.dir, k), received[j].data);
  }
  return used.size;                               // 用到幾張不同的畫面
}

// 錄一段。driver：這款遊戲的自動玩家（tools/video/lib/games/<遊戲>.mjs）
export async function recordSegment(b, o) {
  const { script, segment, driver, rawDir, baseUrl, frames, live } = o;
  const dir = path.join(rawDir, segment.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const errorsBefore = b.errors.length;

  const seed = hashSeed(script.seed, segment.id);
  await openGame(b, baseUrl, script.game, { ready: driver.ready, beforeStart: driver.beforeStart ? () => driver.beforeStart(b, { seed, segment, options: script.gameOptions || {} }) : null });
  const fontText = '0123456789得分第關返回' + (script.name || '') + (driver.fontText || '浮窗拖曳湊十');
  await b.evalJs(`(async function () {
    await document.fonts.load('900 100px "Noto Sans TC"', ${JSON.stringify(fontText)});
    await document.fonts.ready;
  })()`);
  if (driver.prepare) await driver.prepare(b, script.gameOptions || {});
  // 從這裡開始，時間只能由錄影工具推進
  await b.evalJs('__vt.setAuto(false)');
  // 開局：固定亂數 → 跳到指定關卡（各遊戲做法不同，沒有特別寫就用闖關遊戲的 debug.goto）
  if (driver.start) await driver.start(b, segment, seed);
  else await b.evalJs(`__vt.reseed(${seed}); Reaction.current.debug.goto(${segment.level}); for (var i = 0; i < 24; i++) __vt.advance(25); 1`);
  // 接上音效：只記下「第幾秒播了哪一個聲音」，合成影片時再用同一套音效程式重新做出聲音
  await b.evalJs(`(function () {
    var t0 = __vt.now(), list = [];
    var play = Sfx.__play || (Sfx.__play = Sfx.play);
    Sfx.play = function (name) { list.push({ t: (__vt.now() - t0) / 1000, name: name }); return play.apply(Sfx, arguments); };
    window.__rec = { drain: function () { return list.splice(0); } };
  })()`);

  const board = await driver.boardRect(b);
  const vp = viewportFor(script.output);
  // 「不固定長度」的段落（看完才作答那種）：自動玩家做完就停，frames 只是上限
  const open = !!(driver.openEnded && driver.openEnded.includes(segment.type));
  const take = new Take(b, {
    live, fps: script.output.fps, dir, maxFrames: frames, rng: makeRng(hashSeed(script.seed, segment.id, 'bot')),
    fingerOpts: { show: !(script.finger && script.finger.show === false), tapRing: !(script.finger && script.finger.tapRing === false) },
    startX: board.left + board.width * 0.72, startY: board.top + board.height + 20
  });
  let startBoard = driver.snapshotAtEnd ? null : await driver.snapshot(b);
  const received = [];
  let retries = 0, wrongSize = 0;
  if (live) retries = await startScreencast(b, viewportFor(script.output), received);
  try {
    await driver[segment.type](take, segment);
    while (!open) await take.frame();              // 自動玩家做完了但還沒錄滿：停在最後的畫面
  } catch (e) {
    if (!(e instanceof TakeDone)) throw e;
    if (open) throw new Error(segment.id + '：錄了 ' + (frames / script.output.fps).toFixed(0) + ' 秒自動玩家還沒做完（關卡太高、移動太久？換低一點的 level）');
  }
  if (driver.snapshotAtEnd) startBoard = await driver.snapshot(b);
  let distinct = null;
  if (live) {
    await sleep(250);                              // 最後幾張還在路上
    await b.send('Page.stopScreencast');
    wrongSize = b.screencast.wrong;
    b.screencast = null;
    if (wrongSize > take.n * 0.05) throw new Error(segment.id + '：即時錄影中途有 ' + wrongSize + ' 張畫面尺寸不對（再執行一次，或拿掉 --live）');
    distinct = writeLiveFrames(take, received);
  }
  if (take.down) await take.release();

  const k = vp.scale;
  return {
    id: segment.id, frames: take.n, fps: script.output.fps, sounds: take.sounds, gains: take.gains.map(g => ({ ...g, x: g.x * k, y: g.y * k })),
    moves: take.moves, board: { cx: (board.left + board.width / 2) * k, cy: (board.top + board.height / 2) * k, width: board.width * k, height: board.height * k },
    startBoard, errors: b.errors.slice(errorsBefore), mode: live ? 'live' : 'frames', distinctFrames: distinct, wrongSize, retries, marks: take.marks, note: take.note
  };
}
