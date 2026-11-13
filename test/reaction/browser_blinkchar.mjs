// 瞬間識字（blinkchar，V1.57.0）的瀏覽器端驗證：用真的滑鼠事件點答案。
//   ① 字在 3 秒內的不定時刻閃出來、位置整個放得進白底、字消失之後答案按鈕才長出來（個數＝這一關的選項數）
//   ② 第 1 關：字全黑、約 0.2 秒；第 30 關：字很淡（10%）、只亮 1 個畫面更新、字只有畫面寬度的 10%
//   ③ 答案按鈕是正方形、字寬是邊長的 80%；方陣放得進畫面；選項數 4 → 16
//   ④ 點對過關進下一關；點錯／超時失敗、把字再亮出來
//   ⑤ 全程沒有 JS 錯誤
// 前置：本機伺服器已開（例如在專案根目錄執行  python -m http.server 8900 --bind 127.0.0.1）。
// 用法（在專案根目錄）：  FM_PORT=8900 node test/reaction/browser_blinkchar.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let cdp, bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL', m); } };
const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v == null ? null : JSON.parse(v); };
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' ? 0 : 1, clickCount: 1 });
async function click(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await sleep(40); await mouse('mouseReleased', x, y); await sleep(60); }
const q = () => J('Reaction.current.debug.api().info');
/* 進第 n 關，並在字閃出來之前裝好「記錄字的濃淡變化」的觀察器；回傳這一關的題目 */
async function startLevel(n) {
  await J('(Reaction.current.debug.goto(' + n + '), 1)'); await sleep(5);
  await J(`(function(){ window.__fl = []; var e = document.querySelector('.blinkchar-ch'); new MutationObserver(function(){ window.__fl.push({ t: performance.now(), op: Number(e.style.opacity) }); }).observe(e, { attributes: true, attributeFilter: ['style'] }); window.__t0 = performance.now(); return 1; })()`);
  return q();
}
/* 等字閃完（觀察器收到「亮」再收到「滅」）；回傳 { on, off, dur, op } */
async function waitFlash() {
  for (let i = 0; i < 160; i++) {
    const r = await J('(function(){ var f = window.__fl, on = null, off = null; for (var i = 0; i < f.length; i++) { if (f[i].op > 0 && on == null) on = f[i]; else if (on && f[i].op === 0) { off = f[i]; break; } } return on && off ? { onAt: on.t - window.__t0, dur: off.t - on.t, op: on.op } : null; })()');
    if (r) return r;
    await sleep(50);
  }
  return null;
}
const rects = () => J('(function(){ var r = function (s) { var e = document.querySelector(s); if (!e) return null; var b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; }; return { stage: r(".rx-stage"), zone: r(".blinkchar-zone"), ch: r(".blinkchar-ch"), btns: r(".blinkchar-btns"), n: document.querySelectorAll(".blinkchar-opt").length }; })()');

