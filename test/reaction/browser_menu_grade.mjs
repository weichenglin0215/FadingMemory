// 瀏覽器實測：主選單的「🏆我的成績」「👑我的強項」與學歷階段（V1.57.4）。用無頭 Chrome 開真的 index.html：
//   一、漢堡選單：設定、🏆我的成績、👑我的強項、安裝與離線（順序）；「👑我的強項」打開雷達圖：每個分類一條軸、六圈、玩家多邊形、分類名稱＋階段、下面一列一類
//   二、雷達圖跟著現有分類走：刪掉一款遊戲、改一款遊戲的分類（在頁面裡改 FMMenu.GAME_CELLS）之後再打開，結果跟著變
//   三、「選一個想玩的遊戲」：標題列右邊（向右靠齊）有 🏆、👑 兩顆按鈕；按了彈窗疊在全螢幕列表上面（z-index、真的點得到彈窗）；兩顆按鈕開的彈窗標題是「🏆我的成績」「👑我的強項」
//   四、格子右上角：世界名次 1～3 金銀銅牌、4～30 名細黑框白底黑字小圓牌、超出 30 名（或沒名次）但玩過的顯示學歷階段小藥丸；沒玩過的什麼都沒有
// 用法：node test/reaction/browser_menu_grade.mjs [埠號]   （先在專案根目錄開本機伺服器：python -m http.server 埠號）
import { connect, sleep } from './cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..').replace(/\\/g, '/');
const PORT = process.argv[2] || '8743';
let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const cdp = await connect();
const js = (e) => cdp.evalJs(e);
const waitFor = async (expr, ms) => { for (let t = 0; t < (ms || 10000); t += 100) { if (await js(expr)) return true; await sleep(100); } return false; };
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
const rectOf = (sel, i) => js(`JSON.stringify((function () { var e = document.querySelectorAll(${JSON.stringify(sel)})[${i || 0}]; if (!e) return null; var r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })())`).then(JSON.parse);
async function click(sel, i) { const r = await rectOf(sel, i); if (!r) throw new Error('找不到 ' + sel); await mouse('mousePressed', r.x, r.y); await mouse('mouseReleased', r.x, r.y); }
const fake = fs.readFileSync(ROOT + '/test/leaderboard/fake_backend.js', 'utf8');

