// 驗證「玩家身分」（V1.35.0）：supabase/MF_leaderboard.sql 的第 1B、2B、3 節與第 8 節。
// 在 PGlite（真正的 PostgreSQL，跑在 WASM，含 pgcrypto）裡執行整份 SQL，用「anon 角色」模擬網頁訪客呼叫函式。
//   一、舊版資料庫遷移：先跑舊版 SQL（test/leaderboard/old_schema_v134.sql）＋用舊函式塞「同暱稱的好幾位舊玩家」，再跑新 SQL
//   二、暱稱：清理、正規化、保留字、建議暱稱、狀態（free／taken／reserved／bad）
//   三、建立帳號（MF_register）、登入（MF_login）、密碼限速（5 次錯鎖 10 分鐘、再錯加倍、上限 24 小時）
//   四、舊玩家認領（A 暱稱可用／B 同暱稱同密碼併入既有帳號／保留中／重複暱稱自動改名）
//   五、裝置憑證（成績、改暱稱、改密碼、登出、10 台上限）、帳號合併、個人最佳同步
//   六、管理函式、權限（anon 碰不到資料表、內部函式、管理函式、舊函式已不存在）
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') + '/';
const sql = fs.readFileSync(ROOT + 'supabase/MF_leaderboard.sql', 'utf8');
const oldSql = fs.readFileSync(ROOT + 'test/leaderboard/old_schema_v134.sql', 'utf8');

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.fromEntries(Object.keys(x).sort().map(kk => [kk, x[kk]])) : x);
const eq = (a, b, m) => ok(canon(a) === canon(b), m + '  期望 ' + canon(b) + ' 實際 ' + canon(a));
const has = (o, sub, m) => ok(Object.keys(sub).every(k => canon(o && o[k]) === canon(sub[k])), m + '  期望包含 ' + canon(sub) + ' 實際 ' + canon(o));
const uuid = (i) => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');
const inv = (...cs) => String.fromCharCode(...cs);       // 看不見的字元用編碼組出來，檔案裡不放真的字元

// 函式的參數型別表（跟 PostgREST 一樣：用「參數名稱」呼叫，只送有給的欄位，沒給的用函式預設值）
const SIG = {
  MF_get_top: { p_game_id: 'text', p_player_id: 'uuid' },
  MF_check_nick: { p_nick: 'text', p_legacy_pid: 'uuid' },
  MF_legacy_status: { p_player_id: 'uuid' },
  MF_register: { p_nick: 'text', p_pin: 'text', p_game_id: 'text', p_score: 'numeric' },
  MF_claim_legacy: { p_legacy_pid: 'uuid', p_nick: 'text', p_pin: 'text' },
  MF_login: { p_nick: 'text', p_pin: 'text', p_legacy_pid: 'uuid' },
  MF_login_and_merge: { p_player_id: 'uuid', p_token: 'text', p_nick: 'text', p_pin: 'text' },
  MF_submit_score: { p_game_id: 'text', p_player_id: 'uuid', p_token: 'text', p_score: 'numeric' },
  MF_rename: { p_player_id: 'uuid', p_token: 'text', p_nick: 'text' },
  MF_change_pin: { p_player_id: 'uuid', p_token: 'text', p_new_pin: 'text' },
  MF_logout: { p_player_id: 'uuid', p_token: 'text' },
  MF_whoami: { p_player_id: 'uuid', p_token: 'text' },
  MF_sync_bests: { p_player_id: 'uuid', p_token: 'text', p_items: 'jsonb' },
  MF_submit_feedback: { p_game_id: 'text', p_player_id: 'uuid', p_message: 'text', p_token: 'text', p_version: 'text' },
  MF_submit_rating: { p_game_id: 'text', p_player_id: 'uuid', p_stars: 'int', p_token: 'text' }
};
function makeApi(db) {
  async function asAnon(query, params) {
    await db.exec('set role anon');
    try { return (await db.query(query, params)).rows; }
    catch (e) { return { sqlError: String(e.message || e) }; }
    finally { await db.exec('reset role'); }
  }
  const call = async (name, args) => {
    const sig = SIG[name], keys = Object.keys(args || {});
    const parts = keys.map((k, i) => k + ' => $' + (i + 1) + '::' + sig[k]);
    const vals = keys.map(k => (sig[k] === 'jsonb' && args[k] != null && typeof args[k] !== 'string') ? JSON.stringify(args[k]) : args[k]);
    const r = await asAnon('select public."' + name + '"(' + parts.join(', ') + ') as r', vals);
    return r.sqlError ? r : r[0].r;
  };
  const q = async (query, params) => (await db.query(query, params)).rows;
  const one = async (query, params) => (await db.query(query, params)).rows[0];
  return { asAnon, call, q, one };
}
async function newDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec('create role anon nologin; create role authenticated nologin;');
  return db;
}

