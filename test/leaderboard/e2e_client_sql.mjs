// 整合測試：「真正的用戶端程式 js/leaderboard.js、js/identity.js、js/rating.js」↔「真正的資料庫腳本 supabase/MF_leaderboard.sql」
// 做法：在 PGlite（真正的 PostgreSQL，含 pgcrypto）裡執行 SQL，再把 fetch 換成「假的 Supabase 閘道」——
// 收到 POST /rest/v1/rpc/<函式> 就用 anon 角色呼叫對應的資料庫函式，回傳 JSON（PostgREST 就是這麼做的）。
// 這樣能抓到「用戶端送的欄位名稱／型別跟資料庫函式對不起來」這類兩邊各自測試都測不到的問題。
// V1.35.0（玩家身分）新增：新玩家進榜時建立帳號、舊玩家認領、同暱稱同密碼併入同一個帳號、多台裝置同步個人最佳、
// 改暱稱／改密碼把其他裝置登出、登出清乾淨、意見與評價（匿名／帳號）、舊版網頁的呼叫方式（p_nickname）被拒絕。
// 執行：先在這個資料夾 npm install，再 node e2e_client_sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
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
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec('create role anon nologin; create role authenticated nologin;');
await db.exec(fs.readFileSync(ROOT + 'supabase/MF_leaderboard.sql', 'utf8'));

// 函式參數型別表（PostgREST 會依資料庫裡的函式定義轉型，這裡手動對照）。OPT：有預設值、可以不送的參數
const SIG = {
  MF_get_top: [['p_game_id', 'text'], ['p_player_id', 'uuid']],
  MF_check_nick: [['p_nick', 'text'], ['p_legacy_pid', 'uuid']],
  MF_legacy_status: [['p_player_id', 'uuid']],
  MF_register: [['p_nick', 'text'], ['p_pin', 'text'], ['p_game_id', 'text'], ['p_score', 'numeric']],
  MF_claim_legacy: [['p_legacy_pid', 'uuid'], ['p_nick', 'text'], ['p_pin', 'text']],
  MF_login: [['p_nick', 'text'], ['p_pin', 'text'], ['p_legacy_pid', 'uuid']],
  MF_login_and_merge: [['p_player_id', 'uuid'], ['p_token', 'text'], ['p_nick', 'text'], ['p_pin', 'text']],
  MF_submit_score: [['p_game_id', 'text'], ['p_player_id', 'uuid'], ['p_token', 'text'], ['p_score', 'numeric']],
  MF_rename: [['p_player_id', 'uuid'], ['p_token', 'text'], ['p_nick', 'text']],
  MF_change_pin: [['p_player_id', 'uuid'], ['p_token', 'text'], ['p_new_pin', 'text']],
  MF_logout: [['p_player_id', 'uuid'], ['p_token', 'text']],
  MF_whoami: [['p_player_id', 'uuid'], ['p_token', 'text']],
  MF_sync_bests: [['p_player_id', 'uuid'], ['p_token', 'text'], ['p_items', 'jsonb']],
  MF_submit_feedback: [['p_game_id', 'text'], ['p_player_id', 'uuid'], ['p_message', 'text'], ['p_token', 'text'], ['p_version', 'text']],
  MF_submit_rating: [['p_game_id', 'text'], ['p_player_id', 'uuid'], ['p_stars', 'int'], ['p_token', 'text']],
  MF_get_ratings: [],
  MF_get_overtaken: [['p_player_id', 'uuid']]
};
const OPT = { MF_get_top: ['p_player_id'], MF_check_nick: ['p_legacy_pid'], MF_login: ['p_legacy_pid'], MF_sync_bests: ['p_items'], MF_submit_feedback: ['p_token', 'p_version'], MF_submit_rating: ['p_token'] };
let httpLog = [];
globalThis.fetch = async (url, opt) => {
  const name = String(url).split('/rest/v1/rpc/')[1];
  const body = JSON.parse(opt.body);
  httpLog.push({ name, body, headers: opt.headers });
  const sig = SIG[name];
  if (!sig) return { ok: false, status: 404, json: async () => ({ code: 'PGRST202' }) };
  // PostgREST：JSON 的 key 必須對應函式的參數名稱；多送不認識的、或少送沒有預設值的，都回 404（找不到函式）
  const names = sig.map(x => x[0]), opts = OPT[name] || [];
  const unknown = Object.keys(body).filter(k => !names.includes(k)), missing = names.filter(k => !opts.includes(k) && !(k in body));
  if (unknown.length || missing.length) return { ok: false, status: 404, json: async () => ({ code: 'PGRST202', message: '參數對不上：多 ' + unknown + ' 少 ' + missing }) };
  const keys = names.filter(k => k in body);
  const args = keys.map((k, i) => k + ' => $' + (i + 1) + '::' + sig.find(x => x[0] === k)[1]);
  await db.exec('set role anon');
  try {
    const r = await db.query('select public."' + name + '"(' + args.join(', ') + ') as r', keys.map(k => (typeof body[k] === 'object' && body[k] !== null) ? JSON.stringify(body[k]) : body[k]));
    return { ok: true, status: 200, json: async () => r.rows[0].r };
  } catch (e) {
    return { ok: false, status: 400, json: async () => ({ message: String(e.message) }) };
  } finally { await db.exec('reset role'); }
};

