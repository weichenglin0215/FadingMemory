// 整合測試：「真正的用戶端程式 js/leaderboard.js」↔「真正的資料庫腳本 supabase/MF_leaderboard.sql」
// 做法：在 PGlite（真正的 PostgreSQL）裡執行 SQL，再把 fetch 換成「假的 Supabase 閘道」——
// 收到 POST /rest/v1/rpc/<函式> 就用 anon 角色呼叫對應的資料庫函式，回傳 JSON（PostgREST 就是這麼做的）。
// 這樣能抓到「用戶端送的欄位名稱／型別跟資料庫函式對不起來」這類兩邊各自測試都測不到的問題。
// 執行：先在這個資料夾 npm install，再 node e2e_client_sql.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..') + '/';
const require = createRequire(import.meta.url);

let bad = 0, total = 0;
const say = console.log.bind(console);      // 用戶端模組自己會 console.log 很多訊息，有些段落會把 console.log 靜音；測試自己的輸出一律用 say
const ok = (c, m) => { total++; if (!c) { bad++; say('FAIL', m); } };

// ─── 資料庫 ───
const db = new PGlite();
await db.exec('create role anon nologin; create role authenticated nologin;');
await db.exec(fs.readFileSync(ROOT + 'supabase/MF_leaderboard.sql', 'utf8'));

// 函式參數型別表（PostgREST 會依資料庫裡的函式定義轉型，這裡手動對照）
const SIG = {
  MF_get_top: [['p_game_id', 'text'], ['p_player_id', 'uuid']],
  MF_submit_score: [['p_game_id', 'text'], ['p_player_id', 'uuid'], ['p_nickname', 'text'], ['p_score', 'numeric']],
  MF_rename_player: [['p_player_id', 'uuid'], ['p_nickname', 'text']]
};
let httpLog = [];
globalThis.fetch = async (url, opt) => {
  const name = String(url).split('/rest/v1/rpc/')[1];
  const body = JSON.parse(opt.body);
  httpLog.push({ name, body, headers: opt.headers });
  const sig = SIG[name];
  if (!sig) return { ok: false, status: 404, json: async () => ({ code: 'PGRST202' }) };
  // PostgREST：JSON 的 key 必須剛好對應函式的參數名稱，多的或少的都會回 404（找不到函式）
  const keys = Object.keys(body).sort().join(',');
  const want = sig.map(x => x[0]).sort().join(',');
  if (keys !== want) return { ok: false, status: 404, json: async () => ({ code: 'PGRST202', message: '參數對不上：' + keys + ' vs ' + want }) };
  const args = sig.map(([k, t], i) => k + ' => $' + (i + 1) + '::' + t);
  await db.exec('set role anon');
  try {
    const r = await db.query('select public."' + name + '"(' + args.join(', ') + ') as r', sig.map(([k]) => body[k]));
    return { ok: true, status: 200, json: async () => r.rows[0].r };
  } catch (e) {
    return { ok: false, status: 400, json: async () => ({ message: String(e.message) }) };
  } finally { await db.exec('reset role'); }
};

// ─── 載入真正的用戶端程式與「全部 50 款真正的遊戲檔案」（用假的 UI 環境）───
// 遊戲檔案由 all_games.cjs 載入（依 js/boot.js 的清單），拿到的是各遊戲 register 時登記的真實 score 設定，
// 所以這個測試驗證的是「遊戲檔案裡的設定」與「資料庫腳本」真的對得起來，不是測試自己抄的一份。
const mem = new Map();
globalThis.window = globalThis;
const GAME_LIST = require(path.join(HERE, 'all_games.cjs')).loadAllGames();
const GAMES = Object.fromEntries(GAME_LIST.map(g => [g.id, g]));
globalThis.UI = { h: () => ({}), wait: () => Promise.resolve(), store: { get: (k, f) => (mem.has(k) ? JSON.parse(mem.get(k)) : f), set: (k, v) => mem.set(k, JSON.stringify(v)) } };
globalThis.Reaction.resultShowing = () => true;
require(ROOT + 'js/leaderboard.js');
const LB = globalThis.Leaderboard, T = LB.test;
ok(GAME_LIST.length === 50 && GAMES.speed && GAMES.spot, '載入 50 款遊戲：' + GAME_LIST.length);
const celebrated = [], toasts = [];
LB.ui = { askNickname: async () => '', celebrate: (i) => celebrated.push(i), toast: (t) => toasts.push(t) };

// 模擬「換一個人（另一支手機）」：換掉瀏覽器儲存與記憶體狀態
function asPlayer(n, nick) {
  mem.clear();
  mem.set(T.KEY_PID, JSON.stringify('00000000-0000-4000-8000-' + String(n).padStart(12, '0')));
  if (nick) mem.set(T.KEY_NICK, JSON.stringify(nick));
  T.state.boards = {}; T.state.inflight = {}; T.state.netDownUntil = 0; T.state.nickPromise = null; T.state.nickSkipped = false;
  httpLog = []; celebrated.length = 0; toasts.length = 0;
}
const sleepTick = () => new Promise(r => setTimeout(r, 3));      // 讓 now() 不同

