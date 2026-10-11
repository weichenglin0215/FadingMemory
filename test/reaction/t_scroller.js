// 共用的拖曳＋慣性捲動元件（js/scroller.js，V1.23.0 從排行榜抽出來）的互動邏輯測試（用假的 DOM 物件，不需要瀏覽器）：
//   · 門檻：手指沒超過 threshold 就是「點一下」（click 照常送出）；超過了才接手拖曳，放手後的那一下 click 被吃掉
//   · 拖曳中內容跟著手指（除以舞台縮放倍率）；放手有速度就繼續滑（慣性），滑到頭尾有橡皮筋、最後一定停在 [0, max]
//   · 慣性滑行中再按一下＝讓它停住，這一下的 click 也被吃掉（不會誤點到底下的遊戲）
//   · threshold 為 0（排行榜用）一按下就接手
//   · 滾輪、鍵盤、scrollTo、refresh 的夾限
// 物理公式（rubber／releaseVelocity／flingStep）另外在 t_leaderboard.js 測。
const path = require('path');
const ROOT = path.resolve(__dirname, '../../') + '/';
global.window = global;

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e, m) => ok(Math.abs(a - b) <= e, m + '（' + a + ' vs ' + b + '）');

// ─── 假的 DOM 與瀏覽器環境 ───
function target() {
  const h = {};
  return {
    h, classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    style: {}, captured: [], offsetParent: {},
    addEventListener(t, f, o) { (h[t] = h[t] || []).push({ f, capture: o === true || (o && o.capture) }); },
    removeEventListener(t, f) { if (h[t]) h[t] = h[t].filter(x => x.f !== f); },
    setPointerCapture(id) { this.captured.push(id); },
    fire(type, ev) {
      ev = Object.assign({ type, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } }, ev || {});
      (h[type] || []).forEach(x => x.f(ev));
      return ev;
    }
  };
}
const doc = target();
global.document = doc;
let rafQ = [], rafId = 0, now = 1000;
global.requestAnimationFrame = (f) => { rafQ.push({ id: ++rafId, f }); return rafId; };
global.cancelAnimationFrame = (id) => { rafQ = rafQ.filter(x => x.id !== id); };
global.setTimeout = (f) => 0; global.clearTimeout = () => { };
const realPerf = global.performance;
Object.defineProperty(global, 'performance', { value: { now: () => now }, configurable: true });
const stepFrames = (n, dt) => { for (let i = 0; i < n && rafQ.length; i++) { now += dt; const q = rafQ; rafQ = []; q.forEach(x => x.f(now)); } };
global.Stage = { rect: () => ({ scale: 1 }) };
require(ROOT + 'js/scroller.js');
const S = global.Scroller;