// ═══════════════════════════════════════════════════════════════
// 一、舊版資料庫遷移
// ═══════════════════════════════════════════════════════════════
{
  const db = await newDb(); const { asAnon, q, one, call } = makeApi(db);
  await db.exec(oldSql);                                                     // 舊版（V1.34）資料庫
  const oldSub = async (g, p, n, s) => (await asAnon('select public."MF_submit_score"($1,$2::uuid,$3,$4::numeric) as r', [g, p, n, s]))[0].r;
  // 舊玩家：三位玩家都叫「小明」（不同裝置）；一位暱稱 10 個字（舊版曾允許較長）；一位只有一款；意見、評價也各有一些
  let lastMs = 0; const tick = () => { let t; do { t = Date.now(); } while (t === lastMs); lastMs = t; };
  const L = [[uuid(1), '小明'], [uuid(2), '小明'], [uuid(3), '小明'], [uuid(4), '阿嬤'], [uuid(5), '一二三四五六七八']];
  for (const [p, n] of L) { tick(); await oldSub('speed', p, n, 0.1 + Number(p.slice(-1)) / 100); }
  tick(); await oldSub('spot', uuid(1), '小明改', 20);          // 同一位玩家換了暱稱：以最新一筆為準
  tick(); await oldSub('spot', uuid(4), '阿嬤', 18);
  await asAnon('select public."MF_submit_feedback"($1,$2::uuid,$3,$4,$5)', ['speed', uuid(9), '舊意見一則', '路人', null]);
  await asAnon('select public."MF_submit_rating"($1,$2::uuid,$3::int)', ['speed', uuid(9), 4]);
  const before = (await asAnon('select public."MF_get_top"($1,$2::uuid) as r', ['speed', uuid(1)]))[0].r;
  const oldRows = (await q('select game_id, player_id, nickname, score from public."MF_scores" order by game_id, player_id'));

  await db.exec(oldSql.replace(/^/, ''));   // （確認舊 SQL 重跑沒問題）
  await db.exec(sql);                                                       // ★ 第一次執行新版：遷移
  await db.exec(sql);                                                       // 第二次：必須不報錯、不改動資料
  console.log('遷移：舊版 SQL → 新版 SQL（連跑兩次）成功');

  // 備份
  const bak = await q('select game_id, player_id, nickname, score from public."MF_scores_bak_v135" order by game_id, player_id');
  eq(bak.map(r => [r.game_id, r.player_id, r.nickname, Number(r.score)]), oldRows.map(r => [r.game_id, r.player_id, r.nickname, Number(r.score)]), '遷移：備份表跟遷移前的成績表完全一樣（含舊暱稱）');
  const d = await asAnon('select * from public."MF_scores_bak_v135"');
  ok(d.sqlError && /permission denied/i.test(d.sqlError), '遷移：備份表 anon 讀不到');
  // 每個舊代號一列「尚未認領」的玩家
  const pl = await q('select * from public."MF_players" order by player_id');
  eq(pl.map(r => r.player_id), [uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)], '遷移：榜上 5 個不重複的舊代號各有一列玩家');
  ok(pl.every(r => r.claimed === false && r.pin_hash === null), '遷移：全部是尚未認領、沒有密碼');
  eq(pl.map(r => r.nickname), ['小明改', '小明', '小明', '阿嬤', '一二三四五六七八'], '遷移：暱稱＝每個代號「最新一筆成績」的暱稱（同一位玩家換過暱稱以最新為準）');
  ok(pl.filter(r => r.nick_key === '小明').length === 2, '遷移：同暱稱的舊玩家每個都建一列（不受唯一限制）');
  const days = (r) => (new Date(r.reserved_until).getTime() - Date.now()) / 86400000;
  ok(pl.every(r => days(r) > 59.9 && days(r) < 60.1), '遷移：暱稱保留 60 天：' + pl.map(r => days(r).toFixed(3)).join(','));
  ok(pl.every(r => new Date(r.created_at).getTime() <= Date.now()), '遷移：created_at＝最早一筆成績的時間（不是遷移當下）');
  // 榜單長得跟遷移前一樣（暱稱改由玩家表帶出）
  const after = (await asAnon('select public."MF_get_top"($1,$2::uuid) as r', ['speed', uuid(1)]))[0].r;
  // 唯一的差別：舊版暱稱存在每一列、同一位玩家（uuid1）在 spot 換過暱稱，speed 那一列還是舊名字；新版暱稱只存玩家表，統一用最新的
  const expectBoard = JSON.parse(JSON.stringify(before)); expectBoard.top.filter(x => x.mine).forEach(x => { x.nick = '小明改'; });
  eq(after, expectBoard, '遷移：speed 榜單（名次、成績、mine）跟遷移前一樣，暱稱統一用玩家最新的暱稱');
  eq((await call('MF_get_top', { p_game_id: 'spot' })).top.map(x => x.nick), ['小明改', '阿嬤'], '遷移：spot 榜單顯示最新暱稱');
  // 再執行一次不會延長保留期、不會重複備份
  const r1 = (await one('select min(reserved_until) as a, max(reserved_until) as b from public."MF_players"'));
  await db.exec(sql);
  const r2 = (await one('select min(reserved_until) as a, max(reserved_until) as b from public."MF_players"'));
  eq([String(r1.a), String(r1.b)], [String(r2.a), String(r2.b)], '遷移：重複執行不會延長保留期');
  eq((await q('select count(*)::int as n from public."MF_players"'))[0].n, 5, '遷移：重複執行不會多出玩家');
  // 其他資料沒動
  eq((await q('select count(*)::int as n from public."MF_feedback"'))[0].n, 1, '遷移：舊意見還在');
  eq((await q('select count(*)::int as n from public."MF_ratings"'))[0].n, 1, '遷移：舊評價還在');
  // 舊後門：舊函式整個不存在
  const procs = (await q(`select p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'MF\\_%' order by 1, 2`));
  ok(!procs.some(p => p.proname === 'MF_rename_player'), '舊後門：MF_rename_player 已刪除');
  ok(!procs.some(p => p.proname === 'MF_submit_score' && /p_nickname/.test(p.args)), '舊後門：舊版 MF_submit_score（帶 p_nickname）已刪除');
  ok(!procs.some(p => p.proname === 'MF_submit_feedback' && /p_nickname/.test(p.args)), '舊後門：舊版 MF_submit_feedback 已刪除');
  ok(!procs.some(p => p.proname === 'MF_submit_rating' && !/p_token/.test(p.args)), '舊後門：舊版 MF_submit_rating 已刪除');
  const oldCall = await asAnon(`select public."MF_submit_score"(p_game_id => 'speed', p_player_id => $1::uuid, p_nickname => 'x', p_score => 0.01) as r`, [uuid(77)]);
  ok(oldCall.sqlError && /does not exist/i.test(oldCall.sqlError), '舊後門：用舊版的 p_nickname 寫成績 → 找不到函式（PostgREST 會回 404）：' + (oldCall.sqlError || '').slice(0, 80));
  const oldRename = await asAnon(`select public."MF_rename_player"($1::uuid, 'x') as r`, [uuid(1)]);
  ok(oldRename.sqlError && /does not exist/i.test(oldRename.sqlError), '舊後門：舊的改暱稱函式找不到');
  // 沒有憑證就不能寫成績：舊玩家的舊代號單獨拿不到寫入權
  eq(await call('MF_submit_score', { p_game_id: 'speed', p_player_id: uuid(1), p_token: null, p_score: 0.001 }), { ok: false, error: 'bad_token' }, '舊後門：只知道舊代號不能寫成績');
  eq(await call('MF_submit_score', { p_game_id: 'speed', p_player_id: uuid(1), p_token: 'x', p_score: 0.001 }), { ok: false, error: 'bad_token' }, '舊後門：亂填憑證不行');
  // 舊代號狀態
  has(await call('MF_legacy_status', { p_player_id: uuid(1) }), { ok: true, state: 'unclaimed', nick: '小明改' }, '舊玩家狀態：未認領');
  has(await call('MF_legacy_status', { p_player_id: uuid(404) }), { ok: true, state: 'unknown' }, '舊玩家狀態：資料庫沒有這個代號 → unknown');
  has(await call('MF_legacy_status', { p_player_id: null }), { state: 'unknown' }, '舊玩家狀態：null → unknown');
  // 沒有任何成績的舊代號也不該被建立（只有榜上有成績的才建立）
  ok((await q(`select count(*)::int as n from public."MF_players" where player_id = $1::uuid`, [uuid(9)]))[0].n === 0, '遷移：只有意見／評價、沒有成績的代號不建立玩家列（它們繼續當匿名用）');
  // 舊玩家認領：A（暱稱可用）／重複暱稱的先搶先贏
  has(await call('MF_claim_legacy', { p_legacy_pid: uuid(4), p_nick: '阿嬤', p_pin: '1357' }), { ok: true, player_id: uuid(4), nick: '阿嬤', joined: false }, '認領 A：阿嬤認領自己的暱稱，player_id 不變');
  const c2 = await call('MF_claim_legacy', { p_legacy_pid: uuid(2), p_nick: '小明', p_pin: '2468' });
  has(c2, { ok: true, player_id: uuid(2), joined: false }, '認領 A：第二位「小明」先認領 → 拿到「小明」');
  const rest = await q('select player_id, nickname, claimed from public."MF_players" where player_id in ($1::uuid, $2::uuid) order by player_id', [uuid(1), uuid(3)]);
  ok(rest.every(r => !r.claimed && /^小明\d{3}$/.test(r.nickname) || r.player_id === uuid(1) && r.nickname === '小明改'), '重複暱稱：另一位同名的舊玩家（uuid3）在榜上的顯示名自動改成「小明＋3 位數」：' + JSON.stringify(rest));
  const t3 = (await q('select nickname from public."MF_players" where player_id = $1::uuid', [uuid(3)]))[0].nickname;
  ok(/^小明\d{3}$/.test(t3), '重複暱稱：uuid3 改成 ' + t3);
  // 一款遊戲上不會有兩個一樣的暱稱
  const names = (await call('MF_get_top', { p_game_id: 'speed' })).top.map(x => x.nick);
  ok(new Set(names).size === names.length, '重複暱稱：speed 榜上沒有兩個一樣的名字：' + names.join('、'));
}

// ═══════════════════════════════════════════════════════════════
// 二～六：全新資料庫（沒有舊資料）
// ═══════════════════════════════════════════════════════════════
const db = await newDb(); const { asAnon, call, q, one } = makeApi(db);
await db.exec(sql);
await db.exec(sql);
console.log('全新資料庫：新版 SQL 連續執行兩次成功');
let lastMs2 = 0; const tick = () => { let t; do { t = Date.now(); } while (t === lastMs2); lastMs2 = t; };
const reg = async (nick, pin, g = 'speed', s = 0.5) => { tick(); return call('MF_register', { p_nick: nick, p_pin: pin, p_game_id: g, p_score: s }); };
const pinOf = async (pid) => (await one('select pin_hash from public."MF_players" where player_id = $1::uuid', [pid])).pin_hash;
const player = async (pid) => one('select * from public."MF_players" where player_id = $1::uuid', [pid]);
const sec = async (pid) => one('select extract(epoch from (locked_until - now()))::int as s, lock_level, fail_count from public."MF_players" where player_id = $1::uuid', [pid]);

// ─── 二、暱稱 ───
{
  const nk = async (t) => (await one('select public."MF__nick_key"($1) as k, public."MF__clean_nick"($2) as c', [t, t]));
  eq((await nk('  小明\n 同學  ')).c, '小明 同學', '暱稱清理：空白、換行');
  eq((await nk('一二三四五六七八九十')).c, '一二三四五六七八', '暱稱清理：最多 8 個字');
  eq((await nk('a' + inv(0x202e) + 'b' + inv(0x200b) + 'c' + inv(0xfeff) + 'd')).c, 'a b c d', '暱稱清理：方向控制／零寬字元／BOM 變空格');
  eq((await nk(inv(0x200b, 0x202e))).c, '', '暱稱清理：只有看不見的字元 → 空字串');
  eq((await nk('Amy')).k, 'amy', '比對鍵：轉小寫');
  eq((await nk('Ａｍｙ')).k, 'amy', '比對鍵：全形英文字母轉半形（NFKC）');
  eq((await nk(' A m y ')).k, 'amy', '比對鍵：去掉所有空白');
  eq((await nk('ＡＭＹ１２３')).k, 'amy123', '比對鍵：全形數字也轉半形');
  ok((await nk('小明')).k !== (await nk('小朙')).k, '比對鍵：長得像但不同的字不同（這一版不處理形近字）');
  eq((await one(`select public."MF__is_reserved"($1) as r`, ['admin'])).r, true, '保留字：admin');
  eq((await one(`select public."MF__is_reserved"($1) as r`, ['管理員'])).r, true, '保留字：管理員');
  eq((await one(`select public."MF__is_reserved"($1) as r`, ['admin123'])).r, true, '保留字：結尾數字也不行（admin123）');
  eq((await one(`select public."MF__is_reserved"($1) as r`, ['系統工程師'])).r, false, '保留字：只擋「整個名字」是保留字，不擋包含');
  for (const [p, want] of [['1234', true], ['0000', true], ['123', false], ['12345', false], ['12a4', false], ['', false], [' 123', false]]) eq((await one('select public."MF__valid_pin"($1) as v', [p])).v, want, '密碼格式 ' + JSON.stringify(p));
  eq((await one('select public."MF__valid_pin"(null) as v')).v, false, '密碼格式 null');
  // MF_check_nick
  has(await call('MF_check_nick', { p_nick: '快樂阿嬤' }), { ok: true, state: 'free', nick: '快樂阿嬤' }, '查暱稱：沒人用 → free');
  has(await call('MF_check_nick', { p_nick: '   ' }), { state: 'bad' }, '查暱稱：空白 → bad');
  has(await call('MF_check_nick', { p_nick: 'Admin' }), { state: 'bad' }, '查暱稱：保留字 → bad');
  has(await call('MF_check_nick', { p_nick: '管理員007' }), { state: 'bad' }, '查暱稱：保留字加數字 → bad');
}

