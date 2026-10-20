// 玩家身分（js/identity.js、js/leaderboard.js 的身分部分、js/reaction_core.js／reaction_kit.js 的最佳紀錄接線）的用戶端邏輯測試（V1.35.0）：
//   密碼與錯誤訊息的純函式、個人最佳的合併規則（取較好的、單位記號 .sync）、同步與待上傳名單、登出清乾淨、
//   舊玩家認領／成績進榜時建立帳號的流程（用替身彈窗）、登入／改暱稱／改密碼的呼叫內容，以及檔案接線的靜態檢查。
// 資料庫函式本身的測試在 test/leaderboard/identity_sql_test.mjs；用戶端與資料庫「真的接起來」的測試在 test/leaderboard/e2e_client_sql.mjs。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../') + '/';
const { game } = require('./load.js');     // 載入 Reaction、kit、Leaderboard（UI 用假物件）

let bad = 0, total = 0;
const say = console.log.bind(console);
const ok = (c, m) => { total++; if (!c) { bad++; say('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '  期望 ' + JSON.stringify(b) + ' 實際 ' + JSON.stringify(a));

// 記憶體版 localStorage（要能列出所有 key，所以做成真的物件；方法設成不可列舉）
const ls = {};
['getItem', 'setItem', 'removeItem'].forEach((n) => Object.defineProperty(ls, n, { enumerable: false, value: n === 'getItem' ? (k) => (k in ls ? ls[k] : null) : n === 'setItem' ? (k, v) => { ls[k] = String(v); } : (k) => { delete ls[k]; } }));
global.localStorage = ls;
global.UI.store = { get: (k, f) => (k in ls ? JSON.parse(ls[k]) : f), set: (k, v) => { ls[k] = JSON.stringify(v); }, remove: (k) => { delete ls[k]; } };
global.UI.wait = () => Promise.resolve();
const wipe = () => { Object.keys(ls).forEach((k) => delete ls[k]); const st = global.Leaderboard.test.state; st.boards = {}; st.inflight = {}; st.netDownUntil = 0; st.gate = null; };

require(ROOT + 'js/identity.js');
const LB = global.Leaderboard, ID = global.Identity, T = ID.test, LT = LB.test;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log = () => { };        // 模組的主控台訊息很多，測試的輸出一律用 say
const PID = '22222222-2222-4222-8222-222222222222', TOK = 'tok-abcdef0123456789';
const logIn = (nick) => LB.setSession({ player_id: PID, token: TOK, nick: nick || '小花' });

// 假的資料庫：LB.rpc 換成可由測試控制的函式（identity.js 呼叫的是 LB.rpc）
let rpcLog = [], reply = () => ({ ok: true, data: { ok: true } });
LB.rpc = (name, args) => { rpcLog.push({ name, args }); return Promise.resolve(reply(name, args)); };
const okData = (d) => ({ ok: true, data: d });
const fail = (e, extra) => ({ ok: true, data: Object.assign({ ok: false, error: e }, extra || {}) });
const calls = (name) => rpcLog.filter((c) => c.name === name);

(async () => {
  // ═══ 1. 純函式 ═══
  eq(T.cleanPin('12a34 56'), '1234', 'cleanPin：只留數字、最多 4 個');
  eq(T.cleanPin('９８７６'), '', 'cleanPin：全形數字不收（鍵盤要用數字鍵盤）');
  eq(T.cleanPin(null), '', 'cleanPin：null');
  ok(T.validPin('0000') && T.validPin('9876') && !T.validPin('123') && !T.validPin('12345') && !T.validPin('12a4') && !T.validPin(1234) && !T.validPin(''), 'validPin');
  eq([T.fmtWait(1), T.fmtWait(59), T.fmtWait(60), T.fmtWait(61), T.fmtWait(600), T.fmtWait(3600), T.fmtWait(9600), T.fmtWait(86400)], ['1 分鐘', '1 分鐘', '1 分鐘', '2 分鐘', '10 分鐘', '1 小時', '2 小時 40 分鐘', '24 小時'], 'fmtWait');
  eq(T.fmtDate('2026-12-31T20:00:00Z'), '1 月 1 日', 'fmtDate：台灣時間（UTC+8）：12/31 20:00Z ＝ 1/1 04:00');
  eq(T.fmtDate('garbage'), '', 'fmtDate：壞掉的日期');
  ok(/還可以試 3 次/.test(ID.errorText('wrong_pin', { attempts_left: 3 })) && /10 分鐘後再試/.test(ID.errorText('locked', { wait_seconds: 600 })), 'errorText：打錯密碼、鎖定');
  ok(/「小明」已經有人使用/.test(ID.errorText('nick_taken', {}, '小明')), 'errorText：暱稱已被使用');
  ok(/保留給另一位舊玩家（到 \d+ 月 \d+ 日）/.test(ID.errorText('nick_reserved', { until: '2026-12-20T00:00:00Z' }, '甲')), 'errorText：保留中（含日期）');
  ok(/連不上網路/.test(ID.errorText('network')) && /連不上網路/.test(ID.errorText('unsupported')) && /連不上網路/.test(ID.errorText('timeout')), 'errorText：網路類');
  ok(/這次沒有成功/.test(ID.errorText('whatever')) && /4 個數字/.test(ID.errorText('bad_pin')) && /1～8 個字/.test(ID.errorText('bad_nick')), 'errorText：預設與格式');
  ok(/今天已經改了 2 次/.test(ID.errorText('rename_too_many', { limit: 2 })) && /重新登入/.test(ID.errorText('bad_token')) && /太多/.test(ID.errorText('busy')) && /比你快一步/.test(ID.errorText('not_qualified')), 'errorText：改名次數、憑證、忙碌、沒進榜');
  ok(ID.isNetworkError('network') && ID.isNetworkError('timeout') && ID.isNetworkError('unsupported') && !ID.isNetworkError('wrong_pin'), 'isNetworkError');
  ok(T.betterOf(1, 2, 'min') === 1 && T.betterOf(1, 2, 'max') === 2 && T.betterOf(null, 5, 'min') === 5 && T.betterOf(5, null, 'max') === 5, 'betterOf');
  eq(T.cleanServerItem({ g: 'speed', b: 'min', s: 0.5, lv: 3 }), { g: 'speed', b: 'min', s: 0.5, lv: 3 }, 'cleanServerItem：正常');
  ok(T.cleanServerItem({ g: 'Speed', s: 1 }) === null && T.cleanServerItem({ g: 'speed' }) === null && T.cleanServerItem(null) === null && T.cleanServerItem({ g: 'a b', s: 1 }) === null, 'cleanServerItem：壞資料丟掉（大寫、缺值、null、空白）');
  eq(T.cleanServerItem({ g: 'spot', s: 'x', lv: 2.5 }), null, 'cleanServerItem：字串成績、非整數關卡都不收');
  eq(T.cleanServerItem({ g: 'spot', lv: 4 }), { g: 'spot', b: 'max', lv: 4 }, 'cleanServerItem：只有關卡也可以（b 預設 max）');

  // ═══ 2. 個人最佳：收集與合併 ═══
  wipe();
  ls['fm.reaction.best.speed'] = '0.5';                        // 沒有 .sync 記號：可能是舊單位，不上傳成績
  ls['fm.reaction.best.speed.v2'] = 'true';                    // 遷移旗標：不是遊戲代號，不能被當成一款遊戲
  ls['fm.reaction.best.spot'] = '3'; ls['fm.reaction.best.spot.sync'] = 'true'; ls['fm.reaction.lvbest.spot'] = '7';
  ls['fm.reaction.lvbest.cake'] = '4';
  ls['fm.reaction.best.BAD!'] = '1';
  eq(T.localGameIds().sort(), ['cake', 'speed', 'spot'], 'localGameIds：只認格式正確的遊戲代號（旗標、亂 key 不算）');
  eq(T.collect().sort((a, b) => a.g < b.g ? -1 : 1), [{ g: 'cake', lv: 4 }, { g: 'spot', s: 3, lv: 7 }], 'collect：沒確認單位的最佳成績不上傳（speed 被略過）；最佳關卡一律上傳');
  eq(T.collect(['spot']), [{ g: 'spot', s: 3, lv: 7 }], 'collect：可以指定只收幾款');
  // applyServer：沒記號的 → 直接採用資料庫的；有記號的 → 取較好的；關卡取較大
  T.applyServer([{ g: 'speed', b: 'min', s: 0.4 }, { g: 'spot', b: 'max', s: 2, lv: 5 }, { g: 'cake', b: 'max', lv: 9 }, { g: 'bad!', s: 1 }, null]);
  ok(ls['fm.reaction.best.speed'] === '0.4' && ls['fm.reaction.best.speed.sync'] === 'true', 'applyServer：沒確認單位的本機最佳 → 直接採用資料庫的（0.4），並做記號');
  ok(ls['fm.reaction.best.spot'] === '3' && ls['fm.reaction.lvbest.spot'] === '7', 'applyServer：已確認的 → 取較好的（資料庫的 2 比本機的 3 差，max）；關卡 5 比 7 小，不變');
  ok(ls['fm.reaction.lvbest.cake'] === '9', 'applyServer：最佳關卡取較大（9）');
  T.applyServer([{ g: 'spot', b: 'max', s: 8 }, { g: 'speed', b: 'min', s: 0.9 }]);
  ok(ls['fm.reaction.best.spot'] === '8' && ls['fm.reaction.best.speed'] === '0.4', 'applyServer：資料庫的較好才換（spot 8 取代 3）；speed 0.9 比 0.4 差，不換（min）');
  ok(!('fm.reaction.best.bad!' in ls), 'applyServer：壞的代號不寫進本機');
  // 一個來回（兩台裝置交錯同步）的結果與順序無關
  const merge = (seq) => { wipe(); ls['fm.reaction.best.speed.sync'] = 'true'; seq.forEach((x) => T.applyServer([x])); return [ls['fm.reaction.best.speed'], ls['fm.reaction.lvbest.speed'] || null]; };
  const A = { g: 'speed', b: 'min', s: 0.07, lv: 3 }, B = { g: 'speed', b: 'min', s: 0.05, lv: 9 }, C = { g: 'speed', b: 'min', s: 0.09, lv: 5 };
  const perms = [[A, B, C], [C, B, A], [B, A, C], [B, C, A], [A, C, B], [C, A, B]].map(merge);
  ok(perms.every((p) => JSON.stringify(p) === JSON.stringify(perms[0])) && perms[0][0] === '0.05' && perms[0][1] === '9', 'applyServer：6 種先後順序結果相同（成績取小 0.05、關卡取大 9）');

  // ═══ 3. 最佳紀錄的接線：Reaction.setBest／migrateBest／kit.noteLevel ═══
  wipe(); ID.CFG.BEST_DEBOUNCE_MS = 25;
  const lowerBetter = (a, b) => a < b;
  rpcLog = []; reply = () => okData({ ok: true, items: [], rejected: [] });
  Reaction.setBest('speed', 0.5, lowerBetter);
  ok(ls['fm.reaction.best.speed'] === '0.5' && ls['fm.reaction.best.speed.sync'] === 'true', 'setBest：寫入最佳紀錄時做 .sync 記號（現行單位）');
  await sleep(60);
  ok(rpcLog.length === 0, 'setBest：還沒登入 → 不連網、也不排上傳（登入時會整批上傳）');
  // migrateBest：有 .sync 記號就不換算（不然同步來的、或剛寫入的新單位成績會被換算成亂七八糟的數字）
  wipe(); ls['fm.reaction.best.speed'] = '0.5'; ls['fm.reaction.best.speed.sync'] = 'true';
  Reaction.migrateBest('speed', (v) => v * 1000, '.tst');
  ok(ls['fm.reaction.best.speed'] === '0.5' && ls['fm.reaction.best.speed.tst'] === 'true', 'migrateBest：有 .sync 記號 → 不換算（0.5 不變），旗標照樣立好');
  wipe(); ls['fm.reaction.best.speed'] = '123';
  Reaction.migrateBest('speed', (v) => v / 1000, '.tst');
  ok(ls['fm.reaction.best.speed'] === '0.123' && ls['fm.reaction.best.speed.tst'] === 'true', 'migrateBest：沒有記號（真的舊單位）→ 照常換算（123 → 0.123）');
  Reaction.migrateBest('speed', (v) => v / 1000, '.tst');
  ok(ls['fm.reaction.best.speed'] === '0.123', 'migrateBest：只換算一次');
  // 已登入：破紀錄 → 3 秒（測試改 25ms）後批次上傳一次
  wipe(); logIn(); rpcLog = [];
  reply = (name, args) => okData({ ok: true, items: [{ g: 'speed', b: 'min', s: 0.4, lv: 6 }], rejected: [] });
  Reaction.setBest('speed', 0.5, lowerBetter); Reaction.setBest('speed', 0.45, lowerBetter); Reaction.setBest('spot', 12, (a, b) => a > b);
  await sleep(10);
  ok(rpcLog.length === 0, 'noteBest：連續破紀錄先不連網（等 debounce）');
  eq(JSON.parse(ls[T.KEY_BESTPEND]), { speed: 1, spot: 1 }, 'noteBest：待上傳名單記著 speed、spot');
  await sleep(90);
  const sy = calls('MF_sync_bests');
  ok(sy.length === 1 && sy[0].args.p_token === TOK && sy[0].args.p_player_id === PID, 'noteBest：連續破紀錄只批次上傳 1 次，帶憑證');
  eq(sy[0].args.p_items.sort((a, b) => a.g < b.g ? -1 : 1), [{ g: 'speed', s: 0.45 }, { g: 'spot', s: 12 }].sort((a, b) => a.g < b.g ? -1 : 1), 'noteBest：上傳的是目前最好的成績');
  ok(ls['fm.reaction.best.speed'] === '0.4' && ls['fm.reaction.lvbest.speed'] === '6', '上傳之後把資料庫回的（更好的 0.4、關卡 6）合併回本機');
  eq(JSON.parse(ls[T.KEY_BESTPEND]), {}, '上傳成功 → 待上傳名單清空');
  // 上傳失敗：名單保留
  wipe(); logIn(); rpcLog = [];
  reply = () => ({ ok: false, error: 'network' });
  Reaction.setBest('speed', 0.5, lowerBetter);
  await sleep(80);
  eq(JSON.parse(ls[T.KEY_BESTPEND]), { speed: 1 }, '上傳失敗（連不上網路）→ 待上傳名單保留，下次再試');
  // 憑證失效 → 標記重新登入
  wipe(); logIn(); reply = () => fail('bad_token');
  Reaction.setBest('speed', 0.5, lowerBetter);
  await sleep(80);
  ok(LB.identityState() === 'relogin', '上傳時資料庫說憑證無效 → 標記需要重新登入');
  // kit.noteLevel
  wipe(); logIn(); rpcLog = []; reply = () => okData({ ok: true, items: [], rejected: [] });
  Reaction.kit.noteLevel('cake', 12);
  ok(ls['fm.reaction.lvbest.cake'] === '12', 'kit.noteLevel：寫入最佳關卡');
  await sleep(80);
  ok(calls('MF_sync_bests').length === 1 && calls('MF_sync_bests')[0].args.p_items.some((x) => x.g === 'cake' && x.lv === 12), 'kit.noteLevel：已登入 → 稍後同步最佳關卡');
  Reaction.kit.noteLevel('cake', 5);
  ok(ls['fm.reaction.lvbest.cake'] === '12', 'kit.noteLevel：只增不減');
  // gameMounted：進遊戲之後這款的本機最佳可以信任
  wipe(); ls['fm.reaction.best.speed'] = '0.3'; rpcLog = [];
  ID.gameMounted('speed');
  ok(ls['fm.reaction.best.speed.sync'] === 'true' && rpcLog.length === 0, 'gameMounted：進遊戲後做 .sync 記號；沒登入不連網');
  wipe(); logIn(); ls['fm.reaction.best.speed'] = '0.3'; rpcLog = []; reply = () => okData({ ok: true, items: [{ g: 'speed', b: 'min', s: 0.2 }], rejected: [] });
  ID.gameMounted('speed');
  await sleep(20);
  ok(calls('MF_sync_bests').length === 1 && calls('MF_sync_bests')[0].args.p_items[0].s === 0.3 && ls['fm.reaction.best.speed'] === '0.2', 'gameMounted：已登入 → 同步這一款（上傳 0.3、取回資料庫較好的 0.2）');

  // ═══ 4. 登入／建立／認領／改名／改密碼的呼叫內容 ═══
  wipe(); rpcLog = []; reply = () => okData({ ok: true });
  await ID.register('小明', '1234', 'speed', 0.5);
  eq(rpcLog[0], { name: 'MF_register', args: { p_nick: '小明', p_pin: '1234', p_game_id: 'speed', p_score: 0.5 } }, 'register 的呼叫內容');
  LB.setSession({ player_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', token: 'x'.repeat(20) }); LB.markRelogin();
  wipe(); ls['fm.lb.pid'] = JSON.stringify('dddddddd-dddd-4ddd-8ddd-dddddddddddd'); ls['fm.lb.nick'] = JSON.stringify('老玩家'); rpcLog = [];
  await ID.claim('老玩家', '4321');
  eq(rpcLog[0], { name: 'MF_claim_legacy', args: { p_legacy_pid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', p_nick: '老玩家', p_pin: '4321' } }, 'claim：帶這支瀏覽器的舊代號');
  await ID.login('老玩家', '4321');
  eq(rpcLog[1].args, { p_nick: '老玩家', p_pin: '4321', p_legacy_pid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }, 'login：舊玩家登入時帶舊代號（榜上的舊成績併進帳號）');
  wipe(); await ID.login('甲', '1111');
  eq(rpcLog[2].args, { p_nick: '甲', p_pin: '1111', p_legacy_pid: null }, 'login：訪客登入不帶舊代號');
  await ID.checkNick('乙', null); await ID.legacyStatus('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  eq(rpcLog.slice(-2).map((c) => c.name), ['MF_check_nick', 'MF_legacy_status'], 'checkNick／legacyStatus 呼叫的函式');
  wipe(); logIn('小花'); rpcLog = [];
  reply = () => okData({ ok: true, nick: '小花二號', changed: true, left: 1 });
  let r = await ID.rename('小花二號');
  ok(r.ok && LB.getNick() === '小花二號' && rpcLog[0].name === 'MF_rename' && rpcLog[0].args.p_token === TOK, 'rename：成功 → 更新本機暱稱快取；帶憑證');
  reply = () => fail('rename_too_many', { limit: 2 });
  r = await ID.rename('又改');
  ok(!r.ok && r.error === 'rename_too_many' && LB.getNick() === '小花二號' && LB.identityState() === 'in', 'rename：被拒絕 → 暱稱不變、仍然登入');
  reply = () => fail('bad_token');
  r = await ID.rename('再改');
  ok(!r.ok && LB.identityState() === 'relogin', 'rename：憑證失效 → 標記重新登入');
  logIn(); reply = () => okData({ ok: true });
  r = await ID.changePin('2468');
  ok(r.ok && rpcLog[rpcLog.length - 1].name === 'MF_change_pin' && rpcLog[rpcLog.length - 1].args.p_new_pin === '2468', 'changePin 呼叫內容');
  reply = () => ({ ok: false, error: 'http_404' });
  r = await ID.login('甲', '1111');
  ok(!r.ok && r.error === 'unsupported', '資料庫還沒有這個函式（404）→ unsupported（畫面顯示連不上）');
  reply = () => ({ ok: false, error: 'timeout' });
  r = await ID.login('甲', '1111');
  ok(!r.ok && r.error === 'timeout', '逾時 → timeout');
  // whoami
  logIn('舊暱稱'); reply = () => okData({ ok: true, nick: '別台改的新暱稱' });
  r = await ID.whoami();
  ok(r.ok && LB.getNick() === '別台改的新暱稱' && ls[T.KEY_WHOAMIAT], 'whoami：更新暱稱快取（別台改了暱稱，這台跟著變）');
  reply = () => fail('bad_token');
  r = await ID.whoami();
  ok(!r.ok && LB.identityState() === 'relogin', 'whoami：憑證失效 → 標記重新登入');
  wipe(); r = await ID.whoami();
  ok(!r.ok && r.error === 'bad_token', 'whoami：沒登入 → bad_token（不連網）');

  // ═══ 5. finishSession（登入／建立成功之後的收尾）═══
  wipe(); rpcLog = []; let flushes = 0; const realFlush = LB.flushPending; LB.flushPending = () => { flushes++; return Promise.resolve(); };
  ls['fm.reaction.best.speed'] = '0.3'; ls['fm.reaction.best.speed.sync'] = 'true'; ls['fm.reaction.lvbest.spot'] = '8';
  reply = () => okData({ ok: true, items: [{ g: 'speed', b: 'min', s: 0.2 }, { g: 'spot', b: 'max', lv: 15 }], rejected: [] });
  ok(await ID.finishSession({ player_id: PID, token: TOK, nick: '新帳號' }) === true, 'finishSession：成功');
  ok(LB.isLoggedIn() && LB.getNick() === '新帳號', 'finishSession：存下 player_id、憑證、暱稱');
  const fs1 = calls('MF_sync_bests');
  ok(fs1.length === 1 && fs1[0].args.p_items.length === 2, 'finishSession：登入時把本機全部最佳上傳（trusted 的成績＋關卡）');
  ok(ls['fm.reaction.best.speed'] === '0.2' && ls['fm.reaction.lvbest.spot'] === '15', 'finishSession：換裝置登入 → 資料庫較好的最佳帶回本機（最佳 − 4 進場也就跟著生效）');
  ok(flushes === 1, 'finishSession：補送待送成績（1 次）');
  await ID.finishSession({ player_id: PID, token: TOK, nick: '新帳號' }, { skipFlush: true });
  ok(flushes === 1, 'finishSession：skipFlush → 不補送（由呼叫的人自己處理）');
  ok(await ID.finishSession({ nick: 'x' }) === false, 'finishSession：缺憑證 → false');
  LB.flushPending = realFlush;

  // ═══ 6. 登出：清乾淨，但遷移旗標要留著 ═══
  wipe(); logIn('小花'); rpcLog = [];
  ls['fm.reaction.best.speed'] = '0.3'; ls['fm.reaction.best.speed.sync'] = 'true'; ls['fm.reaction.best.speed.v2'] = 'true'; ls['fm.reaction.lvbest.spot'] = '8';
  ls[T.KEY_BESTPEND] = '{"speed":1}'; ls[T.KEY_SYNCAT] = '5'; ls['fm.lb.pending'] = '{"speed":{"score":1,"at":1}}'; ls['fm.menu.tab'] = '"all"'; ls['fm.sfx.muted'] = 'true';
  reply = () => okData({ ok: true });
  await ID.logout();
  ok(calls('MF_logout').length === 1 && calls('MF_logout')[0].args.p_token === TOK, 'logout：通知資料庫刪掉這把憑證');
  ok(LB.identityState() === 'guest' && !('fm.reaction.best.speed' in ls) && !('fm.reaction.best.speed.sync' in ls) && !('fm.reaction.lvbest.spot' in ls), 'logout：回到訪客；個人最佳與記號清掉');
  ok(ls['fm.reaction.best.speed.v2'] === 'true', 'logout：遷移旗標（.v2）要留著，不然舊單位的遷移會再跑一次');
  ok(!(T.KEY_BESTPEND in ls) && !(T.KEY_SYNCAT in ls) && !('fm.lb.pending' in ls), 'logout：待上傳名單、同步時間、待送成績都清掉');
  ok(ls['fm.menu.tab'] === '"all"' && ls['fm.sfx.muted'] === 'true', 'logout：不相干的設定（選單頁籤、靜音）不動');
  wipe(); logIn(); reply = () => ({ ok: false, error: 'network' }); await ID.logout();
  ok(LB.identityState() === 'guest', 'logout：連不上網路也照樣在這支瀏覽器登出');

  // ═══ 7. 舊玩家認領流程（替身彈窗）═══
  const dialogs = [];
  ID.ui = { accountDialog(cfg) { dialogs.push(cfg); return Promise.resolve(typeof ID.answer === 'function' ? ID.answer(cfg) : (ID.answer || { kind: 'cancel' })); } };
  const legacyDevice = () => { wipe(); ls['fm.lb.pid'] = JSON.stringify('ffffffff-ffff-4fff-8fff-ffffffffffff'); ls['fm.lb.nick'] = JSON.stringify('老玩家'); ls['fm.lb.pending'] = '{"spot":{"score":9,"at":1}}'; dialogs.length = 0; rpcLog = []; };
  legacyDevice(); reply = () => okData({ ok: true, state: 'unclaimed', nick: '老玩家（伺服器）' }); ID.answer = { kind: 'logged-in' };
  let res = await ID.ensureLegacy({});
  ok(res.kind === 'logged-in' && dialogs.length === 1 && dialogs[0].mode === 'legacy' && dialogs[0].cancelable === false && dialogs[0].initialNick === '老玩家（伺服器）', '認領：未認領 → 跳認領彈窗，沒有關閉鈕，帶入暱稱：' + JSON.stringify(dialogs[0]));
  eq(calls('MF_legacy_status')[0].args, { p_player_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, '認領：先問資料庫這個舊代號的狀態');
  legacyDevice(); reply = () => okData({ ok: true, state: 'unclaimed', nick: null });
  await ID.ensureLegacy({});
  ok(dialogs[0].initialNick === '老玩家', '認領：資料庫沒有暱稱時帶入本機的暱稱');
  legacyDevice(); reply = () => okData({ ok: true, state: 'claimed', nick: '老玩家' });
  res = await ID.ensureLegacy({});
  ok(res.kind === 'relogin' && dialogs.length === 0 && LB.identityState() === 'relogin', '認領：這個代號已有帳號、只是沒憑證 → 轉成需要重新登入（不跳認領彈窗）');
  legacyDevice(); reply = () => okData({ ok: true, state: 'unknown' });
  res = await ID.ensureLegacy({});
  ok(res.kind === 'guest' && dialogs.length === 0 && LB.identityState() === 'guest' && !LB.peekPid() && ID.nickHint() === '老玩家', '認領：資料庫沒有這個代號 → 當新玩家（舊代號與舊暱稱丟掉，暱稱留作預設值）');
  ok(JSON.parse(ls['fm.lb.pending']).spot, '認領：unknown 時待送成績留著（建好帳號後補送）');
  legacyDevice(); reply = () => ({ ok: false, error: 'network' });
  res = await ID.ensureLegacy({});
  ok(res.kind === 'offline' && dialogs.length === 0 && LB.identityState() === 'legacy', '認領：連不上網路 → 這次略過（不卡住玩家），仍是舊玩家，下次再跳');
  legacyDevice(); let n = 0; reply = () => { n++; return okData({ ok: true, state: 'unclaimed', nick: 'x' }); }; ID.answer = () => sleep(10).then(() => ({ kind: 'logged-in' }));
  const [p1, p2] = [ID.ensureLegacy({}), ID.ensureLegacy({})];
  await Promise.all([p1, p2]);
  ok(n === 1 && dialogs.length === 1, '認領：同時兩個地方要 → 只查一次、只跳一個彈窗');
  wipe(); res = await ID.ensureLegacy({});
  ok(res.kind === 'guest', 'ensureLegacy：不是舊玩家 → 直接回傳目前身分（不連網）');
  logIn(); res = await ID.ensureLegacy({});
  ok(res.kind === 'logged-in', 'ensureLegacy：已登入 → logged-in');

  // gateForScore：依身分決定跳哪一個
  wipe(); dialogs.length = 0; ID.answer = { kind: 'cancel' };
  const g = { id: 'speed' }, spec = { better: 'min' };
  res = await ID.gateForScore(g, spec, 0.04);
  ok(dialogs.length === 1 && dialogs[0].mode === 'new' && dialogs[0].cancelable === true && dialogs[0].game === g && dialogs[0].score === 0.04 && res.kind === 'cancel', 'gateForScore：訪客 → 「新玩家」彈窗（可以先不要），帶著這局成績');
  ls[T.KEY_HINT] = '"舊暱稱"'; dialogs.length = 0;
  await ID.gateForScore(g, spec, 0.04);
  ok(dialogs[0].initialNick === '舊暱稱', 'gateForScore：有舊暱稱提示就帶入');
  wipe(); logIn('乙'); LB.markRelogin(); dialogs.length = 0;
  await ID.gateForScore(g, spec, 0.04);
  ok(dialogs.length === 1 && dialogs[0].mode === 'login' && dialogs[0].initialNick === '乙' && dialogs[0].cancelable === true, 'gateForScore：憑證失效 → 登入彈窗，暱稱已帶入');
  legacyDevice(); reply = () => okData({ ok: true, state: 'unclaimed', nick: '老玩家' }); ID.answer = (cfg) => ({ kind: 'logged-in' });
  res = await ID.gateForScore(g, spec, 0.04);
  ok(dialogs[0].mode === 'legacy' && dialogs[0].skipFlush === true && res.kind === 'logged-in', 'gateForScore：舊玩家 → 認領彈窗（不跳過、不另外補送）');
  legacyDevice(); reply = () => okData({ ok: true, state: 'unknown' }); ID.answer = { kind: 'cancel' };
  res = await ID.gateForScore(g, spec, 0.04);
  ok(dialogs.length === 1 && dialogs[0].mode === 'new' && dialogs[0].initialNick === '老玩家', 'gateForScore：舊代號查不到紀錄 → 轉成新玩家的建立彈窗，暱稱帶入');
  legacyDevice(); reply = () => okData({ ok: true, state: 'claimed' }); ID.answer = { kind: 'cancel' };
  res = await ID.gateForScore(g, spec, 0.04);
  ok(dialogs.length === 1 && dialogs[0].mode === 'login', 'gateForScore：舊代號其實已有帳號 → 轉成登入彈窗');
  wipe(); logIn(); res = await ID.gateForScore(g, spec, 0.04);
  ok(res.kind === 'logged-in', 'gateForScore：已登入 → 直接 logged-in');
  ID.ui = null; wipe();
  res = await ID.gateForScore(g, spec, 0.04);
  ok(res.kind === 'cancel', 'gateForScore：畫面檔沒載入 → cancel（不丟例外）');

  // ═══ 8. boot：開頁面時的檢查 ═══
  wipe(); ID.ui = { accountDialog(cfg) { dialogs.push(cfg); return Promise.resolve({ kind: 'logged-in' }); } };
  legacyDevice(); reply = (name) => okData({ ok: true, state: 'unclaimed', nick: '老玩家' });
  // boot 只會跑一次（module 載入時 document 不存在，沒有自動跑）
  ID.boot(); await sleep(30);
  ok(dialogs.length === 1 && dialogs[0].mode === 'legacy', 'boot：舊玩家 → 一開頁面就跳認領彈窗');
  ID.ui = null;

  // ═══ 9. 靜態檢查：檔案接線 ═══
  const boot = fs.readFileSync(ROOT + 'js/boot.js', 'utf8');
  const page = (name) => { const m = boot.match(new RegExp(name + ':\\s*\\{\\s*css:\\s*BASE_CSS\\.concat\\(\\[([^\\]]*)\\]\\),\\s*js:\\s*BASE_JS\\.concat\\(\\[([^\\]]*)\\]\\)')); return m ? { css: m[1], js: m[2] } : null; };
  const menuP = page('menu'), reactP = page('reaction');
  const idx = (s, f) => s.indexOf("'" + f + "'");
  ok(menuP && reactP, 'boot.js 找得到 menu／reaction 兩頁的清單');
  ok(idx(menuP.js, 'js/leaderboard.js') >= 0 && idx(menuP.js, 'js/identity.js') > idx(menuP.js, 'js/leaderboard.js') && idx(menuP.js, 'js/identity_ui.js') > idx(menuP.js, 'js/identity.js') && idx(menuP.js, 'js/identity.js') > idx(menuP.js, 'js/dialog.js'), '主選單：dialog.js → leaderboard.js → identity.js → identity_ui.js（index.html 一進來就能跳舊玩家認領彈窗）');
  ok(idx(reactP.js, 'js/identity.js') > idx(reactP.js, 'js/leaderboard_ui.js') && idx(reactP.js, 'js/identity_ui.js') > idx(reactP.js, 'js/identity.js') && idx(reactP.js, 'js/identity.js') < idx(reactP.js, 'js/reaction_core.js'), '秒反應：identity.js、identity_ui.js 在 leaderboard_ui.js 之後、遊戲檔案之前（直接開 reaction.html 也會跳認領彈窗）');
  ok(menuP.css.indexOf("'css/identity.css'") >= 0 && reactP.css.indexOf("'css/identity.css'") >= 0, '兩頁都載入 css/identity.css');
  const reactionJs = fs.readFileSync(ROOT + 'js/reaction.js', 'utf8');
  ok(/Identity\.gameMounted/.test(reactionJs) && /game\.mount\(screen/.test(reactionJs), 'reaction.js：mount 之後呼叫 Identity.gameMounted');
  const css = fs.readFileSync(ROOT + 'css/identity.css', 'utf8');
  ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'identity.css：沒有寫死的顏色（一律用 theme.css 的變數）');
  const html = fs.readFileSync(ROOT + 'index.html', 'utf8');
  ok(/FM_PAGE\s*=\s*'menu'/.test(html), 'index.html 是 menu 頁');
  const lbSrc = fs.readFileSync(ROOT + 'js/leaderboard.js', 'utf8');
  ok(!/MF_rename_player/.test(lbSrc + fs.readFileSync(ROOT + 'js/identity.js', 'utf8')), '網頁程式裡沒有舊的 MF_rename_player');
  ok(!/p_nickname/.test(lbSrc + fs.readFileSync(ROOT + 'js/identity.js', 'utf8') + fs.readFileSync(ROOT + 'js/rating.js', 'utf8')), '網頁程式裡沒有舊的 p_nickname 參數');
  ok(!/service_role/.test(fs.readFileSync(ROOT + 'js/identity.js', 'utf8') + fs.readFileSync(ROOT + 'js/identity_ui.js', 'utf8')), '身分的程式裡沒有 service_role');

  say(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS ' + total);
  process.exit(bad ? 1 : 0);
})();