function setup(opts, contentH, viewH) {
  const viewport = target(), content = target(), thumb = target();
  viewport.clientHeight = viewH || 400; content.offsetHeight = contentH || 2000;
  const sc = S.make(viewport, content, thumb, opts);
  const yOf = () => { const m = /translate3d\(0,(-?[\d.]+)px/.exec(content.style.transform || ''); return m ? -parseFloat(m[1]) : 0; };
  const ptr = (type, x, y, extra) => viewport.fire(type, Object.assign({ pointerType: 'mouse', button: 0, pointerId: 1, clientX: x, clientY: y }, extra || {}));
  return { viewport, content, thumb, sc, yOf, ptr };
}

// ═══ 1. 門檻內只是「點一下」 ═══
{
  const t = setup({ threshold: 8 });
  t.ptr('pointerdown', 100, 300);
  t.ptr('pointermove', 102, 304);                       // 移動 4.5 像素 < 8
  ok(t.yOf() === 0 && !t.viewport.captured.length, '門檻內：內容不動、沒有抓住手指');
  t.ptr('pointerup', 102, 304);
  const click = t.viewport.fire('click');
  ok(!click.stopped && !click.defaultPrevented, '門檻內：點一下的 click 照常送出，沒被攔下');
  ok(rafQ.length === 0, '門檻內：沒有啟動慣性動畫');
}

// ═══ 2. 超過門檻＝拖曳；放手後 click 被吃掉；慣性繼續滑 ═══
{
  const t = setup({ threshold: 8 });
  t.ptr('pointerdown', 100, 400);
  t.ptr('pointermove', 100, 396);                       // 4 像素：還在門檻內
  ok(t.yOf() === 0, '拖曳前 4 像素不算');
  t.ptr('pointermove', 100, 380);                       // 20 像素：超過 → 開始拖曳（以這一刻為基準）
  ok(t.viewport.captured.length === 1 && t.viewport.classList.contains('is-drag'), '超過門檻：抓住手指、加上 is-drag');
  ok(t.yOf() === 0, '剛超過門檻那一刻內容不跳（以這一刻為基準）');
  for (let i = 1; i <= 10; i++) { now += 16; t.ptr('pointermove', 100, 380 - i * 15); }       // 手指往上 150 像素，每 16ms 15 像素
  near(t.yOf(), 150, 0.01, '拖曳中：內容跟著手指（手指往上 150 → 內容往下捲 150）');
  t.ptr('pointerup', 100, 230);
  const y0 = t.yOf();
  ok(rafQ.length === 1, '放手時還在動 → 啟動慣性動畫');
  stepFrames(10, 16);
  ok(t.yOf() > y0 + 50, '慣性：放手後繼續往前滑（' + y0.toFixed(0) + ' → ' + t.yOf().toFixed(0) + '）');
  stepFrames(2000, 16);
  const yEnd = t.yOf();
  ok(rafQ.length === 0 && yEnd > y0 && yEnd <= 1600, '最後會停下來，而且在 [0, max=1600] 內：' + yEnd.toFixed(1));
  const click = t.viewport.fire('click');
  ok(click.stopped && click.defaultPrevented, '拖曳後那一下 click 被攔下（不會誤點到底下的按鈕）');
  const click2 = t.viewport.fire('click');
  ok(!click2.stopped, '只攔一次：下一個 click 正常');
}

// ═══ 3. 慣性滑行中按一下＝讓它停住，click 被吃掉 ═══
{
  const t = setup({ threshold: 8 });
  t.ptr('pointerdown', 100, 400);
  for (let i = 1; i <= 12; i++) { now += 16; t.ptr('pointermove', 100, 400 - i * 20); }
  t.ptr('pointerup', 100, 160);
  stepFrames(5, 16);
  const moving = t.yOf();
  ok(rafQ.length === 1, '還在慣性滑行');
  t.ptr('pointerdown', 100, 300);
  ok(rafQ.length === 0, '按下去 → 慣性動畫立刻停住');
  t.ptr('pointerup', 100, 300);
  const click = t.viewport.fire('click');
  ok(click.stopped, '為了讓滑動停下來而按的那一下，click 被攔下');
  near(t.yOf(), moving, 0.001, '停在按下去的位置');
  t.ptr('pointerdown', 100, 300); t.ptr('pointerup', 100, 300);
  ok(!t.viewport.fire('click').stopped, '下一次（沒在滑）的點擊正常送出');
}

// ═══ 4. threshold 0（排行榜）：一按下就接手 ═══
{
  const t = setup({});
  t.ptr('pointerdown', 100, 300);
  ok(t.viewport.captured.length === 1 && t.viewport.classList.contains('is-drag'), 'threshold 0：按下去就抓住手指');
  now += 16; t.ptr('pointermove', 100, 290);
  near(t.yOf(), 10, 0.01, 'threshold 0：一動就跟著走');
  t.ptr('pointerup', 100, 290);
}

// ═══ 5. 舞台縮放：手指移動的螢幕像素要除以縮放倍率 ═══
{
  global.Stage = { rect: () => ({ scale: 0.5 }) };
  const t = setup({ threshold: 8 });
  t.ptr('pointerdown', 100, 400);
  t.ptr('pointermove', 100, 390);                      // 10 螢幕像素＝20 舞台像素 → 超過門檻 8
  ok(t.viewport.classList.contains('is-drag'), '縮放 0.5：10 螢幕像素＝20 舞台像素，超過門檻');
  now += 16; t.ptr('pointermove', 100, 290);           // 再往上 100 螢幕像素＝200 舞台像素
  near(t.yOf(), 200, 0.01, '縮放 0.5：手指往上 100 螢幕像素 → 內容捲 200 舞台像素（黏著手指）');
  t.ptr('pointerup', 100, 290);
  global.Stage = { rect: () => ({ scale: 1 }) };
}

// ═══ 6. 橡皮筋：拖過頭尾 ═══
{
  const t = setup({});
  t.ptr('pointerdown', 100, 300);
  now += 16; t.ptr('pointermove', 100, 400);           // 往下拖 100（頂端再往下拉）→ y = rubber(-100) = -45
  near(t.yOf(), -100 * S.PHYS.rubber, 0.01, '頂端往下拉過頭：只跟 ' + S.PHYS.rubber);
  t.ptr('pointerup', 100, 400);
  stepFrames(3000, 16);
  near(t.yOf(), 0, 0.01, '放手後彈回 0');
}

// ═══ 7. 內容比視窗矮：不能捲 ═══
{
  const t = setup({ threshold: 8 }, 300, 400);
  t.ptr('pointerdown', 100, 300);
  t.ptr('pointermove', 100, 200);
  ok(!t.viewport.classList.contains('is-drag') && t.yOf() === 0, '內容比視窗矮：不接手、不動');
  ok(t.sc.max() === 0, 'max() = 0');
}

// ═══ 8. 滾輪、鍵盤、scrollTo ═══
{
  const t = setup({ threshold: 8 });                   // 內容 2000、視窗 400 → max 1600
  let e = t.viewport.fire('wheel', { deltaY: 300, deltaMode: 0 });
  ok(e.defaultPrevented, '滾輪：吃掉瀏覽器預設捲動');
  near(t.yOf(), 300, 0.01, '滾輪往下 300');
  t.viewport.fire('wheel', { deltaY: 99999, deltaMode: 0 });
  near(t.yOf(), 1600, 0.01, '滾輪到底夾在 max');
  t.viewport.fire('wheel', { deltaY: -99999, deltaMode: 0 });
  near(t.yOf(), 0, 0.01, '滾輪到頂夾在 0');
  t.viewport.fire('wheel', { deltaY: 3, deltaMode: 1 });
  near(t.yOf(), 120, 0.01, '滾輪「行」模式：每行 40 像素');
  t.sc.scrollTo(500); near(t.yOf(), 500, 0.01, 'scrollTo(500)');
  t.sc.scrollTo(99999); near(t.yOf(), 1600, 0.01, 'scrollTo 超過夾在 max');
  t.sc.scrollTo(-50); near(t.yOf(), 0, 0.01, 'scrollTo 負數夾在 0');
  t.sc.scrollTo(700);
  doc.fire('keydown', { key: 'ArrowDown' }); near(t.yOf(), 770, 0.01, '鍵盤 ↓ 70 像素');
  doc.fire('keydown', { key: 'End' }); near(t.yOf(), 1600, 0.01, '鍵盤 End');
  doc.fire('keydown', { key: 'Home' }); near(t.yOf(), 0, 0.01, '鍵盤 Home');
  t.viewport.offsetParent = null;                      // 被藏起來（display:none）
  doc.fire('keydown', { key: 'End' }); near(t.yOf(), 0, 0.01, '視窗被藏起來時，鍵盤不動它');
  t.viewport.offsetParent = {};
  t.content.offsetHeight = 900; t.sc.scrollTo(1600);   // 內容變短之後 refresh 要把位置夾回合法範圍
  t.sc.scrollTo(500); t.content.offsetHeight = 600; t.sc.refresh();
  near(t.yOf(), 200, 0.01, 'refresh：內容變短 → 位置夾回新的 max（600−400）');
  t.sc.destroy();
  doc.fire('keydown', { key: 'Home' }); near(t.yOf(), 200, 0.01, 'destroy 之後不再接鍵盤');
}

// ═══ 9. opts.keys=false 不接鍵盤 ═══
{
  const t = setup({ keys: false });
  t.sc.scrollTo(500);
  doc.fire('keydown', { key: 'Home' }); near(t.yOf(), 500, 0.01, 'keys:false → 不聽鍵盤');
}

// ═══ 10. 滑鼠右鍵不拖曳 ═══
{
  const t = setup({});
  t.ptr('pointerdown', 100, 300, { button: 2 });
  ok(!t.viewport.classList.contains('is-drag'), '滑鼠右鍵不會開始拖曳');
}

Object.defineProperty(global, 'performance', { value: realPerf, configurable: true });
console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS (' + total + ' checks)');
process.exitCode = bad ? 1 : 0;
