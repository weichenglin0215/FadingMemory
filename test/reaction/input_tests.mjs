// 「真的用滑鼠／手指事件操作」的瀏覽器驗證（V1.22.0 的 23 款）。
//   跟 browser_new28.js 不一樣的地方：那支用各遊戲的 G.debug.solve() 直接呼叫判定函式（驗證判定與結算流程）；
//   這支用 Chrome DevTools Protocol 送「真的滑鼠按下／移動／放開」（瀏覽器會變成 pointerdown／pointermove／pointerup），
//   驗證「按鈕有接對、拖曳的程式有接對、座標換算對不對」——例如：照抄曲線真的用手指畫一遍、手電筒猜圖真的拖出光圈、
//   轉盤真的點某個角度、骰子／圓圈真的一顆一顆點。每款遊戲開新頁面，玩到「答對第 1 關」就算通過。
// 前置：本機伺服器已開（例如  python -m http.server 8743）。
// 用法（在專案根目錄）：
//   node test/reaction/input_tests.mjs              全部（VIEW=390x844 可以換成手機大小的視窗）
//   node test/reaction/input_tests.mjs copycurve    只測指定的幾款
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const only = process.argv.slice(2);
let cdp;
const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v == null ? null : JSON.parse(v); };
const state = () => J('Reaction.current.debug.state()');
const info = () => J('Reaction.current.debug.info()');
const sel = (css, i) => J('(function(){ var e = document.querySelectorAll(' + JSON.stringify(css) + ')[' + (i || 0) + ']; if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, text: e.textContent }; })()');
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' ? 0 : 1, clickCount: 1 });
async function click(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await sleep(40); await mouse('mouseReleased', x, y); }
async function clickEl(css, i) { const r = await sel(css, i); if (!r) throw new Error('找不到元素 ' + css + '[' + (i || 0) + ']'); await click(r.x + r.w / 2, r.y + r.h / 2); }
async function clickText(css, text) {
  const idx = await J('(function(){ var l = [].slice.call(document.querySelectorAll(' + JSON.stringify(css) + ')); for (var i = 0; i < l.length; i++) if (l[i].textContent.trim() === ' + JSON.stringify(String(text)) + ') return i; return -1; })()');
  if (idx < 0) throw new Error('找不到文字為「' + text + '」的 ' + css);
  await clickEl(css, idx);
}
async function waitFor(fn, ms, what) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await sleep(120); } throw new Error('等不到：' + what); }
const phaseReady = (css) => waitFor(() => J('!!document.querySelector(' + JSON.stringify(css) + ')'), 30000, css);
async function drag(points) { await mouse('mouseMoved', points[0][0], points[0][1]); await mouse('mousePressed', points[0][0], points[0][1]); for (let i = 1; i < points.length; i++) { await mouse('mouseMoved', points[i][0], points[i][1]); await sleep(4); } return points[points.length - 1]; }
const release = (p) => mouse('mouseReleased', p[0], p[1]);
const cleared = () => state().then(s => s.cleared);