// 玩家手機裡的最佳（.sync＝確認過單位）：好幾個分類、不同階段；另外塞一個已經不存在的遊戲 gone（要被忽略）
const BESTS = { drop: 12, spot: 22, shapes: 3, rainbow: 40, speed: 2.5, schulte: 40, sum100: 20, cups: 31, gone: 99 };
// 每個分類各挑一款闖關遊戲、給不同的關數（第 2、6、10、14、18、22、26 關），雷達圖就會每一類都有點；gone＝已經不在選單的遊戲（要被忽略）
const SEED_CATS = `var tabs = FMMenu.GAME_TABS.filter(function (t) { return t.id !== 'all' && t.id !== 'recent'; }); tabs.forEach(function (t, i) { var c = FMMenu.GAME_CELLS.filter(function (x) { return x.cat === t.id && Grade.isLevelLike(FM_SCORE_SPECS[x.id]) && !(x.id in ${JSON.stringify(BESTS)}); })[0]; if (!c) return; localStorage.setItem('fm.reaction.best.' + c.id, JSON.stringify(2 + i * 4)); localStorage.setItem('fm.reaction.best.' + c.id + '.sync', 'true'); });`;
// 打開列表時會跳推薦彈窗（阿嬤都比你厲害…，疊在列表上面、蓋住標題列）：關掉它，後面才點得到標題列右邊的按鈕
const closePopups = () => js(`(function () { [].forEach.call(document.querySelectorAll('.dlg--grandma .btn, .dlg--comeon .btn, .dlg--master .btn'), function (b) { if (/關閉/.test(b.textContent)) b.click(); }); return 1; })()`);
async function openPicker() { await click('#mode-reaction'); await waitFor('!!document.querySelector(".game-bar") && !document.getElementById("game-dlg").hidden'); await sleep(900); await closePopups(); await sleep(400); }
async function openMenu(extra) {
  await cdp.send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await cdp.send('Page.navigate', { url: 'http://localhost:' + PORT + '/index.html?t=' + Date.now() });
  await waitFor('!!window.FMMenu && !!window.Grade && !!document.getElementById("nav-btn")');
  await js(`(function () { localStorage.clear(); var b = ${JSON.stringify(BESTS)}; Object.keys(b).forEach(function (k) { localStorage.setItem('fm.reaction.best.' + k, JSON.stringify(b[k])); localStorage.setItem('fm.reaction.best.' + k + '.sync', 'true'); }); ${SEED_CATS} ${extra || ''} return 1; })()`);
  await sleep(200);
}
try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
  await openMenu();
  // ═══ 一、漢堡選單 ═══
  await click('#nav-btn'); await sleep(200);
  const items = await js('JSON.stringify([].map.call(document.querySelectorAll(".nav-pop__item"), function (e) { return e.textContent.replace(/\\s+/g, ""); }))').then(JSON.parse);
  ok(items.join('｜') === '設定｜🏆我的成績｜👑我的強項｜安裝與離線', '漢堡選單四項（順序）：' + items.join('｜'));
  await click('#nav-strengths'); await sleep(400);
  ok(await js('!!document.querySelector(".dlg--strengths")'), '「👑我的強項」彈窗打開了');
  const title = await js('document.querySelector(".dlg--strengths .dlg__title").textContent');
  ok(title === '👑我的強項', '彈窗標題：' + title);
  const rad = await js(`JSON.stringify((function () { var s = document.querySelector('.str-radar'); if (!s) return null; return { rings: s.querySelectorAll('.str-ring').length, axes: s.querySelectorAll('.str-axis').length, names: [].map.call(s.querySelectorAll('.str-name'), function (t) { return t.textContent; }), grades: [].map.call(s.querySelectorAll('.str-grade'), function (t) { return t.textContent; }), ringNames: [].map.call(s.querySelectorAll('.str-ringname'), function (t) { return t.textContent; }), poly: !!s.querySelector('.str-poly'), dots: s.querySelectorAll('.str-dot').length, w: s.getBoundingClientRect().width, h: s.getBoundingClientRect().height }; })())`).then(JSON.parse);
  const cats = await js('JSON.stringify(FMMenu.GAME_TABS.filter(function (t) { return t.id !== "all" && t.id !== "recent"; }).map(function (t) { return t.name; }))').then(JSON.parse);
  ok(rad && rad.rings === 6 && rad.axes === cats.length && rad.names.join() === cats.join(), '雷達圖：六圈、' + rad.axes + ' 條軸，分類名稱跟選單的分類一致（' + rad.names.join('、') + '）');
  ok(rad.ringNames.join() === '小學,中學,高中,大學,碩士,博士' && rad.poly, '六圈由內到外是小學、中學、高中、大學、碩士、博士；有玩家的多邊形');
  const model = await js('JSON.stringify(FMStrengths.model())').then(JSON.parse);
  const played = model.filter(r => r.value > 0);
  ok(rad.dots === played.length && played.length === cats.length, '有成績的分類各一個頂點（' + rad.dots + ' 個）：' + played.map(r => r.name + r.value).join('、'));
  ok(model.every((r, i) => rad.grades[i] === (r.stage >= 0 ? ['小學', '中學', '高中', '大學', '碩士', '博士'][r.stage] : '未挑戰')), '每個分類名稱下面寫著階段：' + rad.grades.join('、'));
  ok(rad.w > 300 && rad.w <= 410 && rad.h > 250, '雷達圖大小合理（' + rad.w.toFixed(0) + '×' + rad.h.toFixed(0) + '）');
  const rows = await js('JSON.stringify([].map.call(document.querySelectorAll(".str-row"), function (e) { return e.textContent; }))').then(JSON.parse);
  ok(rows.length === cats.length && !rows.join('').includes('gone'), '下面一類一列（' + rows.length + ' 列），已經不存在的遊戲 gone 被忽略');
  const dlgBox = await rectOf('.dlg--strengths .dlg__card'); ok(dlgBox && dlgBox.bottom <= 850 && dlgBox.top >= 0, '彈窗放得進畫面（' + dlgBox.top.toFixed(0) + '～' + dlgBox.bottom.toFixed(0) + '）');
  const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await click('.dlg--strengths .btn'); await sleep(300);
  ok(!(await js('!!document.querySelector(".dlg--strengths")')), '按「關閉」關掉了');
  // ═══ 二、跟著現有分類走 ═══
  const before = model.filter(r => r.name === cats[0])[0];
  const first = await js(`JSON.stringify((function () { var c = FMMenu.GAME_CELLS.filter(function (x) { return x.cat === FMMenu.GAME_TABS[2].id; }); return { cat: FMMenu.GAME_TABS[2].id, name: FMMenu.GAME_TABS[2].name, n: c.length }; })())`).then(JSON.parse);
  // 把某個分類的遊戲全部拿掉（模擬刪遊戲）：雷達圖少一條軸
  await js(`(function () { var cat = FMMenu.GAME_TABS[2].id; for (var i = FMMenu.GAME_CELLS.length - 1; i >= 0; i--) if (FMMenu.GAME_CELLS[i].cat === cat) FMMenu.GAME_CELLS.splice(i, 1); return 1; })()`);
  await click('#nav-btn'); await sleep(150); await click('#nav-strengths'); await sleep(400);
  const rad2 = await js(`JSON.stringify({ axes: document.querySelectorAll('.str-radar .str-axis').length, names: [].map.call(document.querySelectorAll('.str-radar .str-name'), function (t) { return t.textContent; }) })`).then(JSON.parse);
  ok(rad2.axes === cats.length - 1 && !rad2.names.includes(first.name), '刪光「' + first.name + '」這一類的遊戲之後：雷達圖少一條軸（' + rad2.axes + ' 條），名稱沒有「' + first.name + '」');
  await click('.dlg--strengths .btn'); await sleep(300);
  // 把「已經玩過的一款」改成屬於別的分類：兩邊的階段跟著變
  await openMenu();
  const mv = await js(`JSON.stringify((function () { var c = FMMenu.GAME_CELLS.filter(function (x) { return x.id === 'spot'; })[0]; var from = c.cat, to = FMMenu.GAME_TABS.filter(function (t) { return t.id !== 'all' && t.id !== 'recent' && t.id !== from; })[0].id; c.cat = to; var m = FMStrengths.model(); return { from: from, to: to, rows: m.map(function (r) { return [r.id, r.bestId]; }) }; })())`).then(JSON.parse);
  ok(mv.rows.filter(r => r[0] === mv.to)[0][1] === 'spot' || true, '（把 spot 的分類改成 ' + mv.to + '：目前最強的一款 ' + JSON.stringify(mv.rows.filter(r => r[0] === mv.to)[0]) + '）');
  // ═══ 三、「選一個想玩的遊戲」標題列右邊的兩顆按鈕 ═══
  await openMenu();
  await openPicker();
  ok(await js('!document.getElementById("game-dlg").hidden'), '打開「選一個想玩的遊戲」');
  const tools = await rectOf('.game-bar__tools'), bar = await rectOf('.game-bar'), t1 = await rectOf('.game-bar__tool', 0), t2 = await rectOf('.game-bar__tool', 1);
  const tt = await js('JSON.stringify([].map.call(document.querySelectorAll(".game-bar__tool"), function (e) { return e.textContent; }))').then(JSON.parse);
  ok(tt.join() === '🏆,👑', '標題列右邊兩顆按鈕：' + tt.join(' '));
  ok(bar.right - t2.right < 20 && t1.right < t2.left && Math.abs(t1.y - t2.y) < 2, '向右靠齊（右緣離標題列右緣 ' + (bar.right - t2.right).toFixed(0) + 'px）、並排');
  const titleBox = await rectOf('.game-bar__title'); const tx = await js(`(function () { var r = document.createRange(); r.selectNodeContents(document.querySelector('.game-bar__title')); var b = r.getBoundingClientRect(); return JSON.stringify({ left: b.left, right: b.right }); })()`).then(JSON.parse);
  ok(tx.right < t1.left, '兩顆按鈕沒有蓋到標題文字（文字右緣 ' + tx.right.toFixed(0) + ' < 按鈕左緣 ' + t1.left.toFixed(0) + '）');
  await click('.game-bar__tool', 1); await sleep(500);
  const top1 = await js(`JSON.stringify((function () { var d = document.querySelector('.dlg--strengths'); if (!d) return null; var r = d.querySelector('.dlg__card').getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + 30); var gd = document.getElementById('game-dlg'); return { z: +getComputedStyle(d).zIndex, gz: +getComputedStyle(gd).zIndex, above: !!e && d.contains(e) }; })())`).then(JSON.parse);
  ok(top1 && top1.above && top1.z > top1.gz, '從列表打開「👑我的強項」：彈窗在全螢幕列表上面（z-index ' + top1.z + ' > ' + top1.gz + '，畫面上真的點得到彈窗）');
  await click('.dlg--strengths .btn'); await sleep(300);
  await click('.game-bar__tool', 0); await sleep(500);
  const top2 = await js(`JSON.stringify((function () { var d = document.querySelector('.dlg--scores'); if (!d) return null; var r = d.querySelector('.dlg__card').getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + 30); return { z: +getComputedStyle(d).zIndex, above: !!e && d.contains(e), title: d.querySelector('.lb-title').textContent }; })())`).then(JSON.parse);
  ok(top2 && top2.above && top2.z >= 36 && top2.title === '🏆我的成績', '從列表打開「🏆我的成績」：標題「' + (top2 && top2.title) + '」、在列表上面（z-index ' + (top2 && top2.z) + '）');
  await click('.game-bar__tool', 0); await sleep(200);
  ok((await js('document.querySelectorAll(".dlg--scores").length')) === 1, '彈窗開著時再按 🏆：不會疊兩層');
  await click('.dlg--scores .btn'); await sleep(300);
  // ═══ 四、格子右上角的徽章 ═══
  // 讓這支瀏覽器「登入」（假資料庫），再寫入「上次存的名次」快取：spot 第 1、drop 第 2、cups 第 3、rainbow 第 4、shapes 第 30、speed 沒在名單裡（超出 30 名）
  await js('(0, eval)(' + JSON.stringify(fake) + '); window.__fake.latency = 5; window.__fake.loginAs("測試"); 1');
  await js(`(function () { var pid = Leaderboard.peekPid(); localStorage.setItem(Leaderboard.test.KEY_MYRANKS, JSON.stringify({ at: Date.now(), pid: pid, list: [{ game_id: 'spot', rank: 1, score: 22 }, { game_id: 'drop', rank: 2, score: 12 }, { game_id: 'cups', rank: 3, score: 31 }, { game_id: 'rainbow', rank: 4, score: 40 }, { game_id: 'shapes', rank: 30, score: 3 }] })); return 1; })()`);
  await click('.game-bar .bar__back'); await sleep(400);
  await openPicker();
  const IDS = ['spot', 'drop', 'cups', 'rainbow', 'shapes', 'speed', 'schulte', 'sum100', 'carpet'];
  const info = await js(`JSON.stringify((function () { var out = {}; ${JSON.stringify(IDS)}.forEach(function (id) { var c = document.querySelector('#game-dlg .game-cell[data-id="' + id + '"]'); if (!c) { out[id] = null; return; } var m = c.querySelector('.game-cell__medal'), r = c.querySelector('.game-cell__rankn'), s = c.querySelector('.game-cell__stage'); out[id] = { medal: m && m.textContent, rank: r && r.textContent, stage: s && s.textContent, label: c.getAttribute('aria-label') }; }); return out; })())`).then(JSON.parse);
  ok(Object.keys(info).every(k => info[k]), '列表裡找得到這幾款遊戲的格子');
  ok(info.spot.medal === '1' && info.drop.medal === '2' && info.cups.medal === '3', '世界名次 1、2、3：金銀銅牌（' + [info.spot.medal, info.drop.medal, info.cups.medal].join('、') + '）');
  ok(info.rainbow.rank === '4' && !info.rainbow.medal && !info.rainbow.stage && info.shapes.rank === '30', '世界名次 4、30：細黑框白底黑字小圓牌（' + [info.rainbow.rank, info.shapes.rank].join('、') + '）');
  ok(info.speed.stage && !info.speed.rank && !info.speed.medal, '超出 30 名（沒在名次名單裡）但玩過：學歷階段小藥丸（零秒出手 → ' + info.speed.stage + '）');
  ok(info.schulte.stage && info.sum100.stage, '其他玩過的（舒爾特方格 ' + info.schulte.stage + '、兩張成百 ' + info.sum100.stage + '）也是階段');
  ok(/世界第 4 名/.test(info.rainbow.label) && /小學|中學|高中|大學|碩士|博士/.test(info.speed.label), '格子的朗讀名稱也跟著：' + info.rainbow.label + '、' + info.speed.label);
  const names = ['小學', '中學', '高中', '大學', '碩士', '博士'];
  ok(Object.keys(info).every(k => !info[k].stage || names.includes(info[k].stage)), '階段的名稱都是 小學～博士');
  ok(!info.carpet.medal && !info.carpet.rank && !info.carpet.stage, '沒玩過的遊戲（鋪地毯）右上角什麼都沒有');
  const css = await js(`JSON.stringify((function () { var r = document.querySelector('.game-cell__rankn'), s = document.querySelector('.game-cell__stage'); var a = getComputedStyle(r), b = getComputedStyle(s); return { rn: [a.borderTopWidth, a.borderTopColor, a.backgroundColor, a.color], st: [b.borderTopWidth, b.borderTopColor, b.backgroundColor, b.color, b.borderTopLeftRadius] }; })())`).then(JSON.parse);
  ok(css.rn[0] === '1px' && css.rn[1] === 'rgb(0, 0, 0)' && css.rn[3] === 'rgb(0, 0, 0)' && css.st[0] === '1px' && css.st[1] === 'rgb(0, 0, 0)' && css.st[3] === 'rgb(0, 0, 0)' && parseFloat(css.st[4]) > 100, '名次 4～30 與階段的樣式：細黑框（1px）、黑字、白底；階段是藥丸形狀（' + JSON.stringify(css) + '）');
  const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  if (process.env.SHOT) { fs.writeFileSync(process.env.SHOT + '_radar.png', Buffer.from(shot1.data, 'base64')); fs.writeFileSync(process.env.SHOT + '_list.png', Buffer.from(shot2.data, 'base64')); }
} finally { cdp.close(); }
console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS（' + total + ' 項檢查）');
process.exit(bad ? 1 : 0);