// ─── 三、建立帳號 ───
let A, B;
{
  // 參數檢查（都不會留下任何玩家）
  eq(await reg('小明', '123'), { ok: false, error: 'bad_pin' }, '建立：密碼不是 4 位');
  eq(await reg('小明', 'abcd'), { ok: false, error: 'bad_pin' }, '建立：密碼不是數字');
  eq(await reg('小明', '12345'), { ok: false, error: 'bad_pin' }, '建立：密碼 5 位');
  eq(await reg('   ', '1234'), { ok: false, error: 'bad_nick' }, '建立：空白暱稱');
  eq(await reg('Admin', '1234'), { ok: false, error: 'bad_nick' }, '建立：保留字暱稱');
  eq(await reg('小明', '1234', 'nope', 1), { ok: false, error: 'unknown_game' }, '建立：遊戲不存在');
  eq(await reg('小明', '1234', 'speed', 61), { ok: false, error: 'out_of_range' }, '建立：成績超出範圍');
  eq(await call('MF_register', { p_nick: '小明', p_pin: '1234', p_game_id: 'speed', p_score: null }), { ok: false, error: 'bad_args' }, '建立：成績 null');
  eq((await q('select count(*)::int as n from public."MF_players"'))[0].n, 0, '建立：失敗的呼叫沒有留下任何玩家');
  // 成功
  A = await reg('小明', '1234', 'speed', 0.5);
  ok(A.ok && A.saved === true && A.rank === 1 && A.nick === '小明' && /^[0-9a-f-]{36}$/.test(A.player_id) && /^[0-9a-f]{64}$/.test(A.token), '建立：成功，回傳 player_id、64 字元的憑證、名次：' + canon(A).slice(0, 160));
  eq(A.top, [{ rank: 1, nick: '小明', score: 0.5, mine: true }], '建立：回傳的榜單含自己（mine=true）');
  const pa = await player(A.player_id);
  ok(pa.claimed && pa.nickname === '小明' && pa.nick_key === '小明' && /^\$2[aby]\$08\$/.test(pa.pin_hash) && !pa.pin_hash.includes('1234'), '建立：玩家列已認領、密碼是 bcrypt 雜湊、不含明文：' + pa.pin_hash.slice(0, 12));
  ok(pa.reserved_until === null && pa.claimed_at && pa.last_login_at, '建立：沒有保留期、有建立與登入時間');
  const sess = await q('select token_hash from public."MF_sessions" where player_id = $1::uuid', [A.player_id]);
  ok(sess.length === 1 && sess[0].token_hash !== A.token && sess[0].token_hash.length === 64, '建立：憑證只存雜湊（資料庫裡不是憑證本身）');
  // 暱稱撞名：附建議，建議的名字沒人用、格式是「原暱稱＋3 位數」
  const dup = await reg('Ｘ小明', '9999');                       // 比對鍵「x小明」跟「小明」不同，應該成功（驗證沒有誤判）
  ok(dup.ok, '建立：「Ｘ小明」跟「小明」是不同暱稱：' + canon(dup).slice(0, 80));
  const taken = await reg(' 小 明 ', '5555', 'speed', 0.4);
  has(taken, { ok: false, error: 'nick_taken' }, '建立：暱稱已被使用（空白不同也算同一個）');
  ok(/^小 明\d{3}$/.test(taken.suggestion), '建立：建議暱稱格式「清理後的原暱稱＋3 位數」：' + taken.suggestion);
  eq((await call('MF_check_nick', { p_nick: taken.suggestion })).state, 'free', '建立：建議的暱稱確實沒人用');
  const tk2 = await reg('ＡＢＣ', '1111', 'speed', 0.45);
  ok(tk2.ok, '建立：ＡＢＣ（全形）');
  has(await reg('abc', '2222', 'speed', 0.44), { ok: false, error: 'nick_taken' }, '建立：全形 ＡＢＣ 與半形 abc 是同一個暱稱');
  // 長暱稱撞名：建議暱稱先截成 5 字再加 3 位數（不超過 8 字）
  await reg('一二三四五六七八', '3333', 'speed', 0.43);
  const lt = await reg('一二三四五六七八', '4444', 'speed', 0.42);
  ok(lt.error === 'nick_taken' && /^一二三四五\d{3}$/.test(lt.suggestion) && Array.from(lt.suggestion).length === 8, '建立：8 字暱稱撞名，建議暱稱先截成 5 字再加 3 位數：' + lt.suggestion);
  // 同時搶同一個暱稱：唯一索引是最後防線（已認領的暱稱不能重複）
  const dupIns = await db.query(`insert into public."MF_players"(nickname, nick_key, claimed, pin_hash) values ('小明','小明',true,'x')`).catch(e => ({ err: String(e.message) }));
  ok(dupIns.err && /unique|duplicate/i.test(dupIns.err), '唯一索引：直接塞第二個已認領的「小明」被資料庫擋下：' + (dupIns.err || '').slice(0, 60));
  // 沒進榜不建帳號：先把 speed 榜塞滿 30 名（這些成績都很好），再用很差的成績註冊
  for (let i = 1; i <= 30; i++) {
    const pid = uuid(5000 + i);
    await db.query(`insert into public."MF_players"(player_id, nickname, nick_key, claimed, pin_hash) values ($1::uuid, $2, $3, true, 'x')`, [pid, 'F' + i, 'filler' + i]);
    await db.query(`insert into public."MF_scores"(game_id, player_id, score, rank_key) values ('speed', $1::uuid, $2, $2)`, [pid, 0.001 * i]);
  }
  // 滿榜時，原本榜上的小明（0.5）等都被擠掉了（成績表只留 30 名；這裡直接塞，所以先清掉多的）
  await db.exec(`delete from public."MF_scores" where game_id = 'speed' and player_id not in (select player_id from public."MF_players" where nickname like 'F%')`);
  const nBefore = (await q('select count(*)::int as n from public."MF_players"'))[0].n;
  eq(await reg('新手甲', '1234', 'speed', 1.5), { ok: false, error: 'not_qualified' }, '建立：這筆成績進不了榜 → not_qualified');
  eq(await reg('新手甲', '1234', 'speed', 0.03), { ok: false, error: 'not_qualified' }, '建立：與第 30 名同分 → 進不了榜（先到先贏）');
  eq((await q('select count(*)::int as n from public."MF_players"'))[0].n, nBefore, '建立：進不了榜時不留下帳號');
  const okReg = await reg('新手乙', '1234', 'speed', 0.0295);
  ok(okReg.ok && okReg.saved && okReg.rank === 30, '建立：勝過第 30 名 → 建立成功、名次 30：' + canon(okReg).slice(0, 100));
  ok(!okReg.top.some(x => x.nick === 'F30'), '建立：原本第 30 名被擠出榜');
  B = okReg;
  await db.exec(`delete from public."MF_scores" where game_id = 'speed'`);
  // 保險絲：1 小時內新帳號已經 60 個 → busy
  const c = (await q(`select count(*)::int as n from public."MF_players" where created_at > now() - interval '1 hour'`))[0].n;
  for (let i = c; i < 60; i++) await db.query(`insert into public."MF_players"(nickname, nick_key, claimed, pin_hash) values ($1, $2, true, 'x')`, ['X' + i, 'busy' + i]);
  eq(await reg('保險絲', '1234'), { ok: false, error: 'busy' }, '建立：1 小時內新帳號已達 60 個 → busy');
  await db.exec(`update public."MF_players" set created_at = now() - interval '2 hours' where nick_key like 'busy%' or nick_key like 'filler%'`);
  ok((await reg('保險絲', '1234')).ok, '建立：過了一小時（或舊帳號）不再 busy');
}

