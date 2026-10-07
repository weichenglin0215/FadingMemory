// 種子掃描：把「用亂數出題」的測試換不同的種子（環境變數 SEED）連跑很多次，確認它不是只在某一組亂數下才會過。
//
// 為什麼需要：出題函式（plan、makeLevel、makeTray、makeQuestion…）隨機出題，測試再拿題目去做統計（例如「150 題裡有幾題有陷阱」）。
// 測試改用固定種子的亂數（load.js 的 rng）之後，每次跑的結果都一樣，不會再「偶爾失敗」；
// 但「固定種子剛好過」不代表「門檻訂得合理」——所以改過門檻、或改了出題程式之後，用這支工具換 100～300 個種子各跑一次，
// 失敗次數應該是 0。如果有失敗，會印出失敗的種子與訊息，用  $env:SEED = 那個種子; node test/reaction/t_xxx.js  就能重現。
//
// 用法（在專案根目錄）：
//   node test/reaction/sweep_seeds.js t_coins.js            用種子 1～100 各跑一次
//   node test/reaction/sweep_seeds.js t_curves.js 200 8     200 個種子、同時跑 8 個（預設是 CPU 核心數的一半）
//   node test/reaction/sweep_seeds.js t_price.js 300 8 1000 從種子 1000 開始
// 只對有用 rng／seedOf 的測試有意義：t_coins、t_curves、t_pillbox、t_price（沒用到的測試每次結果都一樣）。
// 這支檔案的名字不是 t_ 開頭，所以 run_all.js 不會把它當成測試去跑。
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const file = process.argv[2];
if (!file) { console.log('用法：node test/reaction/sweep_seeds.js <測試檔名，例如 t_coins.js> [種子數=100] [同時跑幾個] [起始種子=1]'); process.exit(2); }
const COUNT = Number(process.argv[3] || 100);
const PARALLEL = Number(process.argv[4] || Math.max(1, Math.floor(os.cpus().length / 2)));
const START = Number(process.argv[5] || 1);
const target = path.join(__dirname, file);

let nextSeed = START, running = 0, finished = 0;
const failures = [];

// 啟動一個測試行程（帶著這個種子），結束時統計結果，再補上下一個，直到全部跑完
function launch() {
  while (running < PARALLEL && nextSeed < START + COUNT) {
    const seed = nextSeed++;
    running++;
    const child = spawn(process.execPath, [target], { env: Object.assign({}, process.env, { SEED: String(seed) }) });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('close', (code) => {
      running--; finished++;
      const lastLine = output.trim().split('\n').pop() || '';
      // run_all.js 也是用「最後一行有 ALL PASS 而且結束碼 0」判斷一支測試有沒有過
      if (!(/ALL PASS/.test(lastLine) && code === 0)) {
        failures.push({ seed, message: output.split('\n').filter((l) => /FAIL/.test(l)).slice(0, 3).join(' | ') || lastLine });
      }
      if (finished === COUNT) report();
      else launch();
    });
  }
}

function report() {
  console.log(file + '：種子 ' + START + '～' + (START + COUNT - 1) + '，共 ' + COUNT + ' 個，失敗 ' + failures.length + ' 個');
  failures.sort((a, b) => a.seed - b.seed).forEach((f) => console.log('  種子 ' + f.seed + ' → ' + f.message));
  process.exit(failures.length ? 1 : 0);
}

launch();
