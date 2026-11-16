// 驗證 supabase/MF_leaderboard.sql 第 7B 節「遊玩統計」（V1.39.0）：在 PGlite（真正的 PostgreSQL，跑在 WASM）裡執行整份 SQL，
// 再用「anon 角色」模擬網頁訪客呼叫函式，檢查：
//   · 權限：anon 不能直接讀寫 MF_play_days、不能呼叫內部函式 MF__stats_range，只能呼叫 MF_log_plays 與三個 MF_stats_*；
//   · MF_log_plays：參數檢查（bad_args）、不合格的筆數略過、日期窗（最近 3 天～明天）、局數上限、同一天同一款同一個人累加、全站每分鐘上限（busy）；
//   · MF_stats_games／MF_stats_daily：期間內的局數與不重複玩家、平均星數、世界第一名、期間預設與對調與上限、回傳不含 player_id；
//   · MF_stats_players：每位玩家上榜的款數與名次、排序、依達成日期篩選、不含 player_id。
//   · 第 7C 節 MF_dev_player_history／MF_dev_clear_player_history（admin/stats.html 的「清除玩家遊戲歷程」）：只有 MF_dev_accounts 清單裡的測試帳號能查、能刪（外部玩家一律 not_allowed）、
//     暱稱與編號要同時對得上、日期範圍（最長 400 天）、只刪範圍內與這一位玩家的資料（世界榜成績、個人最佳、遊玩統計）、重複刪除安全、不含別人的資料。
// 用法：test/leaderboard 底下先 npm install，再 node stats_sql_test.mjs
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';

import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') + '/';   // 專案根目錄
const sql = fs.readFileSync(ROOT + 'supabase/MF_leaderboard.sql', 'utf8');

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.fromEntries(Object.keys(x).sort().map(kk => [kk, x[kk]])) : x);
const eq = (a, b, m) => ok(canon(a) === canon(b), m + '  期望 ' + canon(b) + ' 實際 ' + canon(a));

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec('create role anon nologin; create role authenticated nologin;');
await db.exec(sql);
await db.exec(sql);        // 第二次執行：必須不報錯（冪等）
console.log('SQL 連續執行兩次都成功');

async function asAnon(query, params) {
  await db.exec('set role anon');
  try { return (await db.query(query, params)).rows; }
  catch (e) { return { sqlError: String(e.message || e) }; }
  finally { await db.exec('reset role'); }
}
const uuid = (i) => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');
const tp = async (offset = 0) => (await db.query(`select ((now() at time zone 'Asia/Taipei')::date + $1::int)::text as d`, [offset])).rows[0].d;   // 台灣日期（今天 + offset）
const log = async (pid, items) => (await asAnon('select public."MF_log_plays"($1::uuid, $2::jsonb) as r', [pid, JSON.stringify(items)]))[0].r;
const stats = async (fn, a, b) => (await asAnon(`select public."${fn}"($1::date, $2::date) as r`, [a ?? null, b ?? null]))[0].r;
const plays = async (where = 'true') => (await db.query(`select day::text, game_id, player_id::text, plays from public."MF_play_days" where ${where} order by day, game_id, player_id`)).rows;
const T0 = await tp(0), Tm1 = await tp(-1), Tm2 = await tp(-2), Tm3 = await tp(-3), Tm4 = await tp(-4), Tp1 = await tp(1), Tp2 = await tp(2);

