// 產生 js/fillpath_bank.js：「一筆填滿（blockfill）」與「多色填滿（multifill）」的題庫（V1.57.3.0；V1.57.3.1 加上「結構限制」）。
//
// 為什麼要有題庫：這兩款遊戲要的是「人類最難解」的題目。隨機出的區域幾乎都有幾十、幾百種解，亂走就走得出來（太容易）；
// 好的題目要「解只有一種、聰明的走法也會被騙」，這種題目只能讓電腦搜尋。所以離線搜尋（模擬退火），存成靜態題庫，遊戲出題時依關卡與難度參數挑一題、隨機翻轉旋轉。
//
// 「難」怎麼量（用玩家提供的參考遊戲校準過）：把參考遊戲 EXTRA HARD 的 8 個題目（一筆填滿 2 題、多色填滿 6 題）轉成題目字串、用同一套工具量：
//   它們全部「剛好只有 1 種解」，而且連「只看得到孤立格與死路」的簡單走法，到第一個解也只要試 20～700 個節點（大約等於格子數：幾乎不用回頭）。
//   所以「最難」不是越大越好——那會變成連電腦都要試十幾萬步、人類只能亂猜的題目。這裡的做法是：**每一級瞄準一個目標難度**，
//   第 4 級大約等於參考遊戲最難的題目，第 9 級大約是它的 30 倍。
//
// V1.57.3.1 的教訓：只看「難度」會被鑽漏洞——解越少越好，電腦就偷偷把題目弄成「有一條路只有 1～2 格」的怪樣子（第一版多色題庫 140 題有 43 題如此），
//   而且區域變成幾乎沒有岔路的走廊。所以現在每個題目還要量「結構」（js/fillpath_core.js 的 FP.analyze）：
//   每條路的長度要夠長、長短不能差太多、轉彎要多、直線不能太長、岔路口要夠多、走廊不能太多。這些數字用玩家的參考題校準
//   （參考題的最短一條路 ≥ 4 格、轉彎比例 0.6～0.8、岔路口佔格子數 0.3～0.7），寫在 PROF 表裡，分「寬鬆／中等／嚴格」三種強度（profile 0／1／2）。
//   搜尋時把「違反結構要求的程度」直接扣分；題庫只收「連寬鬆那一種都合格」的題目；中等、嚴格那種各自搜出來的題目，會讓題庫裡有各種結構的題目，
//   遊戲裡的難度參數（[第一關, 封頂]）才調得動。
//
// 搜尋的做法（每一題）：
//   ① 一塊區域（棋盤裡留下哪些格子、其餘是空洞）＋起點們（多色填滿的起點數 2～4 也可以變），是「狀態」；一次改一點：開／關一格、換一對格子、移動一個起點、增減一個起點；
//   ② 每個狀態用解題器（js/fillpath_core.js 的 FP.solve）檢查：一定要有解；數解（最多數到 3）；記下解題器自己搜了多大（n3）；用第一個解量結構；
//   ③ 站在人類的立場走一遍（V1.57.3.2，玩家的觀察：難度在 T 字／十字路口，而且走過的路會把旁邊變成 T 字；人會先找終點、避免做出死巷）：
//      FP.human 沿著解一步一步畫，數「路口」（前面有 2 個以上方向）、「要猜的路口」（連細心數死巷的人都還有 2 個以上方向）、
//      「深陷阱」（錯的方向要走 3 步以上才卡住）、藏起來的終點，算出「人類試錯量」hx（每一步 1，加上每個錯方向一半的機會先試到 × 試多少步才發現錯）；
//   ④ 分數＝ −|ln(1＋hx) − ln(1＋這一級的目標)| − 0.4 × |ln(1＋n3) − ln(1＋目標 n3)| − 2.5 × (解數 − 1) − 3 × 結構違反程度，越接近 0 越好；
//   ⑤ 格子數、棋盤大小由「難度級」決定（TIERS 表，第 0 級最小最簡單、第 12 級最大最難）；區域一定要連成一塊。
//
// 用法（在專案根目錄；結果存在工作資料夾的 JSON，最後用 build 組成 js/fillpath_bank.js）：
//   node test/reaction/gen_fillpath_bank.cjs run <block|multi> <級數 0～12> <分鐘> <工作資料夾> [強度 0～2，預設 1] [每個起點數最多留幾題，預設 14]
//   node test/reaction/gen_fillpath_bank.cjs merge <目標資料夾> <來源資料夾>…    把好幾個工作資料夾的題目合併進目標資料夾（翻轉旋轉之後一樣的算重複）
//   node test/reaction/gen_fillpath_bank.cjs build <工作資料夾> [每級留幾題，預設 36]   把全部 JSON 組成 js/fillpath_bank.js（CRLF）；舊格式的題目也會重新量結構、不合格的丟掉
//   node test/reaction/gen_fillpath_bank.cjs show <工作資料夾> [block|multi]    把每級的題目畫成文字看看
//   node test/reaction/gen_fillpath_bank.cjs stats                              列出目前 js/fillpath_bank.js 每一級各項結構數字的範圍（調難度參數前先看這個）
//   搜尋是隨機的，每次跑出來的題庫不一樣；題庫是靜態檔案，產生好之後用 git 提交就好。
//   測試（test/reaction/t_fillpath.js）會把題庫裡的每一題重新驗證一遍（有解、解數、格子數、起點、連成一塊、結構數字對得上）。
const fs = require('fs');
const path = require('path');
global.window = global;
require('../../js/fillpath_core.js');
const FP = global.Reaction.fillPath;
const ROOT = path.resolve(__dirname, '../../');

