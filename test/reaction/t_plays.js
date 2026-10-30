// 「玩過哪些遊戲、什麼時候玩的」與遊玩次數回報（V1.39.0）：js/plays.js、js/menu.js 的三種推薦彈窗、js/reaction.js 的接線
//   · 日期：本地日期、台灣日期（跟資料庫、五星評價一樣用 +8 小時算一天）、相差幾天
//   · 本機紀錄：noteStart（開始挑戰＝玩過，局數不變）／noteDone（完成一局＝局數 +1）／壞資料丟掉／bootstrap（用舊的最佳紀錄、最近玩過補起始紀錄，只做一次）
//   · 「來都來了」suggestFresh：沒玩過的優先（隨機）、很久沒玩的補（最久的在前）、至少留名額給很久沒玩的、不夠就互補
//   · 「從從容容」suggestMaster：世界名次最前面的、不夠用玩最多局的補、湊不到 3 款就不推薦
//   · 回報佇列：完成一局排一筆（台灣日期＋遊戲）、批次送 MF_log_plays、成功才扣掉送出去的次數、失敗保留並冷卻、太舊的丟掉、404 隔很久再試
//   · 彈窗輪流：popupOrder 從上一種的下一種開始；頁面接線（boot.js 載入清單、reaction.js 偵測結算與按下開始挑戰）
const fs = require('fs');
const path = require('path');
const { game } = require('./load.js');                  // 設定好 window／UI／Sfx
const { loadAllGames, ROOT } = require('../leaderboard/all_games.cjs');

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const rd = p => fs.readFileSync(ROOT + p, 'utf8');

const mem = new Map();
global.UI.store = { get: (k, f) => (mem.has(k) ? JSON.parse(mem.get(k)) : f), set: (k, v) => mem.set(k, JSON.stringify(v)), remove: k => mem.delete(k) };
global.UI.ready = () => { };
loadAllGames();
require(ROOT + 'js/menu.js');
require(ROOT + 'js/plays.js');
const P = global.FMPlays, M = global.FMMenu, T = P.test;
const ids = M.GAME_CELLS.map(c => c.id);
const reset = () => mem.clear();
// 計時器換成假的（只記下來、不真的跑）：noteDone 會排「3 秒後送出」，測試要能檢查、也不能讓真的計時器在測試中途跑起來
const timers = [];
global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
const seeded = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

