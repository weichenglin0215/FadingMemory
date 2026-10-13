// 驗證 supabase/MF_leaderboard.sql：在 PGlite（真正的 PostgreSQL，跑在 WASM）裡執行整份 SQL，
// 再用「anon 角色」模擬網頁訪客呼叫三個函式，檢查：
//   權限、參數檢查、前 30 名保留、同分先到先贏、自己刷新自己的成績、改暱稱、可重複執行，
//   以及 3000 次隨機送分對照「獨立寫的參考模型」逐次比對整個榜單。
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';

import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') + '/';   // 專案根目錄
const sql = fs.readFileSync(ROOT + 'supabase/MF_leaderboard.sql', 'utf8');

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
// 比對時不看物件欄位順序（jsonb 回傳的欄位順序跟寫法無關）
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.fromEntries(Object.keys(x).sort().map(kk => [kk, x[kk]])) : x);
const eq = (a, b, m) => ok(canon(a) === canon(b), m + '  期望 ' + canon(b) + ' 實際 ' + canon(a));

const db = new PGlite();
await db.exec('create role anon nologin; create role authenticated nologin;');
await db.exec(sql);
await db.exec(sql);        // 第二次執行：必須不報錯（冪等）
console.log('SQL 連續執行兩次都成功');

// ─── 用 anon 身分呼叫（網頁訪客），出錯時回傳 {sqlError} ───
async function asAnon(query, params) {
  await db.exec('set role anon');
  try { return (await db.query(query, params)).rows; }
  catch (e) { return { sqlError: String(e.message || e) }; }
  finally { await db.exec('reset role'); }
}
const submit = async (g, p, n, s) => (await asAnon('select public."MF_submit_score"($1,$2::uuid,$3,$4::numeric) as r', [g, p, n, s]))[0].r;
const top = async (g, p) => (await asAnon('select public."MF_get_top"($1,$2::uuid) as r', [g, p ?? null]))[0].r;
const uuid = (i) => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');
// 保證每次呼叫的 now() 都不同（PGlite 的時鐘只有毫秒精度）
let lastMs = 0; const tick = () => { let t; do { t = Date.now(); } while (t === lastMs); lastMs = t; };
const sub = async (...a) => { tick(); return submit(...a); };

// ═══ A. 權限：anon 不能直接碰資料表，只能呼叫函式 ═══
for (const q of ['select * from public."MF_scores"', 'select * from public."MF_games"',
  `insert into public."MF_scores"(game_id,player_id,nickname,score,rank_key) values ('speed','${uuid(1)}','x',1,1)`,
  'delete from public."MF_scores"', 'update public."MF_games" set enabled=false']) {
  const r = await asAnon(q);
  ok(r.sqlError && /permission denied/i.test(r.sqlError), 'anon 直接 SQL 應被擋：' + q + ' → ' + JSON.stringify(r).slice(0, 80));
}
ok(Array.isArray(await asAnon('select 1 as x')), 'anon 可以做無害的 select');

// ═══ B. 空榜單與錯誤參數 ═══
let r = await top('speed');
eq(r, { game_id: 'speed', better: 'min', limit: 30, top: [] }, '空榜單');
eq(await top('nope'), null, '不存在的遊戲回傳 null');
eq(await submit('nope', uuid(1), 'a', 1), { ok: false, error: 'unknown_game' }, 'unknown_game');
eq(await submit('speed', uuid(1), 'a', -0.5), { ok: false, error: 'out_of_range' }, '低於下限');
eq(await submit('speed', uuid(1), 'a', 61), { ok: false, error: 'out_of_range' }, '高於上限');
eq(await submit('speed', uuid(1), '', 1), { ok: false, error: 'bad_args' }, '空暱稱');
eq(await submit('speed', uuid(1), '  \n\t ', 1), { ok: false, error: 'bad_args' }, '全空白暱稱');
eq(await submit('speed', null, 'a', 1), { ok: false, error: 'bad_args' }, 'player null');
eq(await submit('speed', uuid(1), 'a', null), { ok: false, error: 'bad_args' }, 'score null');
eq((await asAnon('select count(*)::int as n from public."MF_scores"')).sqlError ? 'denied' : 'x', 'denied', '（拒絕後仍然擋著）');
await db.exec('reset role');
eq((await db.query('select count(*)::int as n from public."MF_scores"')).rows[0].n, 0, '錯誤參數都沒有寫入任何列');

// ═══ C. 基本寫入、暱稱清理、回傳格式 ═══
r = await sub('speed', uuid(1), '  小明\n 同學  ', 0.1234);
ok(r.ok && r.saved && r.rank === 1, '第一筆寫入 saved/rank=1：' + JSON.stringify(r));
eq(r.top, [{ rank: 1, nick: '小明 同學', score: 0.1234, mine: true }], '暱稱去頭尾空白、換行變單一空格、mine=true');
ok(!JSON.stringify(r).includes('player_id') && !JSON.stringify(r).includes(uuid(1)), '回傳內容完全不含 player_id');
r = await top('speed', uuid(2));
eq(r.top[0].mine, false, '別人看這一列 mine=false');
r = await top('speed');
eq(r.top[0].mine, false, '沒帶 player_id 時 mine=false');
// 暱稱超過 8 字會被截斷
r = await sub('speed', uuid(2), '一二三四五六七八九十', 0.2);
eq(r.top.find(x => x.mine).nick, '一二三四五六七八', '暱稱最多 8 個字');
// 範圍邊界值可以寫入
r = await sub('speed', uuid(3), 'edge', 0);
ok(r.ok && r.saved, '下限 0 可寫入');
r = await sub('speed', uuid(4), 'edge', 60);
ok(r.ok && r.saved, '上限 60 可寫入');
// 小數超過 4 位會四捨五入
r = await sub('speed', uuid(5), 'round', 0.123456);
eq(r.top.find(x => x.mine).score, 0.1235, '分數四捨五入到 4 位小數');