// ─── 三之二、登入與密碼限速 ───
{
  const login = (nick, pin, legacy) => call('MF_login', legacy === undefined ? { p_nick: nick, p_pin: pin } : { p_nick: nick, p_pin: pin, p_legacy_pid: legacy });
  const L1 = await login('小明', '1234');
  ok(L1.ok && L1.player_id === A.player_id && L1.nick === '小明' && /^[0-9a-f]{64}$/.test(L1.token) && L1.token !== A.token, '登入：成功，player_id 相同、憑證是新的一把');
  has(await login(' ＸＸ小明 ', '1234'), { ok: false, error: 'no_such_player' }, '登入：沒有這個暱稱');
  has(await login('Ｘ小明', '9999'), { ok: true }, '登入：暱稱用全形、大小寫、空白不同也找得到同一個帳號');
  eq(await login('小明', '12'), { ok: false, error: 'bad_pin' }, '登入：密碼格式不對（不算打錯，不計入失敗次數）');
  eq((await player(A.player_id)).fail_count, 0, '登入：格式錯誤的密碼沒有計入失敗次數');
  // 限速：1～4 次錯 → 還剩 4、3、2、1 次；第 5 次 → 鎖 10 分鐘
  const seq = [];
  for (let i = 0; i < 4; i++) seq.push((await login('小明', '0000')).attempts_left);
  eq(seq, [4, 3, 2, 1], '限速：連續打錯第 1～4 次，還剩 4、3、2、1 次');
  const fifth = await login('小明', '0000');
  eq(fifth, { ok: false, error: 'locked', wait_seconds: 600 }, '限速：第 5 次錯 → 鎖 10 分鐘（600 秒）');
  // 鎖定期間：打對密碼也不行（而且不驗密碼、不改變鎖定時間）
  const lockedAt = (await one('select locked_until from public."MF_players" where player_id = $1::uuid', [A.player_id])).locked_until;
  const lk = await login('小明', '1234');
  ok(lk.ok === false && lk.error === 'locked' && lk.wait_seconds > 590 && lk.wait_seconds <= 600, '限速：鎖定期間打對密碼也回 locked（剩 ' + lk.wait_seconds + ' 秒）');
  eq(String((await one('select locked_until from public."MF_players" where player_id = $1::uuid', [A.player_id])).locked_until), String(lockedAt), '限速：鎖定期間的嘗試不會延長鎖定時間');
  // 其他功能不受影響：已經登入的裝置照樣能送成績（用憑證，不用密碼）
  const sc = await call('MF_submit_score', { p_game_id: 'speed', p_player_id: A.player_id, p_token: A.token, p_score: 0.2 });
  ok(sc.ok && sc.saved, '限速：帳號被鎖住時，已登入的裝置仍然可以送成績');
  // 鎖完之後「再錯 1 次」就加倍：20、40、80、160、320、640、1280、1440、1440 分鐘
  const waits = [];
  for (let i = 0; i < 9; i++) {
    await db.query(`update public."MF_players" set locked_until = now() - interval '1 second' where player_id = $1::uuid`, [A.player_id]);
    const w = await login('小明', '0000');
    waits.push(w.wait_seconds);
  }
  eq(waits, [1200, 2400, 4800, 9600, 19200, 38400, 76800, 86400, 86400], '限速：鎖完再錯一次就加倍（20、40、80、160、320、640、1280 分鐘），上限 24 小時');
  eq((await sec(A.player_id)).lock_level, 10, '限速：鎖定等級持續累加');
  // 鎖定過了、打對密碼 → 登入成功，全部歸零
  await db.query(`update public."MF_players" set locked_until = now() - interval '1 second' where player_id = $1::uuid`, [A.player_id]);
  const good = await login('小明', '1234');
  ok(good.ok, '限速：鎖定結束後打對密碼可以登入');
  const z = await player(A.player_id);
  ok(z.fail_count === 0 && z.lock_level === 0 && z.locked_until === null && z.last_fail_at === null, '限速：登入成功後失敗次數、鎖定等級、鎖定時間全部歸零');
  // 歸零之後從頭算（又是 5 次才鎖）
  eq((await login('小明', '0000')).attempts_left, 4, '限速：歸零後重新計算（還剩 4 次）');
  // 安靜超過 24 小時也自動歸零：模擬「連錯 4 次、很久之後再錯」
  await login('小明', '0000'); await login('小明', '0000'); await login('小明', '0000');
  eq((await player(A.player_id)).fail_count, 4, '限速：連錯 4 次');
  await db.query(`update public."MF_players" set last_fail_at = now() - interval '25 hours' where player_id = $1::uuid`, [A.player_id]);
  eq((await login('小明', '0000')).attempts_left, 4, '限速：安靜超過 24 小時，失敗次數自動歸零（錯一次還剩 4 次）');
  // 鎖到 24 小時上限之後，在鎖定結束的那一刻不會被「安靜 24 小時」誤判成歸零（要結束後再安靜 24 小時才歸零）
  await db.query(`update public."MF_players" set fail_count = 20, lock_level = 12, last_fail_at = now() - interval '24 hours', locked_until = now() - interval '1 second' where player_id = $1::uuid`, [A.player_id]);
  const cap = await login('小明', '0000');
  eq(cap, { ok: false, error: 'locked', wait_seconds: 86400 }, '限速：鎖定剛結束就再錯，繼續鎖 24 小時（不會因為最後一次打錯是 24 小時前就歸零）');
  await db.query(`update public."MF_players" set fail_count = 0, lock_level = 0, last_fail_at = null, locked_until = null where player_id = $1::uuid`, [A.player_id]);
  // 沒有認領的舊玩家不能用暱稱登入
  await db.query(`insert into public."MF_players"(player_id, nickname, nick_key, claimed, reserved_until) values ($1::uuid, '舊玩家甲', '舊玩家甲', false, now() + interval '60 days')`, [uuid(6001)]);
  has(await login('舊玩家甲', '1234'), { ok: false, error: 'no_such_player' }, '登入：尚未認領的舊玩家沒有密碼，不能用暱稱登入');
}