// 難度級：[棋盤寬, 棋盤高] 的候選、格子數範圍、起點數範圍 kr、目標難度 eT（人類試錯量 hx）與 nT（解題器節點）
const TIERS = {
  block: [
    { dims: [[4, 4], [4, 5]], tiles: [10, 13], kr: [1, 1], eT: 12, nT: 15 },
    { dims: [[4, 5], [5, 4], [5, 5]], tiles: [14, 17], kr: [1, 1], eT: 30, nT: 30 },
    { dims: [[5, 5], [4, 6]], tiles: [18, 21], kr: [1, 1], eT: 70, nT: 60 },
    { dims: [[5, 6], [6, 5]], tiles: [22, 25], kr: [1, 1], eT: 150, nT: 120 },
    { dims: [[6, 6], [5, 7]], tiles: [26, 30], kr: [1, 1], eT: 300, nT: 250 },
    { dims: [[6, 7], [7, 6]], tiles: [31, 35], kr: [1, 1], eT: 600, nT: 500 },
    { dims: [[6, 8], [7, 7]], tiles: [36, 40], kr: [1, 1], eT: 1200, nT: 1000 },
    { dims: [[7, 8], [8, 7]], tiles: [41, 45], kr: [1, 1], eT: 2400, nT: 2000 },
    { dims: [[7, 9], [8, 8]], tiles: [46, 50], kr: [1, 1], eT: 4800, nT: 4000 },
    { dims: [[7, 9], [9, 7]], tiles: [51, 55], kr: [1, 1], eT: 9000, nT: 8000 },
    // V1.57.3.2 玩家把 TILES 封頂調到 72：再加 3 級大棋盤（目標試錯量不再往上翻倍，只是格子變多）
    { dims: [[8, 9], [9, 8]], tiles: [56, 60], kr: [1, 1], eT: 8000, nT: 8000 },
    { dims: [[8, 10], [9, 9]], tiles: [61, 66], kr: [1, 1], eT: 9000, nT: 9000 },
    { dims: [[9, 10], [8, 11]], tiles: [67, 74], kr: [1, 1], eT: 10000, nT: 10000 }
  ],
  multi: [
    { dims: [[4, 4], [4, 5]], tiles: [11, 14], kr: [2, 3], eT: 12, nT: 15 },
    { dims: [[4, 5], [5, 5]], tiles: [15, 18], kr: [2, 3], eT: 30, nT: 30 },
    { dims: [[5, 5], [4, 6]], tiles: [19, 22], kr: [2, 3], eT: 70, nT: 60 },
    { dims: [[5, 6], [6, 5]], tiles: [22, 26], kr: [3, 4], eT: 150, nT: 120 },
    { dims: [[5, 7], [6, 6]], tiles: [27, 31], kr: [3, 4], eT: 300, nT: 250 },
    { dims: [[6, 7], [7, 6]], tiles: [32, 36], kr: [3, 4], eT: 600, nT: 500 },
    { dims: [[6, 8], [7, 7]], tiles: [37, 41], kr: [3, 4], eT: 1200, nT: 1000 },
    { dims: [[6, 8], [7, 7]], tiles: [38, 42], kr: [3, 4], eT: 2400, nT: 2000 },
    { dims: [[7, 8], [8, 7]], tiles: [43, 47], kr: [3, 4], eT: 4800, nT: 4000 },
    { dims: [[7, 9], [9, 7]], tiles: [48, 54], kr: [3, 4], eT: 9000, nT: 8000 },
    { dims: [[8, 9], [9, 8]], tiles: [55, 60], kr: [3, 4], eT: 8000, nT: 8000 },
    { dims: [[8, 10], [9, 9]], tiles: [61, 66], kr: [3, 4], eT: 9000, nT: 9000 },
    { dims: [[9, 10], [8, 11]], tiles: [67, 74], kr: [3, 4], eT: 10000, nT: 10000 }
  ]
};
// 結構要求（三種強度 0 寬鬆、1 中等、2 嚴格）。V1.57.3.2 起改用「人類視角」（js/fillpath_core.js 的 FP.human）：
//   難度不在轉彎多少，而在「路上有幾個 T 字／十字路口要選、錯的方向要走多遠才發現、終點藏了幾個」。
//   參考題（玩家提供）：block 104 路口 15／要猜 5／深陷阱 4；block 105 路口 13／要猜 6／深陷阱 9；多色 EXTRA 3 路口 15／要猜 9／藏 1 個終點。
//   raw／guess／deep＝路口數／要猜的路口數／深陷阱數佔格子數的比例下限（guess、deep 取無條件捨去，小棋盤可以是 0）；
//   lo／hi＝多色的最短／最長那條路 ÷ 平均每條路的格子數（lo 至少 3 格）；hid＝多色（3 條路以上）至少藏幾個終點。
const PROF = {
  multi: { lo: [0.40, 0.55, 0.70], hi: [2.0, 1.7, 1.45], raw: [0.30, 0.38, 0.46], guess: [0.06, 0.10, 0.14], deep: [0.04, 0.07, 0.10], hid: [0, 1, 1] },
  block: { raw: [0.25, 0.32, 0.40], guess: [0.06, 0.10, 0.14], deep: [0.04, 0.07, 0.10] }
};
const W_STRUCT = 3;          // 結構違反的扣分倍數
// 結構違反的程度（0＝完全合格；每一項是「差多少 ÷ 門檻」，加起來）。m＝FP.analyze 加上 FP.human 的結果
function viol(kind, prof, m, tiles, k) {
  const P = PROF[kind]; let v = 0;
  const lowV = (val, t) => (t > 0 && val < t) ? (t - val) / t : 0, highV = (val, t) => (t > 0 && val > t) ? (val - t) / t : 0;
  if (kind === 'multi') {
    const avg = tiles / k; v += 2 * lowV(m.lo, Math.max(3, Math.round(avg * P.lo[prof]))); v += highV(m.hi, Math.round(avg * P.hi[prof]));
    if (k >= 3 && m.hid !== undefined) v += lowV(m.hid, P.hid[prof]);
  }
  if (m.raw !== undefined) v += lowV(m.raw, Math.round(tiles * P.raw[prof])) + lowV(m.guess, Math.floor(tiles * P.guess[prof])) + lowV(m.deep, Math.floor(tiles * P.deep[prof]));
  return v;
}
// 只看路長的那一部分（還沒做人類分析之前，先用它擋掉明顯不合格的）
function pathViol(kind, prof, m, tiles, k) { return viol(kind, prof, { lo: m.lo, hi: m.hi }, tiles, k); }
// 每一題最後存進題庫的結構數字（FP.analyze 的一部分＋FP.human）
const KEEP = ['lo', 'hi', 't3', 'x4', 'x4d', 'raw', 'dec', 'd3', 'bits', 'guess', 'deep', 'trap', 'hid'];
function measureAll(p, first) { const a = FP.analyze(p, first), hm = FP.human(p, first), m = {}; KEEP.forEach(key => { m[key] = key in hm ? hm[key] : a[key]; }); return { m, hx: hm.hx }; }

