// 反著滑（swipecopy，V1.57.0 玩家意見）的瀏覽器端驗證：全部用「真的滑鼠事件」（Chrome DevTools Protocol 的 Input.dispatchMouseEvent）操作。
//   ① 整個遊戲畫面都可以滑：從九宮格裡、上方提示文字、九宮格下面的空白、左邊的邊、標題列開始滑，都算（答對過關、答錯失敗）
//   ② 手指滑過的路徑用白色粗線畫出來、結尾有箭頭，箭頭方向是「起點指向終點」
//   ③ 答錯：畫面保留 3 秒（九宮格、箭頭、你滑的路徑都還在），九宮格正下方橫排紅框（箭頭／要滑／你滑了），文字說明在紅框下面、都在遊戲區裡面、彼此不重疊
//   ④ 來不及（超時）：同樣保留畫面，紅框只有「箭頭／要滑」兩格
//   ⑤ 標題列「第 N 關」與時間條的上下空隙縮小
//   ⑥ 換關時，掛在整個畫面上的手指監聽不會越積越多
//   ⑦ 全程沒有 JS 錯誤；手機大小的視窗（390×844）再跑一次
// 前置：本機伺服器已開（例如在專案根目錄執行  python -m http.server 8900 --bind 127.0.0.1）。
// 用法（在專案根目錄）：  FM_PORT=8900 node test/reaction/browser_swipecopy.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let cdp, bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL', m); } };
const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v == null ? null : JSON.parse(v); };
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' ? 0 : 1, clickCount: 1 });
const vec = d => { const a = d * Math.PI / 4; return { x: Math.sin(a), y: -Math.cos(a) }; };
const R = css => J('(function(){ var e = document.querySelector(' + JSON.stringify(css) + '); if (!e) return null; var r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; })()');
const live = async () => { for (let i = 0; i < 100; i++) { if (await J('/^現在/.test((document.querySelector(".swipecopy-tip") || {}).textContent || "")')) return true; await sleep(15); } return false; };
const tipText = () => J('(document.querySelector(".swipecopy-tip") || {}).textContent');

// 從哪裡開始滑（page 座標；sc＝畫面縮放，手機視窗會縮小）：dirs＝這個起點往哪些方向滑 110 px 不會滑出視窗
const REGIONS = {
  '九宮格裡': { at: (s, sc) => [s.l + s.w / 2, s.t + s.h * 0.45], dirs: [0, 1, 2, 3, 4, 5, 6, 7] },
  '上方提示文字': { at: (s, sc) => [s.l + s.w / 2, s.t + 14 * sc], dirs: [2, 3, 4, 5, 6] },
  '九宮格下面的空白': { at: (s, sc) => [s.l + s.w / 2, s.b - 25 * sc], dirs: [0, 1, 2, 6, 7] },
  '畫面左邊的邊': { at: (s, sc) => [s.l - 8 * sc, s.t + s.h * 0.5], dirs: [0, 1, 2, 3, 4] },
};

/* 做一次滑動：mode＝'right'（滑對）、'wrong'（滑錯）；回傳這一次的資料 */
async function trial(regionName, mode, sc, opt) {
  opt = opt || {};
  const reg = REGIONS[regionName];
  for (let attempt = 0; attempt < 25; attempt++) {
    await J('(Reaction.current.debug.restart(), 1)'); await sleep(420);
    await J('(Reaction.current.debug.goto(' + (opt.level || 6) + '), 1)'); await sleep(60);
    if (opt.pre) await J(opt.pre);
    const stage = await R('.rx-stage');
    let [sx, sy] = opt.head ? [stage.l + stage.w / 2, (await R('.rx-head')).t + 12 * sc] : reg.at(stage, sc);
    sx = Math.round(sx); sy = Math.round(sy);
    await mouse('mouseMoved', sx, sy); await mouse('mousePressed', sx, sy);
    if (!await live()) { await mouse('mouseReleased', sx, sy); continue; }
    const q = await J('Reaction.current.debug.api().info'), allowed = opt.head ? [2, 3, 4, 5, 6] : reg.dirs;
    const pool = mode === 'right' ? allowed.filter(d => d === q.req[0]) : allowed.filter(d => d !== q.req[0]);
    if (!pool.length) { await mouse('mouseReleased', sx, sy); continue; }
    const d = pool[0], v = vec(d), dist = 110 * sc;
    const pts = [[sx, sy]];
    for (let i = 1; i <= 8; i++) { const x = Math.round(sx + v.x * dist * i / 8), y = Math.round(sy + v.y * dist * i / 8); pts.push([x, y]); await mouse('mouseMoved', x, y); }
    await sleep(130);
    const end = pts[pts.length - 1];
    await mouse('mouseReleased', end[0], end[1]);
    if ((await tipText()) === '來不及了') continue;                  // 電腦太忙，遠端指令來回太慢，箭頭已經超時了：重來（還停在「現在！」＝沒有被認到，才是真的有問題，留給呼叫的人檢查）
    return { q, d, v, sx, sy, stage };
  }
  throw new Error('試了 25 次都湊不到可以從「' + regionName + '」往 ' + mode + ' 的方向滑');
}

