// 五星評價（js/rating.js）與「阿嬤都比你厲害」的用戶端（js/leaderboard.js 的 Leaderboard.overtaken）測試（V1.25.0）：
//   · 台灣時間的「今天」、平均星數 → 塗黃幾 %、資料清理；
//   · 「今天評過了沒」（每款每天一次；只留今天的紀錄）；
//   · 送評價的各種結果（sent／already／offline／rejected）與快取更新；平均星數的快取（3 小時）、失敗退避、同時只連一次；
//   · 評價彈窗：五顆空心星、點第 N 顆前 N 顆變實心、再點同一顆取消、沒勾就按確認＝取消、送出後結算彈窗的按鈕消失；
//   · 被超越清單：沒有玩家／暱稱不連網、60 秒快取、換玩家重抓、404 與斷線、自己進榜後清掉快取；
//   · 接線：boot.js 兩頁都有載入、kit.result 放了按鈕、SQL 與網頁的時區一致、假資料庫有模擬新函式。
// 不需要瀏覽器：DOM 用很小的替身（只做 rating.js 會用到的部分）。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../') + '/';

let bad = 0, total = 0;
const say = console.log.bind(console);
const ok = (c, m) => { total++; if (!c) { bad++; say('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '  期望 ' + JSON.stringify(b) + ' 實際 ' + JSON.stringify(a));

// ─── 很小的 DOM 替身：UI.h 做出來的元素 ───
function el(tag, o, kids) {
  o = o || {};
  const cls = new Set(String(o['class'] || '').split(/\s+/).filter(Boolean));
  const e = { tag, children: [], parentNode: null, attrs: {}, styleProps: {}, listeners: {}, hidden: false, disabled: false, textContent: o.text || '', innerHTML: o.html || '' };
  e.classList = {
    add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c),
    toggle: (c, on) => { if (on === undefined) on = !cls.has(c); if (on) cls.add(c); else cls.delete(c); return on; }
  };
  e.style = { setProperty: (k, v) => { e.styleProps[k] = v; } };
  e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
  e.getAttribute = (k) => e.attrs[k];
  Object.keys(o.attrs || {}).forEach((k) => e.setAttribute(k, o.attrs[k]));
  e.appendChild = (c) => { if (c && typeof c === 'object') { c.parentNode = e; e.children.push(c); } return c; };
  e.removeChild = (c) => { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); c.parentNode = null; return c; };
  Object.keys(o.on || {}).forEach((k) => { e.listeners[k] = o.on[k]; });
  e.click = () => { if (e.listeners.click) e.listeners.click({ stopPropagation() { } }); };
  (kids || []).forEach((c) => { if (c != null) e.appendChild(typeof c === 'string' ? { text: c } : c); });
  return e;
}

// ─── 假的瀏覽器環境：UI、Dlg（彈窗公版）、fetch ───
global.window = global;
const mem = new Map();
global.UI = {
  h: el, icon: () => '<svg></svg>', wait: () => Promise.resolve(),
  store: { get: (k, f) => (mem.has(k) ? JSON.parse(mem.get(k)) : f), set: (k, v) => mem.set(k, JSON.stringify(v)) }
};
const toasts = [], dialogs = [];
global.Dlg = {
  richText: (t) => el('div', { 'class': 'dlg__text dlg__rich', text: t }),
  toast: (t) => toasts.push(t),
  open: (o) => {
    const ctl = { o, closed: false, isOpen: () => !ctl.closed, close: () => { if (ctl.closed) return; ctl.closed = true; if (o.onClose) o.onClose(); } };
    ctl.buttons = (o.buttons || []).map((b) => {
      const be = el('button', { text: b.text });
      be.click = () => { if (be.disabled) return; if (!b.keep) ctl.close(); if (b.onClick) b.onClick(ctl, be); };
      return be;
    });
    dialogs.push(ctl);
    return ctl;
  }
};
let fetchLog = [], fetchReply = null;       // fetchReply(name, body) → { status, body } 或 'network'
global.fetch = (url, opt) => {
  const name = String(url).split('/rpc/')[1], body = JSON.parse(opt.body);
  fetchLog.push({ name, body });
  const r = fetchReply ? fetchReply(name, body) : { status: 404, body: { code: 'PGRST202' } };
  if (r === 'network') return Promise.reject(new TypeError('Failed to fetch'));
  return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: () => Promise.resolve(r.body) });
};
const quietLog = console.log; console.log = () => { };        // 排行榜模組會印很多 [排行榜] 訊息，測試時靜音（結果用 say 印）
require(ROOT + 'js/leaderboard.js');
require(ROOT + 'js/rating.js');
const LB = global.Leaderboard, R = global.Rating, RT = R.test;
const flush = () => new Promise((r) => setImmediate(r));
const DAY = 24 * 3600 * 1000;

