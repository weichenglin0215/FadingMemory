// kit.glyphAnchor／kit.drawGlyph（V1.57.2.0）：把字「筆畫的外框中心」對準指定的點。
//   玩家意見：門縫偷看、對準才看到的字，在 iPhone 的 Chrome 上偏低（字的下緣貼著方框下緣）——原因是 canvas 的 textBaseline='middle' 是字型 em 方塊的中央，
//   不是筆畫的中央，每種字型上下留白不同。這裡用假的 context（measureText 回傳測試給定的筆畫邊界）驗證換算：不管字型留白多少，畫出來的筆畫外框中心都在指定的點。
const { game } = require('./load.js');
void game;
let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);
const kit = Reaction.kit;

// 假 context：筆畫在「基線」上方 asc、下方 desc、左邊 l、右邊 r（actualBoundingBox 的定義：離 fillText 座標的距離，Left 往左為正）
function fake(m, font) { const calls = []; return { font: font || '900 100px serif', textAlign: '', textBaseline: '', measureText: () => m, fillText: (...a) => calls.push(a), calls }; }
// 用算出的 anchor 畫，再還原筆畫外框：左 = x − l，右 = x + r，上 = y − asc，下 = y + desc
const inkBox = (p, m) => ({ l: p.x - m.actualBoundingBoxLeft, r: p.x + m.actualBoundingBoxRight, t: p.y - m.actualBoundingBoxAscent, b: p.y + m.actualBoundingBoxDescent });

// ── 不同字型的留白：筆畫在基線上下的比例都不一樣，但外框中心一律會落在指定的點 ──
for (const [name, m] of [
  ['留白偏上（字偏低的那種字型）', { actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 18, actualBoundingBoxLeft: 3, actualBoundingBoxRight: 88, width: 96 }],
  ['留白偏下', { actualBoundingBoxAscent: 88, actualBoundingBoxDescent: 2, actualBoundingBoxLeft: 6, actualBoundingBoxRight: 90, width: 96 }],
  ['筆畫剛好在基線兩側對稱', { actualBoundingBoxAscent: 45, actualBoundingBoxDescent: 45, actualBoundingBoxLeft: 48, actualBoundingBoxRight: 48, width: 96 }],
  ['很扁的字（一）', { actualBoundingBoxAscent: 52, actualBoundingBoxDescent: -40, actualBoundingBoxLeft: 4, actualBoundingBoxRight: 92, width: 96 }]]) {
  const c = fake(m), p = kit.glyphAnchor(c, '字', 250, 300), b = inkBox(p, m);
  ok(near((b.l + b.r) / 2, 250) && near((b.t + b.b) / 2, 300), name + '：筆畫外框中心在 (250, 300)：(' + ((b.l + b.r) / 2) + ', ' + ((b.t + b.b) / 2) + ')');
  ok(c.textAlign === 'left' && c.textBaseline === 'alphabetic', name + '：會把 textAlign／textBaseline 設成 left／alphabetic（座標才有意義）');
}
// ── 換不同的中心點也一樣（方框不在原點）──
{ const m = { actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 18, actualBoundingBoxLeft: 3, actualBoundingBoxRight: 88, width: 96 };
  for (const [cx, cy] of [[0, 0], [100, 200], [-30, 15.5], [473.25, 640.75]]) { const b = inkBox(kit.glyphAnchor(fake(m), 'x', cx, cy), m); ok(near((b.l + b.r) / 2, cx) && near((b.t + b.b) / 2, cy), '中心 (' + cx + ', ' + cy + ')'); } }
// ── drawGlyph：真的用這個座標呼叫 fillText，並回傳座標 ──
{ const m = { actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 18, actualBoundingBoxLeft: 3, actualBoundingBoxRight: 88, width: 96 }, c = fake(m), p = kit.drawGlyph(c, '門', 224, 225);
  ok(c.calls.length === 1 && c.calls[0][0] === '門' && c.calls[0][1] === p.x && c.calls[0][2] === p.y, 'drawGlyph：fillText 畫在算出的座標上'); }
// ── 舊瀏覽器量不到筆畫邊界（沒有 actualBoundingBox…、或是 0／NaN）：退回「em 中央再往下一點」的估計，不會丟錯 ──
for (const [name, m] of [['沒有 actualBoundingBox', { width: 100 }], ['全是 0', { actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0, width: 100 }], ['NaN', { actualBoundingBoxAscent: NaN, actualBoundingBoxDescent: NaN, actualBoundingBoxLeft: NaN, actualBoundingBoxRight: NaN, width: 100 }]]) {
  const p = kit.glyphAnchor(fake(m, '900 80px serif'), '字', 200, 300);
  ok(near(p.x, 150) && near(p.y, 300 + 80 * 0.38), name + '：估計＝x 左移半個字寬、y 往下 0.38 個字級：' + JSON.stringify(p));
}
// ── 程式裡的接線：兩款遊戲都用它，不再用 textBaseline = 'middle' 再偏移的老辦法 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8');
  const al = rd('../../js/reaction_alignchar.js').replace(/\/\*[\s\S]*?\*\//g, ''), ds = rd('../../js/reaction_doorslit.js').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/kit\.drawGlyph\(g, q\.ch, gl\.width \/ 2, gl\.height \/ 2\)/.test(al) && !/ch \* 0\.04 \* DPR/.test(al), '對準才看到：題目字用 kit.drawGlyph 置中（拿掉「再往下 4%」）');
  ok(/kit\.drawGlyph\(gx, q\.answer, glyph\.width \/ 2, glyph\.height \/ 2\)/.test(ds) && /h\('canvas', \{ 'class': 'doorslit-glyph' \}\)/.test(ds) && !/lineHeight/.test(ds), '門縫偷看：題目字改畫在 canvas、用 kit.drawGlyph 置中（拿掉 line-height 的做法）');
  ok(/kit\.glyphAnchor\(x, ch, size \/ 2, size \/ 2\)/.test(ds) && /if \(!anchor\)/.test(ds), '門縫偷看的「差異圖」：兩個字用同一個位置畫（以第一個字置中），差異才對得準'); }

console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS (' + total + ' checks)');
process.exitCode = bad ? 1 : 0;