function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 區域是不是連成一塊
function connected(w, h, mask) {
  let s = -1, n = 0; for (let i = 0; i < w * h; i++) if (mask[i]) { n++; if (s < 0) s = i; }
  if (s < 0) return false;
  const seen = new Uint8Array(w * h), st = [s]; seen[s] = 1; let c = 1;
  while (st.length) { const u = st.pop(), r = (u / w) | 0, cc = u % w, nb = []; if (r > 0) nb.push(u - w); if (r < h - 1) nb.push(u + w); if (cc > 0) nb.push(u - 1); if (cc < w - 1) nb.push(u + 1); for (const v of nb) if (mask[v] && !seen[v]) { seen[v] = 1; c++; st.push(v); } }
  return c === n;
}
// 評分
// 分數＝ −|ln(1＋人類試錯量) − ln(1＋目標)| − 0.4 × |ln(1＋n3) − ln(1＋目標 n3)| − 2.5 × (解數 − 1) − 3 × 結構違反程度
function evaluate(w, h, mask, starts, cfg, rand, prof) {
  const k = starts.length;
  const p = { w, h, mask, starts, k, tiles: 0 }; for (let i = 0; i < w * h; i++) p.tiles += mask[i];
  const g = FP.graph(p), s = FP.solve(g, starts, { limit: 3, budget: 600000, level: 2 });
  if (s.aborted || s.count === 0) return null;
  const a = FP.analyze(p, s.first), base = -0.4 * Math.abs(Math.log(1 + s.nodes) - Math.log(1 + cfg.nT)) - 2.5 * (s.count - 1);
  const vp = pathViol(cfg.kind, prof, a, p.tiles, k);
  if (vp > 1.5) return { count: s.count, n3: s.nodes, mean: 0, aborted: 0, tiles: p.tiles, ds: base - 6, v: vp, v0: 9, m: a, k, skip: true, score: base - 6 - W_STRUCT * vp };   // 路長太差：不必再花時間做人類分析
  const q = measureAll(p, s.first), v = viol(cfg.kind, prof, q.m, p.tiles, k), v0 = viol(cfg.kind, 0, q.m, p.tiles, k);
  const ds = base - Math.abs(Math.log(1 + q.hx) - Math.log(1 + cfg.eT));
  return { count: s.count, n3: s.nodes, mean: q.hx, aborted: 0, tiles: p.tiles, ds, v, v0, m: q.m, k, score: ds - W_STRUCT * v };
}
function canon(w, h, mask, starts) {   // 8 種翻轉旋轉裡字串最小的那個，拿來去重
  const p = { w, h, mask, starts, k: starts.length, tiles: 0 }; let best = null;
  for (let t = 0; t < 8; t++) { const s = FP.serialize(FP.transform(p, t)); if (best === null || s < best) best = s; }
  return best;
}
function randomState(cfg, rand) {
  const [w, h] = cfg.dims[(rand() * cfg.dims.length) | 0], N = w * h, k = cfg.kr[0] + ((rand() * (cfg.kr[1] - cfg.kr[0] + 1)) | 0);
  for (let tries = 0; tries < 500; tries++) {
    const mask = new Uint8Array(N).fill(1); let tiles = N;
    const target = cfg.tiles[0] + Math.floor(rand() * (cfg.tiles[1] - cfg.tiles[0] + 1));
    while (tiles > target) { const x = (rand() * N) | 0; if (mask[x]) { mask[x] = 0; tiles--; } }
    if (tiles < target || !connected(w, h, mask)) continue;
    const cs = []; for (let i = 0; i < N; i++) if (mask[i]) cs.push(i);
    const starts = []; while (starts.length < k) { const x = cs[(rand() * cs.length) | 0]; if (starts.indexOf(x) < 0) starts.push(x); }
    return { w, h, mask, starts };
  }
  return null;
}
function anneal(cfg, rand, iters, prof) {
  let st = null, r = null;
  for (let t = 0; t < 300 && !r; t++) { st = randomState(cfg, rand); if (!st) continue; r = evaluate(st.w, st.h, st.mask, st.starts, cfg, rand, prof); }
  if (!r) return null;
  const { w, h } = st, N = w * h; let mask = st.mask, starts = st.starts, cur = r.score, best = { mask: mask.slice(), starts: starts.slice(), r, score: cur, w, h };
  for (let it = 0; it < iters; it++) {
    const m2 = mask.slice(), s2 = starts.slice(), kind = rand();
    if (kind < 0.40) { const x = (rand() * N) | 0; if (s2.indexOf(x) >= 0) continue; m2[x] ^= 1; }
    else if (kind < 0.68) { const x = (rand() * N) | 0, y = (rand() * N) | 0; if (s2.indexOf(x) >= 0 || s2.indexOf(y) >= 0 || m2[x] === m2[y]) continue; m2[x] ^= 1; m2[y] ^= 1; }
    else if (kind < 0.76 && cfg.kr[0] < cfg.kr[1]) {                         // 增減一個起點（起點數在 kr 範圍內）
      if (rand() < 0.5 && s2.length < cfg.kr[1]) { const cs = []; for (let i = 0; i < N; i++) if (m2[i] && s2.indexOf(i) < 0) cs.push(i); s2.push(cs[(rand() * cs.length) | 0]); }
      else if (s2.length > cfg.kr[0]) s2.splice((rand() * s2.length) | 0, 1);
      else continue;
    } else {
      const j = (rand() * s2.length) | 0, s0 = s2[j], rr = (s0 / w) | 0, cc = s0 % w, nb = [];
      if (rr > 0) nb.push(s0 - w); if (rr < h - 1) nb.push(s0 + w); if (cc > 0) nb.push(s0 - 1); if (cc < w - 1) nb.push(s0 + 1);
      const cand = nb.filter(x => m2[x] && s2.indexOf(x) < 0);
      if (rand() < 0.6 && cand.length) s2[j] = cand[(rand() * cand.length) | 0]; else { const cs = []; for (let i = 0; i < N; i++) if (m2[i] && s2.indexOf(i) < 0) cs.push(i); s2[j] = cs[(rand() * cs.length) | 0]; }
    }
    let tiles = 0; for (let i = 0; i < N; i++) tiles += m2[i];
    if (tiles < cfg.tiles[0] || tiles > cfg.tiles[1] || !s2.every(x => m2[x]) || new Set(s2).size !== s2.length || !connected(w, h, m2)) continue;
    const r2 = evaluate(w, h, m2, s2, cfg, rand, prof); if (!r2) continue;
    const T = 0.6 * (1 - it / iters) + 0.03;
    if (r2.score >= cur || rand() < Math.exp((r2.score - cur) / T)) {
      mask = m2; starts = s2; cur = r2.score; r = r2;
      if (cur > best.score) best = { mask: mask.slice(), starts: starts.slice(), r, score: cur, w, h };
    }
  }
  return best.r.skip ? null : best;
}
const entryOf = b => ({ s: FP.serialize({ w: b.w, h: b.h, mask: b.mask, starts: b.starts }), c: b.r.count, e: Math.round(b.r.mean), n3: b.r.n3, ds: Math.round(b.r.ds * 100) / 100, sc: Math.round(b.score * 100) / 100, v0: Math.round(b.r.v0 * 100) / 100, a: b.r.aborted });