// ─── 載入真正的用戶端程式與「全部 160 款真正的遊戲檔案」（用假的 UI 環境）───
// 遊戲檔案由 all_games.cjs 載入（依 js/boot.js 的清單），拿到的是各遊戲 register 時登記的真實 score 設定，
// 所以這個測試驗證的是「遊戲檔案裡的設定」與「資料庫腳本」真的對得起來，不是測試自己抄的一份。
// 瀏覽器儲存：ls 是真的物件（要能列出所有 key，identity.js 掃描個人最佳用）；mem 是跟舊測試相容的 Map 外觀
const ls = {};
['getItem', 'setItem', 'removeItem'].forEach((n) => Object.defineProperty(ls, n, { enumerable: false, value: n === 'getItem' ? (k) => (k in ls ? ls[k] : null) : n === 'setItem' ? (k, v) => { ls[k] = String(v); } : (k) => { delete ls[k]; } }));
const mem = { clear: () => Object.keys(ls).forEach(k => delete ls[k]), set: (k, v) => { ls[k] = v; }, get: (k) => ls[k], has: (k) => k in ls, delete: (k) => { delete ls[k]; } };
globalThis.window = globalThis;
globalThis.localStorage = ls;
const GAME_LIST = require(path.join(HERE, 'all_games.cjs')).loadAllGames();
const GAMES = Object.fromEntries(GAME_LIST.map(g => [g.id, g]));
globalThis.UI = { h: () => ({}), wait: () => Promise.resolve(), store: { get: (k, f) => (k in ls ? JSON.parse(ls[k]) : f), set: (k, v) => { ls[k] = JSON.stringify(v); }, remove: (k) => { delete ls[k]; } } };
globalThis.Reaction.resultShowing = () => true;
require(ROOT + 'js/leaderboard.js');
require(ROOT + 'js/identity.js');
const LB = globalThis.Leaderboard, T = LB.test, ID = globalThis.Identity;
ID.CFG.BEST_DEBOUNCE_MS = 20;
ok(GAME_LIST.length === 160 && GAMES.speed && GAMES.spot, '載入 160 款遊戲：' + GAME_LIST.length);
const celebrated = [], toasts = [];
LB.ui = { celebrate: (i) => celebrated.push(i), toast: (t) => toasts.push(t) };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 模擬「換一個人（另一支手機）」：直接在資料庫替他建好帳號與憑證（身分流程本身在後面各段用真正的函式測），
// 瀏覽器端存成「已登入」的樣子。
const uuidOf = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
function resetBrowser() {
  mem.clear();
  T.state.boards = {}; T.state.inflight = {}; T.state.netDownUntil = 0; T.state.gate = null; T.state.overtakeP = null;
  httpLog = []; celebrated.length = 0; toasts.length = 0;
}
async function asPlayer(n, nick) {
  resetBrowser();
  if (!nick) return;                                                    // 沒有暱稱＝訪客
  const pid = uuidOf(n);
  await db.query(`insert into public."MF_players"(player_id, nickname, nick_key, claimed, pin_hash) values ($1::uuid, public."MF__clean_nick"($2), public."MF__nick_key"($2), true, 'x') on conflict (player_id) do nothing`, [pid, nick]);
  await db.query('insert into public."MF_sessions"(token_hash, player_id) values (public."MF__token_hash"($1), $2::uuid) on conflict do nothing', ['tok-e2e-' + n, pid]);
  LB.setSession({ player_id: pid, token: 'tok-e2e-' + n, nick });
}
const sleepTick = () => new Promise(r => setTimeout(r, 3));      // 讓 now() 不同

// ═══ 1. 前 30 名滿榜、自己衝進榜、刷新自己 ═══
for (let i = 1; i <= 30; i++) { await asPlayer(i, 'P' + i); await sleepTick(); await LB.submit('speed', i / 100); }
await asPlayer(100, '挑戰者');
let b = await LB.load('speed');
ok(b && b.top.length === 30 && b.top[0].score === 0.01 && b.top[29].score === 0.3 && b.better === 'min' && b.limit === 30, '讀到 30 名榜單（欄位名稱與型別都對得上）');
ok(!JSON.stringify(b).includes('player'), '榜單裡沒有任何 player 相關欄位');
ok(httpLog.length === 1 && httpLog[0].body.p_game_id === 'speed' && httpLog[0].body.p_player_id === uuidOf(100), '讀榜單的請求內容');
let r = await LB.submit('speed', 0.31);
ok(r.status === 'not-qualified' && httpLog.length === 1, '比第 30 名差：用戶端就擋掉，沒有送出任何請求');
r = await LB.submit('speed', 0.2950);
ok(r.status === 'saved' && r.rank === 30 && celebrated.length === 1 && celebrated[0].rank === 30, '勝過第 30 名：進榜，名次 30，觸發慶祝');
ok(httpLog.filter(h => h.name === 'MF_submit_score').length === 1, '只送出 1 次寫入請求（回應內附最新榜單，不用再多讀一次）');
ok(httpLog.find(h => h.name === 'MF_submit_score').body.p_token === 'tok-e2e-100', '寫入帶的是裝置憑證');
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

