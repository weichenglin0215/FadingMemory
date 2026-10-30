// V1.38.0 玩家意見裡「改節奏／改數值」的幾款（各款自己的邏輯測試在各自的 t_<id>.js）：
//   · 堵住五子：失敗時白棋依序下棋的揭曉動畫放慢成 50% 速度（每一手 650 → 1300 毫秒、第一手之前 500 → 1000 毫秒、棋子落下 0.3 → 0.6 秒）
//   · 鋪地毯：失敗時綠線畫得更慢（每格 0.12 秒、至少 2.4 秒），畫完在最後一個畫面停 3 秒，才跳出結算彈窗
//   · 擀水餃皮：麵皮加大（樣品圓半徑 112 → 168）、手指要滑更遠（ROLL_K 0.0035 → 0.0016）
//   （這兩款的 t_gomoku、t_carpet 在 origin/main 原本就有固定種子的失敗，跟這次無關，所以這幾項獨立放在這裡）
const fs = require('fs');
const path = require('path');
const { game } = require('./load.js');
const ROOT = path.resolve(__dirname, '../../') + '/';
const rd = p => fs.readFileSync(ROOT + p, 'utf8');
let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };

// ── 堵住五子 ──
{
  const T = game('reaction_gomoku.js').test, src = rd('js/reaction_gomoku.js'), css = rd('css/reaction6.css').split(/\s+/).join(' ');
  ok(T.REVEAL_STEP_MS === 1300 && T.REVEAL_LEAD_MS === 1000, '每一手的間隔 1300 毫秒（原本 650）、第一手之前 1000 毫秒（原本 500）：放慢成 50% 速度');
  ok(T.REVEAL_HOLD_MS >= 2000, '最後一手之後停格至少 2 秒：' + T.REVEAL_HOLD_MS);
  ok(T.revealMs(0) === T.REVEAL_LEAD_MS + T.REVEAL_HOLD_MS && T.revealMs(3) === T.REVEAL_LEAD_MS + 3 * T.REVEAL_STEP_MS + T.REVEAL_HOLD_MS, 'revealMs ＝ 第一手之前 ＋ 手數 × 間隔 ＋ 停格');
  ok(T.revealMs(5) - T.revealMs(4) === 1300, '每多一手，結算晚 1300 毫秒');
  ok(/api\.after\(REVEAL_LEAD_MS \+ j \* REVEAL_STEP_MS/.test(src) && /api\.fail\(\{ delay: revealMs\(pv\.length\)/.test(src) && !/500 \+ j \* 650|500 \+ pv\.length \* 650/.test(src), '揭曉動畫與結算都用新的節奏');
  ok(/\.gmk-stone--new \{[^}]*animation: gmk-drop 0\.6s/.test(css), '棋子落下的動畫 0.3 → 0.6 秒');
}

// ── 鋪地毯 ──
{
  const T = game('reaction_carpet.js').test, src = rd('js/reaction_carpet.js');
  ok(T.SOL_HOLD_MS === 3000, '綠線畫完之後停格 3 秒：' + T.SOL_HOLD_MS);
  ok(T.solDrawMs(2) === T.SOL_MIN_MS && T.SOL_MIN_MS >= 2400 && T.SOL_MS_PER_CELL === 120, '綠線至少畫 2.4 秒、每格 0.12 秒（原本不管多長都是 1.6 秒）');
  for (const len of [8, 20, 40, 64]) {
    ok(T.solDrawMs(len) === Math.max(T.SOL_MIN_MS, (len - 1) * T.SOL_MS_PER_CELL) && T.solDrawMs(len) > 1600, '路 ' + len + ' 格：綠線畫 ' + T.solDrawMs(len) + ' 毫秒（比原本 1.6 秒慢）');
    ok(T.failDelayMs(len) === T.solDrawMs(len) + 3000, '路 ' + len + ' 格：結算在畫完之後再等 3 秒才跳出（' + T.failDelayMs(len) + ' 毫秒）');
  }
  for (let l = 2; l <= 80; l++) ok(T.solDrawMs(l) >= T.solDrawMs(l - 1), '路越長畫越久 ' + l);
  ok(/solLine\.style\.animationDuration = solDrawMs\(q\.solution\.length\) \+ 'ms'/.test(src) && /api\.fail\(\{ delay: failDelayMs\(q\.solution\.length\)/.test(src) && !/api\.fail\(\{ delay: 2800/.test(src), '綠線的動畫時間與結算延遲都依路的長度算');
  // 真正出的題：解答的長度（空地格數）→ 畫完要停格 3 秒
  const q = T.makeLevel(5, Math.random);
  ok(q.solution.length === q.free && T.failDelayMs(q.solution.length) >= 3000 + 2400, '實際出的一題：' + q.solution.length + ' 格，結算前共 ' + T.failDelayMs(q.solution.length) + ' 毫秒');
}

// ── 擀水餃皮 ──
{
  const T = game('reaction_dough.js').test;
  ok(T.SAMPLE_R >= 160, '麵皮（樣品圓）加大：半徑 ' + T.SAMPLE_R + ' px（原本 112）');
  ok(T.ROLL_K <= 0.002, '手指每滑 1px 只擀開 ' + (T.ROLL_K * 100).toFixed(2) + '%（原本 0.35%）：要滑更遠才擀得大');
  // 擀開的比例 ε ＝ ROLL_K × 手指滑的距離，所以要擀到同樣大，手指要滑的距離跟 ROLL_K 成反比：至少是原本（0.0035）的 2 倍
  ok(0.0035 / T.ROLL_K >= 2, '擀到同樣大，手指要滑的距離是原本的 ' + (0.0035 / T.ROLL_K).toFixed(1) + ' 倍');
  ok(T.SAMPLE_R * 2 + 40 <= 472, '加大的麵皮還放得進遊戲區（472 寬）：直徑 ' + T.SAMPLE_R * 2);
}

console.log((bad ? bad + ' FAIL / ' : '') + total + ' checks');
console.log(bad ? 'SOME FAILED' : 'ALL PASS');
process.exit(bad ? 1 : 0);
