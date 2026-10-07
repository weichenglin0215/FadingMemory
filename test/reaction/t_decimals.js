// 檢查「畫面上看得到的、帶小數的數字」是不是都用 4 位小數（使用者的規定：秒數、分數、長度、比例、角度…
// 原本就有小數點的，一律改成小數點後 4 位；規則與例外見 note/世界排行榜說明.md 第 4 節）。
//
// 做法：掃描 js/reaction_*.js，找出 .toFixed(1)、.toFixed(2)、.toFixed(3)——
//   · 如果那一行是「寫進畫面的文字」（text:／textContent／lines:／num:／label:／fmtXxx 函式…），就要失敗；
//   · SVG 座標、CSS 數值、顏色、主控台訊息、進度條寬度這些不是給玩家看的數字，不檢查；
//   · 少數刻意保留的例外寫在下面的 EXCEPTIONS（每一條都要寫理由）。
// 新增遊戲時如果這支測試失敗：把畫面上的 toFixed(2) 改成 toFixed(4)；成績類的數字請用 Leaderboard.fake4() 產生
// （做法看 js/reaction_schulte.js）。真的有正當理由才加到 EXCEPTIONS。
const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, '../../js');
const files = fs.readdirSync(dir).filter(f => /^reaction_.*\.js$/.test(f) && !/^reaction_(core|kit)\.js$/.test(f)).sort();

// 不是給玩家看的用途（同一行出現這些字就略過）
const NOT_FOR_PLAYER = [
  /setAttribute/, /\.style\./, /console\./, /\bstroke/, /translate\(|rotate\(|scale\(/, /points\s*:/, /kit\.svg\(/,
  /\bd\s*[:=]\s*['"]?[ML]/, /'[ML] '|'[ML]'\s*:/, /hsl\(|rgb\(|inset\(/, /\.width\s*=/, /\.height\s*=/, /opacity/i
];
// 看起來像「寫進畫面的文字」
const SINK = [/\btext\s*:/, /textContent/, /\blines\s*:/, /\bnum\s*:/, /\blabel\s*:/, /\bnote\s*:/, /lines\.push\(/, /kids\.push\(/, /function fmt\w*\(/, /return .*' ?(秒|公分|度|格|屏|%|％)/, /\+ ?' ?(秒|公分|度|格|屏|%|％)/];

// 刻意保留的例外：[檔名, 這一行要包含的字, 理由]
const EXCEPTIONS = [
  ['reaction_bread.js', "' g'", '秤上的克數是遊戲定義的 0.1 公克刻度（重量不是成績類數字，而且差距％是用這些克數算出來的）'],
  ['reaction_bread.js', 'wc.wL.toFixed(1)', '同上：秤上的克數'],
  ['reaction_pour.js', '放大 ×', '放大倍率，不是成績'],
  ['reaction_pour.js', 'Math.abs(v).toFixed(step', '刻度尺的刻度標籤（隨放大倍率改變小數位數），不是成績'],
  ['reaction_tissue.js', "'%'", '進度條高度（百分比寫進 CSS），不是文字'],
  ['reaction_halfchar.js', 'var lo = ', 'CSS clip-path 的百分比，不是畫面文字']
];

let bad = 0, total = 0, scanned = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };

files.forEach(f => {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!/\.toFixed\([123]\)/.test(line)) return;
    // 註解行不算
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
    scanned++;
    if (NOT_FOR_PLAYER.some(re => re.test(line))) return;
    // 主控台訊息常常跨好幾行：往上看 3 行，如果有一個還沒結束（不是以 ; 結尾）的 console 呼叫，這行就是它的延續
    let inConsole = false;
    for (let k = 1; k <= 3 && i - k >= 0; k++) {
      const prev = lines[i - k];
      if (/console\./.test(prev) && !/;\s*(\}|\/\*.*)?\s*$/.test(prev)) { inConsole = true; break; }
    }
    if (inConsole) return;
    if (!SINK.some(re => re.test(line))) return;
    if (EXCEPTIONS.some(e => e[0] === f && line.indexOf(e[1]) >= 0)) return;
    ok(false, f + ':' + (i + 1) + ' 畫面上的小數不是 4 位：' + line.trim().slice(0, 140));
  });
});
console.log('掃描 ' + files.length + ' 個遊戲檔、' + scanned + ' 行含 toFixed(1～3)，畫面文字全部是 4 位小數（例外 ' + EXCEPTIONS.length + ' 條）');

// kit.sec 也是 4 位小數
const { game } = require('./load.js');
ok(Reaction.kit.sec(1234.5) === '1.2345', 'kit.sec 應該回傳 4 位小數：' + Reaction.kit.sec(1234.5));
ok(Reaction.kit.sec(0) === '0.0000', 'kit.sec(0)');

console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS ' + total);
process.exit(bad ? 1 : 0);