(async () => {
  // ═══ 1. 日期 ═══
  {
    const t = new Date(2026, 9, 30, 12, 0, 0).getTime();               // 本地時間 2026-10-30 中午
    ok(P.localDay(t) === '2026-10-30', 'localDay：' + P.localDay(t));
    ok(P.taipeiDay(Date.UTC(2026, 9, 29, 17, 0, 0)) === '2026-10-30' && P.taipeiDay(Date.UTC(2026, 9, 29, 15, 59, 59)) === '2026-10-29', 'taipeiDay：UTC 17:00 已經是台灣隔天、15:59 還是前一天');
    ok(P.taipeiDay(Date.UTC(2026, 11, 31, 16, 0, 0)) === '2027-01-01', 'taipeiDay 跨年');
    ok(P.daysBetween('2026-10-23', '2026-10-30') === 7 && P.daysBetween('2026-10-30', '2026-10-23') === -7 && P.daysBetween('2026-10-30', '2026-10-30') === 0, 'daysBetween');
    ok(P.daysBetween('2026-02-27', '2026-03-02') === 3 && P.daysBetween('2025-12-31', '2026-01-01') === 1, 'daysBetween 跨月、跨年');
    ok(isNaN(P.daysBetween('x', '2026-10-30')) && isNaN(P.daysBetween(null, undefined)) && isNaN(P.daysBetween('2026-1-3', '2026-10-30')), 'daysBetween：格式不對回傳 NaN');
  }

  // ═══ 2. 本機紀錄 ═══
  {
    reset();
    const d1 = new Date(2026, 9, 20, 10).getTime(), d2 = new Date(2026, 9, 25, 10).getTime();
    ok(Object.keys(P.all()).length === 0 && P.get('spot') === null, '一開始什麼都沒有');
    P.noteStart('spot', d1);
    ok(JSON.stringify(P.get('spot')) === JSON.stringify({ n: 0, first: '2026-10-20', last: '2026-10-20' }), 'noteStart：算玩過、局數 0、第一次與最近都是今天');
    P.noteStart('spot', d2);
    ok(P.get('spot').n === 0 && P.get('spot').first === '2026-10-20' && P.get('spot').last === '2026-10-25', '再按一次開始：最近一次更新、第一次不變、局數還是 0');
    P.noteDone('spot', d2); P.noteDone('spot', d2);
    ok(P.get('spot').n === 2, '完成兩局 → n = 2');
    P.noteDone('speed', d1);
    ok(P.get('speed').n === 1 && P.get('speed').first === '2026-10-20', '沒按過開始直接完成一局也行（建立紀錄）');
    ok(Object.keys(P.all()).sort().join() === 'speed,spot', '兩款');
    P.noteStart('', d1); P.noteDone(null, d1);
    ok(Object.keys(P.all()).length === 2, '沒有遊戲 id 不記');
    // 壞資料：格式不對的列丟掉、不會讓整個讀不出來
    mem.set(T.KEY, JSON.stringify({ g: { spot: { n: 3, first: '2026-10-01', last: '2026-10-25' }, BAD: { n: 1, last: '2026-10-25' }, x: null, nodate: { n: 2 }, neg: { n: -5, last: '2026-10-02' }, str: 'abc' } }));
    const a = P.all();
    ok(Object.keys(a).sort().join() === 'neg,spot' && a.spot.n === 3 && a.neg.n === 0 && a.neg.first === '2026-10-02', '壞資料丟掉、負的局數當 0：' + Object.keys(a));
    mem.set(T.KEY, JSON.stringify('garbage')); ok(Object.keys(P.all()).length === 0, '整個壞掉也不會丟例外');
    mem.set(T.KEY, JSON.stringify({ g: [1, 2] })); ok(Object.keys(P.all()).length === 0, 'g 是陣列也不會當掉');
  }

  // ═══ 3. bootstrap：用舊紀錄補起始資料，只做一次 ═══
  {
    reset();
    const now = new Date(2026, 9, 30, 9).getTime();
    mem.set('fm.reaction.best.spot', JSON.stringify(12));
    mem.set('fm.menu.recent', JSON.stringify(['chicks', 'nope', 'speed']));
    mem.set('fm.menu.lastGame', JSON.stringify('beans'));
    ok(P.bootstrap(ids, now) === true, 'bootstrap 有補東西');
    const a = P.all();
    ok(Object.keys(a).sort().join() === 'beans,chicks,speed,spot', '有最佳紀錄、最近玩過、上次玩的都算玩過；不存在的 id 不收：' + Object.keys(a));
    ok(a.spot.n === 1 && a.spot.first === '2026-10-30' && a.spot.last === '2026-10-30' && a.spot.boot === true, '起始紀錄：1 局、日期算今天、帶 boot 記號');
    // 之後實際玩了：boot 記號消失
    P.noteDone('spot', now); ok(P.get('spot').n === 2 && !P.get('spot').boot, '真的玩過之後 boot 記號拿掉、局數累加');
    mem.set('fm.reaction.best.drop', JSON.stringify(5));
    ok(P.bootstrap(ids, now) === false && !P.get('drop'), '只做一次：之後新增的舊紀錄不再補（它們是從這個版本起玩的，會自己記）');
    // 已經有紀錄的不被蓋掉
    reset();
    P.noteDone('spot', new Date(2026, 9, 1, 9).getTime());
    mem.set('fm.reaction.best.spot', JSON.stringify(1));
    P.bootstrap(ids, now);
    ok(P.get('spot').first === '2026-10-01' && P.get('spot').n === 1 && !P.get('spot').boot, 'bootstrap 不會蓋掉已經有的紀錄');
    // 已經有 fm.plays（例如遊戲頁先寫了一筆）、但還沒 bootstrap 過：舊紀錄照樣補進來
    reset();
    P.noteStart('speed', new Date(2026, 9, 29, 9).getTime());
    mem.set('fm.reaction.best.chicks', JSON.stringify(3));
    P.bootstrap(ids, now);
    ok(!!P.get('chicks') && P.get('speed').last === '2026-10-29', '遊戲頁先寫過一筆也沒關係：沒補過的舊紀錄照樣補');
  }

  // ═══ 4. suggestFresh：來都來了 ═══
  {
    const today = '2026-10-30', day = (n) => { const d = new Date(Date.UTC(2026, 9, 30 - n)); return d.toISOString().slice(0, 10); };
    const pl = {};
    ids.slice(0, 20).forEach((id, i) => { pl[id] = { n: 3, first: day(40), last: day(i < 10 ? 1 + i % 5 : 8 + i) }; });   // 前 10 款最近玩過（1～5 天前），後 10 款 18～27 天前
    const r = P.suggestFresh(ids, pl, { today, rand: seeded(7) });
    ok(r.length === 6 && new Set(r.map(x => x.id)).size === 6, '6 款、不重複');
    ok(r.every(x => x.kind === 'new' ? !pl[x.id] && x.days === null : (pl[x.id] && x.days >= P.STALE_DAYS && x.days === P.daysBetween(pl[x.id].last, today))), '沒玩過的沒有紀錄；很久沒玩的至少 ' + P.STALE_DAYS + ' 天，days 算對');
    ok(r.filter(x => x.kind === 'stale').length === 2 && r.filter(x => x.kind === 'new').length === 4, '預設 4 款沒玩過＋2 款很久沒玩：' + r.map(x => x.kind[0]).join(''));
    ok(r.slice(0, 4).every(x => x.kind === 'new') && r.slice(4).every(x => x.kind === 'stale'), '沒玩過的排前面');
    ok(r.filter(x => x.kind === 'stale').map(x => x.days).join() === '27,26' || (r[4].days >= r[5].days), '很久沒玩的：最久的在前（' + r[4].days + '、' + r[5].days + '）');
    ok(!r.some(x => pl[x.id] && P.daysBetween(pl[x.id].last, today) < P.STALE_DAYS), '最近玩過的絕不推薦');
    // 隨機性：不同亂數挑到不同的
    const sets = new Set(); for (let i = 0; i < 20; i++) sets.add(P.suggestFresh(ids, pl, { today, rand: seeded(i + 100) }).filter(x => x.kind === 'new').map(x => x.id).join());
    ok(sets.size > 10, '沒玩過的是隨機挑的（20 次出現 ' + sets.size + ' 種組合）');
    // 全新玩家：全部沒玩過
    const r0 = P.suggestFresh(ids, {}, { today, rand: seeded(1) });
    ok(r0.length === 6 && r0.every(x => x.kind === 'new'), '全新玩家：6 款都是沒玩過的');
    ok(P.suggestFresh(ids, null, { today, rand: seeded(1) }).length === 6 && P.suggestFresh([], {}, { today }).length === 0, 'plays 是 null、沒有遊戲也不會當掉');
    // 幾乎都玩過：沒玩過的不夠，由很久沒玩的補
    const most = {}; ids.forEach((id, i) => { most[id] = { n: 1, first: day(90), last: day(i < 3 ? 0 : 10 + i % 40) }; });
    delete most[ids[5]]; delete most[ids[6]];
    const r1 = P.suggestFresh(ids, most, { today, rand: seeded(3) });
    ok(r1.length === 6 && r1.filter(x => x.kind === 'new').length === 2 && r1.filter(x => x.kind === 'stale').length === 4, '沒玩過的只剩 2 款：另外 4 款由很久沒玩的補（' + r1.map(x => x.kind[0]).join('') + '）');
    ok(r1.every(x => x.kind === 'new' || ![ids[0], ids[1], ids[2]].includes(x.id)), '今天玩過的不推薦');
    // 全部都剛玩過：沒東西可推薦
    const none = {}; ids.forEach(id => { none[id] = { n: 1, first: day(2), last: day(1) }; });
    ok(P.suggestFresh(ids, none, { today }).length === 0, '每款都在 ' + P.STALE_DAYS + ' 天內玩過：不推薦（回傳空）');
    // 很久沒玩的只有 1 款
    const one = JSON.parse(JSON.stringify(none)); one[ids[9]].last = day(30);
    const r2 = P.suggestFresh(ids, one, { today });
    ok(r2.length === 1 && r2[0].id === ids[9] && r2[0].kind === 'stale' && r2[0].days === 30, '只有 1 款很久沒玩：只推薦它');
    // 參數
    ok(P.suggestFresh(ids, {}, { n: 3, today, rand: seeded(1) }).length === 3 && P.suggestFresh(ids, pl, { n: 6, staleDays: 100, today, rand: seeded(1) }).every(x => x.kind === 'new'), 'n、staleDays 參數有效');
    // 日期壞掉的列：不會被當成很久沒玩（格式不對 daysBetween 是 NaN）
    const broken = {}; ids.forEach(id => { broken[id] = { n: 1, first: 'x', last: 'zzz' }; });
    ok(P.suggestFresh(ids, broken, { today }).length === 0, '日期格式壞掉的紀錄不會被當成「很久沒玩」');
  }

  // ═══ 5. suggestMaster：從從容容 ═══
  {
    const pl = {
      spot: { n: 10, first: '2026-10-01', last: '2026-10-29' }, speed: { n: 8, first: '2026-10-01', last: '2026-10-28' }, drop: { n: 6, first: '2026-10-01', last: '2026-10-27' },
      cups: { n: 5, first: '2026-10-01', last: '2026-10-26' }, coins: { n: 4, first: '2026-10-01', last: '2026-10-25' }, lights: { n: 3, first: '2026-10-01', last: '2026-10-24' },
      pour: { n: 2, first: '2026-10-01', last: '2026-10-23' }, tissue: { n: 1, first: '2026-10-01', last: '2026-10-22' }
    };
    const ranks = [{ game_id: 'coins', rank: 4 }, { game_id: 'spot', rank: 1 }, { game_id: 'pour', rank: 4 }, { game_id: 'nope', rank: 2 }, { game_id: 'drop', rank: 0 }, null, { game_id: 'cups', rank: 12 }];
    const r = P.suggestMaster(ids, pl, ranks);
    ok(r.map(x => x.id).join() === 'spot,coins,pour,cups,speed,drop' || r.map(x => x.id).join() === 'spot,pour,coins,cups,speed,drop', '世界名次由前到後，不夠 6 款用局數最多的補：' + r.map(x => x.id));
    ok(r[0].rank === 1 && r[0].n === 10 && r[3].rank === 12 && r[4].rank === null && r[4].n === 8, '帶名次與局數；補的沒有名次');
    ok(!r.some(x => x.id === 'nope'), '不在選單的遊戲不收');
    ok(r.findIndex(x => x.id === 'coins') < r.findIndex(x => x.id === 'pour'), '同名次：最近玩的在前（coins 10/25 比 pour 10/23 近）');
    // 沒名次（訪客）：只看局數，至少 3 局
    const g = P.suggestMaster(ids, pl, null);
    ok(g.map(x => x.id).join() === 'spot,speed,drop,cups,coins,lights' && g.every(x => x.rank === null && x.n >= 3), '沒有名次：玩最多局的（至少 3 局）：' + g.map(x => x.id));
    ok(g.length === 6 && !g.some(x => x.id === 'pour' || x.id === 'tissue'), '只玩 1、2 局的不算擅長');
    // 湊不到 3 款：不推薦
    ok(P.suggestMaster(ids, { spot: pl.spot, speed: pl.speed }, null).length === 0, '只有 2 款夠格：不推薦（回傳空）');
    ok(P.suggestMaster(ids, {}, [{ game_id: 'spot', rank: 1 }, { game_id: 'speed', rank: 2 }]).length === 0, '只有 2 款有名次：不推薦');
    ok(P.suggestMaster(ids, {}, [{ game_id: 'spot', rank: 1 }, { game_id: 'speed', rank: 2 }, { game_id: 'drop', rank: 3 }]).length === 3, '3 款有名次就夠，沒玩過紀錄也行');
    ok(P.suggestMaster(ids, null, null).length === 0 && P.suggestMaster([], pl, ranks).length === 0, '沒資料不會當掉');
    // 名次很多：最多 6 款、依名次
    const many = ids.slice(0, 20).map((id, i) => ({ game_id: id, rank: 30 - i }));
    const rm = P.suggestMaster(ids, {}, many);
    ok(rm.length === 6 && rm.map(x => x.rank).join() === '11,12,13,14,15,16', '名次很多：取最前面的 6 款（' + rm.map(x => x.rank) + '）');
    ok(P.suggestMaster(ids, pl, ranks, { n: 2, minItems: 1 }).length === 2, 'n 參數有效');
  }

  // ═══ 6. 回報佇列與批次送出 ═══
  {
    reset();
    const calls = []; let reply = { ok: true, data: { ok: true, saved: 1 } };
    global.Leaderboard = { pid: () => 'pid-123', rpc: (name, args, ms) => { calls.push({ name, args: JSON.parse(JSON.stringify(args)), ms }); return Promise.resolve(reply); } };
    const now = Date.UTC(2026, 9, 29, 17, 30, 0);                 // 台灣 10/30 01:30
    T.state.downUntil = 0; T.state.busy = false;
    T.state.timer = null; timers.length = 0;
    P.noteDone('spot', now); P.noteDone('spot', now); P.noteDone('speed', now);
    ok(timers.length === 1 && timers[0].ms === 3000, '完成一局會排一個 3 秒後送出的計時器（連續完成只排一個）：' + timers.length);
    const qBefore = JSON.stringify(T.readQ());
    timers[0].fn(); await Promise.resolve();
    ok(calls.length === 1 && calls[0].name === 'MF_log_plays' && T.state.timer === null, '計時器到了就送出（並清掉計時器記號）');
    calls.length = 0; mem.set(T.KEY_Q, qBefore); T.state.busy = false; T.state.downUntil = 0;
    const q = T.readQ();
    ok(q['2026-10-30|spot'] === 2 && q['2026-10-30|speed'] === 1 && Object.keys(q).length === 2, '佇列用台灣日期：' + JSON.stringify(q));
    // 本機的日期用本地時間、回報用台灣日期，兩者各自獨立
    // 送出：成功就扣掉
    const todayTp = P.taipeiDay();
    mem.set(T.KEY_Q, JSON.stringify({ [todayTp + '|spot']: 2, [todayTp + '|speed']: 1 }));
    let r = await P.flush();
    ok(r.sent === 2 && calls.length === 1 && calls[0].name === 'MF_log_plays', 'flush 呼叫 MF_log_plays');
    ok(calls[0].args.p_player_id === 'pid-123' && calls[0].args.p_items.length === 2, '帶玩家代號與兩筆：' + JSON.stringify(calls[0].args));
    ok(calls[0].args.p_items.every(it => it.day === todayTp && /^[a-z0-9_]+$/.test(it.game_id) && it.n >= 1) && calls[0].args.p_items.find(it => it.game_id === 'spot').n === 2, '每筆有 day／game_id／n');
    ok(Object.keys(T.readQ()).length === 0 && mem.get(T.KEY_Q) === 'null', '成功：佇列清空');
    // 送出的途中又完成一局：只扣送出去的那些
    mem.set(T.KEY_Q, JSON.stringify({ [todayTp + '|spot']: 2 }));
    let release; reply = null;
    global.Leaderboard.rpc = (name, args) => new Promise(res => { release = () => res({ ok: true, data: { ok: true } }); });
    const pr = P.flush();
    ok((await P.flush()).error === 'busy', '正在送的時候不會重複送');
    T.queueAdd(todayTp, 'spot'); T.queueAdd(todayTp, 'drop');
    release(); await pr;
    ok(T.readQ()[todayTp + '|spot'] === 1 && T.readQ()[todayTp + '|drop'] === 1 && Object.keys(T.readQ()).length === 2, '送的途中新增的次數保留：' + JSON.stringify(T.readQ()));
    // 失敗：保留、冷卻
    global.Leaderboard.rpc = () => Promise.resolve({ ok: false, error: 'network' });
    mem.set(T.KEY_Q, JSON.stringify({ [todayTp + '|spot']: 3 })); T.state.downUntil = 0;
    r = await P.flush();
    ok(r.sent === 0 && r.error === 'network' && T.readQ()[todayTp + '|spot'] === 3, '失敗：次數還在');
    ok(T.state.downUntil > Date.now() && T.state.downUntil - Date.now() <= T.RETRY_MS + 50, '失敗：冷卻 ' + T.RETRY_MS / 1000 + ' 秒');
    ok((await P.flush()).error === 'cooldown', '冷卻中不連線');
    // 404（資料庫還沒建函式）：冷卻很久
    T.state.downUntil = 0; global.Leaderboard.rpc = () => Promise.resolve({ ok: false, error: 'http_404' });
    await P.flush(); ok(T.state.downUntil - Date.now() > T.RETRY_MS * 5 && T.readQ()[todayTp + '|spot'] === 3, '404：隔很久才再試、次數保留');
    // 伺服器說參數錯：丟掉（不要永遠重送）
    T.state.downUntil = 0; global.Leaderboard.rpc = () => Promise.resolve({ ok: true, data: { ok: false, error: 'bad_args' } });
    r = await P.flush(); ok(r.error === 'bad_args' && Object.keys(T.readQ()).length === 0, 'bad_args：這批丟掉');
    // 太舊的丟掉、未來太遠的丟掉；一次最多 BATCH_MAX 筆
    T.state.downUntil = 0; const sent = []; global.Leaderboard.rpc = (n, a) => { sent.push(a); return Promise.resolve({ ok: true, data: { ok: true } }); };
    const oldDay = P.taipeiDay(Date.now() - 10 * 86400000), futDay = P.taipeiDay(Date.now() + 5 * 86400000);
    const big = { [oldDay + '|spot']: 2, [futDay + '|spot']: 1 };
    ids.slice(0, 50).forEach(id => { big[todayTp + '|' + id] = 1; });
    mem.set(T.KEY_Q, JSON.stringify(big));
    r = await P.flush();
    ok(sent[0].p_items.length === T.BATCH_MAX && !sent[0].p_items.some(it => it.day === oldDay || it.day === futDay), '一次最多 ' + T.BATCH_MAX + ' 筆；太舊、太未來的不送');
    ok(Object.keys(T.readQ()).length === 50 - T.BATCH_MAX && !T.readQ()[oldDay + '|spot'], '太舊的從佇列丟掉；剩下的下一批再送（' + Object.keys(T.readQ()).length + ' 筆）');
    r = await P.flush(); ok(sent.length === 2 && Object.keys(T.readQ()).length === 0, '下一批把剩下的送完');
    ok((await P.flush()).sent === 0 && sent.length === 2, '沒東西要送就不連線');
    // 佇列上限：太多就丟最舊的日子
    reset(); const huge = {}; for (let i = 0; i < T.Q_MAX_KEYS + 20; i++) huge['2026-10-' + String(1 + i % 28).padStart(2, '0') + '|g' + i] = 1;
    mem.set(T.KEY_Q, JSON.stringify(huge)); T.queueAdd('2026-10-30', 'extra');
    ok(Object.keys(T.readQ()).length <= T.Q_MAX_KEYS, '佇列有上限（' + Object.keys(T.readQ()).length + '）');
    ok(!!T.readQ()['2026-10-30|extra'], '新加的（日期最新的）一定留著');
    // 壞資料
    mem.set(T.KEY_Q, JSON.stringify({ 'bad key': 3, '2026-10-30|spot': 0, '2026-10-30|ok': 5, '2026-10-30|x': 'a' }));
    ok(Object.keys(T.readQ()).join() === '2026-10-30|ok', '佇列的壞資料丟掉');
    // 沒有 Leaderboard：不連線、不丟例外
    delete global.Leaderboard; T.state.downUntil = 0;
    ok((await P.flush()).error === 'nolb', '沒有 Leaderboard 也不會當掉');
  }

  // ═══ 7. 三種彈窗輪流（menu.js）═══
  {
    const O = M.POPUP_ORDER;
    ok(O.join() === 'comeon,grandma,master', '輪流順序：來都來了 → 阿嬤 → 從從容容');
    ok(M.popupOrder(null).join() === 'comeon,grandma,master' && M.popupOrder('zzz').join() === 'comeon,grandma,master' && M.popupOrder(undefined)[0] === 'comeon', '沒有紀錄（新玩家）從「來都來了」開始');
    ok(M.popupOrder('comeon').join() === 'grandma,master,comeon' && M.popupOrder('grandma').join() === 'master,comeon,grandma' && M.popupOrder('master').join() === 'comeon,grandma,master', '從上一種的下一種開始、繞一圈');
    ok(M.popupOrder('grandma').length === 3 && new Set(M.popupOrder('master')).size === 3, '每次三種都試得到');
    const meta = M.POPUP_META;
    ok(meta.grandma.title === '阿嬤都比你厲害' && meta.comeon.title === '來都來了，快開一局' && meta.master.title === '從從容容、游刃有餘', '三個標題');
    ok(Object.keys(meta).every(k => /dlg--grandma/.test(meta[k].cls) && meta[k].sub.length > 5), '三種共用 .dlg--grandma 的版面與層級');
    // comeonItems／masterItems 回傳選單裡的格子
    reset();
    const ci = M.comeonItems({}, { today: '2026-10-30', rand: seeded(5) });
    ok(ci.length === 6 && ci.every(x => x.cell === M.gameById[x.cell.id] && x.kind === 'new'), 'comeonItems：6 款，用選單同一份遊戲資料');
    const pl = {}; ids.forEach(id => { pl[id] = { n: 5, first: '2026-09-01', last: '2026-10-29' }; });
    pl[ids[3]] = { n: 5, first: '2026-09-01', last: '2026-10-10' };
    const ci2 = M.comeonItems(pl, { today: '2026-10-30' });
    ok(ci2.length === 1 && ci2[0].cell.id === ids[3] && ci2[0].kind === 'stale' && ci2[0].days === 20, '只有一款很久沒玩：' + JSON.stringify(ci2.map(x => [x.cell.id, x.days])));
    const mi = M.masterItems([{ game_id: 'spot', rank: 1 }, { game_id: 'speed', rank: 2 }, { game_id: 'drop', rank: 9 }, { game_id: 'nope', rank: 1 }], {});
    ok(mi.length === 3 && mi[0].cell.id === 'spot' && mi[0].rank === 1 && mi[2].rank === 9, 'masterItems：依名次、帶名次');
    ok(M.masterItems(null, {}).length === 0, '沒名次也沒玩過：不推薦');
  }

  // ═══ 8. 頁面接線（原始碼檢查）═══
  {
    const boot = rd('js/boot.js'), rx = rd('js/reaction.js'), menu = rd('js/menu.js'), css = rd('css/menu.css'), sw = rd('sw.js');
    const menuJs = /menu:\s*\{[\s\S]*?\n\s*\},\s*\n\s*reaction:/.exec(boot)[0], rxJs = /reaction:\s*\{[\s\S]*?\n\s*\},\s*\n\s*quiz:/.exec(boot)[0];
    ok(/'js\/leaderboard\.js', 'js\/plays\.js'/.test(menuJs), 'boot.js：主選單載入 plays.js（在 leaderboard.js 後面）');
    ok(/'js\/leaderboard\.js', 'js\/plays\.js'/.test(rxJs), 'boot.js：遊戲頁載入 plays.js（在 leaderboard.js 後面）');
    ok(/FMPlays\.noteStart\(game\.id\)/.test(rx) && /function startGame\(\) \{[\s\S]{0,400}FMPlays\.noteStart/.test(rx), 'reaction.js：按「開始挑戰」記玩過');
    ok(/FMPlays\.noteDone\(game\.id\)/.test(rx) && /data-bgm'\) === '0'/.test(rx.slice(rx.indexOf('noteDone') - 200, rx.indexOf('noteDone') + 200)), 'reaction.js：結算畫面出現記一局（多關卡的小結算 data-bgm="0" 不算）');
    ok(/FMPlays\.bootstrap\(allIds\(\)\)/.test(menu), 'menu.js：進頁面時補起始紀錄');
    ok(/popupOrder\(UI\.store\.get\(POPUP_KEY, null\)\)/.test(menu) && /UI\.store\.set\(POPUP_KEY, kind\)/.test(menu), 'menu.js：依上一次跳出的種類輪流、跳出時記下來');
    ok(!/checkGrandma|closeGrandma/.test(menu), 'menu.js：舊的 checkGrandma／closeGrandma 已經換成 checkPopup／closePopup');
    ok(/\.dlg--comeon \.dlg__title/.test(css) && /\.dlg--master \.dlg__title/.test(css) && /\.game-cell__rank--tag b/.test(css), 'menu.css：兩種新彈窗的標題色與文字標籤');
    ok(/js\/plays\.js/.test(sw), 'sw.js：離線清單有 plays.js');
  }

  console.log((bad ? bad + ' FAIL / ' : '') + total + ' checks');
  console.log(bad ? 'SOME FAILED' : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('ERROR', e && e.stack || e); process.exit(1); });
