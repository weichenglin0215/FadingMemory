// 一半的人：圓形數量、重疊限制、剛好一半的範圍夠寬、越後面越不平均
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_halfcrowd.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 30) console.log('FAIL', m); } };
const W = 472, H = 450, SEED = seedOf(20261010), rnd = rng(SEED);
ok(Math.abs(T.skewAt(1)) < 1e-9 && Math.abs(T.skewAt(T.RAMP_LEVELS) - T.SKEW_MAX) < 1e-9 && T.skewAt(40) === T.skewAt(T.RAMP_LEVELS), '不平均程度 0 → ' + T.SKEW_MAX);
// V1.27：圓形個數隨關卡線性變多，每關只在基準上下抖動，不會某一關突然冒出一大堆（以前是在 N_RANGE 裡完全隨機）
{ let prevMax = 0;
  for (let lv = 1; lv <= 40; lv++) {
    const base = T.N_RANGE[0] + (T.N_RANGE[1] - T.N_RANGE[0]) * Math.min(1, (lv - 1) / (T.RAMP_LEVELS - 1));
    let lo = 1e9, hi = -1;
    for (let i = 0; i < 400; i++) { const n = T.nAt(lv, rnd); lo = Math.min(lo, n); hi = Math.max(hi, n); ok(n % 2 === 0 && n >= T.N_RANGE[0] && n <= T.N_RANGE[1], '個數在 N_RANGE 內且是偶數 lv' + lv + ' n=' + n); ok(Math.abs(n - base) <= T.N_JITTER + 2 + 1e-9, '個數貼著線性基準 lv' + lv + ' n=' + n + ' base=' + base.toFixed(1)); }
    ok(lo >= prevMax - 2 * T.N_JITTER - 2, '第 ' + lv + ' 關最少 ' + lo + ' 個，不會比前面的關卡少一大截'); prevMax = hi;
  }
  ok(T.nAt(1, rnd) <= T.N_RANGE[0] + T.N_JITTER + 2 && T.nAt(T.RAMP_LEVELS, rnd) >= T.N_RANGE[1] - T.N_JITTER - 2, '第 1 關接近最少、到頂的那一關接近最多');
  // 連續兩關相差有限（不會突然跳）
  let maxJump = 0; for (let i = 0; i < 2000; i++) { const lv = 1 + (i % 39); maxJump = Math.max(maxJump, Math.abs(T.nAt(lv + 1, rnd) - T.nAt(lv, rnd))); }
  ok(maxJump <= 2 * T.N_JITTER + 2 + Math.ceil((T.N_RANGE[1] - T.N_RANGE[0]) / (T.RAMP_LEVELS - 1)) + 2, '相鄰兩關個數最多差 ' + maxJump); }
// 數數量動畫：左右成對數（綠＋藍），多出來的那一邊變紅（例如左 3 右 5：右邊 3 組成對、多 2 個紅）
{ const p = T.countPlan(3, 5); ok(p.pairs === 3 && p.extra === 2 && p.side === 1, '左 3 右 5：3 對＋右邊多 2：' + JSON.stringify(p));
  const q2 = T.countPlan(7, 4); ok(q2.pairs === 4 && q2.extra === 3 && q2.side === -1, '左 7 右 4：左邊多 3');
  const q3 = T.countPlan(6, 6); ok(q3.extra === 0 && q3.side === 0 && q3.pairs === 6, '一樣多：沒有紅色');
  ok(JSON.stringify(T.planAt(p, 0)) === '{"pairs":0,"extra":0}' && JSON.stringify(T.planAt(p, 1)) === '{"pairs":3,"extra":2}', '動畫起點與終點');
  let prevS = { pairs: 0, extra: 0 }; for (let k = 0; k <= 100; k++) { const s2 = T.planAt(p, k / 100); ok(s2.pairs >= prevS.pairs && s2.extra >= prevS.extra && (s2.extra === 0 || s2.pairs === 3), '先數成對、數完才數多出來的，只增不減'); prevS = s2; } }
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_halfcrowd.js'), 'utf8'), css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/games/reaction_halfcrowd.css'), 'utf8').replace(/[ \t]*\/\*[\s\S]*?\*\//g, '');
  ok(src.indexOf("'halfcrowd-circle--g'") > 0 && src.indexOf("'halfcrowd-circle--b'") > 0 && src.indexOf("'halfcrowd-circle--r'") > 0 && /\.halfcrowd-circle--b \{[^}]*c-blue/.test(css) && /\.halfcrowd-circle--r \{[^}]*c-bad-light/.test(css), '左綠、右藍、多出來的紅'); }
