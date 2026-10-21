// 「字有沒有垂直置中」掃描（V1.36.0）：逐款打開遊戲，量每一個「方塊／按鈕裡的字」，字的墨水（看得見的筆畫）上下各留多少空間。
//   為什麼不能只看程式碼：CSS 置中的是「行框（字型的 ascent＋descent）」不是「筆畫」。Noto Sans TC 的 ascent 是 1.16、descent 只有 0.29（上重下輕），
//   所以行框置中之後，數字／漢字／emoji 的筆畫會比框的正中央偏下約 6～11％字高；字越大、框越緊，偏下越明顯（下緣貼到框邊、上緣留一大片）。
//   這支掃描用 canvas.measureText 量出每個字串實際的筆畫上下緣，再跟「畫著這段字的方塊」比，回報偏差（dy，單位像素，正＝偏下）。
//
// 用法（先把專案用本機伺服器開起來：python -m http.server 8743）：
//   node test/reaction/ink_scan.mjs                 掃全部遊戲（每款最多取樣 6 個畫面），印出偏差最大的方塊
//   node test/reaction/ink_scan.mjs gomoku inout    只掃指定的遊戲
//   TOL=0.03 node test/reaction/ink_scan.mjs        偏差容許值（占字高的比例，預設 0.03；字越大容許的像素越多）
//   node test/reaction/ink_scan.mjs --json out.json 把每一筆量測結果也存成檔案
//   結束碼：有任何偏差超過容許值就是 1（修正之後應該是 0）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
const TOL = Number(process.env.TOL || 0.03);
const MIN_FS = Number(process.env.MIN_FS || 18);          // 小於這個字高的字不管（小字偏 1～2 像素看不出來）

// 放進頁面裡執行的量測函式（回傳這個畫面上所有「方塊裡的單行字」的偏差）
const SCAN = `(function (MIN_FS) {
  var out = [], cv = document.createElement('canvas').getContext('2d');
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), n;
  function hasPaint(cs) {
    var bg = cs.backgroundColor, a = /rgba\\(.*,\\s*([\\d.]+)\\)$/.exec(bg);
    var visibleBg = bg !== 'transparent' && !(a && parseFloat(a[1]) === 0);
    var bw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    return visibleBg || bw > 0 || (cs.backgroundImage && cs.backgroundImage !== 'none');
  }
  while ((n = walker.nextNode())) {
    var t = n.nodeValue.replace(/\\s+/g, ' ').trim();
    if (!t) continue;
    var el = n.parentElement;
    if (!el || el.closest('script,style,svg,canvas,[hidden]')) continue;
    var cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
    if (cs.visibility === 'hidden' || cs.display === 'none' || fs < MIN_FS) continue;
    var op = 1, p = el; while (p && p !== document.body) { op *= parseFloat(getComputedStyle(p).opacity); p = p.parentElement; }
    if (op < 0.2) continue;
    var r = document.createRange(); r.selectNodeContents(n);
    var rects = r.getClientRects(); if (rects.length !== 1) continue;
    var rr = rects[0]; if (rr.width < 2 || rr.height < 2) continue;
    // 找「畫著這段字的方塊」：往上最多 4 層、第一個有背景或邊框、而且高度不到字高的 4 倍
    var box = null, q = el;
    for (var k = 0; k < 5 && q && q !== document.body; k++, q = q.parentElement) {
      var qr = q.getBoundingClientRect(), qs = getComputedStyle(q);
      if (qr.height > fs * 4) break;
      if (hasPaint(qs) && qr.height >= 6) { box = q; break; }
    }
    if (!box) continue;
    if (box.textContent.replace(/\\s+/g, '').length !== t.replace(/\\s+/g, '').length) continue;       // 方塊裡還有別的字（標題列、卡片…）：不是「一段字放在方塊中央」，不量
    var br = box.getBoundingClientRect();
    if (br.width < 8 || br.bottom < 0 || br.top > innerHeight) continue;
    cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + fs + 'px ' + cs.fontFamily;
    var m = cv.measureText(t);
    var base = rr.top + m.fontBoundingBoxAscent;                 // 基線的位置
    var inkTop = base - m.actualBoundingBoxAscent, inkBot = base + m.actualBoundingBoxDescent;
    var bs = getComputedStyle(box);
    var padTop = br.top + parseFloat(bs.borderTopWidth), padBot = br.bottom - parseFloat(bs.borderBottomWidth);   // 方塊的內側（不含邊框）
    var dy = (inkTop + inkBot) / 2 - (padTop + padBot) / 2;
    out.push({
      sel: box.tagName.toLowerCase() + (box.className && typeof box.className === 'string' ? '.' + box.className.trim().split(/\\s+/).join('.') : ''),
      txt: t.slice(0, 8), fs: Math.round(fs * 10) / 10, boxH: Math.round(br.height * 10) / 10,
      top: Math.round((inkTop - padTop) * 10) / 10, bot: Math.round((padBot - inkBot) * 10) / 10, dy: Math.round(dy * 10) / 10
    });
  }
  return JSON.stringify(out);
})(${MIN_FS})`;