// ═══ 1. 前 30 名滿榜、自己衝進榜、刷新自己 ═══
for (let i = 1; i <= 30; i++) { asPlayer(i, 'P' + i); await sleepTick(); await LB.submit('speed', i / 100); }
asPlayer(100, '挑戰者');
let b = await LB.load('speed');
ok(b && b.top.length === 30 && b.top[0].score === 0.01 && b.top[29].score === 0.3 && b.better === 'min' && b.limit === 30, '讀到 30 名榜單（欄位名稱與型別都對得上）');
ok(!JSON.stringify(b).includes('player'), '榜單裡沒有任何 player 相關欄位');
ok(httpLog.length === 1 && httpLog[0].body.p_game_id === 'speed' && httpLog[0].body.p_player_id === '00000000-0000-4000-8000-000000000100', '讀榜單的請求內容');
let r = await LB.submit('speed', 0.31);
ok(r.status === 'not-qualified' && httpLog.length === 1, '比第 30 名差：用戶端就擋掉，沒有送出任何請求');
r = await LB.submit('speed', 0.2950);
ok(r.status === 'saved' && r.rank === 30 && celebrated.length === 1 && celebrated[0].rank === 30, '勝過第 30 名：進榜，名次 30，觸發慶祝');
ok(httpLog.filter(h => h.name === 'MF_submit_score').length === 1, '只送出 1 次寫入請求（回應內附最新榜單，不用再多讀一次）');
b = T.state.boards.speed;
ok(b.top.length === 30 && b.top[29].score === 0.295 && b.top[29].mine === true && !b.top.some(x => x.nick === 'P30'), '回應附的榜單：我在第 30 名，原本的第 30 名被擠出');
// 刷新自己：0.005 → 第 1 名；再送更差的就不送
celebrated.length = 0; httpLog = [];
r = await LB.submit('speed', 0.005);
ok(r.status === 'saved' && r.rank === 1 && celebrated[0].rank === 1, '刷新自己衝到第 1 名');
r = await LB.submit('speed', 0.5);
ok(r.status === 'not-qualified', '之後比自己差的成績：不送');
r = await LB.submit('speed', 0.005);
ok(r.status === 'not-qualified', '同分也不送（不算進步）');

// ═══ 2. 換一個人：看得到 mine 標記、改暱稱會同步到所有列 ═══
asPlayer(100, '挑戰者');
b = await LB.load('speed', { force: true });
ok(b.top[0].mine === true && b.top[0].nick === '挑戰者' && b.top.filter(x => x.mine).length === 1, '我自己那一列 mine=true，只有一列');
asPlayer(7, 'P7');
b = await LB.load('speed', { force: true });
ok(b.top.find(x => x.nick === 'P7').mine === true && !b.top[0].mine, '另一位玩家看到的 mine 在他自己那一列');
asPlayer(100, '挑戰者');
await LB.submit('spot', 12);
const n0 = httpLog.length;
LB.setNick('挑戰者二號');
await new Promise(r => setTimeout(r, 50));
ok(httpLog.slice(n0).some(h => h.name === 'MF_rename_player'), '改暱稱會呼叫 MF_rename_player');
b = await LB.load('speed', { force: true });
const b2 = await LB.load('spot', { force: true });
ok(b.top[0].nick === '挑戰者二號' && b2.top[0].nick === '挑戰者二號', '兩款遊戲上的暱稱都改了');

// ═══ 3. 整數型（越大越好）：同分先到先贏 ═══
for (let i = 1; i <= 29; i++) { asPlayer(200 + i, 'S' + i); await sleepTick(); await LB.submit('spot', 30 - i + 1); }   // 30 ... 2（挑戰者二號已有 12）
asPlayer(300, '新手');
b = await LB.load('spot', { force: true });
ok(b.top.length === 30 && b.better === 'max', 'spot 榜單滿 30（含挑戰者二號）：' + b.top.length);
const last = b.top[29];
r = await LB.submit('spot', last.score);
ok(r.status === 'not-qualified', 'spot：與第 30 名同分，進不了榜');
r = await LB.submit('spot', last.score + 1);
ok(r.status === 'saved', 'spot：比第 30 名多 1 關，進榜');

// ═══ 4. 資料庫拒絕 ═══
asPlayer(400, '壞人');
httpLog = [];
const bad1 = await T.rpc('MF_submit_score', { p_game_id: 'speed', p_player_id: '00000000-0000-4000-8000-000000000400', p_nickname: 'x', p_score: 9999 }, 5000);
ok(bad1.ok && bad1.data.ok === false && bad1.data.error === 'out_of_range', '亂填超出範圍的分數 → out_of_range');
const bad2 = await T.rpc('MF_submit_score', { p_game_id: 'speed', p_player_id: '00000000-0000-4000-8000-000000000400', p_nickname: 'x', p_extra: 1, p_score: 1 }, 5000);
ok(!bad2.ok && bad2.error === 'http_404', '多帶不認識的參數 → 404（跟 PostgREST 一樣）');

