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
  eq(r1[0].message, '第一行\n\n第二行 有控制字元', '意見：換行統一、連續換行縮成兩個、控制字元換成空格、頭尾去空白');
  ok(r1[0].nickname === '阿嬤' && r1[0].app_version === '1.20.1', '意見：暱稱與版本有存');
  // 同一位玩家對不同遊戲的意見可以區別
  eq(await fb('coins', uuid(901), '零錢分類太容易'), { ok: true, saved: true }, '意見：另一款遊戲');
  const byGame = (await db.query(`select game_id, count(*)::int as n from public."MF_feedback" group by 1 order by 1`)).rows;
  eq(byGame, [{ game_id: 'coins', n: 1 }, { game_id: 'speed', n: 1 }], '意見：依遊戲分開統計');
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
  // 24 小時內最多 20 則
  for (let i = 0; i < 20; i++) await fb('spot', uuid(904), '第 ' + i + ' 則意見');
  eq(await fb('spot', uuid(904), '第 21 則意見'), { ok: false, error: 'too_many' }, '意見：第 21 則被擋');
  ok((await rows(`player_id = $1::uuid`, [uuid(904)])).length === 20, '意見：被擋的不寫入');
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
}

console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS（' + total + ' 項檢查）');
process.exit(bad ? 1 : 0);
