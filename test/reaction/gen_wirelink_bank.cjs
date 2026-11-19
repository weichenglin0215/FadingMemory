// 產生 js/wirelink_bank.js：「接電線（wirelink）」的題庫（V1.57.3.2）。
//
// 為什麼改成題庫：以前每一關臨時出題（把走遍整個棋盤的路切成幾段），用「站在人類立場走一遍」（js/reaction_wirelink.js 的 human）量過之後發現：
//   · 前面的關卡（6×6 以下）解雖然唯一，但幾乎每一步都沒得選——路口 1～6 個、要猜的 0～2 個，一下就連完；
//   · 後面的關卡（7×7 以上）多半有 2 種以上的解：看起來很多地方要猜，其實是「怎麼走都對」，難度是假的。
//   好的題目要「解只有一種，而且路上很多 T 字路口，錯的方向一眼看不出來、要走很多步才卡住」，這種題目只能讓電腦慢慢搜尋，所以離線產生、存成靜態題庫。
//
// 接電線跟「一筆填滿／多色填滿」的不同：一開局就看得到每種顏色的兩個插頭（起點和終點都知道），而且電線要佈滿整個方格板（沒有空洞）。
// 所以「難」只來自路上的選擇：人可以從任何一個插頭開始畫，會先畫沒得選的那條；站在線頭上，前面有幾個方向？哪些錯的方向一眼看不出來？
//
// 搜尋的做法（模擬退火，每一題）：
//   ① 狀態＝每種顏色一條電線（從一個插頭走到另一個插頭），全部合起來剛好蓋滿棋盤——所以一定有解；一開始用「走遍棋盤的路切成 k 段」；
//      一次改一點：線尾交給隔壁的線、線自己翻折（backbite）、一條拆成兩條、兩條接成一條（顏色數在範圍內增減）；
//   ② 用解題器（flowSolve）數解（數到 24）：一定要只有 1 種解；還有別的解時，記下「別的解跟答案不一樣的格子」，下一步專門在那裡動手（把別的解堵死），
//      而且這個階段只接受沒有變差的改法（貪心），大棋盤才走得到唯一解；電線「碰到自己」（轉回來貼著自己）也扣分，那種地方常常有別的走法；
//   ③ human 量：路口數、要猜的路口數、深陷阱數、人類試錯量 hx；metrics 量「插頭連線互相穿越」等干擾指標；
//   ④ 做到唯一解之後用退火：分數＝ −|ln(1＋hx) − ln(1＋這一級的目標)| − 3 × 結構違反程度（PROF 表，三種強度）。
//
// 用法（在專案根目錄）：
//   node test/reaction/gen_wirelink_bank.cjs run <級數 0～9> <分鐘> <工作資料夾> [強度 0～2，預設 1] [每個顏色數最多留幾題，預設 14]
//   node test/reaction/gen_wirelink_bank.cjs build <工作資料夾> [每級留幾題，預設 30]    組成 js/wirelink_bank.js（CRLF）
//   node test/reaction/gen_wirelink_bank.cjs stats                                       列出題庫每一級各項數字的範圍
//   搜尋是隨機的，每次跑出來的題庫不一樣；題庫是靜態檔案，產生好之後用 git 提交就好。測試（t_wirelink.js）會把每一題重新驗證。
const fs = require('fs');
const path = require('path');
const { game } = require('./load.js');
const T = (game('reaction_wirelink.js') || global.Reaction.list().filter(g => g.id === 'wirelink')[0]).test;   // 測試檔已經載入過遊戲檔時，從登記清單拿
const ROOT = path.resolve(__dirname, '../../');