// 暱稱裡的零寬字元、文字方向控制字元也要被清掉（用 String.fromCharCode 組字串，避免檔案裡出現看不見的字元）
{
  const inv = (...cs) => String.fromCharCode(...cs);
  r = await sub('speed', uuid(77), 'a' + inv(0x202e) + 'b' + inv(0x200b) + 'c' + inv(0xfeff) + 'd', 0.77);
  eq(r.top.find(x => x.mine).nick, 'a b c d', '暱稱：方向控制字元／零寬字元／BOM 都換成空格');
  r = await sub('speed', uuid(78), inv(0x200b, 0x200b, 0x202e), 0.78);
  eq(r, { ok: false, error: 'bad_args' }, '暱稱只有看不見的字元 → 視為空暱稱');
  await db.exec(`delete from public."MF_scores"`);
}

// ═══ D. 自己刷新自己：只有「嚴格更好」才更新 ═══
await db.exec(`delete from public."MF_scores"`);
await sub('speed', uuid(1), 'A', 0.5);
r = await sub('speed', uuid(1), 'A', 0.6);
ok(r.ok && !r.saved && r.rank === 1 && r.top[0].score === 0.5, '更差的成績不會覆蓋（saved=false，仍是 0.5）');
r = await sub('speed', uuid(1), 'A', 0.5);
ok(r.ok && !r.saved, '同分不算進步（saved=false）');
r = await sub('speed', uuid(1), 'A改', 0.4);
ok(r.saved && r.top.length === 1 && r.top[0].score === 0.4 && r.top[0].nick === 'A改', '更好的成績更新同一列（不新增），暱稱一起更新');
r = await sub('speed', uuid(1), '新名字', 0.9);
ok(!r.saved && r.top[0].nick === '新名字' && r.top[0].score === 0.4, '沒進步但換了暱稱：暱稱更新、分數不變');
// 越大越好的遊戲方向相反
await sub('spot', uuid(1), 'S', 5);
r = await sub('spot', uuid(1), 'S', 3);
ok(!r.saved && r.top[0].score === 5, 'spot：3 比 5 差，不更新');
r = await sub('spot', uuid(1), 'S', 8);
ok(r.saved && r.top[0].score === 8, 'spot：8 比 5 好，更新');
eq((await top('spot')).better, 'max', 'spot better=max');

// ═══ E. 前 30 名：滿 30 後的進出、同分先到先贏 ═══
await db.exec(`delete from public."MF_scores"`);
for (let i = 1; i <= 30; i++) await sub('speed', uuid(i), 'P' + i, i / 100);     // 0.01 ... 0.30
r = await top('speed');
ok(r.top.length === 30 && r.top[0].score === 0.01 && r.top[29].score === 0.3, '滿 30 名');
r = await sub('speed', uuid(31), 'P31', 0.31);
ok(r.ok && !r.saved && r.rank === null && r.top.length === 30, '比第 30 名差：不寫入、rank=null');
r = await sub('speed', uuid(32), 'P32', 0.3);
ok(r.ok && !r.saved && r.rank === null, '與第 30 名同分：後到的擠不掉先到的');
r = await sub('speed', uuid(33), 'P33', 0.295);
ok(r.saved && r.rank === 30 && r.top.length === 30, '勝過第 30 名：進榜，名次 30');
ok(!r.top.some(x => x.nick === 'P30') && r.top[29].nick === 'P33' && r.top[28].nick === 'P29', '原本第 30 名被擠出榜（列已被刪）');
eq((await db.query('select count(*)::int as n from public."MF_scores" where game_id=$1', ['speed'])).rows[0].n, 30, '資料表裡這款遊戲正好 30 列');
r = await sub('speed', uuid(34), 'P34', 0.01);
ok(r.saved && r.rank === 2 && r.top[0].nick === 'P1' && r.top[1].nick === 'P34', '與第 1 名同分：排在先達成的人後面（第 2 名）');
// 已在榜上的人刷新自己（原本第 29 名 → 變第 1 名），列數維持 30
r = await sub('speed', uuid(28), 'P28', 0.001);
ok(r.saved && r.rank === 1 && r.top.length === 30, '榜上的人刷新自己，直接衝第 1');
eq((await db.query('select count(*)::int as n from public."MF_scores" where game_id=$1', ['speed'])).rows[0].n, 30, '刷新自己不增加列數');
// 不同遊戲互不影響
eq((await top('spot')).top.length, 0, 'spot 榜單不受 speed 影響');

