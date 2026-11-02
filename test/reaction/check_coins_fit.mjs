// 零錢分類：硬幣有沒有都在桌面裡面（V1.43.1：以前上面的字會換行、桌面變矮，下面的硬幣就跑到桌面外面點不到）。
// 做法：從指定關卡開局，點幾枚硬幣讓「已選／還差」的字變長，再逐枚量硬幣是否完整在桌面（.coins-table）裡、桌面高度有沒有變。
// 前置：本機伺服器已開（python -m http.server 8743）。
// 用法（在專案根目錄）：  node test/reaction/check_coins_fit.mjs [關卡 …]    預設 1 15 30 45 60
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const levels = process.argv.slice(2).map(Number).filter(Boolean);
if (!levels.length) levels.push(1, 15, 30, 45, 60);
const cdp = await connect();
let bad = 0;
const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v == null ? null : JSON.parse(v); };
try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
  for (const lv of levels) {
    await cdp.send('Page.navigate', { url: 'http://localhost:8743/version.json' });
    await sleep(600);
    await cdp.evalJs('localStorage.setItem("fm.reaction.lvbest.coins", ' + (lv + 4) + ')');
    await openGame(cdp, 'coins', { root: ROOT });
    await sleep(1500);
    const info = await J('Reaction.current.debug.state()');
    const fit = () => J('(function(){ var t = document.querySelector(".coins-table").getBoundingClientRect(), out = [], n = 0; document.querySelectorAll(".coins-coin").forEach(function (c) { n++; var r = c.getBoundingClientRect(); if (r.left < t.left - 1 || r.right > t.right + 1 || r.top < t.top - 1 || r.bottom > t.bottom + 1) out.push(c.textContent); }); return { n: n, out: out, th: Math.round(t.height), sumH: Math.round(document.querySelector(".coins-sum").getBoundingClientRect().height) }; })()');
    const a = await fit();
    // 點 6 枚硬幣，讓字變長
    for (let i = 0; i < 6; i++) await cdp.evalJs('(function(){ var c = document.querySelectorAll(".coins-coin")[' + i + ']; c.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); })()');
    await sleep(300);
    const b = await fit();
    const ok = a.out.length === 0 && b.out.length === 0 && a.th === b.th && a.sumH === b.sumH;
    if (!ok) bad++;
    console.log((ok ? 'OK   ' : 'FAIL ') + '第 ' + lv + ' 關：' + a.n + ' 枚；桌面高 ' + a.th + '→' + b.th + '；字高 ' + a.sumH + '→' + b.sumH + '；跑出桌面 ' + JSON.stringify(a.out) + ' ' + JSON.stringify(b.out));
  }
} finally { cdp.close(); }
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