// ═══ 5. 全部 50 款遊戲：用戶端設定 ↔ 資料庫設定，真的走一遍 ═══
// 對每一款遊戲：
//   · 讀榜單：資料庫認得這個 game_id，better 與遊戲檔案一致；
//   · 兩位玩家分別送「最好端」與「最差端」的合法成績（min／max 兩個端點），名次方向要對（越小越好／越大越好）；
//   · 範圍外一點點（min－0.0001／max＋0.0001）資料庫要拒絕 out_of_range，證明兩邊的範圍完全相同；
//   · 資料庫裡存的 score 與送出的數字完全一致（4 位小數、沒有被四捨五入掉）。
const realLog = console.log; console.log = () => { };       // 模組自己的訊息很多，這一段先靜音
let idx = 0, checkedGames = 0;
const rowsOf = async (id) => (await db.query('select score::float8 as score, rank_key::float8 as rank_key, nickname from public."MF_scores" where game_id = $1 order by rank_key, achieved_at, id', [id])).rows;
const meta = (await db.query('select game_id, better, min_score::float8 as lo, max_score::float8 as hi, top_n from public."MF_games"')).rows;
const metaOf = Object.fromEntries(meta.map(m => [m.game_id, m]));
for (const g of GAME_LIST) {
  const s = g.score, id = g.id; idx++;
  if (id === 'speed' || id === 'spot') continue;               // 這兩款前面已經灌過 30 筆資料，另外測過
  const pidOf = (k) => '00000000-0000-4000-8000-' + String(5000 + idx * 10 + k).padStart(12, '0');
  const m = metaOf[id];
  ok(!!m && m.better === s.better && m.lo === s.min && m.hi === s.max && m.top_n === 30, id + ' 資料庫的 MF_games 設定與遊戲檔案一致：' + JSON.stringify(m));
  asPlayer(5000 + idx * 10, '甲' + idx);
  const b0 = await LB.load(id, { force: true });
  ok(b0 && b0.better === s.better && b0.limit === 30 && b0.top.length === 0, id + ' 讀得到空榜單，better 一致：' + JSON.stringify(b0));
  const best = s.better === 'min' ? s.min : s.max, worst = s.better === 'min' ? s.max : s.min;
  // 甲：先送最差端的合法成績；乙：再送最好端 → 乙第 1 名、甲第 2 名
  let rr = await LB.submit(id, worst);
  ok(rr.status === 'saved' && rr.rank === 1, id + ' 甲送最差端 ' + worst + ' → 空榜單第 1 名：' + JSON.stringify(rr));
  asPlayer(5000 + idx * 10 + 1, '乙' + idx);
  rr = await LB.submit(id, best);
  ok(rr.status === 'saved' && rr.rank === 1, id + ' 乙送最好端 ' + best + ' → 第 1 名：' + JSON.stringify(rr));
  const rows = await rowsOf(id);
  ok(rows.length === 2 && rows[0].nickname === '乙' + idx && rows[0].score === best && rows[1].score === worst, id + ' 資料庫排序方向正確（' + s.better + '）：' + JSON.stringify(rows));
  ok(rows.length === 2 && rows[0].rank_key === (s.better === 'min' ? best : -best), id + ' rank_key 的正負號正確');
  // 範圍外「剛好一點點」：資料庫拒絕
  for (const v of [Math.round((s.min - 0.0001) * 10000) / 10000, Math.round((s.max + 0.0001) * 10000) / 10000]) {
    const rj = await T.rpc('MF_submit_score', { p_game_id: id, p_player_id: pidOf(7), p_nickname: '壞', p_score: v }, 5000);
    ok(rj.ok && rj.data.ok === false && rj.data.error === 'out_of_range', id + ' 範圍外 ' + v + ' → out_of_range：' + JSON.stringify(rj));
  }
  // 範圍內的一般成績（4 位小數）原樣存進去；用另一位玩家、比乙差比甲好
  const mid = s.decimals === 0 ? Math.round((s.min + s.max) / 2) : Math.round(((s.min + s.max) / 2 + 0.0037) * 10000) / 10000;
  if (mid !== best && mid !== worst) {
    asPlayer(5000 + idx * 10 + 2, '丙' + idx);
    rr = await LB.submit(id, mid);
    const rows2 = await rowsOf(id);
    ok(rr.status === 'saved' && rr.rank === 2 && rows2.length === 3 && rows2[1].score === mid, id + ' 中間值 ' + mid + ' 原樣存入、名次 2：' + JSON.stringify(rows2.map(x => x.score)));
  }
  checkedGames++;
}
console.log = realLog;
const per = (await db.query('select game_id, count(*)::int as n from public."MF_scores" group by game_id')).rows;
ok(per.every(p => p.n <= 30), '每款遊戲最多 30 列');
console.log('全部遊戲：' + checkedGames + ' 款（另外 speed／spot 在前面幾段測過）用戶端設定與資料庫逐一對過，排名方向、範圍邊界、4 位小數都正確');

console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS（' + total + ' 項檢查）');
process.exit(bad ? 1 : 0);