(async () => {
  // ═══ 1. 台灣時間的「今天」 ═══
  eq(R.today(Date.UTC(2026, 9, 13, 15, 59, 59)), '2026-10-13', '台灣 23:59:59 還是 10/13');
  eq(R.today(Date.UTC(2026, 9, 13, 16, 0, 0)), '2026-10-14', '台灣 00:00（UTC 16:00）就是 10/14');
  eq(R.today(Date.UTC(2026, 11, 31, 16, 0, 0)), '2027-01-01', '跨年');
  eq(R.today(Date.UTC(2026, 9, 13, 0, 0, 0)), '2026-10-13', 'UTC 午夜＝台灣早上 8 點，同一天');
  ok(R.CFG.TZ_OFFSET_MIN === 480, '時區是 UTC+8（480 分鐘）');

  // ═══ 2. 平均星數 → 塗黃幾 %、資料清理 ═══
  [[0, 0], [null, 0], [undefined, 0], [NaN, 0], [-1, 0], [1, 20], [3.5, 70], [4.25, 85], [5, 100], [7, 100], ['4.2', 84]].forEach(([a, p]) => {
    ok(Math.abs(RT.pct(a) - p) < 1e-9, 'pct(' + a + ') = ' + p + '（' + RT.pct(a) + '）');
  });
  eq(RT.cleanStats({ speed: [4.25, 8], cake: [1, 1], top: [5, 3] }), { speed: [4.25, 8], cake: [1, 1], top: [5, 3] }, 'cleanStats：合法的全部留下');
  eq(RT.cleanStats({ 'Bad!': [4, 1], zero: [0, 3], six: [6, 1], nocnt: [4, 0], frac: [4, 1.5], str: '4,1', obj: { a: 4 } }), {}, 'cleanStats：id 不合法、平均不在 1～5、次數不是正整數、格式不對都丟掉');
  eq(RT.cleanStats([1, 2]), {}, 'cleanStats：陣列 → 空');
  eq(RT.cleanStats(null), {}, 'cleanStats：null → 空');
  eq(RT.cleanStats({ speed: ['4.5', '2'] }), { speed: [4.5, 2] }, 'cleanStats：字串數字轉成數字');

  // ═══ 3. 今天評過了沒 ═══
  mem.clear();
  const T0 = Date.UTC(2026, 9, 13, 3, 0, 0);
  ok(!R.ratedToday('speed', T0), '一開始沒評過');
  RT.markRated('speed', T0);
  ok(R.ratedToday('speed', T0), '評過之後：今天評過了');
  ok(R.ratedToday('speed', T0 + 12 * 3600 * 1000), '同一天（台灣時間）稍後還是評過了');
  ok(!R.ratedToday('speed', T0 + DAY), '隔天就可以再評');
  ok(!R.ratedToday('cake', T0), '別款遊戲不受影響');
  ok(!R.ratedToday('', T0) && !R.ratedToday(null, T0), '沒有 id → false');
  RT.markRated('cake', T0 + DAY);
  eq(UI.store.get(RT.KEY_DONE), { cake: '2026-10-14' }, '記新的一天時，前一天的紀錄被清掉（只留今天的）');
  mem.set(RT.KEY_DONE, JSON.stringify(['garbage']));
  ok(!R.ratedToday('cake', T0 + DAY), '存檔壞掉（不是物件）→ 當作沒評過');
  RT.markRated('cake', T0 + DAY);
  ok(R.ratedToday('cake', T0 + DAY), '存檔壞掉之後照樣能記');

  // ═══ 4. 送出評價 ═══
  mem.clear(); fetchLog = [];
  mem.set('fm.lb.pid', JSON.stringify('11111111-2222-4333-8444-555555555555'));
  fetchReply = (name, b) => ({ status: 200, body: { ok: true, saved: true, day: R.today(), avg: 4.5, cnt: 2 } });
  let r = await R.submit({ id: 'speed', name: '零秒出手' }, 5);
  eq(r.status, 'sent', '送出成功 → sent');
  eq(fetchLog.map((x) => x.name), ['MF_submit_rating'], '只連一次，呼叫 MF_submit_rating');
  eq(fetchLog[0].body, { p_game_id: 'speed', p_player_id: '11111111-2222-4333-8444-555555555555', p_stars: 5 }, '參數：遊戲代號、玩家代號、星數');
  ok(R.ratedToday('speed'), '送出成功 → 記下今天評過了');
  eq(R.stats().speed, [4.5, 2], '送出成功 → 回傳的最新平均寫進快取');
  eq(UI.store.get(RT.KEY_STATS).at, 0, '只更新一款時不動快取時間（還是會照時間整份重抓）');
  fetchReply = () => ({ status: 200, body: { ok: true, saved: false, day: R.today(), avg: 3, cnt: 7 } });
  r = await R.submit('cake', 1);
  ok(r.status === 'already' && R.ratedToday('cake'), '資料庫說今天評過了 → already，也記下來（按鈕不用再顯示）');
  eq(R.stats().cake, [3, 7], 'already 也更新平均');
  fetchReply = () => 'network';
  r = await R.submit('drop', 4);
  ok(r.status === 'offline' && !R.ratedToday('drop'), '斷線 → offline，不記（之後還能再評）');
  fetchReply = () => ({ status: 404, body: { code: 'PGRST202' } });
  r = await R.submit('drop', 4);
  ok(r.status === 'offline' && !R.ratedToday('drop'), '資料庫還沒有這個函式（404）→ offline');
  fetchReply = () => ({ status: 200, body: { ok: false, error: 'unknown_game' } });
  r = await R.submit('drop', 4);
  ok(r.status === 'rejected' && !R.ratedToday('drop'), '資料庫拒絕 → rejected，不記');
  fetchReply = () => ({ status: 400, body: { message: 'bad' } });
  r = await R.submit('drop', 4);
  ok(r.status === 'rejected', 'HTTP 400 → rejected');
  fetchLog = [];
  for (const s of [0, 6, -1, 'x', null]) ok((await R.submit('drop', s)).status === 'rejected', '星數 ' + s + ' → rejected');
  ok((await R.submit('', 3)).status === 'rejected', '沒有遊戲代號 → rejected');
  ok(fetchLog.length === 0, '不合法的參數完全不連網');
  fetchReply = () => ({ status: 200, body: { ok: true, saved: true, avg: 3, cnt: 1 } });
  await R.submit('drop', 3.4);
  ok(fetchLog[0].body.p_stars === 3, '星數四捨五入成整數（3.4 → 3）');

  // ═══ 5. 平均星數的快取 ═══
  mem.clear(); fetchLog = [];
  fetchReply = (name) => (name === 'MF_get_ratings' ? { status: 200, body: { speed: [4, 3], 'BAD id': [5, 1], cake: [9, 1] } } : null);
  let s = await R.loadStats();
  eq(s, { speed: [4, 3] }, '讀平均：只留格式正確的');
  eq(R.stats(), { speed: [4, 3] }, '讀平均：存進快取');
  ok(fetchLog.length === 1 && fetchLog[0].name === 'MF_get_ratings', '讀平均：連一次 MF_get_ratings');
  await R.loadStats();
  ok(fetchLog.length === 1, '讀平均：3 小時之內再讀不連網');
  const c0 = UI.store.get(RT.KEY_STATS);
  mem.set(RT.KEY_STATS, JSON.stringify({ at: Date.now() - R.CFG.STATS_TTL_MS - 1, data: c0.data }));
  await R.loadStats();
  ok(fetchLog.length === 2, '讀平均：過了 3 小時重抓');
  await R.loadStats({ force: true });
  ok(fetchLog.length === 3, '讀平均：force 強制重抓');
  mem.set(RT.KEY_STATS, JSON.stringify({ at: Date.now() + DAY, data: c0.data }));
  await R.loadStats();
  ok(fetchLog.length === 4, '讀平均：快取時間在未來（手機時鐘被調過）→ 當作過期，重抓');
  // 同時好幾個地方要 → 只連一次
  mem.delete(RT.KEY_STATS); fetchLog = [];
  const [a1, a2] = await Promise.all([R.loadStats(), R.loadStats()]);
  ok(fetchLog.length === 1 && JSON.stringify(a1) === JSON.stringify(a2), '讀平均：同時兩個請求只連一次');
  // 失敗：繼續用舊的，10 分鐘內不再試
  mem.set(RT.KEY_STATS, JSON.stringify({ at: Date.now() - R.CFG.STATS_TTL_MS - 1, data: { speed: [2, 2] } }));
  fetchReply = () => 'network'; fetchLog = [];
  s = await R.loadStats();
  eq(s, { speed: [2, 2] }, '讀平均失敗：用舊的');
  await R.loadStats();
  ok(fetchLog.length === 1, '讀平均失敗：之後 10 分鐘內不再試（' + fetchLog.length + ' 次）');
  const back = UI.store.get(RT.KEY_STATS);
  ok(Math.abs((Date.now() - back.at) - (R.CFG.STATS_TTL_MS - R.CFG.STATS_RETRY_MS)) < 5000, '讀平均失敗：快取時間設成「10 分鐘後到期」');
  mem.clear(); fetchReply = () => ({ status: 404, body: {} });
  eq(await R.loadStats(), {}, '完全沒有快取又連不上 → 空的（格子顯示空星）');

  // ═══ 6. 畫面：平均星數那一排 ═══
  mem.set(RT.KEY_STATS, JSON.stringify({ at: Date.now(), data: { speed: [3.5, 12] } }));
  let bar = R.bar('speed');
  ok(bar.classList.contains('rate-bar'), 'bar 有 .rate-bar');
  eq(bar.styleProps['--rate-p'], '70.0%', '平均 3.5 → 塗黃 70%');
  ok(/3\.5/.test(bar.attrs['aria-label']) && /12/.test(bar.attrs['aria-label']), '讀螢幕的說明：平均與次數：' + bar.attrs['aria-label']);
  bar = R.bar('cake');
  ok(bar.styleProps['--rate-p'] === '0.0%' && bar.attrs['aria-label'] === '還沒有人評價', '沒有人評過 → 0%（全部是空位）');
  R.paint(bar, 'cake', { cake: [5, 1] });
  eq(bar.styleProps['--rate-p'], '100.0%', 'paint 可以直接給資料（選單重畫用）');

  // ═══ 7. 結算彈窗的按鈕＋評價彈窗 ═══
  mem.clear(); dialogs.length = 0; toasts.length = 0; fetchLog = [];
  mem.set('fm.lb.pid', JSON.stringify('11111111-2222-4333-8444-555555555555'));
  const game = { id: 'speed', name: '零秒出手' };
  RT.markRated('speed');
  ok(R.button(game) === null, '今天評過 → 不顯示按鈕');
  ok(R.button(null) === null && R.button({}) === null, '沒有遊戲 → 不顯示按鈕');
  mem.clear();
  mem.set('fm.lb.pid', JSON.stringify('11111111-2222-4333-8444-555555555555'));
  const card = el('div');
  const btn = card.appendChild(R.button(game));
  ok(btn && btn.classList.contains('dlg__rate') && btn.classList.contains('btn--line') && /五星評價/.test(btn.innerHTML), '按鈕：外框樣式、文字「五星評價」');
  // (a) 一顆都沒勾就按確認 → 取消，不連網，按鈕還在
  btn.click();
  let dlg = dialogs[dialogs.length - 1];
  ok(dlg.o.title === '五星評價' && dlg.o.sub === '零秒出手', '評價彈窗：標題「五星評價」、副標是遊戲名稱');
  const [intro, row, sayEl] = dlg.o.children;
  ok(intro && /每天/.test(intro.textContent), '上方說明文字（提到每天可以評一次）');
  ok(row.children.length === 5 && row.children.every((b) => !b.classList.contains('is-on')), '中間五顆空心星');
  ok(dlg.buttons.length === 1 && dlg.buttons[0].textContent === '確認', '下方只有「確認」');
  let doneArg = 'not-called';
  dlg.o.onClose = null;
  const nToast = toasts.length;
  // 直接用 Rating.open 開一次，才拿得到 onDone 的結果
  dlg.close();
  const ctlCancel = R.open(game, (x) => { doneArg = x; });
  ctlCancel.buttons[0].click();
  await flush(); await flush();
  ok(ctlCancel.closed && fetchLog.length === 0, '沒勾就按確認 → 關掉、不連網');
  ok(doneArg && doneArg.status === 'cancel', '沒勾就按確認 → 結果是 cancel：' + JSON.stringify(doneArg));
  ok(toasts.length === nToast, '取消評價不跳任何提示');
  ok(btn.parentNode === card, '取消之後「五星評價」按鈕還在');
  // (b) 點第 3 顆 → 前 3 顆實心；再點第 3 顆 → 取消；點第 5 顆 → 5 顆；確認 → 送出 5 顆
  btn.click();
  dlg = dialogs[dialogs.length - 1];
  const stars = dlg.o.children[1].children, sayLine = dlg.o.children[2];
  const onCount = () => stars.filter((b) => b.classList.contains('is-on')).length;
  ok(/還沒選/.test(sayLine.textContent), '還沒選時的提示：' + sayLine.textContent);
  stars[2].click();
  ok(onCount() === 3 && stars[0].classList.contains('is-on') && !stars[3].classList.contains('is-on'), '點第 3 顆 → 第 1～3 顆實心');
  ok(stars[2].attrs['aria-checked'] === 'true' && stars[0].attrs['aria-checked'] === 'false', '讀螢幕：第 3 顆是選中的那一顆');
  ok(/3 顆星/.test(sayLine.textContent) && /還可以/.test(sayLine.textContent), '星星下面寫「3 顆星：還可以」：' + sayLine.textContent);
  stars[2].click();
  ok(onCount() === 0, '再點同一顆 → 取消勾選（全部空心）');
  stars[0].click();
  ok(onCount() === 1, '點第 1 顆 → 1 顆');
  stars[4].click();
  ok(onCount() === 5, '點第 5 顆 → 5 顆');
  fetchReply = () => ({ status: 200, body: { ok: true, saved: true, avg: 4.8, cnt: 5 } });
  dlg.buttons[0].click();
  ok(dlg.buttons[0].disabled && /送出中/.test(dlg.buttons[0].textContent), '按確認後按鈕變成「送出中…」、不能再按');
  await flush(); await flush();
  ok(fetchLog.length === 1 && fetchLog[0].body.p_stars === 5, '送出 5 顆星');
  ok(dlg.closed, '送出後彈窗關掉');
  ok(toasts[toasts.length - 1] === '謝謝你的評價！', '小提示「謝謝你的評價！」');
  ok(btn.parentNode === null, '評完之後結算彈窗的「五星評價」按鈕消失');
  ok(R.button(game) === null, '下一局的結算：今天評過了，不再顯示按鈕');
  // (c) 斷線：提示稍後再試、按鈕還在
  const card2 = el('div');
  const btn2 = card2.appendChild(R.button({ id: 'cake', name: '分蛋糕' }));
  btn2.click();
  dlg = dialogs[dialogs.length - 1];
  dlg.o.children[1].children[3].click();
  fetchReply = () => 'network';
  dlg.buttons[0].click();
  await flush(); await flush();
  ok(/連不上/.test(toasts[toasts.length - 1]), '斷線 → 提示連不上網路：' + toasts[toasts.length - 1]);
  ok(btn2.parentNode === card2, '斷線 → 按鈕還在（之後可以再評）');
  // (d) 資料庫說今天評過了（例如換了瀏覽器分頁）：提示、按鈕消失
  btn2.click();
  dlg = dialogs[dialogs.length - 1];
  dlg.o.children[1].children[1].click();
  fetchReply = () => ({ status: 200, body: { ok: true, saved: false, avg: 4, cnt: 9 } });
  dlg.buttons[0].click();
  await flush(); await flush();
  ok(/已經評過/.test(toasts[toasts.length - 1]) && btn2.parentNode === null, '今天已經評過 → 提示、按鈕消失');

  // ═══ 8. 「阿嬤都比你厲害」：Leaderboard.overtaken ═══
  const PID = '99999999-2222-4333-8444-555555555555';
  const resetLB = () => { const st = LB.test.state; st.netDownUntil = 0; st.overtakeP = null; };
  mem.clear(); fetchLog = []; resetLB();
  fetchReply = (name) => (name === 'MF_get_overtaken' ? { status: 200, body: [{ game_id: 'cake', rank: 3, at: '2026-10-13T01:00:00Z' }, { game_id: 'speed', rank: 2, at: null }, { game_id: 'BAD!', rank: 2 }, { game_id: 'spot', rank: 1 }, { game_id: 'drop', rank: 2.5 }] } : null);
  eq(await LB.overtaken(), [], '沒有玩家代號 → 空的');
  ok(!LB.hasPlayer() && fetchLog.length === 0, '沒有玩家代號 → 不連網');
  mem.set('fm.lb.pid', JSON.stringify(PID));
  eq(await LB.overtaken(), [], '有代號沒暱稱（從來沒送過成績）→ 空的');
  ok(!LB.hasPlayer() && fetchLog.length === 0, '沒有暱稱 → 不連網');
  ok(mem.get('fm.lb.pid') === JSON.stringify(PID), '查詢不會改到玩家代號');
  mem.set('fm.lb.nick', JSON.stringify('阿嬤'));
  ok(LB.hasPlayer(), '有代號也有暱稱 → hasPlayer');
  let list = await LB.overtaken();
  eq(list, [{ game_id: 'cake', rank: 3, at: '2026-10-13T01:00:00Z' }, { game_id: 'speed', rank: 2, at: null }], '清單：只留格式正確、名次 ≥ 2 的，順序不變');
  ok(fetchLog.length === 1 && fetchLog[0].name === 'MF_get_overtaken' && fetchLog[0].body.p_player_id === PID, '連一次 MF_get_overtaken，帶玩家代號');
  await LB.overtaken();
  ok(fetchLog.length === 1, '60 秒內再問 → 用快取、不連網');
  await LB.overtaken({ force: true });
  ok(fetchLog.length === 2, 'force → 重抓');
  const oc = UI.store.get(LB.test.KEY_OVERTAKE);
  mem.set(LB.test.KEY_OVERTAKE, JSON.stringify(Object.assign({}, oc, { at: Date.now() - LB.CFG.OVERTAKE_TTL_MS - 1 })));
  await LB.overtaken();
  ok(fetchLog.length === 3, '超過 60 秒 → 重抓');
  mem.set(LB.test.KEY_OVERTAKE, JSON.stringify(Object.assign({}, oc, { at: Date.now(), pid: 'someone-else' })));
  await LB.overtaken();
  ok(fetchLog.length === 4, '快取是別的玩家代號的 → 重抓');
  mem.delete(LB.test.KEY_OVERTAKE); fetchLog = [];
  await Promise.all([LB.overtaken(), LB.overtaken(), LB.overtaken()]);
  ok(fetchLog.length === 1, '同時三個地方要 → 只連一次');
  // 資料庫還沒有這個函式（404）→ null，不進入斷線冷卻（重新執行 SQL 之後馬上就能用）
  mem.delete(LB.test.KEY_OVERTAKE); fetchLog = []; resetLB();
  fetchReply = () => ({ status: 404, body: { code: 'PGRST202' } });
  ok(await LB.overtaken() === null, '404 → null（不跳彈窗）');
  ok(LB.test.state.netDownUntil === 0, '404 不算斷線');
  // 斷線 → null，而且 60 秒內不再試
  fetchReply = () => 'network'; fetchLog = [];
  ok(await LB.overtaken() === null, '斷線 → null');
  await LB.overtaken();
  ok(fetchLog.length === 1, '斷線之後 60 秒內不再連');
  // 自己的成績進榜（名次變了）→ 清掉快取，下次回主選單一定重抓
  resetLB();
  mem.set(LB.test.KEY_OVERTAKE, JSON.stringify({ at: Date.now(), pid: PID, list: [{ game_id: 'speed', rank: 2, at: null }] }));
  fetchReply = (name) => (name === 'MF_submit_score' ? { status: 200, body: { ok: true, saved: true, rank: 1, game_id: 'speed', better: 'min', limit: 30, top: [{ rank: 1, nick: '阿嬤', score: 0.1, mine: true }] } } : null);
  const g = { id: 'speed', name: '零秒出手', score: { better: 'min', decimals: 4, min: 0, max: 60 } };
  const sr = await LB.submit(g, 0.1);
  ok(sr.status === 'saved', '送成績：進榜（' + sr.status + '）');
  ok(UI.store.get(LB.test.KEY_OVERTAKE) === null, '進榜之後被超越的快取被清掉');
  // 沒進榜 → 快取不動
  mem.set(LB.test.KEY_OVERTAKE, JSON.stringify({ at: Date.now(), pid: PID, list: [] }));
  fetchReply = (name) => (name === 'MF_submit_score' ? { status: 200, body: { ok: true, saved: false, rank: 1, game_id: 'speed', better: 'min', limit: 30, top: [{ rank: 1, nick: '阿嬤', score: 0.1, mine: true }] } } : null);
  await LB.submit(g, 0.05);
  ok(UI.store.get(LB.test.KEY_OVERTAKE) !== null, '沒有進榜 → 被超越的快取不動');

  // ═══ 9. 接線與一致性（靜態檢查） ═══
  const boot = fs.readFileSync(ROOT + 'js/boot.js', 'utf8');
  const page = (name) => { const m = boot.match(new RegExp(name + ':\\s*\\{\\s*css:\\s*BASE_CSS\\.concat\\(\\[([^\\]]*)\\]\\),\\s*js:\\s*BASE_JS\\.concat\\(\\[([^\\]]*)\\]\\)')); return m ? { css: m[1], js: m[2] } : null; };
  const menu = page('menu'), react = page('reaction');
  ok(menu && react, 'boot.js 找得到 menu／reaction 兩頁的清單');
  const order = (s, list) => list.map((f) => s.indexOf("'" + f + "'"));
  const inc = (arr) => arr.every((x, i) => x >= 0 && (i === 0 || x > arr[i - 1]));
  ok(inc(order(menu.js, ['js/dialog.js', 'js/leaderboard.js', 'js/rating.js', 'js/menu.js'])), '主選單：依序載入 dialog.js → leaderboard.js → rating.js → menu.js');
  ok(menu.css.indexOf("'css/dialog.css'") >= 0 && menu.css.indexOf("'css/rating.css'") >= 0, '主選單：載入 dialog.css、rating.css（彈窗公版、星星）');
  ok(inc(order(react.js, ['js/dialog.js', 'js/leaderboard.js', 'js/rating.js', 'js/reaction_kit.js', 'js/reaction.js'])), '秒反應：rating.js 在 leaderboard.js 之後、遊戲之前');
  ok(react.css.indexOf("'css/rating.css'") >= 0, '秒反應：載入 rating.css');
  ['css/rating.css', 'js/rating.js'].forEach((f) => ok(fs.existsSync(ROOT + f), f + ' 存在'));
  const kitSrc = fs.readFileSync(ROOT + 'js/reaction_kit.js', 'utf8');
  ok(/Rating\.button\(Reaction\.current\)/.test(kitSrc) && /foot:\s*foot/.test(kitSrc), 'kit.result：「我有話要說」下面放 Rating.button（foot）');
  ok(/if \(!o\.dock\) fitResult\(ctl\)/.test(kitSrc), 'kit.result：卡片放不下時自動變緊湊（fitResult，貼邊版不套用）');
  const dlgCss = fs.readFileSync(ROOT + 'css/dialog.css', 'utf8');
  ok(/\.dlg__minor\s*\{/.test(dlgCss) && /\.dlg--snug\s*\{/.test(dlgCss) && /\.dlg--result:not\(\.dlg--dock\)\s*\{\s*overflow-y:\s*auto/.test(dlgCss),
    'dialog.css：兩顆小按鈕並排（.dlg__minor）、縮小間距（.dlg--snug）、最後的保險可以捲動');
  const sql = fs.readFileSync(ROOT + 'supabase/MF_leaderboard.sql', 'utf8');
  ok(/c_tz\s+constant text := 'Asia\/Taipei'/.test(sql), 'SQL 的「一天」是台灣時間（跟 TZ_OFFSET_MIN 480 一致）');
  [['MF_submit_rating', 'text, uuid, int'], ['MF_get_ratings', ''], ['MF_get_overtaken', 'uuid']].forEach(([fn, sig]) => {
    ok(new RegExp('create or replace function public\\."' + fn + '"').test(sql), 'SQL 有函式 ' + fn);
    ok(sql.indexOf('grant execute on function public."' + fn + '"(' + sig + ')') >= 0, 'SQL：' + fn + ' 開放給 anon 執行');
  });
  ok(/unique \(game_id, player_id, rated_on\)/.test(sql), 'SQL：同一位玩家、同一款遊戲、同一天只能有一筆');
  const css = fs.readFileSync(ROOT + 'css/rating.css', 'utf8');
  ok(css.indexOf(RT.STAR_PATH) >= 0, 'rating.css 的星星遮罩跟 rating.js 的 STAR_PATH 是同一個形狀');
  const theme = fs.readFileSync(ROOT + 'css/theme.css', 'utf8');
  ['--rate-on', '--rate-off', '--rate-edge', '--rate-bar-w', '--rate-pick', '--gm-rank-ink', '--gm-rank-edge', '--gm-rank-fs', '--gm-heart-fs'].forEach((v) => {
    ok(new RegExp('\\s' + v + ':').test(theme), 'theme.css 定義了 ' + v);
  });
  const fake = fs.readFileSync(ROOT + 'test/leaderboard/fake_backend.js', 'utf8');
  ['MF_submit_rating', 'MF_get_ratings', 'MF_get_overtaken'].forEach((n) => ok(fake.indexOf("name === '" + n + "'") >= 0, '假資料庫有模擬 ' + n));

  console.log = quietLog;
  // V1.27：「我有話要說」彈窗的「取消」「送出」左右並排（送出在右邊），按鈕高度 70%
  {
    const rd = (p) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
    const dlg = rd('../../js/dialog.js'), css = rd('../../css/dialog.css');
    const i = dlg.indexOf('Dlg.feedback = function'), seg = dlg.slice(i, i + 2600);
    ok(seg.indexOf('btnRow: true') > 0, '意見彈窗的按鈕改成並排（btnRow）');
    ok(seg.indexOf("{ text: '取消', kind: 'line' }") > 0 && seg.indexOf("{ text: '送出', kind: 'primary'") > seg.indexOf("{ text: '取消', kind: 'line' }"), '取消在左、送出在右');
    ok(seg.indexOf('var sendBtn = ctl.buttons[1]') > 0, '送出按鈕是第二顆');
    const j = css.indexOf('.dlg--feedback .dlg__btns .btn');
    ok(j > 0 && css.slice(j, j + 120).indexOf('calc(var(--btn-h) * 0.7)') > 0, '意見彈窗的按鈕高度 70%');
  }
  say(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS (' + total + ' checks)');
  process.exitCode = bad ? 1 : 0;
})().catch((e) => { console.log = quietLog; say('FAIL 例外', e && e.stack || e); process.exitCode = 1; });