// ═══ F. 改暱稱 ═══
await sub('spot', uuid(28), 'P28', 10);
r = (await asAnon('select public."MF_rename_player"($1::uuid,$2) as r', [uuid(28), '改名了'])) [0].r;
eq(r, { ok: true, rows: 2 }, '改暱稱影響這位玩家的所有列（speed、spot 各 1）');
eq((await top('speed', uuid(28))).top.find(x => x.mine).nick, '改名了', 'speed 暱稱已更新');
eq((await top('spot', uuid(28))).top.find(x => x.mine).nick, '改名了', 'spot 暱稱已更新');
eq((await asAnon('select public."MF_rename_player"($1::uuid,$2) as r', [uuid(28), ' '])) [0].r, { ok: false, error: 'bad_args' }, '空暱稱改名被拒');
eq((await asAnon('select public."MF_rename_player"($1::uuid,$2) as r', [uuid(999), 'x'])) [0].r, { ok: true, rows: 0 }, '不存在的玩家改名：rows=0');

// ═══ G. 停用的遊戲 ═══
await db.exec(`update public."MF_games" set enabled=false where game_id='zz_test'`);
eq(await top('zz_test'), null, '停用遊戲讀取回傳 null');
eq(await submit('zz_test', uuid(1), 'a', 1), { ok: false, error: 'unknown_game' }, '停用遊戲不能寫入');
await db.exec(`update public."MF_games" set enabled=true where game_id='zz_test'`);

// ═══ H. 隨機壓力測試：對照獨立寫的參考模型 ═══
await db.exec(`delete from public."MF_scores"`);
let seed = 20261007; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const specs = { speed: { better: 'min', min: 0, max: 60, N: 30 }, spot: { better: 'max', min: 1, max: 200, N: 30 }, zz_test: { better: 'max', min: 0, max: 1000, N: 30 } };
// 模型：每款遊戲記「每位玩家歷來最佳 + 達成時間（呼叫序號）」，榜單＝依 (好壞, 時間) 排序取前 N
const model = { speed: new Map(), spot: new Map(), zz_test: new Map() };
const key = (g, s) => specs[g].better === 'min' ? s : -s;
let step = 0, savedCount = 0, rejectedCount = 0;
for (let n = 0; n < 3000; n++) {
  const g = ['speed', 'spot', 'zz_test'][Math.floor(rnd() * 3)];
  const sp = specs[g], p = 1 + Math.floor(rnd() * 90);
  // speed 用 4 位小數；spot 用小整數（製造大量同分）；zz_test 用 0.5 的倍數
  let s = g === 'speed' ? Math.round(rnd() * 600) / 10000 * 10 : g === 'spot' ? 1 + Math.floor(rnd() * 25) : Math.floor(rnd() * 120) / 2;
  s = Math.round(s * 10000) / 10000;
  const nick = 'N' + p + '_' + (rnd() < 0.2 ? n : '');
  step++;
  const res = await sub(g, uuid(p), nick, s);
  // 模型更新
  const m = model[g]; const cur = m.get(p);
  let expectSaved;
  const board = () => [...m.entries()].map(([pid, v]) => ({ pid, k: key(g, v.score), t: v.t, score: v.score }))
    .sort((a, b) => a.k - b.k || a.t - b.t).slice(0, sp.N);
  const before = board();
  const inBefore = before.some(x => x.pid === p);
  if (!cur || key(g, s) < key(g, cur.score)) {
    m.set(p, { score: s, t: step });
    expectSaved = board().some(x => x.pid === p);
    // 若沒有進榜，DB 不會保留這位玩家的列；模型保留「歷來最佳」，兩者在「進榜與否」上等價（見測試說明）
  } else expectSaved = false;
  // 若這位玩家在 DB 裡本來就有列（inBefore）而且更好 → 一定 saved；若本來沒列 → 看是否擠進前 30
  ok(res.ok === true, '#' + n + ' ok');
  if (res.saved !== expectSaved) { ok(false, `#${n} ${g} p${p} s=${s} saved=${res.saved} 期望 ${expectSaved}`); }
  const exp = board().map((x, i) => ({ rank: i + 1, score: x.score, mine: x.pid === p }));
  const got = res.top.map(x => ({ rank: x.rank, score: x.score, mine: x.mine }));
  if (JSON.stringify(exp) !== JSON.stringify(got)) { ok(false, `#${n} ${g} 榜單不一致\n  期望 ${JSON.stringify(exp.slice(0, 5))}…\n  實際 ${JSON.stringify(got.slice(0, 5))}…`); break; }
  if (res.saved) savedCount++; else rejectedCount++;
  const myIdx = exp.findIndex(x => x.mine);
  ok(res.rank === (myIdx >= 0 ? myIdx + 1 : null), `#${n} rank 欄位 ${res.rank} 期望 ${myIdx >= 0 ? myIdx + 1 : null}`);
  // 資料庫不變量：每款遊戲最多 N 列、每位玩家最多 1 列
  if (n % 50 === 0) {
    const c = (await db.query('select game_id, count(*)::int as n, count(distinct player_id)::int as d from public."MF_scores" group by 1')).rows;
    for (const x of c) ok(x.n <= 30 && x.n === x.d, '不變量 ' + JSON.stringify(x));
  }
}
const fin = (await db.query('select game_id, count(*)::int as n from public."MF_scores" group by 1 order by 1')).rows;
console.log('隨機測試 3000 次：寫入成功', savedCount, '次、未寫入', rejectedCount, '次；最後各遊戲列數', JSON.stringify(fin));
for (const g of Object.keys(specs)) {
  const dbRows = (await db.query('select score from public."MF_scores" where game_id=$1 order by rank_key, achieved_at, id', [g])).rows.map(x => Number(x.score));
  const modelRows = [...model[g].entries()].map(([pid, v]) => ({ k: key(g, v.score), t: v.t, score: v.score })).sort((a, b) => a.k - b.k || a.t - b.t).slice(0, 30).map(x => x.score);
  eq(dbRows, modelRows, g + ' 最終資料表內容 = 模型前 30 名');
}