/* 路徑與箭頭：回傳畫面上的資料 */
const trailInfo = () => J(`(function(){
  var L = document.querySelector('.swipecopy-trail__line'), H = document.querySelector('.swipecopy-trail__head'), E = document.querySelector('.swipecopy-trail__edge');
  var probe = document.createElement('span'); probe.style.color = 'var(--c-on-accent)'; document.body.appendChild(probe); var white = getComputedStyle(probe).color; probe.remove();
  var p = function (s) { return (s || '').trim().split(/\\s+/).filter(Boolean).map(function (t) { var a = t.split(','); return [Number(a[0]), Number(a[1])]; }); };
  var cs = L && getComputedStyle(L);
  return { line: p(L && L.getAttribute('points')), head: p(H && H.getAttribute('points')), edge: p(E && E.getAttribute('points')), stroke: cs && cs.stroke, white: white, width: cs && parseFloat(cs.strokeWidth), pe: getComputedStyle(document.querySelector('.swipecopy-trail')).pointerEvents };
})()`);
/* 箭頭方向（起點指向終點）跟滑動方向一樣（誤差 12° 以內） */
function angOk(t, v) {
  if (t.head.length !== 3 || t.line.length < 2) return false;
  const a = t.line[0], b = t.head[0], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  return len > 20 && (dx * v.x + dy * v.y) / len > Math.cos(12 * Math.PI / 180);
}

/* 失敗畫面的排版 */
async function checkFailLayout(tag, sc, timeout) {
  const zone = await R('.swipecopy-zone'), stage = await R('.rx-stage'), cell = await R('.swipecopy-cell'), info = await R('.swipecopy-info');
  ok(zone && (await J('getComputedStyle(document.querySelector(".swipecopy-zone")).display')) !== 'none', tag + '：九宮格還在（沒有被藏起來）');
  const pop = await J('(function(){ var e = document.querySelector(".swipecopy-pop"); if (!e) return null; var r = e.getBoundingClientRect(), c = getComputedStyle(e); return { l: r.left, t: r.top, r: r.right, b: r.bottom, op: Number(c.opacity), anim: c.animationName }; })()');
  ok(pop && pop.op >= 0.99 && pop.t >= zone.t - 1 && pop.b <= zone.b + 1 && pop.l >= zone.l - 1 && pop.r <= zone.r + 1, tag + '：箭頭還留在九宮格裡它出現的那一格（不透明、沒有跑出九宮格）');
  ok(cell && cell.t >= zone.b - 1 && cell.t - zone.b <= 24 * sc, tag + '：紅框在九宮格的正下方（空隙 ' + (cell ? Math.round(cell.t - zone.b) : '?') + ' px）');
  ok(cell && cell.w > cell.h * 3, tag + '：紅框是橫式（寬 ' + (cell ? Math.round(cell.w) : '?') + '、高 ' + (cell ? Math.round(cell.h) : '?') + '）');
  const items = await J('[].slice.call(document.querySelectorAll(".swipecopy-cell__item")).map(function (e) { var r = e.getBoundingClientRect(); return { l: r.left, t: r.top }; })');
  ok(items.length === (timeout ? 2 : 3), tag + '：紅框裡有 ' + (timeout ? '2（箭頭、要滑）' : '3（箭頭、要滑、你滑了）') + ' 格：' + items.length);
  ok(items.every((it, i) => i === 0 || (it.l > items[i - 1].l + 20 * sc && Math.abs(it.t - items[0].t) < 2)), tag + '：紅框裡的小格由左往右橫排、上緣對齊');
  ok(info && cell && info.t >= cell.b - 1 && info.t - cell.b <= 24 * sc, tag + '：文字說明在紅框的正下方');
  ok(info && info.b <= stage.b + 1 && info.l >= stage.l - 1 && info.r <= stage.r + 1, tag + '：文字說明都在遊戲區裡面（底部 ' + (info ? Math.round(info.b) : '?') + '、遊戲區底部 ' + Math.round(stage.b) + '）');
  ok(cell && cell.b <= stage.b && zone.b <= cell.t + 1, tag + '：九宮格、紅框、文字說明由上往下排、彼此不重疊');
  ok((await J('document.querySelector(".swipecopy-info").textContent.length')) > 8, tag + '：有文字說明');
}