// ═══ 2. 換一個人：看得到 mine 標記、改暱稱同步到所有列 ═══
await asPlayer(100, '挑戰者');
b = await LB.load('speed', { force: true });
ok(b.top[0].mine === true && b.top[0].nick === '挑戰者' && b.top.filter(x => x.mine).length === 1, '我自己那一列 mine=true，只有一列');
await asPlayer(7, 'P7');
b = await LB.load('speed', { force: true });
ok(b.top.find(x => x.nick === 'P7').mine === true && !b.top[0].mine, '另一位玩家看到的 mine 在他自己那一列');
await asPlayer(100, '挑戰者');
await LB.submit('spot', 12);
let rn = await ID.rename('挑戰者二號');
ok(rn.ok && rn.data.nick === '挑戰者二號' && rn.data.left === 1 && LB.getNick() === '挑戰者二號', '改暱稱：真的資料庫收了，本機暱稱快取更新，今天還能再改 1 次');
b = await LB.load('speed', { force: true });
const b2 = await LB.load('spot', { force: true });
ok(b.top[0].nick === '挑戰者二號' && b2.top[0].nick === '挑戰者二號', '兩款遊戲上的暱稱都改了（暱稱只存玩家表）');
rn = await ID.rename('P7');
ok(!rn.ok && rn.error === 'nick_taken' && /^P7\d{3}$/.test(rn.data.suggestion), '改暱稱：別人用了 → nick_taken＋建議暱稱：' + JSON.stringify(rn.data));
await ID.rename('挑戰者三號');
rn = await ID.rename('挑戰者四號');
ok(!rn.ok && rn.error === 'rename_too_many', '改暱稱：一天只能改 2 次：' + JSON.stringify(rn));

// ═══ 3. 整數型（越大越好）：同分先到先贏 ═══
for (let i = 1; i <= 29; i++) { await asPlayer(200 + i, 'S' + i); await sleepTick(); await LB.submit('spot', 30 - i + 1); }   // 30 ... 2（挑戰者已有 12）
await asPlayer(300, '新手');
b = await LB.load('spot', { force: true });
ok(b.top.length === 30 && b.better === 'max', 'spot 榜單滿 30（含挑戰者）：' + b.top.length);
const last = b.top[29];
r = await LB.submit('spot', last.score);
ok(r.status === 'not-qualified', 'spot：與第 30 名同分，進不了榜');
r = await LB.submit('spot', last.score + 1);
ok(r.status === 'saved', 'spot：比第 30 名多 1 關，進榜');

// ═══ 4. 資料庫拒絕、舊版網頁的呼叫方式 ═══
await asPlayer(400, '壞人');
httpLog = [];
const me = () => ({ p_player_id: LB.peekPid(), p_token: LB.token() });
const bad1 = await T.rpc('MF_submit_score', { p_game_id: 'speed', ...me(), p_score: 9999 }, 5000);
ok(bad1.ok && bad1.data.ok === false && bad1.data.error === 'out_of_range', '亂填超出範圍的分數 → out_of_range');
const bad2 = await T.rpc('MF_submit_score', { p_game_id: 'speed', ...me(), p_extra: 1, p_score: 1 }, 5000);
ok(!bad2.ok && bad2.error === 'http_404', '多帶不認識的參數 → 404（跟 PostgREST 一樣）');
const old1 = await T.rpc('MF_submit_score', { p_game_id: 'speed', p_player_id: LB.peekPid(), p_nickname: 'x', p_score: 0.001 }, 5000);
ok(!old1.ok && old1.error === 'http_404', '舊版網頁的寫法（只帶 player_id＋p_nickname、沒有憑證）→ 404 找不到函式：沒有後門');
const old2 = await T.rpc('MF_rename_player', { p_player_id: LB.peekPid(), p_nickname: 'x' }, 5000);
ok(!old2.ok && old2.error === 'http_404', '舊版的改暱稱函式已經不存在');
const nt = await T.rpc('MF_submit_score', { p_game_id: 'speed', p_player_id: LB.peekPid(), p_token: 'wrong', p_score: 0.001 }, 5000);
ok(nt.ok && nt.data.ok === false && nt.data.error === 'bad_token', '亂填憑證 → bad_token');