(async () => {
  const cdp = await connect();
  const rows = [];
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: 'http://localhost:8743/reaction.html?game=speed&t=' + Date.now() });
    for (let i = 0; i < 100; i++) { if (await cdp.evalJs('document.readyState==="complete" && !!window.Reaction').catch(() => false)) break; await sleep(100); }
    // 遊戲清單：等所有遊戲檔都載入完（登記的遊戲數量不再增加）再讀
    let ids = [], lastN = -1;
    for (let i = 0; i < 100; i++) {
      ids = await cdp.evalJs('JSON.stringify(Reaction.list().map(g => g.id))').then(JSON.parse).catch(() => []);
      if (ids.length && ids.length === lastN) break;
      lastN = ids.length; await sleep(600);
    }
    if (args.length) ids = args;
    console.log('掃描 ' + ids.length + ' 款遊戲，容許偏差 ' + (TOL * 100) + '% 字高，最小字高 ' + MIN_FS + ' px');
    for (const id of ids) {
      try { await openGame(cdp, id, { root: ROOT }); } catch (e) { console.log('SKIP ' + id + '：' + e.message); continue; }
      if (process.env.FONTFIX) {            // 實驗用：把另一份字型 CSS 注入頁面（排在原本的字型之後，所以會蓋掉它），等字型載入完再量
        await cdp.evalJs('(function(){ var st = document.createElement("style"); st.textContent = ' + JSON.stringify(fs.readFileSync(process.env.FONTFIX, 'utf8')) + '; document.head.appendChild(st); return document.fonts.ready.then(function(){ return 1; }); })()');
        await sleep(1200);
      }
      for (let s = 0; s < 6; s++) {
        const part = JSON.parse(await cdp.evalJs(SCAN).catch(() => '[]'));
        part.forEach(r => rows.push(Object.assign({ id, shot: s }, r)));
        await cdp.evalJs('(function(){ try { var d = Reaction.current && Reaction.current.debug; if (d && d.solve) d.solve(); } catch (e) {} })()').catch(() => { });
        await sleep(900);
      }
    }
  } finally { cdp.close(); }
  // 同一款遊戲、同一個 class、同一個字、同樣的偏差只算一次
  const seen = new Set(), uniq = rows.filter(r => { const k = r.id + '|' + r.sel + '|' + r.txt + '|' + r.dy; if (seen.has(k)) return false; seen.add(k); return true; });
  const bad = uniq.filter(r => Math.abs(r.dy) > Math.max(1.5, r.fs * TOL));
  bad.sort((a, b) => Math.abs(b.dy) / b.fs - Math.abs(a.dy) / a.fs);
  console.log('量到 ' + uniq.length + ' 個方塊裡的字，偏差超過容許值的有 ' + bad.length + ' 個');
  const byGame = {};
  bad.forEach(r => { (byGame[r.id] = byGame[r.id] || []).push(r); });
  Object.keys(byGame).sort().forEach(id => {
    console.log('\n' + id + '（' + byGame[id].length + '）');
    byGame[id].slice(0, 6).forEach(r => console.log('   dy=' + String(r.dy).padStart(5) + ' 字高 ' + String(r.fs).padStart(5) + ' 框高 ' + String(r.boxH).padStart(5) + ' 上留 ' + String(r.top).padStart(5) + ' 下留 ' + String(r.bot).padStart(5) + '  「' + r.txt + '」 ' + r.sel.slice(0, 60)));
  });
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(uniq, null, 1));
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