// ═══ I. 玩家意見（MF_submit_feedback，結算彈窗的「我有話要說」）═══
{
  const fb = async (g, p, m, nick, ver) => (await asAnon('select public."MF_submit_feedback"($1,$2::uuid,$3,$4,$5) as r', [g, p, m, nick ?? null, ver ?? null]))[0].r;
  const rows = async (where = 'true', params = []) => (await db.query('select * from public."MF_feedback" where ' + where + ' order by id', params)).rows;
  // 權限：anon 不能直接讀寫意見表
  for (const q of ['select * from public."MF_feedback"', `insert into public."MF_feedback"(game_id,player_id,message) values ('speed','${uuid(900)}','hello')`, 'delete from public."MF_feedback"']) {
    const r = await asAnon(q);
    ok(r.sqlError && /permission denied/i.test(r.sqlError), 'anon 直接碰意見表應被擋：' + q);
  }
  // 公開查閱：任何人（anon）都能讀檢視表 MF_feedback_public，但看不到 player_id，也不能透過它寫入
  {
    const r = await asAnon('select * from public."MF_feedback_public"');
    ok(!r.sqlError, '公開檢視表：anon 可以讀（目前是空的）：' + (r.sqlError || ''));
    const r2 = await asAnon('select player_id from public."MF_feedback_public"');
    ok(r2.sqlError && /does not exist|permission denied/i.test(r2.sqlError), '公開檢視表：沒有 player_id 這一欄：' + r2.sqlError);
    for (const q of [`insert into public."MF_feedback_public"(game_id,message) values ('speed','hello')`, `update public."MF_feedback_public" set message = 'x'`, 'delete from public."MF_feedback_public"']) {
      const w = await asAnon(q);
      ok(w.sqlError && /permission denied/i.test(w.sqlError), 'anon 不能透過公開檢視表寫入：' + q);
    }
  }
  // 參數檢查
  eq(await fb('nope', uuid(900), '很好玩'), { ok: false, error: 'unknown_game' }, '意見：不存在的遊戲');
  eq(await fb('speed', null, '很好玩'), { ok: false, error: 'bad_args' }, '意見：player null');
  eq(await fb('speed', uuid(900), ''), { ok: false, error: 'bad_args' }, '意見：空內容');
  eq(await fb('speed', uuid(900), '好'), { ok: false, error: 'bad_args' }, '意見：只有 1 個字');
  eq(await fb('speed', uuid(900), '  \n\t ​ '), { ok: false, error: 'bad_args' }, '意見：全是空白與零寬字元');
  eq(await fb('speed', uuid(900), null), { ok: false, error: 'bad_args' }, '意見：null');
  ok((await rows()).length === 0, '意見：失敗的呼叫不會寫入任何列');
  // 正常寫入：記著是哪一款遊戲，內容被清理
  eq(await fb('speed', uuid(901), '  第一行\r\n\r\n\r\n\r\n第二行\u0007有控制字元  ', '阿嬤', '1.20.1'), { ok: true, saved: true }, '意見：寫入成功');
  let r1 = await rows(`player_id = $1::uuid`, [uuid(901)]);
  ok(r1.length === 1 && r1[0].game_id === 'speed', '意見：記著遊戲代號 speed');
  ok(r1[0].game_title === '零秒出手', '意見：同時記著遊戲中文名稱（零秒出手）：' + r1[0].game_title);
  eq(r1[0].message, '第一行\n\n第二行 有控制字元', '意見：換行統一、連續換行縮成兩個、控制字元換成空格、頭尾去空白');
  ok(r1[0].nickname === '阿嬤' && r1[0].app_version === '1.20.1', '意見：暱稱與版本有存');
  // 公開檢視表讀得到剛寫入的意見（任何人），而且只有公開欄位
  {
    const pub = await asAnon(`select * from public."MF_feedback_public" where game_id = 'speed' order by id`);
    ok(!pub.sqlError && pub.length === 1, '公開檢視表：anon 讀得到剛寫入的意見：' + (pub.sqlError || pub.length));
    eq(Object.keys(pub[0]), ['id', 'created_at', 'game_id', 'game_title', 'message', 'nickname', 'app_version'], '公開檢視表：欄位清單（沒有 player_id）');
    ok(pub[0].message === '第一行\n\n第二行 有控制字元' && pub[0].game_title === '零秒出手' && pub[0].nickname === '阿嬤', '公開檢視表：內容跟資料表一致');
    const f = await asAnon(`select count(*)::int as n from public."MF_feedback_public" where id >= $1 and created_at >= now() - interval '1 day'`, [pub[0].id]);
    ok(!f.sqlError && f[0].n === 1, '公開檢視表：可以用 id、created_at 篩選（網頁就是這樣查的）');
  }
  // 同一位玩家對不同遊戲的意見可以區別
  eq(await fb('coins', uuid(901), '零錢分類太容易'), { ok: true, saved: true }, '意見：另一款遊戲');
  const byGame = (await db.query(`select game_id, count(*)::int as n from public."MF_feedback" group by 1 order by 1`)).rows;
  eq(byGame, [{ game_id: 'coins', n: 1 }, { game_id: 'speed', n: 1 }], '意見：依遊戲分開統計');
  const titles = (await db.query(`select game_id, game_title from public."MF_feedback" order by game_id, id`)).rows;
  ok(titles.every(t => t.game_title && /[\u4e00-\u9fff]/.test(t.game_title)), '意見：每一列都有中文名稱，不是英文代號：' + JSON.stringify(titles));
  ok(titles.find(t => t.game_id === 'coins').game_title === '零錢分類', '意見：coins 的中文名稱是「零錢分類」');
  // 欄位說明（Table Editor 會顯示）
  const cm = (await db.query(`select col_description('public."MF_feedback"'::regclass, (select attnum from pg_attribute where attrelid = 'public."MF_feedback"'::regclass and attname = 'game_title')) as c`)).rows[0].c;
  ok(/遊戲中文名稱/.test(cm || ''), '意見：game_title 欄位有中文說明：' + cm);
  // 暱稱／版本是選填：亂填也不會讓寫入失敗
  eq(await fb('speed', uuid(902), '沒有暱稱', '   ', ''), { ok: true, saved: true }, '意見：空白暱稱與版本當作沒有');
  const r2 = await rows(`player_id = $1::uuid`, [uuid(902)]);
  ok(r2[0].nickname === null && r2[0].app_version === null, '意見：空白暱稱與版本存成 null');
  // 太長：只留 300 個字
  eq(await fb('speed', uuid(903), '長'.repeat(500)), { ok: true, saved: true }, '意見：超長內容仍可寫入');
  ok((await rows(`player_id = $1::uuid`, [uuid(903)]))[0].message.length === 300, '意見：只留前 300 個字');
  // 10 分鐘內重複送一樣的內容：不重複寫入
  eq(await fb('speed', uuid(901), '第一行\n\n第二行 有控制字元'), { ok: true, saved: false, duplicate: true }, '意見：重複送出不重複寫入');
  ok((await rows(`player_id = $1::uuid`, [uuid(901)])).length === 2, '意見：重複的不增加列數');
  // 24 小時內有上限：數字直接讀 SQL 裡的 c_per_day（管理者可能調過，例如 20 → 200），寫滿之後下一則被擋
  const LIMIT = Number(/c_per_day\s+constant int := (\d+)/.exec(sql)[1]);
  ok(LIMIT >= 1 && LIMIT <= 1000, '意見：每日上限讀到 ' + LIMIT);
  for (let i = 0; i < LIMIT; i++) await fb('spot', uuid(904), '第 ' + i + ' 則意見');
  eq(await fb('spot', uuid(904), '第 ' + (LIMIT + 1) + ' 則意見'), { ok: false, error: 'too_many' }, '意見：第 ' + (LIMIT + 1) + ' 則被擋');
  ok((await rows(`player_id = $1::uuid`, [uuid(904)])).length === LIMIT, '意見：被擋的不寫入');
  eq(await fb('spot', uuid(905), '別人不受影響'), { ok: true, saved: true }, '意見：別的玩家不受限');
  // 一天以前的不算進上限
  await db.exec(`update public."MF_feedback" set created_at = now() - interval '25 hours' where player_id = '${uuid(904)}'`);
  eq(await fb('spot', uuid(904), '隔天可以再寄'), { ok: true, saved: true }, '意見：超過 24 小時的不算進上限');
  // 刪除遊戲時意見跟著刪（on delete cascade）；zz_test 是手寫的測試遊戲
  await fb('zz_test', uuid(906), '測試遊戲的意見');
  await db.exec(`delete from public."MF_games" where game_id = 'zz_test'`);
  ok((await rows(`game_id = 'zz_test'`)).length === 0, '意見：遊戲被刪，意見跟著刪');
  await db.exec(sql);   // 再執行一次整份 SQL：把 zz_test 補回來，也確認有意見資料時重新執行不會出錯
  ok((await rows()).length > 0, '意見：重新執行 SQL 不會清掉既有的意見');

  // ── 中文名稱的同步：遊戲改名、或舊資料庫（V1.21.0～V1.22.x）沒有這一欄 ──
  // (a) 意見裡存的名稱是舊的（遊戲改名前寫入的）→ 重新執行 SQL（MF_games 被更新成新名稱）之後，舊意見也換成新名稱
  await db.exec(`update public."MF_feedback" set game_title = '舊名稱' where game_id = 'speed'`);
  ok((await rows(`game_id = 'speed' and game_title = '舊名稱'`)).length > 0, '同步：先弄成舊名稱');
  await db.exec(sql);
  ok((await rows(`game_id = 'speed' and game_title <> '零秒出手'`)).length === 0, '同步：重新執行 SQL 後，speed 的舊意見全部換成「零秒出手」');
  // (b) 舊資料庫沒有 game_title 這一欄：重新執行 SQL 會補上欄位、並且把所有舊意見補好中文名稱
  await db.exec(`alter table public."MF_feedback" drop column game_title cascade`);     // cascade：公開檢視表依賴這一欄，一起拿掉（重新執行 SQL 會重建）
  ok((await db.query(`select count(*)::int as n from information_schema.columns where table_name = 'MF_feedback' and column_name = 'game_title'`)).rows[0].n === 0, '升級：模擬舊版資料表（沒有 game_title）');
  await db.exec(sql);
  const up = (await db.query(`select count(*)::int as n, count(game_title)::int as named from public."MF_feedback"`)).rows[0];
  ok(up.n > 0 && up.named === up.n, '升級：重新執行 SQL 後欄位補回來，既有的 ' + up.n + ' 則意見全部補好中文名稱（' + up.named + '）');
  // (c) 新寫入的意見在升級之後仍然帶著中文名稱
  eq(await fb('hangpic', uuid(907), '升級後的新意見'), { ok: true, saved: true }, '升級：升級後寫入新意見');
  ok((await rows(`player_id = $1::uuid`, [uuid(907)]))[0].game_title === '掛畫', '升級：新意見的中文名稱是「掛畫」');
  // (d) 停用的遊戲不能寫意見（跟以前一樣），而且不會因為查名稱而漏判
  await db.exec(`update public."MF_games" set enabled = false where game_id = 'hangpic'`);
  eq(await fb('hangpic', uuid(908), '停用後不能寫'), { ok: false, error: 'unknown_game' }, '意見：停用的遊戲不能寫意見');
  await db.exec(`update public."MF_games" set enabled = true where game_id = 'hangpic'`);
}