// 難度級：棋盤寬 w、高 h（直的，w ≤ h；遊戲要橫的就轉 90 度）、顏色數範圍 kr、目標人類試錯量 eT。
// 這 11 種大小就是遊戲 SIZE_W [5, 9]、SIZE_H [5, 11]、COLORS [4, 10] 在第 1～30 關會出現的大小（5×5、5×6、6×6、6×7、7×7、7×8、7×9、8×9、8×10、9×10、9×11）。
// maxSol＝這一級的題目最多可以有幾種解（沒寫＝1，一定要唯一解）：9×11 太難做出唯一解，玩家同意放寬到 3 種（判定只看規則，走出別的解也算過關）
const TIERS = [
  { w: 5, h: 5, kr: [4, 5], eT: 30 },
  { w: 5, h: 6, kr: [4, 6], eT: 50 },
  { w: 6, h: 6, kr: [5, 6], eT: 90 },
  { w: 6, h: 7, kr: [5, 7], eT: 150 },
  { w: 7, h: 7, kr: [6, 7], eT: 250 },
  { w: 7, h: 8, kr: [6, 8], eT: 400 },
  { w: 7, h: 9, kr: [7, 9], eT: 650 },
  { w: 8, h: 9, kr: [7, 9], eT: 1000 },
  { w: 8, h: 10, kr: [8, 10], eT: 1600 },
  { w: 9, h: 10, kr: [8, 10], eT: 2400 },
  { w: 9, h: 11, kr: [9, 10], eT: 3500, maxSol: 3 }
];
// 結構要求（強度 0 寬鬆、1 中等、2 嚴格）：raw／guess／deep＝路口／要猜的路口／深陷阱至少佔格子數幾成（guess、deep 捨去）；
// cf＝插頭連線互相穿越的電線至少幾成；ez＝「最短路線就是答案」的電線最多幾成；md＝每對插頭至少相距幾格
const PROF = { raw: [0.12, 0.18, 0.24], guess: [0.05, 0.09, 0.13], deep: [0.03, 0.05, 0.08], cf: [0.4, 0.6, 0.8], ez: [0.4, 0.25, 0.15], md: [2, 3, 3] };
const W_STRUCT = 3, MIN_SEG = 3;
const EXTRA = cfg => cfg.w * cfg.h >= 90 ? 4000 : 1500;   // 還沒做到唯一解時最多再多走幾步（9×10、9×11 要比較久）
function viol(prof, m, N) {
  const lowV = (val, t) => (t > 0 && val < t) ? (t - val) / t : 0, highV = (val, t) => (val > t) ? (val - t) / Math.max(t, 0.1) : 0;
  return lowV(m.raw, Math.round(N * PROF.raw[prof])) + lowV(m.guess, Math.floor(N * PROF.guess[prof])) + lowV(m.deep, Math.floor(N * PROF.deep[prof]))
    + lowV(m.cf, PROF.cf[prof]) + highV(m.ez, PROF.ez[prof]) + lowV(m.md, PROF.md[prof]);
}
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function nbr(D, x) { return T.neighbors(D, x); }
// ── 狀態＝每一條電線各自的路（segs：每條是一串格子，從一個插頭走到另一個插頭），全部合起來剛好蓋滿棋盤 ──
// 「電線碰到自己」：同一條線上不相連的兩格卻上下左右相鄰（線轉回來貼著自己）。量過：7×8、7 色隨機切出來的 300 題，碰到自己 3 次以上的沒有一題是唯一解——
// 貼著自己的地方，電線常常有別的走法。所以搜尋時也把「碰到自己」的次數扣一點分。
function touches(D, segs) {
  let t = 0;
  segs.forEach(s => { const pos = new Map(); s.forEach((x, i) => pos.set(x, i)); s.forEach((x, i) => nbr(D, x).forEach(y => { if (pos.has(y) && Math.abs(pos.get(y) - i) > 1) t++; })); });
  return t / 2;
}
function catP(segs) { const P = [], starts = []; segs.forEach(s => { starts.push(P.length); s.forEach(x => P.push(x)); }); return { P, starts }; }
// 評分
function evaluate(D, segs, cfg, prof) {
  const n = D, N = D.w * D.h, plugs = segs.map(s => [s[0], s[s.length - 1]]), tc = touches(D, segs);
  // 解不唯一的狀態也要分好壞，搜尋才有方向可以走：數到 24 個解為止，分數 −6 − 1.5 × ln(解數) − 2 ×（跟答案不一樣的格子比例）− 0.15 × 碰到自己的次數；
  // 同時記下「另一種解跟答案不一樣的格子」X，下一步專門在那裡動手（把另一種解堵死）
  const u = T.flowSolve(n, plugs, { limit: 24, budget: 150000, keep: 3 });
  const maxSol = cfg.maxSol || 1;
  if (u.aborted || u.count > maxSol) {
    // 「不一樣」：顏色不同，或顏色相同但電線從別的方向進出這一格（同一條線在自己的區域裡換了一種繞法——線貼著自己的地方常這樣）
    const own = new Int8Array(N), link = new Array(N); segs.forEach((s, i) => s.forEach((x, j) => { own[x] = i; link[x] = [s[j - 1], s[j + 1]].filter(v => v != null).sort((a, b) => a - b).join(); }));
    const X = new Set(); u.sols.forEach(sol => sol.forEach((s, i) => s.forEach((x, j) => { if (own[x] !== i || link[x] !== [s[j - 1], s[j + 1]].filter(v => v != null).sort((a, b) => a - b).join()) X.add(x); })));
    const cnt = u.aborted ? 60 : u.count;
    return { uniq: false, score: -6 - 1.5 * Math.log(cnt) - 2 * X.size / N - 0.15 * tc, k: segs.length, X: [...X] };
  }
  const { P, starts } = catP(segs), h = T.human(n, plugs, segs), mt = T.metrics(n, P, starts);
  const m = { raw: h.raw, dec: h.dec, d3: h.d3, bits: h.bits, guess: h.guess, deep: h.deep, trap: h.trap, cf: Math.round(mt.crossFrac * 100) / 100, dt: Math.round(mt.detour * 100) / 100, md: mt.minDist, ez: Math.round(mt.easy * 100) / 100 };
  const v = viol(prof, m, N), v0 = viol(0, m, N), ds = -Math.abs(Math.log(1 + h.hx) - Math.log(1 + cfg.eT));
  // 允許多解的那一級：解越多扣越多（解 2 種扣 2、3 種扣 4）
  return { uniq: true, sols: u.count, hx: h.hx, m, v, v0, ds, score: ds - W_STRUCT * v - 2 * (u.count - 1), k: segs.length };
}
function randomCuts(N, k, rand) { const lens = []; for (let i = 0; i < k; i++) lens.push(MIN_SEG); for (let e = N - k * MIN_SEG; e > 0; e--) lens[Math.floor(rand() * k)]++; const s = []; let p = 0; lens.forEach(l => { s.push(p); p += l; }); return s; }
// ── 改一點點（每一種都保證「電線全部合起來剛好蓋滿棋盤、每條至少 MIN_SEG 格」）──
// 線尾交給隔壁：A 的一頭 x 跟 B 的一頭相鄰 → 把 x 從 A 拿掉、接到 B 那一頭
function moveTransfer(D, S, rand, at) {
  const i = at != null ? at : Math.floor(rand() * S.length), A = S[i]; if (A.length <= MIN_SEG) return false;
  const side = rand() < 0.5 ? 0 : 1, x = side ? A[A.length - 1] : A[0], cand = [];
  nbr(D, x).forEach(y => S.forEach((B, j) => { if (j !== i && (B[0] === y || B[B.length - 1] === y)) cand.push([j, B[0] === y ? 0 : 1]); }));
  if (!cand.length) return false;
  const [j, bs] = cand[Math.floor(rand() * cand.length)];
  if (side) A.pop(); else A.shift();
  if (bs) S[j].push(x); else S[j].unshift(x);
  return true;
}
// 線自己翻折（backbite）：線頭旁邊是同一條線上的第 j 格 → 前 j 格倒過來，線頭換到別的地方
function moveBite(D, S, rand, at) {
  const i = at != null ? at : Math.floor(rand() * S.length); let A = S[i]; const back = rand() < 0.5;
  if (back) A = A.slice().reverse();
  const pos = new Map(); A.forEach((x, k) => pos.set(x, k));
  const js = nbr(D, A[0]).map(y => pos.get(y)).filter(j => j != null && j >= 2);
  if (!js.length) return false;
  const j = js[Math.floor(rand() * js.length)], B = A.slice(0, j).reverse().concat(A.slice(j));
  S[i] = back ? B.reverse() : B;
  return true;
}
// 拆成兩條（顏色多一種）
function moveSplit(S, rand, cfg, at, p) {
  if (S.length >= cfg.kr[1]) return false;
  const i = at != null ? at : Math.floor(rand() * S.length), A = S[i];
  if (A.length < 2 * MIN_SEG) return false;
  if (p == null || p < MIN_SEG || A.length - p < MIN_SEG) p = MIN_SEG + Math.floor(rand() * (A.length - 2 * MIN_SEG + 1));
  S.splice(i, 1, A.slice(0, p), A.slice(p));
  return true;
}
// 兩條頭尾相鄰的線接成一條（顏色少一種）
function moveMerge(D, S, rand, cfg) {
  if (S.length <= cfg.kr[0]) return false;
  const i = Math.floor(rand() * S.length), A = S[i], cand = [];
  [0, 1].forEach(sa => { const x = sa ? A[A.length - 1] : A[0]; nbr(D, x).forEach(y => S.forEach((B, j) => { if (j !== i && (B[0] === y || B[B.length - 1] === y)) cand.push([sa, j, B[0] === y ? 0 : 1]); })); });
  if (!cand.length) return false;
  const [sa, j, sb] = cand[Math.floor(rand() * cand.length)];
  const a = sa ? A : A.slice().reverse(), b = sb ? S[j].slice().reverse() : S[j];   // a 的尾巴接 b 的頭
  const merged = a.concat(b), lo = Math.min(i, j), hi = Math.max(i, j);
  S.splice(hi, 1); S.splice(lo, 1, merged);
  return true;
}
function anneal(cfg, rand, iters, prof) {
  const n = { w: cfg.w, h: cfg.h }, N = n.w * n.h;
  const P0 = T.randomHam(n, rand), k0 = cfg.kr[0] + Math.floor(rand() * (cfg.kr[1] - cfg.kr[0] + 1)), st0 = randomCuts(N, k0, rand);
  let S = st0.map((s, i) => P0.slice(s, i + 1 < k0 ? st0[i + 1] : N));
  let r = evaluate(n, S, cfg, prof), cur = r.score, best = r.uniq ? { S: S.map(s => s.slice()), r } : null;
  // 還沒做到唯一解時，最多再多走 EXTRA 步（大棋盤要比較久才堵得完別的解）
  for (let it = 0; it < iters || (!best && it < iters + EXTRA(cfg)); it++) {
    if (process.env.WL_DEBUG && it % 50 === 0) console.log("  第", it, "步：", r.uniq ? "唯一解" : "分數 " + cur.toFixed(2) + "、不一樣的格子 " + (r.X || []).length + "、顏色 " + S.length);
    const S2 = S.map(s => s.slice()), mv = rand(); let okMove = false;
    if (!r.uniq && r.X && r.X.length && rand() < 0.6) {      // 還有另一種解：在「兩種解不一樣」的地方動手
      const x = r.X[Math.floor(rand() * r.X.length)]; let i = 0, p = 0;
      S2.forEach((s, j) => { const q = s.indexOf(x); if (q >= 0) { i = j; p = q; } });
      const pick = rand();
      okMove = pick < 0.4 ? moveSplit(S2, rand, cfg, i, p) : pick < 0.7 ? moveTransfer(n, S2, rand, i) : moveBite(n, S2, rand, i);
    } else if (mv < 0.4) okMove = moveTransfer(n, S2, rand);
    else if (mv < 0.8) okMove = moveBite(n, S2, rand);
    else if (mv < 0.9) okMove = moveSplit(S2, rand, cfg);
    else okMove = moveMerge(n, S2, rand, cfg);
    if (!okMove) continue;
    const r2 = evaluate(n, S2, cfg, prof);
    const Tm = 0.6 * (1 - it / iters) + 0.03;
    // 還沒做到唯一解時用「貪心」：只接受沒有變差的（大棋盤要快一點走到唯一解）；做到唯一解之後才用退火慢慢調難度
    if (r2.score >= cur || (r.uniq && rand() < Math.exp((r2.score - cur) / Tm)) || (!r.uniq && r2.score >= cur - 0.05)) {
      S = S2; cur = r2.score; r = r2;
      if (r.uniq && (!best || cur > best.r.score)) best = { S: S.map(s => s.slice()), r };
    }
  }
  return best;
}
// 題目存成 { w, h, p: 每條電線一個字串「插頭格子:每一步的方向 U／R／D／L」 }
function encodeSeg(D, s) { let o = ''; for (let i = 1; i < s.length; i++) { const d = s[i] - s[i - 1]; o += d === -D.w ? 'U' : d === D.w ? 'D' : d === 1 ? 'R' : 'L'; } return s[0] + ':' + o; }
function canon(n, segs) {   // 8 種翻轉旋轉裡「插頭配置」字串最小的那個，拿來去重
  const pairs = segs.map(s => [s[0], s[s.length - 1]]); let best = null;
  for (let t = 0; t < 8; t++) { const f = x => T.transformCell(n, x, t), key = pairs.map(p => [f(p[0]), f(p[1])].sort((a, b) => a - b).join('-')).sort().join(','); if (best === null || key < best) best = key; }
  return best;
}
function cmdRun(tier, minutes, dir, prof, keep) {
  const cfg = TIERS[tier]; if (!cfg) throw new Error('沒有這一級'); const D = { w: cfg.w, h: cfg.h };
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'wl_' + tier + '_p' + prof + '.json'), rand = mulberry((Date.now() ^ (tier * 7919) ^ (prof * 104729) ^ (process.pid * 31)) & 0x7fffffff);
  let pool = []; try { pool = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { }
  const seen = new Set(pool.map(e => e.key));
  const iters = 160 + tier * 30, t0 = Date.now(); let runs = 0, kept = 0;
  while (Date.now() - t0 < minutes * 60000) {
    const b = anneal(cfg, rand, iters, prof); runs++;
    if (!b || b.r.v0 > 0) continue;
    const key = canon(D, b.S); if (seen.has(key)) continue; seen.add(key);
    pool.push({ w: cfg.w, h: cfg.h, p: b.S.map(s => encodeSeg(D, s)), k: b.r.k, e: b.r.hx, m: b.r.m, ds: Math.round(b.r.ds * 100) / 100, sc: Math.round(b.r.score * 100) / 100, key }); kept++;
    const byK = {}; pool.forEach(e => { (byK[e.k] = byK[e.k] || []).push(e); });
    pool = [].concat(...Object.values(byK).map(l => l.sort((x, y) => y.sc - x.sc).slice(0, keep * 2)));
    fs.writeFileSync(file, JSON.stringify(pool));
    if (kept % 3 === 1) console.log(`[接電線 第 ${tier} 級 強度 ${prof}] 第 ${runs} 次：${cfg.w}×${cfg.h}、${b.r.k} 色、試錯量 ${b.r.hx}、路口 ${b.r.m.raw}、要猜 ${b.r.m.guess}、深陷阱 ${b.r.m.deep}、穿越 ${b.r.m.cf}、違反 ${b.r.v.toFixed(2)}；題庫 ${pool.length} 題`);
  }
  console.log(`[接電線 第 ${tier} 級 強度 ${prof}] 結束：搜尋 ${runs} 次，新收 ${kept} 題，題庫 ${pool.length} 題`);
}
function loadTier(dir, t) { let all = []; try { fs.readdirSync(dir).filter(f => new RegExp('^wl_' + t + '(_[a-z0-9]+)?\\.json$').test(f)).forEach(f => { all = all.concat(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); }); } catch (e) { } return all; }
function cmdBuild(dir, keep) {
  const out = [], stat = [];
  for (let t = 0; t < TIERS.length; t++) {
    const seen = new Set(), list = []; let drop = 0;
    for (const e of loadTier(dir, t)) {
      if (seen.has(e.key)) continue; seen.add(e.key);
      if (e.w !== TIERS[t].w || e.h !== TIERS[t].h) { drop++; continue; }
      const q = T.decodeBank(e), r = evaluate({ w: q.w, h: q.h }, q.segs, TIERS[t], 0);   // 重新驗證：唯一解、結構數字
      if (!r.uniq || r.v0 > 0) { drop++; continue; }
      list.push({ w: e.w, h: e.h, p: e.p, k: e.p.length, c: r.sols, e: r.hx, m: r.m, ds: r.ds - 2 * (r.sols - 1) });
    }
    list.sort((a, b) => b.ds - a.ds);
    const ks = [...new Set(list.map(x => x.k))], pick = [];
    ks.forEach(kk => list.filter(x => x.k === kk).slice(0, Math.max(4, Math.floor(keep / ks.length / 2))).forEach(x => pick.push(x)));
    list.forEach(x => { if (pick.length < keep && pick.indexOf(x) < 0) pick.push(x); });
    pick.sort((a, b) => (a.k - b.k) || (a.e - b.e));
    out.push(pick.map(x => ({ w: x.w, h: x.h, p: x.p, k: x.k, c: x.c, e: x.e, m: x.m })));
    stat.push(`第${t}級:${pick.length}(丟${drop})`);
  }
  let text = '/* ═══════════════════════════════════════════════════════════════════\r\n' +
    '   wirelink_bank.js — 「接電線」的題庫（V1.57.3.2）。這個檔案是 test/reaction/gen_wirelink_bank.cjs 離線搜尋產生的，不要手改。\r\n' +
    '   11 個難度級（第 0 級 5×5 最簡單、第 10 級 9×11 最難），第 0～9 級每一題都剛好只有 1 種解、第 10 級（9×11）最多 3 種解（c＝解數）。每一題 { w 寬, h 高（直的，w ≤ h）, p 每條電線一個字串（插頭格子:往另一個插頭每一步的方向 U／R／D／L）,\r\n' +
    '   k 顏色數, c 解數, e 人類試錯量, m: { raw 路口, dec／d3 一眼看不出錯的路口（≥2／≥3 個方向）, bits 組合數取 log2, guess 要猜的路口, deep 深陷阱, trap 最深陷阱, cf 插頭連線互相穿越的比例, dt 繞路程度, md 插頭最近距離, ez 最短路線就是答案的比例 } }。\r\n' +
    '   ═══════════════════════════════════════════════════════════════════ */\r\n' +
    'window.FM_WIRELINK_BANK = [\r\n';
  out.forEach((list, t) => { text += '    [' + (list.length ? '\r\n' + list.map(e => '        ' + JSON.stringify(e)).join(',\r\n') + '\r\n    ' : '') + ']' + (t < out.length - 1 ? ',' : '') + '\r\n'; });
  text += '];\r\n';
  fs.writeFileSync(path.join(ROOT, 'js/wirelink_bank.js'), text, 'utf8');
  console.log('已寫入 js/wirelink_bank.js：' + stat.join(' '));
}
function cmdStats() {
  global.FM_WIRELINK_BANK = undefined; delete require.cache[require.resolve('../../js/wirelink_bank.js')]; require('../../js/wirelink_bank.js');
  global.FM_WIRELINK_BANK.forEach((l, t) => {
    const rg = f => { const v = l.map(f); return Math.min(...v) + '～' + Math.max(...v); };
    console.log(`第 ${t} 級 ${l.length} 題：${l[0] ? l[0].w + '×' + l[0].h : ''}、顏色 ${[...new Set(l.map(e => e.k))].join('/')}、試錯量 ${rg(e => e.e)}、` + ['raw', 'guess', 'd3', 'deep', 'trap', 'cf', 'dt', 'md', 'ez'].map(key => key + ' ' + rg(e => e.m[key])).join('、'));
  });
}
module.exports = { TIERS, PROF, evaluate, viol };
const [cmd, a1, a2, a3, a4, a5] = require.main === module ? process.argv.slice(2) : [];
if (require.main !== module) { /* 被測試 require 時不執行指令 */ }
else if (cmd === 'run') cmdRun(Number(a1), Number(a2), a3, a4 === undefined ? 1 : Number(a4), Number(a5 || 14));
else if (cmd === 'build') cmdBuild(a1, Number(a2 || 30));
else if (cmd === 'stats') cmdStats();
else console.log('用法：run <級數> <分鐘> <工作資料夾> [強度 0～2] [每個顏色數留幾題] ／ build <工作資料夾> [每級留幾題] ／ stats');