// ═══ 5. 全部 160 款遊戲：用戶端設定 ↔ 資料庫設定，真的走一遍 ═══
// 對每一款遊戲：
//   · 讀榜單：資料庫認得這個 game_id，better 與遊戲檔案一致；
//   · 兩位玩家分別送「最好端」與「最差端」的合法成績（min／max 兩個端點），名次方向要對（越小越好／越大越好）；
//   · 範圍外一點點（min－0.0001／max＋0.0001）資料庫要拒絕 out_of_range，證明兩邊的範圍完全相同；
//   · 資料庫裡存的 score 與送出的數字完全一致（4 位小數、沒有被四捨五入掉）。
const realLog = console.log; console.log = () => { };       // 模組自己的訊息很多，這一段先靜音
let idx = 0, checkedGames = 0;
const rowsOf = async (id) => (await db.query('select s.score::float8 as score, s.rank_key::float8 as rank_key, p.nickname from public."MF_scores" s join public."MF_players" p using (player_id) where s.game_id = $1 order by s.rank_key, s.achieved_at, s.id', [id])).rows;
const meta = (await db.query('select game_id, better, min_score::float8 as lo, max_score::float8 as hi, top_n from public."MF_games"')).rows;
const metaOf = Object.fromEntries(meta.map(m => [m.game_id, m]));
for (const g of GAME_LIST) {
  const s = g.score, id = g.id; idx++;
  if (id === 'speed' || id === 'spot') continue;               // 這兩款前面已經灌過 30 筆資料，另外測過
  const m = metaOf[id];
  ok(!!m && m.better === s.better && m.lo === s.min && m.hi === s.max && m.top_n === 30, id + ' 資料庫的 MF_games 設定與遊戲檔案一致：' + JSON.stringify(m));
  await asPlayer(5000 + idx * 10, '甲' + idx);
  const b0 = await LB.load(id, { force: true });
  ok(b0 && b0.better === s.better && b0.limit === 30 && b0.top.length === 0, id + ' 讀得到空榜單，better 一致：' + JSON.stringify(b0));
  const best = s.better === 'min' ? s.min : s.max, worst = s.better === 'min' ? s.max : s.min;
  // 甲：先送最差端的合法成績；乙：再送最好端 → 乙第 1 名、甲第 2 名
  let rr = await LB.submit(id, worst);
  ok(rr.status === 'saved' && rr.rank === 1, id + ' 甲送最差端 ' + worst + ' → 空榜單第 1 名：' + JSON.stringify(rr));
  await asPlayer(5000 + idx * 10 + 1, '乙' + idx);
  rr = await LB.submit(id, best);
  ok(rr.status === 'saved' && rr.rank === 1, id + ' 乙送最好端 ' + best + ' → 第 1 名：' + JSON.stringify(rr));
  const rows = await rowsOf(id);
  ok(rows.length === 2 && rows[0].nickname === '乙' + idx && rows[0].score === best && rows[1].score === worst, id + ' 資料庫排序方向正確（' + s.better + '）：' + JSON.stringify(rows));
  ok(rows.length === 2 && rows[0].rank_key === (s.better === 'min' ? best : -best), id + ' rank_key 的正負號正確');
  // 範圍外「剛好一點點」：資料庫拒絕
  for (const v of [Math.round((s.min - 0.0001) * 10000) / 10000, Math.round((s.max + 0.0001) * 10000) / 10000]) {
    const rj = await T.rpc('MF_submit_score', { p_game_id: id, ...me(), p_score: v }, 5000);
    ok(rj.ok && rj.data.ok === false && rj.data.error === 'out_of_range', id + ' 範圍外 ' + v + ' → out_of_range：' + JSON.stringify(rj));
  }
  // 範圍內的一般成績（4 位小數）原樣存進去；用另一位玩家、比乙差比甲好
  const mid = s.decimals === 0 ? Math.round((s.min + s.max) / 2) : Math.round(((s.min + s.max) / 2 + 0.0037) * 10000) / 10000;
  if (mid !== best && mid !== worst) {
    await asPlayer(5000 + idx * 10 + 2, '丙' + idx);
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

// ═══ 6. 玩家身分（V1.35.0）：真正的 identity.js ↔ 真正的 SQL；彈窗用「照劇本操作」的替身 ═══
// 前面幾段用 asPlayer 在 1 小時內直接建了幾百個測試帳號：先把它們的建立時間挪到 2 小時以前，不然「全站每小時最多建 60 個新帳號」的保險絲會擋住 MF_register
await db.exec(`update public."MF_players" set created_at = now() - interval '2 hours'`);
// 替身彈窗：不畫畫面，照 script 操作真正的 Identity 函式（就像玩家在彈窗裡輸入、按按鈕），結果的格式跟 identity_ui.js 一樣
console.log = () => { };
const asked = [];
let script = null;
ID.ui = {
  async accountDialog(cfg) {
    asked.push(cfg);
    const sc = script(cfg);
    // sc：[{ nick, pin, action: 'register'|'claim'|'login' }, …] 依序嘗試（前面失敗再試下一個），或 { cancel: true }
    if (sc.cancel) return { kind: 'cancel' };
    let last = null;
    for (const t of sc.tries) {
      const res = t.action === 'register' ? await ID.register(t.nick, t.pin, cfg.game.id, cfg.score) : t.action === 'claim' ? await ID.claim(t.nick, t.pin) : await ID.login(t.nick, t.pin);
      last = { t, res };
      if (res.ok) {
        await ID.finishSession(res.data, { skipFlush: !!cfg.skipFlush });
        return t.action === 'register' ? { kind: 'registered', data: res.data } : { kind: 'logged-in' };
      }
      if (res.error === 'not_qualified') return { kind: 'not-qualified' };
    }
    sc.lastError = last && last.res;
    return { kind: 'cancel' };
  }
};
const countOf = async (sqlText, params) => Number((await db.query(sqlText, params)).rows[0].n);
const playerOf = async (nick) => (await db.query(`select * from public."MF_players" where nick_key = public."MF__nick_key"($1) and claimed`, [nick])).rows[0];
{
  // 6-1 新玩家：沒進榜完全不問；進榜才跳「建立暱稱與密碼」，兩樣一次填妥；按「先不要」之後下一次還會再問
  resetBrowser();
  const spd = GAMES.speed;
  await LB.load(spd);                                               // 訪客也看得到榜（speed 榜單目前是滿 30 名）
  asked.length = 0; httpLog = [];
  r = await LB.submit('speed', 0.9);
  ok(r.status === 'not-qualified' && asked.length === 0 && httpLog.length === 0, '新玩家：成績進不了前 30 名 → 完全不問、不連網');
  script = () => ({ cancel: true });
  r = await LB.submit('speed', 0.004);
  ok(asked.length === 1 && asked[0].mode === 'new' && asked[0].cancelable === true && r.status === 'skipped', '新玩家：進前 30 名 → 跳「建立暱稱與密碼」；按先不要 → skipped');
  ok(await countOf('select count(*)::int as n from public."MF_players" where nickname = $1', ['快樂阿嬤']) === 0, '先不要：資料庫什麼都沒建');
  r = await LB.submit('speed', 0.004);
  ok(asked.length === 2, '先不要之後，下一次又進前 30 名 → 再問一次');
  // 建立：暱稱＋密碼一次送出，成績一起寫入
  script = () => ({ tries: [{ action: 'register', nick: '快樂阿嬤', pin: '1234' }] });
  celebrated.length = 0; httpLog = [];
  r = await LB.submit('speed', 0.004);
  ok(r.status === 'saved' && r.rank === 1 && celebrated.length === 1, '新玩家：建立帳號成功＋成績進榜（第 1 名）＋慶祝：' + JSON.stringify(r));
  ok(LB.identityState() === 'in' && LB.getNick() === '快樂阿嬤' && /^[0-9a-f-]{36}$/.test(LB.peekPid()) && LB.token().length === 64, '新玩家：登入狀態、player_id 是資料庫發的 uuid、憑證 64 字元');
  const pl = await playerOf('快樂阿嬤');
  ok(pl && pl.player_id === LB.peekPid() && /^\$2/.test(pl.pin_hash), '新玩家：資料庫有這位玩家，player_id 跟瀏覽器存的一樣，密碼是雜湊');
  ok(httpLog.filter(h => h.name === 'MF_register').length === 1 && httpLog.find(h => h.name === 'MF_register').body.p_score === 0.004 && httpLog.filter(h => h.name === 'MF_submit_score').length === 0, '新玩家：用 MF_register 一次完成，沒有另外送 MF_submit_score');
  const myBoard = await LB.load(spd, { force: true });
  ok(myBoard.top[0].nick === '快樂阿嬤' && myBoard.top[0].mine === true && myBoard.top[0].score === 0.004, '新玩家：榜上第 1 名是他，暱稱來自玩家表');
  asked.length = 0; r = await LB.submit('speed', 0.003);
  ok(asked.length === 0 && r.status === 'saved', '建立之後：不再跳任何帳號彈窗，直接用憑證送成績');

  // 6-2 暱稱撞名：另一位新玩家想用「快樂阿嬤」→ 被擋、附建議；他可以「我就是本人，登入」，也可以換名字
  const phoneA = { pid: LB.peekPid(), token: LB.token() };
  resetBrowser(); await LB.load(spd, { force: true }); asked.length = 0;
  const attempts = [];
  script = () => ({ tries: [{ action: 'register', nick: '快樂阿嬤', pin: '7777' }, { action: 'register', nick: '快樂阿嬤2', pin: '7777' }] });
  r = await LB.submit('speed', 0.0035);
  ok(r.status === 'saved' && LB.getNick() === '快樂阿嬤2', '新玩家撞名：第一次 nick_taken、換個名字再試成功');
  const lastCall = httpLog.filter(h => h.name === 'MF_register');
  ok(lastCall.length === 2, '新玩家撞名：連了兩次 MF_register');
  // 6-3 第二台裝置登入同一個帳號：輸入同暱稱＋密碼；密碼錯誤不能登入、限速
  resetBrowser(); await LB.load(spd, { force: true });
  ID.ui.accountDialog = ID.ui.accountDialog;      // 沿用
  let lg = await ID.login('快樂阿嬤', '0000');
  ok(!lg.ok && lg.error === 'wrong_pin' && lg.data.attempts_left === 4, '第二台登入：密碼錯 → wrong_pin（還剩 4 次）');
  for (let i = 0; i < 3; i++) await ID.login('快樂阿嬤', '0000');
  lg = await ID.login('快樂阿嬤', '0000');
  ok(!lg.ok && lg.error === 'locked' && lg.data.wait_seconds === 600 && /10 分鐘/.test(ID.errorText(lg.error, lg.data)), '第二台登入：連錯 5 次 → locked 600 秒（畫面說「請 10 分鐘後再試」）');
  lg = await ID.login('快樂阿嬤', '1234');
  ok(!lg.ok && lg.error === 'locked', '鎖定期間打對密碼也不行');
  await db.query(`update public."MF_players" set locked_until = null, fail_count = 0, lock_level = 0, last_fail_at = null where nick_key = '快樂阿嬤'`);
  lg = await ID.login('快樂阿嬤', '1234');
  ok(lg.ok && lg.data.player_id === phoneA.pid && lg.data.token !== phoneA.token, '第二台登入：密碼對 → 同一個 player_id、另一把新憑證');
  await ID.finishSession(lg.data);
  ok(LB.identityState() === 'in' && LB.getNick() === '快樂阿嬤', '第二台登入：登入狀態');
  const bA = await LB.load(spd, { force: true });
  ok(bA.top.find(x => x.mine) && bA.top.find(x => x.mine).score === 0.003, '第二台看得到自己（mine）的成績 0.003（同一個帳號）');

  // 6-4 個人最佳同步：A 台破紀錄 → 資料庫 → 第二台登入就帶得走
  const phoneB = { pid: LB.peekPid(), token: LB.token() };
  await asPlayer(9300, null);
  LB.setSession({ player_id: phoneA.pid, token: phoneA.token, nick: '快樂阿嬤' });
  Reaction.setBest('speed', 0.0031, (a, c) => a < c); Reaction.setBest('cake', 17, (a, c) => a > c);
  Reaction.kit.noteLevel('cake', 21);
  await sleep(80);
  const bests = (await db.query(`select game_id, best_score::float8 as s, best_level as lv from public."MF_player_bests" where player_id = $1::uuid order by game_id`, [phoneA.pid])).rows;
  ok(bests.some(x => x.game_id === 'speed' && x.s === 0.0031) && bests.some(x => x.game_id === 'cake' && x.s === 17 && x.lv === 21), '個人最佳：A 台破紀錄後自動上傳（speed 成績、cake 成績與最佳關卡）：' + JSON.stringify(bests));
  resetBrowser();
  lg = await ID.login('快樂阿嬤', '1234'); await ID.finishSession(lg.data);
  ok(ls['fm.reaction.best.speed'] === '0.0031' && ls['fm.reaction.best.cake'] === '17' && ls['fm.reaction.lvbest.cake'] === '21' && ls['fm.reaction.best.cake.sync'] === 'true', '個人最佳：換手機登入 → 最佳成績與最佳關卡帶回來了（cake 最佳關卡 21 → 下次從第 17 關開始）');
  ok(Reaction.kit.entryLevel('cake', 0) === 21 - Reaction.kit.ENTRY_BACK, '個人最佳：kit.entryLevel 讀到同步來的最佳關卡 → 進場關卡 ' + Reaction.kit.entryLevel('cake', 0));
  // 登出清乾淨
  const tokenB = LB.token();
  await ID.logout();
  ok(LB.identityState() === 'guest' && !('fm.reaction.best.speed' in ls) && !('fm.reaction.lvbest.cake' in ls), '登出：回到訪客，本機個人最佳清掉（都存在帳號裡）');
  ok(await countOf('select count(*)::int as n from public."MF_sessions" where token_hash = public."MF__token_hash"($1)', [tokenB]) === 0, '登出：資料庫端這把憑證也刪了');
  ok((await ID.login('快樂阿嬤', '1234')).ok, '登出之後可以再登入');

  // 6-5 改密碼：其他裝置被登出（憑證失效→標記重新登入）
  resetBrowser(); lg = await ID.login('快樂阿嬤', '1234'); await ID.finishSession(lg.data);
  const deviceX = { pid: LB.peekPid(), token: LB.token() };
  resetBrowser(); lg = await ID.login('快樂阿嬤', '1234'); await ID.finishSession(lg.data);
  const cp = await ID.changePin('4321');
  ok(cp.ok, '改密碼：成功');
  resetBrowser(); LB.setSession({ player_id: deviceX.pid, token: deviceX.token, nick: '快樂阿嬤' });
  const wh = await ID.whoami();
  ok(!wh.ok && wh.error === 'bad_token' && LB.identityState() === 'relogin', '改密碼：另一台裝置的憑證失效 → whoami 發現、標記需要重新登入');
  ok((await ID.login('快樂阿嬤', '4321')).ok && !(await ID.login('快樂阿嬤', '1234')).ok, '改密碼：新密碼可登入、舊密碼失效');
  // 憑證失效時送成績：標記 relogin → 跳登入 → 登入成功後再送
  resetBrowser(); LB.setSession({ player_id: deviceX.pid, token: deviceX.token, nick: '快樂阿嬤' });
  await LB.load(spd, { force: true }); asked.length = 0; httpLog = [];
  script = () => ({ tries: [{ action: 'login', nick: '快樂阿嬤', pin: '4321' }] });
  r = await LB.submit('speed', 0.0001);
  ok(asked.length === 1 && asked[0].mode === 'login' && r.status === 'saved' && httpLog.filter(h => h.name === 'MF_submit_score').length === 2, '憑證失效：送成績時被發現 → 跳登入彈窗 → 登入後再送一次，成功：' + JSON.stringify(r));
  ok(LB.token() !== deviceX.token && LB.identityState() === 'in', '憑證失效：登入後換了新憑證');

  // 6-6 舊玩家認領（V1.34 的舊資料：榜上有成績、有舊暱稱、沒有密碼）
  const L1 = uuidOf(7001), L2 = uuidOf(7002), L3 = uuidOf(7003);
  for (const [pid, nick, score] of [[L1, '舊玩家甲', 7], [L2, '舊玩家甲', 9], [L3, '舊玩家丙', 3]]) {
    await db.query(`insert into public."MF_players"(player_id, nickname, nick_key, claimed, reserved_until, created_at) values ($1::uuid, $2, public."MF__nick_key"($2), false, now() + interval '60 days', now() - interval '30 days')`, [pid, nick]);
    await db.query(`insert into public."MF_scores"(game_id, player_id, score, rank_key) values ('zz_test', $1::uuid, $2::numeric, -($2::numeric))`, [pid, score]);
  }
  const legacyDevice = (pid, nick) => { resetBrowser(); ls['fm.lb.pid'] = JSON.stringify(pid); ls['fm.lb.nick'] = JSON.stringify(nick); };
  // 甲的第一台裝置：暱稱沒人用 → 直接建立；player_id 沿用舊代號、榜上成績照舊
  legacyDevice(L1, '舊玩家甲'); asked.length = 0;
  script = () => ({ tries: [{ action: 'claim', nick: '舊玩家甲', pin: '2468' }] });
  let res = await ID.ensureLegacy({});
  ok(res.kind === 'logged-in' && asked[0].mode === 'legacy' && asked[0].cancelable === false && asked[0].initialNick === '舊玩家甲', '舊玩家：跳認領彈窗（沒有關閉鈕、帶入暱稱）→ 建立成功');
  ok(LB.identityState() === 'in' && LB.peekPid() === L1 && (await playerOf('舊玩家甲')).player_id === L1, '舊玩家：player_id 沿用舊代號');
  ok((await rowsOf('zz_test')).some(x => x.nickname === '舊玩家甲' && x.score === 7), '舊玩家：榜上的成績照舊');
  // 甲的第二台裝置（另一個舊代號、同暱稱）：輸入同樣的暱稱＋密碼 → 併入第一台，成績取較好的（9 > 7）
  legacyDevice(L2, '舊玩家甲'); asked.length = 0;
  script = () => ({ tries: [{ action: 'claim', nick: '舊玩家甲', pin: '0000' }, { action: 'claim', nick: '舊玩家甲', pin: '2468' }] });
  res = await ID.ensureLegacy({});
  ok(res.kind === 'logged-in' && LB.peekPid() === L1, '舊玩家第二台：密碼打錯一次、再輸入同一組密碼 → 認定同一個人，改用第一台的 player_id');
  const zz = (await rowsOf('zz_test')).filter(x => x.nickname === '舊玩家甲');
  ok(zz.length === 1 && zz[0].score === 9, '舊玩家第二台：成績合併取較好的（9），榜上只有一列：' + JSON.stringify(zz));
  ok(await countOf('select count(*)::int as n from public."MF_players" where player_id = $1::uuid', [L2]) === 0, '舊玩家第二台：這台的舊代號已併入、刪除');
  // 舊玩家丙：沒登錄過的新暱稱可以自己改（暱稱欄改成別的名字）
  legacyDevice(L3, '舊玩家丙');
  script = () => ({ tries: [{ action: 'claim', nick: '丙丙丙', pin: '1357' }] });
  res = await ID.ensureLegacy({});
  ok(res.kind === 'logged-in' && LB.getNick() === '丙丙丙' && (await playerOf('丙丙丙')).player_id === L3, '舊玩家：認領時也可以改成別的暱稱');
  // 資料庫沒有的舊代號（早就掉出榜外）→ 當新玩家
  legacyDevice(uuidOf(7999), '路人');
  script = () => ({ cancel: true });
  res = await ID.ensureLegacy({});
  ok(res.kind === 'guest' && LB.identityState() === 'guest' && ID.nickHint() === '路人', '舊玩家：資料庫沒有這個代號 → 當新玩家，舊暱稱留作預設值');
  // 這個舊代號其實已經有帳號（憑證被清掉）→ 轉成重新登入
  resetBrowser(); ls['fm.lb.pid'] = JSON.stringify(L1); ls['fm.lb.nick'] = JSON.stringify('舊玩家甲');
  res = await ID.ensureLegacy({});
  ok(res.kind === 'relogin' && LB.identityState() === 'relogin', '舊玩家：這個代號已有帳號、只是沒憑證 → 轉成重新登入');

  // 6-7 後悔藥：誤建第二個帳號，合併回主帳號
  resetBrowser(); await LB.load(GAMES.cake, { force: true });
  script = () => ({ tries: [{ action: 'register', nick: '誤建帳號', pin: '5555' }] });
  r = await LB.submit('cake', 25);
  ok(r.status === 'saved' && LB.getNick() === '誤建帳號', '後悔藥：先誤建一個帳號（cake 成績 25）');
  const mg = await ID.loginAndMerge('快樂阿嬤', '4321');
  ok(mg.ok && mg.data.player_id === deviceX.pid, '後悔藥：憑證證明我是誤建的帳號、暱稱＋密碼證明我是主帳號 → 合併成功');
  await ID.finishSession(mg.data);
  ok(LB.getNick() === '快樂阿嬤' && !(await playerOf('誤建帳號')), '後悔藥：這支瀏覽器改用主帳號、誤建的暱稱釋出');
  ok((await rowsOf('cake')).some(x => x.nickname === '快樂阿嬤' && x.score === 25), '後悔藥：誤建帳號的 cake 成績併到主帳號');

  // 6-8 意見與評價：匿名照樣能送、登入的人暱稱由資料庫帶入、不能冒用帳號
  resetBrowser();
  let fb = await LB.sendFeedback('speed', '匿名的意見，沒有帳號');
  ok(fb.status === 'sent', '意見：訪客（匿名）可以送');
  ok((await db.query(`select nickname from public."MF_feedback" where message = '匿名的意見，沒有帳號'`)).rows[0].nickname === null, '意見：匿名的暱稱是空的');
  lg = await ID.login('快樂阿嬤', '4321'); await ID.finishSession(lg.data);
  fb = await LB.sendFeedback('speed', '登入後的意見，暱稱由資料庫帶入');
  ok(fb.status === 'sent' && (await db.query(`select nickname from public."MF_feedback" where message = '登入後的意見，暱稱由資料庫帶入'`)).rows[0].nickname === '快樂阿嬤', '意見：登入後送，暱稱由資料庫從帳號帶入');
  const impersonate = await T.rpc('MF_submit_feedback', { p_game_id: 'speed', p_player_id: LB.peekPid(), p_message: '冒用別人的帳號編號', p_token: null, p_version: null }, 5000);
  ok(impersonate.ok && impersonate.data.error === 'bad_token', '意見：沒帶憑證卻用帳號的 player_id → 被拒絕（防冒用）');
  require(ROOT + 'js/rating.js');
  const R = globalThis.Rating;
  let rr2 = await R.submit('speed', 5);
  ok(rr2.status === 'sent', '評價：登入後用帳號評價');
  await ID.logout();
  rr2 = await R.submit('cake', 4);
  ok(rr2.status === 'sent', '評價：訪客（匿名）也能評價');
  ID.CFG.BEST_DEBOUNCE_MS = 20;
}
console.log = realLog;

// ═══ 五星評價、阿嬤都比你厲害（V1.25.0）：真正的 js/rating.js／Leaderboard.overtaken ↔ 真正的 SQL ═══
{
  const R = globalThis.Rating;
  await asPlayer(9001, '評價甲');
  let r = await R.submit('speed', 4);
  ok(r.status === 'sent' && r.avg != null && R.ratedToday('speed'), '評價：第一筆送進資料庫：' + JSON.stringify(r));
  const cnt0 = r.cnt;
  r = await R.submit('speed', 1);
  ok(r.status === 'already' && r.cnt === cnt0, '評價：同一天第二次 → already（資料庫擋下）：' + JSON.stringify(r));
  await asPlayer(9002, '評價乙');
  r = await R.submit(GAMES.speed, 2);
  ok(r.status === 'sent' && r.cnt === cnt0 + 1, '評價：第二個人評價 → 次數 +1：' + JSON.stringify(r));
  ok((await R.submit('nope', 3)).status === 'rejected', '評價：沒登記的遊戲 → rejected');
  const st = await R.loadStats({ force: true });
  ok(st.speed && st.speed[1] === cnt0 + 1, '評價：讀回全部平均，speed 的次數正確：' + JSON.stringify(st.speed));
  ok(httpLog.every(x => x.name !== 'MF_get_ratings' || JSON.stringify(x.body) === '{}'), '評價：讀平均不帶任何參數');
  // 阿嬤：甲先上榜、乙後來超越 → 甲查得到「被超越、第 2 名」；甲搶回第一之後就沒有了
  const zzg = { id: 'zz_test', name: '測試', score: { better: 'max', decimals: 0, min: 0, max: 1000 } };
  await db.exec(`delete from public."MF_scores" where game_id = 'zz_test'`);
  await asPlayer(9101, '阿嬤甲'); await sleepTick(); await LB.submit(zzg, 100);
  await asPlayer(9102, '阿嬤乙'); await sleepTick(); await LB.submit(zzg, 200);
  await asPlayer(9101, '阿嬤甲');
  let ov = await LB.overtaken();
  ok(ov && ov.length === 1 && ov[0].game_id === 'zz_test' && ov[0].rank === 2 && typeof ov[0].at === 'string', '阿嬤：被超越 → 第 2 名、有時間：' + JSON.stringify(ov));
  ok(httpLog.some(x => x.name === 'MF_get_overtaken'), '阿嬤：真的呼叫了 MF_get_overtaken');
  // 丙最後才上榜、排第 3：前面兩個人都比他早創紀錄 → 不是第一名，但沒有被超越 → 不列出
  await asPlayer(9104, '阿嬤丙'); await sleepTick(); await LB.submit(zzg, 50);
  ok(JSON.stringify(await LB.overtaken()) === '[]', '阿嬤：第 3 名但沒有人在他之後超越他 → 不列出');
  await asPlayer(9101, '阿嬤甲');
  const sr = await LB.submit(zzg, 300);
  ok(sr.status === 'saved', '阿嬤：甲刷新成績搶回第一');
  ov = await LB.overtaken();
  ok(Array.isArray(ov) && ov.length === 0, '阿嬤：進榜後快取被清掉、重抓 → 沒有被超越的遊戲：' + JSON.stringify(ov));
  await asPlayer(9103, '');
  httpLog = [];
  ok(JSON.stringify(await LB.overtaken()) === '[]' && httpLog.length === 0, '阿嬤：訪客（還沒登入）完全不連網');
}

console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS（' + total + ' 項檢查）');
process.exit(bad ? 1 : 0);