// ═══ J. 五星評價（MF_submit_rating／MF_get_ratings，V1.25.0）═══
{
  const rate = async (g, p, s) => (await asAnon('select public."MF_submit_rating"($1,$2::uuid,$3::int) as r', [g, p, s]))[0].r;
  const stats = async () => (await asAnon('select public."MF_get_ratings"() as r'))[0].r;
  const count = async (where = 'true', params = []) => (await db.query('select count(*)::int as n from public."MF_ratings" where ' + where, params)).rows[0].n;
  const today = (await db.query(`select (now() at time zone 'Asia/Taipei')::date::text as d`)).rows[0].d;
  // 權限：anon 不能直接碰兩張評價表
  for (const q of ['select * from public."MF_ratings"', 'select * from public."MF_rating_stats"',
    `insert into public."MF_ratings"(game_id,player_id,stars,rated_on) values ('speed','${uuid(700)}',5,current_date)`,
    `update public."MF_rating_stats" set total = 999`, 'delete from public."MF_ratings"']) {
    const r = await asAnon(q);
    ok(r.sqlError && /permission denied/i.test(r.sqlError), 'anon 直接碰評價表應被擋：' + q);
  }
  eq(await stats(), {}, '評價：一開始沒有任何平均值');
  // 參數檢查
  eq(await rate('nope', uuid(700), 5), { ok: false, error: 'unknown_game' }, '評價：不存在的遊戲');
  eq(await rate('speed', null, 5), { ok: false, error: 'bad_args' }, '評價：player null');
  for (const s of [0, 6, -1, null]) eq(await rate('speed', uuid(700), s), { ok: false, error: 'bad_args' }, '評價：星數 ' + s + ' 不合法');
  ok(await count() === 0, '評價：失敗的呼叫不會寫入任何列');
  // 正常寫入：回傳平均與次數，日期是台灣時間的今天
  eq(await rate('speed', uuid(701), 5), { ok: true, saved: true, day: today, avg: 5, cnt: 1 }, '評價：第一筆 5 顆星');
  // 同一位玩家、同一款遊戲、同一天：第二次不算（星數維持第一次的 5）
  eq(await rate('speed', uuid(701), 1), { ok: true, saved: false, day: today, avg: 5, cnt: 1 }, '評價：同一天第二次不算');
  ok(await count(`player_id = $1::uuid`, [uuid(701)]) === 1, '評價：同一天只有一列');
  ok((await db.query(`select stars from public."MF_ratings" where player_id = $1::uuid`, [uuid(701)])).rows[0].stars === 5, '評價：第二次沒有覆蓋第一次的星數');
  // 別人評同一款、自己評別款都不受影響
  eq(await rate('speed', uuid(702), 2), { ok: true, saved: true, day: today, avg: 3.5, cnt: 2 }, '評價：第二個人 2 顆星 → 平均 3.5');
  eq(await rate('cake', uuid(701), 4), { ok: true, saved: true, day: today, avg: 4, cnt: 1 }, '評價：同一個人評另一款遊戲');
  eq(await rate('speed', uuid(703), 3), { ok: true, saved: true, day: today, avg: 3.33, cnt: 3 }, '評價：平均取小數 2 位（10 / 3 = 3.33）');
  eq(await stats(), { speed: [3.33, 3], cake: [4, 1] }, '評價：MF_get_ratings 一次拿到全部遊戲的平均與次數');
  // 隔天可以再評一次（把昨天那一筆的日期往前挪一天來模擬「過了一天」）
  await db.exec(`update public."MF_ratings" set rated_on = rated_on - 1 where player_id = '${uuid(701)}' and game_id = 'speed'`);
  eq(await rate('speed', uuid(701), 1), { ok: true, saved: true, day: today, avg: 2.75, cnt: 4 }, '評價：隔天可以再評（11 / 4 = 2.75）');
  // 停用的遊戲：不能評、平均也不會出現在清單裡
  await db.exec(`update public."MF_games" set enabled = false where game_id = 'cake'`);
  eq(await rate('cake', uuid(704), 5), { ok: false, error: 'unknown_game' }, '評價：停用的遊戲不能評');
  eq(Object.keys(await stats()).sort(), ['speed'], '評價：停用的遊戲不出現在平均清單');
  await db.exec(`update public."MF_games" set enabled = true where game_id = 'cake'`);
  // 重新執行整份 SQL：統計不變；統計被改壞 → 重新執行會用 MF_ratings 重算修好；評價被手動刪掉 → 統計跟著拿掉
  await db.exec(sql);
  eq(await stats(), { speed: [2.75, 4], cake: [4, 1] }, '評價：重新執行 SQL 不影響統計');
  await db.exec(`update public."MF_rating_stats" set total = 999, cnt = 1 where game_id = 'speed'`);
  await db.exec(sql);
  eq(await stats(), { speed: [2.75, 4], cake: [4, 1] }, '評價：統計被改壞，重新執行 SQL 會重算修好');
  await db.exec(`delete from public."MF_ratings" where game_id = 'cake'`);
  await db.exec(sql);
  eq(await stats(), { speed: [2.75, 4] }, '評價：手動刪掉評價後重新執行 SQL，統計跟著拿掉');
  // 刪除遊戲：評價與統計跟著刪（on delete cascade）
  await rate('zz_test', uuid(705), 3);
  ok(await count(`game_id = 'zz_test'`) === 1, '評價：zz_test 有一筆');
  await db.exec(`delete from public."MF_games" where game_id = 'zz_test'`);
  ok(await count(`game_id = 'zz_test'`) === 0, '評價：遊戲被刪，評價跟著刪');
  ok((await db.query(`select count(*)::int as n from public."MF_rating_stats" where game_id = 'zz_test'`)).rows[0].n === 0, '評價：遊戲被刪，統計跟著刪');
  await db.exec(sql);   // 把 zz_test 補回來
  // 隨機 600 筆：對照參考模型（同一人同一款同一天只算第一筆），逐筆比對回傳值，最後比對整份統計
  await db.exec('delete from public."MF_ratings"');
  await db.exec(sql);
  let s2 = 41; const rnd = () => (s2 = (s2 * 1103515245 + 12345) >>> 0) / 4294967296;
  const G = ['speed', 'spot', 'cake', 'drop'], model = {}, seen = new Set();
  let mismatch = 0;
  for (let i = 0; i < 600; i++) {
    const g = G[Math.floor(rnd() * G.length)], p = uuid(710 + Math.floor(rnd() * 40)), st = 1 + Math.floor(rnd() * 5);
    const k = g + '|' + p, fresh = !seen.has(k);
    if (fresh) { seen.add(k); model[g] = model[g] || { t: 0, n: 0 }; model[g].t += st; model[g].n++; }
    const r = await rate(g, p, st), m = model[g];
    const want = { ok: true, saved: fresh, day: today, avg: Math.round(m.t / m.n * 100) / 100, cnt: m.n };
    if (canon(r) !== canon(want)) { mismatch++; if (mismatch < 4) eq(r, want, '評價隨機第 ' + i + ' 筆'); }
  }
  ok(mismatch === 0, '評價：隨機 600 筆逐筆對照參考模型（不一致 ' + mismatch + ' 筆）');
  const wantAll = {}; Object.keys(model).forEach(g => { wantAll[g] = [Math.round(model[g].t / model[g].n * 100) / 100, model[g].n]; });
  eq(await stats(), wantAll, '評價：隨機之後的整份統計');
  ok(await count() === seen.size, '評價：資料表列數＝不重複的（玩家, 遊戲）數 ' + seen.size);
}