async function run(view) {
  const sc = view[0] < 500 ? view[0] / 500 : 1, tag = view[0] + '×' + view[1];
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: view[0], height: view[1], deviceScaleFactor: 1, mobile: view[0] < 500 });
  // 本機的 python 伺服器同時被要太多檔案時，偶爾會漏回某個 css（頁面變成沒有樣式、九宮格排版全亂，後面的檢查就會跟著亂失敗）：
  // 開頁面、跳到第 6 關之後先確認共用樣式與這款專屬的樣式都有載入，沒有就重開頁面
  for (let i = 0; i < 5; i++) {
    await openGame(cdp, 'swipecopy', { port: Number(process.env.FM_PORT) || 8900, root: ROOT });
    await J('(Reaction.current.debug.goto(6), 1)'); await sleep(150);
    if (await J('(function(){ var z = document.querySelector(".swipecopy-zone"), s = document.querySelector(".rx-stage"), c = document.querySelector(".screen"); return !!(z && s && c && getComputedStyle(z).position === "absolute" && getComputedStyle(s).position === "relative" && getComputedStyle(c).position === "absolute" && getComputedStyle(document.querySelector(".swipecopy-tip")).position === "absolute"); })()')) break;
    console.log('（樣式沒載入，重開頁面）'); await sleep(1500);
  }
  await J('(window.__errs = [], window.addEventListener("error", function (e) { window.__errs.push(e.message); }), 1)');
  await J('(Reaction.current.debug.goto(6), 1)'); await sleep(80);

  // ⑤ 標題列、時間條上下空隙縮小
  const scr = await R('.screen'), head = await R('.rx-head'), bar = await R('.rx-timebar'), stage0 = await R('.rx-stage');
  ok(await J('document.querySelector(".screen").classList.contains("swipecopy-screen")'), tag + '：整個畫面有 swipecopy-screen（空隙縮小的版面）');
  ok(head.t - scr.t <= 6 * sc + 0.5 && bar.t - head.b <= 4 * sc + 0.5 && stage0.t - bar.b <= 4 * sc + 0.5, tag + '：標題列上方 ' + (head.t - scr.t).toFixed(1) + '、標題列到時間條 ' + (bar.t - head.b).toFixed(1) + '、時間條到遊戲區 ' + (stage0.t - bar.b).toFixed(1) + ' px（原本 14／12／12）');
  ok(await J('getComputedStyle(document.querySelector(".screen")).touchAction') === 'none', tag + '：整個畫面關掉瀏覽器的觸控手勢');

  // ⑥ 換關時監聽不會越積越多（掛在 .screen 上的 pointerdown：新增次數 − 拿掉次數）
  await J('(function(){ var s = document.querySelector(".screen"), add = s.addEventListener.bind(s), rem = s.removeEventListener.bind(s); window.__net = 0; s.addEventListener = function (t, f, o) { if (t === "pointerdown") window.__net++; return add(t, f, o); }; s.removeEventListener = function (t, f, o) { if (t === "pointerdown") window.__net--; return rem(t, f, o); }; return 1; })()');
  for (let l = 7; l <= 12; l++) { await J('(Reaction.current.debug.goto(' + l + '), 1)'); await sleep(40); }
  ok((await J('window.__net')) <= 0, tag + '：連換 6 關，掛在畫面上的 pointerdown 監聽沒有增加（淨增加 ' + (await J('window.__net')) + '）');

  // ① 從各處開始滑：滑對 → 過關；滑錯 → 失敗
  for (const name of Object.keys(REGIONS)) {
    const t = await trial(name, 'right', sc);
    ok(await J('/^反應 /.test(document.querySelector(".swipecopy-info").textContent)'), tag + '：從「' + name + '」往正確的方向滑 → 過關（' + (await J('document.querySelector(".swipecopy-info").textContent')) + '）');
    const ti = await trailInfo();
    ok(ti.line.length >= 2 && ti.head.length === 3, tag + '：從「' + name + '」滑：有畫出路徑與結尾箭頭（路徑 ' + ti.line.length + ' 點）');
    ok(angOk(ti, t.v), tag + '：從「' + name + '」滑：箭頭方向＝起點指向終點');
  }
  { const t = await trial('九宮格裡', 'right', sc, { head: true });
    ok(await J('/^反應 /.test(document.querySelector(".swipecopy-info").textContent)'), tag + '：從標題列「第 N 關」開始滑也算'); }
  for (const name of Object.keys(REGIONS)) {
    const t = await trial(name, 'wrong', sc);
    ok((await tipText()) === '滑錯方向了', tag + '：從「' + name + '」往錯的方向滑 → 失敗（' + (await tipText()) + '）');
  }

  // ② 路徑：白色、粗、不擋觸控；箭頭方向；路徑外面墊一圈暗邊
  const t1 = await trial('九宮格裡', 'wrong', sc), ti = await trailInfo();
  ok(ti.stroke === ti.white && ti.white !== '', tag + '：路徑是白色（' + ti.stroke + '）');
  ok(ti.width >= 8, tag + '：路徑線是粗線（stroke-width ' + ti.width + '）');
  ok(ti.pe === 'none', tag + '：路徑圖層不擋觸控');
  ok(ti.edge.length === ti.line.length && ti.edge.length >= 2, tag + '：白線底下有同樣形狀的暗色邊');
  ok(angOk(ti, t1.v), tag + '：箭頭方向＝起點指向終點（滑 ' + ['上', '右上', '右', '右下', '下', '左下', '左', '左上'][t1.d] + '）');
  ok(ti.line.length > 0 && Math.abs(ti.line[0][0] - (t1.sx - t1.stage.l) / sc) < 3 && Math.abs(ti.line[0][1] - (t1.sy - t1.stage.t) / sc) < 3, tag + '：路徑從手指按下的地方開始畫');

  // ③ 答錯：畫面保留 3 秒
  // 頁面裡自己記時間（失敗那一刻＝上方提示變成「滑錯方向了」、進結算那一刻＝state().finished 變 true），不受遠端指令來回的延遲影響
  const PRE = `(function(){ clearInterval(window.__iv); window.__t = { fail: 0, fin: 0 };
    new MutationObserver(function(){ var t = document.querySelector('.swipecopy-tip'); if (t && t.textContent === '滑錯方向了' && !window.__t.fail) window.__t.fail = performance.now(); })
      .observe(document.querySelector('.rx-stage'), { subtree: true, childList: true, characterData: true });
    window.__iv = setInterval(function(){ if (window.__t.fail && !window.__t.fin && Reaction.current.debug.state().finished) window.__t.fin = performance.now(); }, 10); return 1; })()`;
  const t2 = await trial('九宮格裡', 'wrong', sc, { pre: PRE });
  const since = () => J('performance.now() - window.__t.fail');
  ok((await tipText()) === '滑錯方向了', tag + '：答錯');
  await checkFailLayout(tag + ' 答錯', sc, false);
  while ((await since()) < 1500) await sleep(40);
  ok((await J('!!document.querySelector(".swipecopy-zone")')) && !(await J('Reaction.current.debug.state().finished')), tag + '：失敗後 1.5 秒，遊戲畫面還在');
  ok((await J('!!document.querySelector(".swipecopy-trail__line").getAttribute("points")')), tag + '：失敗後 1.5 秒，你滑的路徑還在');
  while ((await since()) < 2600) await sleep(40);
  ok(!(await J('Reaction.current.debug.state().finished')), tag + '：失敗後約 2.6 秒，還沒進結算（舊版這時已經進結算）');
  for (let i = 0; i < 80 && !(await J('window.__t.fin')); i++) await sleep(25);
  const gap = await J('window.__t.fin - window.__t.fail');
  ok(gap >= 2900 && gap <= 3400, tag + '：失敗後約 3 秒才進結算（' + Math.round(gap) + ' ms）');
  await J('(clearInterval(window.__iv), 1)');

  // ④ 來不及：不滑出方向
  await J('(Reaction.current.debug.restart(), 1)'); await sleep(420); await J('(Reaction.current.debug.goto(6), 1)'); await sleep(60);
  { const st = await R('.rx-stage'), x = Math.round(st.l + st.w / 2), y = Math.round(st.t + st.h * 0.45);
    await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await live(); await mouse('mouseMoved', x + 6, y + 3);
    await sleep(1400); await mouse('mouseReleased', x + 6, y + 3); }
  ok((await tipText()) === '來不及了', tag + '：超時 → 來不及了');
  await checkFailLayout(tag + ' 超時', sc, true);

  ok((await J('window.__errs.length')) === 0, tag + '：沒有 JS 錯誤 ' + JSON.stringify(await J('window.__errs')));
}

(async () => {
  cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await run([500, 850]);
    await run([390, 844]);
  } finally { cdp.close(); }
  console.log(checks + ' checks');
  console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); try { cdp && cdp.close(); } catch (x) { } process.exit(1); });