// ─── 五之一、裝置憑證：成績、改暱稱、改密碼、登出、10 台上限 ───
{
  const T = A.token, P = A.player_id;
  // 成績：憑證對了才能寫
  has(await call('MF_submit_score', { p_game_id: 'speed', p_player_id: P, p_token: T, p_score: 0.15 }), { ok: true, saved: true }, '憑證：成績寫入成功（暱稱用帳號的暱稱）');
  eq((await call('MF_get_top', { p_game_id: 'speed', p_player_id: P })).top[0], { rank: 1, nick: '小明', score: 0.15, mine: true }, '憑證：榜上暱稱＝帳號暱稱');
  eq(await call('MF_submit_score', { p_game_id: 'speed', p_player_id: P, p_token: B.token, p_score: 0.01 }), { ok: false, error: 'bad_token' }, '憑證：別人的憑證不能寫我的成績');
  eq(await call('MF_whoami', { p_player_id: P, p_token: T }), { ok: true, nick: '小明' }, 'whoami：憑證有效，回暱稱');
  eq(await call('MF_whoami', { p_player_id: P, p_token: 'x' }), { ok: false, error: 'bad_token' }, 'whoami：憑證無效');
  // 改暱稱：只能改自己的；唯一；保留；一天 2 次
  eq(await call('MF_rename', { p_player_id: P, p_token: 'bad', p_nick: '小明二號' }), { ok: false, error: 'bad_token' }, '改暱稱：沒憑證不能改');
  has(await call('MF_rename', { p_player_id: P, p_token: T, p_nick: '   ' }), { ok: false, error: 'bad_nick' }, '改暱稱：空白');
  has(await call('MF_rename', { p_player_id: P, p_token: T, p_nick: '系統' }), { ok: false, error: 'bad_nick' }, '改暱稱：保留字');
  const rt = await call('MF_rename', { p_player_id: P, p_token: T, p_nick: 'ＡＢＣ' });
  ok(rt.ok === false && rt.error === 'nick_taken' && /^ＡＢＣ?\d{3}$|^ＡＢＣ\d{3}$/.test(rt.suggestion), '改暱稱：別人（ＡＢＣ）已經用了 → nick_taken＋建議：' + canon(rt));
  has(await call('MF_rename', { p_player_id: P, p_token: T, p_nick: '小明' }), { ok: true, changed: false, left: 2 }, '改暱稱：改成一樣的名字 → 沒改、不算次數');
  has(await call('MF_rename', { p_player_id: P, p_token: T, p_nick: '小明二號' }), { ok: true, nick: '小明二號', changed: true, left: 1 }, '改暱稱：第 1 次成功，今天還能改 1 次');
  eq((await call('MF_get_top', { p_game_id: 'speed', p_player_id: P })).top[0].nick, '小明二號', '改暱稱：榜上立刻變成新暱稱');
  eq((await player(P)).player_id, P, '改暱稱：player_id 沒變');
  ok(/小明二號/.test((await call('MF_whoami', { p_player_id: P, p_token: T })).nick), '改暱稱：whoami 回新暱稱');
  has(await call('MF_rename', { p_player_id: P, p_token: T, p_nick: '小明三號' }), { ok: true, changed: true, left: 0 }, '改暱稱：第 2 次成功，今天沒有次數了');
  has(await call('MF_rename', { p_player_id: P, p_token: T, p_nick: '小明四號' }), { ok: false, error: 'rename_too_many', limit: 2 }, '改暱稱：一天只能改 2 次');
  await db.query(`update public."MF_players" set rename_day = rename_day - 1 where player_id = $1::uuid`, [P]);
  has(await call('MF_rename', { p_player_id: P, p_token: T, p_nick: '小明四號' }), { ok: true, changed: true, left: 1 }, '改暱稱：隔天（台灣時間）又有 2 次');
  // 舊暱稱釋出：別人可以用「小明」了
  has(await call('MF_check_nick', { p_nick: '小明' }), { state: 'free' }, '改暱稱：舊暱稱釋出，別人可以用');
  has(await call('MF_rename', { p_player_id: P, p_token: T, p_nick: '小明' }), { ok: true }, '改暱稱：改回去');
  // 只改大小寫／全形：比對鍵一樣、仍然是自己的暱稱，可以改
  await db.query(`update public."MF_players" set rename_day = rename_day - 1 where player_id = $1::uuid`, [P]);
  has(await call('MF_rename', { p_player_id: P, p_token: T, p_nick: ' 小 明 ' }), { ok: true, nick: '小 明' }, '改暱稱：只差空白（比對鍵一樣）也算自己的暱稱，可以改');
  has(await call('MF_rename', { p_player_id: P, p_token: T, p_nick: '小明' }), { ok: true }, '改暱稱：再改回「小明」');
  // 保留中的暱稱不能改過去
  await db.query(`insert into public."MF_players"(player_id, nickname, nick_key, claimed, reserved_until) values ($1::uuid, '保留者', '保留者', false, now() + interval '30 days')`, [uuid(6002)]);
  await db.query(`update public."MF_players" set rename_day = rename_day - 1 where player_id = $1::uuid`, [P]);
  const rs = await call('MF_rename', { p_player_id: P, p_token: T, p_nick: '保留者' });
  ok(rs.ok === false && rs.error === 'nick_reserved' && /^保留者\d{3}$/.test(rs.suggestion), '改暱稱：被尚未認領的舊玩家保留中 → nick_reserved：' + canon(rs));
  // 改密碼：其他裝置登出、這一台保留、失敗次數歸零、舊密碼失效
  const L2 = await call('MF_login', { p_nick: '小明', p_pin: '1234' }), L3 = await call('MF_login', { p_nick: '小明', p_pin: '1234' });
  eq(await call('MF_change_pin', { p_player_id: P, p_token: T, p_new_pin: '12' }), { ok: false, error: 'bad_pin' }, '改密碼：格式不對');
  eq(await call('MF_change_pin', { p_player_id: P, p_token: 'zzz', p_new_pin: '4321' }), { ok: false, error: 'bad_token' }, '改密碼：沒憑證不能改');
  await db.query(`update public."MF_players" set fail_count = 3 where player_id = $1::uuid`, [P]);
  eq(await call('MF_change_pin', { p_player_id: P, p_token: L2.token, p_new_pin: '4321' }), { ok: true }, '改密碼：成功（用 L2 這支裝置改）');
  ok((await call('MF_whoami', { p_player_id: P, p_token: L2.token })).ok, '改密碼：這一支裝置仍然登入著');
  eq((await call('MF_whoami', { p_player_id: P, p_token: T })).error, 'bad_token', '改密碼：其他裝置（原本的憑證）被登出');
  eq((await call('MF_whoami', { p_player_id: P, p_token: L3.token })).error, 'bad_token', '改密碼：另一支裝置也被登出');
  eq((await q('select count(*)::int as n from public."MF_sessions" where player_id = $1::uuid', [P]))[0].n, 1, '改密碼：只剩一把憑證');
  ok((await call('MF_login', { p_nick: '小明', p_pin: '4321' })).ok, '改密碼：新密碼可以登入');
  eq((await call('MF_login', { p_nick: '小明', p_pin: '1234' })).error, 'wrong_pin', '改密碼：舊密碼失效');
  A.token = (await call('MF_login', { p_nick: '小明', p_pin: '4321' })).token;
  // 登出：這一把失效、其他把還在
  const O1 = await call('MF_login', { p_nick: '小明', p_pin: '4321' }), O2 = await call('MF_login', { p_nick: '小明', p_pin: '4321' });
  eq(await call('MF_logout', { p_player_id: P, p_token: O1.token }), { ok: true }, '登出：成功');
  eq((await call('MF_whoami', { p_player_id: P, p_token: O1.token })).error, 'bad_token', '登出：這把憑證失效');
  ok((await call('MF_whoami', { p_player_id: P, p_token: O2.token })).ok, '登出：另一台不受影響');
  eq(await call('MF_logout', { p_player_id: P, p_token: O1.token }), { ok: false, error: 'bad_token' }, '登出：已經登出的憑證再登出 → bad_token');
  // 每位玩家最多 10 台：登入 13 次，只剩最近的 10 把
  const toks = [];
  for (let i = 0; i < 13; i++) toks.push((await call('MF_login', { p_nick: '小明', p_pin: '4321' })).token);
  eq((await q('select count(*)::int as n from public."MF_sessions" where player_id = $1::uuid', [P]))[0].n, 10, '10 台上限：再登入也只剩 10 把');
  ok((await call('MF_whoami', { p_player_id: P, p_token: toks[12] })).ok, '10 台上限：最新的一把有效');
  eq((await call('MF_whoami', { p_player_id: P, p_token: toks[0] })).error, 'bad_token', '10 台上限：最久沒用的被刪掉');
  A.token = toks[12];
}