const T = {
  async copycurve() {
    const q = await info(), R = await sel('.cpc-panel--R .cpc-svg'), sc = R.w / 224;
    const P = q.pts.map(p => [R.x + p.x * sc, R.y + p.y * sc]);
    // ① 畫到一半放開：筆跡清掉、沒過關，可以重畫
    let last = await drag(P.filter((p, i) => i % 5 === 0 && i < P.length / 2)); await release(last); await sleep(150);
    if ((await J('document.querySelector(".cpc-draw").getAttribute("d")')) !== '') throw new Error('放開手指後筆跡沒清掉');
    if ((await cleared()) !== 0) throw new Error('畫到一半就算過關了');
    // ② 從黃點（起點）一路畫到水藍點（終點）
    last = await drag(P.filter((p, i) => i % 4 === 0).concat([P[P.length - 1]])); await release(last);
    await waitFor(async () => (await cleared()) === 1, 4000, '第 1 關過關（相似度夠高）');
    // ③ 第 2 關：從終點倒著畫回起點
    await waitFor(async () => (await state()).level === 2 && (await J('!!document.querySelector(".cpc-panel--R")')), 5000, '進第 2 關');
    await sleep(300);
    const q2 = await info(), R2 = await sel('.cpc-panel--R .cpc-svg');
    const P2 = q2.pts.map(p => [R2.x + p.x * sc, R2.y + p.y * sc]).reverse();
    last = await drag(P2.filter((p, i) => i % 4 === 0).concat([P2[P2.length - 1]])); await release(last);
    await waitFor(async () => (await cleared()) === 2, 4000, '第 2 關過關（從終點倒著畫）');
  },
  async flashlight() {
    const S = await sel('.flt-svg'), W = S.w;
    await drag([[S.x + 200, S.y + 300], [S.x + 220, S.y + 310]]);
    if ((await J('document.querySelector(".flt-ring").getAttribute("visibility")')) !== 'visible') throw new Error('拖曳時光圈沒有出現');
    const cx = Number(await J('document.querySelector(".flt-ring").getAttribute("cx")'));
    if (!(cx > 150 && cx < 350)) throw new Error('光圈位置怪怪的 cx=' + cx);
    await release([S.x + 220, S.y + 310]); await sleep(100);
    if ((await J('document.querySelector(".flt-ring").getAttribute("visibility")')) !== 'hidden') throw new Error('放開手指後光圈沒有熄掉');
    const q = await info();
    await clickEl('.rx-grid .btn', q.answer);
    await waitFor(async () => (await cleared()) === 1, 3000, '選對圖案過關');
  },
  async spinpick() {
    await waitFor(() => J('document.querySelector(".spk-center") && document.querySelector(".spk-center").style.visibility !== "hidden"'), 12000, '指針停住、中央出現提示');
    const q = await info(), S = await sel('.spk-svg'), sc = S.w / 472, W = 472;
    const a = (q.s + 0.5) * 360 / q.N * Math.PI / 180, r = 120;
    await click(S.x + (W / 2 + r * Math.sin(a)) * sc, S.y + (300 - r * Math.cos(a)) * sc);
    await waitFor(async () => (await cleared()) === 1, 3000, '點對那一格過關');
  },
  async farpair() {
    const q = await info(), S = await sel('.fpr-svg'), p = q.pairs[q.best].b, sc = S.w / q.W;
    await click(S.x + p.x * sc, S.y + p.y * sc);
    await waitFor(async () => (await cleared()) === 1, 3000, '點對最遠那一對過關');
  },
  async sneakmove() {
    await sleep(900);
    const q = await info();
    await clickEl('.snk-dot', q.mover);
    await waitFor(async () => (await cleared()) === 1, 3000, '點中漂移的圓點過關');
  },
  async racefirst() {
    await waitFor(() => J('document.querySelector(".rcf-tip").textContent.indexOf("最先到終點") >= 0'), 15000, '衝完、進入作答');
    const q = await info();
    await clickEl('.rcf-hit', q.win);
    await waitFor(async () => (await cleared()) === 1, 3000, '點對最先到的跑道過關');
  },
  async mergechar() {
    const q = await info();
    // 先故意連錯一組：要扣一條命
    const bad = q.pairs[1];
    await clickEl('.mgc-piece--L', q.L.indexOf(q.pairs[0].l)); await clickEl('.mgc-piece--R', q.R.indexOf(bad.r));
    await waitFor(async () => (await state()).lives === 2, 2000, '連紅線扣一條命');
    await sleep(900);
    for (const p of q.pairs) { await clickEl('.mgc-piece--L', q.L.indexOf(p.l)); await clickEl('.mgc-piece--R', q.R.indexOf(p.r)); await sleep(80); }
    await waitFor(async () => (await cleared()) === 1, 3000, '連出五條綠線過關');
  },
  async fillop() {
    const q = await info(), OPS = ['+', '-', '*', '/'];
    await clickEl('.fop-col .fop-op', OPS.indexOf(q.ops[q.blanks[0]]));
    await waitFor(async () => (await cleared()) === 1, 3000, '選對符號過關');
  },
  async fillop2() {
    // 多個空格（第 12 關起）：每個空格各選一個符號，再按「確定」
    await cdp.evalJs('Reaction.current.debug.goto(12); 1'); await sleep(600);
    const q = await info(), OPS = ['+', '-', '*', '/'];
    if (q.blanks.length < 2) throw new Error('第 12 關應該有 2 個以上的空格：' + q.blanks.length);
    for (let j = 0; j < q.blanks.length; j++) await clickEl('.fop-col .fop-op', j * 4 + OPS.indexOf(q.ops[q.blanks[j]]));
    await sleep(100);
    if ((await cleared()) !== 0) throw new Error('還沒按「確定」就判定了');
    await clickEl('.fop-ok');
    await waitFor(async () => (await cleared()) === 1, 3000, '多個空格選對、按確定過關');
  },
  async dicechange2() {
    // 第 6 關起被換掉 2 顆：兩顆都要點到才過關
    await cdp.evalJs('Reaction.current.debug.goto(6); 1'); await sleep(600);
    await waitFor(() => J('document.querySelector(".dce-msg").textContent.indexOf("請點擊點數被更換過") >= 0'), 25000, '進入作答階段');
    const q = await info();
    if (q.changed.length !== 2) throw new Error('第 6 關應該換掉 2 顆：' + q.changed.length);
    await clickEl('.dce-die', q.changed[0]); await sleep(150);
    if ((await cleared()) !== 0) throw new Error('只點一顆就過關了');
    await clickEl('.dce-die', q.changed[1]);
    await waitFor(async () => (await cleared()) === 1, 3000, '兩顆都點到過關');
  },
  async dicechange() {
    await waitFor(() => J('document.querySelector(".dce-msg").textContent.indexOf("請點擊點數被更換過") >= 0'), 20000, '進入作答階段');
    const q = await info();
    for (const c of q.changed) { await clickEl('.dce-die', c); await sleep(80); }
    await waitFor(async () => (await cleared()) === 1, 3000, '點出被換過的骰子過關');
  },
  async tapback() {
    await waitFor(() => J('document.querySelector(".tbk-tip").textContent.indexOf("倒著") >= 0'), 20000, '進入作答階段');
    const q = await info();
    for (const i of q.back) { await clickEl('.tbk-ring', i); await sleep(80); }
    await waitFor(async () => (await cleared()) === 1, 3000, '倒著點對過關');
  },
  async whosaid() {
    await phaseReady('.wsd-btn');
    const q = await info();
    for (const d of q.expect) { await clickText('.wsd-btn', d); await sleep(80); }
    await waitFor(async () => (await cleared()) === 1, 3000, '依序按對數字過關');
  },
  async nthshape() { await phaseReady('.nth-btn'); const q = await info(); await clickEl('.rx-grid .btn', q.ans); await waitFor(async () => (await cleared()) === 1, 3000, '選對圖形過關'); },
  async alignchar() { const q = await info(); await clickEl('.rx-grid .btn', q.answer); await waitFor(async () => (await cleared()) === 1, 3000, '選對字過關'); },
  async fastblink() { const q = await info(); await clickEl('.fbk-dot', q.fastSide === 'L' ? 0 : 1); await waitFor(async () => (await cleared()) === 1, 3000, '點閃得快的過關'); },
  async isequal() { const q = await info(); await clickEl('.rx-grid .btn', q.isEqual ? 1 : 0); await waitFor(async () => (await cleared()) === 1, 3000, '選對相等／不相等過關'); },
  async orderops() { const q = await info(); await clickText('.rx-grid .btn', q.truth); await waitFor(async () => (await cleared()) === 1, 3000, '選對答案過關'); },
  async remainder() { const q = await info(); await clickText('.rx-grid .btn', q.r); await waitFor(async () => (await cleared()) === 1, 3000, '選對餘數過關'); },
  async hiddendigit() { const q = await info(); await clickText('.rx-grid .btn', q.answer); await waitFor(async () => (await cleared()) === 1, 3000, '選對數字過關'); },
  async timeafter() { const q = await info(); const t = await J('Reaction.current.test.fmtTime(' + q.ans + ')'); await clickText('.rx-grid .btn', t); await waitFor(async () => (await cleared()) === 1, 3000, '選對時間過關'); },
  async wrongline() { const q = await info(); await clickEl('.wln-row', q.wrong); await waitFor(async () => (await cleared()) === 1, 3000, '點對算錯的那一行過關'); },
  async chequeamt() { const q = await info(); await clickEl('.rx-grid .btn', q.match ? 1 : 0); await waitFor(async () => (await cleared()) === 1, 3000, '選對相符／不符過關'); },
  async sudokuone() { const q = await info(); await clickText('.rx-grid .btn', q.answer); await waitFor(async () => (await cleared()) === 1, 3000, '填對數字過關'); },
  async spingap() {
    // 真的點螢幕發射：砲彈 0.6 秒後抵達，不管穿過還是撞環，都應該有結果（過關或失敗），而且只會發射一顆
    const S = await sel('.spg-svg'); await click(S.x + 100, S.y + 500);
    await sleep(150); await click(S.x + 100, S.y + 500);          // 飛行中再點一下，不應該多發射
    await waitFor(async () => { const s = await state(); return s.cleared === 1 || s.over; }, 3000, '砲彈抵達、有了結果');
    const n = await J('document.querySelectorAll(".spg-ball").length');
    if (n !== 1) throw new Error('畫面上的砲彈不只一顆：' + n);
  }
};

(async () => {
  cdp = await connect();
  let fail = 0;
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    // 視窗大小：預設 500×850（舞台原尺寸）；用環境變數 VIEW=390x844 可以換成手機大小，驗證舞台縮放後座標換算還是對的
    const view = (process.env.VIEW || '500x850').split('x').map(Number);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: view[0], height: view[1], deviceScaleFactor: 1, mobile: false });
    const ids = Object.keys(T).filter(id => !only.length || only.includes(id));
    for (const id of ids) {
      const errs = [];
      try {
        await openGame(cdp, id.replace(/\d+$/, ''), { port: 8743, root: ROOT });          // fillop2、dicechange2 是同一款遊戲的第二個情境（多個空格／多顆被換）
        await cdp.evalJs('window.__errs = []; window.addEventListener("error", function (e) { window.__errs.push(String(e.message)); }); 1');
        await sleep(500);
        await T[id]();
        const e = await J('window.__errs'); if (e && e.length) throw new Error('JS 錯誤：' + e.join(';'));
        console.log('OK   ' + id);
      } catch (e) { fail++; console.log('FAIL ' + id + '  ' + e.message); }
    }
    console.log(fail ? '\n' + fail + ' 款失敗' : '\n全部通過');
  } finally { cdp.close(); }
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