function cmdRun(kind, tier, minutes, dir, prof, keep) {
  const cfg0 = TIERS[kind][tier]; if (!cfg0) throw new Error('沒有這一級'); const cfg = Object.assign({ kind }, cfg0);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, kind + '_' + tier + '_p' + prof + '.json'), rand = mulberry((Date.now() ^ (tier * 7919) ^ (prof * 104729) ^ (kind === 'multi' ? 12345 : 0) ^ (process.pid * 31)) & 0x7fffffff);
  let pool = []; try { pool = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { }
  const seen = new Set(pool.map(e => { const p = FP.parse(e.s); return canon(p.w, p.h, p.mask, p.starts); }));
  const iters = 250 + tier * 60, t0 = Date.now(); let runs = 0, kept = 0;
  while (Date.now() - t0 < minutes * 60000) {
    const b = anneal(cfg, rand, iters, prof); runs++;
    if (!b || b.r.v0 > 0 || b.r.count > 3) continue;                       // 連「寬鬆」的結構要求都沒過：不收
    const c = canon(b.w, b.h, b.mask, b.starts); if (seen.has(c)) continue; seen.add(c);
    pool.push(entryOf(b)); kept++;
    // 每種起點數各留分數最高的 keep 題（起點數不同的題目分開比，避免某一種把題庫佔滿）
    const byK = {}; pool.forEach(e => { const kk = FP.parse(e.s).k; (byK[kk] = byK[kk] || []).push(e); });
    pool = [].concat(...Object.values(byK).map(l => l.sort((x, y) => y.sc - x.sc).slice(0, keep * 2)));
    fs.writeFileSync(file, JSON.stringify(pool));
    if (kept % 3 === 1) console.log(`[${kind} 第 ${tier} 級 強度 ${prof}] 第 ${runs} 次搜尋：格 ${b.r.tiles}、${b.r.k} 條路、解 ${b.r.count}、試走 ${Math.round(b.r.mean)}、結構違反 ${b.r.v.toFixed(2)}、分數 ${b.score.toFixed(2)}；題庫 ${pool.length} 題`);
  }
  console.log(`[${kind} 第 ${tier} 級 強度 ${prof}] 結束：搜尋 ${runs} 次，新收 ${kept} 題，題庫 ${pool.length} 題`);
}
// 工作資料夾裡這一級的全部 JSON（新格式 kind_tier_pN.json、舊格式 kind_tier.json 都讀）
function poolFiles(dir, kind, t) { try { return fs.readdirSync(dir).filter(f => new RegExp('^' + kind + '_' + t + '(_[a-z0-9]+)?\\.json$').test(f)); } catch (e) { return []; } }   // 也讀「舊題庫」改名成 kind_t_old….json 的檔案（build 時會重新量、不合格的丟掉）
function loadTier(dir, kind, t) { let all = []; for (const f of poolFiles(dir, kind, t)) { try { all = all.concat(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch (e) { } } return all; }
// 量一題：回傳 { m 結構, v0, tiles, k, c, e } 或 null（無解）
function measure(e) {
  const p = FP.parse(e.s), g = FP.graph(p), s = FP.solve(g, p.starts, { limit: 3, budget: 2000000, level: 2 });
  if (s.aborted || s.count < 1) return null;
  const q = measureAll(p, s.first); return { p, m: q.m, hx: q.hx, c: s.count };
}
function cmdBuild(dir, keep) {
  const out = { block: [], multi: [] }, stat = [];
  for (const kind of ['block', 'multi']) for (let t = 0; t < TIERS[kind].length; t++) {
    const seen = new Set(), list = []; let drop = 0;
    for (const e of loadTier(dir, kind, t)) {
      const q = measure(e); if (!q || q.c > 3) { drop++; continue; }
      if (viol(kind, 0, q.m, q.p.tiles, q.p.k) > 0) { drop++; continue; }                // 舊格式或結構不合格的題目丟掉
      const c = canon(q.p.w, q.p.h, q.p.mask, q.p.starts); if (seen.has(c)) continue; seen.add(c);
      // 題庫記的難度 e ＝人類試錯量（FP.human 的 hx）；分數重新算（舊格式的題目當初是用別的難度量法搜的）
      list.push({ s: e.s, c: q.c, e: q.hx, t: q.p.tiles, k: q.p.k, m: q.m, ds: -Math.abs(Math.log(1 + q.hx) - Math.log(1 + TIERS[kind][t].eT)) - 2.5 * (q.c - 1) });
    }
    // 參考遊戲的題目全部「剛好 1 種解」：有 1 種解的優先；有 2～3 種解的只在 1 種解的題目不到 20 題時才補上
    list.sort((a, b) => ((a.c === 1 ? 0 : 1) - (b.c === 1 ? 0 : 1)) || (b.ds - a.ds));
    const nUniq = list.filter(x => x.c === 1).length;
    if (nUniq >= 20) list.length = nUniq; else list.length = Math.min(list.length, 20);
    list.sort((a, b) => b.ds - a.ds);
    // 每種起點數都要有：先各留一些，再依分數補滿
    const ks = [...new Set(list.map(x => x.k))], pick = [];
    ks.forEach(kk => list.filter(x => x.k === kk).slice(0, Math.max(4, Math.floor(keep / ks.length / 2))).forEach(x => pick.push(x)));
    list.forEach(x => { if (pick.length < keep && pick.indexOf(x) < 0) pick.push(x); });
    pick.sort((a, b) => (a.t - b.t) || (a.e - b.e));
    out[kind].push(pick.map(x => ({ s: x.s, c: x.c, e: x.e, t: x.t, k: x.k, m: x.m })));
    stat.push(`${kind}${t}:${pick.length}(丟${drop})`);
  }
  const q = JSON.stringify;
  let text = '/* ═══════════════════════════════════════════════════════════════════\r\n' +
    '   fillpath_bank.js — 「一筆填滿」「多色填滿」的題庫（V1.57.3.0；V1.57.3.1 加上結構數字）。這個檔案是 test/reaction/gen_fillpath_bank.cjs 離線搜尋產生的，不要手改。\r\n' +
    '   block（一筆填滿，1 個起點）、multi（多色填滿，2～4 個起點）各分 13 個難度級（第 0 級最簡單、第 12 級最大最難）；\r\n' +
    '   每一題 { s: 題目字串, c: 解數（最多數到 3）, e: 試走難度, t: 格子數, k: 起點數, m: 結構數字 }；m 的意思見 js/fillpath_core.js 的 FP.analyze（lo／hi 最短最長路、tr 轉彎比例、st 最長直線、jn 岔路口、x4 十字路口、co 走廊比例、ch 選擇比例、cr 交叉數、sd 起點距離、vd 空洞數）。\r\n' +
    '   題目字串：每一列用 / 隔開；# 有格子、. 空洞、A～D 起點（A 是第 0 種顏色）。格式與讀法見 js/fillpath_core.js。\r\n' +
    '   ═══════════════════════════════════════════════════════════════════ */\r\n' +
    'window.FM_FILLPATH_BANK = {\r\n';
  for (const kind of ['block', 'multi']) {
    text += '    ' + kind + ': [\r\n';
    out[kind].forEach((list, t) => { text += '        [' + (list.length ? '\r\n' + list.map(e => '            ' + q(e)).join(',\r\n') + '\r\n        ' : '') + ']' + (t < out[kind].length - 1 ? ',' : '') + '\r\n'; });
    text += '    ]' + (kind === 'block' ? ',' : '') + '\r\n';
  }
  text += '};\r\n';
  fs.writeFileSync(path.join(ROOT, 'js/fillpath_bank.js'), text, 'utf8');
  console.log('已寫入 js/fillpath_bank.js：' + stat.join(' '));
}
function cmdShow(dir, kindOnly) {
  for (const kind of ['block', 'multi']) {
    if (kindOnly && kindOnly !== kind) continue;
    for (let t = 0; t < TIERS[kind].length; t++) {
      const pool = loadTier(dir, kind, t).sort((a, b) => (b.sc || 0) - (a.sc || 0));
      console.log(`══ ${kind} 第 ${t} 級（${pool.length} 題）══`);
      pool.slice(0, 3).forEach(e => { const q = measure(e); if (!q) return; console.log(`解 ${e.c}、試走 ${e.e}、格 ${q.p.tiles}、${q.p.k} 條路、` + JSON.stringify(q.m)); console.log(e.s.split('/').map(r => r.split('').map(c => c === '.' ? ' .' : ' ' + c).join('')).join('\n')); });
    }
  }
}
function cmdStats() {
  global.FM_FILLPATH_BANK = undefined; delete require.cache[require.resolve('../../js/fillpath_bank.js')]; require('../../js/fillpath_bank.js');
  const B = global.FM_FILLPATH_BANK;
  for (const kind of ['block', 'multi']) B[kind].forEach((l, t) => {
    const rng = key => { const v = l.map(e => e.m[key]); return Math.min(...v) + '～' + Math.max(...v); };
    console.log(`${kind} 第 ${t} 級 ${l.length} 題：格 ${l.map(e => e.t).reduce((a, b) => Math.min(a, b), 99)}～${Math.max(...l.map(e => e.t))}、路數 ${[...new Set(l.map(e => e.k))].join('/')}、試錯量 ${Math.min(...l.map(e => e.e))}～${Math.max(...l.map(e => e.e))}、` + KEEP.map(k => k + ' ' + rng(k)).join('、'));
  });
}
function cmdMerge(dst, srcs) {
  fs.mkdirSync(dst, { recursive: true });
  const names = new Set();
  for (const d of [dst].concat(srcs)) { try { fs.readdirSync(d).filter(f => /^(block|multi)_\d+(_p\d)?\.json$/.test(f)).forEach(f => names.add(f)); } catch (e) { } }
  for (const f of names) {
    const seen = new Set(), all = [];
    for (const d of [dst].concat(srcs)) {
      let pool = []; try { pool = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch (e) { }
      for (const e of pool) { const p = FP.parse(e.s), c = canon(p.w, p.h, p.mask, p.starts); if (!seen.has(c)) { seen.add(c); all.push(e); } }
    }
    if (all.length) { all.sort((x, y) => y.sc - x.sc); fs.writeFileSync(path.join(dst, f), JSON.stringify(all.slice(0, 80))); }
  }
  console.log('已合併進 ' + dst);
}

const [cmd, a1, a2, a3, a4, a5, a6] = process.argv.slice(2);
if (cmd === 'run') cmdRun(a1, Number(a2), Number(a3), a4, a5 === undefined ? 1 : Number(a5), Number(a6 || 14));
else if (cmd === 'merge') cmdMerge(a1, process.argv.slice(4));
else if (cmd === 'build') cmdBuild(a1, Number(a2 || 36));
else if (cmd === 'show') cmdShow(a1, a2);
else if (cmd === 'stats') cmdStats();
else console.log('用法：run <block|multi> <級數> <分鐘> <工作資料夾> [強度 0～2] [每個起點數留幾題] ／ merge <目標> <來源…> ／ build <工作資料夾> [每級留幾題] ／ show <工作資料夾> [block|multi] ／ stats');
