// 世界排行榜（js/leaderboard.js、js/leaderboard_ui.js）的純函式與用戶端邏輯測試：
//   fake4 偽造位數、成績格式、進榜判斷、暱稱清理、慣性捲動物理、
//   用「假 fetch」驗證快取／去重／離線／待送佇列／慶祝流程，
//   以及「全部 78 款遊戲裡的 score 設定」跟「資料庫 MF_games 的設定」是否一致（防止兩邊改了一邊忘了另一邊）、
//   每款遊戲有沒有真的接上送榜（kit.result 帶 score，或手動呼叫 Leaderboard.submit）。
// 資料庫函式本身的測試在 test/leaderboard/（需要另外安裝 PGlite，見那邊的 README）。
const fs = require('fs');
const path = require('path');
const { loadAllGames } = require('../leaderboard/all_games.cjs');
const ROOT = path.resolve(__dirname, '../../') + '/';

let bad = 0, total = 0;
const say = console.log.bind(console);      // 排行榜模組自己會 console.log 很多訊息；測試的 FAIL／摘要一律用 say，才不會被靜音
const ok = (c, m) => { total++; if (!c) { bad++; say('FAIL', m); } };
const near = (a, b, eps, m) => ok(Math.abs(a - b) <= eps, m + '（' + a + ' vs ' + b + '）');

// 先載入全部遊戲（它們的 Reaction.register 會把 score 設定登記進去），再載入排行榜畫面
const games = loadAllGames();
const byId = {}; games.forEach(g => { byId[g.id] = g; });
const speed = byId.speed, spot = byId.spot;
require(ROOT + 'js/leaderboard.js');
require(ROOT + 'js/leaderboard_ui.js');
const LB = global.Leaderboard, T = LB.test, S = T.scroll;