// ─── 四、舊玩家認領（全新資料庫裡手動建立「尚未認領」的舊玩家）───
{
  const legacy = async (i, nick, game, score, ageDays = 10) => {
    await db.query(`insert into public."MF_players"(player_id, nickname, nick_key, claimed, reserved_until, created_at) values ($1::uuid, $2, public."MF__nick_key"($2), false, now() + interval '60 days', now() - ($3 || ' days')::interval)`, [uuid(i), nick, String(ageDays)]);
    if (game) await db.query(`insert into public."MF_scores"(game_id, player_id, score, rank_key, achieved_at) select $1, $2::uuid, $3::numeric, case better when 'min' then $3::numeric else -$3::numeric end, now() - ($4 || ' days')::interval from public."MF_games" where game_id = $1`, [game, uuid(i), score, String(ageDays)]);
  };
  await db.exec(`delete from public."MF_scores"; delete from public."MF_players" where nick_key like 'busy%' or nick_key like 'filler%' or nickname like 'X%' or nickname like 'F%'`);
  // A：暱稱可用 → 寫進原本那一列
  await legacy(100, '丙丙', 'spot', 7);
  has(await call('MF_check_nick', { p_nick: '丙丙', p_legacy_pid: uuid(100) }), { state: 'free' }, '認領：自己保留的暱稱對自己是 free');
  has(await call('MF_check_nick', { p_nick: '丙丙' }), { state: 'reserved' }, '認領：別人看這個暱稱是 reserved（保留中）');
  const r1 = await call('MF_check_nick', { p_nick: '丙丙' });
  ok(r1.until && new Date(r1.until) > new Date(), '認領：reserved 附保留到何時（until）');
  ok(/^丙丙\d{3}$/.test(r1.suggestion), '認領：reserved 附建議暱稱：' + r1.suggestion);
  eq(await call('MF_claim_legacy', { p_legacy_pid: uuid(100), p_nick: '丙丙', p_pin: '12' }), { ok: false, error: 'bad_pin' }, '認領：密碼格式錯');
  has(await call('MF_claim_legacy', { p_legacy_pid: uuid(100), p_nick: '  ', p_pin: '1234' }), { ok: false, error: 'bad_nick' }, '認領：空白暱稱');
  has(await call('MF_claim_legacy', { p_legacy_pid: uuid(100), p_nick: 'root', p_pin: '1234' }), { ok: false, error: 'bad_nick' }, '認領：保留字暱稱');
  eq(await call('MF_claim_legacy', { p_legacy_pid: uuid(404), p_nick: '丙丙', p_pin: '1234' }), { ok: false, error: 'unknown_legacy' }, '認領：資料庫沒有這個舊代號');
  eq(await call('MF_claim_legacy', { p_legacy_pid: null, p_nick: '丙丙', p_pin: '1234' }), { ok: false, error: 'bad_args' }, '認領：沒給舊代號');
  const c1 = await call('MF_claim_legacy', { p_legacy_pid: uuid(100), p_nick: '丙丙', p_pin: '1234' });
  has(c1, { ok: true, player_id: uuid(100), nick: '丙丙', joined: false }, '認領 A：成功，player_id 沿用舊代號');
  ok(/^[0-9a-f]{64}$/.test(c1.token), '認領 A：發了憑證');
  const p100 = await player(uuid(100));
  ok(p100.claimed && p100.reserved_until === null && /^\$2/.test(p100.pin_hash), '認領 A：已認領、保留期清掉、密碼雜湊');
  eq((await call('MF_get_top', { p_game_id: 'spot', p_player_id: uuid(100) })).top, [{ rank: 1, nick: '丙丙', score: 7, mine: true }], '認領 A：榜上的成績原封不動');
  eq(await call('MF_claim_legacy', { p_legacy_pid: uuid(100), p_nick: '丙丙', p_pin: '1234' }), { ok: false, error: 'already_claimed' }, '認領：已經認領過的舊代號不能再認領');
  has(await call('MF_submit_score', { p_game_id: 'spot', p_player_id: uuid(100), p_token: c1.token, p_score: 9 }), { ok: true, saved: true }, '認領 A：用新憑證可以寫成績');
  has(await call('MF_legacy_status', { p_player_id: uuid(100) }), { state: 'claimed' }, '認領：舊玩家狀態變成 claimed');

  // B：第二台裝置（另一個舊代號）輸入相同暱稱＋相同密碼 → 併入第一台；成績取較好的
  await legacy(101, '丙丙', 'spot', 12, 20);          // 第二台在 spot 有更好的成績（12 > 9）
  await legacy(102, '丙丙', 'drop', 300, 15);         // 第二台另外有 drop 成績（第一台沒有）
  await db.query(`insert into public."MF_player_bests"(player_id, game_id, best_score, best_level) values ($1::uuid, 'spot', 8, 5), ($1::uuid, 'cake', 9, 3)`, [uuid(100)]);
  await db.query(`insert into public."MF_player_bests"(player_id, game_id, best_score, best_level) values ($1::uuid, 'spot', 11, 4)`, [uuid(101)]);
  const w1 = await call('MF_claim_legacy', { p_legacy_pid: uuid(101), p_nick: '丙丙', p_pin: '9999' });
  has(w1, { ok: false, error: 'wrong_pin', attempts_left: 4 }, '認領 B：密碼不對 → wrong_pin（計入「丙丙」帳號的失敗次數）');
  eq((await player(uuid(100))).fail_count, 1, '認領 B：失敗次數記在那個帳號上');
  has(await call('MF_claim_legacy', { p_legacy_pid: uuid(101), p_nick: '丙丙', p_pin: 'abcd' }), { error: 'bad_pin' }, '認領 B：格式錯不計入');
  eq((await player(uuid(100))).fail_count, 1, '認領 B：格式錯誤的密碼不計入失敗次數');
  const w2 = await call('MF_claim_legacy', { p_legacy_pid: uuid(101), p_nick: '丙丙', p_pin: '1234' });
  has(w2, { ok: true, player_id: uuid(100), nick: '丙丙', joined: true }, '認領 B：密碼相符＝同一個人，沿用第一台的 player_id（joined=true）');
  ok(/^[0-9a-f]{64}$/.test(w2.token) && (await call('MF_whoami', { p_player_id: uuid(100), p_token: w2.token })).ok, '認領 B：發的是「第一台那個帳號」的憑證');
  eq((await player(uuid(100))).fail_count, 0, '認領 B：打對之後失敗次數歸零');
  ok((await q('select count(*)::int as n from public."MF_players" where player_id = $1::uuid', [uuid(101)]))[0].n === 0, '認領 B：第二台的舊代號那一列已併入、刪除');
  eq((await call('MF_get_top', { p_game_id: 'spot', p_player_id: uuid(100) })).top, [{ rank: 1, nick: '丙丙', score: 12, mine: true }], '認領 B：spot 成績取較好的（12），沒有重複的列');
  const bests = await q('select game_id, best_score, best_level from public."MF_player_bests" where player_id = $1::uuid order by game_id', [uuid(100)]);
  eq(bests.map(b => [b.game_id, Number(b.best_score), b.best_level]), [['cake', 9, 3], ['spot', 11, 5]], '認領 B：個人最佳每款取較好（成績取大、關卡取大）');
  ok((await q('select count(*)::int as n from public."MF_player_merges" where source_id = $1::uuid and target_id = $2::uuid', [uuid(101), uuid(100)]))[0].n === 1, '認領 B：寫了一筆合併紀錄');
  // 第三台也併進來，並且帶了另一款遊戲的成績
  has(await call('MF_claim_legacy', { p_legacy_pid: uuid(102), p_nick: '丙丙', p_pin: '1234' }), { ok: true, joined: true, player_id: uuid(100) }, '認領 B：第三台也併入');
  ok(((await call('MF_get_top', { p_game_id: 'drop' })).top || []).some(x => x.nick === '丙丙' && x.score === 300), '認領 B：第三台的 drop 成績併過來了');

  // 登入時帶舊代號：併入；帶「已認領帳號」的代號：忽略
  await legacy(103, '丁丁', 'spot', 3);
  const lg = await call('MF_login', { p_nick: '丙丙', p_pin: '1234', p_legacy_pid: uuid(103) });
  ok(lg.ok && (await q('select count(*)::int as n from public."MF_players" where player_id = $1::uuid', [uuid(103)]))[0].n === 0, '登入帶舊代號：這支瀏覽器原本的舊成績併進帳號');
  const lg2 = await call('MF_login', { p_nick: '丙丙', p_pin: '1234', p_legacy_pid: A.player_id });
  ok(lg2.ok && (await player(A.player_id)) && (await player(A.player_id)).claimed, '登入帶「別的已建立帳號」的代號：忽略，不會被合併');

  // 保留中：別的舊玩家的暱稱不能認領
  await legacy(110, '乙乙', 'spot', 2);
  await legacy(111, '庚庚', 'spot', 1);
  const rsv = await call('MF_claim_legacy', { p_legacy_pid: uuid(111), p_nick: '乙乙', p_pin: '1234' });
  ok(rsv.ok === false && rsv.error === 'nick_reserved' && rsv.until && /^乙乙\d{3}$/.test(rsv.suggestion), '認領：別的舊玩家保留中的暱稱不能搶 → nick_reserved：' + canon(rsv));
  eq((await player(uuid(111))).claimed, false, '認領：被拒絕就什麼都沒改');
  // 新玩家（建立帳號）也不能搶保留中的暱稱
  const rsv2 = await reg('乙乙', '1234', 'drop', 99);
  ok(rsv2.error === 'nick_reserved' && /^乙乙\d{3}$/.test(rsv2.suggestion), '建立：保留中的暱稱新玩家不能用 → nick_reserved');
  // 換成建議的暱稱就可以認領（舊玩家也可以自己改暱稱再認領）
  const c3 = await call('MF_claim_legacy', { p_legacy_pid: uuid(111), p_nick: rsv.suggestion, p_pin: '1234' });
  has(c3, { ok: true, nick: rsv.suggestion, joined: false }, '認領：換成建議暱稱就能認領');
  // 保留期過了：新玩家可以拿走，原本的舊玩家在榜上自動改成「原暱稱＋3 位數」
  await db.query(`update public."MF_players" set reserved_until = now() - interval '1 day' where player_id = $1::uuid`, [uuid(110)]);
  has(await call('MF_check_nick', { p_nick: '乙乙' }), { state: 'free' }, '保留期過了：暱稱釋出（free）');
  const nw = await reg('乙乙', '1234', 'drop', 98);
  ok(nw.ok && nw.nick === '乙乙', '保留期過了：新玩家可以建立「乙乙」');
  const p110 = await player(uuid(110));
  ok(!p110.claimed && /^乙乙\d{3}$/.test(p110.nickname) && p110.nick_key === p110.nickname.toLowerCase(), '保留期過了：原本的舊玩家（尚未認領）榜上顯示名自動改成 ' + p110.nickname);
  const spotNames = (await call('MF_get_top', { p_game_id: 'spot' })).top.map(x => x.nick);
  ok(new Set(spotNames).size === spotNames.length, '榜上沒有兩個一樣的暱稱：' + spotNames.join('、'));
  // 改名之後那位舊玩家來認領：暱稱欄是新名字，可以直接認領
  has(await call('MF_claim_legacy', { p_legacy_pid: uuid(110), p_nick: p110.nickname, p_pin: '5678' }), { ok: true, joined: false }, '保留期過了：被改名的舊玩家仍然可以認領');

  // 同暱稱的兩位舊玩家（都沒認領）：先認領的人拿到暱稱，另一位在榜上自動改名
  await legacy(120, '戊戊', 'spot', 50);
  await legacy(121, '戊戊', 'spot', 51);
  has(await call('MF_check_nick', { p_nick: '戊戊', p_legacy_pid: uuid(120) }), { state: 'free' }, '同名舊玩家：自己認領自己的暱稱不受另一位影響（free）');
  has(await call('MF_check_nick', { p_nick: '戊戊', p_legacy_pid: uuid(121) }), { state: 'free' }, '同名舊玩家：另一位也是 free（誰先認領誰先拿到）');
  has(await call('MF_claim_legacy', { p_legacy_pid: uuid(121), p_nick: '戊戊', p_pin: '1111' }), { ok: true, nick: '戊戊' }, '同名舊玩家：121 先認領');
  const p120 = await player(uuid(120));
  ok(/^戊戊\d{3}$/.test(p120.nickname) && !p120.claimed, '同名舊玩家：120 在榜上自動改成 ' + p120.nickname);
  has(await call('MF_check_nick', { p_nick: '戊戊' }), { state: 'taken' }, '同名舊玩家：之後別人看「戊戊」是 taken');
  // 120 輸入同樣的暱稱＋密碼 → 併入（同一個人的另一台）
  has(await call('MF_claim_legacy', { p_legacy_pid: uuid(120), p_nick: '戊戊', p_pin: '1111' }), { ok: true, joined: true, player_id: uuid(121) }, '同名舊玩家：120 用同暱稱同密碼 → 併入 121');
  // 非舊玩家（已認領）的帳號不能被當舊代號認領
  eq(await call('MF_claim_legacy', { p_legacy_pid: A.player_id, p_nick: '另一個', p_pin: '1234' }), { ok: false, error: 'already_claimed' }, '認領：已建立的帳號 player_id 不能當舊代號');
}