ok(Math.abs(T.gapAt(1) - T.GAP[0]) < 1e-9 && Math.abs(T.gapAt(T.RAMP_LEVELS) - T.GAP[1]) < 1e-9, '容許寬度 ' + T.GAP + '（玩家自己調過）');
ok(Math.abs(T.minDist(15, 15) - (1 - T.OVERLAP) * 30) < 1e-9, '兩個半徑 15 的圓，圓心距離至少 ' + ((1 - T.OVERLAP) * 30) + '（最多重疊 ' + T.OVERLAP * 100 + '%，玩家自己調過）');
ok(T.countLeft([{ x: 1 }, { x: 5 }, { x: 5 }, { x: 9 }], 5) === 1, '圓心剛好在線上算右邊');
const t0 = Date.now(); let slow = 0;
const sk = {};
for (let lv = 1; lv <= 20; lv++) {
  let medOff = 0, minGapSeen = 1e9; const NQ = lv % 3 === 1 ? 12 : 6;
  for (let k = 0; k < NQ; k++) {
    const t1 = Date.now(), q = T.makeLevel(lv, W, H, rnd); if (Date.now() - t1 > 400) slow++;
    ok(q.N % 2 === 0 && q.N >= T.N_RANGE[0] && q.N <= T.N_RANGE[1] && q.circles.length === q.N, '個數是 N_RANGE 內的偶數 lv' + lv + ' N=' + q.N + ' len=' + q.circles.length);
    // 重疊限制與邊界
    let worst = 1e9;
    for (let i = 0; i < q.N; i++) {
      const a = q.circles[i];
      ok(a.r >= T.R_RANGE[0] && a.r <= T.R_RANGE[1] && a.x >= T.EDGE + a.r - 1e-6 && a.x <= W - T.EDGE - a.r + 1e-6 && a.y >= T.EDGE + a.r - 1e-6 && a.y <= H - T.EDGE - a.r + 1e-6, '圓在範圍內');
      for (let j = i + 1; j < q.N; j++) { const b = q.circles[j], d = Math.hypot(a.x - b.x, a.y - b.y); worst = Math.min(worst, d - T.minDist(a.r, b.r)); }
    }
    ok(worst >= -1e-6, '重疊不超過 60%（最擠的一對還有 ' + worst.toFixed(3) + ' px 餘裕）');
    // 剛好一半的範圍
    const xs = q.circles.map(c => c.x).sort((a, b) => a - b);
    ok(Math.abs(q.lo - xs[q.N / 2 - 1]) < 1e-9 && Math.abs(q.hi - xs[q.N / 2]) < 1e-9, 'lo／hi 是第 N/2、N/2+1 個圓心');
    ok(q.gap > 0 && (q.gap >= T.gapAt(lv) - 1e-6 || q.need === T.gapAt(lv)), '容許寬度 lv' + lv + ' gap=' + q.gap.toFixed(2) + ' need=' + T.gapAt(lv).toFixed(2));   // 玩家把 GAP 調得很寬時，擠不開就盡量寬
    const mid = (q.lo + q.hi) / 2; ok(T.countLeft(q.circles, mid) === q.N / 2, '放在範圍中間，左右剛好各一半');
    ok(T.countLeft(q.circles, (xs[q.N / 2 - 2] + q.lo) / 2) === q.N / 2 - 1 && T.countLeft(q.circles, (q.hi + xs[q.N / 2 + 1]) / 2) === q.N / 2 + 1, '範圍外左右各差一個');
    medOff += Math.abs(mid - W / 2); minGapSeen = Math.min(minGapSeen, q.gap);
  }
  sk[lv] = medOff / NQ;
}
console.log('剛好一半的位置離畫面中央的平均距離（px）：lv1', sk[1].toFixed(1), 'lv5', sk[5].toFixed(1), 'lv10', sk[10].toFixed(1), 'lv14', sk[14].toFixed(1), 'lv20', sk[20].toFixed(1), '；出題耗時 ' + (Date.now() - t0) + ' ms，超過 0.4 秒的 ' + slow + ' 次');
ok(sk[20] > 25, '越後面分布越不平均（中位數離中央越遠）：' + sk[1].toFixed(0) + ' → ' + sk[20].toFixed(0));
ok(slow === 0, '出題夠快');
// ═══ V1.40.0 玩家回饋：圓點圖案改成人像 emoji ═══
{ const fs = require('fs'), path = require('path'), kit = Reaction.kit;
  const USER_LIST = '👩👨🧑👧👦🧒👶👵👴🧓👩‍🦰👨‍🦰👩‍🦱👨‍🦱👩‍🦳👨‍🦳👱‍♀️👱‍♂️👸🤴👳‍♀️👳‍♂️👲🧔🤶🎅';
  ok(kit.PERSON_EMOJI.join('') === USER_LIST && kit.PERSON_EMOJI.length === 26 && new Set(kit.PERSON_EMOJI).size === 26, '人像 emoji 清單 ＝ 玩家指定的 26 種（kit.PERSON_EMOJI），複合 emoji（👩‍🦰、👱‍♀️、👳‍♂️…）各是一個字串');
  ok(kit.PERSON_EMOJI.filter(e => Array.from(e).length > 1).length === 10, '10 個是複合 emoji（髮色、性別變體；字串不能被拆開）');
  const src = fs.readFileSync(path.resolve(__dirname, '../../js/reaction_halfcrowd.js'), 'utf8'), css = fs.readFileSync(path.resolve(__dirname, '../../css/games/reaction_halfcrowd.css'), 'utf8').replace(/[ \t]*\/\*[\s\S]*?\*\//g, '').split(/\s+/).join(' ');
  ok(/kit\.svg\('text', \{[^}]*'class': 'halfcrowd-face'[^}]*'font-size': \(c\.r \* 2 \* FACE_SCALE\)\.toFixed\(1\)[^}]*'text-anchor': 'middle'[^}]*'dominant-baseline': 'central'/.test(src) && /face\.textContent = kit\.pick\(kit\.PERSON_EMOJI, api\.rand\)/.test(src), '每個圓的位置畫一個人像 emoji（置中，字級＝直徑 × FACE_SCALE，每個人隨機一種）');
  ok(T.FACE_SCALE > 0.8 && T.FACE_SCALE <= 1.3 && T.SHOW_CENTER === true, 'FACE_SCALE ' + T.FACE_SCALE + '；預設畫出中心點（判斷左右看中心點）');
  // 碰撞範圍沒變：仍然是半徑 r 的圓（makeLevel 與重疊限制不動），數量與「剛好一半」的算法不受 emoji 影響
  ok(src.indexOf("if (SHOW_CENTER) q.circles.forEach(function (c) { kit.svg('circle', { cx: c.x.toFixed(2), cy: c.y.toFixed(2), r: 2.4, 'class': 'halfcrowd-dot' }, svg); });") > src.indexOf("var els = q.circles.map"), '中心點全部畫在所有人像的上面（不會被別人的 emoji 蓋住）');
  ok(/\.halfcrowd-circle \{ fill: none; stroke: none; \}/.test(css) && /\.halfcrowd-circle--g \{[^}]*fill: var\(--c-green-light\)/.test(css) && /\.halfcrowd-circle--b \{[^}]*fill: var\(--c-blue-light\)/.test(css) && /\.halfcrowd-circle--r \{[^}]*fill: var\(--c-bad-light\)/.test(css), '底圈平常看不見；數過之後亮起綠／藍／紅色圈，畫在 emoji 底下');
  ok(/\.halfcrowd-dot \{[^}]*stroke: var\(--c-on-accent\)/.test(css) && /\.halfcrowd-face \{[^}]*pointer-events: none/.test(css), '中心點有白邊；emoji 不吃點擊');
  ok(/人/.test(G.rule) && !/圓/.test(G.rule) && /中心/.test(G.rule), '玩法說明改用「人」「中心」，沒有「圓」');
  ok(!/個圓/.test(src.replace(/[ \t]*\/\*[\s\S]*?\*\//g, '')) && !/圓心不是/.test(src), '畫面上的訊息不再說「圓」（結算：這一關有 N 個人）'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