(async () => {
  cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 4; i++) {                                // 本機 python 伺服器偶爾漏回 css／js：樣式沒載入就重開
      await openGame(cdp, 'blinkchar', { port: Number(process.env.FM_PORT) || 8900, root: ROOT });
      for (let k = 0; k < 40 && !(await J('!!document.querySelector(".blinkchar-zone")')); k++) await sleep(100);
      if (await J('!!document.querySelector(".blinkchar-zone") && getComputedStyle(document.querySelector(".blinkchar-zone")).position === "relative"' + ' && getComputedStyle(document.documentElement).getPropertyValue("--c-ink").trim() !== ""')) break;
      console.log('（頁面沒載好，重開）'); await sleep(1000);
    }
    await J('(window.__errs = [], window.addEventListener("error", function (e) { window.__errs.push(e.message); }), 1)');

    const PRM = await J('(function(){ var T = Reaction.list().filter(function (g) { return g.id === "blinkchar"; })[0].test; return { FLASH_MS: T.FLASH_MS, OPACITY: T.OPACITY, SIZE: T.SIZE, OPTIONS: T.OPTIONS, OPT_COLS: T.OPT_COLS, MSG_H: T.MSG_H, ZONE_RATIO: T.ZONE_RATIO, RAMP: T.RAMP_LEVELS }; })()');
    // ══ 第 1 關 ══
    let Q = await startLevel(1);
    ok(Q.options.length === PRM.OPTIONS[0] && Math.abs(Q.opacity - PRM.OPACITY[0]) < 1e-9 && Math.abs(Q.flashMs - PRM.FLASH_MS[0]) < 1e-6 && !Q.one, '① 第 1 關：' + PRM.OPTIONS[0] + ' 個選項、濃度 ' + PRM.OPACITY[0] + '、亮 ' + PRM.FLASH_MS[0] + ' 毫秒（' + JSON.stringify({ n: Q.options.length, op: Q.opacity, ms: Q.flashMs }) + '）');
    ok((await rects()).n === 0, '① 字閃出來之前，答案按鈕還沒出現');
    let R0 = await rects();
    ok(R0.zone && R0.stage && R0.zone.t >= R0.stage.t - 1 && R0.zone.w >= 440 && Math.abs(R0.zone.w - R0.stage.w) <= 1, '① 上方有一塊白底（' + Math.round(R0.zone.w) + '×' + Math.round(R0.zone.h) + '），寬度維持畫面寬度（' + Math.round(R0.stage.w) + '）');
    ok(Math.abs(R0.zone.w - R0.zone.h * PRM.ZONE_RATIO) <= 1.5, '① 題目框是正方形（' + Math.round(R0.zone.w) + '×' + Math.round(R0.zone.h) + '）');
    ok(/#fff/i.test(await J('getComputedStyle(document.querySelector(".blinkchar-zone")).backgroundColor === "rgb(255, 255, 255)" ? "#fff" : getComputedStyle(document.querySelector(".blinkchar-zone")).backgroundColor')), '① 白底是白色');
    const f1 = await waitFlash();
    ok(f1 && f1.onAt >= 500 && f1.onAt <= 3300, '① 字在開局後 ' + (f1 && Math.round(f1.onAt)) + ' 毫秒閃出（0.6～3 秒內）');
    ok(f1 && f1.dur >= PRM.FLASH_MS[0] - 12 && f1.dur <= PRM.FLASH_MS[0] + 130 && Math.abs(f1.op - PRM.OPACITY[0]) < 1e-9, '① 第 1 關：亮了 ' + (f1 && Math.round(f1.dur)) + ' 毫秒（約 ' + PRM.FLASH_MS[0] + '）、濃度 ' + (f1 && f1.op));
    await sleep(120);
    let R1 = await rects();
    ok(R1.ch.l >= R1.zone.l - 1 && R1.ch.r <= R1.zone.r + 1 && R1.ch.t >= R1.zone.t - 1 && R1.ch.b <= R1.zone.b + 1, '① 字框整個在白底裡');
    ok(R1.n === PRM.OPTIONS[0], '① 字消失之後長出 ' + PRM.OPTIONS[0] + ' 個答案按鈕（' + R1.n + '）');
    ok(await J('getComputedStyle(document.querySelector(".blinkchar-ch")).color === "rgb(0, 0, 0)"'), '② 字是黑色');
    const geo = await J('(function(){ var bs = document.querySelectorAll(".blinkchar-opt"), b = bs[0].getBoundingClientRect(), fs = parseFloat(getComputedStyle(bs[0]).fontSize); return { w: b.width, h: b.height, fs: fs, same: [].every.call(bs, function (x) { var r = x.getBoundingClientRect(); return Math.abs(r.width - b.width) < 1 && Math.abs(r.height - b.height) < 1; }) }; })()');
    ok(Math.abs(geo.w - 472 / 6) <= 8 && geo.same && Math.abs(geo.fs - Math.floor(Math.min(geo.w, geo.h) * 0.8)) <= 1.5, '③ 答案按鈕寬度是畫面的 1/6（寬 ' + Math.round(geo.w) + '，472÷6＝79 扣掉空隙）、高 ' + Math.round(geo.h) + '、字寬 ' + geo.fs + ' ＝ 較小邊的 80%');
    ok(R1.btns.b <= R1.stage.b + 1 && R1.btns.t >= R1.zone.b, '③ 方陣在白底下面、放得進畫面');
    // ④ 點對 → 過關
    const btn = async (i) => J('(function(){ var r = document.querySelectorAll(".blinkchar-opt")[' + i + '].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()');
    let b = await btn(Q.answer); await click(b.x, b.y); await sleep(200);
    ok((await J('Reaction.current.debug.state().cleared')) >= 1 && /剛剛閃過的是「/.test(await J('document.querySelector(".blinkchar-msg").textContent')), '④ 點對：過關，白底上寫出剛剛閃過的字');
    await sleep(1500);
    // ══ 第 30 關 ══
    Q = await startLevel(30);
    ok(Q.options.length === PRM.OPTIONS[1] && Math.abs(Q.opacity - PRM.OPACITY[1]) < 1e-9 && Q.one && Math.abs(Q.size - PRM.SIZE[1]) < 1e-9, '② 第 30 關：' + PRM.OPTIONS[1] + ' 個選項、濃度 ' + PRM.OPACITY[1] + '、只亮 1 幀、字是畫面寬度的 ' + (PRM.SIZE[1] * 100).toFixed(1) + '%');
    const f30 = await waitFlash();
    ok(f30 && f30.dur <= 45 && Math.abs(f30.op - PRM.OPACITY[1]) < 1e-9, '② 第 30 關：只亮 ' + (f30 && f30.dur.toFixed(1)) + ' 毫秒（1 個畫面更新，約 16.7）、濃度 ' + (f30 && f30.op));
    await sleep(150);
    const R30 = await rects();
    ok(R30.n === PRM.OPTIONS[1] && Math.abs(R30.ch.w - Math.max(8, Math.floor(PRM.SIZE[1] * 472))) <= 2, '② 第 30 關：' + PRM.OPTIONS[1] + ' 個按鈕、字框邊長 ' + Math.round(R30.ch.w) + ' px（畫面寬 472 的 ' + (PRM.SIZE[1] * 100).toFixed(1) + '%）');
    ok(R30.btns.b <= R30.stage.b + 1 && R30.btns.t >= R30.zone.b, '③ ' + PRM.OPTIONS[1] + ' 格方陣放得進畫面（白底下面、不超出）');
    const g30 = await J('(function(){ var bs = document.querySelectorAll(".blinkchar-opt"), b = bs[0].getBoundingClientRect(), tops = {}; [].forEach.call(bs, function (x) { var t = Math.round(x.getBoundingClientRect().top); tops[t] = (tops[t] || 0) + 1; }); var rows = Object.keys(tops).length, perRow = Math.max.apply(null, Object.keys(tops).map(function (k) { return tops[k]; })); return { w: b.width, h: b.height, fs: parseFloat(getComputedStyle(bs[0]).fontSize), rows: rows, perRow: perRow }; })()');
    ok(Math.abs(g30.w - 472 / 6) <= 8 && g30.h <= g30.w + 1 && g30.h >= 24 && Math.abs(g30.fs - Math.floor(Math.min(g30.w, g30.h) * 0.8)) <= 1.5, '③ ' + PRM.OPTIONS[1] + ' 格：寬 ' + Math.round(g30.w) + '（仍是畫面的 1/6）、高 ' + Math.round(g30.h) + '（依排數縮矮）、字寬 80%');
    ok(g30.rows === Math.ceil(PRM.OPTIONS[1] / PRM.OPT_COLS) && g30.perRow <= PRM.OPT_COLS, '③ ' + PRM.OPTIONS[1] + ' 格排成 ' + g30.rows + ' 排、一排最多 ' + g30.perRow + ' 個');
    // 作答之後：說明文字在題目框下緣、不壓到揭曉的字
    const msgBox = () => J('(function(){ var m = document.querySelector(".blinkchar-msg").getBoundingClientRect(), c = document.querySelector(".blinkchar-ch").getBoundingClientRect(), z = document.querySelector(".blinkchar-zone").getBoundingClientRect(); return { mt: m.top, mb: m.bottom, ct: c.top, cb: c.bottom, zb: z.bottom, zt: z.top, cls: document.querySelector(".blinkchar-msg").className }; })()');
    // 點錯 → 失敗、字再亮出來
    b = await btn((Q.answer + 1) % 16); await click(b.x, b.y); await sleep(250);
    ok((await J('Reaction.current.debug.state().over')) && await J('Number(document.querySelector(".blinkchar-ch").style.opacity) === 1'), '④ 點錯：失敗，字用全黑亮出來給你看');
    { const m = await msgBox();
      ok(/blinkchar-msg--bottom/.test(m.cls) && m.mb <= m.zb + 1 && m.mt >= m.zb - 3 - PRM.MSG_H - 4, '④ 作答之後說明文字在題目框下緣（文字 ' + Math.round(m.mt) + '～' + Math.round(m.mb) + '／框底 ' + Math.round(m.zb) + '，字框 ' + Math.round(m.ct) + '～' + Math.round(m.cb) + '）');
      ok(m.cb <= m.mt + 1, '④ 說明文字沒有壓到揭曉的字（字底 ' + Math.round(m.cb) + '、文字頂 ' + Math.round(m.mt) + '）'); }
    ok(await J('document.querySelector(".blinkchar-opt--right") !== null && document.querySelector(".blinkchar-opt--wrong") !== null'), '④ 標出正確答案與選錯的');
    // 超時：不點
    await sleep(2800);
    await J('(Reaction.current.debug.restart(), 1)'); await sleep(600);
    Q = await startLevel(30); await waitFlash(); await sleep(Q.answerMs + 400);
    ok(await J('Reaction.current.debug.state().over'), '④ 超時（' + Q.answerMs + ' 毫秒沒點）：失敗');
    ok((await J('window.__errs.length')) === 0, '⑤ 沒有 JS 錯誤 ' + JSON.stringify(await J('window.__errs')));
  } finally { cdp.close(); }
  console.log(checks + ' checks');
  console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); try { cdp && cdp.close(); } catch (x) { } process.exit(1); });