// ─── 五之二、合併帳號（後悔藥）、個人最佳同步 ───
{
  // 建兩個帳號：小明（A）與「小明417」（誤建的第二個）
  tick(); const A2 = await call('MF_register', { p_nick: '小明417', p_pin: '2222', p_game_id: 'cake', p_score: 5 });
  ok(A2.ok, '合併：先建一個誤建的第二個帳號「小明417」');
  await call('MF_submit_score', { p_game_id: 'speed', p_player_id: A2.player_id, p_token: A2.token, p_score: 0.07 });
  await call('MF_submit_score', { p_game_id: 'speed', p_player_id: A.player_id, p_token: A.token, p_score: 0.09 });
  await call('MF_sync_bests', { p_player_id: A2.player_id, p_token: A2.token, p_items: [{ g: 'speed', s: 0.0700, lv: 9 }, { g: 'cake', s: 5, lv: 2 }] });
  await call('MF_sync_bests', { p_player_id: A.player_id, p_token: A.token, p_items: [{ g: 'speed', s: 0.0900, lv: 4 }] });
  await call('MF_submit_rating', { p_game_id: 'speed', p_player_id: A2.player_id, p_stars: 5, p_token: A2.token });
  await call('MF_submit_rating', { p_game_id: 'cake', p_player_id: A2.player_id, p_stars: 4, p_token: A2.token });
  await call('MF_submit_rating', { p_game_id: 'speed', p_player_id: A.player_id, p_stars: 2, p_token: A.token });     // 同一天同一款：搬不過去
  await call('MF_submit_feedback', { p_game_id: 'speed', p_player_id: A2.player_id, p_message: '第二個帳號寫的意見', p_token: A2.token });
  // 錯誤情況
  eq(await call('MF_login_and_merge', { p_player_id: A2.player_id, p_token: 'bad', p_nick: '小明', p_pin: '4321' }), { ok: false, error: 'bad_token' }, '合併：憑證不對');
  has(await call('MF_login_and_merge', { p_player_id: A2.player_id, p_token: A2.token, p_nick: '沒這個人', p_pin: '4321' }), { error: 'no_such_player' }, '合併：目標暱稱不存在');
  has(await call('MF_login_and_merge', { p_player_id: A2.player_id, p_token: A2.token, p_nick: '小明417', p_pin: '2222' }), { error: 'same_player' }, '合併：不能合併到自己');
  has(await call('MF_login_and_merge', { p_player_id: A2.player_id, p_token: A2.token, p_nick: '小明', p_pin: '0000' }), { error: 'wrong_pin' }, '合併：目標密碼錯（會計入限速）');
  ok((await player(A.player_id)).fail_count >= 1, '合併：打錯目標帳號密碼有計入限速');
  // 成功
  const m = await call('MF_login_and_merge', { p_player_id: A2.player_id, p_token: A2.token, p_nick: '小明', p_pin: '4321' });
  has(m, { ok: true, player_id: A.player_id, nick: '小明' }, '合併：成功，回傳目標帳號的 player_id');
  ok((await call('MF_whoami', { p_player_id: A.player_id, p_token: m.token })).ok, '合併：發的是目標帳號的新憑證');
  eq((await call('MF_whoami', { p_player_id: A2.player_id, p_token: A2.token })).error, 'bad_token', '合併：來源帳號的憑證失效');
  eq((await q('select count(*)::int as n from public."MF_players" where player_id = $1::uuid', [A2.player_id]))[0].n, 0, '合併：來源帳號已刪除');
  has(await call('MF_check_nick', { p_nick: '小明417' }), { state: 'free' }, '合併：來源的暱稱釋出');
  const sp = (await call('MF_get_top', { p_game_id: 'speed', p_player_id: A.player_id })).top.filter(x => x.nick === '小明');
  eq(sp, [{ rank: sp[0].rank, nick: '小明', score: 0.07, mine: true }], '合併：speed 成績取較好的（0.07 比 0.09 好），只有一列');
  ok(((await call('MF_get_top', { p_game_id: 'cake', p_player_id: A.player_id })).top || []).some(x => x.mine && x.score === 5), '合併：只有來源有的 cake 成績搬到目標');
  const bb = await q(`select game_id, best_score, best_level from public."MF_player_bests" where player_id = $1::uuid and game_id in ('speed','cake') order by game_id`, [A.player_id]);
  eq(bb.map(b => [b.game_id, Number(b.best_score), b.best_level]), [['cake', 5, 2], ['speed', 0.07, 9]], '合併：個人最佳取較好（speed 成績取小 0.07、關卡取大 9）');
  const rt = await q(`select game_id, stars from public."MF_ratings" where player_id = $1::uuid order by game_id`, [A.player_id]);
  ok(rt.some(r => r.game_id === 'cake') && rt.filter(r => r.game_id === 'speed').length === 1, '合併：評價搬過去，撞到同一天同一款的留在原地：' + canon(rt));
  eq((await q(`select count(*)::int as n from public."MF_feedback" where player_id = $1::uuid and message = $2`, [A.player_id, '第二個帳號寫的意見']))[0].n, 1, '合併：意見改掛到目標帳號');
  A.token = m.token;

  // 個人最佳同步
  const P = A.player_id, T = A.token;
  const sync = (items) => call('MF_sync_bests', { p_player_id: P, p_token: T, p_items: items });
  eq(await call('MF_sync_bests', { p_player_id: P, p_token: 'x', p_items: [] }), { ok: false, error: 'bad_token' }, '同步：沒憑證');
  let r = await sync([]);
  ok(r.ok && Array.isArray(r.items) && Array.isArray(r.rejected), '同步：空陣列＝只下載');
  const get = (res, g) => res.items.find(x => x.g === g);
  r = await sync([{ g: 'zz_test', s: 10, lv: 3 }, { g: 'speed', s: 0.05, lv: 7 }, { g: 'spot', lv: 20 }]);
  has(get(r, 'zz_test'), { b: 'max', s: 10, lv: 3 }, '同步：新增 zz_test（越大越好）');
  has(get(r, 'speed'), { b: 'min', s: 0.05, lv: 9 }, '同步：speed 成績 0.05 比 0.07 好（越小越好）；關卡 7 比 9 小，維持 9');
  has(get(r, 'spot'), { b: 'max', lv: 20 }, '同步：只給關卡也可以');
  r = await sync([{ g: 'zz_test', s: 5, lv: 8 }, { g: 'speed', s: 0.5, lv: 1 }]);
  has(get(r, 'zz_test'), { s: 10, lv: 8 }, '同步：zz_test 成績 5 比 10 差（max）不變；關卡 8 比 3 大，更新');
  has(get(r, 'speed'), { s: 0.05, lv: 9 }, '同步：speed 成績 0.5 比 0.05 差（min）不變');
  r = await sync([{ g: 'zz_test', s: 1e9 }, { g: 'nope', s: 1 }, { g: 'speed', s: -5 }, { g: 'speed', lv: 0 }, { g: 'speed', lv: 201 }, { g: 'speed', lv: 2.5 }, { g: 'speed', s: '3' }]);
  eq([...r.rejected].sort(), ['nope', 'speed', 'speed', 'speed', 'speed', 'zz_test'].sort(), '同步：超出範圍／不存在的遊戲／關卡不合格的項目被拒收（字串成績直接忽略）：' + canon(r.rejected));
  has(get(r, 'speed'), { s: 0.05, lv: 9 }, '同步：被拒收的項目不影響原本的資料');
  eq((await sync(Array.from({ length: 401 }, () => ({ g: 'speed', s: 1 })))), { ok: false, error: 'bad_args' }, '同步：一次最多 400 項');
  // 可交換性：兩台裝置的順序顛倒，結果一樣
  const dev1 = [{ g: 'cake', s: 3, lv: 5 }, { g: 'speed', s: 0.04, lv: 2 }], dev2 = [{ g: 'cake', s: 9, lv: 1 }, { g: 'speed', s: 0.06, lv: 12 }];
  await sync(dev1); const x1 = await sync(dev2);
  await db.query(`delete from public."MF_player_bests" where player_id = $1::uuid and game_id in ('cake','speed')`, [P]);
  await sync(dev2); const x2 = await sync(dev1);
  eq([get(x1, 'cake'), get(x1, 'speed')], [get(x2, 'cake'), get(x2, 'speed')], '同步：兩台裝置先後順序顛倒，結果相同（合併可交換）');
  has(get(x2, 'cake'), { s: 9, lv: 5 }, '同步：cake 成績取大 9、關卡取大 5');
  has(get(x2, 'speed'), { s: 0.04, lv: 12 }, '同步：speed 成績取小 0.04、關卡取大 12');
  // 停用的遊戲不收
  await db.exec(`update public."MF_games" set enabled = false where game_id = 'cake'`);
  ok((await sync([{ g: 'cake', s: 99 }])).rejected.includes('cake'), '同步：停用的遊戲被拒收');
  await db.exec(`update public."MF_games" set enabled = true where game_id = 'cake'`);
  // 帳號刪除時最佳紀錄、憑證、成績一起刪（外鍵 cascade）
}