// ═══ A. 權限 ═══
for (const q of ['select * from public."MF_play_days"', `insert into public."MF_play_days"(day,game_id,player_id) values ('${T0}','speed','${uuid(1)}')`,
  'update public."MF_play_days" set plays = 99', 'delete from public."MF_play_days"', `select public."MF__stats_range"(null, null)`]) {
  const r = await asAnon(q);
  ok(r.sqlError && /permission denied/i.test(r.sqlError), 'anon 直接碰資料表／內部函式應被擋：' + q.slice(0, 60) + ' → ' + JSON.stringify(r).slice(0, 80));
}
for (const f of ['MF_log_plays', 'MF_stats_games', 'MF_stats_daily', 'MF_stats_players']) {
  const g = (await db.query(`select has_function_privilege('anon', p.oid, 'execute') as a, has_function_privilege('authenticated', p.oid, 'execute') as b, p.prosecdef as sd, p.proconfig::text as cfg
                               from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [f])).rows[0];
  ok(g && g.a && g.b && g.sd && /search_path=/.test(g.cfg), f + '：anon／authenticated 可以呼叫、是 security definer、固定了 search_path');
}
const pub = (await db.query(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname in ('MF_log_plays','MF_stats_games','MF_stats_daily','MF_stats_players','MF__stats_range')
                                and has_function_privilege('public', p.oid, 'execute')`)).rows[0].n;
ok(pub === 0, '沒有任何一個新函式對 public 開放執行（' + pub + '）');

// ═══ B. MF_log_plays：參數 ═══
eq(await log(null, [{ day: T0, game_id: 'speed', n: 1 }]), { ok: false, error: 'bad_args' }, '沒給玩家代號');
eq((await asAnon('select public."MF_log_plays"($1::uuid, null) as r', [uuid(1)]))[0].r, { ok: false, error: 'bad_args' }, '沒給 items');
eq(await log(uuid(1), []), { ok: false, error: 'bad_args' }, '空陣列');
eq((await asAnon(`select public."MF_log_plays"($1::uuid, '{"day":"x"}'::jsonb) as r`, [uuid(1)]))[0].r, { ok: false, error: 'bad_args' }, '不是陣列');
eq(await log(uuid(1), Array.from({ length: 51 }, () => ({ day: T0, game_id: 'speed', n: 1 }))), { ok: false, error: 'bad_args' }, '超過 50 筆');
eq(await log(uuid(1), Array.from({ length: 50 }, (_, i) => ({ day: T0, game_id: i % 2 ? 'speed' : 'spot', n: 1 }))), { ok: true, saved: 50 }, '剛好 50 筆可以（同一款同一天會累加）');
ok((await plays()).length === 2 && (await plays()).every(x => x.plays === 25), '50 筆累加成兩列、各 25 局：' + canon(await plays()));
await db.exec('delete from public."MF_play_days"');

// 不合格的筆數略過、合格的照寫、整體還是 ok
const mixed = [
  { day: T0, game_id: 'speed', n: 2 },                       // ✓
  { day: T0, game_id: 'nope', n: 1 },                        // 沒登記的遊戲
  { day: Tm3, game_id: 'spot', n: 1 },                       // ✓ 3 天前（上限）
  { day: Tm4, game_id: 'spot', n: 1 },                       // 太舊
  { day: Tp1, game_id: 'drop', n: 1 },                       // ✓ 明天（時差容許）
  { day: Tp2, game_id: 'drop', n: 1 },                       // 太未來
  { day: T0, game_id: 'cups', n: 0 },                        // 局數 0
  { day: T0, game_id: 'cups', n: -3 },                       // 負的
  { day: T0, game_id: 'cups', n: 'abc' },                    // 不是數字
  { day: 'not-a-date', game_id: 'cups', n: 1 },              // 日期壞掉
  { day: T0, n: 1 },                                         // 沒有遊戲
  { day: T0, game_id: 'coins' },                             // 沒有局數
  { game_id: 'coins', n: 1 },                                // 沒有日期
  'garbage', null, 42,                                       // 根本不是物件
  { day: T0, game_id: 'zz_test', n: 1 }                      // zz_test 是測試用遊戲（有登記）→ ✓
];
const rm = await log(uuid(1), mixed);
ok(rm.ok === true && rm.saved === 4, '不合格的略過、合格的 4 筆都寫入：' + canon(rm));
eq((await plays()).map(x => x.day + '|' + x.game_id + '|' + x.plays), [Tm3 + '|spot|1', T0 + '|speed|2', T0 + '|zz_test|1', Tp1 + '|drop|1'].sort(), '寫進去的內容');
await db.exec('delete from public."MF_play_days"');

// 停用的遊戲不收；局數上限；累加與每天上限
await db.exec(`update public."MF_games" set enabled = false where game_id = 'coins'`);
eq(await log(uuid(1), [{ day: T0, game_id: 'coins', n: 1 }]), { ok: true, saved: 0 }, '停用的遊戲不收');
await db.exec(`update public."MF_games" set enabled = true where game_id = 'coins'`);
await log(uuid(2), [{ day: T0, game_id: 'speed', n: 100000 }]);
ok((await plays())[0].plays === 500, '單筆局數上限 500（收到 100000 當成 500）');
await log(uuid(2), [{ day: T0, game_id: 'speed', n: 500 }]); await log(uuid(2), [{ day: T0, game_id: 'speed', n: 500 }]); await log(uuid(2), [{ day: T0, game_id: 'speed', n: 500 }]);
await log(uuid(2), [{ day: T0, game_id: 'speed', n: 500 }]); await log(uuid(2), [{ day: T0, game_id: 'speed', n: 500 }]); await log(uuid(2), [{ day: T0, game_id: 'speed', n: 500 }]);
ok((await plays())[0].plays === 3000, '同一個人、同一天、同一款最多累積 3000 局（' + (await plays())[0].plays + '）');
await log(uuid(3), [{ day: T0, game_id: 'speed', n: 2 }]); await log(uuid(3), [{ day: T0, game_id: 'speed', n: 3 }]);
ok((await plays(`player_id = '${uuid(3)}'`))[0].plays === 5 && (await plays(`player_id = '${uuid(3)}'`)).length === 1, '同一天同一款同一個人：累加成一列（2＋3＝5）');
await db.exec('delete from public."MF_play_days"');

// 全站每分鐘上限：先用管理者身分塞 3000 列（updated_at＝現在），之後的呼叫回 busy；一分鐘前的不算
await db.exec(`insert into public."MF_play_days"(day, game_id, player_id, plays)
               select current_date, 'speed', ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 1 from generate_series(1, 3000) g`);
eq(await log(uuid(9999), [{ day: T0, game_id: 'speed', n: 1 }]), { ok: false, error: 'busy' }, '全站這一分鐘已經寫入 3000 列 → busy');
await db.exec(`update public."MF_play_days" set updated_at = now() - interval '2 minutes'`);
eq(await log(uuid(9999), [{ day: T0, game_id: 'speed', n: 1 }]), { ok: true, saved: 1 }, '超過一分鐘前的不算，又可以寫了');
await db.exec('delete from public."MF_play_days"');

// ═══ C. 範圍函式（內部）：預設、對調、上限 ═══
const rng = async (a, b) => { const x = (await db.query('select (public."MF__stats_range"($1::date, $2::date))[1]::text as lo, (public."MF__stats_range"($1::date, $2::date))[2]::text as hi', [a ?? null, b ?? null])).rows[0]; return [x.lo, x.hi]; };
{
  const r0 = await rng(null, null);
  eq(r0, [await tp(-29), T0], '都沒給：最近 30 天到今天（台灣日期）');
  eq(await rng('2026-10-01', '2026-10-30'), ['2026-10-01', '2026-10-30'], '有給就照給的');
  eq(await rng('2026-10-30', '2026-10-01'), ['2026-10-01', '2026-10-30'], '起迄顛倒會對調');
  eq(await rng('2026-10-05', null), ['2026-10-05', T0], '只給起點：到今天');
  eq(await rng(null, '2026-10-30'), ['2026-10-01', '2026-10-30'], '只給終點：往前 30 天');
  eq(await rng('2020-01-01', '2026-10-30'), [(await db.query(`select ('2026-10-30'::date - 400)::text as d`)).rows[0].d, '2026-10-30'], '最長 400 天（超過的截掉起點）');
  eq(await rng('2026-10-30', '2026-10-30'), ['2026-10-30', '2026-10-30'], '同一天');
}

// ═══ D. 統計函式：遊戲分析、時間分析 ═══
// 資料（日期是「今天 + 偏移」）：
//   玩家 1：今天 speed 3 局、spot 2 局；昨天 speed 1 局
//   玩家 2：今天 speed 4 局；昨天 spot 5 局
//   玩家 3：2 天前 speed 2 局；40 天前 speed 9 局（期間外）
//   玩家 4：昨天 drop 1 局
const ins = (d, g, p, n) => db.query('insert into public."MF_play_days"(day, game_id, player_id, plays) values ($1::date, $2, $3::uuid, $4)', [d, g, uuid(p), n]);
await ins(T0, 'speed', 1, 3); await ins(T0, 'spot', 1, 2); await ins(Tm1, 'speed', 1, 1);
await ins(T0, 'speed', 2, 4); await ins(Tm1, 'spot', 2, 5);
await ins(Tm2, 'speed', 3, 2); await ins(await tp(-40), 'speed', 3, 9);
await ins(Tm1, 'drop', 4, 1);
// 五星評價：speed 今天 2 筆（5、4）、40 天前 1 筆（1）；spot 昨天 1 筆（3）
const rate = (g, p, stars, d) => db.query('insert into public."MF_ratings"(game_id, player_id, stars, rated_on) values ($1, $2::uuid, $3, $4::date)', [g, uuid(p), stars, d]);
await rate('speed', 1, 5, T0); await rate('speed', 2, 4, T0); await rate('speed', 3, 1, await tp(-40)); await rate('spot', 1, 3, Tm1);
// 排行榜（直接放資料）與玩家：speed 的第 1 名是「小花」0.1234 秒；spot 第 1 名是 14 分（max）
await db.query(`insert into public."MF_players"(player_id, nickname, nick_key, claimed, pin_hash) values ($1::uuid, '小花', 'xh', true, 'x'), ($2::uuid, '阿明', 'am', true, 'x'), ($3::uuid, null, null, false, null)`, [uuid(101), uuid(102), uuid(103)]);
await db.query(`insert into public."MF_scores"(game_id, player_id, score, rank_key, achieved_at) values
  ('speed', $1::uuid, 0.1234, 0.1234, now() - interval '5 days'), ('speed', $2::uuid, 0.5, 0.5, now() - interval '1 day'), ('speed', $3::uuid, 2.5, 2.5, now() - interval '40 days'),
  ('spot',  $2::uuid, 14, -14, now() - interval '1 day'), ('spot', $1::uuid, 9, -9, now() - interval '5 days')`, [uuid(101), uuid(102), uuid(103)]);

const gs = await stats('MF_stats_games', await tp(-29), T0);
ok(gs.from === await tp(-29) && gs.to === T0 && Array.isArray(gs.games), 'MF_stats_games 回傳 from／to／games');
const G = Object.fromEntries(gs.games.map(g => [g.game_id, g]));
ok(gs.games.length > 100 && gs.games.every(g => g.title && ['min', 'max'].includes(g.better)), '每一款啟用中的遊戲都有一列（' + gs.games.length + ' 款），帶名稱與 better');
ok(G.speed.plays === 3 + 1 + 4 + 2 && G.speed.players === 3, 'speed：期間內 10 局、3 個玩家（40 天前的 9 局不算）：' + canon(G.speed));
ok(G.spot.plays === 7 && G.spot.players === 2 && G.drop.plays === 1 && G.drop.players === 1, 'spot 7 局 2 人、drop 1 局 1 人');
ok(G.cups.plays === 0 && G.cups.players === 0 && G.cups.stars_avg === null && G.cups.stars_cnt === 0 && G.cups.best_score === null && G.cups.best_nick === null, '沒人玩、沒評價、沒上榜的遊戲：0／0／null');
ok(G.speed.stars_avg === 4.5 && G.speed.stars_cnt === 2 && G.spot.stars_avg === 3 && G.spot.stars_cnt === 1, '期間內的平均星數：speed (5+4)/2＝4.5（40 天前的 1 星不算）、spot 3');
ok(G.speed.best_score === 0.1234 && G.speed.best_nick === '小花', '世界第一名：speed 0.1234 小花');
ok(G.spot.best_score === 14 && G.spot.best_nick === '阿明' && G.spot.better === 'max', '世界第一名：spot 14 阿明（越大越好）');
ok(!JSON.stringify(gs).includes('00000000-0000-4000-8000'), '回傳裡沒有任何 player_id');
// 範圍影響：只看今天
const g1 = Object.fromEntries((await stats('MF_stats_games', T0, T0)).games.map(g => [g.game_id, g]));
ok(g1.speed.plays === 7 && g1.speed.players === 2 && g1.spot.plays === 2 && g1.drop.plays === 0 && g1.speed.stars_cnt === 2 && g1.spot.stars_cnt === 0, '只看今天：speed 7 局 2 人、spot 2 局、drop 0、評價只算今天的');
// 把範圍拉到 60 天：40 天前的也算
const g60 = Object.fromEntries((await stats('MF_stats_games', await tp(-60), T0)).games.map(g => [g.game_id, g]));
ok(g60.speed.plays === 19 && g60.speed.players === 3 && g60.speed.stars_cnt === 3 && g60.speed.stars_avg === Math.round(10 / 3 * 100) / 100, '60 天：speed 19 局、評價 3 筆平均 3.33');
// 顛倒會對調
const gr = await stats('MF_stats_games', T0, await tp(-29));
ok(gr.from === await tp(-29) && gr.to === T0 && gr.games.find(g => g.game_id === 'speed').plays === 10, '起迄顛倒：自動對調，結果一樣');
// 預設（都不給）＝最近 30 天
const gd = await stats('MF_stats_games');
ok(gd.from === await tp(-29) && gd.to === T0 && gd.games.find(g => g.game_id === 'speed').plays === 10, '都不給：最近 30 天');
// 停用的遊戲不出現
await db.exec(`update public."MF_games" set enabled = false where game_id = 'drop'`);
ok(!(await stats('MF_stats_games')).games.some(g => g.game_id === 'drop'), '停用的遊戲不出現在統計裡');
await db.exec(`update public."MF_games" set enabled = true where game_id = 'drop'`);

const ds = await stats('MF_stats_daily', await tp(-29), T0);
ok(ds.from === await tp(-29) && ds.to === T0, 'MF_stats_daily 回傳的 from／to 是實際用的範圍');
ok(ds.plays === 3 + 2 + 1 + 4 + 5 + 2 + 1 && ds.players === 4, '期間總局數 18、不重複玩家 4：' + canon({ p: ds.plays, n: ds.players }));
eq(ds.days.map(d => [d.day, d.plays, d.players]), [[Tm2, 2, 1], [Tm1, 7, 3], [T0, 9, 2]], '每天：兩天前 2 局 1 人、昨天 7 局 3 人（玩家 1、2、4）、今天 9 局 2 人（玩家 1、2）');
ok(ds.days.length === 3, '沒人玩的日子不出現（' + ds.days.length + ' 天）');
ok(!JSON.stringify(ds).includes('00000000-0000-4000-8000'), '時間分析的回傳裡沒有任何 player_id');
const dEmpty = await stats('MF_stats_daily', await tp(-300), await tp(-290));
ok(dEmpty.plays === 0 && dEmpty.players === 0 && dEmpty.days.length === 0, '期間內沒人玩：0／0／空陣列');
ok((await stats('MF_stats_daily')).days.length === 3, '都不給：最近 30 天');
ok((await stats('MF_stats_daily', '2020-01-01', T0)).from === (await db.query(`select ($1::date - 400)::text as d`, [T0])).rows[0].d, '範圍超過 400 天會被截成 400 天，回傳的 from 是實際用的');

// ═══ E. 玩家分析 ═══
const pl = (await asAnon('select public."MF_stats_players"(null, null) as r'))[0].r;
ok(Array.isArray(pl) && pl.length === 3, '三位玩家有上榜：' + pl.length);
const byNick = Object.fromEntries(pl.map(p => [p.nick || '(空)', p]));
// 阿明：speed 第 2、spot 第 1 → 2 款、最好名次 1；小花：speed 第 1、spot 第 2 → 2 款、最好 1；沒暱稱那位：speed 第 3 → 1 款
eq(byNick['阿明'].ranks, { speed: 2, spot: 1 }, '阿明的名次');
eq(byNick['小花'].ranks, { speed: 1, spot: 2 }, '小花的名次');
ok(byNick['(空)'].ranks.speed === 3 && byNick['(空)'].cnt === 1 && byNick['(空)'].nick === '', '沒有暱稱的玩家：nick 是空字串、1 款');
ok(byNick['阿明'].cnt === 2 && byNick['小花'].cnt === 2 && byNick['阿明'].best === 1 && byNick['小花'].best === 1, 'cnt／best');
ok(pl[0].cnt === 2 && pl[1].cnt === 2 && pl[2].cnt === 1, '依上榜款數多的在前');
ok(pl[0].nick !== pl[1].nick && [pl[0].nick, pl[1].nick].sort().join() === ['小花', '阿明'].sort().join(), '同款數同名次再依暱稱排序（結果穩定）');
ok(!JSON.stringify(pl).includes('00000000-0000-4000-8000'), '玩家分析的回傳裡沒有任何 player_id');
// 依達成日期篩選：只算「最近 3 天內達成」的 → 只剩阿明（speed 1 天前、spot 1 天前）
const plr = (await asAnon('select public."MF_stats_players"($1::date, $2::date) as r', [await tp(-3), T0]))[0].r;
ok(plr.length === 1 && plr[0].nick === '阿明' && plr[0].cnt === 2, '只算最近 3 天內達成的成績：只有阿明（' + canon(plr) + '）');
eq(plr[0].ranks, { speed: 2, spot: 1 }, '篩選後名次仍是目前在整張榜上的名次');
const plr2 = (await asAnon('select public."MF_stats_players"($1::date, $2::date) as r', [await tp(-10), await tp(-4)]))[0].r;
ok(plr2.length === 1 && plr2[0].nick === '小花', '5 天前達成的：只有小花（speed 0.1234、spot 9）：' + canon(plr2));
ok(((await asAnon('select public."MF_stats_players"($1::date, null) as r', [await tp(-50)]))[0].r).length === 3, '只給起點：到現在為止全部');
// 榜上沒有資料：空陣列
await db.exec('delete from public."MF_scores"');
eq((await asAnon('select public."MF_stats_players"(null, null) as r'))[0].r, [], '沒有人上榜：空陣列');

// ═══ F. 冪等：再執行一次整份 SQL，資料與函式都還在 ═══
await db.exec(sql);
ok((await plays()).length === 8 && (await stats('MF_stats_daily')).plays === 18, '再執行整份 SQL：統計資料不受影響');

// ═══ G. 第 7C 節：開發者測試帳號的「查看／清除遊戲歷程」（MF_dev_player_history／MF_dev_clear_player_history）═══
{
  const DEV = '49a65eea-1af7-4220-accf-7d0de93cc2a3', NICK = '阿公好開心', OTHER = uuid(201), OTHER2 = uuid(202), GHOST = uuid(203);
  const hist = async (n, p, a, b) => (await asAnon('select public."MF_dev_player_history"($1::text, $2::uuid, $3::date, $4::date) as r', [n, p, a ?? null, b ?? null]));
  const clr = async (n, p, a, b) => (await asAnon('select public."MF_dev_clear_player_history"($1::text, $2::uuid, $3::date, $4::date) as r', [n, p, a ?? null, b ?? null]));
  const H = async (...a) => (await hist(...a))[0].r, C = async (...a) => (await clr(...a))[0].r;
  const cnt = async (t, where) => (await db.query(`select count(*)::int as n from public."${t}" where ${where}`)).rows[0].n;

  // ── 權限：清單表鎖住、內部函式不開放、兩個新函式開給 anon 但不開給 public、security definer 固定 search_path ──
  for (const q of ['select * from public."MF_dev_accounts"', `insert into public."MF_dev_accounts"(player_id) values ('${OTHER}')`, 'delete from public."MF_dev_accounts"', `select public."MF__dev_target"('x', '${DEV}')`]) {
    const r = await asAnon(q);
    ok(r.sqlError && /permission denied/i.test(r.sqlError), 'anon 不能碰測試帳號清單／內部函式：' + q.slice(0, 60) + ' → ' + JSON.stringify(r).slice(0, 80));
  }
  for (const f of ['MF_dev_player_history', 'MF_dev_clear_player_history']) {
    const g = (await db.query(`select has_function_privilege('anon', p.oid, 'execute') as a, has_function_privilege('authenticated', p.oid, 'execute') as b, has_function_privilege('public', p.oid, 'execute') as pub, p.prosecdef as sd, p.proconfig::text as cfg
                                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [f])).rows[0];
    ok(g && g.a && g.b && !g.pub && g.sd && /search_path=/.test(g.cfg), f + '：anon／authenticated 可以呼叫、public 不行、security definer、固定了 search_path');
  }
  ok((await db.query(`select has_function_privilege('public', p.oid, 'execute') as pub from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'MF__dev_target'`)).rows[0].pub === false, '內部函式 MF__dev_target 不對 public 開放');
  ok((await cnt('MF_dev_accounts', `player_id = '${DEV}'`)) === 1 && (await cnt('MF_dev_accounts', 'true')) === 1, '測試帳號清單：預先放好「阿公好開心」的編號，連續執行 SQL 兩次也只有一列');

  // ── 資料：開發者本人（有暱稱）、外部玩家兩位（一位在清單外、一位連暱稱都對得上），開發者另有一個「清單裡但沒有玩家資料」的編號 ──
  await db.exec('delete from public."MF_scores"; delete from public."MF_player_bests"; delete from public."MF_play_days"; delete from public."MF_players";');
  await db.query(`insert into public."MF_players"(player_id, nickname, nick_key, claimed, pin_hash) values
    ($1::uuid, $2, public."MF__nick_key"($2), true, 'x'), ($3::uuid, '路人甲', public."MF__nick_key"('路人甲'), true, 'x'), ($4::uuid, '路人乙', public."MF__nick_key"('路人乙'), true, 'x')`, [DEV, NICK, OTHER, OTHER2]);
  await db.query(`insert into public."MF_dev_accounts"(player_id, note) values ($1::uuid, '清單裡但沒有玩家資料')`, [GHOST]);
  // 世界榜：speed（越小越好）開發者 0.05（第 1）、路人甲 0.5、路人乙 0.9；spot（越大越好）開發者 99（第 1）、路人甲 9；drop 開發者 77（10 天前達成）、路人甲 7
  await db.query(`insert into public."MF_scores"(game_id, player_id, score, rank_key, achieved_at) values
    ('speed', $1::uuid, 0.05, 0.05, now() - interval '2 days'), ('speed', $2::uuid, 0.5, 0.5, now() - interval '3 days'), ('speed', $3::uuid, 0.9, 0.9, now() - interval '4 days'),
    ('spot',  $1::uuid, 99, -99, now() - interval '1 day'),  ('spot',  $2::uuid, 9, -9, now() - interval '3 days'),
    ('drop',  $1::uuid, 77, -77, now() - interval '10 days'), ('drop',  $2::uuid, 7, -7, now() - interval '3 days')`, [DEV, OTHER, OTHER2]);
  await db.query(`insert into public."MF_player_bests"(player_id, game_id, best_score, best_level, updated_at) values
    ($1::uuid, 'speed', 0.05, 30, now() - interval '2 days'), ($1::uuid, 'spot', 99, 40, now() - interval '1 day'), ($1::uuid, 'drop', 77, 20, now() - interval '10 days'), ($2::uuid, 'speed', 0.5, 5, now() - interval '3 days')`, [DEV, OTHER]);
  const T10 = await tp(-10);
  const insP = (d, g, p, n) => db.query('insert into public."MF_play_days"(day, game_id, player_id, plays) values ($1::date, $2, $3::uuid, $4)', [d, g, p, n]);
  await insP(T0, 'speed', DEV, 3); await insP(T0, 'spot', DEV, 1); await insP(Tm2, 'spot', DEV, 2); await insP(T10, 'drop', DEV, 4);
  await insP(T0, 'speed', OTHER, 5); await insP(Tm2, 'speed', OTHER, 6);
  const T7 = await tp(-7);

  // ── 參數與資格：缺參數、不在清單、暱稱對不上 ──
  for (const [label, args] of [['沒給暱稱', [null, DEV, T7, T0]], ['暱稱是空白', ['   ', DEV, T7, T0]], ['沒給玩家編號', [NICK, null, T7, T0]], ['沒給起始日期', [NICK, DEV, null, T0]], ['沒給結束日期', [NICK, DEV, T7, null]]]) {
    eq(await H(...args), { ok: false, error: 'bad_args' }, '查看：' + label + ' → bad_args');
    eq(await C(...args), { ok: false, error: 'bad_args' }, '刪除：' + label + ' → bad_args');
  }
  for (const [label, n, p] of [['外部玩家（暱稱與編號都對）', '路人甲', OTHER], ['隨便一個不存在的編號', NICK, uuid(999)], ['外部玩家的編號配開發者的暱稱', NICK, OTHER]]) {
    eq(await H(n, p, T7, T0), { ok: false, error: 'not_allowed' }, '查看：' + label + ' → not_allowed（不在測試帳號清單）');
    eq(await C(n, p, T7, T0), { ok: false, error: 'not_allowed' }, '刪除：' + label + ' → not_allowed');
  }
  eq(await H('不是這個暱稱', DEV, T7, T0), { ok: false, error: 'not_found' }, '查看：開發者的編號配錯暱稱 → not_found');
  eq(await C('路人甲', DEV, T7, T0), { ok: false, error: 'not_found' }, '刪除：開發者的編號配別人的暱稱 → not_found（什麼都沒刪）');
  eq(await H(NICK, GHOST, T7, T0), { ok: false, error: 'not_found' }, '清單裡但沒有玩家資料的編號 → not_found');
  ok((await cnt('MF_scores', `player_id = '${DEV}'`)) === 3 && (await cnt('MF_play_days', `player_id = '${DEV}'`)) === 4 && (await cnt('MF_player_bests', `player_id = '${DEV}'`)) === 3, '上面這些被拒絕的刪除，一筆資料都沒動');

  // ── 查看（最近 7 天）：只有範圍內的、帶目前名次；10 天前的不列 ──
  const v = await H(NICK, DEV, T7, T0);
  ok(v.ok === true && v.nick === NICK && v.from === T7 && v.to === T0, '查看：回傳 ok、暱稱、實際用的日期範圍：' + canon({ ok: v.ok, nick: v.nick, from: v.from, to: v.to }));
  eq(v.scores.map(s => [s.game_id, s.score, s.rank, s.top_n]), [['speed', 0.05, 1, 30], ['spot', 99, 1, 30]], '世界榜成績：speed、spot（各是第 1 名）；10 天前達成的 drop 不在範圍內');
  ok(v.scores.every(s => s.title && s.achieved_at), '每一筆都有遊戲名稱與達成時間');
  eq(v.bests.map(b => [b.game_id, b.best_score, b.best_level]), [['speed', 0.05, 30], ['spot', 99, 40]], '個人最佳：speed、spot（drop 是 10 天前更新的，不在範圍內）');
  eq(v.plays.map(p => [p.game_id, p.plays, p.days]), [['speed', 3, 1], ['spot', 3, 2]], '遊玩統計（一款一列，依遊戲代號排）：speed 3 局（1 天）、spot 3 局（2 天）');
  eq(v.days.map(d => [d.day, d.games, d.plays]), [[Tm2, 1, 2], [T0, 2, 4]], '遊玩統計（一天一列）：兩天前 1 款 2 局、今天 2 款 4 局');
  eq(v.counts, { scores: 2, bests: 2, play_rows: 3, plays: 6 }, '筆數：世界榜 2、個人最佳 2、遊玩統計 3 列共 6 局');
  ok(!JSON.stringify(v).includes(OTHER) && !JSON.stringify(v).includes('路人'), '查看的回傳裡沒有別人的編號或暱稱');
  // 範圍拉到 30 天：10 天前的也列出；起迄顛倒會對調
  const v30 = await H(NICK, DEV, await tp(-30), T0);
  eq(v30.counts, { scores: 3, bests: 3, play_rows: 4, plays: 10 }, '30 天：連 10 天前的 drop 也列出（世界榜 3、個人最佳 3、遊玩統計 4 列共 10 局）');
  eq(v30.scores.find(s => s.game_id === 'drop').rank, 1, 'drop 的目前名次也算出來（第 1）');
  const vr = await H(NICK, DEV, T0, T7);
  ok(vr.ok && vr.from === T7 && vr.to === T0 && vr.counts.scores === 2, '起迄顛倒：自動對調，結果一樣');
  const vc = await H(NICK, DEV, '2020-01-01', T0);
  ok(vc.ok && vc.from === (await db.query(`select ($1::date - 400)::text as d`, [T0])).rows[0].d, '範圍超過 400 天會被截成 400 天');
  // 暱稱比對跟遊戲一樣（MF__nick_key：大小寫、全形半形、空白視為相同）：開發者暱稱沒有英文，改用一個含英文的暱稱測
  await db.query(`update public."MF_players" set nickname = 'Dev Test', nick_key = public."MF__nick_key"('Dev Test') where player_id = $1::uuid`, [DEV]);
  ok((await H('dev test', DEV, T7, T0)).ok === true && (await H('ＤＥＶ　ＴＥＳＴ', DEV, T7, T0)).ok === true, '暱稱比對：大小寫、全形半形不分');
  await db.query(`update public."MF_players" set nickname = $2, nick_key = public."MF__nick_key"($2) where player_id = $1::uuid`, [DEV, NICK]);

  // ── 刪除（最近 7 天）：只刪範圍內的、只刪這一位；別人的、範圍外的都在 ──
  const c1 = await C(NICK, DEV, T7, T0);
  ok(c1.ok === true && c1.nick === NICK && c1.from === T7 && c1.to === T0, '刪除：回傳 ok、暱稱、實際用的範圍');
  eq(c1.deleted, { scores: 2, bests: 2, play_rows: 3, plays: 6 }, '刪除了：世界榜 2、個人最佳 2、遊玩統計 3 列共 6 局（跟查看的筆數一樣）');
  eq((await db.query(`select game_id from public."MF_scores" where player_id = '${DEV}'`)).rows.map(r => r.game_id), ['drop'], '開發者剩下 10 天前的 drop 成績（範圍外不動）');
  eq((await db.query(`select game_id from public."MF_player_bests" where player_id = '${DEV}'`)).rows.map(r => r.game_id), ['drop'], '個人最佳也只剩 drop');
  eq((await plays(`player_id = '${DEV}'`)).map(x => x.day + '|' + x.game_id + '|' + x.plays), [T10 + '|drop|4'], '遊玩統計只剩 10 天前的 drop');
  ok((await cnt('MF_scores', `player_id <> '${DEV}'`)) === 4 && (await cnt('MF_player_bests', `player_id <> '${DEV}'`)) === 1 && (await cnt('MF_play_days', `player_id <> '${DEV}'`)) === 2, '外部玩家的世界榜成績 4、個人最佳 1、遊玩統計 2 列，一筆都沒少');
  ok((await cnt('MF_players', 'true')) === 3, '帳號本身都還在（只清歷程，不刪帳號）');
  // 名次還給別人：speed 現在路人甲第 1、路人乙第 2；spot 路人甲第 1
  const top = (await asAnon(`select public."MF_get_top"('speed') as r`))[0].r;
  ok(JSON.stringify(top).includes('路人甲') && !JSON.stringify(top).includes(NICK), '世界榜上已經看不到測試帳號（speed 榜的第 1 名換成路人甲）');
  // 再刪一次＝什麼都沒有；查看＝空的
  eq((await C(NICK, DEV, T7, T0)).deleted, { scores: 0, bests: 0, play_rows: 0, plays: 0 }, '再刪一次：都是 0（重複執行安全）');
  eq((await H(NICK, DEV, T7, T0)).counts, { scores: 0, bests: 0, play_rows: 0, plays: 0 }, '刪完再查看：空的');
  // 30 天的範圍把剩下的 drop 也刪掉
  eq((await C(NICK, DEV, await tp(-30), T0)).deleted, { scores: 1, bests: 1, play_rows: 1, plays: 4 }, '範圍拉到 30 天：刪掉剩下的 drop（成績 1、個人最佳 1、遊玩統計 1 列 4 局）');
  ok((await cnt('MF_scores', `player_id = '${DEV}'`)) === 0 && (await cnt('MF_player_bests', `player_id = '${DEV}'`)) === 0 && (await cnt('MF_play_days', `player_id = '${DEV}'`)) === 0, '開發者的歷程全清了');

  // ── 冪等：再執行整份 SQL，測試帳號清單與資料不受影響 ──
  await db.exec(sql);
  ok((await cnt('MF_dev_accounts', 'true')) === 2 && (await cnt('MF_scores', 'true')) === 4, '再執行整份 SQL：測試帳號清單不重複（DEV 與 GHOST 共 2 列）、其他資料還在');
}

console.log((bad ? bad + ' FAIL / ' : '') + total + ' checks');
console.log(bad ? 'SOME FAILED' : 'ALL PASS');
process.exit(bad ? 1 : 0);