// ═══ K. 「阿嬤都比你厲害」：MF_get_overtaken（這位玩家在哪些遊戲被別人比下去，V1.25.0）═══
{
  const over = async (p) => (await asAnon('select public."MF_get_overtaken"($1::uuid) as r', [p]))[0].r;
  await db.exec('delete from public."MF_scores"');
  const A = uuid(801), B = uuid(802), C = uuid(803), D = uuid(804);
  eq(await over(A), [], '阿嬤：完全沒上榜 → 空陣列');
  eq(await over(null), [], '阿嬤：沒帶玩家代號 → 空陣列');
  // zz_test（越大越好）：A 第一名 → 不列出
  await sub('zz_test', A, 'A', 100);
  eq(await over(A), [], '阿嬤：自己是第一名 → 不列出');
  // B 之後打出更好的成績 → A 掉到第 2 名，而且是「被超越」（at 有時間）
  await sub('zz_test', B, 'B', 200);
  let r = await over(A);
  ok(r.length === 1 && r[0].game_id === 'zz_test' && r[0].rank === 2 && r[0].at, '阿嬤：被超越 → 列出、第 2 名、有被超越的時間：' + JSON.stringify(r));
  ok(!JSON.stringify(r).includes(B) && !JSON.stringify(r).includes(A), '阿嬤：回傳內容不含任何 player_id');
  eq(await over(B), [], '阿嬤：超越別人的那位是第一名 → 不列出');
  // speed（越小越好）：C 先達成 0.3，A 之後才打出 0.5 → A 第 2 名，但 C 是在 A 創紀錄「之前」就比較好，不算被超越 → 不列出
  await sub('speed', C, 'C', 0.3);
  await sub('speed', A, 'A', 0.5);
  eq((await over(A)).map(x => x.game_id), ['zz_test'], '阿嬤：不是第一名、但沒有人在我之後超越我 → 不列出');
  // cake（越大越好）：A 先 10，之後 C、D 依序超越 → A 第 3 名，at＝最近一次（D）被超越的時間
  await sub('cake', A, 'A', 10);
  await sub('cake', C, 'C', 20);
  await sub('cake', D, 'D', 30);
  r = await over(A);
  eq(r.map(x => [x.game_id, x.rank]), [['cake', 3], ['zz_test', 2]], '阿嬤：只列被超越的，最近被超越的排最前面');
  const dAt = (await db.query(`select achieved_at from public."MF_scores" where game_id = 'cake' and player_id = $1::uuid`, [D])).rows[0].achieved_at;
  ok(new Date(r[0].at).getTime() === new Date(dAt).getTime(), '阿嬤：at 是最近一次被超越（D）的時間');
  // 使用者的例子（spot，越大越好）：14 個人先上榜；我拿到第 15 名 → 不列出；之後有人拿到第 10 名（我被擠到第 16 名）→ 列出、第 16 名
  for (let i = 0; i < 14; i++) await sub('spot', uuid(860 + i), 'S' + i, 100 - i);
  await sub('spot', A, 'A', 50);
  ok(!(await over(A)).some(x => x.game_id === 'spot'), '阿嬤（例子）：我拿到第 15 名，前面 14 人都比我早 → 不列出');
  const E = uuid(805), F = uuid(806);
  await sub('spot', E, 'E', 91.5);
  r = (await over(A)).filter(x => x.game_id === 'spot');
  ok(r.length === 1 && r[0].rank === 16, '阿嬤（例子）：之後有人拿到第 10 名、我被擠到第 16 名 → 列出、第 16 名：' + JSON.stringify(r));
  ok((await over(A))[0].game_id === 'spot', '阿嬤（例子）：剛被超越的排最前面');
  // 我刷新自己的紀錄（還是第 16 名，不是第一）→ E 是在我新紀錄之前超越的，不再算 → 不列出；之後 F 又超越我 → 再列出、第 17 名
  await sub('spot', A, 'A', 60);
  ok(!(await over(A)).some(x => x.game_id === 'spot'), '阿嬤：我刷新紀錄之後，之前超越我的人不再算');
  await sub('spot', F, 'F', 99.5);
  r = (await over(A)).filter(x => x.game_id === 'spot');
  ok(r.length === 1 && r[0].rank === 17, '阿嬤：刷新後又有人超越 → 再列出、第 17 名：' + JSON.stringify(r));
  await db.exec(`delete from public."MF_scores" where game_id = 'spot'`);
  // A 刷新 zz_test 拿回第一 → 不再列出
  await sub('zz_test', A, 'A', 300);
  eq((await over(A)).map(x => x.game_id), ['cake'], '阿嬤：搶回第一名之後那款就不列出');
  // 停用的遊戲不列出
  await db.exec(`update public."MF_games" set enabled = false where game_id = 'cake'`);
  eq(await over(A), [], '阿嬤：停用的遊戲不列出');
  await db.exec(`update public."MF_games" set enabled = true where game_id = 'cake'`);
  // 被擠出前 N 名：把 cake 的 top_n 改成 2（模擬第 3 名已經不在榜上）→ 不列出
  await db.exec(`update public."MF_games" set top_n = 2 where game_id = 'cake'`);
  eq(await over(A), [], '阿嬤：名次超過前 N 名的不列出');
  await db.exec(sql);   // 重新執行 SQL：top_n 不會被 SQL 改回去（只更新名稱與範圍），手動改回來
  await db.exec(`update public."MF_games" set top_n = 30 where game_id = 'cake'`);
  // speed 滿 30 名：30 個人依序上榜（A、C 被擠出榜，那一列刪掉）
  for (let i = 0; i < 30; i++) await sub('speed', uuid(820 + i), 'P' + i, 0.01 + i * 0.001);
  ok(!(await over(A)).some(x => x.game_id === 'speed'), '阿嬤：被擠出前 30 名（那一列已刪掉）→ 不列出');
  eq(await over(uuid(820 + 28)), [], '阿嬤：第 29 名、前面的人都比他早 → 不列出');
  // 之後 Q 拿到很前面的名次：原本第 29 名被擠到第 30 名（還在榜上）→ 列出；原本第 30 名被擠出榜 → 不列出
  await sub('speed', uuid(851), 'Q', 0.0105);
  r = await over(uuid(820 + 28));
  ok(r.length === 1 && r[0].game_id === 'speed' && r[0].rank === 30, '阿嬤：被擠到第 30 名（還在前 30）→ 列出、名次 30：' + JSON.stringify(r));
  eq(await over(uuid(820 + 29)), [], '阿嬤：被擠到第 31 名（不在前 30）→ 不列出');
  // anon 不能直接讀成績表（確認函式沒有把權限開大）
  const d = await asAnon('select * from public."MF_scores"');
  ok(d.sqlError && /permission denied/i.test(d.sqlError), '阿嬤：anon 仍然不能直接讀成績表');
}

console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS（' + total + ' 項檢查）');
process.exit(bad ? 1 : 0);