// ─── 六、管理函式與權限 ───
{
  // anon 不能呼叫管理函式、內部函式；舊函式不存在
  for (const q of [`select public."MF_admin_reset_pin"('小明', '0000')`, `select public."MF_admin_merge"('a', 'b')`, `select public."MF_admin_release_nick"('小明')`,
    `select public."MF_admin_delete_player"('小明')`, `select public."MF__auth"('${uuid(1)}', 'x')`, `select public."MF__check_pin"('${uuid(1)}', '1234')`,
    `select public."MF__merge_player"('${uuid(1)}', '${uuid(2)}')`, `select public."MF__write_score"('speed', '${uuid(1)}', 1)`, `select public."MF__hash_pin"('1234')`,
    `select public."MF__new_session"('${uuid(1)}')`, `select public."MF__nick_key"('x')`, `select public."MF__find_player"('小明')`]) {
    const r = await asAnon(q);
    ok(r.sqlError && /permission denied/i.test(r.sqlError), 'anon 不能呼叫：' + q.slice(0, 60) + ' → ' + (r.sqlError || '').slice(0, 60));
  }
  for (const t of ['MF_players', 'MF_sessions', 'MF_player_bests', 'MF_player_merges', 'MF_players_admin', 'MF_scores', 'MF_games']) {
    const r = await asAnon('select * from public."' + t + '"');
    ok(r.sqlError && /permission denied/i.test(r.sqlError), 'anon 不能直接讀：' + t);
  }
  for (const w of [`update public."MF_players" set claimed = true`, `delete from public."MF_sessions"`, `insert into public."MF_player_bests"(player_id, game_id) values ('${uuid(1)}','speed')`]) {
    const r = await asAnon(w);
    ok(r.sqlError && /permission denied/i.test(r.sqlError), 'anon 不能直接寫：' + w.slice(0, 50));
  }
  // 管理函式（以資料庫管理者身分呼叫，就像你在 SQL Editor 一樣）
  const adm = async (fn, ...a) => (await one(`select public."${fn}"(${a.map((_, i) => '$' + (i + 1)).join(',')}) as r`, a)).r;
  // reset_pin：重設密碼、登出所有裝置、清失敗計數
  await db.query(`update public."MF_players" set fail_count = 4, lock_level = 2, locked_until = now() + interval '1 hour' where player_id = $1::uuid`, [A.player_id]);
  has(await adm('MF_admin_reset_pin', '小明', '7777'), { ok: true, player_id: A.player_id }, '管理：重設密碼（用暱稱）');
  eq((await q('select count(*)::int as n from public."MF_sessions" where player_id = $1::uuid', [A.player_id]))[0].n, 0, '管理：重設密碼後所有裝置登出');
  ok((await call('MF_login', { p_nick: '小明', p_pin: '7777' })).ok, '管理：新密碼可以登入（鎖定也一併解除）');
  eq(await adm('MF_admin_reset_pin', '不存在', '7777'), { ok: false, error: 'no_such_player' }, '管理：重設不存在的玩家');
  eq(await adm('MF_admin_reset_pin', '小明', '12'), { ok: false, error: 'bad_pin' }, '管理：密碼格式錯');
  has(await adm('MF_admin_reset_pin', A.player_id, '7777'), { ok: true }, '管理：也可以用 player_id 找人');
  // release_nick：已認領的暱稱改成「原暱稱＋隨機數」；未認領的提前結束保留
  const rel = await adm('MF_admin_release_nick', '丙丙');
  ok(rel.ok && /^丙丙\d{3}$/.test(rel.new), '管理：釋出已建立帳號的暱稱 → ' + rel.new);
  has(await call('MF_check_nick', { p_nick: '丙丙' }), { state: 'free' }, '管理：釋出之後那個暱稱是 free');
  await db.query(`insert into public."MF_players"(player_id, nickname, nick_key, claimed, reserved_until) values ($1::uuid, '待釋出', '待釋出', false, now() + interval '30 days')`, [uuid(7001)]);
  ok((await adm('MF_admin_release_nick', '待釋出')).ok && (await call('MF_check_nick', { p_nick: '待釋出' })).state === 'free', '管理：提前結束舊玩家的暱稱保留');
  // merge：管理者手動合併
  tick(); const X = await call('MF_register', { p_nick: '甲甲甲', p_pin: '1111', p_game_id: 'hangpic', p_score: 4 });
  tick(); const Y = await call('MF_register', { p_nick: '乙乙乙', p_pin: '2222', p_game_id: 'hangpic', p_score: 6 });
  has(await adm('MF_admin_merge', '甲甲甲', '乙乙乙'), { ok: true, from: X.player_id, into: Y.player_id }, '管理：手動合併');
  ok((await q('select count(*)::int as n from public."MF_players" where player_id = $1::uuid', [X.player_id]))[0].n === 0, '管理：合併後來源消失');
  eq(await adm('MF_admin_merge', '乙乙乙', '乙乙乙'), { ok: false, error: 'same_player' }, '管理：不能合併到自己');
  eq(await adm('MF_admin_merge', '乙乙乙', '沒有'), { ok: false, error: 'no_such_player' }, '管理：找不到玩家');
  // delete_player：成績、最佳、憑證跟著刪
  await call('MF_sync_bests', { p_player_id: Y.player_id, p_token: Y.token, p_items: [{ g: 'hangpic', lv: 3 }] });
  has(await adm('MF_admin_delete_player', '乙乙乙'), { ok: true }, '管理：刪除帳號');
  const left = (await one(`select (select count(*) from public."MF_scores" where player_id = $1::uuid)::int as s, (select count(*) from public."MF_player_bests" where player_id = $1::uuid)::int as b, (select count(*) from public."MF_sessions" where player_id = $1::uuid)::int as t`, [Y.player_id]));
  eq(left, { s: 0, b: 0, t: 0 }, '管理：刪除帳號後成績、最佳紀錄、憑證都沒了');
  // 中文欄位的檢視表
  const cols = (await db.query('select * from public."MF_players_admin" limit 1')).fields.map(f => f.name);
  eq(cols, ['暱稱', '狀態', '玩家編號', '首次出現', '建立密碼時間', '最後登入', '暱稱保留到', '密碼鎖定到', '連續打錯次數', '榜上成績數', '登入中的裝置數'], '管理：MF_players_admin 的欄位名稱都是中文');
  ok(!cols.includes('pin_hash') && !cols.includes('token_hash'), '管理：檢視表沒有密碼雜湊與憑證');
  const cm = (await one(`select obj_description('public."MF_players"'::regclass) as c`)).c;
  ok(/玩家身分/.test(cm), '管理：資料表有中文說明：' + cm);
  const cc = (await one(`select col_description('public."MF_players"'::regclass, (select attnum from pg_attribute where attrelid = 'public."MF_players"'::regclass and attname = 'nick_key')) as c`)).c;
  ok(/比對鍵/.test(cc || ''), '管理：欄位有中文說明');
  // 再執行整份 SQL 不會弄壞既有玩家與憑證
  const nBefore = (await q('select count(*)::int as n from public."MF_players"'))[0].n, sBefore = (await q('select count(*)::int as n from public."MF_sessions"'))[0].n;
  await db.exec(sql);
  eq([(await q('select count(*)::int as n from public."MF_players"'))[0].n, (await q('select count(*)::int as n from public."MF_sessions"'))[0].n], [nBefore, sBefore], '重新執行 SQL：玩家與憑證都還在');
  ok((await call('MF_login', { p_nick: '小明', p_pin: '7777' })).ok, '重新執行 SQL：原本的密碼還能登入');
}

console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS（' + total + ' 項檢查）');
process.exit(bad ? 1 : 0);
