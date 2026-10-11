// 用「看不見視窗」的 Chrome 檢查「玩法說明」彈窗（V1.23.0：一句一行、重點粗體黑字）——全部遊戲：
//   · 卡片完整放得進舞台（不超出上下緣、不被標題列蓋住），兩種情況都量：只有一顆按鈕（進場）、兩顆按鈕（右上角「?」重看，多一顆「世界排行榜」）
//   · 一句一個 <p>、重點是 <strong>，重點的樣式是粗體（--fw-bold）＋黑色（--c-black），一般文字是一般粗細＋次要文字色
//   · 沒有水平溢出（文字被切到）
// 另外把幾款代表性的畫面存成截圖。
// 前置：先把專案用本機伺服器開起來（在專案根目錄執行  python -m http.server 8743）。
// 用法：node test/reaction/rules_check.mjs [--out 截圖資料夾] [--shots id1,id2,…]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connect, sleep } from './cdp.mjs';

const PORT = 8743;
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(opt('out', path.join(os.tmpdir(), 'fm-rules-check')));
const SHOTS = opt('shots', 'speed,drop,rainbow,impossible,paint,mixcolor,timeafter,handsmeet,seven,shapes').split(',');
fs.mkdirSync(OUT, { recursive: true });

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };

(async () => {
  const cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: 'http://localhost:' + PORT + '/reaction.html?game=speed&t=' + Date.now() });
    for (let i = 0; i < 200; i++) { if (await cdp.evalJs('!!(window.Reaction && Reaction.current && window.Dlg && document.querySelector(".dlg--rule"))').catch(() => false)) break; await sleep(100); }
    const shot = async (name) => {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, 'rule_' + name + '.png'), Buffer.from(r.data, 'base64'));
    };
    // 在頁面裡一次量完：每款遊戲各開兩次玩法說明（一顆按鈕／兩顆按鈕），量卡片位置與文字樣式
    const rows = await cdp.evalJs(`(async function () {
      var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      var st = document.getElementById('stage'), srect = st.getBoundingClientRect(), sc = srect.width / 500;
      var bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || 78;
      // 先關掉進場時開的那一個；並且關掉彈窗的「彈出」動畫（動畫期間卡片縮成 97%，量出來的高度會偏小）
      var first = document.querySelector('.dlg--rule'); if (first) first.parentNode.removeChild(first);
      var noAnim = document.createElement('style'); noAnim.textContent = '.dlg__card{animation:none!important}'; document.head.appendChild(noAnim);
      var out = [];
      var inkSoft = getComputedStyle(document.documentElement).getPropertyValue('--c-ink-soft').trim();
      var list = Reaction.list();
      for (var k = 0; k < list.length; k++) {
        var g = list[k];
        for (var mode = 0; mode < 2; mode++) {
          var o = mode ? { okText: '知道了', softSound: true, boardButton: true } : {};
          var ctl = Dlg.rule(g, o);
          if (!document.body.contains(ctl.card)) { ctl.close(); ctl = Dlg.rule(g, o); }     // 進場時開的那個被移出畫面了、但程式還當它開著 → 先關掉再開
          await sleep(30);
          var card = ctl.card, r = card.getBoundingClientRect();
          var txt = card.querySelector('.dlg__rich');
          var lines = txt ? [].slice.call(txt.querySelectorAll('.dlg__line')) : [];
          var ems = txt ? [].slice.call(txt.querySelectorAll('.dlg__em')) : [];
          var emStyle = ems[0] ? getComputedStyle(ems[0]) : null, lineStyle = lines[0] ? getComputedStyle(lines[0]) : null;
          var tb = txt ? txt.getBoundingClientRect() : null;
          out.push({
            id: g.id, mode: mode, name: g.name,
            top: (r.top - srect.top) / sc, bottom: (r.bottom - srect.top) / sc, h: r.height / sc, left: (r.left - srect.left) / sc, right: (r.right - srect.left) / sc,
            lines: lines.length, ems: ems.length, textH: tb ? tb.height / sc : 0, fs: txt ? parseFloat(getComputedStyle(lines[0] || txt).fontSize) : 0,
            tag: txt ? txt.tagName : null, linesAreP: lines.every(function (l) { return l.tagName === 'P'; }), emsAreStrong: ems.every(function (e) { return e.tagName === 'STRONG'; }),
            emWeight: emStyle ? emStyle.fontWeight : null, emColor: emStyle ? emStyle.color : null,
            lineWeight: lineStyle ? lineStyle.fontWeight : null, lineColor: lineStyle ? lineStyle.color : null,
            overflowX: txt ? txt.scrollWidth > txt.clientWidth + 1 : false,
            btns: card.querySelectorAll('button').length,
            plainText: txt ? txt.textContent : ''
          });
          ctl.close();
        }
      }
      return { rows: out, bar: bar, expectBlack: getComputedStyle(document.documentElement).getPropertyValue('--c-black').trim(), expectBold: getComputedStyle(document.documentElement).getPropertyValue('--fw-bold').trim(), expectRegular: getComputedStyle(document.documentElement).getPropertyValue('--fw-regular').trim(), inkSoft: inkSoft };
    })()`);
    const { rows: R, bar } = rows;
    const toRgb = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex); return m ? 'rgb(' + [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16)).join(', ') + ')' : hex; };
    const black = toRgb(rows.expectBlack), soft = toRgb(rows.inkSoft);
    console.log('量了 ' + R.length + ' 個玩法說明（' + R.length / 2 + ' 款 × 2 種）；黑色＝' + black + '、一般文字色＝' + soft);
    const AVAIL = 850 - bar - 2 * 24;       // 標題列下面、扣掉彈窗外框的上下留白
    let worst = { h: 0 };
    R.forEach(r => {
      const tag = r.id + '「' + r.name + '」' + (r.mode ? '（兩顆按鈕）' : '');
      ok(r.top >= bar - 0.5, tag + ' 卡片上緣不被標題列蓋住（上緣 ' + r.top.toFixed(0) + '，標題列 ' + bar + '）');
      ok(r.bottom <= 850 + 0.5, tag + ' 卡片下緣在舞台裡（下緣 ' + r.bottom.toFixed(0) + '）');
      ok(r.h <= AVAIL + 0.5, tag + ' 卡片高度 ' + r.h.toFixed(0) + ' ≤ 可用高度 ' + AVAIL);
      ok(r.left >= -0.5 && r.right <= 500.5, tag + ' 卡片左右都在舞台裡');
      ok(r.lines >= 2 && r.ems >= 1, tag + ' 有 ' + r.lines + ' 行、' + r.ems + ' 個重點');
      ok(r.linesAreP && r.emsAreStrong, tag + ' 一句一個 <p>、重點是 <strong>');
      ok(r.emWeight === '700' && r.emColor === black, tag + ' 重點：粗體 700＋黑色（' + r.emWeight + ' ' + r.emColor + '）');
      ok(r.lineWeight === '500' && r.lineColor === soft, tag + ' 一般文字：一般粗細 500＋次要文字色（' + r.lineWeight + ' ' + r.lineColor + '）');
      ok(!r.overflowX, tag + ' 沒有水平溢出');
      ok(!/\*\*/.test(r.plainText), tag + ' 畫面上沒有殘留的 **');
      ok(r.btns === (r.mode ? 2 : 1), tag + ' 按鈕數 ' + r.btns);
      if (r.h > worst.h) worst = r;
    });
    const fsMin = Math.min.apply(null, R.map(r => r.fs));
    const shrunk = R.filter(r => r.fs < 26).map(r => r.id + (r.mode ? '*' : '') + ':' + r.fs + 'px');
    console.log('內文字級：一般 26px；最小用到 ' + fsMin + 'px；被縮小的（* 是兩顆按鈕）：' + (shrunk.join('  ') || '無'));
    ok(fsMin >= 22, '字級不會縮到比 22px（--fs-xs）還小：' + fsMin);
    console.log('最高的卡片：' + worst.id + '（' + worst.name + '）' + (worst.mode ? '兩顆按鈕' : '一顆按鈕') + ' ' + worst.h.toFixed(0) + ' / 可用 ' + AVAIL);
    const tall = R.filter(r => r.h > AVAIL - 40).map(r => r.id + (r.mode ? '*' : '') + ':' + r.h.toFixed(0));
    if (tall.length) console.log('接近上限（可用高度 − 40 以內）的：' + tall.join('  '));

    // ─── 截圖：代表性的幾款（一顆按鈕）＋最高的那一個（兩顆按鈕）───
    for (const id of SHOTS) {
      await cdp.evalJs('(function(){ var d = document.querySelector(".dlg--rule"); if (d) d.parentNode.removeChild(d); var g = Reaction.list().filter(function (x) { return x.id === "' + id + '"; })[0]; var c = Dlg.rule(g, {}); if (!document.body.contains(c.card)) { c.close(); Dlg.rule(g, {}); } })()');
      await sleep(350);
      await shot(id);
    }
    await cdp.evalJs('(function(){ var d = document.querySelector(".dlg--rule"); if (d) d.parentNode.removeChild(d); var g = Reaction.list().filter(function (x) { return x.id === "' + worst.id + '"; })[0]; var o = { okText: "知道了", softSound: true, boardButton: true }; var c = Dlg.rule(g, o); if (!document.body.contains(c.card)) { c.close(); Dlg.rule(g, o); } })()');
    await sleep(350);
    await shot('worst_two_buttons_' + worst.id);
  } finally { cdp.close(); }
  console.log(bad ? '\nFAILED ' + bad + ' / ' + total : '\nALL PASS (' + total + ' checks)　截圖在 ' + OUT);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