// 記憶體版 localStorage 與不等待的 UI.wait
const mem = new Map();
global.UI.store = { get: (k, f) => (mem.has(k) ? JSON.parse(mem.get(k)) : f), set: (k, v) => mem.set(k, JSON.stringify(v)) };
global.UI.wait = () => Promise.resolve();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // ═══ 1. fake4：小數 4 位、第 3／4 位都不是 0 ═══
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const hist = new Array(10).fill(0); let replaced = 0, maxShift = 0, decreased = 0;
  for (let i = 0; i < 200000; i++) {
    const kind = i % 4;
    // 各種「尾數很容易是 0」的輸入：整數毫秒換成秒、整數、1～2 位小數、隨機
    const v = kind === 0 ? Math.round(rnd() * 6000) / 1000 : kind === 1 ? Math.floor(rnd() * 300) : kind === 2 ? Math.round(rnd() * 5000) / 100 : rnd() * 10;
    const r = LB.fake4(v, rnd);
    const n = Math.round(r * 10000);
    if (v > 0 && Math.round(v * 10000) > 0) {
      ok(n % 10 !== 0 && Math.floor(n / 10) % 10 !== 0, 'fake4 第 3、4 位不得為 0：' + v + ' → ' + r);
      ok(Number(r.toFixed(4)) === r, 'fake4 結果不能有浮點誤差：' + r);
      const base = Math.round(v * 10000);
      if (r * 10000 < base - 1e-6) decreased++;
      const shift = (n - base) / 10000; if (shift > maxShift) maxShift = shift;
      const bd4 = base % 10, bd3 = Math.floor(base / 10) % 10;
      if (bd4 === 0 || bd3 === 0) { replaced++; if (bd4 === 0) hist[n % 10]++; }
      else ok(n === base, 'fake4 兩位都不是 0 時不應改動：' + v + ' → ' + r);
      // 只動為 0 的那一位：其餘位數保持原樣
      ok(Math.floor(n / 100) === Math.floor(base / 100) || bd3 === 0, 'fake4 千分位以上不應被改：' + v + ' → ' + r);
    }
  }
  ok(decreased === 0, 'fake4 只會增加、不會讓成績變小');
  ok(maxShift <= 0.0099 + 1e-9, 'fake4 最多差 0.0099：' + maxShift);
  const used = hist.slice(1); const tot = used.reduce((a, b) => a + b, 0); const exp = tot / 9;
  ok(hist[0] === 0, '補上的第 4 位不會是 0');
  ok(used.every(c => Math.abs(c - exp) < exp * 0.06), '補上的數字 1～9 大致平均：' + used.join(','));
  console.log('fake4：200000 筆輸入，其中 ' + replaced + ' 筆有補位；最大偏移 ' + maxShift.toFixed(4) + ' 秒；第 4 位補的數字次數 ' + used.join('/'));
  ok(LB.fake4(0) === 0, 'fake4(0) 維持 0');
  ok(LB.fake4(0.1237, () => 0.5) === 0.1237, '兩位都不是 0 → 不動');
  ok(LB.fake4(1.2, () => 0) === 1.2011, '1.2 → 補 1、補 10 → 1.2011');
  ok(LB.fake4(1.2, () => 0.999999) === 1.2099, '亂數最大 → 補 9、補 90 → 1.2099');
  ok(LB.fake4(0.0003, () => 0) === 0.0013, '0.0003：第 3 位是 0 → 補 1 → 0.0013');
  ok(LB.fake4(-0.5, () => 0) === -0.5011, '負數保留正負號');
  ok(LB.fake4(1234.5, () => 0.5) === 1234.5055, '大數字：1234.5 → 1234.5055');
  ok(Number.isNaN(LB.fake4(NaN)), 'NaN 原樣回傳');

  // ═══ 2. 成績格式 ═══
  ok(LB.fmt(speed.score, 0.1237) === '0.1237 秒', 'speed 格式');
  ok(LB.fmt(speed.score, 1.5) === '1.5000 秒', 'speed 小數補零到 4 位');
  ok(LB.fmt(spot.score, 21) === '第 21 關', 'spot 格式');
  ok(LB.fmt({ decimals: 2 }, 3.14159) === '3.14', '沒有 format 就只顯示數字');
  ok(LB.isBetter(1, 2, 'min') && !LB.isBetter(2, 1, 'min') && !LB.isBetter(1, 1, 'min'), 'isBetter min（同分不算更好）');
  ok(LB.isBetter(2, 1, 'max') && !LB.isBetter(1, 2, 'max') && !LB.isBetter(1, 1, 'max'), 'isBetter max（同分不算更好）');

  // ═══ 3. 全部遊戲：score 設定合法，而且跟資料庫 MF_games 的設定一致 ═══
  ok(games.length === 78, '秒反應共 78 款遊戲（boot.js 的清單）：' + games.length);
  ok(new Set(games.map(g => g.id)).size === games.length, '遊戲 id 不重複');
  ok(new Set(games.map(g => g.name)).size === games.length, '遊戲名稱不重複（排行榜標題靠名稱辨認）');
  const sql = fs.readFileSync(ROOT + 'supabase/MF_leaderboard.sql', 'utf8').replace(/\r\n/g, '\n');
  const seedBlock = sql.slice(sql.indexOf('insert into public."MF_games"'));
  // 一列：('id', '遊戲名稱', 'min'|'max', 最小, 最大)；名稱裡的單引號在 SQL 裡寫成兩個
  const rows = {}; let m; const re = /\(\s*'([a-z0-9_]+)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'(min|max)'\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g;
  while ((m = re.exec(seedBlock))) rows[m[1]] = { title: m[2].replace(/''/g, "'"), better: m[3], min: Number(m[4]), max: Number(m[5]) };
  for (const g of games) {
    ok(/^[a-z0-9_]{1,32}$/.test(g.id), g.id + ' id 格式要符合資料庫 check（小寫英數底線，最長 32）');
    const s = g.score;
    ok(!!s && typeof s === 'object', g.id + ' 要有 score 設定（Reaction.register 裡的 score: SCORE）');
    if (!s) continue;
    ok(s.better === 'min' || s.better === 'max', g.id + ' better 只能是 min 或 max：' + s.better);
    ok(s.decimals === 0 || s.decimals === 4, g.id + ' decimals 目前只有 0 或 4 兩種：' + s.decimals);
    ok(Number.isFinite(s.min) && Number.isFinite(s.max) && s.min <= s.max, g.id + ' min／max 要是有限數字且 min ≤ max：' + s.min + '~' + s.max);
    ok(s.min >= 0, g.id + ' 成績不會是負數：min=' + s.min);
    ok(typeof s.format === 'string' && s.format.split('{v}').length === 2, g.id + ' format 要剛好有一個 {v}：' + s.format);
    ok(typeof s.label === 'string' && s.label.length > 0, g.id + ' 要有 label（榜單成績欄的小標）');
    ok(!/'/.test(g.name), g.id + ' 遊戲名稱不要含單引號（產生 SQL 比較單純）：' + g.name);
    if (s.decimals === 0) ok(Number.isInteger(s.min) && Number.isInteger(s.max), g.id + ' 整數型成績的 min／max 要是整數');
    // 小數 4 位的成績，在資料庫是 numeric(14,4)，範圍不能超過它放得下的大小
    ok(Math.abs(s.max) < 1e9, g.id + ' max 太大：' + s.max);
    const row = rows[g.id];
    ok(!!row, g.id + ' 在 MF_leaderboard.sql 的 MF_games 裡要有一列（執行 node test/leaderboard/gen_games_sql.cjs --write）');
    if (row) {
      ok(row.better === s.better, g.id + ' better 要一致：SQL ' + row.better + ' / 遊戲 ' + s.better);
      ok(row.min === s.min && row.max === s.max, g.id + ' min／max 要一致：SQL ' + row.min + '~' + row.max + ' / 遊戲 ' + s.min + '~' + s.max);
      ok(row.title === g.name, g.id + ' 名稱要一致：SQL「' + row.title + '」/ 遊戲「' + g.name + '」');
    }
  }
  // 資料庫裡不能有「遊戲檔案不存在」的登記（除了手寫的測試用 zz_test）
  Object.keys(rows).forEach(id => ok(id === 'zz_test' || !!byId[id], 'MF_games 裡的 ' + id + ' 找不到對應的遊戲檔案'));
  ok(Object.keys(rows).length === games.length + 1, 'MF_games 共 ' + (games.length + 1) + ' 列（' + games.length + ' 款遊戲＋zz_test）：' + Object.keys(rows).length);
  // 產生器的輸出要跟 SQL 檔裡「自動產生」區塊完全相同（沒有人手動改過、也沒有忘記重新產生）
  const gen = require('../leaderboard/gen_games_sql.cjs');
  ok(gen.patch(sql, gen.buildBlock(games)) === sql, 'MF_leaderboard.sql 的自動產生區塊與遊戲檔案不同步：請執行 node test/leaderboard/gen_games_sql.cjs --write');
  ok(LB.supports(speed) && LB.supports('spot') && !LB.supports('nope') && !LB.supports(null), 'supports');
  ok(games.every(g => LB.supports(g)) && games.every(g => LB.supports(g.id)), '每一款遊戲都 supports（物件與 id 兩種寫法）');

  // 各款成績的顯示格式：4 位小數的有 4 位、整數的沒有小數點、千分位只有吹氣球有
  const sample = (s) => s.decimals === 0 ? Math.round((s.min + s.max) / 2) : Math.round((s.min + s.max) / 2 * 10000) / 10000;
  for (const g of games) {
    const t = LB.fmt(g.score, sample(g.score));
    ok(!/NaN|undefined|\{v\}/.test(t) && /\d/.test(t), g.id + ' 格式化結果怪怪的：' + t);
    if (g.score.decimals === 4) ok(/\d\.\d{4}(?!\d)/.test(t), g.id + ' 小數型成績要顯示 4 位小數：' + t);
    else ok(!/\./.test(t), g.id + ' 整數型成績不該有小數點：' + t);
  }
  ok(LB.fmt(byId.balloon.score, 117681) === '117,681', '吹氣球容量有千分位：' + LB.fmt(byId.balloon.score, 117681));
  ok(LB.fmt(byId.balloon.score, 999) === '999' && LB.fmt(byId.balloon.score, 1000) === '1,000', '千分位邊界');
  ok(games.filter(g => g.score.group).map(g => g.id).join() === 'balloon', '只有吹氣球用千分位（其餘成績都小於 1000，加了也看不出來）');
  ok(LB.fmt(byId.hangpic.score, 0.5) === '0.5000 度' && LB.fmt(byId.landolt.score, 1.2) === '視力 1.2000', '小數型成績補零到 4 位');
  ok(LB.fmt(byId.cake.score, 12) === '12 關' && LB.fmt(byId.candy.score, 7) === '7 題', '整數型成績的單位');

  // 「送榜接線」靜態檢查：每款遊戲要嘛 kit.result 帶 score、要嘛手動呼叫 Leaderboard.submit(ID, …)，而且不能兩種都有（會送兩次）
  // 從 src 的 start（指向 '{'）掃到對應的 '}'，略過字串與註解；回傳這段文字
  const braceBody = (src, start) => {
    let depth = 0;
    for (let i = start; i < src.length; i++) {
      const c = src[i], n = src[i + 1];
      if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
      if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2); if (i < 0) break; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++; continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    return null;
  };
  const wiring = {};
  for (const g of games) {
    const src = fs.readFileSync(ROOT + 'js/' + g.file, 'utf8');
    const bodies = []; const reKit = /kit\.result\(\s*root\s*,\s*\{/g; let km;
    while ((km = reKit.exec(src))) bodies.push(braceBody(src, km.index + km[0].length - 1));
    ok(bodies.every(b => b !== null), g.id + ' kit.result 的大括號掃描失敗（測試本身的問題）');
    /* 28 款新遊戲交給 kit.run／kit.single（js/reaction_kit2.js）去跑，結算卡片與送榜都在 kit2 裡（下面另外檢查 kit2 的 kit.result 有帶 score） */
    const viaRunner = /kit\.(run|single)\(\s*root\s*,\s*ctx\s*,/.test(src) ? 1 : 0;
    const viaKit = bodies.filter(b => b && /\bscore\s*:/.test(b)).length + viaRunner;
    const manual = (src.match(/Leaderboard\.submit\(\s*ID\s*,/g) || []).length;
    wiring[g.id] = { kitCalls: bodies.length, viaKit, manual };
    ok(viaKit > 0 || manual > 0, g.id + ' 沒有接上送榜：kit.result 要帶 score:，或結算卡片出現後呼叫 Leaderboard.submit(ID, 成績)');
    ok(!(viaKit > 0 && manual > 0), g.id + ' 兩種送法都有（會送兩次）：kit.result 的 score ×' + viaKit + '，手動 ×' + manual);
    ok(manual <= 1, g.id + ' 手動送榜只該有一處：' + manual);
    ok(/\bscore\s*:\s*SCORE\b/.test(src) && /\bvar SCORE\s*=/.test(src), g.id + ' 要有 var SCORE，並在 register 裡寫 score: SCORE');
  }
  { // kit2 的兩個骨架：每個 kit.result 都要帶 score（run：score 變數；single：score: v）
    const k2 = fs.readFileSync(ROOT + 'js/reaction_kit2.js', 'utf8'); const bodies2 = []; const re2 = /kit\.result\(\s*root\s*,\s*\{/g; let m2;
    while ((m2 = re2.exec(k2))) bodies2.push(braceBody(k2, m2.index + m2[0].length - 1));
    ok(bodies2.length === 2 && bodies2.every(b => b && /\bscore\s*:/.test(b)), 'reaction_kit2.js 的兩個 kit.result 都要帶 score：' + bodies2.length);
  }
  const manualGames = Object.keys(wiring).filter(id => wiring[id].manual > 0).sort().join();
  ok(manualGames === 'drop,impossible,matchcolor,pendulum,pour,rainbow,shapes,spot,speed'.split(',').sort().join(),
    '手刻結算卡片（手動送榜）的遊戲清單有變動，請確認新加的遊戲接線正確：' + manualGames);
  say('全部 ' + games.length + ' 款遊戲：score 設定合法、與資料庫一致；kit.result 自動送榜 ' + Object.keys(wiring).filter(id => wiring[id].viaKit > 0).length + ' 款、手動送榜 ' + manualGames.split(',').length + ' 款');

  // ═══ 4. 進榜判斷 qualifies ═══
  const board = (better, scores, mineIdx, limit) => ({ better, limit: limit || 30, top: scores.map((s, i) => ({ rank: i + 1, nick: 'n' + i, score: s, mine: i === mineIdx })) });
  const q = T.qualifies;
  ok(q(null, 1, 'min') && q(undefined, 1, 'max') && q({}, 1, 'min'), '沒有榜單 → 交給資料庫判斷');
  ok(q(board('min', []), 99, 'min'), '空榜單 → 一定進');
  const full = board('min', Array.from({ length: 30 }, (_, i) => (i + 1) / 100));      // 0.01 ... 0.30
  ok(q(full, 0.29, 'min') && !q(full, 0.31, 'min') && !q(full, 0.30, 'min'), '滿榜：嚴格勝過第 30 名才進（同分不算）');
  const full2 = board('max', Array.from({ length: 30 }, (_, i) => 30 - i));            // 30 ... 1
  ok(q(full2, 2, 'max') && !q(full2, 1, 'max') && !q(full2, 0, 'max'), 'max 類型滿榜');
  ok(q(board('min', [0.1, 0.2], null), 5, 'min'), '榜上不到 30 名：再爛也進得去');
  const withMe = board('min', [0.1, 0.2, 0.3], 1);                                       // 我是第 2 名 0.2
  ok(q(withMe, 0.15, 'min') && !q(withMe, 0.25, 'min') && !q(withMe, 0.2, 'min'), '榜上有我：必須比我自己的紀錄更好才送');
  const fullMe = board('min', Array.from({ length: 30 }, (_, i) => (i + 1) / 100), 29);  // 我是第 30 名 0.30
  ok(q(fullMe, 0.29, 'min') && !q(fullMe, 0.31, 'min'), '我在榜末：只有進步才送');
  ok(q(board('min', [0.1], null, 1), 0.05, 'min') && !q(board('min', [0.1], null, 1), 0.2, 'min'), 'limit=1 的榜');

  // ═══ 5. 暱稱清理 ═══
  const cn = LB.cleanNick;
  ok(cn('  小明  ') === '小明', '去頭尾空白');
  ok(cn('小\n\t明   同學') === '小 明 同學', '換行／連續空白變單一空格');
  ok(cn('一二三四五六七八九十') === '一二三四五六七八', '最多 8 個字');
  ok(cn('😀😀😀😀😀😀😀😀😀😀') === '😀😀😀😀😀😀😀😀', 'emoji 以「字」計算，不會切成亂碼');
  ok(cn('a\u{202e}b\u{200b}c\u{feff}d') === 'a b c d', '文字方向控制字元、零寬字元都換成空格');
  ok(cn('x\u{0}y\u{7f}z') === 'x y z', '控制字元（NUL、DEL）換成空格');
  ok(cn(null) === '' && cn(undefined) === '' && cn(123) === '123' && cn('   ') === '', '怪輸入');
  ok(cn('1234567 8') === '1234567', '截斷後不留尾端空白');
  ok(cn('<b>x</b>') === '<b>x</b>', '不改 HTML 字元（顯示一律用 textContent，不會被當成標籤）');

  // ═══ 6. UUID ═══
  const ids = new Set(); for (let i = 0; i < 2000; i++) ids.add(T.newUuid());
  ok(ids.size === 2000, 'UUID 不重複');
  ok([...ids].every(x => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x)), 'UUID v4 格式');

  // ═══ 7. 慣性捲動物理 ═══
  const P = S.PHYS;
  near(S.rubber(-100, 500), -100 * P.rubber, 1e-9, '橡皮筋：頂端拉過頭只跟 ' + P.rubber);
  near(S.rubber(600, 500), 500 + 100 * P.rubber, 1e-9, '橡皮筋：底端拉過頭');
  ok(S.rubber(250, 500) === 250, '界內 1:1 跟手');
  const samp = (pts) => pts.map(([t, y]) => ({ t, y }));
  near(S.releaseVelocity(samp([[0, 500], [16, 470], [32, 440], [48, 410]]), 50), 90 / 48, 1e-9, '手指往上 90px/48ms → 往下捲 1.875 px/ms');
  near(S.releaseVelocity(samp([[0, 100], [16, 130], [32, 160]]), 40), -60 / 32, 1e-9, '手指往下 → 負速度');
  ok(S.releaseVelocity(samp([[0, 500], [16, 470]]), 16 + P.velStale + 5) === 0, '放手前手指停了一會兒 → 速度 0');
  ok(S.releaseVelocity(samp([[0, 500]]), 5) === 0 && S.releaseVelocity([], 5) === 0, '樣本太少 → 0');
  ok(S.releaseVelocity(samp([[0, 1000], [10, 0]]), 12) === -(-P.maxV) || S.releaseVelocity(samp([[0, 1000], [10, 0]]), 12) === P.maxV, '速度上限 ' + P.maxV);
  // 只看最後 velWindow 毫秒：前面很快、最後很慢 → 取最後的慢速度
  const slowEnd = samp([[0, 900], [20, 800], [40, 700], [300, 690], [330, 680], [360, 670]]);
  near(S.releaseVelocity(slowEnd, 365), 20 / 60, 0.2, '只取最後 ' + P.velWindow + 'ms 的速度');

  // 模擬：從 y0、速度 v0 放手，用固定時間步長一路跑到停止
  function simulate(y0, v0, max, dt, cap) {
    const s = { y: y0, v: v0 }; let t = 0, steps = 0;
    while (steps < (cap || 100000)) { steps++; t += dt; if (S.flingStep(s, dt, max)) break; }
    return { y: s.y, v: s.v, t, steps };
  }
  // 界內長距離：位移 ≈ v0 × tau（扣掉停止門檻的殘餘）
  for (const v0 of [0.5, 1, 2, 4]) {
    const r = simulate(0, v0, 1e9, 16);
    near(r.y, v0 * P.tau, P.stopV * P.tau * 1.3 + v0 * 16, '放手速度 ' + v0 + ' px/ms 滑行距離 ≈ v0×tau');
  }
  // 不同更新率（60Hz／120Hz／30Hz）滑行距離要幾乎一樣（用 Math.exp 精確積分，不依賴影格率）
  const d60 = simulate(0, 2, 1e9, 1000 / 60).y, d120 = simulate(0, 2, 1e9, 1000 / 120).y, d30 = simulate(0, 2, 1e9, 1000 / 30).y;
  near(d60, d120, 2 * 1000 / 60 * 0.2 + 12, '60Hz 與 120Hz 滑行距離一致'); near(d60, d30, 40, '60Hz 與 30Hz 滑行距離接近');
  // 隨機性質：一定會停、最後一定在 [0,max]、停得夠快
  let worst = 0;
  for (let i = 0; i < 3000; i++) {
    const max = rnd() < 0.1 ? 0 : 200 + rnd() * 1500;
    const y0 = -150 + rnd() * (max + 300), v0 = (rnd() - 0.5) * 2 * P.maxV;
    const r = simulate(y0, v0, max, 8 + rnd() * 24);
    ok(r.steps < 100000, '一定會停：y0=' + y0.toFixed(1) + ' v0=' + v0.toFixed(2) + ' max=' + max.toFixed(0));
    ok(r.y >= -1e-9 && r.y <= max + 1e-9, '停下來一定在 [0,max] 內：' + r.y + ' max=' + max);
    ok(r.v === 0, '停止時速度為 0');
    if (r.t > worst) worst = r.t;
  }
  console.log('捲動物理：3000 組隨機起點／速度，最久 ' + (worst / 1000).toFixed(2) + ' 秒停下，全部落在邊界內');
  ok(worst < 8000, '最長停止時間 < 8 秒：' + worst);
  // 越界回彈：頂端往上衝過頭 → 最後停在 0；底端 → 停在 max
  ok(simulate(-80, 0, 800, 16).y === 0, '從頂端拉過頭放手 → 彈回 0');
  ok(simulate(900, 0, 800, 16).y === 800, '從底端拉過頭放手 → 彈回 max');
  ok(simulate(790, 3, 800, 16).y === 800, '往底端用力甩 → 衝過頭後停在 max');
  ok(simulate(5, -3, 800, 16).y === 0, '往頂端用力甩 → 停在 0');
  ok(simulate(300, 0, 800, 16).steps <= 2, '界內沒速度 → 立刻結束（不空跑動畫迴圈）');

  // ═══ 8. 用戶端流程（假 fetch）═══
  const calls = []; let fetchMode = 'ok'; let latency = 0;
  const serverRows = { speed: [{ rank: 1, nick: 'A', score: 0.0123, mine: false }, { rank: 2, nick: 'B', score: 0.05, mine: false }], spot: [] };
  global.fetch = (url, opt) => {
    const name = url.split('/rpc/')[1], body = JSON.parse(opt.body);
    calls.push({ name, body, pendingAtCall: JSON.parse(JSON.stringify(mem.get(T.KEY_PENDING) ? JSON.parse(mem.get(T.KEY_PENDING)) : {})), headers: opt.headers });
    return sleep(latency).then(() => {
      if (fetchMode === 'down') throw new TypeError('Failed to fetch');
      if (fetchMode === 'http500') return { ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) };
      const mk = (id, saved, rank) => ({ game_id: id, better: id === 'speed' ? 'min' : 'max', limit: 30, top: serverRows[id] || [] , ok: true, saved, rank });
      if (name === 'MF_get_top') {
        if (!serverRows[body.p_game_id]) return { ok: true, status: 200, json: () => Promise.resolve(null) };
        const r = mk(body.p_game_id); delete r.ok; delete r.saved; delete r.rank; return { ok: true, status: 200, json: () => Promise.resolve(r) };
      }
      if (name === 'MF_submit_score') {
        const r = mk(body.p_game_id, fetchMode !== 'notsaved', fetchMode !== 'notsaved' ? 2 : null);
        return { ok: true, status: 200, json: () => Promise.resolve(r) };
      }
      if (name === 'MF_rename_player') return { ok: true, status: 200, json: () => Promise.resolve({ ok: true, rows: 1 }) };
      return { ok: false, status: 404, json: () => Promise.resolve({}) };
    });
  };
  const resetClient = () => { mem.clear(); calls.length = 0; fetchMode = 'ok'; latency = 0; T.state.boards = {}; T.state.inflight = {}; T.state.netDownUntil = 0; T.state.nickPromise = null; T.state.nickSkipped = false; };
  const ui = { asked: 0, nickAnswer: '小花', celebrated: [], toasts: [], askNickname() { this.asked++; return Promise.resolve(this.nickAnswer); }, celebrate(i) { this.celebrated.push(i); }, toast(t) { this.toasts.push(t); } };
  LB.ui = ui;
  global.Reaction.resultShowing = () => true;

  // 8-1 讀榜單：快取、去重、逾時前的行為
  resetClient();
  let b = await LB.load(speed);
  ok(calls.length === 1 && calls[0].name === 'MF_get_top', '第一次讀：連網 1 次');
  ok(calls[0].body.p_game_id === 'speed' && /^[0-9a-f-]{36}$/.test(calls[0].body.p_player_id), '讀榜單帶 p_game_id 與 p_player_id：' + JSON.stringify(calls[0].body));
  ok(String(calls[0].headers.apikey).split('.').length === 3 && calls[0].headers.Authorization === 'Bearer ' + calls[0].headers.apikey, '帶 anon key');
  ok(!/service_role/.test(Buffer.from(calls[0].headers.apikey.split('.')[1], 'base64').toString()), 'key 不是 service_role');
  ok(b && b.top.length === 2 && b.better === 'min' && b.limit === 30, '榜單內容');
  await LB.load(speed); await LB.prefetch(speed);
  ok(calls.length === 1, '60 秒內再讀：不連網（快取）');
  T.state.boards = {};                                    // 模擬換頁：記憶體清空，localStorage 還在
  await LB.load(speed);
  ok(calls.length === 1, '換頁後（記憶體沒了）仍用 localStorage 快取，不連網');
  await LB.load(speed, { force: true });
  ok(calls.length === 2, 'force：強制重抓');
  T.state.boards = {}; mem.delete(T.KEY_BOARD + 'speed'); latency = 20;
  const [x1, x2, x3] = await Promise.all([LB.load(speed), LB.load(speed), LB.prefetch(speed)]);
  ok(calls.length === 3 && x1 === x2 && x2 === x3, '同時 3 個人要同一款榜單：只連網 1 次（去重）');
  latency = 0;
  ok((await LB.load('nope')) === null && calls.length === 3, '不存在的遊戲：不連網');
  const emptyTop = await LB.load(spot);
  ok(emptyTop && emptyTop.top.length === 0, '空榜單');

  // 8-2 連不上：用舊快取、冷卻期內不再連網
  resetClient();
  await LB.load(speed);                                   // 先有一份好的
  T.state.boards.speed.at = 0; mem.set(T.KEY_BOARD + 'speed', JSON.stringify({ at: 0, data: { better: 'min', limit: 30, top: serverRows.speed } }));
  fetchMode = 'down'; calls.length = 0;
  b = await LB.load(speed);
  ok(calls.length === 1 && b && b.stale === true && b.top.length === 2, '連不上：回傳舊快取並標 stale');
  b = await LB.load(speed);
  ok(calls.length === 1, '冷卻期（' + LB.CFG.OFFLINE_COOLDOWN_MS / 1000 + ' 秒）內不再嘗試連網');
  resetClient(); fetchMode = 'down';
  ok((await LB.load(speed)) === null, '完全沒有快取又連不上 → null');
  resetClient(); fetchMode = 'http500';
  ok((await LB.load(speed)) === null, 'HTTP 500 → null（不丟例外）');

  // 8-3 送成績
  const saved = () => JSON.parse(mem.get(T.KEY_PENDING) || '{}');
  // 沒暱稱、玩家按「先不要」→ 不連網、這一頁不再追問
  resetClient(); ui.asked = 0; ui.nickAnswer = '';
  let r = await LB.submit('speed', 0.0345);
  ok(r.status === 'no-nick' && calls.length === 0 && ui.asked === 1, '沒暱稱＋先不要：不連網');
  r = await LB.submit('speed', 0.0345);
  ok(r.status === 'no-nick' && ui.asked === 1, '按過「先不要」之後這一頁不再追問');
  // 第一次：問暱稱 → 存起來 → 連網
  resetClient(); ui.asked = 0; ui.nickAnswer = '  快樂阿嬤 ';
  await LB.load(speed); calls.length = 0;
  r = await LB.submit('speed', 0.0345);
  ok(ui.asked === 1 && LB.getNick() === '快樂阿嬤', '第一次完成遊戲 → 問暱稱，存成「快樂阿嬤」');
  ok(r.status === 'saved' && r.rank === 2, '有進榜 → saved，名次 2：' + JSON.stringify(r));
  const sub = calls.filter(c => c.name === 'MF_submit_score');
  ok(sub.length === 1 && sub[0].body.p_game_id === 'speed' && sub[0].body.p_nickname === '快樂阿嬤' && sub[0].body.p_score === 0.0345, '送出的欄位正確：' + JSON.stringify(sub[0] && sub[0].body));
  ok(sub[0].pendingAtCall.speed && sub[0].pendingAtCall.speed.score === 0.0345, '連網「之前」已先寫入待送佇列（寫在前面）');
  ok(!saved().speed, '收到明確答覆後待送佇列清掉');
  ok(ui.celebrated.length === 1 && ui.celebrated[0].rank === 2 && ui.celebrated[0].score === 0.0345, '進榜 → 呼叫慶祝');
  ok(calls.filter(c => c.name === 'MF_rename_player').length === 1, '設定暱稱時順便通知資料庫改名');
  // 再玩一次：暱稱已存在，不再問；榜上只有 2 名（不到 30 名），再差的成績也進得去 → 要連網
  ui.asked = 0; ui.celebrated.length = 0; calls.length = 0;
  r = await LB.submit('speed', 0.2);
  ok(ui.asked === 0, '之後不再問暱稱');
  ok(calls.filter(c => c.name === 'MF_submit_score').length === 1, '榜上不到 30 名：0.2 秒也有機會進榜 → 連網送出');
  // 滿榜（30 名）的情境：比第 30 名差或同分 → 完全不連網
  resetClient(); ui.nickAnswer = '甲'; LB.setNick('甲'); calls.length = 0;
  serverRows.speed = Array.from({ length: 30 }, (_, i) => ({ rank: i + 1, nick: 'p' + i, score: (i + 1) / 100, mine: false }));
  await LB.load(speed); calls.length = 0;
  r = await LB.submit('speed', 0.31);
  ok(r.status === 'not-qualified' && calls.length === 0, '滿榜且比第 30 名差 → 完全不連網');
  r = await LB.submit('speed', 0.30);
  ok(r.status === 'not-qualified' && calls.length === 0, '滿榜且與第 30 名同分 → 不連網');
  r = await LB.submit('speed', 0.29);
  ok(r.status === 'saved' && calls.filter(c => c.name === 'MF_submit_score').length === 1, '勝過第 30 名 → 連網送出');
  // 資料庫說沒進榜（例如手上的榜單是舊的，別人剛好搶先了一步）
  ui.celebrated.length = 0; calls.length = 0;
  fetchMode = 'notsaved'; T.state.boards = {}; mem.delete(T.KEY_BOARD + 'speed');      // 手上沒有榜單 → 一定連網
  r = await LB.submit('speed', 0.2);
  ok(r.status === 'not-saved' && ui.celebrated.length === 0, '資料庫說沒進榜 → 不慶祝');
  ok(!saved().speed, '資料庫有明確答覆（沒進榜）→ 待送佇列清掉');
  // 玩家已經開始下一局（畫面上沒有結算卡片）→ 只跳小提示，不跳大彈窗
  fetchMode = 'ok'; ui.celebrated.length = 0; ui.toasts.length = 0; global.Reaction.resultShowing = () => false;
  r = await LB.submit('speed', 0.001);
  ok(ui.celebrated.length === 0 && ui.toasts.length === 1 && /第 2 名/.test(ui.toasts[0]), '結算卡片已經不在 → 只跳小提示：' + ui.toasts[0]);
  global.Reaction.resultShowing = () => true;
  // 離線：待送佇列＋提示＋冷卻
  resetClient(); LB.setNick('乙'); calls.length = 0; fetchMode = 'down'; ui.toasts.length = 0;
  r = await LB.submit('speed', 0.0456);
  ok(r.status === 'offline' && saved().speed && saved().speed.score === 0.0456 && ui.toasts.length === 1, '連不上：成績存進待送佇列並提示');
  const n1 = calls.length;
  r = await LB.submit('speed', 0.0400);
  ok(calls.length === n1 && saved().speed.score === 0.04, '冷卻期內：不連網，待送佇列只留「較好」的那筆（0.04）');
  r = await LB.submit('speed', 0.0900);
  ok(saved().speed.score === 0.04, '待送佇列不會被較差的成績蓋掉');
  // 恢復連線後補送
  fetchMode = 'ok'; T.state.netDownUntil = 0; calls.length = 0;
  await LB.test.flushPending();
  ok(calls.filter(c => c.name === 'MF_submit_score').length === 1 && calls[0].body.p_score === 0.04, '補送最好的那筆 0.04');
  ok(!saved().speed, '補送成功後佇列清空');
  // 補送時連線又失敗：保留、不清掉
  resetClient(); fetchMode = 'down'; LB.setNick('丙'); T.savePending('speed', '丙', 0.07, 'min'); T.savePending('spot', '丙', 9, 'max'); calls.length = 0;
  await LB.test.flushPending();
  ok(saved().speed && saved().spot && calls.length === 1, '補送失敗：佇列保留，而且第一筆失敗就停（不連續轟炸）');
  // 異常輸入
  resetClient(); LB.setNick('丁'); calls.length = 0;
  for (const bad of [NaN, Infinity, '12', null, undefined, {}]) { r = await LB.submit('speed', bad); ok(r.status === 'skip', '非數字成績一律略過：' + String(bad)); }
  r = await LB.submit('nope', 1); ok(r.status === 'skip' && calls.length === 0, '不存在的遊戲略過');
  // 資料庫拒絕（例如 MF_games 沒登記）
  resetClient(); LB.setNick('戊'); global.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: false, error: 'unknown_game' }) });
  r = await LB.submit('speed', 0.01);
  ok(r.status === 'rejected' && r.error === 'unknown_game', '資料庫拒絕 → rejected，不當成離線、不重試');
  ok(!saved().speed, '被拒絕的成績不留在佇列（重送也不會被接受）');

  // ═══ 9. 用戶端絕不能含 service_role ═══
  const src = fs.readFileSync(ROOT + 'js/leaderboard.js', 'utf8');
  const jwt = src.match(/eyJ[\w-]+\.([\w-]+)\.[\w-]+/);
  ok(jwt && JSON.parse(Buffer.from(jwt[1], 'base64').toString()).role === 'anon', 'js/leaderboard.js 裡的金鑰角色是 anon');
  ok(!/service_role['"]?\s*[:=]\s*['"]eyJ/.test(src), '沒有任何 service_role 金鑰');

  // ═══ 10. kit.result 的 score 會自動送榜（39 款遊戲靠這一行）═══
  // 把 Leaderboard.submit 換成記錄器，假的 root 記下 appendChild 的順序：要先「結算卡片進畫面」、後「送榜」
  const kit = global.Reaction.kit, realSubmit = LB.submit, order = [];
  LB.submit = (ref, v) => { order.push(['submit', ref && ref.id, v]); return Promise.resolve({ status: 'stub' }); };
  const root = { appendChild: () => order.push(['append']) };
  const submitted = () => order.filter(o => o[0] === 'submit');
  global.Reaction.current = spot;
  kit.result(root, { num: '12', score: 12 });
  ok(order.length === 2 && order[0][0] === 'append' && order[1][0] === 'submit' && order[1][1] === 'spot' && order[1][2] === 12,
    'kit.result 帶 score：先放結算卡片、再送榜（送給目前這款遊戲）：' + JSON.stringify(order));
  order.length = 0; kit.result(root, { num: '0' });
  ok(submitted().length === 0, 'kit.result 沒給 score → 不送榜');
  order.length = 0; kit.result(root, { num: '0', score: null });
  ok(submitted().length === 0, 'score: null（例如氣球爆了）→ 不送榜');
  order.length = 0; kit.result(root, { num: '0', score: undefined });
  ok(submitted().length === 0, 'score: undefined → 不送榜');
  order.length = 0; kit.result(root, { num: '0', score: 0 });
  ok(submitted().length === 1 && submitted()[0][2] === 0, 'score: 0 照送（有效範圍由 Leaderboard.submit 判斷，0 關會被它略過）');
  global.Reaction.current = null;
  order.length = 0; kit.result(root, { num: '1', score: 5 });
  ok(submitted().length === 0, 'Reaction.current 沒設定（不是在遊戲頁面）→ 不送榜');
  global.Reaction.current = byId.cake;
  order.length = 0; kit.result(root, { num: '3', score: 3 }); kit.result(root, { num: '4', score: 4 });
  ok(submitted().map(o => o[1] + ':' + o[2]).join() === 'cake:3,cake:4', '每次結算都會送，各自帶自己的成績');
  const rv = kit.result(root, { num: 'x' });
  ok(typeof rv === 'object', 'kit.result 仍回傳結算卡片元素');
  LB.submit = realSubmit; global.Reaction.current = null;

  // ═══ 11. Leaderboard.submit 對全部 78 款遊戲：範圍檢查與完整送榜流程 ═══
  // 假資料庫認得全部遊戲，行為跟 MF_submit_score 一樣：不認得的遊戲 → unknown_game
  const posted = [];
  global.fetch = (url, opt) => {
    const name = url.split('/rpc/')[1], b = JSON.parse(opt.body), g = byId[b.p_game_id];
    let out;
    if (name === 'MF_get_top') out = g ? { game_id: g.id, better: g.score.better, limit: 30, top: [] } : null;
    else if (name === 'MF_submit_score') {
      posted.push(b);
      out = g ? { ok: true, saved: true, rank: 1, game_id: g.id, better: g.score.better, limit: 30, top: [{ rank: 1, nick: b.p_nickname, score: b.p_score, mine: true }] } : { ok: false, error: 'unknown_game' };
    } else out = { ok: true, rows: 0 };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(out) });
  };
  let flowChecked = 0;
  console.log = () => { };                    // 78 款 × 6 次送榜，模組的主控台訊息太多，這一段先靜音（FAIL 仍用 say 印出）
  for (const g of games) {
    const s = g.score;
    resetClient(); LB.setNick('測試員'); ui.celebrated.length = 0; posted.length = 0;
    for (const bad2 of [s.min - 1, s.max + 1, s.max + 0.5]) {
      const rr = await LB.submit(g.id, bad2);
      ok(rr.status === 'skip', g.id + ' 超出範圍 ' + s.min + '～' + s.max + ' 的成績（' + bad2 + '）要略過：' + rr.status);
    }
    ok(posted.length === 0, g.id + ' 範圍外的成績完全不連網');
    // 範圍的兩個端點本身都是有效成績；中間值也是
    for (const v of [s.min, s.max, sample(s)]) {
      resetClient(); LB.setNick('測試員'); ui.celebrated.length = 0; posted.length = 0;
      const rr = await LB.submit(g.id, v);
      ok(rr.status === 'saved' && rr.rank === 1, g.id + ' 成績 ' + v + ' 應該送出並進榜：' + JSON.stringify(rr));
      ok(posted.length === 1 && posted[0].p_game_id === g.id && posted[0].p_score === v && posted[0].p_nickname === '測試員', g.id + ' 送出的欄位正確：' + JSON.stringify(posted[0]));
      ok(ui.celebrated.length === 1 && ui.celebrated[0].game === g && ui.celebrated[0].score === v, g.id + ' 進榜 → 慶祝（帶著這款遊戲與成績）');
      flowChecked++;
    }
  }
  console.log = say;
  say('送榜流程：' + games.length + ' 款遊戲 × 範圍外 3 種、範圍內 3 種成績，共 ' + flowChecked + ' 次送榜皆正確');
  // 不認得的遊戲代號：LB 這邊不會送；資料庫這邊會拒絕（見 sql_test.mjs）
  resetClient(); LB.setNick('測試員'); posted.length = 0;
  ok((await LB.submit('no_such_game', 5)).status === 'skip' && posted.length === 0, '沒登記的遊戲 id → 略過');

  console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS ' + total);
  process.exit(bad ? 1 : 0);
})();
